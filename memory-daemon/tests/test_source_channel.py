"""Tests for source_channel feature (channel-aware memory)."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database


@pytest.fixture
def db():
    """Create a temporary test database."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


def test_source_channel_in_recall_result(db):
    """source_channel should appear in recall results."""
    from claudia_memory.services.recall import RecallResult

    # Verify the dataclass has source_channel field
    r = RecallResult(
        id=1, content="test", type="fact", score=1.0,
        importance=1.0, created_at="2026-01-01", entities=[],
        source_channel="telegram",
    )
    assert r.source_channel == "telegram"

    # Default should be None
    r2 = RecallResult(
        id=2, content="test2", type="fact", score=1.0,
        importance=1.0, created_at="2026-01-01", entities=[],
    )
    assert r2.source_channel is None


def test_remember_fact_stores_source_channel(db):
    """remember_fact should store source_channel when provided."""
    with patch("claudia_memory.services.remember.embed_sync", return_value=None):
        with patch("claudia_memory.services.remember.get_db", return_value=db):
            with patch("claudia_memory.services.remember.get_embedding_service"):
                with patch("claudia_memory.services.remember.get_extractor"):
                    from claudia_memory.services.remember import RememberService
                    # Reset global service to pick up our mocked db
                    import claudia_memory.services.remember as rem_mod
                    old_svc = rem_mod._service
                    rem_mod._service = None

                    try:
                        svc = RememberService()
                        svc.db = db

                        memory_id = svc.remember_fact(
                            content="Test from telegram",
                            source_channel="telegram",
                        )
                        assert memory_id is not None

                        row = db.get_one("memories", where="id = ?", where_params=(memory_id,))
                        assert row["source_channel"] == "telegram"
                    finally:
                        rem_mod._service = old_svc
