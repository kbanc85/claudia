"""Tests for the salience-ranked session briefing (Proposal 12 P3) and the
#67 class fix (archived/invalidated commitments must never appear in the brief).
"""

import json
from datetime import datetime, timedelta

import pytest

from claudia_memory.database import content_hash


# ── Helpers ──────────────────────────────────────────────────────


def _days_ago(n):
    return (datetime.utcnow() - timedelta(days=n)).isoformat()


def _days_ahead(n):
    return (datetime.utcnow() + timedelta(days=n)).isoformat()


def _insert_commitment(db, content, importance=0.5, deadline_at=None,
                       lifecycle_tier="active", invalidated_at=None,
                       resolution=None, resolved_at=None, created_at=None):
    """Insert a commitment, optionally archived/invalidated or resolver-stamped."""
    data = {
        "content": content,
        "content_hash": content_hash(content),
        "type": "commitment",
        "importance": importance,
        "created_at": created_at or datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "lifecycle_tier": lifecycle_tier,
    }
    if deadline_at is not None:
        data["deadline_at"] = deadline_at
    if invalidated_at is not None:
        data["invalidated_at"] = invalidated_at
    if resolution is not None:
        meta = {"resolution": resolution}
        if resolved_at is not None:
            meta["resolved_at"] = resolved_at
        data["metadata"] = json.dumps(meta)
    return db.insert("memories", data)


# ── #67 class: exclusion (Task 5) ────────────────────────────────


def test_briefing_excludes_archived_and_invalidated(db):
    """3 active + 2 archived + 1 invalidated -> the brief sees only the 3 active."""
    from claudia_memory.mcp.server import _top_commitments

    for i in range(3):
        _insert_commitment(db, f"Active commitment {i}", importance=0.5)
    for i in range(2):
        _insert_commitment(db, f"Archived commitment {i}", importance=0.5,
                           lifecycle_tier="archived")
    _insert_commitment(db, "Invalidated commitment", importance=0.5,
                       invalidated_at=datetime.utcnow().isoformat())

    result = _top_commitments(db)
    assert result["active_count"] == 3
    assert len(result["top"]) == 3
    contents = {c["content"] for c in result["top"]}
    assert all("Archived" not in c and "Invalidated" not in c for c in contents)
