"""Tests for dynamic alias specificity scoring in auto_dedupe_entities().

Issue #27: Replace the hard-coded 0.95 alias overlap score with a dynamic
score based on how many entities share a given alias. Rare aliases (shared
by few entities) should score higher than common ones.

Scoring formula:
  specificity = 1.0 / total_entities_sharing_alias
  score = 0.70 + 0.25 * specificity
  bonus: +0.10 for multi-token aliases (e.g. "joel martinez")
  clamped to [0.70, 0.95]
"""
import pytest


def _insert_entity(db, name, etype="person"):
    """Insert an entity and return its ID."""
    db.execute(
        "INSERT INTO entities (name, canonical_name, type, importance) "
        "VALUES (?, ?, ?, 0.5)",
        params=(name, name.lower(), etype),
    )
    row = db.execute(
        "SELECT id FROM entities WHERE name = ?",
        params=(name,),
        fetch=True,
    )
    return row[0]["id"]


def _insert_alias(db, entity_id, alias):
    """Insert a canonical alias for an entity."""
    db.execute(
        "INSERT INTO entity_aliases (entity_id, alias, canonical_alias) VALUES (?, ?, ?)",
        params=(entity_id, alias, alias.lower()),
    )


def _get_svc(db):
    """Create a ConsolidateService wired to the test database."""
    from claudia_memory.services.consolidate import ConsolidateService
    from claudia_memory.config import MemoryConfig
    config = MemoryConfig()
    config.enable_auto_dedupe = True
    config.auto_dedupe_threshold = 0.90
    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db
    svc.config = config
    svc._embedder = None
    svc.embedding_service = None
    return svc


def _run_dedupe(db):
    """Run auto_dedupe_entities and return the alias_overlap candidates."""
    svc = _get_svc(db)
    candidates = svc.auto_dedupe_entities()
    return [c for c in candidates if c.get("method") == "alias_overlap"]


class TestAliasSpecificityScoring:
    """Tests for dynamic alias overlap scoring."""

    def test_two_entities_shared_alias_score(self, db):
        """Two entities sharing a unique multi-token alias should get a high score."""
        eid1 = _insert_entity(db, "Joel Martinez")
        eid2 = _insert_entity(db, "Joel Martinez (Beemok)")
        _insert_alias(db, eid1, "joel martinez")
        _insert_alias(db, eid2, "joel martinez")

        results = _run_dedupe(db)
        alias_results = [r for r in results if r.get("shared_alias") == "joel martinez"]
        assert len(alias_results) == 1
        score = alias_results[0]["similarity"]
        # Multi-token alias shared by 2: specificity=0.5, base=0.70+0.25*0.5=0.825, +0.10 bonus = 0.925
        # Clamped to 0.95 max
        assert 0.90 <= score <= 0.95, f"Expected high score for rare multi-token alias, got {score}"

    def test_common_alias_scores_lower(self, db):
        """An alias shared by many entities should produce a lower score."""
        ids = []
        for i in range(5):
            eid = _insert_entity(db, f"Smith Person {i}")
            _insert_alias(db, eid, "smith")
            ids.append(eid)

        results = _run_dedupe(db)
        alias_results = [r for r in results if r.get("shared_alias") == "smith"]
        if alias_results:
            # With 5 entities sharing "smith": specificity=0.2, score=0.70+0.25*0.2=0.75
            for r in alias_results:
                assert r["similarity"] < 0.85, (
                    f"Common alias 'smith' shared by 5 entities should score < 0.85, got {r['similarity']}"
                )

    def test_multi_token_bonus(self, db):
        """Multi-token aliases should score higher than single-token aliases (all else equal)."""
        # Two entities sharing a multi-token alias
        eid1 = _insert_entity(db, "John Smith A")
        eid2 = _insert_entity(db, "John Smith B")
        _insert_alias(db, eid1, "john smith")
        _insert_alias(db, eid2, "john smith")

        # Two entities sharing a single-token alias
        eid3 = _insert_entity(db, "Michael Johnson A")
        eid4 = _insert_entity(db, "Michael Johnson B")
        _insert_alias(db, eid3, "johnson")
        _insert_alias(db, eid4, "johnson")

        results = _run_dedupe(db)
        multi_results = [r for r in results if r.get("shared_alias") == "john smith"]
        single_results = [r for r in results if r.get("shared_alias") == "johnson"]

        # Both should exist (multi-token alias isn't filtered by single-token filter)
        assert len(multi_results) >= 1, "Multi-token alias pair should produce a candidate"
        # Single-token filter may skip "johnson" if names diverge too much.
        # If both exist, multi-token should score higher.
        if single_results:
            assert multi_results[0]["similarity"] > single_results[0]["similarity"], (
                f"Multi-token alias should score higher: {multi_results[0]['similarity']} "
                f"vs {single_results[0]['similarity']}"
            )

    def test_score_clamped_to_range(self, db):
        """Scores should always be between 0.70 and 0.95."""
        eid1 = _insert_entity(db, "Unique Person Alpha")
        eid2 = _insert_entity(db, "Unique Person Beta")
        _insert_alias(db, eid1, "unique person")
        _insert_alias(db, eid2, "unique person")

        results = _run_dedupe(db)
        alias_results = [r for r in results if r.get("shared_alias") == "unique person"]
        assert len(alias_results) == 1
        score = alias_results[0]["similarity"]
        assert 0.70 <= score <= 0.95, f"Score {score} outside clamped range [0.70, 0.95]"

    def test_no_longer_hardcoded_095(self, db):
        """Verify the old hard-coded 0.95 is no longer used for all alias overlaps."""
        # Create several pairs to test that not all get exactly 0.95
        for i in range(3):
            eid = _insert_entity(db, f"Common Name {i}")
            _insert_alias(db, eid, "common")

        results = _run_dedupe(db)
        alias_results = [r for r in results if r.get("shared_alias") == "common"]
        scores = [r["similarity"] for r in alias_results]
        # With 3 entities sharing "common": specificity=0.333, score=0.70+0.25*0.333=0.783
        # None should be exactly 0.95
        for s in scores:
            assert s != 0.95, f"Score should not be hard-coded 0.95 anymore, got {s}"
