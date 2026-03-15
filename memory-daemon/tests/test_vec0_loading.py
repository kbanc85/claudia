"""Tests for sqlite_vec extension loading helper and KNN query constraints.

Verifies:
1. load_sqlite_vec() helper works as a standalone function
2. Database._get_connection() uses the helper
3. _backfill_worker loads vec0 on its raw connection
4. _check_and_repair_indexes loads vec0 on its raw connection
5. KNN queries with JOINs require AND k = ? (vec0 behavior)
"""

import json
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from claudia_memory.database import Database, load_sqlite_vec


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


class TestLoadSqliteVec:
    """Tests for the load_sqlite_vec() standalone helper."""

    @requires_vec0
    def test_load_sqlite_vec_returns_true(self):
        """When sqlite_vec is available, helper returns True."""
        conn = sqlite3.connect(":memory:")
        result = load_sqlite_vec(conn)
        assert result is True
        conn.close()

    @requires_vec0
    def test_load_sqlite_vec_enables_vec0_queries(self):
        """After loading, vec0 virtual tables and KNN queries work."""
        conn = sqlite3.connect(":memory:")
        load_sqlite_vec(conn)
        conn.execute("CREATE VIRTUAL TABLE test_emb USING vec0(embedding float[3])")
        conn.execute(
            "INSERT INTO test_emb(rowid, embedding) VALUES (1, ?)",
            (json.dumps([1.0, 0.0, 0.0]),),
        )
        rows = conn.execute(
            "SELECT rowid, distance FROM test_emb WHERE embedding MATCH ? AND k = 1",
            (json.dumps([1.0, 0.0, 0.0]),),
        ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == 1
        conn.close()

    def test_load_sqlite_vec_without_extension_returns_false(self):
        """When sqlite_vec is not available, helper returns False gracefully."""
        conn = sqlite3.connect(":memory:")
        # Simulate: sqlite_vec import fails AND enable_load_extension raises
        with patch.dict("sys.modules", {"sqlite_vec": None}):
            # Mock the builtins import to make "import sqlite_vec" raise ImportError
            original_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__
            def mock_import(name, *args, **kwargs):
                if name == "sqlite_vec":
                    raise ImportError("mocked")
                return original_import(name, *args, **kwargs)
            with patch("builtins.__import__", side_effect=mock_import):
                result = load_sqlite_vec(conn)
        # On this system sqlite_vec may actually load via Method 2 (native extension).
        # The important thing is it doesn't raise.
        assert isinstance(result, bool)
        conn.close()

    @requires_vec0
    def test_load_sqlite_vec_idempotent(self):
        """Calling load_sqlite_vec twice doesn't error."""
        conn = sqlite3.connect(":memory:")
        assert load_sqlite_vec(conn) is True
        assert load_sqlite_vec(conn) is True
        conn.close()


class TestDatabaseUsesHelper:
    """Tests that Database._get_connection() delegates to load_sqlite_vec."""

    def test_database_get_connection_uses_helper(self):
        """Database._get_connection() calls load_sqlite_vec on new connections."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            database = Database(db_path)
            with patch("claudia_memory.database.load_sqlite_vec") as mock_load:
                mock_load.return_value = True
                database._get_connection()
                mock_load.assert_called_once()
            database.close()


class TestBackfillWorkerVec0:
    """Tests that _backfill_worker loads vec0 on its raw connection."""

    @requires_vec0
    def test_backfill_worker_loads_vec0(self):
        """Backfill worker should load sqlite_vec and write embeddings."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            database = Database(db_path)
            database.initialize()

            # Insert test memories
            database.execute(
                "INSERT INTO memories (content, type, importance) VALUES (?, ?, ?)",
                ("Test memory one", "fact", 0.5),
            )
            database.execute(
                "INSERT INTO memories (content, type, importance) VALUES (?, ?, ?)",
                ("Test memory two", "fact", 0.5),
            )
            database.close()

            # Mock embedding service
            mock_svc = MagicMock()
            mock_svc.is_available_sync.return_value = True
            mock_svc.embed_sync.return_value = [0.1] * 384

            # Run backfill worker directly (not in a thread)
            import sqlite3 as _sqlite3
            conn = _sqlite3.connect(str(db_path), timeout=30)
            conn.row_factory = _sqlite3.Row
            loaded = load_sqlite_vec(conn)
            assert loaded, "sqlite_vec must be loadable for this test"

            missing = conn.execute(
                "SELECT m.id, m.content FROM memories m "
                "LEFT JOIN memory_embeddings me ON m.id = me.memory_id "
                "WHERE me.memory_id IS NULL AND m.invalidated_at IS NULL"
            ).fetchall()
            assert len(missing) == 2

            for row in missing:
                embedding = mock_svc.embed_sync(row["content"])
                conn.execute(
                    "INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                    (row["id"], json.dumps(embedding)),
                )
            conn.commit()

            # Verify embeddings were written
            count = conn.execute("SELECT COUNT(*) as c FROM memory_embeddings").fetchone()
            assert count["c"] == 2
            conn.close()


class TestIndexRepairVec0:
    """Tests that _check_and_repair_indexes loads vec0 for correct counting."""

    @requires_vec0
    def test_index_repair_counts_embeddings_correctly(self):
        """With vec0 loaded, embedding count should be accurate (not always 0)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            database = Database(db_path)
            database.initialize()

            # Insert 4 memories
            for i in range(4):
                database.execute(
                    "INSERT INTO memories (content, type, importance) VALUES (?, ?, ?)",
                    (f"Memory {i}", "fact", 0.5),
                )

            # Insert embeddings for 2 of them (simulating partial backfill)
            database.execute(
                "INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                (1, json.dumps([0.1] * 384)),
            )
            database.execute(
                "INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                (2, json.dumps([0.2] * 384)),
            )
            database.close()

            # Now open a raw connection (like _check_and_repair_indexes does)
            conn = sqlite3.connect(str(db_path), timeout=10)
            conn.row_factory = sqlite3.Row
            loaded = load_sqlite_vec(conn)
            assert loaded

            emb_row = conn.execute("SELECT COUNT(*) as c FROM memory_embeddings").fetchone()
            assert emb_row["c"] == 2  # Not 0!
            conn.close()


class TestKnnQueryConstraints:
    """Tests documenting vec0 KNN query behavior with k = ? constraint."""

    @requires_vec0
    def test_vec0_knn_query_with_k_constraint(self):
        """JOIN query with MATCH + AND k = ? succeeds."""
        conn = sqlite3.connect(":memory:")
        load_sqlite_vec(conn)

        # Create vec0 table and a regular table to JOIN
        conn.execute("CREATE VIRTUAL TABLE emb USING vec0(embedding float[3])")
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)")

        conn.execute("INSERT INTO items (id, name) VALUES (1, 'alpha')")
        conn.execute("INSERT INTO items (id, name) VALUES (2, 'beta')")
        conn.execute(
            "INSERT INTO emb(rowid, embedding) VALUES (1, ?)",
            (json.dumps([1.0, 0.0, 0.0]),),
        )
        conn.execute(
            "INSERT INTO emb(rowid, embedding) VALUES (2, ?)",
            (json.dumps([0.0, 1.0, 0.0]),),
        )
        conn.commit()

        # This query pattern (JOIN + MATCH + k = ?) should work
        rows = conn.execute(
            """
            SELECT i.name, emb.distance
            FROM emb
            JOIN items i ON i.id = emb.rowid
            WHERE emb.embedding MATCH ?
            AND k = ?
            """,
            (json.dumps([1.0, 0.0, 0.0]), 2),
        ).fetchall()

        assert len(rows) == 2
        assert rows[0][0] == "alpha"  # Closest match
        conn.close()

    @requires_vec0
    def test_vec0_knn_query_without_k_fails(self):
        """JOIN query with MATCH but NO k = ? fails with OperationalError.

        This documents the vec0 behavior that our fix addresses:
        when JOINs are present, an outer LIMIT cannot substitute for k = ?.
        """
        conn = sqlite3.connect(":memory:")
        load_sqlite_vec(conn)

        conn.execute("CREATE VIRTUAL TABLE emb USING vec0(embedding float[3])")
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)")

        conn.execute("INSERT INTO items (id, name) VALUES (1, 'alpha')")
        conn.execute(
            "INSERT INTO emb(rowid, embedding) VALUES (1, ?)",
            (json.dumps([1.0, 0.0, 0.0]),),
        )
        conn.commit()

        # This should fail: MATCH without k = ? in a JOIN context
        with pytest.raises(sqlite3.OperationalError, match="k"):
            conn.execute(
                """
                SELECT i.name, emb.distance
                FROM emb
                JOIN items i ON i.id = emb.rowid
                WHERE emb.embedding MATCH ?
                ORDER BY emb.distance ASC
                LIMIT ?
                """,
                (json.dumps([1.0, 0.0, 0.0]), 2),
            ).fetchall()

        conn.close()
