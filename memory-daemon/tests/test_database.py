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
