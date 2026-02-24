"""Tests for daemon lifecycle: health check, scheduler, startup integrity, backup."""

import glob
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.config import MemoryConfig
from claudia_memory.database import Database
from claudia_memory.daemon.health import build_status_report
from claudia_memory.daemon.scheduler import MemoryScheduler
from claudia_memory.__main__ import _check_and_repair_database


# =============================================================================
# Health check
# =============================================================================


class TestHealthCheck:
    """Tests for the health check diagnostics."""

    def test_status_report_includes_schema_version(self, db):
        """Status report should include the current schema migration version."""
        report = build_status_report(db=db)
        assert "schema_version" in report, "Status should include schema_version"
        assert isinstance(report["schema_version"], int)

    def test_status_report_includes_components(self, db):
        """Status report should include component health checks."""
        report = build_status_report(db=db)
        assert "components" in report
        assert "database" in report["components"]

    def test_status_report_includes_job_list(self, db):
        """Status report should list active scheduled jobs."""
        report = build_status_report(db=db)
        assert "scheduled_jobs" in report
        assert isinstance(report["scheduled_jobs"], list)

    def test_status_report_includes_counts(self, db):
        """Status report should include memory/entity counts."""
        report = build_status_report(db=db)
        assert "counts" in report
        assert "memories" in report["counts"]
        assert "entities" in report["counts"]


# =============================================================================
# Scheduler configuration
# =============================================================================


class TestSchedulerConfiguration:
    """Tests for the memory scheduler configuration."""

    def test_registers_expected_jobs(self):
        """Scheduler should register decay, pattern detection, consolidation, and vault sync."""
        scheduler = MemoryScheduler()

        with patch.object(scheduler.scheduler, "start"):
            scheduler.start()

        jobs = scheduler.scheduler.get_jobs()
        job_ids = {job.id for job in jobs}

        expected = {"daily_decay", "pattern_detection", "full_consolidation", "vault_sync"}
        assert job_ids == expected, (
            f"Expected jobs {expected}, got: {job_ids}"
        )

    def test_does_not_register_removed_jobs(self):
        """Verify removed jobs are not registered."""
        scheduler = MemoryScheduler()

        with patch.object(scheduler.scheduler, "start"):
            scheduler.start()

        job_ids = {job.id for job in scheduler.scheduler.get_jobs()}

        removed_jobs = {
            "hourly_decay",
            "daily_predictions",
            "memory_verification",
            "llm_consolidation",
            "daily_metrics",
            "document_lifecycle",
        }
        assert job_ids.isdisjoint(removed_jobs), (
            f"Found removed jobs still registered: {job_ids & removed_jobs}"
        )

    def test_decay_is_daily_not_hourly(self):
        """Decay should run daily at 2 AM, not hourly."""
        scheduler = MemoryScheduler()

        with patch.object(scheduler.scheduler, "start"):
            scheduler.start()

        decay_job = scheduler.scheduler.get_job("daily_decay")
        assert decay_job is not None, "daily_decay job should exist"
        trigger = decay_job.trigger
        assert type(trigger).__name__ == "CronTrigger", (
            f"Expected CronTrigger, got {type(trigger).__name__}"
        )


# =============================================================================
# Startup integrity
# =============================================================================


class TestStartupIntegrity:
    """Tests for startup integrity check and auto-restore."""

    def test_passes_for_healthy_db(self, tmp_path):
        """Integrity check should pass silently for a healthy database."""
        db = tmp_path / "claudia.db"
        conn = sqlite3.connect(db)
        conn.execute("CREATE TABLE t (x)")
        conn.commit()
        conn.close()
        # Must not raise
        _check_and_repair_database(db)

    def test_restores_from_backup_when_corrupt(self, tmp_path):
        """A corrupt database should be replaced with the latest backup."""
        db = tmp_path / "claudia.db"
        backup = tmp_path / "claudia.db.backup-2026-01-01-120000.db"

        # Create a valid backup
        conn = sqlite3.connect(backup)
        conn.execute("CREATE TABLE t (x)")
        conn.commit()
        conn.close()

        # Corrupt the main DB
        db.write_bytes(b"not a valid sqlite file")

        _check_and_repair_database(db)

        # Main DB should now be the restored backup
        conn = sqlite3.connect(db)
        result = conn.execute("PRAGMA integrity_check").fetchone()
        conn.close()
        assert result[0] == "ok"

    def test_no_backup_logs_critical(self, tmp_path, caplog):
        """When database is corrupt and no backup exists, a CRITICAL message is logged."""
        db = tmp_path / "claudia.db"
        db.write_bytes(b"corrupt")

        with caplog.at_level(logging.CRITICAL):
            _check_and_repair_database(db)

        assert any(
            "corrupt" in r.message.lower() or "no backup" in r.message.lower()
            for r in caplog.records
        )

    def test_skips_check_if_db_missing(self, tmp_path):
        """Should return immediately without raising if the database file does not exist."""
        _check_and_repair_database(tmp_path / "nonexistent.db")


# =============================================================================
# Backup management
# =============================================================================


class TestBackupManagement:
    """Tests for database backup and rolling retention."""

    def test_creates_file(self, db):
        """Backup should create a .backup-YYYY-MM-DD.db file."""
        backup_path = db.backup()
        assert backup_path.exists()
        assert ".backup-" in backup_path.name
        assert backup_path.suffix == ".db"

    def test_is_valid_database(self, db):
        """Backup file should be a valid SQLite database with the same schema."""
        # Insert some data first
        db.execute(
            "INSERT INTO entities (name, type, canonical_name) VALUES (?, ?, ?)",
            ("Alice", "person", "alice"),
        )
        db.execute(
            "INSERT INTO memories (content, content_hash, type) VALUES (?, ?, ?)",
            ("Test memory", "hash123", "fact"),
        )

        backup_path = db.backup()

        # Open the backup and verify data
        conn = sqlite3.connect(str(backup_path))
        try:
            row = conn.execute("SELECT COUNT(*) FROM entities").fetchone()
            assert row[0] >= 1

            row = conn.execute("SELECT COUNT(*) FROM memories").fetchone()
            assert row[0] >= 1
        finally:
            conn.close()

    def test_rolling_retention(self, db):
        """Old backups beyond retention count should be deleted."""
        config = MemoryConfig()
        config.backup_retention_count = 2

        with patch("claudia_memory.database.get_config", return_value=config):
            # Create 3 backups with different timestamps
            for i, date_str in enumerate(["2026-01-01", "2026-01-02", "2026-01-03"]):
                # Manually create backup files to simulate history
                fake_backup = Path(f"{db.db_path}.backup-{date_str}.db")
                fake_backup.write_bytes(b"fake")

            # Now do a real backup (will be 4th)
            backup_path = db.backup()

            # Check how many backups remain
            pattern = f"{db.db_path}.backup-*.db"
            remaining = sorted(glob.glob(pattern))
            assert len(remaining) <= 2

    def test_returns_path(self, db):
        """Backup should return the Path to the created backup."""
        result = db.backup()
        assert isinstance(result, Path)
        today = datetime.now().strftime("%Y-%m-%d")
        assert today in result.name
