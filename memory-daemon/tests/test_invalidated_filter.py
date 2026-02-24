"""Tests for invalidated memory filtering in recall paths."""

import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database, content_hash


@pytest.fixture
def db():
    """Create a temporary test database"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


def _insert_memory(db, content, memory_type="fact", importance=0.8, invalidated_at=None):
    """Helper to insert a memory, optionally invalidated."""
    mem_id = db.insert("memories", {
        "content": content,
        "content_hash": content_hash(content),
        "type": memory_type,
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })
    if invalidated_at:
        db.update(
            "memories",
            {"invalidated_at": invalidated_at, "invalidated_reason": "test"},
            "id = ?",
            (mem_id,),
        )
    return mem_id


def _insert_entity(db, name, entity_type="person", importance=0.8):
    """Helper to insert an entity."""
    canonical = name.lower().strip()
    return db.insert("entities", {
        "name": name,
        "type": entity_type,
        "canonical_name": canonical,
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _link_memory_entity(db, memory_id, entity_id):
    """Link a memory to an entity."""
    db.insert("memory_entities", {
        "memory_id": memory_id,
        "entity_id": entity_id,
        "relationship": "about",
    })


def _get_recall_service(db):
    """Create a RecallService with test database and mocked embedding."""
    from claudia_memory.services.recall import RecallService
    svc = RecallService.__new__(RecallService)
    svc.db = db

    # Mock embedding service that returns None (forces keyword fallback)
    class MockEmbedding:
        def is_available_sync(self):
            return False
    svc.embedding_service = MockEmbedding()

    # Mock extractor for canonical names
    class MockExtractor:
        def canonical_name(self, name):
            return name.lower().strip()
    svc.extractor = MockExtractor()

    # Mock config
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


class TestInvalidatedMemoryFiltering:
    """Verify that invalidated memories are excluded from all search paths."""

    def test_keyword_search_excludes_invalidated(self, db):
        """_keyword_search (LIKE fallback) should not return invalidated memories."""
        now = datetime.utcnow().isoformat()
        valid_id = _insert_memory(db, "Sarah works at TechCorp")
        invalid_id = _insert_memory(db, "Sarah works at OldCorp", invalidated_at=now)

        svc = _get_recall_service(db)
        rows = svc._keyword_search("Sarah works", limit=10)

        result_ids = [row["id"] for row in rows]
        assert valid_id in result_ids
        assert invalid_id not in result_ids

    def test_recall_about_excludes_invalidated(self, db):
        """recall_about should not return invalidated memories for an entity."""
        now = datetime.utcnow().isoformat()
        eid = _insert_entity(db, "Sarah")

        valid_id = _insert_memory(db, "Sarah likes coffee")
        invalid_id = _insert_memory(db, "Sarah likes tea", invalidated_at=now)

        _link_memory_entity(db, valid_id, eid)
        _link_memory_entity(db, invalid_id, eid)

        svc = _get_recall_service(db)
        result = svc.recall_about("Sarah")

        memory_ids = [m.id for m in result["memories"]]
        assert valid_id in memory_ids
        assert invalid_id not in memory_ids

    def test_get_recent_memories_excludes_invalidated(self, db):
        """get_recent_memories should not return invalidated memories."""
        now = datetime.utcnow().isoformat()
        valid_id = _insert_memory(db, "Recent fact A")
        invalid_id = _insert_memory(db, "Recent fact B", invalidated_at=now)

        svc = _get_recall_service(db)
        results = svc.get_recent_memories(limit=10, hours=24)

        result_ids = [r.id for r in results]
        assert valid_id in result_ids
        assert invalid_id not in result_ids

    def test_non_invalidated_memories_returned(self, db):
        """Sanity check: valid memories are returned normally."""
        _insert_memory(db, "Fact one")
        _insert_memory(db, "Fact two")
        _insert_memory(db, "Fact three")

        svc = _get_recall_service(db)
        rows = svc._keyword_search("Fact", limit=10)
        assert len(rows) == 3

    def test_all_invalidated_returns_empty(self, db):
        """If all matching memories are invalidated, result should be empty."""
        now = datetime.utcnow().isoformat()
        _insert_memory(db, "Only match here", invalidated_at=now)

        svc = _get_recall_service(db)
        rows = svc._keyword_search("Only match", limit=10)
        assert len(rows) == 0

    def test_recall_main_excludes_invalidated_via_keyword_fallback(self, db):
        """The main recall() method should exclude invalidated memories."""
        now = datetime.utcnow().isoformat()
        valid_id = _insert_memory(db, "Project Alpha is on track")
        invalid_id = _insert_memory(db, "Project Alpha was cancelled", invalidated_at=now)

        svc = _get_recall_service(db)

        # With embeddings disabled, recall falls back to keyword search
        with patch.object(svc.embedding_service, 'is_available_sync', return_value=False):
            results = svc.recall("Project Alpha", include_low_importance=True)

        result_ids = [r.id for r in results]
        assert valid_id in result_ids
        assert invalid_id not in result_ids
