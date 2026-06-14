"""Tests for the status-only daemon job wrapper (Proposal 11, E5).

The wrapper runs a scheduled job, checks deterministic invariants, and writes a
status file. It is status-only: a failing invariant is flagged but never halts
the job, and a job that raises is recorded and then re-raised so the daemon's
existing error handling is unchanged.
"""

import pytest

from claudia_memory.loops.job_wrapper import run_with_status
from claudia_memory.loops.status import read_status


def test_writes_status_on_success(tmp_path):
    """A clean run writes a verified status file and returns the job's result."""
    result = run_with_status(
        "daily_decay",
        lambda: "decayed 12",
        status_dir=tmp_path,
        now="2026-06-13T00:00:00Z",
    )

    assert result == "decayed 12"
    fields, _ = read_status(tmp_path / "daily_decay_status.md")
    assert fields["loop_id"] == "daily_decay"
    assert fields["verified"] is True


def test_status_file_named_for_job_id(tmp_path):
    run_with_status("full_consolidation", lambda: None, status_dir=tmp_path, now="t")
    assert (tmp_path / "full_consolidation_status.md").exists()


def test_passing_invariant_marks_verified(tmp_path):
    run_with_status(
        "backup",
        lambda: 5,
        invariants=[("positive", lambda r: (r > 0, "count was non-positive"))],
        status_dir=tmp_path,
        now="t",
    )
    fields, _ = read_status(tmp_path / "backup_status.md")
    assert fields["verified"] is True


def test_failing_invariant_flags_but_does_not_halt(tmp_path):
    """A failed invariant marks verified:false, records the detail, and still
    returns the job's result. Status-only never halts on an invariant."""
    result = run_with_status(
        "backup",
        lambda: 0,
        invariants=[("nonzero", lambda r: (r != 0, "backup count was zero"))],
        status_dir=tmp_path,
        now="t",
    )

    assert result == 0  # not halted; result still returned
    fields, body = read_status(tmp_path / "backup_status.md")
    assert fields["verified"] is False
    assert "backup count was zero" in body


def test_job_exception_recorded_and_reraised(tmp_path):
    """A job that raises is recorded as unverified, then the exception propagates
    so the daemon's existing error handling is unchanged."""
    def boom():
        raise ValueError("disk full")

    with pytest.raises(ValueError, match="disk full"):
        run_with_status("daily_backup", boom, status_dir=tmp_path, now="t")

    fields, body = read_status(tmp_path / "daily_backup_status.md")
    assert fields["verified"] is False
    assert "disk full" in body


def test_invariant_exception_is_a_failure_not_a_halt(tmp_path):
    """If an invariant check itself raises, that counts as a failed invariant,
    the run is flagged, and the job result is still returned."""
    def bad_check(result):
        raise RuntimeError("cannot read backup file")

    result = run_with_status(
        "weekly_backup",
        lambda: "/tmp/backup.db",
        invariants=[("readable", bad_check)],
        status_dir=tmp_path,
        now="t",
    )

    assert result == "/tmp/backup.db"  # not halted
    fields, _ = read_status(tmp_path / "weekly_backup_status.md")
    assert fields["verified"] is False
