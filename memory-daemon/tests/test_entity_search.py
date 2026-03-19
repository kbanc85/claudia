"""Tests for entity search wildcard handling and deleted entity filtering.

Fix 4 (Discussion #25): search_entities("*") returns nothing because "*" is
wrapped in LIKE "%*%", matching the literal asterisk. Also, deleted entities
are not filtered out of search results.
"""

from datetime import datetime

import pytest


def _insert_entity(db, name, entity_type="person", importance=1.0, deleted=False):
    """Insert an entity, optionally soft-deleted."""
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


def _get_recall_service(db):
    """Create a RecallService with test database."""
    from claudia_memory.services.recall import RecallService
    svc = RecallService.__new__(RecallService)
    svc.db = db
    svc._embedder = None
    svc.embedding_service = None
    from claudia_memory.extraction.entity_extractor import get_extractor
    svc.extractor = get_extractor()
    return svc


class TestWildcardSearch:
    """Wildcard queries should return all non-deleted entities."""

    def test_star_returns_all_entities(self, db):
        """search_entities('*') returns all non-deleted entities."""
        _insert_entity(db, "Sarah Chen")
        _insert_entity(db, "Acme Corp", "organization")
        _insert_entity(db, "Project Alpha", "project")

        svc = _get_recall_service(db)
        results = svc.search_entities("*")

        assert len(results) == 3

    def test_empty_string_returns_all_entities(self, db):
        """search_entities('') returns all non-deleted entities."""
        _insert_entity(db, "Sarah Chen")
        _insert_entity(db, "John Smith")

        svc = _get_recall_service(db)
        results = svc.search_entities("")

        assert len(results) == 2

    def test_wildcard_with_type_filter(self, db):
        """Wildcard search respects entity_types filter."""
        _insert_entity(db, "Sarah Chen", "person")
        _insert_entity(db, "Acme Corp", "organization")
        _insert_entity(db, "Project Alpha", "project")

        svc = _get_recall_service(db)
        results = svc.search_entities("*", entity_types=["person"])

        assert len(results) == 1
        assert results[0].name == "Sarah Chen"

    def test_wildcard_respects_limit(self, db):
        """Wildcard search honors the limit parameter."""
        for i in range(5):
            _insert_entity(db, f"Person {i}")

        svc = _get_recall_service(db)
        results = svc.search_entities("*", limit=3)

        assert len(results) == 3

    def test_wildcard_excludes_deleted(self, db):
        """Wildcard search excludes soft-deleted entities."""
        _insert_entity(db, "Active Person")
        _insert_entity(db, "Deleted Person", deleted=True)

        svc = _get_recall_service(db)
        results = svc.search_entities("*")

        assert len(results) == 1
        assert results[0].name == "Active Person"


class TestSearchDeletedFilter:
    """Normal (non-wildcard) searches must also exclude deleted entities."""

    def test_name_search_excludes_deleted(self, db):
        """Normal name search excludes soft-deleted entities."""
        _insert_entity(db, "Sarah Chen")
        _insert_entity(db, "Sarah Johnson", deleted=True)

        svc = _get_recall_service(db)
        results = svc.search_entities("Sarah")

        assert len(results) == 1
        assert results[0].name == "Sarah Chen"

    def test_normal_query_still_works(self, db):
        """Regular name-based search continues to work correctly."""
        _insert_entity(db, "Sarah Chen", "person")
        _insert_entity(db, "Acme Corp", "organization")

        svc = _get_recall_service(db)
        results = svc.search_entities("Sarah")

        assert len(results) == 1
        assert results[0].name == "Sarah Chen"

    def test_results_ordered_by_importance(self, db):
        """Search results are ordered by importance descending."""
        _insert_entity(db, "Low Importance", importance=0.3)
        _insert_entity(db, "High Importance", importance=0.9)
        _insert_entity(db, "Medium Importance", importance=0.6)

        svc = _get_recall_service(db)
        results = svc.search_entities("*")

        importances = [r.importance for r in results]
        assert importances == sorted(importances, reverse=True)
