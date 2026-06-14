"""Tests for the loop status-file helper (Proposal 11, E1/B3).

The helper writes a Markdown-body + YAML-frontmatter status file atomically,
so an interrupted write never leaves a partially-written file at the canonical
path. These tests pin that contract.
"""

import os

import pytest

from claudia_memory.loops.status import read_status, write_status


def test_round_trips_fields_and_body(tmp_path):
    """Fields and body survive a write -> read round trip unchanged."""
    target = tmp_path / "research_status.md"
    fields = {
        "loop_id": "iterate-board-update-20260613",
        "last_input": "draft v3",
        "maker_proposal": "tightened the lede to one sentence",
        "checker_verdict": "stronger lede, ask still buried",
        "verified": False,
        "next_action": "surface the ask in the opening line",
    }
    body = "# Loop status\n\nIteration 4 reverted: checker scored it below best."

    write_status(target, fields, body)
    read_fields, read_body = read_status(target)

    assert read_fields == fields
    assert read_body == body


def test_preserves_value_types(tmp_path):
    """bool, int, float, and None round-trip as native Python types."""
    target = tmp_path / "status.md"
    fields = {
        "verified": True,
        "iteration": 3,
        "score": 7.4,
        "budget_remaining": None,
    }

    write_status(target, fields, "")
    read_fields, _ = read_status(target)

    assert read_fields["verified"] is True
    assert read_fields["iteration"] == 3
    assert read_fields["score"] == 7.4
    assert read_fields["budget_remaining"] is None


def test_creates_missing_parent_directories(tmp_path):
    """Writing into a non-existent subdirectory creates the path."""
    target = tmp_path / "loops" / "consolidation_status.md"

    write_status(target, {"verified": True}, "")

    assert target.exists()


def test_leaves_no_temp_file_after_success(tmp_path):
    """A successful write leaves only the target file, no stray temp files."""
    target = tmp_path / "status.md"

    write_status(target, {"verified": True}, "body")

    entries = list(tmp_path.iterdir())
    assert entries == [target], f"unexpected leftovers: {entries}"


def test_interrupted_write_does_not_corrupt_existing_file(tmp_path, monkeypatch):
    """If os.replace fails mid-write, the canonical path keeps its OLD content.

    This is the crash-safety contract: a partial write is never visible at the
    target path. We simulate the failure by making os.replace raise after the
    temp file has been written.
    """
    target = tmp_path / "status.md"
    write_status(target, {"verified": True, "iteration": 1}, "first")

    def boom(src, dst):
        raise OSError("simulated crash during rename")

    monkeypatch.setattr(os, "replace", boom)

    with pytest.raises(OSError):
        write_status(target, {"verified": False, "iteration": 2}, "second")

    # The old content must still be intact and fully readable.
    read_fields, read_body = read_status(target)
    assert read_fields["iteration"] == 1
    assert read_fields["verified"] is True
    assert read_body == "first"


def test_interrupted_write_leaves_no_temp_file(tmp_path, monkeypatch):
    """A failed write cleans up its temp file rather than littering the dir."""
    target = tmp_path / "status.md"
    write_status(target, {"iteration": 1}, "first")

    monkeypatch.setattr(
        os, "replace", lambda src, dst: (_ for _ in ()).throw(OSError("nope"))
    )

    with pytest.raises(OSError):
        write_status(target, {"iteration": 2}, "second")

    # Only the original target should remain; no .tmp siblings left behind.
    entries = sorted(p.name for p in tmp_path.iterdir())
    assert entries == ["status.md"], f"unexpected leftovers: {entries}"
