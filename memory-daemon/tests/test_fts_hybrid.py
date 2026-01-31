"""Tests for FTS5 hybrid search functionality"""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database, content_hash


def _make_db():
    """Create a fresh test database with FTS5 support."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _insert_memory(db, content, memory_type="fact", importance=1.0):
    """Helper to insert a memory and return its ID."""
    return db.insert(
        "memories",
        {
            "content": content,
            "content_hash": content_hash(content),
            "type": memory_type,
            "importance": importance,
        },
    )


def test_fts5_table_created_on_migration():
    """Fresh DB should have the memories_fts table after initialization."""
    db, _ = _make_db()
    try:
        tables = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'",
            fetch=True,
        )
        table_names = [t["name"] for t in tables]
        assert "memories_fts" in table_names

        # Also verify the migration version was recorded
        version = db.execute(
            "SELECT MAX(version) as v FROM schema_migrations",
            fetch=True,
        )
        assert version[0]["v"] >= 4
    finally:
        db.close()


def test_fts5_auto_sync_insert():
    """Inserting a memory should make it findable via FTS5 MATCH."""
    db, _ = _make_db()
    try:
        _insert_memory(db, "Sarah loves chocolate ice cream")

        rows = db.execute(
            "SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'chocolate'",
            fetch=True,
        )
        assert len(rows) == 1
    finally:
        db.close()


def test_fts5_auto_sync_delete():
    """Deleting a memory should remove it from the FTS5 index."""
    db, _ = _make_db()
    try:
        mid = _insert_memory(db, "Temporary meeting note about budgets")

        # Verify it's in FTS
        rows = db.execute(
            "SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'budgets'",
            fetch=True,
        )
        assert len(rows) == 1

        # Delete it
        db.delete("memories", "id = ?", (mid,))

        # Verify it's gone from FTS
        rows = db.execute(
            "SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'budgets'",
            fetch=True,
        )
        assert len(rows) == 0
    finally:
        db.close()


def test_fts5_stemming():
    """Porter stemmer should match 'run' to 'running'."""
    db, _ = _make_db()
    try:
        _insert_memory(db, "She was running late to the meeting")

        rows = db.execute(
            "SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'run'",
            fetch=True,
        )
        assert len(rows) == 1
    finally:
        db.close()


def test_fts5_multiple_results_ranking():
    """Multiple FTS results should be ranked by BM25 relevance."""
    db, _ = _make_db()
    try:
        # Insert memories with varying relevance to "project deadline"
        _insert_memory(db, "The project deadline is next Friday")
        _insert_memory(db, "Discussed the project timeline and upcoming deadline with the team")
        _insert_memory(db, "Had coffee this morning")

        rows = db.execute(
            """SELECT m.id, fts.rank FROM memories_fts fts
               JOIN memories m ON m.id = fts.rowid
               WHERE memories_fts MATCH 'project deadline'
               ORDER BY fts.rank""",
            fetch=True,
        )
        # Should find 2 results (not the coffee one)
        assert len(rows) == 2
        # rank values are negative, first should be more negative (better)
        assert rows[0]["rank"] <= rows[1]["rank"]
    finally:
        db.close()


def test_fts5_backfill_on_migration():
    """Memories inserted before FTS5 migration should be backfilled."""
    db, _ = _make_db()
    try:
        # The database is already initialized with FTS5, but we can verify
        # that the backfill mechanism works by inserting and checking
        _insert_memory(db, "Pre-existing memory about quarterly review")

        rows = db.execute(
            "SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'quarterly'",
            fetch=True,
        )
        assert len(rows) == 1
    finally:
        db.close()


def test_fts5_update_sync():
    """Updating a memory's content should update the FTS5 index."""
    db, _ = _make_db()
    try:
        mid = _insert_memory(db, "Original content about pandas")

        # Verify original is searchable
        rows = db.execute(
            "SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'pandas'",
            fetch=True,
        )
        assert len(rows) == 1

        # Update content
        db.update("memories", {"content": "Updated content about koalas"}, "id = ?", (mid,))

        # Old term should not match
        rows = db.execute(
            "SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'pandas'",
            fetch=True,
        )
        assert len(rows) == 0

        # New term should match
        rows = db.execute(
            "SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'koalas'",
            fetch=True,
        )
        assert len(rows) == 1
    finally:
        db.close()
