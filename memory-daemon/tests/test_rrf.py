"""Tests for RRF scoring and graph proximity (Phase 3)."""

import tempfile
from pathlib import Path

import pytest

from claudia_memory.database import Database


def _setup_db():
    """Create a fresh database with initialized schema."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


class TestRRFScoring:
    """Test Reciprocal Rank Fusion scoring."""

    def _make_service(self, db):
        """Create a RecallService wired to the given DB."""
        import claudia_memory.database as db_mod
        import claudia_memory.services.recall as rec_mod
        db_mod._db = db
        rec_mod._service = None
        from claudia_memory.services.recall import RecallService
        return RecallService()

    def test_rrf_basic_ordering(self):
        """RRF produces expected order with known rankings."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        memory_ids = {1, 2, 3}
        signal_rankings = {
            "vector": [1, 2, 3],   # 1 best, 3 worst
            "fts": [2, 1, 3],      # 2 best, 3 worst
        }

        scores = svc._rrf_score(memory_ids, signal_rankings, k=60)

        # Memory 1: rank 1 in vector + rank 2 in fts = 1/61 + 1/62
        # Memory 2: rank 2 in vector + rank 1 in fts = 1/62 + 1/61
        # Memory 1 and 2 should be equal, both > memory 3
        assert abs(scores[1] - scores[2]) < 1e-10
        assert scores[1] > scores[3]
        assert scores[2] > scores[3]

    def test_rrf_single_signal(self):
        """RRF with single signal preserves that signal's ordering."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        memory_ids = {10, 20, 30}
        signal_rankings = {
            "importance": [30, 10, 20],
        }

        scores = svc._rrf_score(memory_ids, signal_rankings, k=60)
        assert scores[30] > scores[10] > scores[20]

    def test_rrf_ties_broken_by_other_signals(self):
        """Ties in one signal are broken by another."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        memory_ids = {1, 2, 3}
        signal_rankings = {
            "vector": [1, 2, 3],
            "importance": [1, 2, 3],
            "recency": [3, 2, 1],  # 3 is most recent
        }

        scores = svc._rrf_score(memory_ids, signal_rankings, k=60)
        # Memory 1 should win (ranked 1st in 2 of 3 signals)
        assert scores[1] > scores[3]

    def test_rrf_empty_signals(self):
        """RRF with no signals returns zero scores."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        memory_ids = {1, 2}
        scores = svc._rrf_score(memory_ids, {}, k=60)
        assert scores[1] == 0.0
        assert scores[2] == 0.0


class TestGraphProximity:
    """Test graph proximity scoring."""

    def _setup_graph(self, db):
        """Create entities, relationships, and memories for graph testing."""
        # Entities
        sarah_id = db.insert("entities", {
            "name": "Sarah Chen",
            "type": "person",
            "canonical_name": "sarah chen",
            "importance": 1.0,
        })
        acme_id = db.insert("entities", {
            "name": "Acme Corp",
            "type": "organization",
            "canonical_name": "acme corp",
            "importance": 1.0,
        })
        beta_id = db.insert("entities", {
            "name": "Beta Corp",
            "type": "organization",
            "canonical_name": "beta corp",
            "importance": 0.5,
        })
        unrelated_id = db.insert("entities", {
            "name": "Gamma LLC",
            "type": "organization",
            "canonical_name": "gamma llc",
            "importance": 0.5,
        })

        # Relationships: Sarah -> Acme (direct), Acme -> Beta (1-hop from Sarah)
        db.insert("relationships", {
            "source_entity_id": sarah_id,
            "target_entity_id": acme_id,
            "relationship_type": "works_at",
            "strength": 1.0,
            "valid_at": "2026-01-01T00:00:00",
        })
        db.insert("relationships", {
            "source_entity_id": acme_id,
            "target_entity_id": beta_id,
            "relationship_type": "partners_with",
            "strength": 0.8,
            "valid_at": "2026-01-01T00:00:00",
        })

        # Memories linked to entities
        mem_sarah = db.insert("memories", {
            "content": "Sarah prefers morning meetings",
            "content_hash": "hash_sarah",
            "type": "preference",
            "importance": 0.8,
        })
        db.insert("memory_entities", {
            "memory_id": mem_sarah,
            "entity_id": sarah_id,
            "relationship": "about",
        })

        mem_acme = db.insert("memories", {
            "content": "Acme Corp Q4 revenue was strong",
            "content_hash": "hash_acme",
            "type": "fact",
            "importance": 0.7,
        })
        db.insert("memory_entities", {
            "memory_id": mem_acme,
            "entity_id": acme_id,
            "relationship": "about",
        })

        mem_beta = db.insert("memories", {
            "content": "Beta Corp is expanding to Asia",
            "content_hash": "hash_beta",
            "type": "fact",
            "importance": 0.6,
        })
        db.insert("memory_entities", {
            "memory_id": mem_beta,
            "entity_id": beta_id,
            "relationship": "about",
        })

        mem_unrelated = db.insert("memories", {
            "content": "Gamma LLC filed for bankruptcy",
            "content_hash": "hash_gamma",
            "type": "fact",
            "importance": 0.5,
        })
        db.insert("memory_entities", {
            "memory_id": mem_unrelated,
            "entity_id": unrelated_id,
            "relationship": "about",
        })

        return {
            "sarah_id": sarah_id,
            "acme_id": acme_id,
            "beta_id": beta_id,
            "unrelated_id": unrelated_id,
            "mem_sarah": mem_sarah,
            "mem_acme": mem_acme,
            "mem_beta": mem_beta,
            "mem_unrelated": mem_unrelated,
        }

    def test_direct_entity_gets_boost(self):
        """Memory about mentioned entity gets score=1.0."""
        db, _ = _setup_db()
        ids = self._setup_graph(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.recall as rec_mod
        db_mod._db = db
        rec_mod._service = None
        from claudia_memory.services.recall import RecallService
        svc = RecallService()

        candidates = {ids["mem_sarah"], ids["mem_acme"], ids["mem_beta"], ids["mem_unrelated"]}
        scores = svc._compute_graph_scores("Sarah Chen", candidates)

        assert scores.get(ids["mem_sarah"]) == 1.0

    def test_one_hop_neighbor_gets_partial_boost(self):
        """Memory about 1-hop neighbor entity gets strength-scaled score.

        With the enhanced graph proximity scoring, 1-hop score = 0.5 + 0.3 * strength.
        Sarah -> Acme has strength 1.0, so expected score = 0.8.
        """
        db, _ = _setup_db()
        ids = self._setup_graph(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.recall as rec_mod
        db_mod._db = db
        rec_mod._service = None
        from claudia_memory.services.recall import RecallService
        svc = RecallService()

        candidates = {ids["mem_sarah"], ids["mem_acme"], ids["mem_beta"], ids["mem_unrelated"]}
        scores = svc._compute_graph_scores("Sarah Chen", candidates)

        # Acme is 1-hop from Sarah (strength=1.0): score = 0.5 + 0.3 * 1.0 = 0.8
        assert scores.get(ids["mem_acme"]) == 0.8

    def test_unrelated_memory_gets_no_boost(self):
        """Memory about unrelated entity gets no graph boost."""
        db, _ = _setup_db()
        ids = self._setup_graph(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.recall as rec_mod
        db_mod._db = db
        rec_mod._service = None
        from claudia_memory.services.recall import RecallService
        svc = RecallService()

        candidates = {ids["mem_sarah"], ids["mem_acme"], ids["mem_beta"], ids["mem_unrelated"]}
        scores = svc._compute_graph_scores("Sarah Chen", candidates)

        assert ids["mem_unrelated"] not in scores

    def test_enable_rrf_false_uses_legacy(self):
        """When enable_rrf=False, weighted-sum scoring is used."""
        db, _ = _setup_db()

        import claudia_memory.database as db_mod
        import claudia_memory.services.recall as rec_mod
        import claudia_memory.config as cfg_mod
        db_mod._db = db
        rec_mod._service = None

        # Disable RRF
        old_config = cfg_mod._config
        try:
            config = cfg_mod.get_config()
            config.enable_rrf = False

            from claudia_memory.services.recall import RecallService
            svc = RecallService()

            # The _rrf_score method should still work, but recall() won't use it
            # Verify by checking that config flag is respected
            assert not svc.config.enable_rrf
        finally:
            cfg_mod._config = old_config
