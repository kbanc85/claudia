"""Tests for fuzzy entity dedup on write.

When storing a memory about "Kris Krisco" and "Kris Krisko" already exists
(same type), the system should return the existing entity instead of creating
a duplicate. Uses SequenceMatcher with threshold > 0.90.
"""

from datetime import datetime

import pytest


def _insert_entity(db, name, entity_type="person"):
    """Helper to insert an entity directly."""
    return db.insert("entities", {
        "name": name,
        "type": entity_type,
        "canonical_name": name.lower(),
        "importance": 1.0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _get_remember_service(db):
    """Create a RememberService with test database."""
    from claudia_memory.services.remember import RememberService
    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc._embedder = None
    from claudia_memory.extraction.entity_extractor import get_extractor
    svc.extractor = get_extractor()
    svc.embedding_service = None
    return svc


class TestFuzzyEntityDedup:
    """Tests for fuzzy matching in _ensure_entity and _find_or_create_entity."""

    def test_fuzzy_match_typo_variant(self, db):
        """'Kris Krisco' matches existing 'Kris Krisko' (same type)."""
        existing_id = _insert_entity(db, "Kris Krisko", "person")

        svc = _get_remember_service(db)
        result_id = svc._find_or_create_entity("Kris Krisco", "person")

        assert result_id == existing_id

    def test_fuzzy_no_match_different_names(self, db):
        """'Sarah Johnson' does NOT match 'Sarah Chen' (below threshold)."""
        _insert_entity(db, "Sarah Chen", "person")

        svc = _get_remember_service(db)
        result_id = svc._find_or_create_entity("Sarah Johnson", "person")

        # Should create a new entity (different enough)
        chen = db.get_one("entities", where="canonical_name = ?", where_params=("sarah chen",))
        assert result_id != chen["id"]

    def test_fuzzy_no_match_different_type(self, db):
        """Fuzzy match for 'Acme Corpo' (org) does NOT match 'Acme Corp' (person).

        The fuzzy matching filters by type, so a near-match of a different
        type should not be returned. We use a variant name to avoid the
        exact-match path (which doesn't filter by type by design).
        """
        _insert_entity(db, "Acme Corp", "organization")

        svc = _get_remember_service(db)
        # Use _ensure_entity which filters by type in both exact and fuzzy
        from claudia_memory.extraction.entity_extractor import ExtractedEntity
        extracted = ExtractedEntity(
            name="Acme Corpo",
            type="person",
            canonical_name="acme corpo",
            confidence=0.8,
            span=(0, 10),
        )
        result_id = svc._ensure_entity(extracted)

        org = db.get_one("entities", where="canonical_name = ? AND type = ?",
                         where_params=("acme corp", "organization"))
        assert result_id != org["id"]

    def test_ensure_entity_fuzzy_match(self, db):
        """_ensure_entity also fuzzy-matches typo variants."""
        from claudia_memory.extraction.entity_extractor import ExtractedEntity

        existing_id = _insert_entity(db, "Kris Krisko", "person")

        svc = _get_remember_service(db)
        extracted = ExtractedEntity(
            name="Kris Krisco",
            type="person",
            canonical_name="kris krisco",
            confidence=0.8,
            span=(0, 12),
        )
        result_id = svc._ensure_entity(extracted)

        assert result_id == existing_id

    def test_exact_match_still_works(self, db):
        """Exact canonical match takes priority over fuzzy."""
        existing_id = _insert_entity(db, "John Smith", "person")

        svc = _get_remember_service(db)
        result_id = svc._find_or_create_entity("John Smith", "person")

        assert result_id == existing_id

    def test_fuzzy_respects_deleted_entities(self, db):
        """Fuzzy matching should skip deleted entities."""
        existing_id = _insert_entity(db, "Kris Krisko", "person")
        db.update(
            "entities",
            {"deleted_at": datetime.utcnow().isoformat()},
            "id = ?",
            (existing_id,),
        )

        svc = _get_remember_service(db)
        result_id = svc._find_or_create_entity("Kris Krisco", "person")

        # Should create new since the match is deleted
        assert result_id != existing_id
