"""Tests for database backup and rolling retention."""

import glob
import sqlite3
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from claudia_memory.config import MemoryConfig


def test_backup_creates_file(db):
    """Backup should create a .backup-YYYY-MM-DD.db file."""
    backup_path = db.backup()
    assert backup_path.exists()
    assert ".backup-" in backup_path.name
    assert backup_path.suffix == ".db"


def test_backup_is_valid_database(db):
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


def test_backup_rolling_retention(db):
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


def test_backup_returns_path(db):
    """Backup should return the Path to the created backup."""
    result = db.backup()
    assert isinstance(result, Path)
    today = datetime.now().strftime("%Y-%m-%d")
    assert today in result.name
