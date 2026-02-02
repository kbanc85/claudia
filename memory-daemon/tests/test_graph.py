"""Tests for Graph Traversal in RecallService (Phase 3)"""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database, content_hash
from claudia_memory.services.recall import RecallService


def _make_db():
    """Create a fresh test database."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _make_recall(db):
    """Create a RecallService with test config."""
    svc = RecallService.__new__(RecallService)
    svc.db = db
    svc.config = type("Config", (), {
        "vector_weight": 0.50,
        "importance_weight": 0.25,
        "recency_weight": 0.10,
        "fts_weight": 0.15,
        "max_recall_results": 20,
    })()
    from claudia_memory.extraction.entity_extractor import get_extractor
    svc.extractor = get_extractor()
    return svc


def _insert_entity(db, name, entity_type="person", importance=1.0):
    canonical = name.lower().strip()
    return db.insert(
        "entities",
        {
            "name": name,
            "canonical_name": canonical,
            "type": entity_type,
            "importance": importance,
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T00:00:00",
        },
    )


def _relate(db, src_id, tgt_id, rel_type="works_with", strength=1.0):
    return db.insert(
        "relationships",
        {
            "source_entity_id": src_id,
            "target_entity_id": tgt_id,
            "relationship_type": rel_type,
            "strength": strength,
            "direction": "bidirectional",
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T00:00:00",
        },
    )


def _insert_memory(db, content, entity_id, importance=1.0):
    mem_id = db.insert(
        "memories",
        {
            "content": content,
            "content_hash": content_hash(content),
            "type": "fact",
            "importance": importance,
            "confidence": 1.0,
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T00:00:00",
        },
    )
    db.insert(
        "memory_entities",
        {"memory_id": mem_id, "entity_id": entity_id, "relationship": "about"},
    )
    return mem_id


# --------------------------------------------------------------------------
# Test 1: Single-hop traversal (A->B->C, query A, get B and C)
# --------------------------------------------------------------------------
def test_single_hop_traversal():
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        a_id = _insert_entity(db, "Alice")
        b_id = _insert_entity(db, "Bob")
        c_id = _insert_entity(db, "Charlie")

        _relate(db, a_id, b_id)
        _relate(db, b_id, c_id)

        # Depth 1: should get Bob (direct neighbor)
        connected = svc._expand_graph(a_id, depth=1)
        names = [c["name"] for c in connected]
        assert "Bob" in names
        # Charlie is 2 hops away, should NOT appear at depth 1
        assert "Charlie" not in names
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 2: No cycles (A->B->A doesn't loop)
# --------------------------------------------------------------------------
def test_no_cycles():
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        a_id = _insert_entity(db, "Alice")
        b_id = _insert_entity(db, "Bob")

        # Bidirectional relationship
        _relate(db, a_id, b_id)
        _relate(db, b_id, a_id)

        connected = svc._expand_graph(a_id, depth=2)
        names = [c["name"] for c in connected]
        # Bob should appear once, Alice (origin) should not appear
        assert names.count("Bob") == 1
        assert "Alice" not in names
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 3: Depth limit respected
# --------------------------------------------------------------------------
def test_depth_limit():
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        a_id = _insert_entity(db, "Alice")
        b_id = _insert_entity(db, "Bob")
        c_id = _insert_entity(db, "Charlie")
        d_id = _insert_entity(db, "Diana")

        _relate(db, a_id, b_id)
        _relate(db, b_id, c_id)
        _relate(db, c_id, d_id)

        # Depth 2 from Alice: should get Bob (1) and Charlie (2), not Diana (3)
        connected = svc._expand_graph(a_id, depth=2, limit_per_hop=10)
        names = [c["name"] for c in connected]
        assert "Bob" in names
        assert "Charlie" in names
        assert "Diana" not in names
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 4: Weak relationships excluded (strength <= 0.1)
# --------------------------------------------------------------------------
def test_weak_relationships_excluded():
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        a_id = _insert_entity(db, "Alice")
        b_id = _insert_entity(db, "Bob")
        c_id = _insert_entity(db, "Charlie")

        _relate(db, a_id, b_id, strength=0.8)
        _relate(db, a_id, c_id, strength=0.05)  # Weak, should be excluded

        connected = svc._expand_graph(a_id, depth=1)
        names = [c["name"] for c in connected]
        assert "Bob" in names
        assert "Charlie" not in names
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 5: Empty graph returns empty list
# --------------------------------------------------------------------------
def test_empty_graph():
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        a_id = _insert_entity(db, "Alice")

        connected = svc._expand_graph(a_id, depth=1)
        assert connected == []
    finally:
        db.close()
