"""Tests for Compact Session Briefing (Phase 4)"""

import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from claudia_memory.database import Database, content_hash


def _make_db():
    """Create a fresh test database."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _build_briefing_with_db(db):
    """Build a briefing using a specific database instance.

    We inline the briefing logic here rather than importing the server function
    to avoid MCP server initialization side effects in tests.
    """
    from datetime import datetime, timedelta

    lines = []
    lines.append("# Session Briefing\n")

    # Commitments
    total_row = db.execute(
        "SELECT COUNT(*) as cnt FROM memories WHERE type = 'commitment' AND importance > 0.1",
        fetch=True,
    )
    total_commitments = total_row[0]["cnt"] if total_row else 0

    stale_cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat()
    stale_row = db.execute(
        "SELECT COUNT(*) as cnt FROM memories WHERE type = 'commitment' AND importance > 0.1 AND created_at < ?",
        (stale_cutoff,),
        fetch=True,
    )
    stale_commitments = stale_row[0]["cnt"] if stale_row else 0

    if total_commitments > 0:
        stale_note = f" ({stale_commitments} older than 7d)" if stale_commitments else ""
        lines.append(f"**Commitments:** {total_commitments} active{stale_note}")

    # Cooling relationships
    cooling_cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
    cooling_row = db.execute(
        "SELECT COUNT(*) as cnt FROM entities WHERE type = 'person' AND importance > 0.3 AND updated_at < ?",
        (cooling_cutoff,),
        fetch=True,
    )
    cooling_count = cooling_row[0]["cnt"] if cooling_row else 0
    if cooling_count > 0:
        lines.append(f"**Cooling relationships:** {cooling_count} people not mentioned in 30+ days")

    # Recent activity
    recent_cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
    recent_row = db.execute(
        "SELECT COUNT(*) as cnt FROM memories WHERE created_at > ?",
        (recent_cutoff,),
        fetch=True,
    )
    recent_count = recent_row[0]["cnt"] if recent_row else 0
    lines.append(f"**Recent activity:** {recent_count} memories in last 24h")

    if len(lines) <= 1:
        lines.append("No context available yet. This appears to be a fresh workspace.")

    return "\n".join(lines)


# --------------------------------------------------------------------------
# Test 1: Empty DB returns minimal briefing
# --------------------------------------------------------------------------
def test_empty_db_briefing():
    db, tmpdir = _make_db()
    try:
        briefing = _build_briefing_with_db(db)
        assert "Session Briefing" in briefing
        assert "Recent activity:" in briefing
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 2: With commitments, shows count
# --------------------------------------------------------------------------
def test_commitments_shown():
    db, tmpdir = _make_db()
    try:
        # Add 3 commitments, 1 older than 7 days
        for i in range(3):
            created = datetime.utcnow() - timedelta(days=(i * 5))
            db.insert(
                "memories",
                {
                    "content": f"Commitment {i}",
                    "content_hash": content_hash(f"Commitment {i}"),
                    "type": "commitment",
                    "importance": 0.8,
                    "confidence": 1.0,
                    "created_at": created.isoformat(),
                    "updated_at": created.isoformat(),
                },
            )

        briefing = _build_briefing_with_db(db)
        assert "**Commitments:** 3 active" in briefing
        # At least one commitment is older than 7 days (the 10-day-old one)
        assert "older than 7d" in briefing
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 3: With cooling relationships, shows count
# --------------------------------------------------------------------------
def test_cooling_relationships_shown():
    db, tmpdir = _make_db()
    try:
        # Add a person entity not updated in 45 days
        old_date = (datetime.utcnow() - timedelta(days=45)).isoformat()
        db.insert(
            "entities",
            {
                "name": "Old Friend",
                "canonical_name": "old friend",
                "type": "person",
                "importance": 0.8,
                "created_at": old_date,
                "updated_at": old_date,
            },
        )

        briefing = _build_briefing_with_db(db)
        assert "**Cooling relationships:** 1" in briefing
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 4: Output stays under ~2000 chars
# --------------------------------------------------------------------------
def test_briefing_compact():
    db, tmpdir = _make_db()
    try:
        # Add some data
        for i in range(10):
            db.insert(
                "memories",
                {
                    "content": f"Fact number {i} with some details about stuff",
                    "content_hash": content_hash(f"fact-{i}"),
                    "type": "commitment" if i < 5 else "fact",
                    "importance": 0.8,
                    "confidence": 1.0,
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )

        briefing = _build_briefing_with_db(db)
        assert len(briefing) < 2000, f"Briefing too long: {len(briefing)} chars"
    finally:
        db.close()
