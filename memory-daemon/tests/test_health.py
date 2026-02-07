"""Tests for the health check diagnostics."""

import tempfile
from pathlib import Path

from claudia_memory.database import Database
from claudia_memory.daemon.health import build_status_report


def test_status_report_includes_schema_version(db):
    """Status report should include the current schema migration version."""
    report = build_status_report(db=db)
    assert "schema_version" in report, "Status should include schema_version"
    assert isinstance(report["schema_version"], int)


def test_status_report_includes_components(db):
    """Status report should include component health checks."""
    report = build_status_report(db=db)
    assert "components" in report
    assert "database" in report["components"]


def test_status_report_includes_job_list(db):
    """Status report should list active scheduled jobs."""
    report = build_status_report(db=db)
    assert "scheduled_jobs" in report
    assert isinstance(report["scheduled_jobs"], list)


def test_status_report_includes_counts(db):
    """Status report should include memory/entity counts."""
    report = build_status_report(db=db)
    assert "counts" in report
    assert "memories" in report["counts"]
    assert "entities" in report["counts"]
