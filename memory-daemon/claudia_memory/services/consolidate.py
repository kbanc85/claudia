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
            predictions.append(
                Prediction(
                    content=pattern["description"],
                    prediction_type="suggestion",
                    priority=pattern["confidence"],
                    expires_at=datetime.utcnow() + timedelta(days=7),
                    metadata={"pattern_id": pattern["id"]},
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
                predictions.append(
                    Prediction(
                        content=f"Commitment from {days_old} days ago: {commitment['content'][:100]}",
                        prediction_type="reminder",
                        priority=min(1.0, 0.5 + days_old / 14),
                        expires_at=datetime.utcnow() + timedelta(days=2),
                        metadata={"memory_id": commitment["id"]},
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
                predictions.append(
                    Prediction(
                        content=f"Pattern noticed: {pattern['description']}",
                        prediction_type="insight",
                        priority=pattern["confidence"] * 0.8,
                        expires_at=datetime.utcnow() + timedelta(days=14),
                        metadata={"pattern_id": pattern["id"]},
                    )
                )

        return predictions

    def _store_prediction(self, prediction: Prediction) -> int:
        """Store a prediction in the database"""
        return self.db.insert(
            "predictions",
            {
                "content": prediction.content,
                "prediction_type": prediction.prediction_type,
                "priority": prediction.priority,
                "expires_at": prediction.expires_at.isoformat() if prediction.expires_at else None,
                "is_shown": 0,
                "is_acted_on": 0,
                "created_at": datetime.utcnow().isoformat(),
                "metadata": json.dumps(prediction.metadata) if prediction.metadata else None,
            },
        )

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
