"""Tests for human-readable backup naming in ~/.claudia/backups/."""

import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database


@pytest.fixture
def db_with_backup_dir():
    """Create a test database with a custom backup directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "memory" / "claudia.db"
        backup_dir = Path(tmpdir) / "backups"

        db = Database(db_path)
        db.initialize()

        # Patch config to use our temp backup dir
        with patch("claudia_memory.database.get_config") as mock_config:
            config = mock_config.return_value
            config.db_path = db_path
            config.backup_dir = backup_dir
            config.backup_retention_count = 3
            config.backup_daily_retention = 7
            config.backup_weekly_retention = 4
            config.embedding_dimensions = 384

            yield db, backup_dir

        db.close()


class TestBackupGoesToBackupsDir:
    """Backups are created in ~/.claudia/backups/, not alongside the DB."""

    def test_backup_goes_to_backups_dir(self, db_with_backup_dir):
        """backup() creates file in backups/ directory."""
        db, backup_dir = db_with_backup_dir
        path = db.backup()
        assert path.parent == backup_dir
        assert path.exists()

    def test_backup_dir_created_automatically(self, db_with_backup_dir):
        """backup() creates the backups/ directory if it doesn't exist."""
        db, backup_dir = db_with_backup_dir
        # Remove the dir if it exists
        if backup_dir.exists():
            import shutil
            shutil.rmtree(backup_dir)
        assert not backup_dir.exists()

        path = db.backup()
        assert backup_dir.exists()
        assert path.exists()


class TestBackupNaming:
    """Backup files have human-readable names."""

    def test_backup_daily_naming(self, db_with_backup_dir):
        """backup(label='daily') uses claudia-daily-YYYY-MM-DD.db format."""
        db, backup_dir = db_with_backup_dir
        path = db.backup(label="daily")
        today = datetime.now().strftime("%Y-%m-%d")
        assert path.name == f"claudia-daily-{today}.db"

    def test_backup_pre_merge_naming(self, db_with_backup_dir):
        """backup(label='pre-merge') uses claudia-pre-merge-YYYY-MM-DD.db."""
        db, backup_dir = db_with_backup_dir
        path = db.backup(label="pre-merge")
        today = datetime.now().strftime("%Y-%m-%d")
        assert path.name == f"claudia-pre-merge-{today}.db"

    def test_backup_pre_migration_naming(self, db_with_backup_dir):
        """backup(label='pre-migration') uses correct format."""
        db, backup_dir = db_with_backup_dir
        path = db.backup(label="pre-migration")
        today = datetime.now().strftime("%Y-%m-%d")
        assert path.name == f"claudia-pre-migration-{today}.db"

    def test_backup_manual_naming(self, db_with_backup_dir):
        """backup() with no label uses claudia-manual-YYYY-MM-DD-HHMMSS.db."""
        db, backup_dir = db_with_backup_dir
        path = db.backup()
        assert path.name.startswith("claudia-manual-")
        assert path.suffix == ".db"
        # Should include time component (more than just date)
        stem = path.stem  # e.g., claudia-manual-2026-03-15-143022
        parts = stem.split("-")
        assert len(parts) >= 5  # claudia, manual, YYYY, MM, DD-HHMMSS


class TestBackupRetention:
    """Rolling retention enforces limits per backup type."""

    def test_backup_retention_daily(self, db_with_backup_dir):
        """After exceeding daily retention, oldest daily backups are deleted."""
        db, backup_dir = db_with_backup_dir
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Create 10 daily backups (retention is 7)
        for day in range(1, 11):
            path = backup_dir / f"claudia-daily-2026-03-{day:02d}.db"
            path.write_bytes(b"fake backup")

        # Now create a new daily backup (triggers cleanup)
        db.backup(label="daily")

        # Count remaining daily backups
        daily_backups = list(backup_dir.glob("claudia-daily-*.db"))
        assert len(daily_backups) <= 7

    def test_backup_retention_manual(self, db_with_backup_dir):
        """After exceeding manual retention, oldest are deleted."""
        db, backup_dir = db_with_backup_dir
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Create 5 manual backups (retention is 3)
        for i in range(5):
            path = backup_dir / f"claudia-manual-2026-03-15-14000{i}.db"
            path.write_bytes(b"fake backup")

        # Trigger cleanup
        db.backup()

        manual_backups = list(backup_dir.glob("claudia-manual-*.db"))
        assert len(manual_backups) <= 3


class TestBackupIntegrity:
    """Backups are verified with PRAGMA integrity_check."""

    def test_backup_integrity_verified(self, db_with_backup_dir):
        """A valid backup is not deleted."""
        db, backup_dir = db_with_backup_dir
        # Insert some data
        db.execute(
            "INSERT INTO memories (content, content_hash, type) VALUES ('test', 'hash1', 'fact')"
        )
        path = db.backup()
        assert path.exists()

        # Verify the backup can be opened and queried
        import sqlite3
        conn = sqlite3.connect(str(path))
        result = conn.execute("PRAGMA integrity_check").fetchone()
        conn.close()
        assert result[0] == "ok"
