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
        )

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

        # Get relationships
        rel_sql = """
            SELECT r.*,
                   s.name as source_name, s.type as source_type,
                   t.name as target_name, t.type as target_type
            FROM relationships r
            JOIN entities s ON r.source_entity_id = s.id
            JOIN entities t ON r.target_entity_id = t.id
            WHERE r.source_entity_id = ? OR r.target_entity_id = ?
            ORDER BY r.strength DESC
        """
        rel_rows = self.db.execute(rel_sql, (entity["id"], entity["id"]), fetch=True) or []

        relationships = [
            {
                "type": row["relationship_type"],
                "direction": row["direction"],
                "strength": row["strength"],
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
            for row in rel_rows
        ]

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

        # 4. Check for source material file on disk
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

        return result

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
