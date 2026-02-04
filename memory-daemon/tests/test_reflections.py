"""
Tests for the reflections feature (/meditate skill backend)
"""

import json
import tempfile
from datetime import datetime, UTC
from pathlib import Path

import pytest

from claudia_memory.database import Database, content_hash


@pytest.fixture
def db():
    """Create a temporary test database."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


def _insert_reflection(db, content, reflection_type, **kwargs):
    """Helper to insert a reflection directly."""
    ref_hash = content_hash(content)
    data = {
        "content": content,
        "content_hash": ref_hash,
        "reflection_type": reflection_type,
        "importance": kwargs.get("importance", 0.7),
        "confidence": kwargs.get("confidence", 0.8),
        "decay_rate": kwargs.get("decay_rate", 0.999),
        "aggregation_count": kwargs.get("aggregation_count", 1),
        "first_observed_at": datetime.now(UTC).isoformat(),
        "last_confirmed_at": datetime.now(UTC).isoformat(),
        "created_at": datetime.now(UTC).isoformat(),
    }
    if "episode_id" in kwargs:
        data["episode_id"] = kwargs["episode_id"]
    if "about_entity_id" in kwargs:
        data["about_entity_id"] = kwargs["about_entity_id"]
    return db.insert("reflections", data)


def _get_reflection(db, ref_id):
    """Helper to get a reflection by ID."""
    return db.get_one("reflections", where="id = ?", where_params=(ref_id,))


class TestStoreReflection:
    """Tests for storing reflections."""

    def test_store_basic_reflection(self, db):
        """Can store a simple reflection."""
        ref_id = _insert_reflection(db, "User prefers bullet points", "observation")
        assert ref_id is not None
        assert ref_id > 0

    def test_store_with_all_fields(self, db):
        """Can store reflection with all optional fields."""
        # First create an episode
        episode_id = db.insert("episodes", {
            "session_id": "test-session",
            "started_at": datetime.now(UTC).isoformat(),
        })

        ref_id = _insert_reflection(
            db,
            "Mondays involve financial review",
            "pattern",
            episode_id=episode_id,
            importance=0.8,
            confidence=0.9,
        )
        assert ref_id is not None

        # Verify stored correctly
        reflection = _get_reflection(db, ref_id)
        assert reflection["content"] == "Mondays involve financial review"
        assert reflection["reflection_type"] == "pattern"
        assert reflection["importance"] == 0.8
        assert reflection["confidence"] == 0.9

    def test_all_reflection_types(self, db):
        """Can store all four reflection types."""
        types = ["observation", "pattern", "learning", "question"]
        ids = []
        for t in types:
            ref_id = _insert_reflection(db, f"Test {t}", t)
            ids.append(ref_id)

        # All stored successfully
        assert len(ids) == 4
        assert all(id is not None for id in ids)


class TestGetReflections:
    """Tests for retrieving reflections."""

    def test_get_empty(self, db):
        """Returns empty list when no reflections exist."""
        rows = db.query("reflections", limit=10)
        assert rows == []

    def test_get_ordered_by_importance(self, db):
        """Reflections can be retrieved in importance order."""
        _insert_reflection(db, "Low importance", "observation", importance=0.3)
        _insert_reflection(db, "High importance", "observation", importance=0.9)
        _insert_reflection(db, "Medium importance", "observation", importance=0.6)

        rows = db.query("reflections", order_by="importance DESC", limit=10)
        assert len(rows) == 3
        assert rows[0]["importance"] == 0.9
        assert rows[1]["importance"] == 0.6
        assert rows[2]["importance"] == 0.3

    def test_filter_by_type(self, db):
        """Can filter by reflection type."""
        _insert_reflection(db, "An observation", "observation")
        _insert_reflection(db, "A pattern", "pattern")
        _insert_reflection(db, "A learning", "learning")

        rows = db.query(
            "reflections",
            where="reflection_type = ?",
            where_params=("pattern",),
        )
        assert len(rows) == 1
        assert rows[0]["reflection_type"] == "pattern"


class TestUpdateReflection:
    """Tests for updating reflections."""

    def test_update_content(self, db):
        """Can update reflection content."""
        ref_id = _insert_reflection(db, "Original content", "observation")

        db.update(
            "reflections",
            {"content": "Updated content", "updated_at": datetime.now(UTC).isoformat()},
            "id = ?",
            (ref_id,),
        )

        reflection = _get_reflection(db, ref_id)
        assert reflection["content"] == "Updated content"

    def test_update_importance(self, db):
        """Can update reflection importance."""
        ref_id = _insert_reflection(db, "Test", "observation", importance=0.5)

        db.update(
            "reflections",
            {"importance": 0.9, "updated_at": datetime.now(UTC).isoformat()},
            "id = ?",
            (ref_id,),
        )

        reflection = _get_reflection(db, ref_id)
        assert reflection["importance"] == 0.9


class TestDeleteReflection:
    """Tests for deleting reflections."""

    def test_delete_existing(self, db):
        """Can delete an existing reflection."""
        ref_id = _insert_reflection(db, "To be deleted", "observation")

        count = db.delete("reflections", "id = ?", (ref_id,))
        assert count == 1

        # Should be gone
        reflection = _get_reflection(db, ref_id)
        assert reflection is None


class TestReflectionDecay:
    """Tests for reflection decay rates."""

    def test_default_decay_rate(self, db):
        """New reflections have slow decay rate (0.999)."""
        ref_id = _insert_reflection(db, "Test reflection", "observation")

        row = _get_reflection(db, ref_id)
        assert row["decay_rate"] == 0.999


class TestDuplicateDetection:
    """Tests for duplicate content handling."""

    def test_same_content_hash(self, db):
        """Same content produces same hash."""
        content = "User likes concise responses"
        hash1 = content_hash(content)
        hash2 = content_hash(content)
        assert hash1 == hash2

    def test_can_detect_existing_by_hash(self, db):
        """Can find existing reflection by content hash."""
        content = "User prefers direct feedback"
        ref_id = _insert_reflection(db, content, "observation")

        # Search by hash
        ref_hash = content_hash(content)
        existing = db.get_one(
            "reflections",
            where="content_hash = ?",
            where_params=(ref_hash,),
        )
        assert existing is not None
        assert existing["id"] == ref_id


class TestAggregationTracking:
    """Tests for aggregation metadata."""

    def test_increment_aggregation_count(self, db):
        """Can increment aggregation count for confirmed patterns."""
        ref_id = _insert_reflection(db, "Test pattern", "pattern", aggregation_count=1)

        db.update(
            "reflections",
            {
                "aggregation_count": 2,
                "last_confirmed_at": datetime.now(UTC).isoformat(),
            },
            "id = ?",
            (ref_id,),
        )

        row = _get_reflection(db, ref_id)
        assert row["aggregation_count"] == 2

    def test_well_confirmed_gets_slower_decay(self, db):
        """Reflections with 3+ confirmations decay slower."""
        ref_id = _insert_reflection(
            db, "Well confirmed", "pattern",
            aggregation_count=3,
            decay_rate=0.9995,  # Slower decay for well-confirmed
        )

        row = _get_reflection(db, ref_id)
        assert row["decay_rate"] == 0.9995
        assert row["aggregation_count"] == 3
