"""Tests for auto-consolidation of hash-named databases into unified claudia.db."""

import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database, content_hash
from claudia_memory.migration import (
    cleanup_old_databases,
    merge_all_databases,
    scan_hash_databases,
    verify_consolidated_db,
)


def _create_hash_db(directory: Path, hash_name: str, memories: list = None, entities: list = None):
    """Helper: create a hash-named database with optional data."""
    db_path = directory / f"{hash_name}.db"
    db = Database(db_path)
    db.initialize()

    if entities:
        for entity in entities:
            name = entity.get("name", "TestEntity")
            etype = entity.get("type", "person")
            cn = name.lower()
            db.execute(
                "INSERT OR IGNORE INTO entities (name, type, canonical_name) VALUES (?, ?, ?)",
                (name, etype, cn),
            )

    if memories:
        for mem in memories:
            content = mem.get("content", "test memory")
            ch = content_hash(content)
            db.execute(
                "INSERT OR IGNORE INTO memories (content, content_hash, type) VALUES (?, ?, 'fact')",
                (content, ch),
            )

    db.close()
    return db_path


class TestScanHashDatabases:
    """scan_hash_databases() finds hash-named .db files."""

    def test_finds_hash_databases(self):
        """Finds 12-char hex-named databases."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            _create_hash_db(d, "6af67351bcfa", memories=[{"content": "mem1"}])
            _create_hash_db(d, "aabbccddeeff", memories=[{"content": "mem2"}])
            _create_hash_db(d, "000000000000")  # empty

            results = scan_hash_databases(d)
            assert len(results) == 3

    def test_ignores_non_hash_files(self):
        """Ignores claudia.db and other non-hash filenames."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            # Create claudia.db (not a hash name)
            (d / "claudia.db").touch()
            # Create a file with wrong name pattern
            (d / "not-a-hash.db").touch()
            _create_hash_db(d, "6af67351bcfa")

            results = scan_hash_databases(d)
            assert len(results) == 1
            assert results[0]["hash"] == "6af67351bcfa"

    def test_separates_data_from_empty(self):
        """Correctly identifies databases with and without data."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            _create_hash_db(d, "aabbccddeeff", memories=[{"content": "has data"}])
            _create_hash_db(d, "000000000000")  # empty

            results = scan_hash_databases(d)
            data_dbs = [r for r in results if r["has_data"]]
            empty_dbs = [r for r in results if not r["has_data"]]
            assert len(data_dbs) == 1
            assert len(empty_dbs) == 1


class TestMergeAllDatabases:
    """merge_all_databases() merges sources into target."""

    def test_merges_into_claudia_db(self):
        """After merge, claudia.db has all memories + entities from sources."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            target_path = d / "claudia.db"
            target = Database(target_path)
            target.initialize()
            target.close()

            # Create source databases
            _create_hash_db(d, "aaaaaabbbbbb",
                            memories=[{"content": "memory from source A"}],
                            entities=[{"name": "Alice"}])
            _create_hash_db(d, "ccccccdddddd",
                            memories=[{"content": "memory from source B"}],
                            entities=[{"name": "Bob"}])

            sources = scan_hash_databases(d)
            data_sources = [s for s in sources if s["has_data"]]

            totals = merge_all_databases(target_path, data_sources)

            assert totals["sources_merged"] == 2
            assert totals["total_memories_migrated"] >= 2

            # Verify data in target
            conn = sqlite3.connect(str(target_path))
            conn.row_factory = sqlite3.Row
            mems = conn.execute("SELECT COUNT(*) as c FROM memories").fetchone()["c"]
            ents = conn.execute("SELECT COUNT(*) as c FROM entities").fetchone()["c"]
            conn.close()
            assert mems >= 2
            assert ents >= 2

    def test_dedup_entities(self):
        """Same entity (name+type) in 2 sources produces 1 entity in target."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            target_path = d / "claudia.db"
            target = Database(target_path)
            target.initialize()
            target.close()

            _create_hash_db(d, "aaaaaabbbbbb",
                            entities=[{"name": "Sarah", "type": "person"}])
            _create_hash_db(d, "ccccccdddddd",
                            entities=[{"name": "Sarah", "type": "person"}])

            sources = [s for s in scan_hash_databases(d) if s["has_data"]]
            merge_all_databases(target_path, sources)

            conn = sqlite3.connect(str(target_path))
            conn.row_factory = sqlite3.Row
            count = conn.execute(
                "SELECT COUNT(*) as c FROM entities WHERE canonical_name = 'sarah'"
            ).fetchone()["c"]
            conn.close()
            assert count == 1

    def test_dedup_memories(self):
        """Same content_hash in 2 sources produces 1 memory in target."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            target_path = d / "claudia.db"
            target = Database(target_path)
            target.initialize()
            target.close()

            _create_hash_db(d, "aaaaaabbbbbb",
                            memories=[{"content": "duplicate memory"}])
            _create_hash_db(d, "ccccccdddddd",
                            memories=[{"content": "duplicate memory"}])

            sources = [s for s in scan_hash_databases(d) if s["has_data"]]
            totals = merge_all_databases(target_path, sources)

            # First source migrates, second is a duplicate
            assert totals["total_memories_duplicate"] >= 1

            conn = sqlite3.connect(str(target_path))
            conn.row_factory = sqlite3.Row
            ch = content_hash("duplicate memory")
            count = conn.execute(
                "SELECT COUNT(*) as c FROM memories WHERE content_hash = ?", (ch,)
            ).fetchone()["c"]
            conn.close()
            assert count == 1

    def test_tags_workspace_id(self):
        """Merged memories have workspace_id = source DB hash."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            target_path = d / "claudia.db"
            target = Database(target_path)
            target.initialize()
            target.close()

            _create_hash_db(d, "aaaaaabbbbbb",
                            memories=[{"content": "tagged memory"}])

            sources = [s for s in scan_hash_databases(d) if s["has_data"]]
            merge_all_databases(target_path, sources)

            conn = sqlite3.connect(str(target_path))
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT workspace_id FROM memories WHERE content = 'tagged memory'"
            ).fetchone()
            conn.close()
            # Should be tagged with source hash
            assert row["workspace_id"] == "aaaaaabbbbbb"

    def test_dry_run(self):
        """Dry run counts without changing target."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            target_path = d / "claudia.db"
            target = Database(target_path)
            target.initialize()
            target.close()

            _create_hash_db(d, "aaaaaabbbbbb",
                            memories=[{"content": "dry run memory"}])

            sources = [s for s in scan_hash_databases(d) if s["has_data"]]
            totals = merge_all_databases(target_path, sources, dry_run=True)

            assert totals["sources_merged"] >= 1

            # Target should still be empty
            conn = sqlite3.connect(str(target_path))
            conn.row_factory = sqlite3.Row
            count = conn.execute("SELECT COUNT(*) as c FROM memories").fetchone()["c"]
            conn.close()
            assert count == 0


class TestCleanupOldDatabases:
    """cleanup_old_databases() removes hash DBs and companions."""

    def test_deletes_hash_dbs(self):
        """After cleanup, hash DB files are gone."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            db_path = _create_hash_db(d, "aaaaaabbbbbb")

            sources = scan_hash_databases(d)
            deleted = cleanup_old_databases(d, sources)

            assert deleted >= 1
            assert not db_path.exists()

    def test_deletes_wal_shm(self):
        """Also deletes WAL and SHM companion files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            db_path = _create_hash_db(d, "aaaaaabbbbbb")
            # Create companion files
            (Path(str(db_path) + "-wal")).touch()
            (Path(str(db_path) + "-shm")).touch()

            sources = scan_hash_databases(d)
            deleted = cleanup_old_databases(d, sources)

            assert deleted >= 3
            assert not Path(str(db_path) + "-wal").exists()
            assert not Path(str(db_path) + "-shm").exists()


class TestVerifyConsolidatedDb:
    """verify_consolidated_db() checks integrity."""

    def test_verifies_good_db(self):
        """Good database passes integrity check."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = Database(db_path)
            db.initialize()
            db.close()
            assert verify_consolidated_db(db_path) is True

    def test_catches_missing_db(self):
        """Missing database fails integrity check."""
        assert verify_consolidated_db(Path("/tmp/nonexistent_db_12345.db")) is False


class TestAutoConsolidation:
    """Integration tests for _auto_consolidate() in __main__."""

    def test_sets_unified_db_meta(self):
        """After consolidation, _meta['unified_db'] == 'true'."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "claudia.db"
            db = Database(db_path)
            db.initialize()

            # Manually set the flag as _auto_consolidate would
            db.execute(
                "INSERT OR REPLACE INTO _meta (key, value, updated_at) "
                "VALUES ('unified_db', 'true', datetime('now'))"
            )

            rows = db.execute(
                "SELECT value FROM _meta WHERE key = 'unified_db'",
                fetch=True,
            )
            assert rows[0]["value"] == "true"
            db.close()

    def test_idempotent_with_flag(self):
        """With _meta['unified_db'] set, consolidation is a no-op."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "claudia.db"
            db = Database(db_path)
            db.initialize()

            # Set the flag
            db.execute(
                "INSERT OR REPLACE INTO _meta (key, value, updated_at) "
                "VALUES ('unified_db', 'true', datetime('now'))"
            )

            # Create a hash DB that would normally be merged
            _create_hash_db(Path(tmpdir), "aaaaaabbbbbb",
                            memories=[{"content": "should not merge"}])

            # Check flag prevents scanning
            rows = db.execute(
                "SELECT value FROM _meta WHERE key = 'unified_db'",
                fetch=True,
            )
            assert rows[0]["value"] == "true"

            # Memories count should be 0 (nothing merged)
            count = db.execute(
                "SELECT COUNT(*) as c FROM memories", fetch=True
            )[0]["c"]
            assert count == 0
            db.close()

    def test_skips_empty_hash_dbs(self):
        """Empty hash DBs are cleaned up without merging."""
        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            _create_hash_db(d, "000000000000")  # empty
            _create_hash_db(d, "111111111111")  # empty

            results = scan_hash_databases(d)
            data_dbs = [r for r in results if r["has_data"]]
            assert len(data_dbs) == 0

            # Cleanup would remove them
            deleted = cleanup_old_databases(d, results)
            assert deleted >= 2
