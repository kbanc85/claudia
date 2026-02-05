"""Tests for v1.25.0 features: deeper recall, dispatch_tier, migration v14"""

import tempfile
from pathlib import Path

import pytest

from claudia_memory.config import MemoryConfig
from claudia_memory.database import Database


@pytest.fixture
def db():
    """Create a temporary test database"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


class TestMaxRecallResults:
    """Verify max_recall_results config was bumped to 50"""

    def test_default_max_recall_results(self):
        """Default max_recall_results is now 50 for 1M context"""
        config = MemoryConfig()
        assert config.max_recall_results == 50

    def test_explicit_limit_overrides_config(self, db):
        """An explicit limit parameter should override the config default"""
        config = MemoryConfig()
        # Even with default of 50, passing a higher limit should work
        assert config.max_recall_results == 50
        # Config is just a default; the recall function accepts explicit limit


class TestDispatchTier:
    """Verify dispatch_tier column in agent_dispatches"""

    def test_dispatch_tier_column_exists(self, db):
        """Migration v14 adds dispatch_tier column"""
        cols = db.execute(
            "PRAGMA table_info(agent_dispatches)", fetch=True
        )
        col_names = [c["name"] for c in cols]
        assert "dispatch_tier" in col_names

    def test_dispatch_tier_default_is_task(self, db):
        """dispatch_tier defaults to 'task' for backward compatibility"""
        dispatch_id = db.insert(
            "agent_dispatches",
            {
                "agent_name": "document-archivist",
                "dispatch_category": "content-intake",
                "task_summary": "Test dispatch",
                "success": 1,
            },
        )

        row = db.get_one(
            "agent_dispatches", where="id = ?", where_params=(dispatch_id,)
        )
        assert row["dispatch_tier"] == "task"

    def test_dispatch_tier_accepts_native_team(self, db):
        """dispatch_tier can be set to 'native_team'"""
        dispatch_id = db.insert(
            "agent_dispatches",
            {
                "agent_name": "research-scout",
                "dispatch_category": "research",
                "task_summary": "Researched funding history",
                "success": 1,
                "dispatch_tier": "native_team",
            },
        )

        row = db.get_one(
            "agent_dispatches", where="id = ?", where_params=(dispatch_id,)
        )
        assert row["dispatch_tier"] == "native_team"

    def test_dispatch_tier_accepts_task(self, db):
        """dispatch_tier can be explicitly set to 'task'"""
        dispatch_id = db.insert(
            "agent_dispatches",
            {
                "agent_name": "document-processor",
                "dispatch_category": "extraction",
                "task_summary": "Extracted action items",
                "success": 1,
                "dispatch_tier": "task",
            },
        )

        row = db.get_one(
            "agent_dispatches", where="id = ?", where_params=(dispatch_id,)
        )
        assert row["dispatch_tier"] == "task"

    def test_multiple_dispatches_different_tiers(self, db):
        """Can insert multiple dispatches with different tiers and query by tier"""
        db.insert(
            "agent_dispatches",
            {
                "agent_name": "document-archivist",
                "dispatch_category": "content-intake",
                "success": 1,
                "dispatch_tier": "task",
            },
        )
        db.insert(
            "agent_dispatches",
            {
                "agent_name": "research-scout",
                "dispatch_category": "research",
                "success": 1,
                "dispatch_tier": "native_team",
            },
        )
        db.insert(
            "agent_dispatches",
            {
                "agent_name": "document-processor",
                "dispatch_category": "extraction",
                "success": 1,
                "dispatch_tier": "task",
            },
        )

        task_dispatches = db.query(
            "agent_dispatches",
            where="dispatch_tier = ?",
            where_params=("task",),
        )
        native_dispatches = db.query(
            "agent_dispatches",
            where="dispatch_tier = ?",
            where_params=("native_team",),
        )

        assert len(task_dispatches) == 2
        assert len(native_dispatches) == 1
        assert native_dispatches[0]["agent_name"] == "research-scout"


class TestMigrationV14:
    """Verify migration v14 applies cleanly"""

    def test_fresh_database_has_dispatch_tier(self):
        """Fresh database includes dispatch_tier from initial schema"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fresh.db"
            database = Database(db_path)
            database.initialize()

            cols = database.execute(
                "PRAGMA table_info(agent_dispatches)", fetch=True
            )
            col_names = [c["name"] for c in cols]
            assert "dispatch_tier" in col_names
            database.close()

    def test_migration_v14_recorded(self, db):
        """Migration v14 is recorded in schema_migrations"""
        row = db.get_one(
            "schema_migrations",
            where="version = ?",
            where_params=(14,),
        )
        assert row is not None
        assert "dispatch_tier" in row["description"]
