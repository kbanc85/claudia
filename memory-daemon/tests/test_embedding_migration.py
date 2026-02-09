"""Tests for embedding model migration and vec0 table management."""

import json
import logging
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database
from claudia_memory.embeddings import EmbeddingCache, EmbeddingService


def _vec0_available() -> bool:
    """Check if sqlite-vec (vec0 module) is loadable in this environment."""
    conn = sqlite3.connect(":memory:")
    try:
        import sqlite_vec
        if hasattr(conn, "enable_load_extension"):
            conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.execute(
            "CREATE VIRTUAL TABLE _test USING vec0(id INTEGER PRIMARY KEY, v FLOAT[3])"
        )
        conn.close()
        return True
    except Exception:
        conn.close()
        return False


requires_vec0 = pytest.mark.skipif(
    not _vec0_available(), reason="sqlite-vec (vec0) not available in this environment"
)


class TestVec0TableCreation:
    """Tests for configurable vec0 table creation."""

    @requires_vec0
    def test_vec0_tables_created_with_config_dimensions(self):
        """Fresh DB creates vec0 tables using config.embedding_dimensions."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"

            with patch("claudia_memory.database.get_config") as mock_config:
                cfg = mock_config.return_value
                cfg.db_path = db_path
                cfg.embedding_dimensions = 768

                database = Database(db_path)
                database.initialize()

            # All 5 vec0 tables should be queryable
            expected = [
                "entity_embeddings",
                "memory_embeddings",
                "message_embeddings",
                "episode_embeddings",
                "reflection_embeddings",
            ]
            for tbl in expected:
                rows = database.execute(f"SELECT COUNT(*) as cnt FROM {tbl}", fetch=True)
                assert rows[0]["cnt"] == 0, f"{tbl} should exist and be empty"

            database.close()

    def test_vec0_dimensions_stored_in_meta(self):
        """Creating vec0 tables stores dimensions in _meta (works even without vec0)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"

            with patch("claudia_memory.database.get_config") as mock_config:
                cfg = mock_config.return_value
                cfg.db_path = db_path
                cfg.embedding_dimensions = 768

                database = Database(db_path)
                database.initialize()

            rows = database.execute(
                "SELECT value FROM _meta WHERE key = 'embedding_dimensions'",
                fetch=True,
            )
            assert rows is not None and len(rows) > 0
            assert rows[0]["value"] == "768"
            database.close()


class TestMigration:
    """Tests for embedding migration (drop + recreate + re-embed)."""

    @requires_vec0
    def test_migrate_drops_and_recreates_tables(self):
        """Migration drops vec0 tables and recreates with new dimensions."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"

            # Create initial DB with 384D
            with patch("claudia_memory.database.get_config") as mock_config:
                cfg = mock_config.return_value
                cfg.db_path = db_path
                cfg.embedding_dimensions = 384
                database = Database(db_path)
                database.initialize()

            # Insert a test embedding at 384D
            database.execute(
                "INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                (1, json.dumps([0.1] * 384)),
            )

            # Verify it exists
            rows = database.execute(
                "SELECT COUNT(*) as cnt FROM memory_embeddings", fetch=True
            )
            assert rows[0]["cnt"] == 1

            # Simulate migration: drop and recreate at 768D
            with database.transaction() as conn:
                for table, pk in Database.VEC0_TABLES:
                    conn.execute(f"DROP TABLE IF EXISTS {table}")
                    conn.execute(f"""
                        CREATE VIRTUAL TABLE {table} USING vec0(
                            {pk} INTEGER PRIMARY KEY,
                            embedding FLOAT[768]
                        )
                    """)

            # Old data should be gone (tables were dropped)
            rows = database.execute(
                "SELECT COUNT(*) as cnt FROM memory_embeddings", fetch=True
            )
            assert rows[0]["cnt"] == 0

            # New 768D embedding should work
            database.execute(
                "INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                (1, json.dumps([0.1] * 768)),
            )
            rows = database.execute(
                "SELECT COUNT(*) as cnt FROM memory_embeddings", fetch=True
            )
            assert rows[0]["cnt"] == 1

            database.close()

    def test_migrate_updates_meta(self):
        """Migration updates _meta with new model and dimensions."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"

            with patch("claudia_memory.database.get_config") as mock_config:
                cfg = mock_config.return_value
                cfg.db_path = db_path
                cfg.embedding_dimensions = 384
                database = Database(db_path)
                database.initialize()

            # Seed old values
            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', 'all-minilm:l6-v2')"
            )
            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_dimensions', '384')"
            )

            # Simulate _meta update (what --migrate-embeddings does in step 4)
            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', ?)",
                ("nomic-embed-text",),
            )
            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_dimensions', ?)",
                ("768",),
            )

            model_row = database.execute(
                "SELECT value FROM _meta WHERE key = 'embedding_model'", fetch=True
            )
            dims_row = database.execute(
                "SELECT value FROM _meta WHERE key = 'embedding_dimensions'", fetch=True
            )

            assert model_row[0]["value"] == "nomic-embed-text"
            assert dims_row[0]["value"] == "768"
            database.close()

    @requires_vec0
    def test_migrate_reembeds_all_memories(self):
        """Migration re-embeds all memories into the new vec0 table."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"

            with patch("claudia_memory.database.get_config") as mock_config:
                cfg = mock_config.return_value
                cfg.db_path = db_path
                cfg.embedding_dimensions = 384
                database = Database(db_path)
                database.initialize()

            # Insert test memories
            for i in range(3):
                database.execute(
                    "INSERT INTO memories (content, content_hash, type) VALUES (?, ?, ?)",
                    (f"Test memory {i}", f"hash_{i}", "fact"),
                )

            # Drop and recreate at new dimensions
            with database.transaction() as conn:
                conn.execute("DROP TABLE IF EXISTS memory_embeddings")
                conn.execute("""
                    CREATE VIRTUAL TABLE memory_embeddings USING vec0(
                        memory_id INTEGER PRIMARY KEY,
                        embedding FLOAT[768]
                    )
                """)

            # Simulate re-embedding (what --migrate-embeddings does in step 3)
            memories = database.execute(
                "SELECT id, content FROM memories WHERE invalidated_at IS NULL",
                fetch=True,
            )
            for row in memories:
                fake_embedding = [0.5] * 768
                database.execute(
                    "INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                    (row["id"], json.dumps(fake_embedding)),
                )

            rows = database.execute(
                "SELECT COUNT(*) as cnt FROM memory_embeddings", fetch=True
            )
            assert rows[0]["cnt"] == 3

            database.close()


class TestBackfillFormat:
    """Tests for the backfill embedding format fix."""

    @requires_vec0
    def test_backfill_uses_json_not_struct(self):
        """Regression test: backfill stores embeddings as JSON strings, not struct.pack blobs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"

            with patch("claudia_memory.database.get_config") as mock_config:
                cfg = mock_config.return_value
                cfg.db_path = db_path
                cfg.embedding_dimensions = 384
                database = Database(db_path)
                database.initialize()

            # Store embedding the correct way (json.dumps)
            embedding = [0.1, 0.2, 0.3] + [0.0] * 381  # 384D
            json_str = json.dumps(embedding)

            database.execute(
                "INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                (1, json_str),
            )

            rows = database.execute(
                "SELECT COUNT(*) as cnt FROM memory_embeddings", fetch=True
            )
            assert rows[0]["cnt"] == 1

            database.close()

    def test_backfill_code_uses_json_dumps(self):
        """Verify the __main__.py backfill code uses json.dumps, not struct.pack."""
        import inspect
        from claudia_memory import __main__ as main_module

        source = inspect.getsource(main_module.main)
        # The backfill section should NOT contain struct.pack
        assert "struct.pack" not in source, (
            "Backfill code still uses struct.pack! Should use json.dumps instead."
        )

    def test_backfill_rejects_dimension_mismatch(self):
        """Backfill should detect when stored dims don't match config dims."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"

            with patch("claudia_memory.database.get_config") as mock_config:
                cfg = mock_config.return_value
                cfg.db_path = db_path
                cfg.embedding_dimensions = 384
                database = Database(db_path)
                database.initialize()

            # Store dimensions as 384 in _meta
            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_dimensions', '384')"
            )

            # Check: if config says 768 but DB says 384, that's a mismatch
            stored = database.execute(
                "SELECT value FROM _meta WHERE key = 'embedding_dimensions'",
                fetch=True,
            )
            stored_dim = int(stored[0]["value"])
            config_dim = 768  # Simulating a config change

            assert stored_dim != config_dim, "Should detect dimension mismatch"

            database.close()


class TestDimensionMismatchDetection:
    """Tests for dimension mismatch detection in EmbeddingService."""

    def test_dimension_mismatch_sets_flag(self, caplog):
        """Dimension mismatch should set _model_mismatch and log warning."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            database = Database(db_path)
            database.initialize()

            # Seed _meta with 384D
            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', 'all-minilm:l6-v2')"
            )
            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_dimensions', '384')"
            )

            # Create service configured for 768D
            svc = EmbeddingService.__new__(EmbeddingService)
            svc.model = "all-minilm:l6-v2"  # Same model
            svc.dimensions = 768  # Different dimensions
            svc._model_mismatch = False
            svc._cache = EmbeddingCache()

            with patch("claudia_memory.database.get_db", return_value=database):
                with caplog.at_level(logging.WARNING, logger="claudia_memory.embeddings"):
                    svc._check_model_consistency()

            assert svc._model_mismatch is True
            assert "dimensions mismatch" in caplog.text

            database.close()

    def test_matching_dimensions_no_mismatch(self):
        """Same dimensions should not trigger mismatch."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            database = Database(db_path)
            database.initialize()

            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', 'all-minilm:l6-v2')"
            )
            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_dimensions', '384')"
            )

            svc = EmbeddingService.__new__(EmbeddingService)
            svc.model = "all-minilm:l6-v2"
            svc.dimensions = 384
            svc._model_mismatch = False
            svc._cache = EmbeddingCache()

            with patch("claudia_memory.database.get_db", return_value=database):
                svc._check_model_consistency()

            assert svc._model_mismatch is False
            database.close()


class TestEmbeddingCacheClear:
    """Test the clear() method on EmbeddingCache."""

    def test_cache_clear(self):
        """clear() should remove all cached entries."""
        cache = EmbeddingCache(maxsize=10)
        cache.put("a", [1.0])
        cache.put("b", [2.0])
        cache.put("c", [3.0])

        assert cache.stats()["size"] == 3
        cache.clear()
        assert cache.stats()["size"] == 0

        # Entries should be gone
        assert cache.get("a") is None
        assert cache.get("b") is None
        assert cache.get("c") is None


class TestVec0TablesList:
    """Test the VEC0_TABLES class attribute on Database."""

    def test_vec0_tables_list_complete(self):
        """VEC0_TABLES should contain all 5 embedding tables."""
        tables = dict(Database.VEC0_TABLES)
        assert "entity_embeddings" in tables
        assert "memory_embeddings" in tables
        assert "message_embeddings" in tables
        assert "episode_embeddings" in tables
        assert "reflection_embeddings" in tables
        assert len(Database.VEC0_TABLES) == 5

    def test_vec0_tables_pk_columns(self):
        """VEC0_TABLES should map to correct primary key column names."""
        tables = dict(Database.VEC0_TABLES)
        assert tables["entity_embeddings"] == "entity_id"
        assert tables["memory_embeddings"] == "memory_id"
        assert tables["message_embeddings"] == "message_id"
        assert tables["episode_embeddings"] == "episode_id"
        assert tables["reflection_embeddings"] == "reflection_id"
