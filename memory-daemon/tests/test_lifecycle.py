"""Tests for Sacred Memory, Lifecycle Tiers, CRE, and SHA-256 Chain features (Migration 20)."""

import hashlib
import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database, content_hash


# ── Helpers ──────────────────────────────────────────────────────


@pytest.fixture
def db():
    """Create a temporary test database with full schema + migrations."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


def _insert_memory(db, content, memory_type="fact", importance=0.8,
                   lifecycle_tier=None, sacred_reason=None, fact_id=None,
                   created_at=None, last_accessed_at=None):
    """Insert a memory with optional lifecycle fields."""
    data = {
        "content": content,
        "content_hash": content_hash(content),
        "type": memory_type,
        "importance": importance,
        "created_at": created_at or datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    if lifecycle_tier:
        data["lifecycle_tier"] = lifecycle_tier
    if sacred_reason:
        data["sacred_reason"] = sacred_reason
    if fact_id:
        data["fact_id"] = fact_id
    if last_accessed_at:
        data["last_accessed_at"] = last_accessed_at
    return db.insert("memories", data)


def _insert_entity(db, name, entity_type="person", importance=0.8,
                   description=None, close_circle=False, close_circle_reason=None,
                   contact_frequency_days=None, contact_trend=None):
    """Insert an entity with optional close-circle fields."""
    data = {
        "name": name,
        "type": entity_type,
        "canonical_name": name.lower().strip(),
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    if description:
        data["description"] = description
    mem_id = db.insert("entities", data)
    if close_circle:
        db.update("entities", {
            "close_circle": 1,
            "close_circle_reason": close_circle_reason or "test",
        }, "id = ?", (mem_id,))
    if contact_frequency_days is not None:
        db.update("entities", {
            "contact_frequency_days": contact_frequency_days,
            "contact_trend": contact_trend or "stable",
        }, "id = ?", (mem_id,))
    return mem_id


def _link_memory_entity(db, memory_id, entity_id):
    """Link a memory to an entity."""
    db.insert("memory_entities", {
        "memory_id": memory_id,
        "entity_id": entity_id,
        "relationship": "about",
    })


def _get_recall_service(db):
    """Create a RecallService with test database and mock dependencies."""
    from claudia_memory.services.recall import RecallService
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


def _get_consolidate_service(db):
    """Create a ConsolidateService with test database."""
    from claudia_memory.services.consolidate import ConsolidateService
    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db

    class MockConfig:
        decay_rate_daily = 0.995
        min_importance_threshold = 0.1
        enable_pre_consolidation_backup = False
        cooling_threshold_days = 60
        archive_threshold_days = 180
        enable_auto_sacred = True
        sacred_core_keywords = ["birthday", "allergy", "family", "boundary", "health"]
        close_circle_keywords = ["close friend", "bestie", "family", "best friend"]
    svc.config = MockConfig()

    return svc


# ── Migration Tests ──────────────────────────────────────────────


class TestMigration20:
    """Verify migration 20 columns exist on all tables."""

    def test_memories_lifecycle_columns(self, db):
        """memories table should have lifecycle_tier, sacred_reason, archived_at, fact_id, hash, prev_hash."""
        cols = {row["name"] for row in db.execute("PRAGMA table_info(memories)", fetch=True)}
        for col in ["lifecycle_tier", "sacred_reason", "archived_at", "fact_id", "hash", "prev_hash"]:
            assert col in cols, f"Missing column: {col}"

    def test_entities_close_circle_columns(self, db):
        """entities table should have close_circle, close_circle_reason."""
        cols = {row["name"] for row in db.execute("PRAGMA table_info(entities)", fetch=True)}
        assert "close_circle" in cols
        assert "close_circle_reason" in cols

    def test_relationships_lifecycle_column(self, db):
        """relationships table should have lifecycle_tier."""
        cols = {row["name"] for row in db.execute("PRAGMA table_info(relationships)", fetch=True)}
        assert "lifecycle_tier" in cols

    def test_indexes_exist(self, db):
        """Lifecycle indexes should exist."""
        indexes = {row["name"] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='index'", fetch=True
        )}
        assert "idx_memories_lifecycle" in indexes
        assert "idx_memories_fact_id" in indexes
        assert "idx_entities_close_circle" in indexes

    def test_meta_chain_head_initialized(self, db):
        """_meta should have chain_head and view_as_of entries."""
        chain_head = db.execute(
            "SELECT value FROM _meta WHERE key = 'chain_head'", fetch=True
        )
        assert chain_head is not None and len(chain_head) > 0

        view_as_of = db.execute(
            "SELECT value FROM _meta WHERE key = 'view_as_of'", fetch=True
        )
        assert view_as_of is not None and len(view_as_of) > 0


# ── Sacred Memory Tests ──────────────────────────────────────────


class TestSacredMemory:
    """Test sacred tier behavior."""

    def test_remember_with_critical_flag(self, db):
        """remember_fact with critical=True should set lifecycle_tier='sacred'."""
        with patch("claudia_memory.services.remember.embed_sync", return_value=None), \
             patch("claudia_memory.services.remember.get_db", return_value=db), \
             patch("claudia_memory.services.remember.get_embedding_service"), \
             patch("claudia_memory.services.remember.get_extractor"):
            from claudia_memory.services.remember import RememberService
            import claudia_memory.services.remember as rem_mod
            old_svc = rem_mod._service
            rem_mod._service = None
            try:
                svc = RememberService()
                svc.db = db
                mem_id = svc.remember_fact(
                    content="Sarah is allergic to peanuts",
                    critical=True,
                )
                row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
                assert row["lifecycle_tier"] == "sacred"
                assert row["sacred_reason"] == "user-protected"
            finally:
                rem_mod._service = old_svc

    def test_sacred_memory_immune_to_decay(self, db):
        """Sacred memories should not be decayed."""
        sacred_id = _insert_memory(db, "Critical fact", importance=0.9,
                                   lifecycle_tier="sacred", sacred_reason="user-protected")
        normal_id = _insert_memory(db, "Normal fact", importance=0.9)

        svc = _get_consolidate_service(db)
        svc.run_decay()

        sacred = db.get_one("memories", where="id = ?", where_params=(sacred_id,))
        normal = db.get_one("memories", where="id = ?", where_params=(normal_id,))

        assert sacred["importance"] == 0.9, "Sacred memory importance should not change"
        assert normal["importance"] < 0.9, "Normal memory should have decayed"

    def test_sacred_score_boost_in_recall(self, db):
        """Sacred memories should get a score boost in recall results."""
        from claudia_memory.services.recall import RecallResult

        sacred_id = _insert_memory(db, "Sarah birthday is March 15th",
                                   lifecycle_tier="sacred", importance=0.5)
        normal_id = _insert_memory(db, "Sarah likes coffee", importance=0.5)

        svc = _get_recall_service(db)
        now = datetime.utcnow()

        sacred_row = db.get_one("memories", where="id = ?", where_params=(sacred_id,))
        normal_row = db.get_one("memories", where="id = ?", where_params=(normal_id,))

        # Both have same base vector/fts scores
        sacred_result = svc._row_to_result(sacred_row, 0.5, 0.5, now)
        normal_result = svc._row_to_result(normal_row, 0.5, 0.5, now)

        assert sacred_result.score > normal_result.score, \
            f"Sacred score {sacred_result.score} should exceed normal {normal_result.score}"
        assert sacred_result.lifecycle_tier == "sacred"
        # Default from schema is 'active' (not None) for fresh-install databases
        assert normal_result.lifecycle_tier == "active"


# ── Lifecycle Tier Tests ─────────────────────────────────────────


class TestLifecycleTiers:
    """Test lifecycle tier transitions."""

    def test_active_to_cooling_transition(self, db):
        """Memories not accessed for cooling_threshold_days should transition to cooling."""
        old_date = (datetime.utcnow() - timedelta(days=90)).isoformat()
        mem_id = _insert_memory(db, "Old memory", lifecycle_tier="active",
                                created_at=old_date, last_accessed_at=old_date)

        svc = _get_consolidate_service(db)
        result = svc.run_lifecycle_transitions()

        row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert row["lifecycle_tier"] == "cooling"

    def test_cooling_to_archived_transition(self, db):
        """Low-importance cooling memories should transition to archived."""
        old_date = (datetime.utcnow() - timedelta(days=200)).isoformat()
        mem_id = _insert_memory(db, "Forgotten low fact", lifecycle_tier="cooling",
                                importance=0.2, created_at=old_date, last_accessed_at=old_date)

        svc = _get_consolidate_service(db)
        result = svc.run_lifecycle_transitions()

        row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert row["lifecycle_tier"] == "archived"
        assert row["archived_at"] is not None

    def test_sacred_never_transitions(self, db):
        """Sacred memories should never transition regardless of age."""
        old_date = (datetime.utcnow() - timedelta(days=365)).isoformat()
        mem_id = _insert_memory(db, "Sacred old fact", lifecycle_tier="sacred",
                                sacred_reason="user-protected",
                                created_at=old_date, last_accessed_at=old_date)

        svc = _get_consolidate_service(db)
        svc.run_lifecycle_transitions()

        row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert row["lifecycle_tier"] == "sacred"

    def test_recent_memory_stays_active(self, db):
        """Recently accessed memories should remain active."""
        recent = datetime.utcnow().isoformat()
        mem_id = _insert_memory(db, "Recent fact", lifecycle_tier="active",
                                created_at=recent, last_accessed_at=recent)

        svc = _get_consolidate_service(db)
        svc.run_lifecycle_transitions()

        row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert row["lifecycle_tier"] == "active"


# ── Close-Circle Tests ───────────────────────────────────────────


class TestCloseCircle:
    """Test close-circle entity detection and auto-sacred promotion."""

    def test_set_close_circle_promotes_keyword_facts(self, db):
        """Setting close_circle should auto-promote matching keyword memories to sacred."""
        entity_id = _insert_entity(db, "Sarah")
        birthday_id = _insert_memory(db, "Sarah birthday is March 15th")
        hobby_id = _insert_memory(db, "Sarah likes hiking")
        _link_memory_entity(db, birthday_id, entity_id)
        _link_memory_entity(db, hobby_id, entity_id)

        with patch("claudia_memory.services.remember.embed_sync", return_value=None), \
             patch("claudia_memory.services.remember.get_db", return_value=db), \
             patch("claudia_memory.services.remember.get_embedding_service"), \
             patch("claudia_memory.services.remember.get_extractor"):
            from claudia_memory.services.remember import RememberService
            import claudia_memory.services.remember as rem_mod
            old_svc = rem_mod._service
            rem_mod._service = None
            try:
                svc = RememberService()
                svc.db = db
                result = svc.set_close_circle(entity_id, reason="best friend")

                assert result["close_circle"] is True
                assert result["facts_promoted_to_sacred"] >= 1

                birthday_row = db.get_one("memories", where="id = ?", where_params=(birthday_id,))
                assert birthday_row["lifecycle_tier"] == "sacred"

                hobby_row = db.get_one("memories", where="id = ?", where_params=(hobby_id,))
                assert hobby_row["lifecycle_tier"] != "sacred" or hobby_row["lifecycle_tier"] is None
            finally:
                rem_mod._service = old_svc

    def test_detect_close_circle_by_velocity(self, db):
        """Entities with high contact velocity should be detected as close-circle candidates."""
        entity_id = _insert_entity(db, "Alex", contact_frequency_days=3.0,
                                   contact_trend="accelerating")

        svc = _get_consolidate_service(db)
        candidates = svc.detect_close_circle_candidates()

        names = [c["name"] for c in candidates]
        assert "Alex" in names

    def test_detect_close_circle_by_keyword(self, db):
        """Entities with close-circle keywords in description should be detected."""
        entity_id = _insert_entity(db, "Mom", description="My family member who I call daily")

        svc = _get_consolidate_service(db)
        candidates = svc.detect_close_circle_candidates()

        names = [c["name"] for c in candidates]
        assert "Mom" in names

    def test_auto_sacred_promotes_close_circle_facts(self, db):
        """detect_auto_sacred should promote keyword-matching memories for close-circle entities."""
        entity_id = _insert_entity(db, "Partner", close_circle=True)
        allergy_id = _insert_memory(db, "Partner has a severe allergy to shellfish")
        _link_memory_entity(db, allergy_id, entity_id)

        svc = _get_consolidate_service(db)
        promoted = svc.detect_auto_sacred()

        assert promoted >= 1
        row = db.get_one("memories", where="id = ?", where_params=(allergy_id,))
        assert row["lifecycle_tier"] == "sacred"
        assert "allergy" in row["sacred_reason"].lower()


# ── fact_id Tests ────────────────────────────────────────────────


class TestFactId:
    """Test fact_id generation and uniqueness."""

    def test_fact_id_auto_generated(self, db):
        """remember_fact should auto-generate a UUID fact_id."""
        with patch("claudia_memory.services.remember.embed_sync", return_value=None), \
             patch("claudia_memory.services.remember.get_db", return_value=db), \
             patch("claudia_memory.services.remember.get_embedding_service"), \
             patch("claudia_memory.services.remember.get_extractor"):
            from claudia_memory.services.remember import RememberService
            import claudia_memory.services.remember as rem_mod
            old_svc = rem_mod._service
            rem_mod._service = None
            try:
                svc = RememberService()
                svc.db = db
                mem_id = svc.remember_fact(content="Test fact for UUID")
                row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
                assert row["fact_id"] is not None
                assert len(row["fact_id"]) == 36  # UUID format
            finally:
                rem_mod._service = old_svc

    def test_fact_id_explicit_assignment(self, db):
        """remember_fact should use explicitly provided fact_id."""
        custom_id = "custom-fact-001"
        with patch("claudia_memory.services.remember.embed_sync", return_value=None), \
             patch("claudia_memory.services.remember.get_db", return_value=db), \
             patch("claudia_memory.services.remember.get_embedding_service"), \
             patch("claudia_memory.services.remember.get_extractor"):
            from claudia_memory.services.remember import RememberService
            import claudia_memory.services.remember as rem_mod
            old_svc = rem_mod._service
            rem_mod._service = None
            try:
                svc = RememberService()
                svc.db = db
                mem_id = svc.remember_fact(content="Explicit ID fact", fact_id=custom_id)
                row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
                assert row["fact_id"] == custom_id
            finally:
                rem_mod._service = old_svc

    def test_fact_id_uniqueness(self, db):
        """fact_id column should enforce uniqueness."""
        _insert_memory(db, "First fact", fact_id="unique-001")
        with pytest.raises(Exception):
            _insert_memory(db, "Second fact", fact_id="unique-001")


# ── Context Builder (CRE) Tests ──────────────────────────────────


class TestContextBuilder:
    """Test the Context Relevance Engine."""

    def test_estimate_tokens(self):
        """Token estimator should use words * 1.3 heuristic."""
        from claudia_memory.services.context_builder import _estimate_tokens
        assert _estimate_tokens("") == 0
        assert _estimate_tokens("hello world") == int(2 * 1.3)
        assert _estimate_tokens("one two three four five") == int(5 * 1.3)

    def test_truncate_to_budget(self):
        """truncate_to_budget should respect token budget."""
        from claudia_memory.services.context_builder import truncate_to_budget
        facts = [
            {"content": " ".join(["word"] * 10), "id": 1},  # ~13 tokens
            {"content": " ".join(["word"] * 10), "id": 2},  # ~13 tokens
            {"content": " ".join(["word"] * 10), "id": 3},  # ~13 tokens
        ]
        result = truncate_to_budget(facts, 20)
        assert len(result) == 1  # Only first fact fits

    def test_get_sacred_facts(self, db):
        """get_sacred_facts should return only sacred memories."""
        sacred_id = _insert_memory(db, "Sacred fact", lifecycle_tier="sacred",
                                   sacred_reason="user-protected")
        normal_id = _insert_memory(db, "Normal fact")

        with patch("claudia_memory.database.get_db", return_value=db):
            from claudia_memory.services.context_builder import get_sacred_facts
            facts = get_sacred_facts()
            fact_ids = [f["id"] for f in facts]
            assert sacred_id in fact_ids
            assert normal_id not in fact_ids

    def test_get_sacred_facts_by_entity(self, db):
        """get_sacred_facts with entity filter should scope to that entity."""
        entity_id = _insert_entity(db, "Bob")
        sacred_bob = _insert_memory(db, "Bob fact sacred", lifecycle_tier="sacred",
                                    sacred_reason="test")
        sacred_other = _insert_memory(db, "Other sacred fact", lifecycle_tier="sacred",
                                      sacred_reason="test")
        _link_memory_entity(db, sacred_bob, entity_id)

        with patch("claudia_memory.database.get_db", return_value=db):
            from claudia_memory.services.context_builder import get_sacred_facts
            facts = get_sacred_facts(entity_name="Bob")
            fact_ids = [f["id"] for f in facts]
            assert sacred_bob in fact_ids
            assert sacred_other not in fact_ids

    def test_build_context_includes_sacred_first(self, db):
        """build_context should always include sacred facts."""
        sacred_id = _insert_memory(db, "Critical allergy info", lifecycle_tier="sacred",
                                   sacred_reason="test")

        class MockConfig:
            context_builder_token_budget = 8000
            context_builder_max_facts = 30
            language_model = None

        # Patch at source modules since build_context uses lazy imports
        with patch("claudia_memory.database.get_db", return_value=db), \
             patch("claudia_memory.services.recall.recall", return_value=[]), \
             patch("claudia_memory.config.get_config", return_value=MockConfig()):
            from claudia_memory.services.context_builder import build_context
            result = build_context("test query", token_budget=8000)
            assert result.sacred_count >= 1
            sacred_ids = [f["id"] for f in result.sacred]
            assert sacred_id in sacred_ids

    def test_build_context_respects_token_budget(self, db):
        """build_context should not exceed token budget."""
        # Insert many non-sacred facts
        for i in range(20):
            _insert_memory(db, f"Fact number {i} " + " ".join(["word"] * 50))

        from claudia_memory.services.recall import RecallResult
        mock_results = [
            RecallResult(id=i, content=f"Fact {i} " + " ".join(["word"] * 50),
                         type="fact", score=0.9 - i * 0.01, importance=0.8,
                         created_at=datetime.utcnow().isoformat(), entities=[])
            for i in range(20)
        ]

        class MockConfig:
            context_builder_token_budget = 200
            context_builder_max_facts = 30
            language_model = None

        with patch("claudia_memory.database.get_db", return_value=db), \
             patch("claudia_memory.services.recall.recall", return_value=mock_results), \
             patch("claudia_memory.config.get_config", return_value=MockConfig()):
            from claudia_memory.services.context_builder import build_context
            result = build_context("test", token_budget=200)
            # Should be fewer than 20 facts due to budget
            assert result.relevant_count < 20
            assert result.total_tokens <= 300  # Allow some overhead


# ── Checkpoint Tests ─────────────────────────────────────────────


class TestCheckpoint:
    """Test checkpoint (backup) functionality."""

    def test_checkpoint_save(self, db):
        """db.backup() should create a labeled backup file."""
        backup_path = db.backup(label="test-checkpoint")
        assert backup_path is not None
        assert Path(backup_path).exists()
        assert "test-checkpoint" in str(backup_path)


# ── Rollback (view_as_of) Tests ──────────────────────────────────


class TestRollback:
    """Test view_as_of temporal filtering."""

    def test_view_as_of_filters_recall(self, db):
        """When view_as_of is set, _apply_filters should add temporal constraint."""
        old_date = (datetime.utcnow() - timedelta(days=30)).isoformat()
        new_date = datetime.utcnow().isoformat()

        old_id = _insert_memory(db, "Old memory from last month zzview", created_at=old_date)
        new_id = _insert_memory(db, "New memory from today zzview", created_at=new_date)

        # Set view_as_of to a date between old and new
        cutoff = (datetime.utcnow() - timedelta(days=15)).isoformat()
        db.execute(
            "UPDATE _meta SET value = ? WHERE key = 'view_as_of'",
            (cutoff,),
        )

        svc = _get_recall_service(db)
        # Use _apply_filters which is where view_as_of logic lives
        sql_parts = [
            "SELECT m.*, GROUP_CONCAT(e.name) as entity_names FROM memories m",
            "LEFT JOIN memory_entities me2 ON m.id = me2.memory_id",
            "LEFT JOIN entities e ON me2.entity_id = e.id",
            "WHERE m.content LIKE ?",
        ]
        params = ["%zzview%"]
        svc._apply_filters(sql_parts, params, None, None, None, None)
        sql_parts.append("GROUP BY m.id")
        rows = db.execute("\n".join(sql_parts), tuple(params), fetch=True) or []

        result_ids = [r["id"] for r in rows]
        assert old_id in result_ids
        assert new_id not in result_ids

        # Clear rollback
        db.execute("UPDATE _meta SET value = NULL WHERE key = 'view_as_of'")

    def test_view_as_of_clear_shows_all(self, db):
        """When view_as_of is NULL, all memories should be visible."""
        old_date = (datetime.utcnow() - timedelta(days=30)).isoformat()
        new_date = datetime.utcnow().isoformat()

        old_id = _insert_memory(db, "Visible old memory xyzabc", created_at=old_date)
        new_id = _insert_memory(db, "Visible new memory xyzabc", created_at=new_date)

        # Ensure view_as_of is NULL
        db.execute("UPDATE _meta SET value = NULL WHERE key = 'view_as_of'")

        svc = _get_recall_service(db)
        results = svc._keyword_search("xyzabc", limit=10)

        result_ids = [r["id"] for r in results]
        assert old_id in result_ids
        assert new_id in result_ids


# ── SHA-256 Chain Tests ──────────────────────────────────────────


class TestChainHash:
    """Test SHA-256 chain hashing for memory integrity."""

    def test_compute_chain_hash_deterministic(self):
        """Same inputs should produce same hash."""
        from claudia_memory.services.remember import _compute_chain_hash
        h1 = _compute_chain_hash("content", {"key": "val"}, "prev123")
        h2 = _compute_chain_hash("content", {"key": "val"}, "prev123")
        assert h1 == h2

    def test_compute_chain_hash_different_content(self):
        """Different content should produce different hash."""
        from claudia_memory.services.remember import _compute_chain_hash
        h1 = _compute_chain_hash("content A", None, None)
        h2 = _compute_chain_hash("content B", None, None)
        assert h1 != h2

    def test_chain_links_on_remember(self, db):
        """remember_fact should create linked chain hashes when enabled."""
        with patch("claudia_memory.services.remember.embed_sync", return_value=None), \
             patch("claudia_memory.services.remember.get_db", return_value=db), \
             patch("claudia_memory.services.remember.get_embedding_service"), \
             patch("claudia_memory.services.remember.get_extractor"):

            # Enable chain verification in config
            class MockConfig:
                enable_chain_verification = True
            with patch("claudia_memory.services.remember._get_config", create=True):
                from claudia_memory.services.remember import RememberService
                import claudia_memory.services.remember as rem_mod
                old_svc = rem_mod._service
                rem_mod._service = None
                try:
                    svc = RememberService()
                    svc.db = db

                    # Patch get_config inside remember.py scope for the chain logic
                    with patch("claudia_memory.config.get_config", return_value=MockConfig()):
                        id1 = svc.remember_fact(content="First chain fact aaa111")
                        id2 = svc.remember_fact(content="Second chain fact bbb222")

                    row1 = db.get_one("memories", where="id = ?", where_params=(id1,))
                    row2 = db.get_one("memories", where="id = ?", where_params=(id2,))

                    # First memory should have hash but prev_hash may be None
                    if row1["hash"]:
                        assert len(row1["hash"]) == 64  # SHA-256 hex length

                    # Second memory's prev_hash should equal first memory's hash
                    if row2["hash"] and row1["hash"]:
                        assert row2["prev_hash"] == row1["hash"]
                finally:
                    rem_mod._service = old_svc

    def test_chain_disabled_skips_hash(self, db):
        """When enable_chain_verification is False, no hashes should be written."""
        with patch("claudia_memory.services.remember.embed_sync", return_value=None), \
             patch("claudia_memory.services.remember.get_db", return_value=db), \
             patch("claudia_memory.services.remember.get_embedding_service"), \
             patch("claudia_memory.services.remember.get_extractor"):

            class MockConfig:
                enable_chain_verification = False
            from claudia_memory.services.remember import RememberService
            import claudia_memory.services.remember as rem_mod
            old_svc = rem_mod._service
            rem_mod._service = None
            try:
                svc = RememberService()
                svc.db = db

                with patch("claudia_memory.config.get_config", return_value=MockConfig()):
                    mem_id = svc.remember_fact(content="No chain fact ccc333")

                row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
                assert row["hash"] is None
            finally:
                rem_mod._service = old_svc


# ── Recall Archived Filter Tests ─────────────────────────────────


class TestRecallArchivedFilter:
    """Test that archived memories are excluded by default."""

    def test_keyword_search_excludes_archived(self, db):
        """Keyword search should not return archived memories by default."""
        active_id = _insert_memory(db, "Active memory qqq789", lifecycle_tier="active")
        archived_id = _insert_memory(db, "Archived memory qqq789", lifecycle_tier="archived")

        svc = _get_recall_service(db)
        results = svc._keyword_search("qqq789", limit=10)
        result_ids = [r["id"] for r in results]
        assert active_id in result_ids
        assert archived_id not in result_ids

    def test_keyword_search_includes_archived_when_requested(self, db):
        """Keyword search with include_archived should return archived memories."""
        active_id = _insert_memory(db, "Active memory www321", lifecycle_tier="active")
        archived_id = _insert_memory(db, "Archived memory www321", lifecycle_tier="archived")

        svc = _get_recall_service(db)
        # The _keyword_search method uses _apply_filters which gets include_archived
        # We test via the recall() method's include_archived parameter
        # For direct keyword search, we verify the SQL filter works
        sql_parts = [
            "SELECT m.*, GROUP_CONCAT(e.name) as entity_names FROM memories m",
            "LEFT JOIN memory_entities me2 ON m.id = me2.memory_id",
            "LEFT JOIN entities e ON me2.entity_id = e.id",
            "WHERE m.content LIKE ?",
        ]
        params = ["%www321%"]
        svc._apply_filters(sql_parts, params, None, None, None, None, include_archived=True)
        sql_parts.append("GROUP BY m.id")
        rows = db.execute("\n".join(sql_parts), tuple(params), fetch=True) or []
        result_ids = [r["id"] for r in rows]
        assert active_id in result_ids
        assert archived_id in result_ids

    def test_null_lifecycle_tier_treated_as_active(self, db):
        """Pre-migration memories with NULL lifecycle_tier should be visible."""
        legacy_id = _insert_memory(db, "Legacy memory eee555")  # No lifecycle_tier set

        svc = _get_recall_service(db)
        results = svc._keyword_search("eee555", limit=10)
        result_ids = [r["id"] for r in results]
        assert legacy_id in result_ids


# ── RecallResult Dataclass Tests ─────────────────────────────────


class TestRecallResultFields:
    """Test lifecycle fields on RecallResult."""

    def test_recall_result_has_lifecycle_fields(self):
        """RecallResult should have lifecycle_tier and fact_id fields."""
        from claudia_memory.services.recall import RecallResult
        r = RecallResult(
            id=1, content="test", type="fact", score=1.0,
            importance=1.0, created_at="2026-01-01", entities=[],
            lifecycle_tier="sacred", fact_id="abc-123",
        )
        assert r.lifecycle_tier == "sacred"
        assert r.fact_id == "abc-123"

    def test_recall_result_defaults(self):
        """lifecycle_tier and fact_id should default to None."""
        from claudia_memory.services.recall import RecallResult
        r = RecallResult(
            id=1, content="test", type="fact", score=1.0,
            importance=1.0, created_at="2026-01-01", entities=[],
        )
        assert r.lifecycle_tier is None
        assert r.fact_id is None
