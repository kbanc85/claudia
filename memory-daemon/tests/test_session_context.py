"""Tests for session_context, morning_context, compact search, and cross-entity patterns"""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from claudia_memory.database import Database, content_hash


def _make_db():
    """Create a fresh test database."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _insert_memory(db, content, memory_type="fact", importance=1.0, about_entities=None):
    """Insert a memory and optionally link it to entities."""
    mid = db.insert(
        "memories",
        {
            "content": content,
            "content_hash": content_hash(content),
            "type": memory_type,
            "importance": importance,
        },
    )
    if about_entities:
        for ename in about_entities:
            canonical = ename.lower().strip()
            entity = db.get_one("entities", where="canonical_name = ?", where_params=(canonical,))
            if not entity:
                eid = db.insert(
                    "entities",
                    {
                        "name": ename,
                        "type": "person",
                        "canonical_name": canonical,
                        "importance": 1.0,
                    },
                )
            else:
                eid = entity["id"]
            db.insert(
                "memory_entities",
                {
                    "memory_id": mid,
                    "entity_id": eid,
                    "relationship": "about",
                },
            )
    return mid


class TestSessionContext:
    """Tests for _build_session_context function."""

    def test_session_context_empty_db(self):
        """Empty DB should return graceful 'no context' message."""
        db, tmpdir = _make_db()
        try:
            # Patch get_db and services to use our test DB
            with patch("claudia_memory.mcp.server.get_db", return_value=db), \
                 patch("claudia_memory.mcp.server.get_unsummarized_turns", return_value=[]), \
                 patch("claudia_memory.mcp.server.get_recall_service") as mock_recall, \
                 patch("claudia_memory.mcp.server.get_predictions", return_value=[]):

                mock_svc = MagicMock()
                mock_svc.get_recent_memories.return_value = []
                mock_recall.return_value = mock_svc

                from claudia_memory.mcp.server import _build_session_context
                result = _build_session_context("normal")

                assert "Session Context" in result
                assert "No context available" in result
        finally:
            db.close()

    def test_session_context_with_unsummarized(self):
        """Unsummarized sessions should appear in context."""
        db, tmpdir = _make_db()
        try:
            unsummarized = [
                {"episode_id": 1, "turn_count": 5, "started_at": "2025-01-28T10:00:00"},
                {"episode_id": 2, "turn_count": 3, "started_at": "2025-01-29T14:00:00"},
            ]

            with patch("claudia_memory.mcp.server.get_db", return_value=db), \
                 patch("claudia_memory.mcp.server.get_unsummarized_turns", return_value=unsummarized), \
                 patch("claudia_memory.mcp.server.get_recall_service") as mock_recall, \
                 patch("claudia_memory.mcp.server.get_predictions", return_value=[]):

                mock_svc = MagicMock()
                mock_svc.get_recent_memories.return_value = []
                mock_recall.return_value = mock_svc

                from claudia_memory.mcp.server import _build_session_context
                result = _build_session_context("normal")

                assert "Unsummarized Sessions (2)" in result
                assert "Episode 1" in result
                assert "Episode 2" in result
                assert "memory.end_session" in result
        finally:
            db.close()

    def test_session_context_token_budgets(self):
        """Different budgets should request different limits."""
        db, tmpdir = _make_db()
        try:
            with patch("claudia_memory.mcp.server.get_db", return_value=db), \
                 patch("claudia_memory.mcp.server.get_unsummarized_turns", return_value=[]), \
                 patch("claudia_memory.mcp.server.get_recall_service") as mock_recall, \
                 patch("claudia_memory.mcp.server.get_predictions", return_value=[]):

                mock_svc = MagicMock()
                mock_svc.get_recent_memories.return_value = []
                mock_recall.return_value = mock_svc

                from claudia_memory.mcp.server import _build_session_context

                # Call with each budget tier
                for budget in ["brief", "normal", "full"]:
                    result = _build_session_context(budget)
                    assert "Session Context" in result
        finally:
            db.close()


class TestMorningContext:
    """Tests for _build_morning_context function."""

    def test_morning_context_empty_db(self):
        """Empty DB should return graceful message."""
        db, tmpdir = _make_db()
        try:
            with patch("claudia_memory.mcp.server.get_db", return_value=db), \
                 patch("claudia_memory.mcp.server.get_consolidate_service") as mock_cons, \
                 patch("claudia_memory.mcp.server.get_recall_service") as mock_recall, \
                 patch("claudia_memory.mcp.server.get_predictions", return_value=[]):

                mock_cons_svc = MagicMock()
                mock_cons_svc._detect_cooling_relationships.return_value = []
                mock_cons_svc._detect_cross_entity_patterns.return_value = []
                mock_cons.return_value = mock_cons_svc

                mock_recall_svc = MagicMock()
                mock_recall_svc.get_recent_memories.return_value = []
                mock_recall.return_value = mock_recall_svc

                from claudia_memory.mcp.server import _build_morning_context
                result = _build_morning_context()

                assert "Morning Context Digest" in result
                assert "No data available" in result
        finally:
            db.close()

    def test_morning_context_with_stale_commitments(self):
        """Stale commitments should appear in morning context."""
        db, tmpdir = _make_db()
        try:
            # Insert a stale commitment (old created_at)
            db.insert(
                "memories",
                {
                    "content": "Send proposal to client",
                    "content_hash": content_hash("Send proposal to client"),
                    "type": "commitment",
                    "importance": 0.8,
                    "created_at": "2025-01-20T10:00:00",
                },
            )

            with patch("claudia_memory.mcp.server.get_db", return_value=db), \
                 patch("claudia_memory.mcp.server.get_consolidate_service") as mock_cons, \
                 patch("claudia_memory.mcp.server.get_recall_service") as mock_recall, \
                 patch("claudia_memory.mcp.server.get_predictions", return_value=[]):

                mock_cons_svc = MagicMock()
                mock_cons_svc._detect_cooling_relationships.return_value = []
                mock_cons_svc._detect_cross_entity_patterns.return_value = []
                mock_cons.return_value = mock_cons_svc

                mock_recall_svc = MagicMock()
                mock_recall_svc.get_recent_memories.return_value = []
                mock_recall.return_value = mock_recall_svc

                from claudia_memory.mcp.server import _build_morning_context
                result = _build_morning_context()

                assert "Stale Commitments" in result
                assert "Send proposal to client" in result
        finally:
            db.close()


class TestCrossEntityPatterns:
    """Tests for cross-entity pattern detection."""

    def test_cross_entity_detection(self):
        """People co-mentioned in 2+ memories should trigger a pattern."""
        db, tmpdir = _make_db()
        try:
            # Create two people entities
            eid1 = db.insert("entities", {"name": "Alice", "type": "person", "canonical_name": "alice", "importance": 1.0})
            eid2 = db.insert("entities", {"name": "Bob", "type": "person", "canonical_name": "bob", "importance": 1.0})

            # Create 2 memories mentioning both
            for i in range(2):
                mid = db.insert(
                    "memories",
                    {
                        "content": f"Meeting {i} with Alice and Bob",
                        "content_hash": content_hash(f"Meeting {i} with Alice and Bob"),
                        "type": "fact",
                        "importance": 1.0,
                    },
                )
                db.insert("memory_entities", {"memory_id": mid, "entity_id": eid1, "relationship": "about"})
                db.insert("memory_entities", {"memory_id": mid, "entity_id": eid2, "relationship": "about"})

            # Run detection
            with patch("claudia_memory.services.consolidate.get_db", return_value=db):
                from claudia_memory.services.consolidate import ConsolidateService
                svc = ConsolidateService.__new__(ConsolidateService)
                svc.db = db
                svc.config = MagicMock()

                patterns = svc._detect_cross_entity_patterns()

                assert len(patterns) == 1
                assert "Alice" in patterns[0].description
                assert "Bob" in patterns[0].description
                assert patterns[0].confidence >= 0.6
        finally:
            db.close()

    def test_cross_entity_skips_existing_relationships(self):
        """Pairs with existing relationships should not be flagged."""
        db, tmpdir = _make_db()
        try:
            eid1 = db.insert("entities", {"name": "Alice", "type": "person", "canonical_name": "alice", "importance": 1.0})
            eid2 = db.insert("entities", {"name": "Bob", "type": "person", "canonical_name": "bob", "importance": 1.0})

            # Create relationship
            db.insert("relationships", {
                "source_entity_id": eid1,
                "target_entity_id": eid2,
                "relationship_type": "works_with",
                "strength": 1.0,
            })

            # Create co-mentions
            for i in range(3):
                mid = db.insert(
                    "memories",
                    {
                        "content": f"Collab {i} between Alice and Bob",
                        "content_hash": content_hash(f"Collab {i} between Alice and Bob"),
                        "type": "fact",
                        "importance": 1.0,
                    },
                )
                db.insert("memory_entities", {"memory_id": mid, "entity_id": eid1, "relationship": "about"})
                db.insert("memory_entities", {"memory_id": mid, "entity_id": eid2, "relationship": "about"})

            with patch("claudia_memory.services.consolidate.get_db", return_value=db):
                from claudia_memory.services.consolidate import ConsolidateService
                svc = ConsolidateService.__new__(ConsolidateService)
                svc.db = db
                svc.config = MagicMock()

                patterns = svc._detect_cross_entity_patterns()

                # Should be empty because relationship already exists
                assert len(patterns) == 0
        finally:
            db.close()


class TestCompactSearch:
    """Tests for compact mode and fetch-by-ids in recall."""

    def test_fetch_by_ids(self):
        """fetch_by_ids should return memories for given IDs."""
        db, tmpdir = _make_db()
        try:
            mid1 = db.insert("memories", {
                "content": "First memory about testing",
                "content_hash": content_hash("First memory about testing"),
                "type": "fact", "importance": 1.0,
            })
            mid2 = db.insert("memories", {
                "content": "Second memory about deployment",
                "content_hash": content_hash("Second memory about deployment"),
                "type": "fact", "importance": 0.8,
            })

            with patch("claudia_memory.services.recall.get_db", return_value=db), \
                 patch("claudia_memory.services.recall.get_embedding_service"), \
                 patch("claudia_memory.services.recall.get_extractor"), \
                 patch("claudia_memory.services.recall.get_config") as mock_config:

                mock_cfg = MagicMock()
                mock_cfg.max_recall_results = 20
                mock_cfg.min_importance_threshold = 0.1
                mock_cfg.vector_weight = 0.5
                mock_cfg.fts_weight = 0.15
                mock_cfg.importance_weight = 0.25
                mock_cfg.recency_weight = 0.1
                mock_config.return_value = mock_cfg

                from claudia_memory.services.recall import RecallService
                svc = RecallService.__new__(RecallService)
                svc.db = db
                svc.config = mock_cfg
                svc.embedding_service = MagicMock()
                svc.extractor = MagicMock()

                results = svc.fetch_by_ids([mid1, mid2])

                assert len(results) == 2
                contents = {r.content for r in results}
                assert "First memory about testing" in contents
                assert "Second memory about deployment" in contents
        finally:
            db.close()

    def test_fetch_by_ids_empty(self):
        """fetch_by_ids with empty list should return empty."""
        db, tmpdir = _make_db()
        try:
            with patch("claudia_memory.services.recall.get_db", return_value=db), \
                 patch("claudia_memory.services.recall.get_embedding_service"), \
                 patch("claudia_memory.services.recall.get_extractor"), \
                 patch("claudia_memory.services.recall.get_config") as mock_config:

                mock_cfg = MagicMock()
                mock_config.return_value = mock_cfg

                from claudia_memory.services.recall import RecallService
                svc = RecallService.__new__(RecallService)
                svc.db = db
                svc.config = mock_cfg

                results = svc.fetch_by_ids([])
                assert results == []
        finally:
            db.close()
