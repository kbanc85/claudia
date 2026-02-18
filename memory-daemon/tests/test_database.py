"""Tests for database functionality"""

import tempfile
from pathlib import Path

import pytest

from claudia_memory.database import Database, content_hash


def test_content_hash():
    """Test content hashing for deduplication"""
    hash1 = content_hash("hello world")
    hash2 = content_hash("hello world")
    hash3 = content_hash("different content")

    assert hash1 == hash2
    assert hash1 != hash3


def test_database_creation():
    """Test database can be created and initialized"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        db = Database(db_path)
        db.initialize()

        # Check tables exist
        tables = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'",
            fetch=True,
        )
        table_names = [t["name"] for t in tables]

        assert "entities" in table_names
        assert "memories" in table_names
        assert "relationships" in table_names
        assert "episodes" in table_names
        assert "patterns" in table_names
        assert "predictions" in table_names


def test_insert_and_query():
    """Test basic insert and query operations"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        db = Database(db_path)
        db.initialize()

        # Insert an entity
        entity_id = db.insert(
            "entities",
            {
                "name": "Test Person",
                "type": "person",
                "canonical_name": "test person",
                "importance": 1.0,
            },
        )

        assert entity_id is not None
        assert entity_id > 0

        # Query it back
        entity = db.get_one("entities", where="id = ?", where_params=(entity_id,))

        assert entity is not None
        assert entity["name"] == "Test Person"
        assert entity["type"] == "person"


def test_update():
    """Test update operations"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        db = Database(db_path)
        db.initialize()

        # Insert
        entity_id = db.insert(
            "entities",
            {
                "name": "Test Person",
                "type": "person",
                "canonical_name": "test person",
                "importance": 1.0,
            },
        )

        # Update
        db.update(
            "entities",
            {"importance": 0.5, "description": "Updated description"},
            "id = ?",
            (entity_id,),
        )

        # Verify
        entity = db.get_one("entities", where="id = ?", where_params=(entity_id,))

        assert entity["importance"] == 0.5
        assert entity["description"] == "Updated description"


def test_migration_16_source_channel():
    """Migration 16 adds source_channel to memories with default 'claude_code'."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        db = Database(db_path)
        db.initialize()

        # Verify column exists
        cols = db._get_table_columns(db._get_connection(), "memories")
        assert "source_channel" in cols, "source_channel column should exist after migration 16"

        # Insert a memory without specifying source_channel
        memory_id = db.insert("memories", {
            "content": "test memory",
            "content_hash": "abc123",
            "type": "fact",
        })

        # Default should be 'claude_code'
        row = db.get_one("memories", where="id = ?", where_params=(memory_id,))
        assert row["source_channel"] == "claude_code"

        # Insert with explicit source_channel
        memory_id2 = db.insert("memories", {
            "content": "telegram memory",
            "content_hash": "def456",
            "type": "fact",
            "source_channel": "telegram",
        })
        row2 = db.get_one("memories", where="id = ?", where_params=(memory_id2,))
        assert row2["source_channel"] == "telegram"

        db.close()


def test_migration_integrity_detects_missing_verification_status():
    """Migration 5 added verification_status. Integrity check should catch if it is missing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()

        conn = database._get_connection()

        # Simulate a DB where migration 5 column is missing
        conn.execute("ALTER TABLE memories RENAME TO memories_old")
        cols = database._get_table_columns(conn, "memories_old")
        cols.discard("verification_status")
        cols.discard("verified_at")
        col_list = ", ".join(sorted(cols))

        conn.execute(f"""
            CREATE TABLE memories AS
            SELECT {col_list} FROM memories_old WHERE 0
        """)
        conn.execute("DROP TABLE memories_old")
        conn.commit()

        effective_version = database._check_migration_integrity(conn)
        assert effective_version is not None, "Should detect missing verification_status"
        assert effective_version <= 4, f"Should return version <= 4 to re-run migration 5, got {effective_version}"

        database.close()


def test_sqlite_vec_loads_with_enable_extension():
    """sqlite-vec loads correctly with enable_load_extension (Python 3.14+ compat).

    Verifies that the Database class can load sqlite-vec and create vec0
    virtual tables. Skips if sqlite_vec isn't installed or if the Python
    build omits extension loading support (SQLITE_OMIT_LOAD_EXTENSION).
    """
    try:
        import sqlite_vec  # noqa: F401
    except ImportError:
        pytest.skip("sqlite_vec package not installed")

    # Check if this Python build supports extension loading at all
    import sqlite3 as _sqlite3
    _test_conn = _sqlite3.connect(":memory:")
    if not hasattr(_test_conn, "enable_load_extension"):
        _test_conn.close()
        pytest.skip("Python built without SQLITE_LOAD_EXTENSION support")
    _test_conn.close()

    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_vec.db"
        db = Database(db_path)
        db.initialize()

        # If sqlite-vec loaded, we should be able to query a vec0 table
        # memory_embeddings is created in schema.sql as a vec0 virtual table
        result = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_embeddings'",
            fetch=True,
        )
        assert len(result) > 0, "memory_embeddings vec0 table should exist when sqlite-vec is loaded"

        db.close()


# ---------------------------------------------------------------------------
# Lockfile tests
# ---------------------------------------------------------------------------

import sys


def test_lockfile_acquired_on_posix():
    """On POSIX, _acquire_daemon_lock should succeed for the first caller."""
    if sys.platform == "win32":
        pytest.skip("POSIX-only test")

    from claudia_memory.__main__ import _acquire_daemon_lock
    import fcntl, atexit

    with tempfile.TemporaryDirectory() as tmpdir:
        lock_path = Path(tmpdir) / "claudia.lock"
        # Should not raise and should create the lock file
        _acquire_daemon_lock(lock_path)
        assert lock_path.exists()


def test_lockfile_blocks_second_process_on_posix(monkeypatch):
    """On POSIX, a second _acquire_daemon_lock call should detect contention.

    We simulate contention by holding an exclusive flock on the lock file
    in the test process, then calling _acquire_daemon_lock, which should
    detect the lock is taken and call sys.exit(0).
    """
    if sys.platform == "win32":
        pytest.skip("POSIX-only test")

    import fcntl
    from claudia_memory.__main__ import _acquire_daemon_lock

    with tempfile.TemporaryDirectory() as tmpdir:
        lock_path = Path(tmpdir) / "claudia.lock"

        # Pre-acquire the lock file exclusively (simulates running daemon)
        holder = open(lock_path, "w")
        fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)

        exit_called_with = []

        def fake_exit(code):
            exit_called_with.append(code)
            raise SystemExit(code)

        monkeypatch.setattr("sys.exit", fake_exit)

        try:
            _acquire_daemon_lock(lock_path)
        except SystemExit:
            pass
        finally:
            fcntl.flock(holder, fcntl.LOCK_UN)
            holder.close()

        assert exit_called_with == [0], "Should have called sys.exit(0) when lock is held"


def test_wal_checkpoint_pragma_runs():
    """WAL checkpoint pragma should run without error on a fresh database."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_wal.db"
        db = Database(db_path)
        db.initialize()

        # The checkpoint pragma should have run during _get_connection().
        # Verify the connection is valid and queries work post-checkpoint.
        result = db.execute("SELECT 1 as ok", fetch=True)
        assert result[0]["ok"] == 1
        db.close()


# ---------------------------------------------------------------------------
# Transaction isolation tests (B1)
# ---------------------------------------------------------------------------

def test_transaction_commits_on_success(db):
    """Writes inside transaction() are visible after clean exit."""
    with db.transaction():
        db.insert("_meta", {"key": "tx_test", "value": "hello"})
    result = db.execute("SELECT value FROM _meta WHERE key = 'tx_test'", fetch=True)
    assert result and result[0]["value"] == "hello"


def test_transaction_rolls_back_on_exception(db):
    """An exception inside transaction() causes a rollback -- no data persists."""
    try:
        with db.transaction():
            db.insert("_meta", {"key": "tx_rollback", "value": "ephemeral"})
            raise RuntimeError("simulated error")
    except RuntimeError:
        pass
    result = db.execute("SELECT value FROM _meta WHERE key = 'tx_rollback'", fetch=True)
    assert not result


def test_cursor_reuses_tx_connection(db):
    """cursor() uses the active transaction connection when one is open."""
    with db.transaction():
        tx_conn = db._local.tx_conn
        with db.cursor() as cur:
            assert cur.connection is tx_conn
