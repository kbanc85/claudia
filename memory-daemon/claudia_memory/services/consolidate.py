"""
Consolidation Service for Claudia Memory System

Handles memory decay, pattern detection, and prediction generation.
Runs on a schedule (typically overnight) to maintain memory health.
"""

import json
import logging
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from ..config import get_config
from ..database import get_db

logger = logging.getLogger(__name__)


def _cosine_similarity(a: list, b: list) -> float:
    """Pure Python cosine similarity between two vectors."""
    if len(a) != len(b) or len(a) == 0:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


@dataclass
class DetectedPattern:
    """A pattern detected in the user's behavior or data"""

    name: str
    description: str
    pattern_type: str  # behavioral, communication, scheduling, relationship
    confidence: float
    evidence: List[str]


@dataclass
class Prediction:
    """A proactive suggestion or warning"""

    content: str
    prediction_type: str  # reminder, suggestion, warning, insight
    priority: float
    expires_at: Optional[datetime]
    metadata: Optional[Dict] = None
    pattern_name: Optional[str] = None


class ConsolidateService:
    """Memory consolidation and analysis"""

    def __init__(self):
        self.db = get_db()
        self.config = get_config()

    def run_decay(self) -> Dict[str, int]:
        """
        Apply importance decay to memories and entities.
        Never deletes, just reduces importance over time.

        Returns:
            Dict with counts of affected records
        """
        decay_rate = self.config.decay_rate_daily

        # Decay memories
        memory_result = self.db.execute(
            """
            UPDATE memories
            SET importance = importance * ?,
                updated_at = ?
            WHERE importance > ?
            """,
            (decay_rate, datetime.utcnow().isoformat(), self.config.min_importance_threshold / 10),
        )

        # Decay entities
        entity_result = self.db.execute(
            """
            UPDATE entities
            SET importance = importance * ?,
                updated_at = ?
            WHERE importance > ?
            """,
            (decay_rate, datetime.utcnow().isoformat(), self.config.min_importance_threshold / 10),
        )

        # Decay relationship strengths
        rel_result = self.db.execute(
            """
            UPDATE relationships
            SET strength = strength * ?,
                updated_at = ?
            WHERE strength > 0.01
            """,
            (decay_rate, datetime.utcnow().isoformat()),
        )

        logger.info(
            f"Decay applied: decay_rate={decay_rate}"
        )

        return {
            "memories_decayed": self.db.execute(
                "SELECT changes()", fetch=True
            )[0][0] if self.db.execute("SELECT changes()", fetch=True) else 0,
        }

    def boost_accessed_memories(self) -> int:
        """
        Boost importance of recently accessed memories (rehearsal effect).
        Memories accessed in the last 24 hours get a small importance boost.
        """
        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        boost_factor = 1.05  # 5% boost per access

        self.db.execute(
            """
            UPDATE memories
            SET importance = MIN(1.0, importance * ?),
                updated_at = ?
            WHERE last_accessed_at >= ?
            """,
            (boost_factor, datetime.utcnow().isoformat(), cutoff),
        )

        result = self.db.execute("SELECT changes()", fetch=True)
        count = result[0][0] if result else 0
        logger.debug(f"Boosted {count} recently accessed memories")
        return count

    def detect_patterns(self) -> List[DetectedPattern]:
        """
        Analyze memories and entities to detect behavioral patterns.

        Returns:
            List of newly detected or updated patterns
        """
        patterns = []

        # Detect relationship cooling
        cooling = self._detect_cooling_relationships()
        patterns.extend(cooling)

        # Detect commitment patterns
        commitment_patterns = self._detect_commitment_patterns()
        patterns.extend(commitment_patterns)

        # Detect communication patterns
        comm_patterns = self._detect_communication_patterns()
        patterns.extend(comm_patterns)

        # Detect cross-entity patterns (co-mentioned people without explicit relationships)
        cross_patterns = self._detect_cross_entity_patterns()
        patterns.extend(cross_patterns)

        # Store detected patterns
        for pattern in patterns:
            self._store_pattern(pattern)

        logger.info(f"Detected {len(patterns)} patterns")
        return patterns

    def _detect_cooling_relationships(self) -> List[DetectedPattern]:
        """Detect relationships that haven't been mentioned recently"""
        patterns = []

        # Find entities that were important but haven't been mentioned in 30+ days
        cutoff_30 = (datetime.utcnow() - timedelta(days=30)).isoformat()
        cutoff_60 = (datetime.utcnow() - timedelta(days=60)).isoformat()

        sql = """
            SELECT e.id, e.name, e.type, e.importance,
                   MAX(m.created_at) as last_mention
            FROM entities e
            LEFT JOIN memory_entities me ON e.id = me.entity_id
            LEFT JOIN memories m ON me.memory_id = m.id
            WHERE e.type = 'person'
            AND e.importance > 0.3
            GROUP BY e.id
            HAVING last_mention < ? OR last_mention IS NULL
            ORDER BY e.importance DESC
            LIMIT 20
        """

        rows = self.db.execute(sql, (cutoff_30,), fetch=True) or []

        for row in rows:
            days_since = None
            if row["last_mention"]:
                last_dt = datetime.fromisoformat(row["last_mention"])
                days_since = (datetime.utcnow() - last_dt).days

            severity = "warning" if days_since and days_since > 60 else "observation"

            patterns.append(
                DetectedPattern(
                    name=f"cooling_relationship_{row['id']}",
                    description=f"No contact with {row['name']} in {days_since or 'many'} days",
                    pattern_type="relationship",
                    confidence=min(0.9, 0.5 + (days_since or 30) / 100),
                    evidence=[f"Last mention: {row['last_mention'] or 'never'}"],
                )
            )

        return patterns

    def _detect_commitment_patterns(self) -> List[DetectedPattern]:
        """Detect patterns in commitments (overdue, frequently delayed, etc.)"""
        patterns = []

        # Find overdue commitments
        now = datetime.utcnow().isoformat()

        overdue = self.db.execute(
            """
            SELECT COUNT(*) as count FROM memories
            WHERE type = 'commitment'
            AND importance > 0.5
            AND created_at < ?
            """,
            ((datetime.utcnow() - timedelta(days=7)).isoformat(),),
            fetch=True,
        )

        if overdue and overdue[0]["count"] > 3:
            patterns.append(
                DetectedPattern(
                    name="overdue_commitments",
                    description=f"{overdue[0]['count']} commitments older than 7 days may be overdue",
                    pattern_type="behavioral",
                    confidence=0.7,
                    evidence=["Multiple old commitments detected"],
                )
            )

        return patterns

    def _detect_cross_entity_patterns(self) -> List[DetectedPattern]:
        """Detect person entities that co-occur in memories but have no explicit relationship."""
        patterns = []

        try:
            # Find pairs of person entities that appear together in 2+ memories
            co_mentions = self.db.execute(
                """
                SELECT
                    e1.id as id1, e1.name as name1,
                    e2.id as id2, e2.name as name2,
                    COUNT(DISTINCT me1.memory_id) as co_count
                FROM memory_entities me1
                JOIN memory_entities me2 ON me1.memory_id = me2.memory_id AND me1.entity_id < me2.entity_id
                JOIN entities e1 ON me1.entity_id = e1.id AND e1.type = 'person'
                JOIN entities e2 ON me2.entity_id = e2.id AND e2.type = 'person'
                GROUP BY me1.entity_id, me2.entity_id
                HAVING co_count >= 2
                ORDER BY co_count DESC
                LIMIT 20
                """,
                fetch=True,
            ) or []

            for row in co_mentions:
                # Check if a relationship already exists between them
                existing = self.db.get_one(
                    "relationships",
                    where="(source_entity_id = ? AND target_entity_id = ?) OR (source_entity_id = ? AND target_entity_id = ?)",
                    where_params=(row["id1"], row["id2"], row["id2"], row["id1"]),
                )
                if existing:
                    continue

                co_count = row["co_count"]
                confidence = min(0.9, 0.4 + co_count * 0.1)

                patterns.append(
                    DetectedPattern(
                        name=f"cross_entity_{row['id1']}_{row['id2']}",
                        description=f"{row['name1']} and {row['name2']} appear together in {co_count} memories. Are they connected?",
                        pattern_type="relationship",
                        confidence=confidence,
                        evidence=[f"Co-mentioned in {co_count} memories"],
                    )
                )

        except Exception as e:
            logger.debug(f"Cross-entity detection failed: {e}")

        return patterns

    def _detect_communication_patterns(self) -> List[DetectedPattern]:
        """Detect communication style patterns"""
        patterns = []

        # Analyze message lengths and types
        recent_messages = self.db.execute(
            """
            SELECT role, LENGTH(content) as msg_length
            FROM messages
            WHERE created_at >= ?
            ORDER BY created_at DESC
            LIMIT 100
            """,
            ((datetime.utcnow() - timedelta(days=7)).isoformat(),),
            fetch=True,
        ) or []

        if len(recent_messages) >= 20:
            user_msgs = [m for m in recent_messages if m["role"] == "user"]
            if user_msgs:
                avg_length = sum(m["msg_length"] for m in user_msgs) / len(user_msgs)

                if avg_length < 50:
                    patterns.append(
                        DetectedPattern(
                            name="brief_communication_style",
                            description="User tends to communicate in brief messages",
                            pattern_type="communication",
                            confidence=0.6,
                            evidence=[f"Average message length: {avg_length:.0f} characters"],
                        )
                    )
                elif avg_length > 200:
                    patterns.append(
                        DetectedPattern(
                            name="detailed_communication_style",
                            description="User tends to provide detailed context",
                            pattern_type="communication",
                            confidence=0.6,
                            evidence=[f"Average message length: {avg_length:.0f} characters"],
                        )
                    )

        return patterns

    def _store_pattern(self, pattern: DetectedPattern) -> int:
        """Store or update a detected pattern"""
        existing = self.db.get_one(
            "patterns", where="name = ?", where_params=(pattern.name,)
        )

        if existing:
            # Update existing pattern
            new_occurrences = existing["occurrences"] + 1
            new_confidence = min(1.0, (existing["confidence"] + pattern.confidence) / 2)

            self.db.update(
                "patterns",
                {
                    "occurrences": new_occurrences,
                    "confidence": new_confidence,
                    "last_observed_at": datetime.utcnow().isoformat(),
                    "evidence": json.dumps(pattern.evidence),
                },
                "id = ?",
                (existing["id"],),
            )
            return existing["id"]
        else:
            # Create new pattern
            return self.db.insert(
                "patterns",
                {
                    "name": pattern.name,
                    "description": pattern.description,
                    "pattern_type": pattern.pattern_type,
                    "occurrences": 1,
                    "confidence": pattern.confidence,
                    "first_observed_at": datetime.utcnow().isoformat(),
                    "last_observed_at": datetime.utcnow().isoformat(),
                    "evidence": json.dumps(pattern.evidence),
                    "is_active": 1,
                },
            )

    def generate_predictions(self) -> List[Prediction]:
        """
        Generate proactive suggestions based on patterns and data.

        Returns:
            List of predictions/suggestions
        """
        predictions = []

        # Generate relationship reconnection suggestions
        reconnect = self._generate_reconnect_predictions()
        predictions.extend(reconnect)

        # Generate commitment reminders
        reminders = self._generate_commitment_reminders()
        predictions.extend(reminders)

        # Generate pattern-based insights
        insights = self._generate_pattern_insights()
        predictions.extend(insights)

        # Store predictions
        for pred in predictions:
            self._store_prediction(pred)

        logger.info(f"Generated {len(predictions)} predictions")
        return predictions

    def _generate_reconnect_predictions(self) -> List[Prediction]:
        """Suggest people to reconnect with"""
        predictions = []

        # Find cooling relationships from patterns
        cooling_patterns = self.db.query(
            "patterns",
            where="pattern_type = ? AND is_active = 1 AND confidence > 0.5",
            where_params=("relationship",),
            order_by="confidence DESC",
            limit=5,
        )

        for pattern in cooling_patterns:
            feedback = self._get_pattern_feedback("suggestion", pattern["name"])
            predictions.append(
                Prediction(
                    content=pattern["description"],
                    prediction_type="suggestion",
                    priority=pattern["confidence"] * feedback,
                    expires_at=datetime.utcnow() + timedelta(days=7),
                    metadata={"pattern_id": pattern["id"]},
                    pattern_name=pattern["name"],
                )
            )

        return predictions

    def _generate_commitment_reminders(self) -> List[Prediction]:
        """Generate reminders for commitments"""
        predictions = []

        # Find old commitments that might need attention
        old_commitments = self.db.query(
            "memories",
            where="type = 'commitment' AND importance > 0.3",
            order_by="created_at ASC",
            limit=5,
        )

        for commitment in old_commitments:
            created = datetime.fromisoformat(commitment["created_at"])
            days_old = (datetime.utcnow() - created).days

            if days_old > 3:
                pattern_name = f"commitment_reminder_{commitment['id']}"
                feedback = self._get_pattern_feedback("reminder", pattern_name)
                predictions.append(
                    Prediction(
                        content=f"Commitment from {days_old} days ago: {commitment['content'][:100]}",
                        prediction_type="reminder",
                        priority=min(1.0, 0.5 + days_old / 14) * feedback,
                        expires_at=datetime.utcnow() + timedelta(days=2),
                        metadata={"memory_id": commitment["id"]},
                        pattern_name=pattern_name,
                    )
                )

        return predictions

    def _generate_pattern_insights(self) -> List[Prediction]:
        """Generate insights from detected patterns"""
        predictions = []

        # Find high-confidence active patterns
        patterns = self.db.query(
            "patterns",
            where="is_active = 1 AND confidence > 0.7 AND occurrences > 2",
            order_by="confidence DESC",
            limit=3,
        )

        for pattern in patterns:
            if pattern["pattern_type"] == "behavioral":
                feedback = self._get_pattern_feedback("insight", pattern["name"])
                predictions.append(
                    Prediction(
                        content=f"Pattern noticed: {pattern['description']}",
                        prediction_type="insight",
                        priority=pattern["confidence"] * 0.8 * feedback,
                        expires_at=datetime.utcnow() + timedelta(days=14),
                        metadata={"pattern_id": pattern["id"]},
                        pattern_name=pattern["name"],
                    )
                )

        return predictions

    def _store_prediction(self, prediction: Prediction) -> int:
        """Store a prediction in the database"""
        data = {
            "content": prediction.content,
            "prediction_type": prediction.prediction_type,
            "priority": prediction.priority,
            "expires_at": prediction.expires_at.isoformat() if prediction.expires_at else None,
            "is_shown": 0,
            "is_acted_on": 0,
            "created_at": datetime.utcnow().isoformat(),
            "metadata": json.dumps(prediction.metadata) if prediction.metadata else None,
        }
        if prediction.pattern_name:
            data["prediction_pattern_name"] = prediction.pattern_name
        return self.db.insert("predictions", data)

    def get_predictions(
        self,
        limit: int = 10,
        prediction_types: Optional[List[str]] = None,
        include_shown: bool = False,
    ) -> List[Dict]:
        """
        Get active predictions for display.

        Args:
            limit: Maximum predictions to return
            prediction_types: Filter by types
            include_shown: Include already-shown predictions

        Returns:
            List of prediction dicts
        """
        sql = """
            SELECT * FROM predictions
            WHERE (expires_at IS NULL OR expires_at > ?)
        """
        params = [datetime.utcnow().isoformat()]

        if not include_shown:
            sql += " AND is_shown = 0"

        if prediction_types:
            placeholders = ", ".join(["?" for _ in prediction_types])
            sql += f" AND prediction_type IN ({placeholders})"
            params.extend(prediction_types)

        sql += " ORDER BY priority DESC, created_at DESC LIMIT ?"
        params.append(limit)

        rows = self.db.execute(sql, tuple(params), fetch=True) or []

        return [dict(row) for row in rows]

    def mark_prediction_shown(self, prediction_id: int) -> None:
        """Mark a prediction as shown to the user"""
        self.db.update(
            "predictions",
            {"is_shown": 1, "shown_at": datetime.utcnow().isoformat()},
            "id = ?",
            (prediction_id,),
        )

    def mark_prediction_acted_on(self, prediction_id: int, acted_on: bool) -> None:
        """Mark a prediction as acted on (or not) by the user"""
        self.db.update(
            "predictions",
            {"is_acted_on": 1 if acted_on else 0},
            "id = ?",
            (prediction_id,),
        )

    def _get_pattern_feedback(self, prediction_type: str, pattern_name: str) -> float:
        """
        Return a priority multiplier based on past user engagement with similar predictions.

        Rules:
        - <5 shown predictions for this type: return 1.0 (insufficient data)
        - act_ratio < 0.1: return 0.5 (user ignores these, halve priority)
        - act_ratio > 0.5: return 1.25 (user values these, boost priority)
        - Otherwise: return 1.0 (neutral)
        """
        try:
            rows = self.db.execute(
                """
                SELECT COUNT(*) as total,
                       SUM(CASE WHEN is_acted_on = 1 THEN 1 ELSE 0 END) as acted
                FROM predictions
                WHERE prediction_type = ? AND is_shown = 1
                """,
                (prediction_type,),
                fetch=True,
            )
            if not rows:
                return 1.0

            total = rows[0]["total"] or 0
            acted = rows[0]["acted"] or 0

            if total < 5:
                return 1.0

            act_ratio = acted / total
            if act_ratio < 0.1:
                return 0.5
            elif act_ratio > 0.5:
                return 1.25
            return 1.0
        except Exception as e:
            logger.debug(f"Feedback lookup failed: {e}")
            return 1.0

    def merge_similar_memories(self) -> int:
        """
        Merge semantically similar memories during consolidation.
        Uses existing stored embeddings -- no new Ollama calls.

        Returns:
            Count of merged memory pairs
        """
        if not self.config.enable_memory_merging:
            return 0

        threshold = self.config.similarity_merge_threshold
        merged_count = 0

        try:
            # Find entities with 5+ linked memories (high-memory entities first)
            entity_rows = self.db.execute(
                """
                SELECT me.entity_id, COUNT(DISTINCT me.memory_id) as mem_count
                FROM memory_entities me
                GROUP BY me.entity_id
                HAVING mem_count >= 5
                ORDER BY mem_count DESC
                LIMIT 50
                """,
                fetch=True,
            ) or []

            for entity_row in entity_rows:
                entity_id = entity_row["entity_id"]

                # Load memory IDs and embeddings for this entity
                mem_rows = self.db.execute(
                    """
                    SELECT me.memory_id, m.importance, m.access_count,
                           emb.embedding
                    FROM memory_entities me
                    JOIN memories m ON me.memory_id = m.id
                    LEFT JOIN memory_embeddings emb ON m.id = emb.memory_id
                    WHERE me.entity_id = ?
                      AND m.importance > 0.01
                    ORDER BY m.importance DESC
                    """,
                    (entity_id,),
                    fetch=True,
                ) or []

                # Parse embeddings
                memories_with_emb = []
                for row in mem_rows:
                    if row["embedding"]:
                        try:
                            emb = json.loads(row["embedding"]) if isinstance(row["embedding"], str) else row["embedding"]
                            memories_with_emb.append({
                                "id": row["memory_id"],
                                "importance": row["importance"],
                                "access_count": row["access_count"] or 0,
                                "embedding": emb,
                            })
                        except (json.JSONDecodeError, TypeError):
                            continue

                if len(memories_with_emb) < 2:
                    continue

                # Pairwise cosine similarity
                already_merged = set()
                for i in range(len(memories_with_emb)):
                    if memories_with_emb[i]["id"] in already_merged:
                        continue
                    for j in range(i + 1, len(memories_with_emb)):
                        if memories_with_emb[j]["id"] in already_merged:
                            continue

                        sim = _cosine_similarity(
                            memories_with_emb[i]["embedding"],
                            memories_with_emb[j]["embedding"],
                        )
                        if sim >= threshold:
                            # Keep the one with higher importance * (1 + access_count)
                            score_i = memories_with_emb[i]["importance"] * (1 + memories_with_emb[i]["access_count"])
                            score_j = memories_with_emb[j]["importance"] * (1 + memories_with_emb[j]["access_count"])

                            if score_i >= score_j:
                                primary_id = memories_with_emb[i]["id"]
                                duplicate_id = memories_with_emb[j]["id"]
                            else:
                                primary_id = memories_with_emb[j]["id"]
                                duplicate_id = memories_with_emb[i]["id"]

                            self._merge_memory_pair(primary_id, duplicate_id)
                            already_merged.add(duplicate_id)
                            merged_count += 1

        except Exception as e:
            logger.warning(f"Memory merging failed: {e}")

        if merged_count > 0:
            logger.info(f"Merged {merged_count} near-duplicate memory pairs")
        return merged_count

    def _merge_memory_pair(self, primary_id: int, duplicate_id: int) -> None:
        """
        Merge a duplicate memory into the primary.

        - Transfers entity links from duplicate to primary
        - Adds merged_from to primary's metadata
        - Sets duplicate importance to 0.001
        """
        # Transfer entity links
        dup_links = self.db.execute(
            "SELECT entity_id, relationship FROM memory_entities WHERE memory_id = ?",
            (duplicate_id,),
            fetch=True,
        ) or []

        for link in dup_links:
            try:
                self.db.insert(
                    "memory_entities",
                    {
                        "memory_id": primary_id,
                        "entity_id": link["entity_id"],
                        "relationship": link["relationship"],
                    },
                )
            except Exception:
                pass  # Duplicate link, ignore

        # Update primary's metadata with merge info
        primary = self.db.get_one("memories", where="id = ?", where_params=(primary_id,))
        if primary:
            meta = json.loads(primary["metadata"] or "{}")
            merged_from = meta.get("merged_from", [])
            merged_from.append(duplicate_id)
            meta["merged_from"] = merged_from
            self.db.update(
                "memories",
                {"metadata": json.dumps(meta), "updated_at": datetime.utcnow().isoformat()},
                "id = ?",
                (primary_id,),
            )

        # Suppress duplicate (don't delete, just minimize importance)
        self.db.update(
            "memories",
            {"importance": 0.001, "updated_at": datetime.utcnow().isoformat()},
            "id = ?",
            (duplicate_id,),
        )

        logger.debug(f"Merged memory {duplicate_id} into {primary_id}")

    def run_full_consolidation(self) -> Dict[str, Any]:
        """
        Run complete consolidation: decay, patterns, predictions.
        Typically called overnight.
        """
        logger.info("Starting full consolidation")

        results = {}

        # Run decay
        results["decay"] = self.run_decay()

        # Boost accessed memories
        results["boosted"] = self.boost_accessed_memories()

        # Merge near-duplicate memories
        results["merged"] = self.merge_similar_memories()

        # Detect patterns
        patterns = self.detect_patterns()
        results["patterns_detected"] = len(patterns)

        # Generate predictions
        predictions = self.generate_predictions()
        results["predictions_generated"] = len(predictions)

        logger.info(f"Consolidation complete: {results}")
        return results


# Global service instance
_service: Optional[ConsolidateService] = None


def get_consolidate_service() -> ConsolidateService:
    """Get or create the global consolidate service"""
    global _service
    if _service is None:
        _service = ConsolidateService()
    return _service


# Convenience functions
def run_decay() -> Dict[str, int]:
    """Apply importance decay"""
    return get_consolidate_service().run_decay()


def detect_patterns() -> List[DetectedPattern]:
    """Detect behavioral patterns"""
    return get_consolidate_service().detect_patterns()


def generate_predictions() -> List[Prediction]:
    """Generate proactive suggestions"""
    return get_consolidate_service().generate_predictions()


def get_predictions(**kwargs) -> List[Dict]:
    """Get active predictions"""
    return get_consolidate_service().get_predictions(**kwargs)


def run_full_consolidation() -> Dict[str, Any]:
    """Run complete consolidation"""
    return get_consolidate_service().run_full_consolidation()
