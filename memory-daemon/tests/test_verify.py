"""Tests for background verification service"""

import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

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


def _make_config(**overrides):
    """Create a mock config object"""
    defaults = {
        "verify_batch_size": 20,
        "verify_interval_minutes": 60,
        "language_model": "",  # No LLM by default
    }
    defaults.update(overrides)
    return type("Config", (), defaults)()


def _insert_memory(db, content, memory_type="fact", importance=1.0, status="pending", minutes_ago=10):
    """Insert a memory with configurable age"""
    created_at = (datetime.utcnow() - timedelta(minutes=minutes_ago)).isoformat()
    return db.insert("memories", {
        "content": content,
        "content_hash": content_hash(content + str(datetime.utcnow())),
        "type": memory_type,
        "importance": importance,
        "verification_status": status,
        "created_at": created_at,
        "updated_at": created_at,
    })


def _insert_entity(db, name):
    """Insert an entity"""
    return db.insert("entities", {
        "name": name,
        "type": "person",
        "canonical_name": name.lower(),
        "importance": 1.0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def test_buffer_timing(db):
    """Memories younger than 5 minutes are not verified"""
    from claudia_memory.services.verify import VerifyService

    # Insert memory created 2 minutes ago (within buffer)
    _insert_memory(db, "Recent memory", minutes_ago=2)

    svc = VerifyService.__new__(VerifyService)
    svc.db = db
    svc.config = _make_config()

    result = svc.run_verification()
    assert result["verified"] == 0
    assert result["flagged"] == 0


def test_fact_verified_deterministic(db):
    """A plain fact with no issues gets verified status"""
    from claudia_memory.services.verify import VerifyService

    mem_id = _insert_memory(db, "The sky is blue", minutes_ago=10)

    svc = VerifyService.__new__(VerifyService)
    svc.db = db
    svc.config = _make_config()

    result = svc.run_verification()
    assert result["verified"] == 1

    row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
    assert row["verification_status"] == "verified"
    assert row["verified_at"] is not None


def test_commitment_no_deadline_flagged(db):
    """A commitment without a deadline gets flagged"""
    from claudia_memory.services.verify import VerifyService

    mem_id = _insert_memory(db, "I will finish the project", memory_type="commitment", minutes_ago=10)

    svc = VerifyService.__new__(VerifyService)
    svc.db = db
    svc.config = _make_config()

    result = svc.run_verification()
    assert result["flagged"] == 1

    row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
    assert row["verification_status"] == "flagged"
    assert row["importance"] == pytest.approx(0.1)


def test_commitment_with_deadline_verified(db):
    """A commitment with a deadline pattern passes verification"""
    from claudia_memory.services.verify import VerifyService

    mem_id = _insert_memory(db, "Finish report by Friday", memory_type="commitment", minutes_ago=10)

    svc = VerifyService.__new__(VerifyService)
    svc.db = db
    svc.config = _make_config()

    result = svc.run_verification()
    assert result["verified"] == 1


def test_llm_checks_skipped_without_model(db):
    """When language_model is empty, LLM checks are skipped gracefully"""
    from claudia_memory.services.verify import VerifyService

    mem_id = _insert_memory(db, "Important fact about something", memory_type="fact", minutes_ago=10)

    svc = VerifyService.__new__(VerifyService)
    svc.db = db
    svc.config = _make_config(language_model="")

    assert not svc._has_language_model()

    result = svc.run_verification()
    assert result["verified"] == 1  # Passes deterministic checks only


def test_importance_reduced_on_flag(db):
    """Flagged memories get importance reduced to 0.1"""
    from claudia_memory.services.verify import VerifyService

    mem_id = _insert_memory(db, "Do the thing eventually", memory_type="commitment", importance=0.9, minutes_ago=10)

    svc = VerifyService.__new__(VerifyService)
    svc.db = db
    svc.config = _make_config()

    svc.run_verification()

    row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
    assert row["importance"] == pytest.approx(0.1)


def test_grandfathered_memories_not_reprocessed(db):
    """Memories already marked 'verified' by migration are not reprocessed"""
    from claudia_memory.services.verify import VerifyService

    mem_id = _insert_memory(db, "Old memory", minutes_ago=100, status="verified")

    svc = VerifyService.__new__(VerifyService)
    svc.db = db
    svc.config = _make_config()

    result = svc.run_verification()
    # Should not pick up already-verified memories
    assert result["verified"] == 0
    assert result["flagged"] == 0
