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
