"""Tests for prediction expiry after entity merge/delete.

Fix C (Issue #28): Dedupe predictions persist after merge_entities() or
delete_entity(), appearing in briefings for up to 14 days. After resolving
a duplicate, the corresponding prediction should be expired.
"""

import json
from datetime import datetime, timedelta

import pytest


def _insert_entity(db, name, entity_type="person"):
    """Insert an entity for merge/delete testing."""
    return db.insert("entities", {
        "name": name,
        "type": entity_type,
        "canonical_name": name.lower(),
        "importance": 1.0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _insert_dedupe_prediction(db, entity_id_1, entity_id_2):
    """Insert a dedupe prediction for an entity pair."""
    now = datetime.utcnow()
    return db.insert("predictions", {
        "content": f"Possible duplicate: entity {entity_id_1} and {entity_id_2}",
        "prediction_type": "suggestion",
        "priority": 0.8,
        "expires_at": (now + timedelta(days=14)).isoformat(),
        "created_at": now.isoformat(),
        "metadata": json.dumps({
            "dedupe_pair": [entity_id_1, entity_id_2],
            "similarity": 0.92,
            "method": "fuzzy_name",
        }),
    })


def _insert_non_dedupe_prediction(db):
    """Insert a prediction that is NOT a dedupe suggestion."""
    now = datetime.utcnow()
    return db.insert("predictions", {
        "content": "Some other suggestion",
        "prediction_type": "suggestion",
        "priority": 0.5,
        "expires_at": (now + timedelta(days=14)).isoformat(),
        "created_at": now.isoformat(),
        "metadata": json.dumps({"type": "other"}),
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


class TestMergeExpiresPredictions:
    """merge_entities() should expire dedupe predictions for affected entities."""

    def test_merge_expires_prediction_for_pair(self, db):
        """After merging, predictions referencing the source entity are expired."""
        id1 = _insert_entity(db, "Kris Krisko")
        id2 = _insert_entity(db, "Kris Krisco")
        pred_id = _insert_dedupe_prediction(db, id1, id2)

        svc = _get_remember_service(db)
        svc.merge_entities(id1, id2, reason="test")

        pred = db.get_one("predictions", where="id = ?", where_params=(pred_id,))
        # Prediction should be expired (expires_at in the past or now)
        assert pred["expires_at"] <= datetime.utcnow().isoformat()

    def test_merge_does_not_affect_unrelated_predictions(self, db):
        """Predictions about other entity pairs remain untouched."""
        id1 = _insert_entity(db, "Kris Krisko")
        id2 = _insert_entity(db, "Kris Krisco")
        id3 = _insert_entity(db, "Sarah Chen")
        id4 = _insert_entity(db, "Sarah Johnson")

        _insert_dedupe_prediction(db, id1, id2)
        unrelated_pred_id = _insert_dedupe_prediction(db, id3, id4)

        svc = _get_remember_service(db)
        svc.merge_entities(id1, id2, reason="test")

        pred = db.get_one("predictions", where="id = ?", where_params=(unrelated_pred_id,))
        # Unrelated prediction should NOT be expired
        assert pred["expires_at"] > datetime.utcnow().isoformat()

    def test_merge_does_not_affect_non_dedupe_predictions(self, db):
        """Non-dedupe predictions are not expired."""
        id1 = _insert_entity(db, "Kris Krisko")
        id2 = _insert_entity(db, "Kris Krisco")
        non_dedupe_id = _insert_non_dedupe_prediction(db)
        _insert_dedupe_prediction(db, id1, id2)

        svc = _get_remember_service(db)
        svc.merge_entities(id1, id2, reason="test")

        pred = db.get_one("predictions", where="id = ?", where_params=(non_dedupe_id,))
        assert pred["expires_at"] > datetime.utcnow().isoformat()


class TestDeleteExpiresPredictions:
    """delete_entity() should expire dedupe predictions for the deleted entity."""

    def test_delete_expires_prediction_referencing_entity(self, db):
        """After deleting, predictions referencing the entity are expired."""
        id1 = _insert_entity(db, "Kris Krisko")
        id2 = _insert_entity(db, "Kris Krisco")
        pred_id = _insert_dedupe_prediction(db, id1, id2)

        svc = _get_remember_service(db)
        svc.delete_entity(id1, reason="test")

        pred = db.get_one("predictions", where="id = ?", where_params=(pred_id,))
        assert pred["expires_at"] <= datetime.utcnow().isoformat()

    def test_delete_does_not_affect_unrelated_predictions(self, db):
        """Predictions about other entities remain untouched."""
        id1 = _insert_entity(db, "Kris Krisko")
        id2 = _insert_entity(db, "Kris Krisco")
        id3 = _insert_entity(db, "Sarah Chen")
        id4 = _insert_entity(db, "Sarah Johnson")

        _insert_dedupe_prediction(db, id1, id2)
        unrelated_pred_id = _insert_dedupe_prediction(db, id3, id4)

        svc = _get_remember_service(db)
        svc.delete_entity(id1, reason="test")

        pred = db.get_one("predictions", where="id = ?", where_params=(unrelated_pred_id,))
        assert pred["expires_at"] > datetime.utcnow().isoformat()

    def test_delete_handles_entity_in_second_position(self, db):
        """Prediction expired even when deleted entity is second in dedupe_pair."""
        id1 = _insert_entity(db, "Sarah Chen")
        id2 = _insert_entity(db, "Sarah C.")
        pred_id = _insert_dedupe_prediction(db, id1, id2)

        svc = _get_remember_service(db)
        svc.delete_entity(id2, reason="test")  # Delete second entity

        pred = db.get_one("predictions", where="id = ?", where_params=(pred_id,))
        assert pred["expires_at"] <= datetime.utcnow().isoformat()
