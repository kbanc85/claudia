"""Tests for retention cleanup and adaptive decay."""

from datetime import datetime, timedelta
from unittest.mock import patch

from claudia_memory.config import MemoryConfig
from claudia_memory.services.consolidate import ConsolidateService


def _make_service(db):
    """Create a ConsolidateService wired to the test database."""
    config = MemoryConfig()
    svc = ConsolidateService()
    svc.db = db
    svc.config = config
    return svc


# ---------------------------------------------------------------------------
# Retention cleanup tests
# ---------------------------------------------------------------------------


def test_retention_cleanup_audit_log(db):
    """Old audit_log entries should be deleted."""
    svc = _make_service(db)
    old_ts = (datetime.utcnow() - timedelta(days=120)).isoformat()
    recent_ts = (datetime.utcnow() - timedelta(days=10)).isoformat()

    db.execute(
        "INSERT INTO audit_log (timestamp, operation, details) VALUES (?, ?, ?)",
        (old_ts, "test_op", "old entry"),
    )
    db.execute(
        "INSERT INTO audit_log (timestamp, operation, details) VALUES (?, ?, ?)",
        (recent_ts, "test_op", "recent entry"),
    )

    results = svc.run_retention_cleanup()
    assert results["audit_log_deleted"] == 1

    # Verify the recent entry remains
    rows = db.execute("SELECT COUNT(*) as c FROM audit_log", fetch=True)
    assert rows[0][0] == 1


def test_retention_cleanup_predictions(db):
    """Expired predictions past retention window should be deleted."""
    svc = _make_service(db)
    old_expires = (datetime.utcnow() - timedelta(days=60)).isoformat()
    recent_expires = (datetime.utcnow() + timedelta(days=5)).isoformat()

    db.execute(
        "INSERT INTO predictions (content, prediction_type, expires_at) VALUES (?, ?, ?)",
        ("old prediction", "suggestion", old_expires),
    )
    db.execute(
        "INSERT INTO predictions (content, prediction_type, expires_at) VALUES (?, ?, ?)",
        ("active prediction", "suggestion", recent_expires),
    )
    # A prediction with no expiry should NOT be deleted
    db.execute(
        "INSERT INTO predictions (content, prediction_type) VALUES (?, ?)",
        ("eternal prediction", "insight"),
    )

    results = svc.run_retention_cleanup()
    assert results["predictions_deleted"] == 1

    rows = db.execute("SELECT COUNT(*) as c FROM predictions", fetch=True)
    assert rows[0][0] == 2


def test_retention_cleanup_turn_buffer(db):
    """Old turn_buffer entries should be deleted."""
    svc = _make_service(db)
    old_ts = (datetime.utcnow() - timedelta(days=90)).isoformat()
    recent_ts = (datetime.utcnow() - timedelta(days=5)).isoformat()

    # Need an episode first
    episode_id = db.insert("episodes", {
        "session_id": "test-session",
        "started_at": datetime.utcnow().isoformat(),
    })

    db.execute(
        "INSERT INTO turn_buffer (episode_id, turn_number, user_content, created_at) VALUES (?, ?, ?, ?)",
        (episode_id, 1, "old turn", old_ts),
    )
    db.execute(
        "INSERT INTO turn_buffer (episode_id, turn_number, user_content, created_at) VALUES (?, ?, ?, ?)",
        (episode_id, 2, "recent turn", recent_ts),
    )

    results = svc.run_retention_cleanup()
    assert results["turn_buffer_deleted"] == 1

    rows = db.execute("SELECT COUNT(*) as c FROM turn_buffer", fetch=True)
    assert rows[0][0] == 1


def test_retention_cleanup_metrics(db):
    """Old metrics entries should be deleted."""
    svc = _make_service(db)
    old_ts = (datetime.utcnow() - timedelta(days=120)).isoformat()
    recent_ts = (datetime.utcnow() - timedelta(days=5)).isoformat()

    db.execute(
        "INSERT INTO metrics (timestamp, metric_name, metric_value) VALUES (?, ?, ?)",
        (old_ts, "test_metric", 42.0),
    )
    db.execute(
        "INSERT INTO metrics (timestamp, metric_name, metric_value) VALUES (?, ?, ?)",
        (recent_ts, "test_metric", 99.0),
    )

    results = svc.run_retention_cleanup()
    assert results["metrics_deleted"] == 1

    rows = db.execute("SELECT COUNT(*) as c FROM metrics", fetch=True)
    assert rows[0][0] == 1


def test_retention_cleanup_empty_tables(db):
    """Cleanup on empty tables should report 0 deletions, not error."""
    svc = _make_service(db)
    results = svc.run_retention_cleanup()
    assert results["audit_log_deleted"] == 0
    assert results["predictions_deleted"] == 0
    assert results["turn_buffer_deleted"] == 0
    assert results["metrics_deleted"] == 0


# ---------------------------------------------------------------------------
# Adaptive decay tests
# ---------------------------------------------------------------------------


def test_adaptive_decay_tiered(db):
    """High-importance memories should decay slower than low-importance ones."""
    svc = _make_service(db)

    # Insert high-importance memory
    db.execute(
        "INSERT INTO memories (content, content_hash, type, importance) VALUES (?, ?, ?, ?)",
        ("Important memory", "hash_high", "fact", 0.9),
    )
    # Insert low-importance memory
    db.execute(
        "INSERT INTO memories (content, content_hash, type, importance) VALUES (?, ?, ?, ?)",
        ("Regular memory", "hash_low", "fact", 0.5),
    )

    svc.run_decay()

    rows = db.execute(
        "SELECT content, importance FROM memories ORDER BY content",
        fetch=True,
    )
    high_mem = [r for r in rows if r["content"] == "Important memory"][0]
    low_mem = [r for r in rows if r["content"] == "Regular memory"][0]

    # High-importance should have decayed less (slow rate)
    slow_rate = (1.0 + svc.config.decay_rate_daily) / 2
    expected_high = 0.9 * slow_rate
    assert abs(high_mem["importance"] - expected_high) < 0.0001

    # Low-importance should have decayed at standard rate
    expected_low = 0.5 * svc.config.decay_rate_daily
    assert abs(low_mem["importance"] - expected_low) < 0.0001


def test_adaptive_decay_floor(db):
    """Importance should never go below the floor (min_importance_threshold)."""
    svc = _make_service(db)
    floor = svc.config.min_importance_threshold

    # Insert a memory just above the floor
    db.execute(
        "INSERT INTO memories (content, content_hash, type, importance) VALUES (?, ?, ?, ?)",
        ("Near floor", "hash_floor", "fact", floor + 0.001),
    )

    # Run decay many times
    for _ in range(100):
        svc.run_decay()

    rows = db.execute(
        "SELECT importance FROM memories WHERE content_hash = ?",
        ("hash_floor",),
        fetch=True,
    )
    assert rows[0][0] >= floor


def test_adaptive_decay_at_floor_not_updated(db):
    """Memories at or below the floor should not be updated (WHERE importance > floor)."""
    svc = _make_service(db)
    floor = svc.config.min_importance_threshold

    # Insert a memory at exactly the floor
    db.execute(
        "INSERT INTO memories (content, content_hash, type, importance) VALUES (?, ?, ?, ?)",
        ("At floor", "hash_atfloor", "fact", floor),
    )

    result = svc.run_decay()
    # The at-floor memory should NOT be counted as decayed
    assert result["memories_decayed"] == 0


def test_adaptive_decay_entities_tiered(db):
    """Entities should also receive tiered decay."""
    svc = _make_service(db)

    db.execute(
        "INSERT INTO entities (name, type, canonical_name, importance) VALUES (?, ?, ?, ?)",
        ("High Entity", "person", "high_entity", 0.9),
    )
    db.execute(
        "INSERT INTO entities (name, type, canonical_name, importance) VALUES (?, ?, ?, ?)",
        ("Low Entity", "person", "low_entity", 0.4),
    )

    svc.run_decay()

    rows = db.execute(
        "SELECT name, importance FROM entities ORDER BY name",
        fetch=True,
    )
    high_ent = [r for r in rows if r["name"] == "High Entity"][0]
    low_ent = [r for r in rows if r["name"] == "Low Entity"][0]

    slow_rate = (1.0 + svc.config.decay_rate_daily) / 2
    expected_high = 0.9 * slow_rate
    expected_low = 0.4 * svc.config.decay_rate_daily

    assert abs(high_ent["importance"] - expected_high) < 0.0001
    assert abs(low_ent["importance"] - expected_low) < 0.0001


def test_adaptive_decay_relationships_tiered(db):
    """Relationships should receive tiered decay by strength."""
    svc = _make_service(db)

    # Need entities for foreign keys
    id_a = db.insert("entities", {"name": "A", "type": "person", "canonical_name": "a"})
    id_b = db.insert("entities", {"name": "B", "type": "person", "canonical_name": "b"})
    id_c = db.insert("entities", {"name": "C", "type": "person", "canonical_name": "c"})

    db.execute(
        "INSERT INTO relationships (source_entity_id, target_entity_id, relationship_type, strength) VALUES (?, ?, ?, ?)",
        (id_a, id_b, "works_with", 0.9),
    )
    db.execute(
        "INSERT INTO relationships (source_entity_id, target_entity_id, relationship_type, strength) VALUES (?, ?, ?, ?)",
        (id_a, id_c, "knows", 0.4),
    )

    svc.run_decay()

    rows = db.execute(
        "SELECT relationship_type, strength FROM relationships ORDER BY relationship_type",
        fetch=True,
    )
    knows = [r for r in rows if r["relationship_type"] == "knows"][0]
    works = [r for r in rows if r["relationship_type"] == "works_with"][0]

    slow_rate = (1.0 + svc.config.decay_rate_daily) / 2
    expected_strong = 0.9 * slow_rate
    expected_weak = 0.4 * svc.config.decay_rate_daily

    assert abs(works["strength"] - expected_strong) < 0.0001
    assert abs(knows["strength"] - expected_weak) < 0.0001


# ---------------------------------------------------------------------------
# Pre-consolidation backup integration test
# ---------------------------------------------------------------------------


def test_full_consolidation_includes_backup(db):
    """run_full_consolidation should create a backup when enabled."""
    svc = _make_service(db)
    svc.config.enable_pre_consolidation_backup = True

    results = svc.run_full_consolidation()
    assert "backup_path" in results

    backup_path = results["backup_path"]
    from pathlib import Path
    assert Path(backup_path).exists()


def test_full_consolidation_skips_backup_when_disabled(db):
    """run_full_consolidation should skip backup when disabled."""
    svc = _make_service(db)
    svc.config.enable_pre_consolidation_backup = False

    results = svc.run_full_consolidation()
    assert "backup_path" not in results
    assert "backup_error" not in results


def test_full_consolidation_includes_retention(db):
    """run_full_consolidation should include retention cleanup results."""
    svc = _make_service(db)
    svc.config.enable_pre_consolidation_backup = False

    results = svc.run_full_consolidation()
    assert "retention" in results
    assert "audit_log_deleted" in results["retention"]
