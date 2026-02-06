"""
Read-only data source for the Brain Monitor.

Opens a separate read-only SQLite connection (bypassing the main Database singleton)
and provides query methods for all dashboard widgets.

Also polls the daemon health HTTP endpoint for liveness status.
"""

import logging
import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from ..config import MemoryConfig, get_config

logger = logging.getLogger(__name__)


class DataSource:
    """Read-only data layer for the Brain Monitor TUI.

    Opens its own read-only SQLite connection separate from the daemon's
    read-write connection. All queries are SELECT-only.
    """

    def __init__(self, db_path: Optional[Path] = None):
        config = get_config()
        self._db_path = db_path or config.db_path
        self._health_port = config.health_port
        self._conn: Optional[sqlite3.Connection] = None

    def _get_conn(self) -> sqlite3.Connection:
        """Get or create read-only connection."""
        if self._conn is None:
            uri = f"file:{self._db_path}?mode=ro"
            self._conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def close(self):
        """Close the connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    def _query(self, sql: str, params: Tuple = ()) -> List[sqlite3.Row]:
        """Execute a read-only query."""
        try:
            conn = self._get_conn()
            cursor = conn.execute(sql, params)
            return cursor.fetchall()
        except sqlite3.OperationalError as e:
            if "no such table" in str(e):
                return []
            raise

    def _query_one(self, sql: str, params: Tuple = ()) -> Optional[sqlite3.Row]:
        """Execute a query returning one row."""
        rows = self._query(sql, params)
        return rows[0] if rows else None

    def _scalar(self, sql: str, params: Tuple = ()) -> Any:
        """Execute a query returning a single value."""
        row = self._query_one(sql, params)
        return row[0] if row else None

    # ── Health ────────────────────────────────────────────────────────

    def get_health(self) -> Dict[str, Any]:
        """Poll daemon health endpoint.

        Returns dict with daemon/embeddings/scheduler status.
        Falls back gracefully when daemon is offline.
        """
        try:
            resp = httpx.get(
                f"http://localhost:{self._health_port}/status",
                timeout=0.5,
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "daemon": data.get("status", "unknown"),
                    "components": data.get("components", {}),
                    "online": True,
                }
        except (httpx.ConnectError, httpx.TimeoutException, Exception):
            pass

        return {
            "daemon": "offline",
            "components": {
                "database": "unknown",
                "embeddings": "unknown",
                "scheduler": "unknown",
            },
            "online": False,
        }

    # ── Stats ─────────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        """Get core counts with today's deltas."""
        today = datetime.now().strftime("%Y-%m-%d")

        total_memories = self._scalar("SELECT COUNT(*) FROM memories") or 0
        total_entities = self._scalar(
            "SELECT COUNT(*) FROM entities WHERE deleted_at IS NULL"
        ) or 0
        total_relationships = self._scalar("SELECT COUNT(*) FROM relationships") or 0
        total_episodes = self._scalar("SELECT COUNT(*) FROM episodes") or 0
        total_patterns = self._scalar(
            "SELECT COUNT(*) FROM patterns WHERE is_active = 1"
        ) or 0
        total_reflections = self._scalar("SELECT COUNT(*) FROM reflections") or 0

        # Today's deltas
        memories_today = self._scalar(
            "SELECT COUNT(*) FROM memories WHERE created_at >= ?", (today,)
        ) or 0
        entities_today = self._scalar(
            "SELECT COUNT(*) FROM entities WHERE created_at >= ? AND deleted_at IS NULL",
            (today,),
        ) or 0

        return {
            "memories": total_memories,
            "entities": total_entities,
            "relationships": total_relationships,
            "episodes": total_episodes,
            "patterns": total_patterns,
            "reflections": total_reflections,
            "memories_today": memories_today,
            "entities_today": entities_today,
        }

    # ── Activity timeseries (for Neural Pulse) ────────────────────────

    def get_activity_timeseries(self, window_seconds: int = 60) -> Dict[str, List[int]]:
        """Get operation counts bucketed into 3-second intervals.

        Returns dict with 'writes', 'reads', 'links' lists (20 values each
        for a 60-second window).
        """
        now = datetime.now()
        cutoff = (now - timedelta(seconds=window_seconds)).isoformat()
        buckets = window_seconds // 3

        # Classify operations
        write_ops = (
            "mem_create", "mem_correct", "mem_invalidate", "entity_new",
            "entity_update", "entity_merge", "entity_delete", "batch",
        )
        read_ops = (
            "recall", "recall_about", "search_entities", "session_context",
            "morning_context", "briefing",
        )
        link_ops = ("relate", "relate_update", "entity_link")

        rows = self._query(
            """
            SELECT timestamp, operation
            FROM audit_log
            WHERE timestamp >= ?
            ORDER BY timestamp ASC
            """,
            (cutoff,),
        )

        writes = [0] * buckets
        reads = [0] * buckets
        links = [0] * buckets

        for r in rows:
            try:
                ts = datetime.fromisoformat(r["timestamp"])
                delta = (ts - (now - timedelta(seconds=window_seconds))).total_seconds()
                bucket = min(int(delta / 3), buckets - 1)
                if bucket < 0:
                    continue
                op = r["operation"]
                if op in write_ops:
                    writes[bucket] += 1
                elif op in read_ops:
                    reads[bucket] += 1
                elif op in link_ops:
                    links[bucket] += 1
            except (ValueError, TypeError):
                continue

        return {"writes": writes, "reads": reads, "links": links}

    # ── Memory constellation ──────────────────────────────────────────

    def get_memory_constellation(self, limit: int = 200) -> List[Dict[str, Any]]:
        """Get recent memories with entity type info for the dot grid.

        Returns list of dicts with 'entity_type', 'importance', 'age_hours'.
        """
        rows = self._query(
            """
            SELECT m.id, m.importance, m.created_at,
                   COALESCE(e.type, 'unlinked') as entity_type
            FROM memories m
            LEFT JOIN memory_entities me ON me.memory_id = m.id
            LEFT JOIN entities e ON e.id = me.entity_id AND e.deleted_at IS NULL
            WHERE m.invalidated_at IS NULL
            GROUP BY m.id
            ORDER BY m.id DESC
            LIMIT ?
            """,
            (limit,),
        )

        now = datetime.now()
        result = []

        for r in rows:
            age_hours = 0.0
            try:
                created = datetime.fromisoformat(r["created_at"])
                age_hours = (now - created).total_seconds() / 3600
            except (ValueError, TypeError):
                pass

            result.append({
                "entity_type": r["entity_type"],
                "importance": r["importance"] or 0.5,
                "age_hours": age_hours,
            })

        return result

    # ── Importance histogram ──────────────────────────────────────────

    def get_importance_histogram(self, buckets: int = 30) -> List[float]:
        """Get importance distribution as a list of bucket counts.

        Divides importance range [0, 1] into N buckets and counts memories
        in each. Returns list of N floats for sparkline rendering.
        """
        rows = self._query(
            """
            SELECT importance FROM memories
            WHERE invalidated_at IS NULL AND importance IS NOT NULL
            """
        )

        histogram = [0.0] * buckets
        for r in rows:
            imp = r["importance"] or 0.0
            bucket = min(int(imp * buckets), buckets - 1)
            histogram[bucket] += 1.0

        return histogram

    # ── Memory type counts ────────────────────────────────────────────

    def get_memory_type_counts(self) -> Dict[str, int]:
        """Get memory counts grouped by type."""
        rows = self._query(
            """
            SELECT type, COUNT(*) as cnt
            FROM memories
            WHERE invalidated_at IS NULL
            GROUP BY type
            ORDER BY cnt DESC
            """
        )
        return {r["type"]: r["cnt"] for r in rows}

    # ── Database size ─────────────────────────────────────────────────

    def get_db_size(self) -> str:
        """Get human-readable database file size."""
        try:
            size = os.path.getsize(self._db_path)
            if size < 1024:
                return f"{size} B"
            elif size < 1024 * 1024:
                return f"{size / 1024:.1f} KB"
            else:
                return f"{size / (1024 * 1024):.1f} MB"
        except OSError:
            return "unknown"

    # ── Database age ─────────────────────────────────────────────────

    def get_db_age(self) -> Optional[str]:
        """Get human-readable database age from _meta or earliest episode."""
        # Try _meta created_at first
        row = self._query_one(
            "SELECT value FROM _meta WHERE key = 'created_at'"
        )
        if not row:
            # Fallback: earliest episode start time
            row = self._query_one(
                "SELECT started_at as value FROM episodes ORDER BY id ASC LIMIT 1"
            )
        if row and row["value"]:
            try:
                created = datetime.fromisoformat(row["value"])
                delta = datetime.now() - created
                days = delta.days
                hours = delta.seconds // 3600
                return f"{days}d {hours}h"
            except (ValueError, TypeError):
                pass
        return None
