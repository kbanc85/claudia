"""
Recall Service for Claudia Memory System

Handles semantic search and retrieval of memories, entities, and relationships.
Uses vector similarity combined with importance and recency scoring.
"""

import json
import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..config import get_config
from ..database import get_db
from ..embeddings import embed_sync, get_embedding_service
from ..extraction.entity_extractor import get_extractor

logger = logging.getLogger(__name__)


@dataclass
class RecallResult:
    """A single recall result"""

    id: int
    content: str
    type: str
    score: float  # Combined ranking score
    importance: float
    created_at: str
    entities: List[str]  # Related entity names
    metadata: Optional[Dict] = None
    source: Optional[str] = None
    source_id: Optional[str] = None
    source_context: Optional[str] = None
    # Trust North Star fields
    confidence: float = 1.0  # How confident we are in this memory
    verification_status: str = "pending"  # pending, verified, flagged, contradicts
    origin_type: str = "inferred"  # user_stated, extracted, inferred, corrected
    # Channel tracking
    source_channel: Optional[str] = None  # Origin channel: claude_code, telegram, slack


@dataclass
class EntityResult:
    """An entity search result"""

    id: int
    name: str
    type: str
    description: Optional[str]
    importance: float
    memory_count: int
    relationship_count: int
    last_mentioned: Optional[str]


@dataclass
class ReflectionResult:
    """A reflection from /meditate"""

    id: int
    content: str
    reflection_type: str  # observation, pattern, learning, question
    importance: float
    confidence: float
    about_entity: Optional[str]  # Entity name if linked
    first_observed_at: str
    last_confirmed_at: str
    aggregation_count: int  # How many times confirmed
    episode_id: Optional[int]
    score: float = 0.0  # Search relevance score


class RecallService:
    """Search and retrieve memories"""

    _vec0_warned = False

    def __init__(self):
        self.db = get_db()
        self.embedding_service = get_embedding_service()
        self.extractor = get_extractor()
        self.config = get_config()

    def recall(
        self,
        query: str,
        limit: int = None,
        memory_types: Optional[List[str]] = None,
        about_entity: Optional[str] = None,
        min_importance: float = None,
        include_low_importance: bool = False,
        date_after: Optional[datetime] = None,
        date_before: Optional[datetime] = None,
    ) -> List[RecallResult]:
        """
        Search memories using hybrid vector + FTS5 similarity and filters.

        Args:
            query: Search query text
            limit: Maximum results to return
            memory_types: Filter by memory types (fact, preference, etc.)
            about_entity: Filter to memories about a specific entity
            min_importance: Minimum importance threshold
            include_low_importance: Include memories below default threshold
            date_after: Only memories after this date
            date_before: Only memories before this date

        Returns:
            List of RecallResult ordered by relevance
        """
        if limit is None:
            limit = self.config.max_recall_results

        if min_importance is None and not include_low_importance:
            min_importance = self.config.min_importance_threshold

        # Get query embedding
        query_embedding = embed_sync(query)

        # --- Vector search ---
        vector_scores: Dict[int, float] = {}
        vector_rows: Dict[int, Any] = {}

        if query_embedding:
            sql_parts = ["SELECT m.*, GROUP_CONCAT(e.name) as entity_names, (1.0 / (1.0 + me.distance)) as vector_score"]
            params: list = []
            sql_parts.append(
                """
                FROM memory_embeddings me
                JOIN memories m ON m.id = me.memory_id
                LEFT JOIN memory_entities me2 ON m.id = me2.memory_id
                LEFT JOIN entities e ON me2.entity_id = e.id
                WHERE me.embedding MATCH ?
                """
            )
            params.append(json.dumps(query_embedding))

            self._apply_filters(sql_parts, params, memory_types, min_importance, date_after, date_before, about_entity)
            sql_parts.append("GROUP BY m.id ORDER BY vector_score DESC LIMIT ?")
            params.append(limit * 2)

            try:
                rows = self.db.execute("\n".join(sql_parts), tuple(params), fetch=True) or []
                for row in rows:
                    mid = row["id"]
                    vector_scores[mid] = row["vector_score"] if "vector_score" in row.keys() else 0.0
                    vector_rows[mid] = row
            except Exception as e:
                if not RecallService._vec0_warned:
                    logger.warning(f"Vector search failed (will fall back silently from now on): {e}")
                    RecallService._vec0_warned = True

        # --- FTS5 search ---
        fts_scores = self._fts_search(query, limit * 2, memory_types, min_importance)

        # --- Fallback: if neither vector nor FTS returned results, use keyword LIKE ---
        if not vector_scores and not fts_scores:
            rows = self._keyword_search(query, limit, memory_types, min_importance)
            # Process keyword fallback rows the same way
            now = datetime.utcnow()
            results = []
            for row in rows:
                results.append(self._row_to_result(row, 0.5, 0.0, now))
            results.sort(key=lambda r: r.score, reverse=True)
            results = results[:limit]
            self._update_access_counts(results, now)
            return results

        # --- Merge: collect all memory IDs from both sources ---
        all_ids = set(vector_scores.keys()) | set(fts_scores.keys())

        # Fetch full rows for FTS-only results not already in vector_rows
        fts_only_ids = set(fts_scores.keys()) - set(vector_rows.keys())
        if fts_only_ids:
            placeholders = ", ".join(["?" for _ in fts_only_ids])
            fts_rows = self.db.execute(
                f"""
                SELECT m.*, GROUP_CONCAT(e.name) as entity_names
                FROM memories m
                LEFT JOIN memory_entities me2 ON m.id = me2.memory_id
                LEFT JOIN entities e ON me2.entity_id = e.id
                WHERE m.id IN ({placeholders})
                GROUP BY m.id
                """,
                tuple(fts_only_ids),
                fetch=True,
            ) or []
            for row in fts_rows:
                vector_rows[row["id"]] = row

        # --- Score and build results ---
        now = datetime.utcnow()

        if self.config.enable_rrf and len(all_ids) > 0:
            # Build independent rankings for RRF
            signal_rankings: Dict[str, List[int]] = {}

            # Vector ranking (sorted by vector score, best first)
            if vector_scores:
                signal_rankings["vector"] = sorted(
                    vector_scores.keys(), key=lambda mid: vector_scores[mid], reverse=True
                )

            # FTS ranking (sorted by FTS score, best first)
            if fts_scores:
                signal_rankings["fts"] = sorted(
                    fts_scores.keys(), key=lambda mid: fts_scores[mid], reverse=True
                )

            # Importance ranking (sorted by importance, best first)
            importance_data = {}
            for mid in all_ids:
                row = vector_rows.get(mid)
                if row:
                    importance_data[mid] = row["importance"]
            if importance_data:
                signal_rankings["importance"] = sorted(
                    importance_data.keys(), key=lambda mid: importance_data[mid], reverse=True
                )

            # Recency ranking (sorted by created_at, newest first)
            recency_data = {}
            for mid in all_ids:
                row = vector_rows.get(mid)
                if row:
                    try:
                        created = datetime.fromisoformat(row["created_at"])
                        recency_data[mid] = (now - created).total_seconds()
                    except (ValueError, TypeError):
                        recency_data[mid] = float("inf")
            if recency_data:
                signal_rankings["recency"] = sorted(
                    recency_data.keys(), key=lambda mid: recency_data[mid]  # smallest age = most recent = best
                )

            # Graph proximity ranking
            graph_scores = self._compute_graph_scores(query, all_ids)
            if graph_scores:
                signal_rankings["graph"] = sorted(
                    graph_scores.keys(), key=lambda mid: graph_scores[mid], reverse=True
                )

            # Fuse via RRF
            rrf_scores = self._rrf_score(all_ids, signal_rankings, k=self.config.rrf_k)

            results = []
            for mid in all_ids:
                row = vector_rows.get(mid)
                if not row:
                    continue
                result = self._row_to_result(row, vector_scores.get(mid, 0.0), fts_scores.get(mid, 0.0), now)
                result.score = rrf_scores.get(mid, 0.0)
                results.append(result)
        else:
            # Legacy weighted-sum scoring
            results = []
            for mid in all_ids:
                row = vector_rows.get(mid)
                if not row:
                    continue
                vs = vector_scores.get(mid, 0.0)
                fs = fts_scores.get(mid, 0.0)
                results.append(self._row_to_result(row, vs, fs, now))

        # Sort by combined score and limit
        results.sort(key=lambda r: r.score, reverse=True)
        results = results[:limit]

        self._update_access_counts(results, now)
        return results

    def _apply_filters(
        self,
        sql_parts: list,
        params: list,
        memory_types: Optional[List[str]],
        min_importance: Optional[float],
        date_after: Optional[datetime],
        date_before: Optional[datetime],
        about_entity: Optional[str] = None,
    ) -> None:
        """Apply common filters to SQL query parts."""
        sql_parts.append("AND m.invalidated_at IS NULL")
        if memory_types:
            placeholders = ", ".join(["?" for _ in memory_types])
            sql_parts.append(f"AND m.type IN ({placeholders})")
            params.extend(memory_types)
        if min_importance is not None:
            sql_parts.append("AND m.importance >= ?")
            params.append(min_importance)
        if date_after:
            sql_parts.append("AND m.created_at >= ?")
            params.append(date_after.isoformat())
        if date_before:
            sql_parts.append("AND m.created_at <= ?")
            params.append(date_before.isoformat())
        if about_entity:
            canonical = self.extractor.canonical_name(about_entity)
            sql_parts.append("AND e.canonical_name = ?")
            params.append(canonical)

    def _row_to_result(self, row: Any, vector_score: float, fts_score: float, now: datetime) -> RecallResult:
        """Convert a database row + scores into a RecallResult with combined scoring."""
        importance_score = row["importance"]

        # Recency score (decay over 30 days)
        created = datetime.fromisoformat(row["created_at"])
        days_old = (now - created).days
        recency_score = math.exp(-days_old / 30)

        # Combined weighted score (vector + FTS + importance + recency)
        combined_score = (
            self.config.vector_weight * vector_score
            + self.config.fts_weight * fts_score
            + self.config.importance_weight * importance_score
            + self.config.recency_weight * recency_score
        )

        # Parse entity names
        entity_names = []
        entity_names_val = row["entity_names"] if "entity_names" in row.keys() else None
        if entity_names_val:
            entity_names = [n.strip() for n in entity_names_val.split(",")]

        # Parse metadata
        metadata_val = row["metadata"] if "metadata" in row.keys() else None

        # Extract source fields (may not exist in older DBs)
        row_keys = row.keys()
        source_val = row["source"] if "source" in row_keys else None
        source_id_val = row["source_id"] if "source_id" in row_keys else None
        source_context_val = row["source_context"] if "source_context" in row_keys else None

        # Trust North Star fields (may not exist in older DBs)
        confidence_val = row["confidence"] if "confidence" in row_keys else 1.0
        verification_status_val = row["verification_status"] if "verification_status" in row_keys else "pending"
        origin_type_val = row["origin_type"] if "origin_type" in row_keys else "inferred"

        # Channel tracking (may not exist in older DBs)
        source_channel_val = row["source_channel"] if "source_channel" in row_keys else None

        return RecallResult(
            id=row["id"],
            content=row["content"],
            type=row["type"],
            score=combined_score,
            importance=row["importance"],
            created_at=row["created_at"],
            entities=entity_names,
            metadata=json.loads(metadata_val) if metadata_val else None,
            source=source_val,
            source_id=source_id_val,
            source_context=source_context_val,
            confidence=confidence_val,
            verification_status=verification_status_val,
            origin_type=origin_type_val,
            source_channel=source_channel_val,
        )

    def _rrf_score(
        self,
        memory_ids: set,
        signal_rankings: Dict[str, List[int]],
        k: int = 60,
    ) -> Dict[int, float]:
        """
        Reciprocal Rank Fusion across multiple ranking signals.

        RRF_score(d) = sum(1 / (k + rank_i(d))) for each signal i

        Args:
            memory_ids: All candidate memory IDs
            signal_rankings: Dict of signal_name -> list of memory IDs sorted best-first
            k: Smoothing constant (default 60)

        Returns:
            Dict mapping memory_id -> RRF score
        """
        scores = {mid: 0.0 for mid in memory_ids}
        for signal_name, ranked_ids in signal_rankings.items():
            for rank, mid in enumerate(ranked_ids, start=1):
                if mid in scores:
                    scores[mid] += 1.0 / (k + rank)
        return scores

    def _resolve_entities_from_text(self, text: str) -> List[int]:
        """
        Match entity names in query text against known entities.

        Uses n-gram matching against canonical entity names and aliases.

        Returns:
            List of entity IDs found in the text
        """
        if not text or len(text.strip()) < 2:
            return []

        text_lower = text.lower()
        entity_ids = []

        # Try canonical name matching
        try:
            entities = self.db.execute(
                "SELECT id, canonical_name FROM entities WHERE importance > 0.05",
                fetch=True,
            ) or []

            for entity in entities:
                canonical = entity["canonical_name"]
                if canonical and canonical in text_lower:
                    entity_ids.append(entity["id"])

            # Also check aliases
            if not entity_ids:
                aliases = self.db.execute(
                    "SELECT entity_id, canonical_alias FROM entity_aliases",
                    fetch=True,
                ) or []
                for alias in aliases:
                    if alias["canonical_alias"] and alias["canonical_alias"] in text_lower:
                        entity_ids.append(alias["entity_id"])

        except Exception as e:
            logger.debug(f"Entity resolution from text failed: {e}")

        return list(set(entity_ids))

    def _compute_graph_scores(
        self,
        query: str,
        candidate_ids: set,
    ) -> Dict[int, float]:
        """
        Compute graph proximity scores for candidate memories.

        Memories linked to entities mentioned in the query get a boost.
        Uses relationship strength and type to weight proximity:
        - Direct entity links: 1.0
        - 1-hop neighbors: 0.5-0.8 (scaled by relationship strength)
        - 2-hop neighbors: 0.2-0.5 (scaled by path strength)

        Strong typed relationships (manages, works_with, client_of) get higher
        proximity scores than weak inferred links.

        Args:
            query: Search query text
            candidate_ids: Set of candidate memory IDs

        Returns:
            Dict mapping memory_id -> proximity score (0-1)
        """
        if not self.config.graph_proximity_enabled or not candidate_ids:
            return {}

        # Find entities mentioned in the query
        query_entity_ids = self._resolve_entities_from_text(query)
        if not query_entity_ids:
            return {}

        scores: Dict[int, float] = {}

        try:
            # Build entity -> (hop_distance, path_strength) mapping via strength-aware expansion
            entity_proximity: Dict[int, Tuple[int, float]] = {}
            for eid in query_entity_ids:
                entity_proximity[eid] = (0, 1.0)  # Direct mention, full strength

                # Expand graph to depth 2 with strength-aware scoring
                neighbors = self._expand_graph_weighted(eid, depth=2, limit_per_hop=15)
                for neighbor in neighbors:
                    nid = neighbor["id"]
                    dist = neighbor.get("distance", 1)
                    path_strength = neighbor.get("path_strength", 0.5)
                    if nid not in entity_proximity or dist < entity_proximity[nid][0]:
                        entity_proximity[nid] = (dist, path_strength)
                    elif dist == entity_proximity[nid][0] and path_strength > entity_proximity[nid][1]:
                        entity_proximity[nid] = (dist, path_strength)

            # Score each candidate memory by its entity links
            placeholders = ", ".join(["?" for _ in candidate_ids])
            mem_entities = self.db.execute(
                f"""
                SELECT memory_id, entity_id
                FROM memory_entities
                WHERE memory_id IN ({placeholders})
                """,
                tuple(candidate_ids),
                fetch=True,
            ) or []

            for row in mem_entities:
                mid = row["memory_id"]
                eid = row["entity_id"]
                if eid in entity_proximity:
                    dist, path_strength = entity_proximity[eid]
                    # Base score by hop distance, scaled by path strength
                    if dist == 0:
                        score = 1.0
                    elif dist == 1:
                        score = 0.5 + 0.3 * path_strength  # 0.5-0.8
                    else:
                        score = 0.2 + 0.3 * path_strength  # 0.2-0.5
                    scores[mid] = max(scores.get(mid, 0.0), score)

            # Multi-entity bonus: memories connected to multiple query entities
            # get a multiplicative boost (connect-the-dots queries)
            if len(query_entity_ids) > 1:
                mem_entity_hits: Dict[int, int] = {}
                for row in mem_entities:
                    mid = row["memory_id"]
                    eid = row["entity_id"]
                    if eid in entity_proximity:
                        mem_entity_hits[mid] = mem_entity_hits.get(mid, 0) + 1
                for mid, hit_count in mem_entity_hits.items():
                    if hit_count > 1 and mid in scores:
                        # Boost by 15% per additional entity connection
                        scores[mid] = min(1.0, scores[mid] * (1.0 + 0.15 * (hit_count - 1)))

        except Exception as e:
            logger.debug(f"Graph proximity scoring failed: {e}")

        return scores

    def _expand_graph_weighted(
        self,
        entity_id: int,
        depth: int = 2,
        limit_per_hop: int = 15,
    ) -> List[Dict[str, Any]]:
        """
        Traverse the relationship graph with strength-aware scoring.

        Like _expand_graph but tracks cumulative path strength through
        the graph, allowing typed/strong relationships to score higher.

        Args:
            entity_id: Starting entity ID
            depth: Maximum hops (default 2)
            limit_per_hop: Max connected entities per hop

        Returns:
            List of dicts with entity info, distance, and path_strength
        """
        try:
            # Get direct neighbors with relationship strength and type
            direct_rows = self.db.execute(
                """
                SELECT DISTINCT
                    CASE WHEN r.source_entity_id = ? THEN r.target_entity_id
                         ELSE r.source_entity_id END as neighbor_id,
                    e.name, e.type, e.importance,
                    r.strength as rel_strength,
                    r.relationship_type
                FROM relationships r
                JOIN entities e ON e.id = CASE
                    WHEN r.source_entity_id = ? THEN r.target_entity_id
                    ELSE r.source_entity_id END
                WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
                  AND r.strength > 0.1
                  AND r.invalid_at IS NULL
                  AND e.importance > 0.05
                  AND e.id != ?
                ORDER BY r.strength DESC, e.importance DESC
                LIMIT ?
                """,
                (entity_id, entity_id, entity_id, entity_id, entity_id, limit_per_hop),
                fetch=True,
            ) or []

            connected = []
            seen_ids = {entity_id}

            for row in direct_rows:
                nid = row["neighbor_id"]
                if nid in seen_ids:
                    continue
                seen_ids.add(nid)
                path_strength = row["rel_strength"]
                connected.append({
                    "id": nid,
                    "name": row["name"],
                    "type": row["type"],
                    "importance": row["importance"],
                    "distance": 1,
                    "path_strength": path_strength,
                    "via_relationship": row["relationship_type"],
                })

            # Second hop if requested
            if depth >= 2:
                hop1_ids = [c["id"] for c in connected]
                for hop1 in connected[:10]:  # Limit fan-out
                    hop2_rows = self.db.execute(
                        """
                        SELECT DISTINCT
                            CASE WHEN r.source_entity_id = ? THEN r.target_entity_id
                                 ELSE r.source_entity_id END as neighbor_id,
                            e.name, e.type, e.importance,
                            r.strength as rel_strength,
                            r.relationship_type
                        FROM relationships r
                        JOIN entities e ON e.id = CASE
                            WHEN r.source_entity_id = ? THEN r.target_entity_id
                            ELSE r.source_entity_id END
                        WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
                          AND r.strength > 0.1
                          AND r.invalid_at IS NULL
                          AND e.importance > 0.05
                          AND e.id != ?
                        ORDER BY r.strength DESC
                        LIMIT ?
                        """,
                        (hop1["id"], hop1["id"], hop1["id"], hop1["id"],
                         entity_id, limit_per_hop // 2),
                        fetch=True,
                    ) or []

                    for row in hop2_rows:
                        nid = row["neighbor_id"]
                        if nid in seen_ids:
                            continue
                        seen_ids.add(nid)
                        # Path strength is product of edge strengths
                        path_strength = hop1["path_strength"] * row["rel_strength"]
                        connected.append({
                            "id": nid,
                            "name": row["name"],
                            "type": row["type"],
                            "importance": row["importance"],
                            "distance": 2,
                            "path_strength": path_strength,
                            "via_relationship": row["relationship_type"],
                        })

            return connected

        except Exception as e:
            logger.debug(f"Weighted graph traversal failed: {e}")
            return []

    def _update_access_counts(self, results: List[RecallResult], now: datetime) -> None:
        """Update access counts for rehearsal effect."""
        for result in results:
            self.db.execute(
                """
                UPDATE memories
                SET last_accessed_at = ?, access_count = access_count + 1
                WHERE id = ?
                """,
                (now.isoformat(), result.id),
            )

    def _fts_search(
        self,
        query: str,
        limit: int,
        memory_types: Optional[List[str]] = None,
        min_importance: Optional[float] = None,
    ) -> Dict[int, float]:
        """
        Full-text search using FTS5 with BM25 scoring.

        Returns:
            Dict mapping memory_id -> normalized FTS score (0-1, 1 = best)
        """
        try:
            sql = """
                SELECT m.id, fts.rank
                FROM memories_fts fts
                JOIN memories m ON m.id = fts.rowid
                WHERE memories_fts MATCH ?
                AND m.invalidated_at IS NULL
            """
            params: list = [query]

            if memory_types:
                placeholders = ", ".join(["?" for _ in memory_types])
                sql += f" AND m.type IN ({placeholders})"
                params.extend(memory_types)

            if min_importance is not None:
                sql += " AND m.importance >= ?"
                params.append(min_importance)

            sql += " ORDER BY fts.rank LIMIT ?"
            params.append(limit)

            rows = self.db.execute(sql, tuple(params), fetch=True) or []
            if not rows:
                return {}

            # Normalize FTS5 rank scores to 0-1 range
            # FTS5 rank is BM25: negative float, closer to 0 = better match
            ranks = [row["rank"] for row in rows]
            min_rank = min(ranks)  # best match (most negative)
            max_rank = max(ranks)  # worst match (closest to 0)

            result = {}
            for row in rows:
                if min_rank == max_rank:
                    score = 1.0  # single result
                else:
                    score = (row["rank"] - max_rank) / (min_rank - max_rank)
                result[row["id"]] = score

            return result

        except Exception as e:
            logger.debug(f"FTS5 search failed (table may not exist): {e}")
            return {}

    def fetch_by_ids(self, memory_ids: List[int]) -> List[RecallResult]:
        """
        Fetch specific memories by their IDs.

        Args:
            memory_ids: List of memory IDs to fetch

        Returns:
            List of RecallResult objects
        """
        if not memory_ids:
            return []

        placeholders = ", ".join(["?" for _ in memory_ids])
        rows = self.db.execute(
            f"""
            SELECT m.*, GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me2 ON m.id = me2.memory_id
            LEFT JOIN entities e ON me2.entity_id = e.id
            WHERE m.id IN ({placeholders})
            GROUP BY m.id
            """,
            tuple(memory_ids),
            fetch=True,
        ) or []

        now = datetime.utcnow()
        return [self._row_to_result(row, 0.0, 0.0, now) for row in rows]

    def recall_about(
        self,
        entity_name: str,
        limit: int = None,
        memory_types: Optional[List[str]] = None,
        include_historical: bool = False,
    ) -> Dict[str, Any]:
        """
        Get everything known about an entity.

        Args:
            entity_name: Name of the entity
            limit: Maximum memories to return
            memory_types: Filter by memory types

        Returns:
            Dict with entity info, memories, and relationships
        """
        if limit is None:
            limit = self.config.max_recall_results

        canonical = self.extractor.canonical_name(entity_name)

        # Find entity
        entity = self.db.get_one(
            "entities",
            where="canonical_name = ?",
            where_params=(canonical,),
        )

        if not entity:
            # Try alias
            alias = self.db.get_one(
                "entity_aliases",
                where="canonical_alias = ?",
                where_params=(canonical,),
            )
            if alias:
                entity = self.db.get_one(
                    "entities", where="id = ?", where_params=(alias["entity_id"],)
                )

        if not entity:
            return {"entity": None, "memories": [], "relationships": []}

        # Get memories about this entity
        sql = """
            SELECT m.* FROM memories m
            JOIN memory_entities me ON m.id = me.memory_id
            WHERE me.entity_id = ?
            AND m.invalidated_at IS NULL
        """
        params = [entity["id"]]

        if memory_types:
            placeholders = ", ".join(["?" for _ in memory_types])
            sql += f" AND m.type IN ({placeholders})"
            params.extend(memory_types)

        sql += " ORDER BY m.importance DESC, m.created_at DESC LIMIT ?"
        params.append(limit)

        memory_rows = self.db.execute(sql, tuple(params), fetch=True) or []

        memories = []
        for row in memory_rows:
            row_keys = row.keys()
            memories.append(
                RecallResult(
                    id=row["id"],
                    content=row["content"],
                    type=row["type"],
                    score=row["importance"],
                    importance=row["importance"],
                    created_at=row["created_at"],
                    entities=[entity["name"]],
                    metadata=json.loads(row["metadata"]) if row["metadata"] else None,
                    source=row["source"] if "source" in row_keys else None,
                    source_id=row["source_id"] if "source_id" in row_keys else None,
                    source_context=row["source_context"] if "source_context" in row_keys else None,
                )
            )

        # Get relationships (default: current only; include_historical shows all)
        rel_sql = """
            SELECT r.*,
                   s.name as source_name, s.type as source_type,
                   t.name as target_name, t.type as target_type
            FROM relationships r
            JOIN entities s ON r.source_entity_id = s.id
            JOIN entities t ON r.target_entity_id = t.id
            WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
        """
        if not include_historical:
            rel_sql += " AND r.invalid_at IS NULL"
        rel_sql += " ORDER BY r.strength DESC"
        rel_rows = self.db.execute(rel_sql, (entity["id"], entity["id"]), fetch=True) or []

        relationships = []
        for row in rel_rows:
            row_keys = row.keys()
            rel_dict = {
                "type": row["relationship_type"],
                "direction": row["direction"],
                "strength": row["strength"],
                "origin_type": row["origin_type"] if "origin_type" in row_keys else "extracted",
                "other_entity": (
                    row["target_name"]
                    if row["source_entity_id"] == entity["id"]
                    else row["source_name"]
                ),
                "other_entity_type": (
                    row["target_type"]
                    if row["source_entity_id"] == entity["id"]
                    else row["source_type"]
                ),
            }
            # Include temporal fields when showing historical data
            if include_historical:
                rel_dict["valid_at"] = row["valid_at"] if "valid_at" in row_keys else None
                rel_dict["invalid_at"] = row["invalid_at"] if "invalid_at" in row_keys else None
            relationships.append(rel_dict)

        # Get relevant episode narratives mentioning this entity
        episode_rows = self.db.execute(
            """
            SELECT id, session_id, narrative, started_at, ended_at, key_topics
            FROM episodes
            WHERE is_summarized = 1
              AND narrative LIKE ?
            ORDER BY started_at DESC
            LIMIT 5
            """,
            (f"%{entity['name']}%",),
            fetch=True,
        ) or []

        recent_sessions = [
            {
                "episode_id": row["id"],
                "narrative": row["narrative"],
                "started_at": row["started_at"],
                "key_topics": json.loads(row["key_topics"]) if row["key_topics"] else [],
            }
            for row in episode_rows
        ]

        # Expand graph: get connected entities via relationship traversal
        connected = self._expand_graph(entity["id"])

        return {
            "entity": {
                "id": entity["id"],
                "name": entity["name"],
                "type": entity["type"],
                "description": entity["description"],
                "importance": entity["importance"],
            },
            "memories": memories,
            "relationships": relationships,
            "connected": connected,
            "recent_sessions": recent_sessions,
        }

    def search_entities(
        self,
        query: str,
        entity_types: Optional[List[str]] = None,
        limit: int = 10,
    ) -> List[EntityResult]:
        """
        Search for entities by name or description.

        Args:
            query: Search query
            entity_types: Filter by entity types
            limit: Maximum results

        Returns:
            List of matching entities
        """
        canonical = self.extractor.canonical_name(query)

        # Try exact match first
        sql = """
            SELECT e.*,
                   COUNT(DISTINCT me.memory_id) as memory_count,
                   COUNT(DISTINCT r.id) as relationship_count,
                   MAX(m.created_at) as last_mentioned
            FROM entities e
            LEFT JOIN memory_entities me ON e.id = me.entity_id
            LEFT JOIN memories m ON me.memory_id = m.id
            LEFT JOIN relationships r ON e.id = r.source_entity_id OR e.id = r.target_entity_id
            WHERE e.canonical_name LIKE ? OR e.name LIKE ?
        """
        params = [f"%{canonical}%", f"%{query}%"]

        if entity_types:
            placeholders = ", ".join(["?" for _ in entity_types])
            sql += f" AND e.type IN ({placeholders})"
            params.extend(entity_types)

        sql += " GROUP BY e.id ORDER BY e.importance DESC LIMIT ?"
        params.append(limit)

        rows = self.db.execute(sql, tuple(params), fetch=True) or []

        return [
            EntityResult(
                id=row["id"],
                name=row["name"],
                type=row["type"],
                description=row["description"],
                importance=row["importance"],
                memory_count=row["memory_count"],
                relationship_count=row["relationship_count"],
                last_mentioned=row["last_mentioned"],
            )
            for row in rows
        ]

    def find_duplicate_entities(
        self,
        threshold: float = 0.85,
        entity_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Find potential duplicate entities using fuzzy name matching.

        Uses SequenceMatcher ratio with first-letter boost.

        Args:
            threshold: Similarity threshold (0.85 = 85% similar)
            entity_type: Filter to specific entity type
            limit: Maximum pairs to return

        Returns:
            List of dicts with entity pairs and similarity scores
        """
        # Get all non-deleted entities
        sql = """
            SELECT id, name, canonical_name, type, importance
            FROM entities
            WHERE deleted_at IS NULL
        """
        params = []
        if entity_type:
            sql += " AND type = ?"
            params.append(entity_type)

        entities = self.db.execute(sql, tuple(params), fetch=True) or []

        duplicates = []
        seen_pairs = set()

        for i, e1 in enumerate(entities):
            for e2 in entities[i + 1:]:
                # Skip if already processed or different types
                if e1["type"] != e2["type"]:
                    continue

                pair_key = (min(e1["id"], e2["id"]), max(e1["id"], e2["id"]))
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)

                # Calculate similarity
                ratio = self._name_similarity(e1["canonical_name"], e2["canonical_name"])

                if ratio >= threshold:
                    duplicates.append({
                        "entity_1": {
                            "id": e1["id"],
                            "name": e1["name"],
                            "type": e1["type"],
                            "importance": e1["importance"],
                        },
                        "entity_2": {
                            "id": e2["id"],
                            "name": e2["name"],
                            "type": e2["type"],
                            "importance": e2["importance"],
                        },
                        "similarity": round(ratio, 3),
                    })

                    if len(duplicates) >= limit:
                        break
            if len(duplicates) >= limit:
                break

        # Sort by similarity descending
        duplicates.sort(key=lambda x: x["similarity"], reverse=True)
        return duplicates

    def _name_similarity(self, name1: str, name2: str) -> float:
        """
        Calculate name similarity using SequenceMatcher with first-letter boost.

        Same first letter gets a 0.05 boost (helps catch typos).
        """
        if not name1 or not name2:
            return 0.0

        # Base similarity
        ratio = SequenceMatcher(None, name1.lower(), name2.lower()).ratio()

        # First letter boost
        if name1[0].lower() == name2[0].lower():
            ratio = min(1.0, ratio + 0.05)

        return ratio

    def entity_overview(
        self,
        entity_names: List[str],
        include_network: bool = True,
        include_summaries: bool = True,
    ) -> Dict[str, Any]:
        """
        Generate a community-style overview of one or more entities.

        Inspired by GraphRAG "global search": retrieves top entities, their
        summaries, key relationships, and cross-entity patterns to surface
        higher-level intelligence.

        Args:
            entity_names: List of entity names to include in overview
            include_network: Include 1-hop network connections
            include_summaries: Include cached entity summaries

        Returns:
            Dict with entity details, summaries, relationships, patterns, and clusters
        """
        result: Dict[str, Any] = {
            "entities": [],
            "cross_entity_patterns": [],
            "clusters": [],
            "relationship_map": [],
            "open_commitments": [],
        }

        entity_ids = []
        for name in entity_names:
            canonical = self.extractor.canonical_name(name)
            entity = self.db.get_one(
                "entities",
                where="canonical_name = ? AND deleted_at IS NULL",
                where_params=(canonical,),
            )
            if not entity:
                entity = self.db.get_one(
                    "entities",
                    where="canonical_name LIKE ? AND deleted_at IS NULL",
                    where_params=(f"%{canonical}%",),
                )
            if entity:
                entity_ids.append(entity["id"])
                entity_keys = entity.keys()

                entity_data: Dict[str, Any] = {
                    "id": entity["id"],
                    "name": entity["name"],
                    "type": entity["type"],
                    "description": entity["description"],
                    "importance": entity["importance"],
                    "attention_tier": entity["attention_tier"] if "attention_tier" in entity_keys else "standard",
                    "contact_trend": entity["contact_trend"] if "contact_trend" in entity_keys else None,
                }

                # Attach cached summary if available
                if include_summaries:
                    summary = self.db.get_one(
                        "entity_summaries",
                        where="entity_id = ? AND summary_type = 'overview'",
                        where_params=(entity["id"],),
                    )
                    if summary:
                        entity_data["summary"] = summary["summary"]
                        entity_data["summary_generated_at"] = summary["generated_at"]

                result["entities"].append(entity_data)

        if not entity_ids:
            return result

        # Cross-entity relationships
        if len(entity_ids) >= 2:
            for i in range(len(entity_ids)):
                for j in range(i + 1, len(entity_ids)):
                    rels = self.db.execute(
                        """
                        SELECT r.relationship_type, r.strength, r.origin_type,
                               s.name as source_name, t.name as target_name
                        FROM relationships r
                        JOIN entities s ON r.source_entity_id = s.id
                        JOIN entities t ON r.target_entity_id = t.id
                        WHERE ((r.source_entity_id = ? AND r.target_entity_id = ?)
                            OR (r.source_entity_id = ? AND r.target_entity_id = ?))
                          AND r.invalid_at IS NULL
                        """,
                        (entity_ids[i], entity_ids[j], entity_ids[j], entity_ids[i]),
                        fetch=True,
                    ) or []
                    for rel in rels:
                        result["relationship_map"].append({
                            "source": rel["source_name"],
                            "target": rel["target_name"],
                            "type": rel["relationship_type"],
                            "strength": rel["strength"],
                            "origin": rel["origin_type"],
                        })

        # Network connections for each entity (1-hop)
        if include_network:
            for eid in entity_ids:
                neighbors = self._expand_graph_weighted(eid, depth=1, limit_per_hop=10)
                for n in neighbors:
                    if n["id"] not in entity_ids:
                        result["relationship_map"].append({
                            "source": next(
                                (e["name"] for e in result["entities"] if e["id"] == eid),
                                "unknown"
                            ),
                            "target": n["name"],
                            "type": n.get("via_relationship", "connected_to"),
                            "strength": n.get("path_strength", 0.5),
                            "hop": 1,
                        })

        # Co-mentioned memories across the queried entities
        if len(entity_ids) >= 2:
            placeholders = ", ".join(["?" for _ in entity_ids])
            co_memories = self.db.execute(
                f"""
                SELECT m.content, m.type, m.importance,
                       GROUP_CONCAT(e.name) as entity_names,
                       COUNT(DISTINCT me.entity_id) as entity_hit_count
                FROM memories m
                JOIN memory_entities me ON m.id = me.memory_id
                JOIN entities e ON me.entity_id = e.id
                WHERE me.entity_id IN ({placeholders})
                  AND m.invalidated_at IS NULL
                GROUP BY m.id
                HAVING entity_hit_count >= 2
                ORDER BY m.importance DESC
                LIMIT 10
                """,
                tuple(entity_ids),
                fetch=True,
            ) or []

            for mem in co_memories:
                result["cross_entity_patterns"].append({
                    "content": mem["content"],
                    "type": mem["type"],
                    "importance": mem["importance"],
                    "entities_involved": mem["entity_names"].split(",") if mem["entity_names"] else [],
                })

        # Open commitments across all entities
        placeholders = ", ".join(["?" for _ in entity_ids])
        commitments = self.db.execute(
            f"""
            SELECT m.content, m.deadline_at, e.name as entity_name
            FROM memories m
            JOIN memory_entities me ON m.id = me.memory_id
            JOIN entities e ON me.entity_id = e.id
            WHERE me.entity_id IN ({placeholders})
              AND m.type = 'commitment'
              AND m.invalidated_at IS NULL
            ORDER BY m.deadline_at ASC, m.importance DESC
            LIMIT 10
            """,
            tuple(entity_ids),
            fetch=True,
        ) or []

        for c in commitments:
            result["open_commitments"].append({
                "content": c["content"],
                "deadline": c["deadline_at"],
                "entity": c["entity_name"],
            })

        return result

    def get_recent_memories(
        self,
        limit: int = 10,
        memory_types: Optional[List[str]] = None,
        hours: int = 24,
        source_filter: Optional[str] = None,
    ) -> List[RecallResult]:
        """Get recent memories within a time window.

        Args:
            limit: Maximum results to return
            memory_types: Filter by memory types
            hours: Time window in hours
            source_filter: Filter by source channel (e.g. 'telegram', 'slack')
        """
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        sql = """
            SELECT m.*, GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE m.created_at >= ?
            AND m.invalidated_at IS NULL
        """
        params = [cutoff.isoformat()]

        if memory_types:
            placeholders = ", ".join(["?" for _ in memory_types])
            sql += f" AND m.type IN ({placeholders})"
            params.extend(memory_types)

        if source_filter:
            sql += " AND m.source = ?"
            params.append(source_filter)

        sql += " GROUP BY m.id ORDER BY m.created_at DESC LIMIT ?"
        params.append(limit)

        rows = self.db.execute(sql, tuple(params), fetch=True) or []

        results = []
        for row in rows:
            row_keys = row.keys()
            results.append(
                RecallResult(
                    id=row["id"],
                    content=row["content"],
                    type=row["type"],
                    score=row["importance"],
                    importance=row["importance"],
                    created_at=row["created_at"],
                    entities=row["entity_names"].split(",") if row["entity_names"] else [],
                    metadata=json.loads(row["metadata"]) if row["metadata"] else None,
                    source=row["source"] if "source" in row_keys else None,
                    source_id=row["source_id"] if "source_id" in row_keys else None,
                    source_context=row["source_context"] if "source_context" in row_keys else None,
                )
            )
        return results

    def recall_episodes(
        self,
        query: str,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Search episode narratives by semantic similarity.

        Returns session summaries that match the query, giving Claude
        access to the texture and context of past sessions.

        Args:
            query: What to search for
            limit: Maximum number of episodes to return

        Returns:
            List of dicts with episode info and narrative
        """
        query_embedding = embed_sync(query)

        if query_embedding:
            try:
                rows = self.db.execute(
                    """
                    SELECT e.*, (1.0 / (1.0 + ee.distance)) as relevance
                    FROM episode_embeddings ee
                    JOIN episodes e ON e.id = ee.episode_id
                    WHERE ee.embedding MATCH ?
                    AND e.is_summarized = 1
                    ORDER BY relevance DESC
                    LIMIT ?
                    """,
                    (json.dumps(query_embedding), limit),
                    fetch=True,
                ) or []
            except Exception as e:
                if not RecallService._vec0_warned:
                    logger.warning(f"Episode vector search failed, falling back to keyword: {e}")
                    RecallService._vec0_warned = True
                rows = self.db.execute(
                    """
                    SELECT e.*, 0.5 as relevance
                    FROM episodes e
                    WHERE e.narrative LIKE ?
                    AND e.is_summarized = 1
                    ORDER BY e.started_at DESC
                    LIMIT ?
                    """,
                    (f"%{query}%", limit),
                    fetch=True,
                ) or []
        else:
            rows = self.db.execute(
                """
                SELECT e.*, 0.5 as relevance
                FROM episodes e
                WHERE e.narrative LIKE ?
                AND e.is_summarized = 1
                ORDER BY e.started_at DESC
                LIMIT ?
                """,
                (f"%{query}%", limit),
                fetch=True,
            ) or []

        return [
            {
                "episode_id": row["id"],
                "session_id": row["session_id"],
                "narrative": row["narrative"],
                "summary": row["summary"],
                "started_at": row["started_at"],
                "ended_at": row["ended_at"],
                "key_topics": json.loads(row["key_topics"]) if row["key_topics"] else [],
                "relevance": row["relevance"],
            }
            for row in rows
        ]

    def trace_memory(self, memory_id: int) -> Dict[str, Any]:
        """
        Reconstruct full provenance for a memory.

        Returns the memory with all fields, the source episode and its
        archived turns (if the memory came from a session), and a preview
        of any source material file saved to disk.

        Args:
            memory_id: The memory ID to trace

        Returns:
            Dict with memory, episode, archived_turns, source_file info
        """
        result: Dict[str, Any] = {
            "memory": None,
            "episode": None,
            "archived_turns": None,
            "source_file": None,
            "source_file_preview": None,
            "entities": [],
        }

        # 1. Fetch the memory row
        memory_row = self.db.get_one(
            "memories", where="id = ?", where_params=(memory_id,)
        )
        if not memory_row:
            return result

        row_keys = memory_row.keys()
        result["memory"] = {
            "id": memory_row["id"],
            "content": memory_row["content"],
            "type": memory_row["type"],
            "importance": memory_row["importance"],
            "confidence": memory_row["confidence"],
            "source": memory_row["source"] if "source" in row_keys else None,
            "source_id": memory_row["source_id"] if "source_id" in row_keys else None,
            "source_context": memory_row["source_context"] if "source_context" in row_keys else None,
            "created_at": memory_row["created_at"],
            "updated_at": memory_row["updated_at"],
            "access_count": memory_row["access_count"],
        }

        # 2. Fetch related entities
        entity_rows = self.db.execute(
            """
            SELECT e.name, e.type FROM entities e
            JOIN memory_entities me ON e.id = me.entity_id
            WHERE me.memory_id = ?
            """,
            (memory_id,),
            fetch=True,
        ) or []
        result["entities"] = [
            {"name": row["name"], "type": row["type"]} for row in entity_rows
        ]

        # 3. If source_id points to an episode, fetch it with archived turns
        source_id = result["memory"].get("source_id")
        if source_id:
            try:
                episode_id = int(source_id)
                episode_row = self.db.get_one(
                    "episodes", where="id = ?", where_params=(episode_id,)
                )
                if episode_row:
                    ep_keys = episode_row.keys()
                    result["episode"] = {
                        "id": episode_row["id"],
                        "narrative": episode_row["narrative"] if "narrative" in ep_keys else None,
                        "started_at": episode_row["started_at"],
                        "ended_at": episode_row["ended_at"] if "ended_at" in ep_keys else None,
                        "key_topics": json.loads(episode_row["key_topics"]) if episode_row.get("key_topics") else [],
                    }

                    # Fetch archived turns
                    turn_rows = self.db.execute(
                        """
                        SELECT turn_number, user_content, assistant_content, created_at
                        FROM turn_buffer
                        WHERE episode_id = ? AND is_archived = 1
                        ORDER BY turn_number ASC
                        """,
                        (episode_id,),
                        fetch=True,
                    ) or []
                    if turn_rows:
                        result["archived_turns"] = [
                            {
                                "turn": row["turn_number"],
                                "user": row["user_content"],
                                "assistant": row["assistant_content"],
                                "timestamp": row["created_at"],
                            }
                            for row in turn_rows
                        ]
            except (ValueError, TypeError):
                pass  # source_id wasn't a numeric episode ID

        # 4. Check for source material file on disk (legacy path)
        sources_dir = self.db.db_path.parent / "sources"
        source_file = sources_dir / f"{memory_id}.md"
        if source_file.exists():
            result["source_file"] = str(source_file)
            try:
                file_text = source_file.read_text(encoding="utf-8")
                # Skip frontmatter for preview
                if file_text.startswith("---"):
                    end_idx = file_text.find("---", 3)
                    if end_idx != -1:
                        body = file_text[end_idx + 3:].strip()
                    else:
                        body = file_text
                else:
                    body = file_text
                result["source_file_preview"] = body[:200]
            except Exception:
                result["source_file_preview"] = "(could not read file)"

        # 5. Check for linked documents via memory_sources (provenance)
        try:
            doc_rows = self.db.execute(
                """
                SELECT d.id, d.filename, d.source_type, d.summary,
                       d.storage_path, d.created_at, ms.excerpt
                FROM documents d
                JOIN memory_sources ms ON d.id = ms.document_id
                WHERE ms.memory_id = ?
                ORDER BY d.created_at DESC
                """,
                (memory_id,),
                fetch=True,
            ) or []
            if doc_rows:
                result["documents"] = [
                    {
                        "id": row["id"],
                        "filename": row["filename"],
                        "source_type": row["source_type"],
                        "summary": row["summary"],
                        "excerpt": row["excerpt"],
                        "storage_path": row["storage_path"],
                        "created_at": row["created_at"],
                    }
                    for row in doc_rows
                ]
        except Exception as e:
            # Graceful degradation if documents table doesn't exist yet
            logger.debug(f"Could not fetch document provenance: {e}")

        # 6. Build provenance chain -- a human-readable path showing how we know this
        result["provenance_chain"] = self._build_provenance_chain(memory_row, result)

        # 7. Fetch audit trail for this memory
        try:
            audit_rows = self.db.execute(
                """
                SELECT operation, details, timestamp
                FROM audit_log
                WHERE memory_id = ?
                ORDER BY timestamp ASC
                """,
                (memory_id,),
                fetch=True,
            ) or []
            if audit_rows:
                result["audit_trail"] = [
                    {
                        "operation": row["operation"],
                        "details": row["details"],
                        "timestamp": row["timestamp"],
                    }
                    for row in audit_rows
                ]
        except Exception as e:
            logger.debug(f"Could not fetch audit trail: {e}")

        return result

    def _build_provenance_chain(self, memory_row, trace_result: Dict) -> List[Dict[str, str]]:
        """
        Build a human-readable provenance chain for a memory.

        Returns a list of steps showing the memory's origin path:
        user -> source_document -> extracted_fact -> correction_event

        Each step has 'type', 'label', and optional 'timestamp'.
        """
        chain = []
        row_keys = memory_row.keys()

        # Step 1: Origin type
        origin = memory_row["origin_type"] if "origin_type" in row_keys else "inferred"
        source_channel = memory_row["source_channel"] if "source_channel" in row_keys else "claude_code"
        chain.append({
            "type": "origin",
            "label": f"Origin: {origin} via {source_channel or 'claude_code'}",
            "timestamp": memory_row["created_at"],
        })

        # Step 2: Source document (if linked)
        if trace_result.get("documents"):
            doc = trace_result["documents"][0]
            chain.append({
                "type": "source_document",
                "label": f"Source: {doc['source_type']} - {doc['filename']}",
                "timestamp": doc["created_at"],
            })

        # Step 3: Episode context (if from a session)
        if trace_result.get("episode"):
            ep = trace_result["episode"]
            topics = ", ".join(ep.get("key_topics", [])[:3]) if ep.get("key_topics") else "general"
            chain.append({
                "type": "episode",
                "label": f"Session ({topics})",
                "timestamp": ep.get("started_at"),
            })

        # Step 4: Source context breadcrumb
        source_context = memory_row["source_context"] if "source_context" in row_keys else None
        if source_context:
            chain.append({
                "type": "context",
                "label": f"Context: {source_context}",
            })

        # Step 5: Extracted fact
        chain.append({
            "type": "memory",
            "label": f"Stored as {memory_row['type']} (importance: {memory_row['importance']:.2f}, confidence: {memory_row['confidence']:.2f})",
            "timestamp": memory_row["created_at"],
        })

        # Step 6: Corrections (if any)
        corrected_at = memory_row["corrected_at"] if "corrected_at" in row_keys else None
        corrected_from = memory_row["corrected_from"] if "corrected_from" in row_keys else None
        if corrected_at:
            chain.append({
                "type": "correction",
                "label": f"Corrected: was '{corrected_from[:80]}...'" if corrected_from else "Corrected by user",
                "timestamp": corrected_at,
            })

        # Step 7: Invalidation (if any)
        invalidated_at = memory_row["invalidated_at"] if "invalidated_at" in row_keys else None
        invalidated_reason = memory_row["invalidated_reason"] if "invalidated_reason" in row_keys else None
        if invalidated_at:
            chain.append({
                "type": "invalidation",
                "label": f"Invalidated: {invalidated_reason or 'no reason given'}",
                "timestamp": invalidated_at,
            })

        # Step 8: Related entities
        if trace_result.get("entities"):
            entity_names = [e["name"] for e in trace_result["entities"][:5]]
            chain.append({
                "type": "entities",
                "label": f"About: {', '.join(entity_names)}",
            })

        return chain

    def _expand_graph(
        self,
        entity_id: int,
        depth: int = 1,
        limit_per_hop: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Traverse the relationship graph from an entity using recursive CTEs.

        Returns connected entities (1 hop by default) with their top memories.
        Prevents cycles and prunes weak relationships (importance < 0.1).

        Args:
            entity_id: Starting entity ID
            depth: Maximum hops (default 1)
            limit_per_hop: Max connected entities per hop

        Returns:
            List of dicts with entity info and top memories
        """
        try:
            # Use recursive CTE to find connected entities
            rows = self.db.execute(
                """
                WITH RECURSIVE graph(entity_id, hop) AS (
                    -- Seed: direct neighbors
                    SELECT CASE
                        WHEN r.source_entity_id = ? THEN r.target_entity_id
                        ELSE r.source_entity_id
                    END, 1
                    FROM relationships r
                    WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
                      AND r.strength > 0.1

                    UNION

                    -- Recurse: neighbors of neighbors (up to depth)
                    SELECT CASE
                        WHEN r.source_entity_id = g.entity_id THEN r.target_entity_id
                        ELSE r.source_entity_id
                    END, g.hop + 1
                    FROM relationships r
                    JOIN graph g ON (r.source_entity_id = g.entity_id OR r.target_entity_id = g.entity_id)
                    WHERE g.hop < ?
                      AND r.strength > 0.1
                      AND CASE
                          WHEN r.source_entity_id = g.entity_id THEN r.target_entity_id
                          ELSE r.source_entity_id
                      END != ?
                )
                SELECT DISTINCT e.id, e.name, e.type, e.description, e.importance,
                       MIN(g.hop) as distance
                FROM graph g
                JOIN entities e ON g.entity_id = e.id
                WHERE e.id != ? AND e.importance > 0.1
                GROUP BY e.id
                ORDER BY distance ASC, e.importance DESC
                LIMIT ?
                """,
                (entity_id, entity_id, entity_id, depth, entity_id, entity_id, limit_per_hop * depth),
                fetch=True,
            ) or []

            connected = []
            for row in rows:
                # Fetch top 2 memories for each connected entity
                mem_rows = self.db.execute(
                    """
                    SELECT m.content, m.type, m.importance
                    FROM memories m
                    JOIN memory_entities me ON m.id = me.memory_id
                    WHERE me.entity_id = ?
                    ORDER BY m.importance DESC
                    LIMIT 2
                    """,
                    (row["id"],),
                    fetch=True,
                ) or []

                connected.append({
                    "id": row["id"],
                    "name": row["name"],
                    "type": row["type"],
                    "description": row["description"],
                    "importance": row["importance"],
                    "distance": row["distance"],
                    "top_memories": [
                        {"content": m["content"], "type": m["type"]}
                        for m in mem_rows
                    ],
                })

            return connected

        except Exception as e:
            logger.debug(f"Graph traversal failed: {e}")
            return []

    def get_project_network(self, project_name: str) -> Dict[str, Any]:
        """
        Get all people and organizations connected to a project.

        Finds the project entity, retrieves all direct relationships (collaborates_on,
        owns, manages), and gets 1-hop connections from those people.

        Args:
            project_name: Name of the project entity

        Returns:
            Dict with project info, direct participants, organizations, and extended network
        """
        canonical = self.extractor.canonical_name(project_name)

        # Find project entity
        project = self.db.get_one(
            "entities",
            where="canonical_name = ? AND type = 'project'",
            where_params=(canonical,),
        )

        if not project:
            # Try partial match
            project = self.db.get_one(
                "entities",
                where="canonical_name LIKE ? AND type = 'project'",
                where_params=(f"%{canonical}%",),
            )

        if not project:
            return {"error": f"Project '{project_name}' not found", "project": None}

        result = {
            "project": {
                "id": project["id"],
                "name": project["name"],
                "description": project["description"],
                "importance": project["importance"],
            },
            "direct_participants": [],
            "organizations": [],
            "extended_network": [],
            "total_people": 0,
            "total_orgs": 0,
        }

        try:
            # Get direct relationships to project
            direct_rels = self.db.execute(
                """
                SELECT r.*, e.id as entity_id, e.name, e.type, e.description, e.importance
                FROM relationships r
                JOIN entities e ON (
                    (r.source_entity_id = ? AND r.target_entity_id = e.id) OR
                    (r.target_entity_id = ? AND r.source_entity_id = e.id)
                )
                WHERE r.strength > 0.1 AND r.invalid_at IS NULL
                ORDER BY r.strength DESC
                """,
                (project["id"], project["id"]),
                fetch=True,
            ) or []

            people_ids = []
            for rel in direct_rels:
                entity_data = {
                    "id": rel["entity_id"],
                    "name": rel["name"],
                    "type": rel["type"],
                    "description": rel["description"],
                    "importance": rel["importance"],
                    "relationship": rel["relationship_type"],
                    "strength": rel["strength"],
                }

                if rel["type"] == "person":
                    result["direct_participants"].append(entity_data)
                    people_ids.append(rel["entity_id"])
                elif rel["type"] == "organization":
                    result["organizations"].append(entity_data)

            # Get 1-hop connections from direct participants
            extended_ids = set()
            for person_id in people_ids[:10]:  # Limit to avoid explosion
                neighbors = self._expand_graph(person_id, depth=1, limit_per_hop=5)
                for neighbor in neighbors:
                    if neighbor["id"] not in people_ids and neighbor["id"] != project["id"]:
                        if neighbor["id"] not in extended_ids:
                            extended_ids.add(neighbor["id"])
                            result["extended_network"].append({
                                "id": neighbor["id"],
                                "name": neighbor["name"],
                                "type": neighbor["type"],
                                "description": neighbor["description"],
                                "connected_via": next(
                                    (p["name"] for p in result["direct_participants"]
                                     if any(m.get("content", "").find(neighbor["name"]) >= 0
                                            for m in neighbor.get("top_memories", []))),
                                    result["direct_participants"][0]["name"] if result["direct_participants"] else "unknown"
                                ),
                            })

            result["total_people"] = len(result["direct_participants"]) + len(
                [e for e in result["extended_network"] if e.get("type") == "person"]
            )
            result["total_orgs"] = len(result["organizations"])

        except Exception as e:
            logger.debug(f"Project network query failed: {e}")
            result["error"] = str(e)

        return result

    def find_path(
        self,
        entity_a: str,
        entity_b: str,
        max_depth: int = 4,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Find shortest path between two entities via relationships.

        Uses BFS through the relationships table to find a connection path.

        Args:
            entity_a: Name of first entity
            entity_b: Name of second entity
            max_depth: Maximum hops to search (default 4)

        Returns:
            List of dicts describing the path, or None if no path found
        """
        canonical_a = self.extractor.canonical_name(entity_a)
        canonical_b = self.extractor.canonical_name(entity_b)

        # Resolve entity IDs
        ent_a = self.db.get_one(
            "entities",
            where="canonical_name = ?",
            where_params=(canonical_a,),
        )
        ent_b = self.db.get_one(
            "entities",
            where="canonical_name = ?",
            where_params=(canonical_b,),
        )

        if not ent_a or not ent_b:
            return None

        if ent_a["id"] == ent_b["id"]:
            return [{"entity": ent_a["name"], "relationship": None, "direction": None}]

        try:
            # BFS using recursive CTE
            rows = self.db.execute(
                """
                WITH RECURSIVE path_search(entity_id, path, depth) AS (
                    -- Start from entity A
                    SELECT ?, json_array(json_object('entity_id', ?, 'name', ?)), 0

                    UNION ALL

                    -- Expand to neighbors
                    SELECT
                        CASE
                            WHEN r.source_entity_id = ps.entity_id THEN r.target_entity_id
                            ELSE r.source_entity_id
                        END,
                        json_insert(
                            ps.path,
                            '$[#]',
                            json_object(
                                'entity_id', CASE WHEN r.source_entity_id = ps.entity_id THEN r.target_entity_id ELSE r.source_entity_id END,
                                'name', e.name,
                                'relationship', r.relationship_type,
                                'direction', CASE WHEN r.source_entity_id = ps.entity_id THEN 'forward' ELSE 'backward' END
                            )
                        ),
                        ps.depth + 1
                    FROM path_search ps
                    JOIN relationships r ON (r.source_entity_id = ps.entity_id OR r.target_entity_id = ps.entity_id)
                    JOIN entities e ON e.id = CASE WHEN r.source_entity_id = ps.entity_id THEN r.target_entity_id ELSE r.source_entity_id END
                    WHERE ps.depth < ?
                      AND r.strength > 0.1
                      AND r.invalid_at IS NULL
                      AND json_extract(ps.path, '$[#-1].entity_id') != CASE WHEN r.source_entity_id = ps.entity_id THEN r.target_entity_id ELSE r.source_entity_id END
                )
                SELECT path, depth FROM path_search
                WHERE entity_id = ?
                ORDER BY depth ASC
                LIMIT 1
                """,
                (ent_a["id"], ent_a["id"], ent_a["name"], max_depth, ent_b["id"]),
                fetch=True,
            )

            if rows:
                path_json = json.loads(rows[0]["path"])
                return path_json

        except Exception as e:
            logger.debug(f"Path finding failed: {e}")

        return None

    def get_hub_entities(
        self,
        min_connections: int = 5,
        entity_type: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Find most connected entities in the graph.

        Identifies "hub" entities that have many relationships, useful for
        finding key connectors in the network.

        Args:
            min_connections: Minimum relationships to be considered a hub
            entity_type: Filter by entity type (person, organization, etc.)
            limit: Maximum results to return

        Returns:
            List of dicts with entity info and connection counts
        """
        try:
            sql = """
                SELECT
                    e.id, e.name, e.type, e.description, e.importance,
                    COUNT(DISTINCT r.id) as connection_count,
                    GROUP_CONCAT(DISTINCT
                        CASE
                            WHEN r.source_entity_id = e.id THEN t.name
                            ELSE s.name
                        END
                    ) as connected_names
                FROM entities e
                LEFT JOIN relationships r ON (e.id = r.source_entity_id OR e.id = r.target_entity_id)
                    AND r.strength > 0.1 AND r.invalid_at IS NULL
                LEFT JOIN entities s ON r.source_entity_id = s.id
                LEFT JOIN entities t ON r.target_entity_id = t.id
                WHERE e.importance > 0.1
            """
            params = []

            if entity_type:
                sql += " AND e.type = ?"
                params.append(entity_type)

            sql += """
                GROUP BY e.id
                HAVING connection_count >= ?
                ORDER BY connection_count DESC, e.importance DESC
                LIMIT ?
            """
            params.extend([min_connections, limit])

            rows = self.db.execute(sql, tuple(params), fetch=True) or []

            results = []
            for row in rows:
                connected_names = row["connected_names"].split(",") if row["connected_names"] else []
                results.append({
                    "id": row["id"],
                    "name": row["name"],
                    "type": row["type"],
                    "description": row["description"],
                    "importance": row["importance"],
                    "connection_count": row["connection_count"],
                    "top_connections": connected_names[:5],  # Top 5 connections
                })

            return results

        except Exception as e:
            logger.debug(f"Hub detection failed: {e}")
            return []

    def get_dormant_relationships(
        self,
        days: int = 60,
        min_strength: float = 0.3,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Find relationships with no recent activity.

        Identifies relationships that may need attention because there
        hasn't been any recent memory or interaction involving both entities.

        Args:
            days: Number of days without activity to consider dormant
            min_strength: Minimum relationship strength to include
            limit: Maximum results to return

        Returns:
            List of dicts with relationship info and days since last activity
        """
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

        try:
            # Find relationships where neither entity has recent memories
            rows = self.db.execute(
                """
                SELECT
                    r.id as relationship_id,
                    r.relationship_type,
                    r.strength,
                    r.created_at as relationship_created,
                    s.id as source_id, s.name as source_name, s.type as source_type,
                    t.id as target_id, t.name as target_name, t.type as target_type,
                    MAX(COALESCE(sm.created_at, '2000-01-01')) as source_last_memory,
                    MAX(COALESCE(tm.created_at, '2000-01-01')) as target_last_memory
                FROM relationships r
                JOIN entities s ON r.source_entity_id = s.id
                JOIN entities t ON r.target_entity_id = t.id
                LEFT JOIN memory_entities sme ON sme.entity_id = s.id
                LEFT JOIN memories sm ON sme.memory_id = sm.id
                LEFT JOIN memory_entities tme ON tme.entity_id = t.id
                LEFT JOIN memories tm ON tme.memory_id = tm.id
                WHERE r.strength >= ?
                  AND r.invalid_at IS NULL
                GROUP BY r.id
                HAVING MAX(source_last_memory) < ? AND MAX(target_last_memory) < ?
                ORDER BY r.strength DESC, source_last_memory ASC
                LIMIT ?
                """,
                (min_strength, cutoff, cutoff, limit),
                fetch=True,
            ) or []

            results = []
            now = datetime.utcnow()
            for row in rows:
                source_last = datetime.fromisoformat(row["source_last_memory"])
                target_last = datetime.fromisoformat(row["target_last_memory"])
                most_recent = max(source_last, target_last)
                days_dormant = (now - most_recent).days

                results.append({
                    "relationship_id": row["relationship_id"],
                    "relationship_type": row["relationship_type"],
                    "strength": row["strength"],
                    "source": {
                        "id": row["source_id"],
                        "name": row["source_name"],
                        "type": row["source_type"],
                    },
                    "target": {
                        "id": row["target_id"],
                        "name": row["target_name"],
                        "type": row["target_type"],
                    },
                    "days_dormant": days_dormant,
                    "last_activity": most_recent.isoformat(),
                })

            return results

        except Exception as e:
            logger.debug(f"Dormant relationship detection failed: {e}")
            return []

    def get_reflections(
        self,
        limit: int = 20,
        reflection_types: Optional[List[str]] = None,
        min_importance: float = 0.1,
        about_entity: Optional[str] = None,
    ) -> List[ReflectionResult]:
        """
        Get reflections with optional filtering.

        Args:
            limit: Maximum results to return
            reflection_types: Filter by types (observation, pattern, learning, question)
            min_importance: Minimum importance threshold
            about_entity: Filter to reflections about a specific entity

        Returns:
            List of ReflectionResult ordered by importance then recency
        """
        sql = """
            SELECT r.*, e.name as entity_name
            FROM reflections r
            LEFT JOIN entities e ON r.about_entity_id = e.id
            WHERE r.importance >= ?
        """
        params: list = [min_importance]

        if reflection_types:
            placeholders = ", ".join(["?" for _ in reflection_types])
            sql += f" AND r.reflection_type IN ({placeholders})"
            params.extend(reflection_types)

        if about_entity:
            canonical = self.extractor.canonical_name(about_entity)
            sql += " AND e.canonical_name = ?"
            params.append(canonical)

        sql += " ORDER BY r.importance DESC, r.last_confirmed_at DESC LIMIT ?"
        params.append(limit)

        rows = self.db.execute(sql, tuple(params), fetch=True) or []

        return [
            ReflectionResult(
                id=row["id"],
                content=row["content"],
                reflection_type=row["reflection_type"],
                importance=row["importance"],
                confidence=row["confidence"],
                about_entity=row["entity_name"],
                first_observed_at=row["first_observed_at"],
                last_confirmed_at=row["last_confirmed_at"],
                aggregation_count=row["aggregation_count"],
                episode_id=row["episode_id"],
                score=row["importance"],
            )
            for row in rows
        ]

    def get_active_reflections(
        self,
        limit: int = 5,
        min_importance: float = 0.6,
    ) -> List[ReflectionResult]:
        """
        Get high-value reflections for session context.

        These are reflections that should silently influence behavior at session start.
        Returns reflections ordered by importance then recency.

        Args:
            limit: Maximum results to return (default 5 for session context)
            min_importance: Minimum importance threshold (default 0.6)

        Returns:
            List of ReflectionResult ordered by importance then recency
        """
        rows = self.db.execute(
            """
            SELECT r.*, e.name as entity_name
            FROM reflections r
            LEFT JOIN entities e ON r.about_entity_id = e.id
            WHERE r.importance >= ?
            ORDER BY r.importance DESC, r.last_confirmed_at DESC
            LIMIT ?
            """,
            (min_importance, limit),
            fetch=True,
        ) or []

        return [
            ReflectionResult(
                id=row["id"],
                content=row["content"],
                reflection_type=row["reflection_type"],
                importance=row["importance"],
                confidence=row["confidence"],
                about_entity=row["entity_name"],
                first_observed_at=row["first_observed_at"],
                last_confirmed_at=row["last_confirmed_at"],
                aggregation_count=row["aggregation_count"],
                episode_id=row["episode_id"],
                score=row["importance"],
            )
            for row in rows
        ]

    def search_reflections(
        self,
        query: str,
        limit: int = 10,
        reflection_types: Optional[List[str]] = None,
    ) -> List[ReflectionResult]:
        """
        Semantic search for reflections.

        Uses vector similarity to find reflections relevant to a query.

        Args:
            query: What to search for
            limit: Maximum results
            reflection_types: Filter by types

        Returns:
            List of ReflectionResult ordered by relevance
        """
        query_embedding = embed_sync(query)

        results: List[ReflectionResult] = []

        if query_embedding:
            try:
                sql = """
                    SELECT r.*, e.name as entity_name, (1.0 / (1.0 + re.distance)) as vector_score
                    FROM reflection_embeddings re
                    JOIN reflections r ON r.id = re.reflection_id
                    LEFT JOIN entities e ON r.about_entity_id = e.id
                    WHERE re.embedding MATCH ?
                """
                params: list = [json.dumps(query_embedding)]

                if reflection_types:
                    placeholders = ", ".join(["?" for _ in reflection_types])
                    sql += f" AND r.reflection_type IN ({placeholders})"
                    params.extend(reflection_types)

                sql += " ORDER BY vector_score DESC LIMIT ?"
                params.append(limit)

                rows = self.db.execute(sql, tuple(params), fetch=True) or []

                for row in rows:
                    results.append(
                        ReflectionResult(
                            id=row["id"],
                            content=row["content"],
                            reflection_type=row["reflection_type"],
                            importance=row["importance"],
                            confidence=row["confidence"],
                            about_entity=row["entity_name"],
                            first_observed_at=row["first_observed_at"],
                            last_confirmed_at=row["last_confirmed_at"],
                            aggregation_count=row["aggregation_count"],
                            episode_id=row["episode_id"],
                            score=row["vector_score"],
                        )
                    )

            except Exception as e:
                logger.debug(f"Reflection vector search failed: {e}")

        # Fallback to keyword search if vector search failed or returned nothing
        if not results:
            sql = """
                SELECT r.*, e.name as entity_name
                FROM reflections r
                LEFT JOIN entities e ON r.about_entity_id = e.id
                WHERE r.content LIKE ?
            """
            params = [f"%{query}%"]

            if reflection_types:
                placeholders = ", ".join(["?" for _ in reflection_types])
                sql += f" AND r.reflection_type IN ({placeholders})"
                params.extend(reflection_types)

            sql += " ORDER BY r.importance DESC LIMIT ?"
            params.append(limit)

            rows = self.db.execute(sql, tuple(params), fetch=True) or []

            for row in rows:
                results.append(
                    ReflectionResult(
                        id=row["id"],
                        content=row["content"],
                        reflection_type=row["reflection_type"],
                        importance=row["importance"],
                        confidence=row["confidence"],
                        about_entity=row["entity_name"],
                        first_observed_at=row["first_observed_at"],
                        last_confirmed_at=row["last_confirmed_at"],
                        aggregation_count=row["aggregation_count"],
                        episode_id=row["episode_id"],
                        score=0.5,  # Default score for keyword match
                    )
                )

        return results

    def get_reflection_by_id(self, reflection_id: int) -> Optional[ReflectionResult]:
        """
        Get a single reflection by ID.

        Args:
            reflection_id: The reflection ID

        Returns:
            ReflectionResult or None if not found
        """
        row = self.db.get_one(
            "reflections r LEFT JOIN entities e ON r.about_entity_id = e.id",
            columns=["r.*", "e.name as entity_name"],
            where="r.id = ?",
            where_params=(reflection_id,),
        )

        if not row:
            return None

        return ReflectionResult(
            id=row["id"],
            content=row["content"],
            reflection_type=row["reflection_type"],
            importance=row["importance"],
            confidence=row["confidence"],
            about_entity=row["entity_name"],
            first_observed_at=row["first_observed_at"],
            last_confirmed_at=row["last_confirmed_at"],
            aggregation_count=row["aggregation_count"],
            episode_id=row["episode_id"],
            score=row["importance"],
        )

    def _keyword_search(
        self,
        query: str,
        limit: int,
        memory_types: Optional[List[str]] = None,
        min_importance: Optional[float] = None,
    ) -> List[Dict]:
        """Fallback keyword-based search. Tries FTS5 MATCH first, then LIKE."""
        # Try FTS5 first for better keyword matching
        try:
            sql = """
                SELECT m.*, GROUP_CONCAT(e.name) as entity_names
                FROM memories_fts fts
                JOIN memories m ON m.id = fts.rowid
                LEFT JOIN memory_entities me ON m.id = me.memory_id
                LEFT JOIN entities e ON me.entity_id = e.id
                WHERE memories_fts MATCH ?
                AND m.invalidated_at IS NULL
            """
            params: list = [query]

            if memory_types:
                placeholders = ", ".join(["?" for _ in memory_types])
                sql += f" AND m.type IN ({placeholders})"
                params.extend(memory_types)

            if min_importance is not None:
                sql += " AND m.importance >= ?"
                params.append(min_importance)

            sql += " GROUP BY m.id ORDER BY fts.rank LIMIT ?"
            params.append(limit)

            rows = self.db.execute(sql, tuple(params), fetch=True) or []
            if rows:
                return rows
        except Exception:
            pass  # FTS5 not available, fall through to LIKE

        # Final fallback: LIKE search
        sql = """
            SELECT m.*, GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE m.content LIKE ?
            AND m.invalidated_at IS NULL
        """
        params = [f"%{query}%"]

        if memory_types:
            placeholders = ", ".join(["?" for _ in memory_types])
            sql += f" AND m.type IN ({placeholders})"
            params.extend(memory_types)

        if min_importance is not None:
            sql += " AND m.importance >= ?"
            params.append(min_importance)

        sql += " GROUP BY m.id ORDER BY m.importance DESC, m.created_at DESC LIMIT ?"
        params.append(limit)

        return self.db.execute(sql, tuple(params), fetch=True) or []

    # ── Temporal recall methods ────────────────────────────────────

    def recall_upcoming_deadlines(
        self,
        days_ahead: int = 14,
        include_overdue: bool = True,
    ) -> List[RecallResult]:
        """Retrieve memories with upcoming deadlines, sorted by urgency.

        Returns overdue items first, then items due soonest.
        """
        now = datetime.utcnow()
        future = now + timedelta(days=days_ahead)

        conditions = ["m.deadline_at IS NOT NULL", "m.invalidated_at IS NULL"]
        params: list = []

        if include_overdue:
            conditions.append("m.deadline_at <= ?")
            params.append(future.strftime("%Y-%m-%d %H:%M:%S"))
        else:
            conditions.append("m.deadline_at BETWEEN ? AND ?")
            params.extend([
                now.strftime("%Y-%m-%d %H:%M:%S"),
                future.strftime("%Y-%m-%d %H:%M:%S"),
            ])

        where = " AND ".join(conditions)

        rows = self.db.execute(
            f"""
            SELECT m.*, GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE {where}
            GROUP BY m.id
            ORDER BY m.deadline_at ASC
            """,
            tuple(params),
            fetch=True,
        ) or []

        results = []
        for row in rows:
            deadline_str = row["deadline_at"] if "deadline_at" in row.keys() else None
            urgency = "later"
            if deadline_str:
                try:
                    deadline_dt = datetime.fromisoformat(deadline_str)
                    if deadline_dt < now:
                        urgency = "overdue"
                    elif deadline_dt < now + timedelta(days=1):
                        urgency = "today"
                    elif deadline_dt < now + timedelta(days=2):
                        urgency = "tomorrow"
                    elif deadline_dt < now + timedelta(days=7):
                        urgency = "this_week"
                except (ValueError, TypeError):
                    pass

            entity_str = row["entity_names"] if "entity_names" in row.keys() and row["entity_names"] else ""
            results.append(RecallResult(
                id=row["id"],
                content=row["content"],
                type=row["type"],
                score=row["importance"],
                importance=row["importance"],
                created_at=row["created_at"],
                entities=entity_str.split(",") if entity_str else [],
                metadata={"urgency": urgency, "deadline_at": deadline_str},
            ))

        return results

    def recall_since(
        self,
        since: str,
        entity_name: Optional[str] = None,
        limit: int = 50,
    ) -> List[RecallResult]:
        """Retrieve memories created or updated since a timestamp.

        Args:
            since: ISO datetime string (e.g. "2026-02-10T00:00:00")
            entity_name: Optional entity filter
            limit: Maximum results
        """
        conditions = [
            "(m.created_at >= ? OR m.updated_at >= ?)",
            "m.invalidated_at IS NULL",
        ]
        params: list = [since, since]

        if entity_name:
            conditions.append("""
                m.id IN (
                    SELECT me.memory_id FROM memory_entities me
                    JOIN entities e ON me.entity_id = e.id
                    WHERE e.canonical_name = ? OR e.name = ?
                )
            """)
            params.extend([entity_name.lower(), entity_name])

        where = " AND ".join(conditions)

        rows = self.db.execute(
            f"""
            SELECT m.*, GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE {where}
            GROUP BY m.id
            ORDER BY m.created_at DESC
            LIMIT ?
            """,
            tuple(params + [limit]),
            fetch=True,
        ) or []

        return [self._row_to_simple_result(row) for row in rows]

    def recall_temporal(
        self,
        query: str,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 20,
    ) -> List[RecallResult]:
        """Semantic search within a time window.

        Combines vector similarity with date range filtering.
        """
        # First get semantic results
        results = self.recall(query, limit=limit * 2)

        # Filter by date range
        filtered = []
        for r in results:
            created = r.created_at
            if not created:
                continue
            if date_from and created < date_from:
                continue
            if date_to and created > date_to:
                continue
            filtered.append(r)
            if len(filtered) >= limit:
                break

        return filtered

    def recall_timeline(
        self,
        entity_name: str,
        limit: int = 50,
    ) -> List[RecallResult]:
        """Temporal view of an entity: all memories sorted by time.

        Deadlines are highlighted in metadata.
        """
        rows = self.db.execute(
            """
            SELECT m.*, GROUP_CONCAT(e2.name) as entity_names
            FROM memories m
            JOIN memory_entities me ON m.id = me.memory_id
            JOIN entities e ON me.entity_id = e.id
            LEFT JOIN memory_entities me2 ON m.id = me2.memory_id
            LEFT JOIN entities e2 ON me2.entity_id = e2.id
            WHERE (e.canonical_name = ? OR e.name = ?)
              AND m.invalidated_at IS NULL
            GROUP BY m.id
            ORDER BY COALESCE(m.deadline_at, m.created_at) ASC
            LIMIT ?
            """,
            (entity_name.lower(), entity_name, limit),
            fetch=True,
        ) or []

        results = []
        for row in rows:
            r = self._row_to_simple_result(row)
            # Enrich metadata with deadline info
            row_keys = row.keys()
            if "deadline_at" in row_keys and row["deadline_at"]:
                r.metadata = r.metadata or {}
                r.metadata["deadline_at"] = row["deadline_at"]
                r.metadata["has_deadline"] = True
            results.append(r)

        return results

    def project_relationship_health(
        self,
        entity_name: str,
        days_ahead: int = 30,
    ) -> Dict[str, Any]:
        """Project when a relationship will go dormant based on current velocity.

        Uses contact_frequency_days and contact_trend to estimate
        future relationship state.

        Args:
            entity_name: Person entity to analyze
            days_ahead: How far ahead to project (default 30)

        Returns:
            Dict with projected_dormant_date, recommended_contact_date,
            risk_level, and current stats.
        """
        canonical = self.extractor.canonical_name(entity_name)
        entity = self.db.get_one(
            "entities",
            where="canonical_name = ? AND deleted_at IS NULL",
            where_params=(canonical,),
        )
        if not entity:
            return {"error": f"Entity '{entity_name}' not found"}

        entity_keys = entity.keys()
        last_contact = entity["last_contact_at"] if "last_contact_at" in entity_keys else None
        frequency = entity["contact_frequency_days"] if "contact_frequency_days" in entity_keys else None
        trend = (entity["contact_trend"] if "contact_trend" in entity_keys else None) or "unknown"

        # If no velocity data, return basic info
        if not last_contact or not frequency:
            return {
                "entity": entity["name"],
                "status": "insufficient_data",
                "trend": trend,
                "message": "Not enough contact history to project. Need at least 2 recorded interactions.",
            }

        try:
            last_dt = datetime.strptime(last_contact, "%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError):
            try:
                last_dt = datetime.fromisoformat(last_contact.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                return {"entity": entity["name"], "status": "parse_error"}

        now = datetime.utcnow()
        days_since = (now - last_dt).days

        # Dormancy threshold: 2x average frequency (matches consolidate.py logic)
        dormancy_threshold = frequency * 2.0

        # Apply trend modifiers for projection
        trend_multiplier = {
            "accelerating": 0.7,   # Contact happening faster, dormancy further away
            "stable": 1.0,
            "decelerating": 1.3,   # Contact slowing, dormancy approaching faster
            "dormant": 1.5,
        }.get(trend, 1.0)

        # Projected days until dormancy from last contact
        projected_days_to_dormancy = dormancy_threshold * trend_multiplier
        projected_dormant_date = last_dt + timedelta(days=projected_days_to_dormancy)

        # Recommended contact: at 1x frequency from last contact (or now if overdue)
        recommended_contact_date = last_dt + timedelta(days=frequency)
        if recommended_contact_date < now:
            recommended_contact_date = now  # Already overdue for contact

        # Risk level
        days_until_dormant = (projected_dormant_date - now).days
        if days_until_dormant <= 0:
            risk_level = "dormant"
        elif days_until_dormant <= 7:
            risk_level = "critical"
        elif days_until_dormant <= 14:
            risk_level = "high"
        elif days_until_dormant <= 30:
            risk_level = "medium"
        else:
            risk_level = "low"

        # Check for open commitments
        open_commitments = self.db.execute(
            """
            SELECT m.content FROM memories m
            JOIN memory_entities me ON m.id = me.memory_id
            WHERE me.entity_id = ?
              AND m.type = 'commitment'
              AND m.invalidated_at IS NULL
            ORDER BY m.importance DESC
            LIMIT 5
            """,
            (entity["id"],),
            fetch=True,
        ) or []

        result = {
            "entity": entity["name"],
            "days_since_contact": days_since,
            "contact_frequency_days": round(frequency, 1),
            "trend": trend,
            "attention_tier": entity["attention_tier"] if "attention_tier" in entity_keys else "standard",
            "projected_dormant_date": projected_dormant_date.strftime("%Y-%m-%d"),
            "days_until_dormant": max(0, days_until_dormant),
            "recommended_contact_date": recommended_contact_date.strftime("%Y-%m-%d"),
            "risk_level": risk_level,
            "open_commitments": [c["content"] for c in open_commitments],
        }

        return result

    def _row_to_simple_result(self, row) -> RecallResult:
        """Convert a database row to a RecallResult without scoring.

        Used by temporal recall methods that don't need vector/FTS scoring.
        """
        row_keys = row.keys()
        entity_str = row["entity_names"] if "entity_names" in row_keys and row["entity_names"] else ""
        metadata = None
        if "metadata" in row_keys and row["metadata"]:
            try:
                metadata = json.loads(row["metadata"])
            except (json.JSONDecodeError, TypeError):
                pass

        return RecallResult(
            id=row["id"],
            content=row["content"],
            type=row["type"],
            score=row["importance"],
            importance=row["importance"],
            created_at=row["created_at"],
            entities=entity_str.split(",") if entity_str else [],
            metadata=metadata,
            source=row["source"] if "source" in row_keys else None,
            source_context=row["source_context"] if "source_context" in row_keys else None,
            origin_type=row["origin_type"] if "origin_type" in row_keys else "inferred",
            confidence=row["confidence"] if "confidence" in row_keys else 1.0,
            source_channel=row["source_channel"] if "source_channel" in row_keys else None,
        )


# Global service instance
_service: Optional[RecallService] = None


def get_recall_service() -> RecallService:
    """Get or create the global recall service"""
    global _service
    if _service is None:
        _service = RecallService()
    return _service


# Convenience functions
def recall(query: str, **kwargs) -> List[RecallResult]:
    """Search memories"""
    return get_recall_service().recall(query, **kwargs)


def recall_about(entity_name: str, **kwargs) -> Dict[str, Any]:
    """Get everything about an entity"""
    return get_recall_service().recall_about(entity_name, **kwargs)


def search_entities(query: str, **kwargs) -> List[EntityResult]:
    """Search for entities"""
    return get_recall_service().search_entities(query, **kwargs)


def recall_episodes(query: str, **kwargs) -> List[Dict[str, Any]]:
    """Search episode narratives"""
    return get_recall_service().recall_episodes(query, **kwargs)


def fetch_by_ids(memory_ids: List[int]) -> List[RecallResult]:
    """Fetch specific memories by ID"""
    return get_recall_service().fetch_by_ids(memory_ids)


def trace_memory(memory_id: int) -> Dict[str, Any]:
    """Reconstruct full provenance for a memory"""
    return get_recall_service().trace_memory(memory_id)


def get_project_network(project_name: str) -> Dict[str, Any]:
    """Get all people and organizations connected to a project"""
    return get_recall_service().get_project_network(project_name)


def find_path(entity_a: str, entity_b: str, max_depth: int = 4) -> Optional[List[Dict[str, Any]]]:
    """Find shortest path between two entities"""
    return get_recall_service().find_path(entity_a, entity_b, max_depth)


def get_hub_entities(min_connections: int = 5, entity_type: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    """Find most connected entities in the graph"""
    return get_recall_service().get_hub_entities(min_connections, entity_type, limit)


def get_dormant_relationships(days: int = 60, min_strength: float = 0.3, limit: int = 20) -> List[Dict[str, Any]]:
    """Find relationships with no recent activity"""
    return get_recall_service().get_dormant_relationships(days, min_strength, limit)


def get_reflections(**kwargs) -> List[ReflectionResult]:
    """Get reflections with optional filtering"""
    return get_recall_service().get_reflections(**kwargs)


def search_reflections(query: str, **kwargs) -> List[ReflectionResult]:
    """Semantic search for reflections"""
    return get_recall_service().search_reflections(query, **kwargs)


def get_reflection_by_id(reflection_id: int) -> Optional[ReflectionResult]:
    """Get a single reflection by ID"""
    return get_recall_service().get_reflection_by_id(reflection_id)


def get_active_reflections(limit: int = 5, min_importance: float = 0.6) -> List[ReflectionResult]:
    """Get high-value reflections for session context"""
    return get_recall_service().get_active_reflections(limit, min_importance)


def find_duplicate_entities(threshold: float = 0.85, entity_type: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Find potential duplicate entities using fuzzy matching"""
    return get_recall_service().find_duplicate_entities(threshold, entity_type, limit)


def recall_upcoming_deadlines(days_ahead: int = 14, **kwargs) -> List[RecallResult]:
    """Get memories with upcoming deadlines"""
    return get_recall_service().recall_upcoming_deadlines(days_ahead, **kwargs)


def recall_since(since: str, **kwargs) -> List[RecallResult]:
    """Get memories since a timestamp"""
    return get_recall_service().recall_since(since, **kwargs)


def recall_temporal(query: str, **kwargs) -> List[RecallResult]:
    """Semantic search within a time window"""
    return get_recall_service().recall_temporal(query, **kwargs)


def recall_timeline(entity_name: str, **kwargs) -> List[RecallResult]:
    """Temporal view of an entity"""
    return get_recall_service().recall_timeline(entity_name, **kwargs)


def project_relationship_health(entity_name: str, days_ahead: int = 30) -> Dict[str, Any]:
    """Project when a relationship will go dormant"""
    return get_recall_service().project_relationship_health(entity_name, days_ahead)


def entity_overview(entity_names: List[str], **kwargs) -> Dict[str, Any]:
    """Generate community-style overview of entities"""
    return get_recall_service().entity_overview(entity_names, **kwargs)
