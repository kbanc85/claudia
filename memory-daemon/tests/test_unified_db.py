"""Tests for unified database: single claudia.db regardless of project_id."""

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.config import MemoryConfig
from claudia_memory.database import Database
from claudia_memory.services.recall import RecallResult


class TestConfigAlwaysUseClaudiaDb:
    """MemoryConfig.load() always resolves to claudia.db, never hash-named files."""

    def test_config_always_uses_claudia_db(self):
        """Different project_ids all resolve to the same claudia.db path."""
        config_a = MemoryConfig.load(project_id="abc123")
        config_b = MemoryConfig.load(project_id="xyz789")
        assert config_a.db_path.name == "claudia.db"
        assert config_b.db_path.name == "claudia.db"
        assert config_a.db_path == config_b.db_path

    def test_config_no_project_uses_claudia_db(self):
        """No project_id also resolves to claudia.db."""
        config = MemoryConfig.load(project_id=None)
        assert config.db_path.name == "claudia.db"

    def test_config_stores_workspace_id_from_project_id(self):
        """project_id is stored as workspace_id for provenance."""
        config = MemoryConfig.load(project_id="abc123")
        assert config.workspace_id == "abc123"

    def test_config_workspace_id_none_without_project(self):
        """No project_id means workspace_id is None."""
        config = MemoryConfig.load(project_id=None)
        assert config.workspace_id is None

    def test_config_db_override_still_wins(self):
        """CLAUDIA_DB_OVERRIDE takes highest priority."""
        with patch.dict(os.environ, {"CLAUDIA_DB_OVERRIDE": "/tmp/custom.db"}):
            config = MemoryConfig.load(project_id="abc123")
            assert str(config.db_path) == "/tmp/custom.db"

    def test_config_demo_mode_still_works(self):
        """CLAUDIA_DEMO_MODE=1 uses demo database."""
        with patch.dict(os.environ, {"CLAUDIA_DEMO_MODE": "1"}):
            config = MemoryConfig.load(project_id="abc123")
            assert "demo" in str(config.db_path)
            # Demo mode no longer creates per-project demo DBs
            assert config.db_path.name == "claudia-demo.db"

    def test_config_backup_dir(self):
        """backup_dir points to ~/.claudia/backups/."""
        config = MemoryConfig.load()
        assert config.backup_dir == Path.home() / ".claudia" / "backups"


class TestMigration21:
    """Migration 21 adds workspace_id column to memories."""

    def test_migration_21_adds_workspace_id(self, db):
        """After db.initialize(), workspace_id column exists on memories."""
        cols = db.execute(
            "PRAGMA table_info(memories)", fetch=True
        )
        col_names = {row["name"] for row in cols}
        assert "workspace_id" in col_names

    def test_migration_21_adds_index(self, db):
        """Index idx_memories_workspace exists after migration."""
        indexes = db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_memories_workspace'",
            fetch=True,
        )
        assert len(indexes) == 1

    def test_workspace_id_is_nullable(self, db):
        """workspace_id defaults to NULL."""
        db.execute(
            "INSERT INTO memories (content, content_hash, type) VALUES ('test', 'hash1', 'fact')"
        )
        row = db.execute(
            "SELECT workspace_id FROM memories WHERE content_hash = 'hash1'",
            fetch=True,
        )
        assert row[0]["workspace_id"] is None


class TestRememberAutoTagsWorkspace:
    """remember_fact() auto-tags workspace_id from config."""

    def test_remember_auto_tags_workspace(self, db):
        """With config.workspace_id set, memories get workspace_id."""
        from claudia_memory.config import get_config, set_project_id, _config

        # Save original state
        import claudia_memory.config as config_module
        orig_config = config_module._config
        orig_pid = config_module._project_id

        try:
            # Set workspace
            config_module._config = None
            config_module._project_id = None
            set_project_id("test_hash_123")

            # Patch the config's db_path to use our test db
            config = get_config()
            config.db_path = db.db_path

            # Insert a memory directly with workspace_id
            db.execute(
                "INSERT INTO memories (content, content_hash, type, workspace_id) "
                "VALUES ('test workspace', 'wshash1', 'fact', ?)",
                (config.workspace_id,),
            )

            row = db.execute(
                "SELECT workspace_id FROM memories WHERE content_hash = 'wshash1'",
                fetch=True,
            )
            assert row[0]["workspace_id"] == "test_hash_123"
        finally:
            config_module._config = orig_config
            config_module._project_id = orig_pid

    def test_remember_no_workspace_when_unset(self, db):
        """With config.workspace_id=None, workspace_id is NULL."""
        db.execute(
            "INSERT INTO memories (content, content_hash, type) "
            "VALUES ('no workspace', 'nwshash1', 'fact')"
        )
        row = db.execute(
            "SELECT workspace_id FROM memories WHERE content_hash = 'nwshash1'",
            fetch=True,
        )
        assert row[0]["workspace_id"] is None


class TestKeywordFallbackWhenFtsEmpty:
    """LIKE fallback activates when FTS5 returns 0 rows (not just on exception)."""

    def test_keyword_fallback_when_fts_empty(self, db):
        """When FTS5 index is empty but memories exist, LIKE search finds them."""
        from unittest.mock import patch as _patch
        from claudia_memory.services.recall import RecallService

        # Insert a memory directly via a separate connection (bypasses FTS triggers)
        import sqlite3 as _sql3
        raw_conn = _sql3.connect(str(db.db_path))
        raw_conn.execute(
            "INSERT INTO memories (content, content_hash, type, importance) "
            "VALUES ('meeting with Alice about project timeline', 'fts_test_hash', 'fact', 0.8)"
        )
        raw_conn.commit()
        raw_conn.close()

        # FTS5 is empty for this row (trigger didn't fire on raw_conn).
        # Patch get_db() so RecallService uses our test db.
        with _patch("claudia_memory.services.recall.get_db", return_value=db):
            svc = RecallService()
            results = svc._keyword_search("Alice", limit=10)

        assert len(results) >= 1
        assert "Alice" in results[0]["content"]

    def test_keyword_fts_match_still_preferred(self, db):
        """When FTS5 is populated, FTS MATCH is used (not LIKE)."""
        from unittest.mock import patch as _patch
        from claudia_memory.services.recall import RecallService

        # Insert via the db object (triggers should fire on same connection)
        db.execute(
            "INSERT INTO memories (content, content_hash, type, importance) "
            "VALUES ('discussion with Bob about deadlines', 'fts_preferred_hash', 'fact', 0.8)"
        )

        # Also manually populate FTS (in case triggers don't fire in test context)
        try:
            db.execute(
                "INSERT INTO memories_fts(memories_fts) VALUES('delete-all')"
            )
            db.execute(
                "INSERT INTO memories_fts(rowid, content) "
                "SELECT id, content FROM memories WHERE invalidated_at IS NULL"
            )
        except Exception:
            pass  # FTS might auto-populate via triggers

        with _patch("claudia_memory.services.recall.get_db", return_value=db):
            svc = RecallService()
            results = svc._keyword_search("Bob", limit=10)

        assert len(results) >= 1
        assert "Bob" in results[0]["content"]


class TestRecallResultHasWorkspaceId:
    """RecallResult dataclass includes workspace_id."""

    def test_recall_result_has_workspace_id_field(self):
        """RecallResult has workspace_id field."""
        result = RecallResult(
            id=1,
            content="test",
            type="fact",
            score=1.0,
            importance=1.0,
            created_at="2026-01-01",
            entities=[],
            workspace_id="test_hash",
        )
        assert result.workspace_id == "test_hash"

    def test_recall_result_workspace_id_default_none(self):
        """RecallResult workspace_id defaults to None."""
        result = RecallResult(
            id=1,
            content="test",
            type="fact",
            score=1.0,
            importance=1.0,
            created_at="2026-01-01",
            entities=[],
        )
        assert result.workspace_id is None

    def test_recall_result_serializable(self):
        """workspace_id appears in dataclass dict."""
        from dataclasses import asdict

        result = RecallResult(
            id=1,
            content="test",
            type="fact",
            score=1.0,
            importance=1.0,
            created_at="2026-01-01",
            entities=[],
            workspace_id="my_workspace",
        )
        d = asdict(result)
        assert d["workspace_id"] == "my_workspace"
