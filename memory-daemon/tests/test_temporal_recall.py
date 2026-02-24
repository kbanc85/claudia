"""Tests for temporal recall functions in RecallService."""

import hashlib
from datetime import datetime, timedelta

from claudia_memory.services.recall import RecallService


def _content_hash(content):
    """Generate SHA256 hash of content for deduplication."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _get_recall_service(db):
    """Create a RecallService with test database and mocked dependencies."""
    svc = RecallService.__new__(RecallService)
    svc.db = db

    class MockEmbedding:
        def is_available_sync(self):
            return False

    svc.embedding_service = MockEmbedding()

    class MockExtractor:
        def canonical_name(self, name):
            return name.lower().strip()

    svc.extractor = MockExtractor()

    class MockConfig:
        max_recall_results = 50
        min_importance_threshold = 0.0
        vector_weight = 0.5
        fts_weight = 0.15
        importance_weight = 0.25
        recency_weight = 0.1
        enable_rrf = False
        rrf_k = 60
        graph_proximity_enabled = False
        recency_half_life_days = 30

    svc.config = MockConfig()
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


def _insert_entity(db, name, entity_type="person", importance=0.8,
                   last_contact_at=None, contact_frequency_days=None,
                   contact_trend=None, attention_tier="standard"):
    """Insert an entity and return its id."""
    canonical = name.lower().strip()
    return db.insert("entities", {
        "name": name,
        "type": entity_type,
        "canonical_name": canonical,
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "last_contact_at": last_contact_at,
        "contact_frequency_days": contact_frequency_days,
        "contact_trend": contact_trend,
        "attention_tier": attention_tier,
    })


def _link_memory_entity(db, memory_id, entity_id, relationship="about"):
    """Link a memory to an entity."""
    db.insert("memory_entities", {
        "memory_id": memory_id,
        "entity_id": entity_id,
        "relationship": relationship,
    })


# ---------------------------------------------------------------------------
# recall_upcoming_deadlines
# ---------------------------------------------------------------------------


def test_recall_upcoming_deadlines(db):
    """Deadlines within the window are returned sorted by deadline_at ASC."""
    now = datetime.utcnow()

    # Past deadline (overdue)
    past = (now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")
    _insert_memory(db, "Overdue task", memory_type="commitment",
                   importance=0.7, deadline_at=past)

    # Today
    today = now.strftime("%Y-%m-%d %H:%M:%S")
    _insert_memory(db, "Due today", memory_type="commitment",
                   importance=0.6, deadline_at=today)

    # 3 days from now
    three_days = (now + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
    _insert_memory(db, "Due in 3 days", memory_type="commitment",
                   importance=0.5, deadline_at=three_days)

    # 10 days from now
    ten_days = (now + timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")
    _insert_memory(db, "Due in 10 days", memory_type="commitment",
                   importance=0.4, deadline_at=ten_days)

    # 20 days from now -- outside the 14-day window
    twenty_days = (now + timedelta(days=20)).strftime("%Y-%m-%d %H:%M:%S")
    _insert_memory(db, "Due in 20 days", memory_type="commitment",
                   importance=0.3, deadline_at=twenty_days)

    svc = _get_recall_service(db)
    results = svc.recall_upcoming_deadlines(14)

    # The 20-day item should be excluded (outside 14 days)
    assert len(results) == 4

    # Results should be sorted by deadline_at ascending
    deadlines = [r.metadata["deadline_at"] for r in results]
    assert deadlines == sorted(deadlines)

    # The overdue item should have urgency "overdue"
    assert results[0].metadata["urgency"] == "overdue"


def test_recall_upcoming_overdue_first(db):
    """Overdue items appear before future items due to ASC sorting."""
    now = datetime.utcnow()

    # Insert future deadline first
    future = (now + timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")
    _insert_memory(db, "Future task", memory_type="commitment",
                   importance=0.5, deadline_at=future)

    # Insert overdue deadline second
    past = (now - timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
    _insert_memory(db, "Overdue task", memory_type="commitment",
                   importance=0.5, deadline_at=past)

    svc = _get_recall_service(db)
    results = svc.recall_upcoming_deadlines(14)

    assert len(results) == 2
    # Overdue item should come first (earlier deadline_at)
    assert results[0].content == "Overdue task"
    assert results[0].metadata["urgency"] == "overdue"
    assert results[1].content == "Future task"
    assert results[1].metadata["urgency"] == "this_week"


# ---------------------------------------------------------------------------
# recall_since
# ---------------------------------------------------------------------------


def test_recall_since(db):
    """Only memories created after the given timestamp are returned."""
    # Insert memories at different timestamps
    old_ts = "2026-01-10T12:00:00"
    mid_ts = "2026-01-15T12:00:00"
    new_ts = "2026-01-20T12:00:00"

    _insert_memory(db, "Old memory", created_at=old_ts)
    _insert_memory(db, "Mid memory", created_at=mid_ts)
    _insert_memory(db, "New memory", created_at=new_ts)

    svc = _get_recall_service(db)
    results = svc.recall_since("2026-01-15")

    # Should return mid and new (created_at >= since)
    contents = {r.content for r in results}
    assert "Mid memory" in contents
    assert "New memory" in contents
    assert "Old memory" not in contents


def test_recall_since_with_entity(db):
    """Entity name filter restricts results to memories linked to that entity."""
    ts = "2026-01-20T12:00:00"

    alice_id = _insert_entity(db, "Alice")
    bob_id = _insert_entity(db, "Bob")

    mem_alice = _insert_memory(db, "Alice did something", created_at=ts)
    mem_bob = _insert_memory(db, "Bob did something", created_at=ts)

    _link_memory_entity(db, mem_alice, alice_id)
    _link_memory_entity(db, mem_bob, bob_id)

    svc = _get_recall_service(db)
    results = svc.recall_since("2026-01-15", entity_name="Alice")

    contents = {r.content for r in results}
    assert "Alice did something" in contents
    assert "Bob did something" not in contents


# ---------------------------------------------------------------------------
# recall_timeline
# ---------------------------------------------------------------------------


def test_recall_timeline(db):
    """Timeline returns memories linked to an entity in chronological order."""
    entity_id = _insert_entity(db, "Test Person")

    ts1 = "2026-01-10T10:00:00"
    ts2 = "2026-01-15T10:00:00"
    ts3 = "2026-01-20T10:00:00"

    m1 = _insert_memory(db, "First event", created_at=ts1)
    m2 = _insert_memory(db, "Second event", created_at=ts2)
    m3 = _insert_memory(db, "Third event", created_at=ts3)

    _link_memory_entity(db, m1, entity_id)
    _link_memory_entity(db, m2, entity_id)
    _link_memory_entity(db, m3, entity_id)

    # Insert a memory NOT linked to this entity (should be excluded)
    _insert_memory(db, "Unrelated event", created_at=ts2)

    svc = _get_recall_service(db)
    results = svc.recall_timeline("Test Person")

    assert len(results) == 3
    # Should be chronological (ASC)
    assert results[0].content == "First event"
    assert results[1].content == "Second event"
    assert results[2].content == "Third event"


# ---------------------------------------------------------------------------
# project_relationship_health
# ---------------------------------------------------------------------------


def test_project_relationship_health(db):
    """Entity with velocity data returns risk_level and projected dates."""
    now = datetime.utcnow()
    last_contact = (now - timedelta(days=10)).isoformat()

    _insert_entity(
        db, "Test Person",
        last_contact_at=last_contact,
        contact_frequency_days=7.0,
        contact_trend="stable",
    )

    svc = _get_recall_service(db)
    result = svc.project_relationship_health("Test Person")

    assert result["entity"] == "Test Person"
    assert result["trend"] == "stable"
    assert "risk_level" in result
    assert "projected_dormant_date" in result
    assert "recommended_contact_date" in result
    assert "days_since_contact" in result
    assert result["days_since_contact"] >= 10
    assert result["contact_frequency_days"] == 7.0


def test_project_relationship_health_insufficient_data(db):
    """Entity without velocity data returns status='insufficient_data'."""
    _insert_entity(db, "New Person")

    svc = _get_recall_service(db)
    result = svc.project_relationship_health("New Person")

    assert result["status"] == "insufficient_data"
    assert result["entity"] == "New Person"
