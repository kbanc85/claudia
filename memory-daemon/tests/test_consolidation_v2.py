"""Tests for Phase 2-3 consolidation features: deadline surge, contact velocity, attention tiers."""

import hashlib
from datetime import datetime, timedelta

from claudia_memory.config import MemoryConfig
from claudia_memory.services.consolidate import ConsolidateService


def _content_hash(content):
    """Generate SHA256 hash of content for deduplication."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _make_service(db):
    """Create a ConsolidateService wired to the test database."""
    config = MemoryConfig()
    svc = ConsolidateService()
    svc.db = db
    svc.config = config
    return svc


def _insert_memory(db, content, memory_type="fact", importance=0.8,
                   created_at=None, deadline_at=None):
    """Insert a memory and return its id."""
    now = created_at or datetime.utcnow().isoformat()
    return db.insert("memories", {
        "content": content,
        "content_hash": _content_hash(content),
        "type": memory_type,
        "importance": importance,
        "created_at": now,
        "updated_at": now,
        "deadline_at": deadline_at,
    })


def _insert_entity(db, name, entity_type="person", importance=0.8):
    """Insert a person entity and return its id."""
    canonical = name.lower().strip()
    return db.insert("entities", {
        "name": name,
        "type": entity_type,
        "canonical_name": canonical,
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _link_memory_entity(db, memory_id, entity_id, relationship="about"):
    """Link a memory to an entity."""
    db.insert("memory_entities", {
        "memory_id": memory_id,
        "entity_id": entity_id,
        "relationship": relationship,
    })


# ---------------------------------------------------------------------------
# Deadline surge tests
# ---------------------------------------------------------------------------


def test_surge_overdue(db):
    """Overdue commitment should be surged to importance 1.0."""
    svc = _make_service(db)
    now = datetime.utcnow()
    past_deadline = (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")

    mem_id = _insert_memory(
        db, "Overdue commitment",
        memory_type="commitment",
        importance=0.5,
        deadline_at=past_deadline,
    )

    svc._surge_approaching_deadlines()

    rows = db.execute(
        "SELECT importance FROM memories WHERE id = ?", (mem_id,), fetch=True
    )
    assert rows[0][0] == 1.0


def test_surge_within_48h(db):
    """Commitment due tomorrow should be surged to at least 0.95."""
    svc = _make_service(db)
    now = datetime.utcnow()
    tomorrow = (now + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")

    mem_id = _insert_memory(
        db, "Due tomorrow",
        memory_type="commitment",
        importance=0.5,
        deadline_at=tomorrow,
    )

    svc._surge_approaching_deadlines()

    rows = db.execute(
        "SELECT importance FROM memories WHERE id = ?", (mem_id,), fetch=True
    )
    assert rows[0][0] >= 0.95


def test_surge_within_week(db):
    """Commitment due in 5 days should be surged to at least 0.85."""
    svc = _make_service(db)
    now = datetime.utcnow()
    five_days = (now + timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")

    mem_id = _insert_memory(
        db, "Due in 5 days",
        memory_type="commitment",
        importance=0.5,
        deadline_at=five_days,
    )

    svc._surge_approaching_deadlines()

    rows = db.execute(
        "SELECT importance FROM memories WHERE id = ?", (mem_id,), fetch=True
    )
    assert rows[0][0] >= 0.85


def test_surge_before_decay(db):
    """run_decay calls surge first, so a near-deadline commitment should not lose importance."""
    svc = _make_service(db)
    now = datetime.utcnow()
    tomorrow = (now + timedelta(hours=20)).strftime("%Y-%m-%d %H:%M:%S")

    mem_id = _insert_memory(
        db, "Urgent commitment",
        memory_type="commitment",
        importance=0.5,
        deadline_at=tomorrow,
    )

    svc.run_decay()

    rows = db.execute(
        "SELECT importance FROM memories WHERE id = ?", (mem_id,), fetch=True
    )
    # Surge should have boosted it to >= 0.95 before decay applied.
    # Even after one round of decay, it should remain high.
    assert rows[0][0] >= 0.9


# ---------------------------------------------------------------------------
# Contact velocity tests
# ---------------------------------------------------------------------------


def test_update_contact_velocity(db):
    """Entity with 4 memories at different dates should get frequency and trend."""
    svc = _make_service(db)
    entity_id = _insert_entity(db, "Velocity Person")

    # Create 4 memories at 10-day intervals
    base = datetime.utcnow() - timedelta(days=40)
    for i in range(4):
        ts = (base + timedelta(days=i * 10)).isoformat()
        mem_id = _insert_memory(db, f"Contact {i+1} with Velocity Person", created_at=ts)
        _link_memory_entity(db, mem_id, entity_id)

    svc._update_contact_velocity()

    rows = db.execute(
        "SELECT contact_frequency_days, contact_trend FROM entities WHERE id = ?",
        (entity_id,),
        fetch=True,
    )
    assert rows[0]["contact_frequency_days"] is not None
    freq = rows[0]["contact_frequency_days"]
    # With 10-day intervals, average should be close to 10
    assert 8.0 <= freq <= 12.0
    assert rows[0]["contact_trend"] is not None
    assert rows[0]["contact_trend"] in ("accelerating", "stable", "decelerating", "dormant")


# ---------------------------------------------------------------------------
# Attention tier tests
# ---------------------------------------------------------------------------


def test_attention_tier_active(db):
    """Entity with a memory from 2 days ago should be tier 'active'."""
    svc = _make_service(db)
    entity_id = _insert_entity(db, "Active Person")

    two_days_ago = (datetime.utcnow() - timedelta(days=2)).isoformat()
    # Set last_contact_at directly (as _update_contact_velocity would)
    db.execute(
        "UPDATE entities SET last_contact_at = ? WHERE id = ?",
        (two_days_ago, entity_id),
    )

    svc._update_attention_tiers()

    rows = db.execute(
        "SELECT attention_tier FROM entities WHERE id = ?",
        (entity_id,),
        fetch=True,
    )
    assert rows[0]["attention_tier"] == "active"


def test_attention_tier_archive(db):
    """Entity with last memory 100+ days ago and low importance should be 'archive'."""
    svc = _make_service(db)
    entity_id = _insert_entity(db, "Old Person", importance=0.2)

    long_ago = (datetime.utcnow() - timedelta(days=120)).isoformat()
    db.execute(
        "UPDATE entities SET last_contact_at = ? WHERE id = ?",
        (long_ago, entity_id),
    )

    svc._update_attention_tiers()

    rows = db.execute(
        "SELECT attention_tier FROM entities WHERE id = ?",
        (entity_id,),
        fetch=True,
    )
    assert rows[0]["attention_tier"] == "archive"
