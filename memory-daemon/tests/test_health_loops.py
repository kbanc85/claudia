"""Health report surfaces wrapped-job loop status (Proposal 11, E5/B4)."""

from claudia_memory.daemon import health
from claudia_memory.loops import job_wrapper
from claudia_memory.loops.status import write_status


def test_status_report_surfaces_loop_files(db, tmp_path, monkeypatch):
    """build_status_report lists each wrapped daemon job's last verdict and
    counts how many are flagged (verified: false)."""
    write_status(
        tmp_path / "daily_backup_status.md",
        {
            "loop_id": "daily_backup",
            "verified": False,
            "checker_verdict": "backup file is empty",
            "updated_at": "2026-06-13T00:00:00Z",
        },
        "# Loop status: daily_backup\n\nbackup file is empty",
    )
    write_status(
        tmp_path / "daily_decay_status.md",
        {
            "loop_id": "daily_decay",
            "verified": True,
            "checker_verdict": "all 1 invariant(s) held",
            "updated_at": "2026-06-13T00:00:00Z",
        },
        "ok",
    )
    monkeypatch.setattr(job_wrapper, "default_loops_dir", lambda: tmp_path)

    report = health.build_status_report(db=db)

    by_job = {entry["job"]: entry for entry in report["loops"]}
    assert by_job["daily_backup"]["verified"] is False
    assert by_job["daily_backup"]["verdict"] == "backup file is empty"
    assert by_job["daily_decay"]["verified"] is True
    assert report["loops_flagged"] == 1


def test_status_report_loops_empty_when_no_files(db, tmp_path, monkeypatch):
    """With no status files, loops is an empty list and nothing is flagged."""
    monkeypatch.setattr(job_wrapper, "default_loops_dir", lambda: tmp_path)
    report = health.build_status_report(db=db)
    assert report["loops"] == []
    assert report["loops_flagged"] == 0
