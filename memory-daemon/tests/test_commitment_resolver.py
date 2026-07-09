"""Tests for the commitment resolver (Proposal 12 Phase 2).

Commitments auto-resolve to 'archived' when they expire (deadline passed the
grace window, not recently accessed) or go stale (no deadline, old, unreferenced,
low importance). Resolution is archive-never-delete: rows survive, stay queryable,
and record why/when in metadata so a briefing can disclose and the user can correct.
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
                       created_at=None, last_accessed_at=None,
                       lifecycle_tier="active", invalidated_at=None,
                       metadata=None):
    """Insert a commitment memory with lifecycle-relevant fields."""
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
    if last_accessed_at is not None:
        data["last_accessed_at"] = last_accessed_at
    if invalidated_at is not None:
        data["invalidated_at"] = invalidated_at
    if metadata is not None:
        data["metadata"] = json.dumps(metadata) if isinstance(metadata, dict) else metadata
    return db.insert("memories", data)


class _ResolverConfig:
    """Minimal config exposing the resolver knobs with plan defaults."""
    commitment_resolver_enabled = True
    commitment_grace_days = 14
    commitment_stale_days = 60
    commitment_stale_importance_ceiling = 0.5
    # lifecycle knobs (present so run_full_consolidation wiring can reuse this config)
    cooling_threshold_days = 60
    archive_threshold_days = 180
    enable_auto_sacred = False
    enable_pre_consolidation_backup = False
    decay_rate_daily = 0.995
    min_importance_threshold = 0.1
    sacred_core_keywords = []
    close_circle_keywords = []
    vault_sync_enabled = False


def _svc(db, config=None):
    from claudia_memory.services.consolidate import ConsolidateService
    s = ConsolidateService.__new__(ConsolidateService)
    s.db = db
    s.config = config or _ResolverConfig()
    return s


def _row(db, mid):
    return db.get_one("memories", where="id = ?", where_params=(mid,))


# ── Expired commitments ──────────────────────────────────────────


def test_expired_commitment_archives(db):
    """Deadline 30d past, importance 0.4, not accessed in 30d -> archived, row survives."""
    mid = _insert_commitment(
        db, "Send the Q3 report to Dana",
        importance=0.4, deadline_at=_days_ago(30), last_accessed_at=_days_ago(30),
    )
    _svc(db).resolve_commitments()

    row = _row(db, mid)
    assert row is not None, "commitment must never be deleted"
    assert row["lifecycle_tier"] == "archived"
    assert row["archived_at"] is not None
    meta = json.loads(row["metadata"])
    assert meta["resolution"] == "expired"
    assert meta["resolved_at"] is not None


def test_future_deadline_spared(db):
    """A commitment due tomorrow is untouched."""
    mid = _insert_commitment(db, "Prep the board deck", deadline_at=_days_ahead(1))
    _svc(db).resolve_commitments()

    row = _row(db, mid)
    assert row["lifecycle_tier"] == "active"
    assert row["archived_at"] is None


def test_recent_deadline_in_grace_spared(db):
    """Deadline 3 days past is inside the 14-day grace window -> untouched."""
    mid = _insert_commitment(db, "Reply to the vendor quote", deadline_at=_days_ago(3))
    _svc(db).resolve_commitments()

    assert _row(db, mid)["lifecycle_tier"] == "active"


def test_recently_accessed_expired_spared(db):
    """Deadline 30d past but accessed 2 days ago -> still live in conversation, untouched."""
    mid = _insert_commitment(
        db, "Follow up with Priya on pricing",
        deadline_at=_days_ago(30), last_accessed_at=_days_ago(2),
    )
    _svc(db).resolve_commitments()

    assert _row(db, mid)["lifecycle_tier"] == "active"


# ── Stale commitments (no deadline) ──────────────────────────────


def test_stale_no_deadline_archives(db):
    """No deadline, created 90d ago, unreferenced 65d, importance 0.3 -> archived stale."""
    mid = _insert_commitment(
        db, "Look into workflow automation someday",
        importance=0.3, deadline_at=None,
        created_at=_days_ago(90), last_accessed_at=_days_ago(65),
    )
    _svc(db).resolve_commitments()

    row = _row(db, mid)
    assert row["lifecycle_tier"] == "archived"
    meta = json.loads(row["metadata"])
    assert meta["resolution"] == "stale"


def test_high_importance_stale_spared(db):
    """Same as stale but importance 0.8 clears the ceiling -> untouched (gentle thresholds)."""
    mid = _insert_commitment(
        db, "Ship the annual compliance filing",
        importance=0.8, deadline_at=None,
        created_at=_days_ago(90), last_accessed_at=_days_ago(65),
    )
    _svc(db).resolve_commitments()

    assert _row(db, mid)["lifecycle_tier"] == "active"


# ── Guards ───────────────────────────────────────────────────────


def test_sacred_never_resolves(db):
    """A sacred-tier expired commitment is never resolved."""
    mid = _insert_commitment(
        db, "Never forget the anniversary gift",
        importance=0.4, deadline_at=_days_ago(30), last_accessed_at=_days_ago(30),
        lifecycle_tier="sacred",
    )
    _svc(db).resolve_commitments()

    assert _row(db, mid)["lifecycle_tier"] == "sacred"


def test_invalidated_untouched(db):
    """An already-invalidated commitment is skipped (no double handling)."""
    mid = _insert_commitment(
        db, "Cancelled task from last quarter",
        importance=0.4, deadline_at=_days_ago(30), last_accessed_at=_days_ago(30),
        invalidated_at=datetime.utcnow().isoformat(),
    )
    _svc(db).resolve_commitments()

    row = _row(db, mid)
    assert row["lifecycle_tier"] == "active"
    assert row["archived_at"] is None


def test_resolution_is_reversible(db):
    """Restoring lifecycle_tier='active' clears nothing else; content + metadata intact."""
    mid = _insert_commitment(
        db, "Draft the offsite agenda",
        importance=0.4, deadline_at=_days_ago(30), last_accessed_at=_days_ago(30),
        metadata={"origin": "email"},
    )
    _svc(db).resolve_commitments()
    assert _row(db, mid)["lifecycle_tier"] == "archived"

    db.update("memories", {"lifecycle_tier": "active"}, "id = ?", (mid,))

    restored = _row(db, mid)
    assert restored["lifecycle_tier"] == "active"
    assert restored["content"] == "Draft the offsite agenda"
    meta = json.loads(restored["metadata"])
    assert meta["resolution"] == "expired"   # provenance preserved
    assert meta["origin"] == "email"          # pre-existing metadata preserved (merge, not overwrite)


def test_resolver_returns_summary(db):
    """Return dict counts expired and stale resolutions accurately."""
    _insert_commitment(
        db, "Expired: send the recap",
        importance=0.4, deadline_at=_days_ago(30), last_accessed_at=_days_ago(30),
    )
    _insert_commitment(
        db, "Stale: revisit the idea",
        importance=0.3, deadline_at=None,
        created_at=_days_ago(90), last_accessed_at=_days_ago(65),
    )
    result = _svc(db).resolve_commitments()
    assert result == {"expired": 1, "stale": 1}


def test_resolver_disabled_is_noop(db):
    """With the resolver disabled, nothing is touched."""
    class Disabled(_ResolverConfig):
        commitment_resolver_enabled = False

    mid = _insert_commitment(
        db, "Would-be expired commitment",
        importance=0.4, deadline_at=_days_ago(30), last_accessed_at=_days_ago(30),
    )
    result = _svc(db, Disabled()).resolve_commitments()

    assert result == {"expired": 0, "stale": 0}
    assert _row(db, mid)["lifecycle_tier"] == "active"
