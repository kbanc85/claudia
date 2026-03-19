"""Tests for fuzzy name matching in consolidation auto-dedup.

Fix 3 (Discussion #25): The overnight dedup uses embedding KNN and alias
overlap but never does fuzzy name comparison. Entities created before the
write-time fuzzy check were never retroactively compared.
"""

from datetime import datetime

import pytest


def _insert_entity(db, name, entity_type="person", importance=1.0, deleted=False):
    """Insert an entity for dedup testing."""
    data = {
        "name": name,
        "type": entity_type,
        "canonical_name": name.lower(),
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    if deleted:
        data["deleted_at"] = datetime.utcnow().isoformat()
    return db.insert("entities", data)


def _get_consolidation_service(db):
    """Create a ConsolidateService with test database."""
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


class TestFuzzyNameDedup:
    """Method 3: fuzzy name comparison across same-type entity pairs."""

    def test_typo_detected_as_candidate(self, db):
        """'Kris Krisko' vs 'Kris Krisco' should be detected (similarity >= 0.90)."""
        _insert_entity(db, "Kris Krisko", "person")
        _insert_entity(db, "Kris Krisco", "person")

        svc = _get_consolidation_service(db)
        candidates = svc.auto_dedupe_entities()

        fuzzy_candidates = [c for c in candidates if c["method"] == "fuzzy_name"]
        assert len(fuzzy_candidates) >= 1
        names = {fuzzy_candidates[0]["entity_1"]["name"], fuzzy_candidates[0]["entity_2"]["name"]}
        assert names == {"Kris Krisko", "Kris Krisco"}

    def test_different_names_not_detected(self, db):
        """'Sarah Johnson' vs 'Sarah Chen' should NOT be detected."""
        _insert_entity(db, "Sarah Johnson", "person")
        _insert_entity(db, "Sarah Chen", "person")

        svc = _get_consolidation_service(db)
        candidates = svc.auto_dedupe_entities()

        fuzzy_candidates = [c for c in candidates if c["method"] == "fuzzy_name"]
        # These names are too different to match
        pair_names = [
            {c["entity_1"]["name"], c["entity_2"]["name"]}
            for c in fuzzy_candidates
        ]
        assert {"Sarah Johnson", "Sarah Chen"} not in pair_names

    def test_cross_type_ignored(self, db):
        """Same name across different types should not be detected."""
        _insert_entity(db, "Phoenix", "person")
        _insert_entity(db, "Phoenix", "project")

        svc = _get_consolidation_service(db)
        candidates = svc.auto_dedupe_entities()

        fuzzy_candidates = [c for c in candidates if c["method"] == "fuzzy_name"]
        assert len(fuzzy_candidates) == 0

    def test_deleted_entities_excluded(self, db):
        """Deleted entities should not be considered for fuzzy matching."""
        _insert_entity(db, "Kris Krisko", "person")
        _insert_entity(db, "Kris Krisco", "person", deleted=True)

        svc = _get_consolidation_service(db)
        candidates = svc.auto_dedupe_entities()

        fuzzy_candidates = [c for c in candidates if c["method"] == "fuzzy_name"]
        assert len(fuzzy_candidates) == 0

    def test_prefix_match_detected(self, db):
        """'Sarah' vs 'Sarah Johnson' should be detected as prefix match."""
        _insert_entity(db, "Sarah", "person")
        _insert_entity(db, "Sarah Johnson", "person")

        svc = _get_consolidation_service(db)
        candidates = svc.auto_dedupe_entities()

        prefix_candidates = [c for c in candidates if c["method"] == "fuzzy_name_prefix"]
        assert len(prefix_candidates) >= 1

    def test_short_prefix_ignored(self, db):
        """Very short names (< 3 chars) should not trigger prefix matching."""
        _insert_entity(db, "Al", "person")
        _insert_entity(db, "Albert Einstein", "person")

        svc = _get_consolidation_service(db)
        candidates = svc.auto_dedupe_entities()

        prefix_candidates = [c for c in candidates if c["method"] == "fuzzy_name_prefix"]
        pair_names = [
            {c["entity_1"]["name"], c["entity_2"]["name"]}
            for c in prefix_candidates
        ]
        assert {"Al", "Albert Einstein"} not in pair_names

    def test_candidates_stored_as_predictions(self, db):
        """Fuzzy name candidates should be stored in predictions table for review."""
        _insert_entity(db, "Kris Krisko", "person")
        _insert_entity(db, "Kris Krisco", "person")

        svc = _get_consolidation_service(db)
        svc.auto_dedupe_entities()

        predictions = db.execute(
            "SELECT * FROM predictions WHERE prediction_type = 'suggestion'",
            fetch=True,
        ) or []
        # At least one prediction should reference these entities
        assert len(predictions) >= 1

    def test_no_auto_merge(self, db):
        """Fuzzy dedup is advisory only: entities remain separate."""
        id1 = _insert_entity(db, "Kris Krisko", "person")
        id2 = _insert_entity(db, "Kris Krisco", "person")

        svc = _get_consolidation_service(db)
        svc.auto_dedupe_entities()

        # Both entities should still exist
        e1 = db.get_one("entities", where="id = ?", where_params=(id1,))
        e2 = db.get_one("entities", where="id = ?", where_params=(id2,))
        assert e1 is not None
        assert e2 is not None
        assert e1["deleted_at"] is None
        assert e2["deleted_at"] is None
