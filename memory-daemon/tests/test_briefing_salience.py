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


# ── Salience ranking + rendering (Task 6) ────────────────────────


def test_briefing_ranks_by_deadline_then_importance(db):
    """Soonest deadline first (no-deadline last), then importance desc within a tier."""
    from claudia_memory.mcp.server import _top_commitments

    _insert_commitment(db, "Deadline in 5 days", importance=0.4, deadline_at=_days_ahead(5))
    _insert_commitment(db, "Deadline in 2 days", importance=0.4, deadline_at=_days_ahead(2))
    _insert_commitment(db, "No deadline high importance", importance=0.9)
    _insert_commitment(db, "No deadline low importance", importance=0.3)

    top = _top_commitments(db, n=4)["top"]
    order = [c["content"] for c in top]
    assert order == [
        "Deadline in 2 days",
        "Deadline in 5 days",
        "No deadline high importance",
        "No deadline low importance",
    ]


def test_briefing_caps_at_three(db):
    """Default cap is 3, but active_count reflects the full set for the summary."""
    from claudia_memory.mcp.server import _top_commitments, _render_commitment_lines

    for i in range(5):
        _insert_commitment(db, f"Open commitment {i}", importance=0.5)

    result = _top_commitments(db)
    assert len(result["top"]) == 3
    assert result["active_count"] == 5

    rendered = "\n".join(_render_commitment_lines(result))
    assert "+2 more active" in rendered
    # Exactly 3 bullet lines
    assert rendered.count("\n- ") + (1 if rendered.startswith("- ") else 0) == 3


def test_briefing_renders_due_dates(db):
    """Each bullet shows a due date or '(no deadline)'."""
    from claudia_memory.mcp.server import _top_commitments, _render_commitment_lines

    _insert_commitment(db, "Has a deadline", importance=0.5, deadline_at=_days_ahead(3))
    _insert_commitment(db, "Open ended task", importance=0.5)

    rendered = "\n".join(_render_commitment_lines(_top_commitments(db)))
    assert "(due " in rendered
    assert "(no deadline)" in rendered


def test_briefing_discloses_recent_autoarchive(db):
    """Recently auto-archived commitments are counted and disclosed with a restore hint."""
    from claudia_memory.mcp.server import _top_commitments, _render_commitment_lines

    _insert_commitment(db, "Still open", importance=0.5)
    # two archived within the last 7 days
    _insert_commitment(db, "Archived recently 1", lifecycle_tier="archived",
                       resolution="expired", resolved_at=_days_ago(1))
    _insert_commitment(db, "Archived recently 2", lifecycle_tier="archived",
                       resolution="stale", resolved_at=_days_ago(3))
    # one archived long ago -> NOT disclosed
    _insert_commitment(db, "Archived long ago", lifecycle_tier="archived",
                       resolution="expired", resolved_at=_days_ago(30))

    result = _top_commitments(db)
    assert result["recently_archived_count"] == 2

    rendered = "\n".join(_render_commitment_lines(result))
    assert "2 auto-archived recently" in rendered
    assert "restore" in rendered


# ── Prediction gating (Task 6) ───────────────────────────────────


def _insert_prediction(db, content, priority, ptype="suggestion",
                       expires_in_days=7, is_shown=0):
    return db.insert("predictions", {
        "content": content,
        "prediction_type": ptype,
        "priority": priority,
        "expires_at": _days_ahead(expires_in_days),
        "is_shown": is_shown,
    })


def test_low_importance_prediction_suppressed(db):
    """A prediction below the surface threshold is not returned."""
    from claudia_memory.mcp.server import _top_prediction

    _insert_prediction(db, "Weak hunch", priority=0.4)
    assert _top_prediction(db, threshold=0.6) is None


def test_high_importance_prediction_surfaced(db):
    """A prediction at/above the threshold is returned."""
    from claudia_memory.mcp.server import _top_prediction

    _insert_prediction(db, "Strong signal", priority=0.8)
    pred = _top_prediction(db, threshold=0.6)
    assert pred is not None
    assert pred["content"] == "Strong signal"


# NOTE: _build_briefing() itself is intentionally not exercised end-to-end here.
# It reaches other subsystems' module-level get_db() (e.g. get_active_reflections),
# which resolve to the real database, not a passed handle. The existing
# test_briefing.py inlines its logic for the same reason. The salience/#67 logic
# lives in the pure helpers above (_top_commitments, _render_commitment_lines,
# _top_prediction), which are tested in full isolation against a temp DB.
