"""
Metrics Service for Claudia Memory System

Tracks system health and improvement over time.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from ..database import get_db

logger = logging.getLogger(__name__)


class MetricsService:
    """Track system health and quality metrics"""

    def __init__(self):
        self.db = get_db()

    def record(
        self,
        name: str,
        value: float,
        dimensions: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        Record a metric value.

        Args:
            name: Metric name (e.g., 'entity_count', 'memory_avg_importance')
            value: Metric value
            dimensions: Optional key-value pairs for filtering

        Returns:
            Metric entry ID
        """
        entry_id = self.db.insert(
            "metrics",
            {
                "timestamp": datetime.utcnow().isoformat(),
                "metric_name": name,
                "metric_value": value,
                "dimensions": json.dumps(dimensions) if dimensions else None,
            },
        )
        logger.debug(f"Metric recorded: {name}={value}")
        return entry_id

    def collect_system_health(self) -> Dict[str, Any]:
        """
        Collect current system health metrics.

        Returns a snapshot of entity counts, memory stats, reflection stats,
        prediction engagement, and data quality indicators.

        Returns:
            Dict with current health metrics
        """
        health = {
            "collected_at": datetime.utcnow().isoformat(),
            "entities": {},
            "memories": {},
            "reflections": {},
            "predictions": {},
            "data_quality": {},
        }

        # Entity counts by type
        try:
            entity_rows = self.db.execute(
                """
                SELECT type, COUNT(*) as count
                FROM entities
                WHERE deleted_at IS NULL
                GROUP BY type
                """,
                fetch=True,
            ) or []
            for row in entity_rows:
                health["entities"][row["type"]] = row["count"]
            health["entities"]["total"] = sum(health["entities"].values())
        except Exception as e:
            logger.debug(f"Could not collect entity metrics: {e}")

        # Memory stats
        try:
            mem_row = self.db.execute(
                """
                SELECT
                    COUNT(*) as total,
                    AVG(importance) as avg_importance,
                    COUNT(CASE WHEN invalidated_at IS NOT NULL THEN 1 END) as invalidated,
                    COUNT(CASE WHEN corrected_at IS NOT NULL THEN 1 END) as corrected
                FROM memories
                """,
                fetch=True,
            )
            if mem_row:
                health["memories"] = {
                    "total": mem_row[0]["total"],
                    "avg_importance": round(mem_row[0]["avg_importance"] or 0, 3),
                    "invalidated": mem_row[0]["invalidated"],
                    "corrected": mem_row[0]["corrected"],
                }

            # Memory counts by type
            mem_type_rows = self.db.execute(
                """
                SELECT type, COUNT(*) as count
                FROM memories
                WHERE invalidated_at IS NULL
                GROUP BY type
                """,
                fetch=True,
            ) or []
            health["memories"]["by_type"] = {row["type"]: row["count"] for row in mem_type_rows}
        except Exception as e:
            logger.debug(f"Could not collect memory metrics: {e}")

        # Reflection stats
        try:
            ref_row = self.db.execute(
                """
                SELECT
                    COUNT(*) as total,
                    AVG(importance) as avg_importance,
                    AVG(aggregation_count) as avg_confirmations
                FROM reflections
                """,
                fetch=True,
            )
            if ref_row:
                health["reflections"] = {
                    "total": ref_row[0]["total"],
                    "avg_importance": round(ref_row[0]["avg_importance"] or 0, 3),
                    "avg_confirmations": round(ref_row[0]["avg_confirmations"] or 0, 1),
                }

            # By type
            ref_type_rows = self.db.execute(
                """
                SELECT reflection_type, COUNT(*) as count
                FROM reflections
                GROUP BY reflection_type
                """,
                fetch=True,
            ) or []
            health["reflections"]["by_type"] = {row["reflection_type"]: row["count"] for row in ref_type_rows}
        except Exception as e:
            logger.debug(f"Could not collect reflection metrics: {e}")

        # Prediction engagement rate
        try:
            pred_row = self.db.execute(
                """
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN is_shown = 1 THEN 1 END) as shown,
                    COUNT(CASE WHEN is_acted_on = 1 THEN 1 END) as acted_on
                FROM predictions
                """,
                fetch=True,
            )
            if pred_row:
                total = pred_row[0]["total"]
                shown = pred_row[0]["shown"]
                acted = pred_row[0]["acted_on"]
                health["predictions"] = {
                    "total": total,
                    "shown": shown,
                    "acted_on": acted,
                    "engagement_rate": round(acted / shown, 3) if shown > 0 else 0,
                }
        except Exception as e:
            logger.debug(f"Could not collect prediction metrics: {e}")

        # Data quality indicators
        try:
            # Potential duplicates count (using name similarity > 0.85)
            # This is expensive so we just count entities without the full comparison
            entity_count = health["entities"].get("total", 0)

            # Orphan memories (no entity links)
            orphan_row = self.db.execute(
                """
                SELECT COUNT(*) as count
                FROM memories m
                WHERE NOT EXISTS (
                    SELECT 1 FROM memory_entities me WHERE me.memory_id = m.id
                )
                AND m.invalidated_at IS NULL
                """,
                fetch=True,
            )
            orphan_count = orphan_row[0]["count"] if orphan_row else 0

            # Stale entities (no activity in 90 days)
            stale_cutoff = (datetime.utcnow() - timedelta(days=90)).isoformat()
            stale_row = self.db.execute(
                """
                SELECT COUNT(*) as count
                FROM entities
                WHERE updated_at < ? AND deleted_at IS NULL
                """,
                (stale_cutoff,),
                fetch=True,
            )
            stale_count = stale_row[0]["count"] if stale_row else 0

            health["data_quality"] = {
                "orphan_memories": orphan_count,
                "stale_entities": stale_count,
                "entities_needing_review": stale_count,
            }
        except Exception as e:
            logger.debug(f"Could not collect data quality metrics: {e}")

        return health

    def get_trend(
        self,
        metric_name: str,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """
        Get metric values over time.

        Args:
            metric_name: Name of the metric
            days: Number of days to look back

        Returns:
            List of {timestamp, value} ordered by time
        """
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        rows = self.db.execute(
            """
            SELECT timestamp, metric_value, dimensions
            FROM metrics
            WHERE metric_name = ? AND timestamp > ?
            ORDER BY timestamp ASC
            """,
            (metric_name, cutoff),
            fetch=True,
        ) or []
        return [
            {
                "timestamp": row["timestamp"],
                "value": row["metric_value"],
                "dimensions": json.loads(row["dimensions"]) if row["dimensions"] else None,
            }
            for row in rows
        ]

    def collect_and_store(self) -> Dict[str, Any]:
        """
        Collect health metrics and store them.

        Called by scheduler for daily metrics collection.

        Returns:
            The collected health metrics
        """
        health = self.collect_system_health()

        # Store key metrics for trend tracking
        self.record("entities_total", health["entities"].get("total", 0))
        self.record("memories_total", health["memories"].get("total", 0))
        self.record("memories_avg_importance", health["memories"].get("avg_importance", 0))
        self.record("reflections_total", health["reflections"].get("total", 0))
        self.record("predictions_engagement_rate", health["predictions"].get("engagement_rate", 0))
        self.record("orphan_memories", health["data_quality"].get("orphan_memories", 0))
        self.record("stale_entities", health["data_quality"].get("stale_entities", 0))

        logger.info("Daily metrics collected and stored")
        return health


# Global service instance
_service: Optional[MetricsService] = None


def get_metrics_service() -> MetricsService:
    """Get or create the global metrics service"""
    global _service
    if _service is None:
        _service = MetricsService()
    return _service


# Convenience functions
def record_metric(name: str, value: float, **kwargs) -> int:
    """Record a metric value"""
    return get_metrics_service().record(name, value, **kwargs)


def get_system_health() -> Dict[str, Any]:
    """Collect current system health metrics"""
    return get_metrics_service().collect_system_health()


def get_metric_trend(metric_name: str, days: int = 30) -> List[Dict[str, Any]]:
    """Get metric values over time"""
    return get_metrics_service().get_trend(metric_name, days)


def collect_daily_metrics() -> Dict[str, Any]:
    """Collect and store daily metrics"""
    return get_metrics_service().collect_and_store()
