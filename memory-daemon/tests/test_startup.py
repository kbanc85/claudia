"""Tests for startup integrity check and auto-restore (B2)."""

import logging
import sqlite3
from pathlib import Path

import pytest

from claudia_memory.__main__ import _check_and_repair_database


def test_passes_for_healthy_db(tmp_path):
    """Integrity check should pass silently for a healthy database."""
    db = tmp_path / "claudia.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE t (x)")
    conn.commit()
    conn.close()
    # Must not raise
    _check_and_repair_database(db)


def test_restores_from_backup_when_corrupt(tmp_path):
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


def test_no_backup_logs_critical(tmp_path, caplog):
    """When database is corrupt and no backup exists, a CRITICAL message is logged."""
    db = tmp_path / "claudia.db"
    db.write_bytes(b"corrupt")

    with caplog.at_level(logging.CRITICAL):
        _check_and_repair_database(db)

    assert any(
        "corrupt" in r.message.lower() or "no backup" in r.message.lower()
        for r in caplog.records
    )


def test_skips_check_if_db_missing(tmp_path):
    """Should return immediately without raising if the database file does not exist."""
    _check_and_repair_database(tmp_path / "nonexistent.db")
