"""Tests for prediction feedback loop"""

import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from claudia_memory.database import Database


@pytest.fixture
def db():
    """Create a temporary test database"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


def _insert_prediction(db, prediction_type="suggestion", is_shown=0, is_acted_on=0, pattern_name=None):
    """Helper to insert a prediction row"""
    data = {
        "content": "Test prediction",
        "prediction_type": prediction_type,
        "priority": 0.5,
        "is_shown": is_shown,
        "is_acted_on": is_acted_on,
        "created_at": datetime.utcnow().isoformat(),
    }
    if pattern_name:
        data["prediction_pattern_name"] = pattern_name
    return db.insert("predictions", data)


def test_mark_prediction_acted_on(db):
    """mark_prediction_acted_on updates the DB row"""
    from claudia_memory.services.consolidate import ConsolidateService

    pred_id = _insert_prediction(db, is_shown=1)

    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db
    svc.config = type("Config", (), {"decay_rate_daily": 0.995, "min_importance_threshold": 0.1})()

    svc.mark_prediction_acted_on(pred_id, True)

    row = db.get_one("predictions", where="id = ?", where_params=(pred_id,))
    assert row["is_acted_on"] == 1


def test_feedback_insufficient_data(db):
    """With <5 shown predictions, return 1.0 (neutral)"""
    from claudia_memory.services.consolidate import ConsolidateService

    # Insert 3 shown predictions (below threshold of 5)
    for _ in range(3):
        _insert_prediction(db, prediction_type="suggestion", is_shown=1, is_acted_on=0)

    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db
    svc.config = type("Config", (), {"decay_rate_daily": 0.995, "min_importance_threshold": 0.1})()

    multiplier = svc._get_pattern_feedback("suggestion", "test_pattern")
    assert multiplier == 1.0


def test_feedback_low_engagement(db):
    """With act_ratio < 0.1, return 0.5 (halve priority)"""
    from claudia_memory.services.consolidate import ConsolidateService

    # 10 shown, 0 acted on
    for _ in range(10):
        _insert_prediction(db, prediction_type="reminder", is_shown=1, is_acted_on=0)

    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db
    svc.config = type("Config", (), {"decay_rate_daily": 0.995, "min_importance_threshold": 0.1})()

    multiplier = svc._get_pattern_feedback("reminder", "test_pattern")
    assert multiplier == 0.5


def test_feedback_high_engagement(db):
    """With act_ratio > 0.5, return 1.25 (boost priority)"""
    from claudia_memory.services.consolidate import ConsolidateService

    # 10 shown, 8 acted on
    for _ in range(8):
        _insert_prediction(db, prediction_type="insight", is_shown=1, is_acted_on=1)
    for _ in range(2):
        _insert_prediction(db, prediction_type="insight", is_shown=1, is_acted_on=0)

    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db
    svc.config = type("Config", (), {"decay_rate_daily": 0.995, "min_importance_threshold": 0.1})()

    multiplier = svc._get_pattern_feedback("insight", "test_pattern")
    assert multiplier == 1.25


def test_prediction_pattern_name_stored(db):
    """pattern_name is stored in prediction_pattern_name column"""
    pred_id = _insert_prediction(db, pattern_name="cooling_relationship_42")

    row = db.get_one("predictions", where="id = ?", where_params=(pred_id,))
    assert row["prediction_pattern_name"] == "cooling_relationship_42"
