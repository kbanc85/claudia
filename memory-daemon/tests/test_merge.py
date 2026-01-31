"""Tests for near-duplicate memory consolidation"""

import json
import math
import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from claudia_memory.database import Database
from claudia_memory.services.consolidate import ConsolidateService, _cosine_similarity


@pytest.fixture
def db():
    """Create a temporary test database"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


def _make_config(**overrides):
    """Create a mock config object"""
    defaults = {
        "decay_rate_daily": 0.995,
        "min_importance_threshold": 0.1,
        "similarity_merge_threshold": 0.92,
        "enable_memory_merging": True,
    }
    defaults.update(overrides)
    return type("Config", (), defaults)()


def _insert_memory(db, content, importance=1.0, access_count=0):
    """Helper to insert a memory"""
    from claudia_memory.database import content_hash
    mem_id = db.insert("memories", {
        "content": content,
        "content_hash": content_hash(content),
        "type": "fact",
        "importance": importance,
        "access_count": access_count,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })
    return mem_id


def _insert_entity(db, name):
    """Helper to insert an entity"""
    return db.insert("entities", {
        "name": name,
        "type": "person",
        "canonical_name": name.lower(),
        "importance": 1.0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _link_memory_entity(db, memory_id, entity_id):
    """Helper to link a memory to an entity"""
    db.insert("memory_entities", {
        "memory_id": memory_id,
        "entity_id": entity_id,
        "relationship": "about",
    })


def _store_embedding(db, memory_id, embedding):
    """Helper to store a memory embedding"""
    try:
        db.execute(
            "INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
            (memory_id, json.dumps(embedding)),
        )
    except Exception:
        pass  # sqlite-vec may not be available


# --- Cosine similarity tests ---

def test_cosine_similarity_identical():
    """Identical vectors have similarity 1.0"""
    v = [1.0, 2.0, 3.0]
    assert math.isclose(_cosine_similarity(v, v), 1.0, abs_tol=1e-9)


def test_cosine_similarity_orthogonal():
    """Orthogonal vectors have similarity 0.0"""
    a = [1.0, 0.0, 0.0]
    b = [0.0, 1.0, 0.0]
    assert math.isclose(_cosine_similarity(a, b), 0.0, abs_tol=1e-9)


def test_cosine_similarity_opposite():
    """Opposite vectors have similarity -1.0"""
    a = [1.0, 0.0]
    b = [-1.0, 0.0]
    assert math.isclose(_cosine_similarity(a, b), -1.0, abs_tol=1e-9)


def test_cosine_similarity_zero_vector():
    """Zero vector returns 0.0"""
    assert _cosine_similarity([0, 0, 0], [1, 2, 3]) == 0.0


def test_cosine_similarity_empty():
    """Empty vectors return 0.0"""
    assert _cosine_similarity([], []) == 0.0


# --- Merge logic tests ---

def test_merge_transfers_entity_links(db):
    """Merging transfers entity links from duplicate to primary"""
    entity1 = _insert_entity(db, "Alice")
    entity2 = _insert_entity(db, "Bob")

    # Create primary with entity1, duplicate with entity2
    primary_id = _insert_memory(db, "Primary memory about Alice")
    dup_id = _insert_memory(db, "Duplicate memory about Bob")
    _link_memory_entity(db, primary_id, entity1)
    _link_memory_entity(db, dup_id, entity2)

    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db
    svc.config = _make_config()

    svc._merge_memory_pair(primary_id, dup_id)

    # Primary should now be linked to both entities
    links = db.execute(
        "SELECT entity_id FROM memory_entities WHERE memory_id = ?",
        (primary_id,),
        fetch=True,
    )
    entity_ids = {row["entity_id"] for row in links}
    assert entity1 in entity_ids
    assert entity2 in entity_ids

    # Duplicate should have minimized importance
    dup = db.get_one("memories", where="id = ?", where_params=(dup_id,))
    assert dup["importance"] == pytest.approx(0.001)


def test_merge_disabled_by_config(db):
    """When enable_memory_merging is False, merge_similar_memories returns 0"""
    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db
    svc.config = _make_config(enable_memory_merging=False)

    result = svc.merge_similar_memories()
    assert result == 0
