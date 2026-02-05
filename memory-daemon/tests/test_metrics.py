"""Tests for metrics service"""

import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from claudia_memory.database import Database
from claudia_memory.services.metrics import MetricsService


@pytest.fixture
def db():
    """Create a temporary test database"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


@pytest.fixture
def metrics_service(db):
    """Create a metrics service with the test database"""
    svc = MetricsService.__new__(MetricsService)
    svc.db = db
    return svc


def _insert_entity(db, name, entity_type="person"):
    """Helper to insert an entity"""
    return db.insert("entities", {
        "name": name,
        "type": entity_type,
        "canonical_name": name.lower(),
        "importance": 1.0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _insert_memory(db, content, memory_type="fact", importance=0.7):
    """Helper to insert a memory"""
    from claudia_memory.database import content_hash
    return db.insert("memories", {
        "content": content,
        "content_hash": content_hash(content),
        "type": memory_type,
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def test_record_metric_basic(metrics_service, db):
    """Basic metric recording works"""
    entry_id = metrics_service.record("test_metric", 42.5)

    assert entry_id > 0

    row = db.get_one("metrics", where="id = ?", where_params=(entry_id,))
    assert row is not None
    assert row["metric_name"] == "test_metric"
    assert row["metric_value"] == 42.5


def test_record_metric_with_dimensions(metrics_service, db):
    """Metric recording with dimensions works"""
    dimensions = {"entity_type": "person", "workspace": "test"}
    entry_id = metrics_service.record("entity_count", 10, dimensions=dimensions)

    row = db.get_one("metrics", where="id = ?", where_params=(entry_id,))
    assert json.loads(row["dimensions"]) == dimensions


def test_collect_system_health_entity_counts(metrics_service, db):
    """System health collects entity counts by type"""
    _insert_entity(db, "Alice", "person")
    _insert_entity(db, "Bob", "person")
    _insert_entity(db, "Acme Corp", "organization")
    _insert_entity(db, "Project X", "project")

    health = metrics_service.collect_system_health()

    assert health["entities"]["person"] == 2
    assert health["entities"]["organization"] == 1
    assert health["entities"]["project"] == 1
    assert health["entities"]["total"] == 4


def test_collect_system_health_memory_stats(metrics_service, db):
    """System health collects memory statistics"""
    _insert_memory(db, "Memory 1", importance=0.5)
    _insert_memory(db, "Memory 2", importance=0.7)
    _insert_memory(db, "Memory 3", importance=0.9)

    health = metrics_service.collect_system_health()

    assert health["memories"]["total"] == 3
    assert health["memories"]["avg_importance"] == pytest.approx(0.7, abs=0.01)


def test_collect_system_health_memory_by_type(metrics_service, db):
    """System health collects memory counts by type"""
    _insert_memory(db, "Fact 1", memory_type="fact")
    _insert_memory(db, "Fact 2", memory_type="fact")
    _insert_memory(db, "Preference 1", memory_type="preference")
    _insert_memory(db, "Observation 1", memory_type="observation")

    health = metrics_service.collect_system_health()

    assert health["memories"]["by_type"]["fact"] == 2
    assert health["memories"]["by_type"]["preference"] == 1
    assert health["memories"]["by_type"]["observation"] == 1


def test_collect_system_health_orphan_memories(metrics_service, db):
    """System health detects orphan memories (no entity links)"""
    # Create memory without entity link
    _insert_memory(db, "Orphan memory")

    # Create memory with entity link
    entity_id = _insert_entity(db, "Test Person")
    mem_id = _insert_memory(db, "Linked memory")
    db.insert("memory_entities", {
        "memory_id": mem_id,
        "entity_id": entity_id,
        "relationship": "about",
    })

    health = metrics_service.collect_system_health()

    assert health["data_quality"]["orphan_memories"] == 1


def test_collect_system_health_stale_entities(metrics_service, db):
    """System health detects stale entities (not updated in 90+ days)"""
    # Create fresh entity
    _insert_entity(db, "Fresh Person")

    # Create stale entity (update time in the past)
    old_time = (datetime.utcnow() - timedelta(days=100)).isoformat()
    db.insert("entities", {
        "name": "Stale Person",
        "type": "person",
        "canonical_name": "stale person",
        "importance": 1.0,
        "created_at": old_time,
        "updated_at": old_time,
    })

    health = metrics_service.collect_system_health()

    assert health["data_quality"]["stale_entities"] == 1


def test_get_trend_returns_chronological(metrics_service):
    """Metric trend returns values in chronological order"""
    # Insert metrics with slight time differences
    metrics_service.record("test_trend", 1.0)
    metrics_service.record("test_trend", 2.0)
    metrics_service.record("test_trend", 3.0)

    trend = metrics_service.get_trend("test_trend", days=30)

    assert len(trend) == 3
    assert trend[0]["value"] == 1.0
    assert trend[1]["value"] == 2.0
    assert trend[2]["value"] == 3.0


def test_get_trend_filters_by_date(metrics_service, db):
    """Metric trend respects date filter"""
    # Insert a metric with old timestamp
    old_time = (datetime.utcnow() - timedelta(days=60)).isoformat()
    db.insert("metrics", {
        "timestamp": old_time,
        "metric_name": "old_metric",
        "metric_value": 100.0,
    })

    # Insert recent metric
    metrics_service.record("old_metric", 200.0)

    # 30-day trend should only include recent
    trend = metrics_service.get_trend("old_metric", days=30)

    assert len(trend) == 1
    assert trend[0]["value"] == 200.0


def test_get_trend_empty_for_missing_metric(metrics_service):
    """Metric trend returns empty list for non-existent metric"""
    trend = metrics_service.get_trend("nonexistent_metric", days=30)
    assert trend == []


def test_collect_and_store_records_metrics(metrics_service, db):
    """Collect and store records key metrics"""
    # Set up some data
    _insert_entity(db, "Test Person")
    _insert_memory(db, "Test memory", importance=0.8)

    health = metrics_service.collect_and_store()

    # Check that metrics were recorded
    entities_total = db.execute(
        "SELECT metric_value FROM metrics WHERE metric_name = 'entities_total'",
        fetch=True,
    )
    assert len(entities_total) == 1
    assert entities_total[0]["metric_value"] == 1.0

    memories_total = db.execute(
        "SELECT metric_value FROM metrics WHERE metric_name = 'memories_total'",
        fetch=True,
    )
    assert len(memories_total) == 1
    assert memories_total[0]["metric_value"] == 1.0


def test_collect_system_health_handles_empty_db(metrics_service):
    """System health handles empty database gracefully"""
    health = metrics_service.collect_system_health()

    assert health["entities"]["total"] == 0
    assert health["memories"]["total"] == 0
    assert health["data_quality"]["orphan_memories"] == 0
    assert health["data_quality"]["stale_entities"] == 0
