"""Tests for briefing commitment and cooling relationship count accuracy.

Fix 1 (Discussion #25): The briefing tool counts invalidated commitments and
deleted entities, inflating the numbers users see at session start.
"""

from datetime import datetime, timedelta

import pytest


def _insert_commitment(db, content, importance=0.5, invalidated=False, days_ago=0):
    """Insert a commitment memory, optionally invalidated or backdated."""
    created = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()
    data = {
        "content": content,
        "type": "commitment",
        "importance": importance,
        "created_at": created,
        "updated_at": created,
    }
    if invalidated:
        data["invalidated_at"] = datetime.utcnow().isoformat()
    return db.insert("memories", data)


def _insert_person_entity(db, name, importance=0.5, deleted=False, days_since_update=0):
    """Insert a person entity, optionally deleted or with old updated_at."""
    updated = (datetime.utcnow() - timedelta(days=days_since_update)).isoformat()
    data = {
        "name": name,
        "type": "person",
        "canonical_name": name.lower(),
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": updated,
    }
    if deleted:
        data["deleted_at"] = datetime.utcnow().isoformat()
    return db.insert("entities", data)


class TestBriefingCommitmentCounts:
    """Commitment count queries must exclude invalidated records."""

    def test_only_active_commitments_counted(self, db):
        """Invalidated commitments should not appear in the total count."""
        _insert_commitment(db, "Send proposal to Sarah", importance=0.5)
        _insert_commitment(db, "Review contract", importance=0.5)
        _insert_commitment(db, "Old commitment", importance=0.5, invalidated=True)

        row = db.execute(
            "SELECT COUNT(*) as cnt FROM memories "
            "WHERE type = 'commitment' AND importance > 0.1 "
            "AND invalidated_at IS NULL",
            fetch=True,
        )
        assert row[0]["cnt"] == 2

    def test_all_invalidated_gives_zero(self, db):
        """When all commitments are invalidated, count should be 0."""
        _insert_commitment(db, "Done task", importance=0.5, invalidated=True)
        _insert_commitment(db, "Another done", importance=0.5, invalidated=True)

        row = db.execute(
            "SELECT COUNT(*) as cnt FROM memories "
            "WHERE type = 'commitment' AND importance > 0.1 "
            "AND invalidated_at IS NULL",
            fetch=True,
        )
        assert row[0]["cnt"] == 0

    def test_stale_count_excludes_invalidated(self, db):
        """Stale commitment count (older than 7d) must also exclude invalidated."""
        _insert_commitment(db, "Old active", importance=0.5, days_ago=10)
        _insert_commitment(db, "Old invalidated", importance=0.5, invalidated=True, days_ago=10)
        _insert_commitment(db, "Recent active", importance=0.5, days_ago=1)

        stale_cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat()
        row = db.execute(
            "SELECT COUNT(*) as cnt FROM memories "
            "WHERE type = 'commitment' AND importance > 0.1 "
            "AND invalidated_at IS NULL AND created_at < ?",
            (stale_cutoff,),
            fetch=True,
        )
        assert row[0]["cnt"] == 1  # Only "Old active"


class TestBriefingCoolingCounts:
    """Cooling relationship count must exclude deleted entities."""

    def test_cooling_excludes_deleted_entities(self, db):
        """Deleted person entities should not appear in cooling count."""
        cooling_cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()

        # Active person, not mentioned in 30+ days
        _insert_person_entity(db, "Sarah Chen", importance=0.5, days_since_update=45)
        # Deleted person, not mentioned in 30+ days
        _insert_person_entity(db, "Old Contact", importance=0.5, deleted=True, days_since_update=60)

        row = db.execute(
            "SELECT COUNT(*) as cnt FROM entities "
            "WHERE type = 'person' AND importance > 0.3 "
            "AND deleted_at IS NULL AND updated_at < ?",
            (cooling_cutoff,),
            fetch=True,
        )
        assert row[0]["cnt"] == 1  # Only "Sarah Chen"

    def test_cooling_with_all_deleted_gives_zero(self, db):
        """When all cooling entities are deleted, count should be 0."""
        _insert_person_entity(db, "Gone Person", importance=0.5, deleted=True, days_since_update=60)

        cooling_cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
        row = db.execute(
            "SELECT COUNT(*) as cnt FROM entities "
            "WHERE type = 'person' AND importance > 0.3 "
            "AND deleted_at IS NULL AND updated_at < ?",
            (cooling_cutoff,),
            fetch=True,
        )
        assert row[0]["cnt"] == 0
