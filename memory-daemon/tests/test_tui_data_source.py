"""Tests for the Brain Monitor DataSource (read-only data layer)."""

import sqlite3
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database
from claudia_memory.tui.data_source import DataSource


@pytest.fixture
def db():
    """Create a temporary test database with schema initialized."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


@pytest.fixture
def ds(db):
    """Create a DataSource pointing at the test database."""
    source = DataSource(db_path=db.db_path)
    yield source
    source.close()


# ── Stats ─────────────────────────────────────────────────────────────


def test_get_stats_returns_counts(db, ds):
    """Stats returns correct counts for all core tables."""
    now = datetime.now().isoformat()

    # Insert test data
    db.insert("entities", {"name": "Alice", "type": "person", "created_at": now})
    db.insert("entities", {"name": "Acme", "type": "organization", "created_at": now})
    db.insert("memories", {
        "content": "Alice works at Acme",
        "content_hash": "hash1",
        "type": "fact",
        "importance": 0.8,
        "created_at": now,
    })
    db.insert("memories", {
        "content": "Alice likes coffee",
        "content_hash": "hash2",
        "type": "preference",
        "importance": 0.5,
        "created_at": now,
    })
    db.insert("relationships", {
        "source_entity_id": 1,
        "target_entity_id": 2,
        "relationship_type": "works_at",
        "created_at": now,
    })
    db.insert("episodes", {
        "session_id": "sess1",
        "started_at": now,
    })

    stats = ds.get_stats()

    assert stats["memories"] == 2
    assert stats["entities"] == 2
    assert stats["relationships"] == 1
    assert stats["episodes"] == 1
    assert stats["memories_today"] == 2
    assert stats["entities_today"] == 2


def test_get_stats_excludes_deleted_entities(db, ds):
    """Deleted entities are not counted."""
    now = datetime.now().isoformat()
    db.insert("entities", {
        "name": "Ghost",
        "type": "person",
        "created_at": now,
        "deleted_at": now,
        "deleted_reason": "test",
    })
    db.insert("entities", {"name": "Alive", "type": "person", "created_at": now})

    stats = ds.get_stats()
    assert stats["entities"] == 1


def test_get_stats_empty_database(ds):
    """Stats works on empty database with all zeros."""
    stats = ds.get_stats()
    assert stats["memories"] == 0
    assert stats["entities"] == 0
    assert stats["relationships"] == 0
    assert stats["episodes"] == 0


# ── Activity Timeseries ───────────────────────────────────────────────


def test_get_activity_timeseries(db, ds):
    """Timeseries returns bucketed write/read/link counts."""
    now = datetime.now()
    recent = (now - timedelta(seconds=5)).isoformat()

    # Insert audit entries
    db.insert("audit_log", {
        "timestamp": recent,
        "operation": "mem_create",
        "user_initiated": 0,
    })
    db.insert("audit_log", {
        "timestamp": recent,
        "operation": "recall",
        "user_initiated": 0,
    })
    db.insert("audit_log", {
        "timestamp": recent,
        "operation": "relate",
        "user_initiated": 0,
    })

    ts = ds.get_activity_timeseries(window_seconds=60)

    assert "writes" in ts
    assert "reads" in ts
    assert "links" in ts
    assert len(ts["writes"]) == 20  # 60s / 3s = 20 buckets
    assert sum(ts["writes"]) >= 1
    assert sum(ts["reads"]) >= 1
    assert sum(ts["links"]) >= 1


def test_get_activity_timeseries_empty(ds):
    """Timeseries returns all zeros when no activity."""
    ts = ds.get_activity_timeseries()
    assert all(v == 0 for v in ts["writes"])
    assert all(v == 0 for v in ts["reads"])
    assert all(v == 0 for v in ts["links"])


# ── Memory Constellation ─────────────────────────────────────────────


def test_get_memory_constellation(db, ds):
    """Constellation returns memories with entity type and age."""
    now = datetime.now().isoformat()

    eid = db.insert("entities", {"name": "Bob", "type": "person", "created_at": now})
    mid = db.insert("memories", {
        "content": "Bob is friendly",
        "content_hash": "hash_bob",
        "type": "observation",
        "importance": 0.7,
        "created_at": now,
    })
    db.insert("memory_entities", {
        "memory_id": mid,
        "entity_id": eid,
        "relationship": "about",
    })

    constellation = ds.get_memory_constellation(limit=10)

    assert len(constellation) >= 1
    assert constellation[0]["entity_type"] == "person"
    assert constellation[0]["importance"] == 0.7
    assert constellation[0]["age_hours"] < 1  # Just created


def test_get_memory_constellation_unlinked(db, ds):
    """Memories without entity links show as 'unlinked'."""
    now = datetime.now().isoformat()
    db.insert("memories", {
        "content": "Standalone fact",
        "content_hash": "hash_standalone",
        "type": "fact",
        "importance": 0.5,
        "created_at": now,
    })

    constellation = ds.get_memory_constellation(limit=10)
    assert len(constellation) == 1
    assert constellation[0]["entity_type"] == "unlinked"


def test_get_memory_constellation_excludes_invalidated(db, ds):
    """Invalidated memories are excluded from constellation."""
    now = datetime.now().isoformat()
    db.insert("memories", {
        "content": "Valid memory",
        "content_hash": "hash_valid",
        "type": "fact",
        "importance": 0.5,
        "created_at": now,
    })
    db.insert("memories", {
        "content": "Invalid memory",
        "content_hash": "hash_invalid",
        "type": "fact",
        "importance": 0.5,
        "created_at": now,
        "invalidated_at": now,
        "invalidated_reason": "test",
    })

    constellation = ds.get_memory_constellation(limit=10)
    assert len(constellation) == 1


# ── Importance Histogram ──────────────────────────────────────────────


def test_get_importance_histogram(db, ds):
    """Histogram returns 30 buckets with correct distribution."""
    now = datetime.now().isoformat()

    # Insert memories with varied importance
    for i, imp in enumerate([0.1, 0.3, 0.5, 0.7, 0.9, 0.95]):
        db.insert("memories", {
            "content": f"Memory {i}",
            "content_hash": f"hash_{i}",
            "type": "fact",
            "importance": imp,
            "created_at": now,
        })

    histogram = ds.get_importance_histogram(buckets=30)

    assert len(histogram) == 30
    assert sum(histogram) == 6  # 6 memories total


def test_get_importance_histogram_empty(ds):
    """Histogram returns all zeros on empty database."""
    histogram = ds.get_importance_histogram()
    assert len(histogram) == 30
    assert sum(histogram) == 0


# ── Memory Type Counts ────────────────────────────────────────────────


def test_get_memory_type_counts(db, ds):
    """Type counts returns correct breakdown by memory type."""
    now = datetime.now().isoformat()

    for mtype, count in [("fact", 3), ("preference", 2), ("observation", 1)]:
        for i in range(count):
            db.insert("memories", {
                "content": f"{mtype} {i}",
                "content_hash": f"hash_{mtype}_{i}",
                "type": mtype,
                "importance": 0.5,
                "created_at": now,
            })

    counts = ds.get_memory_type_counts()
    assert counts["fact"] == 3
    assert counts["preference"] == 2
    assert counts["observation"] == 1


# ── Health ────────────────────────────────────────────────────────────


def test_get_health_daemon_down(ds):
    """Health returns offline status when daemon is not running."""
    with patch("httpx.get", side_effect=Exception("Connection refused")):
        health = ds.get_health()

    assert health["online"] is False
    assert health["daemon"] == "offline"
    assert "database" in health["components"]


def test_get_health_daemon_up(ds):
    """Health returns online status when daemon responds."""
    mock_response = {
        "status": "healthy",
        "components": {
            "database": "ok",
            "embeddings": "ok",
            "scheduler": "running",
        },
    }

    class MockResponse:
        status_code = 200
        def json(self):
            return mock_response

    with patch("httpx.get", return_value=MockResponse()):
        health = ds.get_health()

    assert health["online"] is True
    assert health["daemon"] == "healthy"
    assert health["components"]["database"] == "ok"


# ── Read-Only Connection ──────────────────────────────────────────────


def test_readonly_connection(ds):
    """DataSource connection rejects write operations."""
    # Attempting to write should fail
    with pytest.raises(sqlite3.OperationalError):
        conn = ds._get_conn()
        conn.execute("INSERT INTO entities (name, type) VALUES ('test', 'person')")


# ── Database Size ─────────────────────────────────────────────────────


def test_get_db_size(ds):
    """Database size returns a human-readable string."""
    size = ds.get_db_size()
    assert isinstance(size, str)
    assert size != "unknown"
    # Should have a unit
    assert any(unit in size for unit in ["B", "KB", "MB"])
