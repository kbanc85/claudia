"""Tests for turn buffering and session lifecycle."""

import tempfile
from pathlib import Path

import pytest

from claudia_memory.database import Database
from claudia_memory.services.remember import RememberService


def _make_db():
    """Create a fresh test database."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _make_service(db):
    """Create a RememberService without embedding service for turn buffering tests."""
    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc.embeddings = None
    return svc


class TestBufferTurn:
    """Tests for buffer_turn functionality."""

    def test_buffer_turn_creates_episode(self):
        """First buffer_turn should create episode and return episode_id."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            result = svc.buffer_turn(
                user_content="Hello, how are you?",
                assistant_content="I'm doing well!"
            )

            assert "episode_id" in result
            assert result["episode_id"] > 0
            assert result["turn_number"] == 1

            # Verify episode was created
            episode = db.get_one("episodes", where="id = ?", where_params=(result["episode_id"],))
            assert episode is not None
            assert episode["turn_count"] == 1
        finally:
            db.close()

    def test_buffer_turn_appends_to_episode(self):
        """Subsequent buffer_turn with same episode_id should append."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            # First turn creates episode
            first = svc.buffer_turn(user_content="First message")
            episode_id = first["episode_id"]

            # Second turn should append
            second = svc.buffer_turn(
                user_content="Second message",
                episode_id=episode_id
            )
            assert second["episode_id"] == episode_id
            assert second["turn_number"] == 2

            # Third turn
            third = svc.buffer_turn(
                user_content="Third message",
                assistant_content="Got it!",
                episode_id=episode_id
            )
            assert third["episode_id"] == episode_id
            assert third["turn_number"] == 3

            # Verify turn count
            episode = db.get_one("episodes", where="id = ?", where_params=(episode_id,))
            assert episode["turn_count"] == 3
        finally:
            db.close()

    def test_buffer_turn_stores_content(self):
        """Buffered turns should store user and assistant content."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            result = svc.buffer_turn(
                user_content="What's the weather?",
                assistant_content="It's sunny today!"
            )

            # Query turn_buffer directly
            turn = db.get_one(
                "turn_buffer",
                where="episode_id = ? AND turn_number = ?",
                where_params=(result["episode_id"], 1)
            )
            assert turn["user_content"] == "What's the weather?"
            assert turn["assistant_content"] == "It's sunny today!"
        finally:
            db.close()


class TestEndSession:
    """Tests for end_session functionality."""

    def test_end_session_finalizes_episode(self):
        """end_session should mark episode as summarized."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            # Buffer some turns
            result = svc.buffer_turn(user_content="Test turn")
            episode_id = result["episode_id"]

            svc.buffer_turn(user_content="Another turn", episode_id=episode_id)

            # End session
            end_result = svc.end_session(
                episode_id=episode_id,
                narrative="We discussed testing approaches."
            )

            assert end_result["narrative_stored"] is True

            # Verify episode is marked as summarized
            episode = db.get_one("episodes", where="id = ?", where_params=(episode_id,))
            assert episode["is_summarized"] == 1
            assert episode["narrative"] == "We discussed testing approaches."
            assert episode["ended_at"] is not None
        finally:
            db.close()

    def test_end_session_not_in_unsummarized(self):
        """Finalized episodes should not appear in unsummarized list."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            # Buffer and end a session
            result = svc.buffer_turn(user_content="Test turn")
            episode_id = result["episode_id"]

            svc.end_session(
                episode_id=episode_id,
                narrative="Session complete."
            )

            # Should not appear in unsummarized
            unsummarized = svc.get_unsummarized_turns()
            assert not any(e["episode_id"] == episode_id for e in unsummarized)
        finally:
            db.close()


    def test_end_session_nonexistent_episode(self):
        """end_session with a non-existent episode_id should return error, not raise."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            # Call end_session with an episode_id that was never created
            result = svc.end_session(
                episode_id=9999,
                narrative="This episode does not exist."
            )

            assert result["episode_id"] == 9999
            assert result["narrative_stored"] is False
            assert "error" in result
            assert "not found" in result["error"].lower()
        finally:
            db.close()

    def test_end_session_episode_zero(self):
        """end_session with episode_id=0 should return error (AUTOINCREMENT starts at 1)."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            result = svc.end_session(
                episode_id=0,
                narrative="Default zero episode."
            )

            assert result["episode_id"] == 0
            assert result["narrative_stored"] is False
            assert "error" in result
        finally:
            db.close()


class TestUnsummarized:
    """Tests for get_unsummarized_turns functionality."""

    def test_unsummarized_catches_orphans(self):
        """Buffered turns without end_session should appear in unsummarized."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            # Buffer turns but don't call end_session (simulates terminal closure)
            result = svc.buffer_turn(user_content="Orphaned turn")
            episode_id = result["episode_id"]

            svc.buffer_turn(user_content="Another orphan", episode_id=episode_id)

            # Should appear in unsummarized
            unsummarized = svc.get_unsummarized_turns()
            orphan = next((e for e in unsummarized if e["episode_id"] == episode_id), None)

            assert orphan is not None
            assert orphan["turn_count"] == 2
            assert len(orphan["turns"]) == 2
        finally:
            db.close()

    def test_unsummarized_returns_turn_content(self):
        """Unsummarized results should include turn content for recovery."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            # Buffer a turn
            result = svc.buffer_turn(
                user_content="Important context",
                assistant_content="Acknowledged!"
            )
            episode_id = result["episode_id"]

            # Get unsummarized
            unsummarized = svc.get_unsummarized_turns()
            orphan = next((e for e in unsummarized if e["episode_id"] == episode_id), None)

            assert orphan is not None
            assert orphan["turns"][0]["user"] == "Important context"
            assert orphan["turns"][0]["assistant"] == "Acknowledged!"
        finally:
            db.close()
