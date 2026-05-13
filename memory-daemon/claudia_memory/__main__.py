"""
Claudia Memory Daemon Entry Point

Starts the memory daemon with:
- MCP server for Claude Code communication
- Background scheduler for consolidation
- Health check HTTP endpoint
"""

import argparse
import asyncio
import hashlib
import logging
import os
import signal
import sqlite3
import sys
from pathlib import Path

from .config import get_config, set_project_id
from .daemon.health import start_health_server, stop_health_server
from .daemon.scheduler import start_scheduler, stop_scheduler
from .database import get_db, load_sqlite_vec
from .mcp.server import run_server as run_mcp_server

logger = logging.getLogger(__name__)

# Flag for graceful shutdown
_shutdown_requested = False


def get_project_hash(project_dir: str) -> str:
    """Generate consistent short hash from project directory path.

    Uses SHA256 truncated to 12 characters for a good balance of:
    - Uniqueness (12 hex chars = 48 bits = ~281 trillion combinations)
    - Readability (short enough to see in file listings)
    - Determinism (same path always produces same hash)
    """
    return hashlib.sha256(project_dir.encode()).hexdigest()[:12]


def setup_logging(log_path: Path = None, debug: bool = False) -> None:
    """Configure logging"""
    config = get_config()
    log_path = log_path or config.log_path

    # Ensure log directory exists
    log_path.parent.mkdir(parents=True, exist_ok=True)

    level = logging.DEBUG if debug else logging.INFO

    # Configure root logger
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler(log_path),
            logging.StreamHandler(sys.stderr),
        ],
    )

    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    global _shutdown_requested
    logger.info(f"Received signal {signum}, initiating shutdown")
    _shutdown_requested = True


def _acquire_daemon_lock(lock_path: Path) -> None:
    """Acquire an exclusive lock to prevent concurrent daemon instances.

    On POSIX (macOS/Linux): uses fcntl.flock() -- automatically released
    by the OS even on SIGKILL, so it cannot get stuck stale.

    On Windows: uses msvcrt byte-range locking on the lock file.

    Exits with code 0 if another daemon is already running.
    """
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    if sys.platform == "win32":
        import atexit
        import msvcrt

        try:
            # Open (or create) the lock file
            lf = open(lock_path, "w+b")
            lf.write(str(os.getpid()).encode())
            lf.flush()
            lf.seek(0)
            msvcrt.locking(lf.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            logger.warning("Another Claudia daemon is already running. Exiting.")
            sys.exit(0)
        atexit.register(lambda: (msvcrt.locking(lf.fileno(), msvcrt.LK_UNLCK, 1), lf.close()))
    else:
        import atexit
        import fcntl

        try:
            lf = open(lock_path, "w")
            fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
            lf.write(str(os.getpid()))
            lf.flush()
        except OSError:
            logger.warning("Another Claudia daemon is already running. Exiting.")
            sys.exit(0)
        atexit.register(lambda: (fcntl.flock(lf, fcntl.LOCK_UN), lf.close()))


def _check_and_repair_database(db_path: Path) -> None:
    """Run integrity check and auto-restore from backup if database is corrupt.

    Called after acquiring the daemon lock, before db.initialize().
    Uses a read-only connection so we don't touch the WAL before checking.
    """
    import glob
    import shutil

    if not db_path.exists():
        return  # Fresh install, nothing to check

    is_corrupt = False
    try:
        ro_conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5)
        result = ro_conn.execute("PRAGMA integrity_check").fetchone()
        ro_conn.close()
        if result and result[0] == "ok":
            logger.info("Database integrity check passed.")
            return
        logger.error(f"Database integrity check FAILED: {result}")
        is_corrupt = True
    except Exception as e:
        logger.error(f"Could not open database for integrity check: {e}")
        is_corrupt = True

    if not is_corrupt:
        return

    backup_pattern = str(db_path) + ".backup-*.db"
    backups = sorted(glob.glob(backup_pattern), key=os.path.getmtime)
    if backups:
        latest = backups[-1]
        logger.warning(f"Restoring database from backup: {latest}")
        shutil.copy2(latest, db_path)
        # Clean up stale WAL files using direct path concatenation
        for suffix in ("-shm", "-wal"):
            stale = Path(str(db_path) + suffix)
            if stale.exists():
                stale.unlink()
                logger.info(f"Removed stale WAL file: {stale}")
        logger.info("Database restored from backup successfully.")
    else:
        logger.critical(
            "Database is corrupt and no backup exists. "
            "Memory system will attempt to start but may have errors. "
            f"Manual recovery: sqlite3 {db_path} '.dump' | sqlite3 repaired.db"
        )


def _auto_consolidate() -> None:
    """Auto-consolidate hash-named databases into the unified claudia.db.

    Detects hash-named databases (12-char hex filenames) in ~/.claudia/memory/
    and merges them into claudia.db. This handles the upgrade from per-project
    hash-based DB isolation to the unified database model.

    Properties:
    - Idempotent: checks _meta['unified_db'] flag, won't run twice
    - Safe: creates pre-merge backup before any changes
    - Non-fatal: catches all exceptions, logs, continues
    - Cleans up: deletes hash DBs + WAL/SHM after successful merge
    """
    from .migration import (
        cleanup_old_databases,
        merge_all_databases,
        scan_hash_databases,
        verify_consolidated_db,
    )

    try:
        db = get_db()
        config = get_config()
        memory_dir = Path(config.db_path).parent

        # Check if already consolidated
        try:
            rows = db.execute(
                "SELECT value FROM _meta WHERE key = 'unified_db'",
                fetch=True,
            )
            if rows and rows[0]["value"] == "true":
                # Unified. Clean up any empty hash DBs that stale daemon instances may have
                # created (old standalone daemons running pre-unified-DB code create a fresh
                # empty hash DB on startup if the original was deleted by consolidation).
                all_hash_dbs = scan_hash_databases(memory_dir)
                empty_dbs = [d for d in all_hash_dbs if not d["has_data"]]
                if empty_dbs:
                    logger.info(
                        f"Removing {len(empty_dbs)} empty hash DB(s) left by stale standalone daemon"
                    )
                    cleanup_old_databases(memory_dir, empty_dbs)
                return
        except Exception:
            pass  # _meta table might not exist yet

        # Scan for hash-named databases
        all_hash_dbs = scan_hash_databases(memory_dir)
        if not all_hash_dbs:
            # No hash DBs found: fresh install or already cleaned up
            _set_unified_db_flag(db)
            return

        # Separate databases with data from empty ones
        data_dbs = [d for d in all_hash_dbs if d["has_data"]]
        empty_dbs = [d for d in all_hash_dbs if not d["has_data"]]

        if not data_dbs and empty_dbs:
            # Only empty hash DBs: clean them up and mark unified
            logger.info(f"Found {len(empty_dbs)} empty hash databases, cleaning up")
            cleanup_old_databases(memory_dir, empty_dbs)
            _set_unified_db_flag(db)
            return

        if not data_dbs:
            _set_unified_db_flag(db)
            return

        # Log what we found
        total_memories = sum(d["stats"].get("memories", 0) for d in data_dbs)
        total_entities = sum(d["stats"].get("entities", 0) for d in data_dbs)
        logger.info(
            f"Found {len(data_dbs)} hash databases with data "
            f"({total_memories} memories, {total_entities} entities). "
            f"Consolidating into claudia.db..."
        )

        # Create pre-merge backup
        try:
            backup_path = db.backup(label="pre-merge")
            logger.info(f"Pre-merge backup created: {backup_path}")
        except Exception as e:
            logger.warning(f"Pre-merge backup failed: {e}")
            # Continue anyway, the merge is additive

        # Merge all hash databases into claudia.db
        active_path = Path(config.db_path)
        totals = merge_all_databases(active_path, data_dbs)

        # Verify integrity after merge
        if not verify_consolidated_db(active_path):
            logger.error(
                "Integrity check FAILED after consolidation. "
                "Keeping hash databases for manual recovery."
            )
            return

        # Clean up: delete hash DBs + WAL/SHM + orphan backups
        deleted = cleanup_old_databases(memory_dir, all_hash_dbs)

        # Set the unified_db flag
        _set_unified_db_flag(db)

        merged_count = totals.get('total_memories_migrated', 0)
        sources_count = totals.get('sources_merged', 0)

        logger.info(
            f"Consolidated {merged_count} memories "
            f"from {sources_count} databases into claudia.db. "
            f"Cleaned up {deleted} old files."
        )

        # Write context/whats-new.md so Claudia surfaces the upgrade in-chat
        _write_consolidation_notice(merged_count, sources_count)

    except Exception as e:
        # Non-fatal: log error and continue with whatever data we have
        logger.error(f"Auto-consolidation failed (non-fatal): {e}")
        logger.info("Daemon will continue with current database. "
                     "Run --merge-databases manually to retry.")


def _set_unified_db_flag(db) -> None:
    """Set the _meta flag indicating this is a unified database."""
    from datetime import datetime as dt
    try:
        db.execute(
            "INSERT OR REPLACE INTO _meta (key, value, updated_at) "
            "VALUES ('unified_db', 'true', ?)",
            (dt.now().isoformat(),),
        )
    except Exception as e:
        logger.warning(f"Could not set unified_db flag: {e}")


def _write_consolidation_notice(merged_count: int, sources_count: int) -> None:
    """Write context/whats-new.md so Claudia mentions the upgrade in her greeting.

    Includes live DB stats after merge and explains the backup schedule.
    Looks for context/ in the workspace path (set via --project-dir).
    Falls back silently if no workspace is configured.
    """
    workspace_path = os.environ.get("CLAUDIA_WORKSPACE_PATH")
    if not workspace_path:
        return

    try:
        context_dir = Path(workspace_path) / "context"
        whats_new = context_dir / "whats-new.md"

        if not context_dir.exists():
            return  # Not a Claudia workspace

        from datetime import datetime as dt

        # Query live stats from the now-consolidated database
        db = get_db()
        stats = {}
        for label, query in [
            ("memories", "SELECT COUNT(*) as c FROM memories"),
            ("entities", "SELECT COUNT(*) as c FROM entities WHERE deleted_at IS NULL"),
            ("relationships", "SELECT COUNT(*) as c FROM relationships"),
            ("episodes", "SELECT COUNT(*) as c FROM episodes"),
            ("reflections", "SELECT COUNT(*) as c FROM reflections"),
            ("patterns", "SELECT COUNT(*) as c FROM patterns WHERE is_active = 1"),
        ]:
            try:
                rows = db.execute(query, fetch=True)
                stats[label] = rows[0]["c"] if rows else 0
            except Exception:
                stats[label] = 0

        date = dt.now().strftime("%Y-%m-%d")
        db_path = get_config().db_path

        content = f"""# Memory System Upgrade ({date})

## IMPORTANT: Read this fully and include it in your first greeting regardless of what the user says.

## What just happened

Your memory has been unified. Previously, each project directory created its own isolated database (hash-named files like `6af67351bcfa.db`). Now everything lives in one place: `{db_path}`.

**Consolidation results:**
- Merged {merged_count:,} memories from {sources_count} legacy database{'s' if sources_count != 1 else ''}
- Created a pre-merge backup at `~/.claudia/backups/`
- Cleaned up old hash-named database files
- All data deduplicated (same memory across databases = 1 copy)

## Current database state

| What | Count |
|------|-------|
| Memories | {stats['memories']:,} |
| Entities (people, orgs, concepts) | {stats['entities']:,} |
| Relationships | {stats['relationships']:,} |
| Episodes (sessions) | {stats['episodes']:,} |
| Reflections | {stats['reflections']:,} |
| Active patterns | {stats['patterns']:,} |

## How backups work going forward

Your database is automatically backed up on a schedule (requires the standalone daemon via LaunchAgent/systemd):

| When | What | Retention |
|------|------|-----------|
| Daily at 2:30 AM | `claudia-daily-YYYY-MM-DD.db` | 7 days |
| Sundays at 2:45 AM | `claudia-weekly-YYYY-MM-DD.db` | 4 weeks |
| Before migrations | `claudia-pre-migration-YYYY-MM-DD.db` | 4 copies |
| Before consolidations | `claudia-pre-merge-YYYY-MM-DD.db` | 4 copies |

All backups live in `~/.claudia/backups/`. Old backups are automatically cleaned up when they exceed retention limits.

## Search index rebuild

Your full-text search index has been rebuilt automatically. If Ollama is running, vector embeddings are being regenerated in the background (this takes a few minutes for large databases). Until embeddings finish, recall uses keyword search as a fallback.

**What this means for the user:**
- You remember everything from every project, always. No more fragmented memory.
- Moving project directories no longer loses history.
- Backups happen silently overnight. If something ever goes wrong, there's always a recent backup to restore from.

---
_Surface this update in your first greeting with the database stats and backup explanation, then delete this file._
"""
        whats_new.write_text(content)
        logger.info(f"Wrote consolidation notice to {whats_new}")
    except Exception as e:
        logger.debug(f"Could not write consolidation notice: {e}")


def _check_and_repair_indexes(db_path: Path) -> None:
    """Detect and repair empty FTS5 / embedding indexes after consolidation.

    Runs on every daemon startup (idempotent). Handles three populations:
    - Already broken (upgraded to v1.55.0-1.55.6): FTS empty, embeddings empty
    - Fresh consolidation (upgrading now): FTS rebuilt in merge, embeddings backfilled here
    - Normal startup (no issues): counts match, no-op

    Stores '_meta["indexes_repaired"]' with timestamp when repairs happen.
    """
    from datetime import datetime as dt
    from .migration import rebuild_fts_index

    try:
        conn = sqlite3.connect(str(db_path), timeout=10)
        conn.row_factory = sqlite3.Row
        load_sqlite_vec(conn)

        # Count memories
        mem_row = conn.execute("SELECT COUNT(*) as c FROM memories WHERE invalidated_at IS NULL").fetchone()
        mem_count = mem_row["c"] if mem_row else 0

        if mem_count == 0:
            conn.close()
            return  # No memories, nothing to repair

        # Check FTS5 index
        fts_count = 0
        try:
            fts_row = conn.execute("SELECT COUNT(*) as c FROM memories_fts").fetchone()
            fts_count = fts_row["c"] if fts_row else 0
        except Exception:
            pass  # FTS5 table might not exist

        # Check embeddings
        emb_count = 0
        try:
            emb_row = conn.execute("SELECT COUNT(*) as c FROM memory_embeddings").fetchone()
            emb_count = emb_row["c"] if emb_row else 0
        except sqlite3.OperationalError as e:
            if "no such table" in str(e):
                pass  # Fresh install, vec0 tables not yet created
            elif "no such module" in str(e):
                logger.debug("sqlite_vec not loaded, cannot count embeddings")
            else:
                logger.warning(f"Unexpected error counting embeddings: {e}")

        conn.close()

        fts_gap = mem_count - fts_count
        emb_gap = mem_count - emb_count
        fts_threshold = max(10, int(mem_count * 0.1))  # 10% or at least 10
        emb_threshold = max(10, int(mem_count * 0.1))

        repaired = []

        # Repair FTS5 if significantly fewer entries than memories
        if fts_gap > fts_threshold:
            logger.warning(
                f"FTS5 index gap detected: {fts_count} indexed vs {mem_count} memories. "
                f"Rebuilding FTS5 index..."
            )
            indexed = rebuild_fts_index(db_path)
            repaired.append(f"fts5: {fts_count}->{indexed}")
            logger.info(f"FTS5 repair complete: {indexed} rows indexed")

        # Trigger embedding backfill if significantly fewer embeddings
        if emb_gap > emb_threshold:
            logger.warning(
                f"Embedding gap detected: {emb_count} embeddings vs {mem_count} memories. "
                f"Starting background backfill..."
            )
            _auto_backfill_embeddings(db_path, mem_count, emb_count)
            repaired.append(f"embeddings: {emb_count}/{mem_count} (backfill started)")

        # Record repair timestamp
        if repaired:
            try:
                rc = sqlite3.connect(str(db_path), timeout=10)
                rc.execute(
                    "INSERT OR REPLACE INTO _meta (key, value, updated_at) "
                    "VALUES ('indexes_repaired', ?, ?)",
                    (", ".join(repaired), dt.now().isoformat()),
                )
                rc.commit()
                rc.close()
            except Exception:
                pass
        else:
            logger.debug(
                f"Index health OK: FTS5={fts_count}/{mem_count}, "
                f"embeddings={emb_count}/{mem_count}"
            )

    except Exception as e:
        # Non-fatal: log and continue
        logger.error(f"Index repair check failed (non-fatal): {e}")


def _auto_backfill_embeddings(db_path: Path, mem_count: int, emb_count: int) -> None:
    """Start background thread to generate missing embeddings.

    Non-blocking: the MCP server starts immediately while this runs.
    Tolerant: if Ollama isn't running, logs a warning and exits.
    Batched: processes 25 at a time with progress logging.
    Idempotent: LEFT JOIN ensures only missing embeddings are generated.
    """
    import json as _json
    import threading

    def _backfill_worker():
        try:
            from .embeddings import get_embedding_service

            svc = get_embedding_service()
            if not svc.is_available_sync():
                logger.warning(
                    "Ollama not available for embedding backfill. "
                    "Recall will use LIKE fallback until embeddings are generated. "
                    "Start Ollama and restart the daemon, or run --backfill-embeddings."
                )
                return

            conn = sqlite3.connect(str(db_path), timeout=30)
            conn.row_factory = sqlite3.Row
            if not load_sqlite_vec(conn):
                logger.warning(
                    "sqlite_vec not available in backfill thread. "
                    "Cannot write to vec0 tables. Skipping embedding backfill."
                )
                conn.close()
                return

            # Find memories missing embeddings
            missing = conn.execute(
                "SELECT m.id, m.content FROM memories m "
                "LEFT JOIN memory_embeddings me ON m.id = me.memory_id "
                "WHERE me.memory_id IS NULL AND m.invalidated_at IS NULL"
            ).fetchall()

            if not missing:
                logger.info("Embedding backfill: no missing embeddings found")
                conn.close()
                return

            total = len(missing)
            logger.info(f"Embedding backfill: generating embeddings for {total} memories...")

            success = 0
            failed = 0
            batch_size = 25

            for i, row in enumerate(missing, 1):
                try:
                    embedding = svc.embed_sync(row["content"])
                    if embedding:
                        conn.execute(
                            "INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                            (row["id"], _json.dumps(embedding)),
                        )
                        success += 1
                        if success % batch_size == 0:
                            conn.commit()
                    else:
                        failed += 1
                except Exception as e:
                    failed += 1
                    if failed <= 3:
                        logger.debug(f"Embedding failed for memory {row['id']}: {e}")

                if i % batch_size == 0 or i == total:
                    logger.info(f"Embedding backfill progress: {i}/{total} (success={success}, failed={failed})")

            conn.commit()
            conn.close()

            logger.info(f"Embedding backfill complete: {success} generated, {failed} failed out of {total}")

        except Exception as e:
            logger.error(f"Embedding backfill thread failed: {e}")

    thread = threading.Thread(target=_backfill_worker, name="embedding-backfill", daemon=True)
    thread.start()
    logger.info("Embedding backfill thread started in background")


def _write_preflight_result(result: dict) -> Path:
    """Write preflight result JSON to ~/.claudia/daemon-preflight.json."""
    out_path = Path.home() / ".claudia" / "daemon-preflight.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    import json as _json
    with open(out_path, "w") as f:
        _json.dump(result, f, indent=2)
    return out_path


def run_preflight(project_id: str = None, debug: bool = False) -> dict:
    """Validate the entire MCP daemon startup chain.

    Returns a dict with 'ok' (bool) and 'checks' (list of check results).
    Each check has: name, ok, detail, and optionally 'fix' when it fails.
    """
    from datetime import datetime as dt

    if project_id:
        set_project_id(project_id)

    checks = []
    result = {
        "timestamp": dt.now().isoformat(timespec="seconds"),
        "ok": True,
        "project_id": project_id,
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "checks": checks,
    }

    # 1. Python version >= 3.10
    py_ok = sys.version_info >= (3, 10)
    checks.append({
        "name": "python_version",
        "ok": py_ok,
        "critical": True,
        "detail": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        **({"fix": "Python 3.10+ is required. Install from python.org or your package manager."} if not py_ok else {}),
    })

    # 2. MCP SDK importable
    try:
        import mcp
        mcp_version = getattr(mcp, "__version__", "unknown")
        checks.append({"name": "mcp_sdk", "ok": True, "critical": True, "detail": mcp_version})
    except ImportError as e:
        checks.append({
            "name": "mcp_sdk", "ok": False, "critical": True,
            "detail": str(e),
            "fix": "Install the MCP SDK: pip install mcp",
        })

    # 3. Config loads
    try:
        config = get_config()
        config_path = Path.home() / ".claudia" / "config.json"
        config_source = str(config_path) if config_path.exists() else "defaults"
        checks.append({"name": "config_load", "ok": True, "critical": False, "detail": config_source})
    except Exception as e:
        checks.append({
            "name": "config_load", "ok": False, "critical": False,
            "detail": str(e),
            "fix": "Check ~/.claudia/config.json for valid JSON syntax.",
        })
        config = None

    # 4. Database path writable
    if config:
        db_path = Path(config.db_path)
        result["db_path"] = str(db_path)
        db_dir = db_path.parent
        try:
            db_dir.mkdir(parents=True, exist_ok=True)
            # Test writability
            test_file = db_dir / ".preflight_test"
            test_file.write_text("ok")
            test_file.unlink()
            checks.append({"name": "db_path", "ok": True, "critical": True, "detail": str(db_path)})
        except Exception as e:
            checks.append({
                "name": "db_path", "ok": False, "critical": True,
                "detail": str(e),
                "fix": f"Ensure the directory {db_dir} exists and is writable.",
            })
    else:
        result["db_path"] = "unknown"

    # 5. Database connection (short timeout)
    if config:
        try:
            conn = sqlite3.connect(str(config.db_path), timeout=5.0)
            conn.execute("SELECT 1")
            conn.close()
            checks.append({"name": "db_connect", "ok": True, "critical": True, "detail": "connected"})
        except Exception as e:
            detail = str(e)
            fix = "Check for another process holding a lock on the database."
            if "locked" in detail.lower():
                fix = "Another process may be using the database. Check for running claudia processes."
            checks.append({
                "name": "db_connect", "ok": False, "critical": True,
                "detail": detail, "fix": fix,
            })

    # 6. schema.sql exists and parseable
    schema_path = Path(__file__).parent / "schema.sql"
    if schema_path.exists():
        try:
            content = schema_path.read_text()
            stmt_count = content.count(";")
            checks.append({
                "name": "schema_load", "ok": True, "critical": True,
                "detail": f"{stmt_count} statements",
            })
        except Exception as e:
            checks.append({
                "name": "schema_load", "ok": False, "critical": True,
                "detail": str(e),
                "fix": "schema.sql is unreadable. Reinstall: pip install --force-reinstall claudia-memory",
            })
    else:
        checks.append({
            "name": "schema_load", "ok": False, "critical": True,
            "detail": "file not found",
            "fix": f"Schema file missing at {schema_path}. Reinstall: pip install --force-reinstall claudia-memory",
        })

    # 7. Migrations
    if config:
        try:
            from .database import Database
            db = Database(Path(config.db_path))
            db.initialize()
            checks.append({"name": "migrations", "ok": True, "critical": True, "detail": "up to date"})
            db.close()
        except Exception as e:
            checks.append({
                "name": "migrations", "ok": False, "critical": True,
                "detail": str(e),
                "fix": "Database migration failed. Try --repair or reinstall claudia-memory.",
            })

    # 8. sqlite-vec extension
    if config:
        try:
            conn = sqlite3.connect(str(config.db_path), timeout=5.0)
            vec_loaded = False
            # Method 1: Python package (preferred)
            try:
                import sqlite_vec
                if hasattr(conn, "enable_load_extension"):
                    conn.enable_load_extension(True)
                sqlite_vec.load(conn)
                if hasattr(conn, "enable_load_extension"):
                    conn.enable_load_extension(False)
                vec_loaded = True
            except ImportError:
                pass
            except Exception:
                pass
            # Method 2: Native extension (fallback)
            if not vec_loaded and hasattr(conn, "enable_load_extension"):
                try:
                    conn.enable_load_extension(True)
                    conn.load_extension("vec0")
                    conn.enable_load_extension(False)
                    vec_loaded = True
                except Exception:
                    pass
            if vec_loaded:
                vec_ver = conn.execute("SELECT vec_version()").fetchone()[0]
                conn.close()
                checks.append({"name": "sqlite_vec", "ok": True, "critical": False, "detail": vec_ver})
            else:
                conn.close()
                checks.append({
                    "name": "sqlite_vec", "ok": False, "critical": False,
                    "detail": "could not load extension",
                    "fix": "Install sqlite-vec: pip install sqlite-vec (in the daemon venv)",
                })
        except Exception as e:
            checks.append({
                "name": "sqlite_vec", "ok": False, "critical": False,
                "detail": str(e),
                "fix": "Install sqlite-vec: pip install sqlite-vec (in the daemon venv)",
            })

    # 9. MCP server object
    try:
        from .mcp.server import server as mcp_server_obj
        assert mcp_server_obj is not None
        checks.append({"name": "mcp_server", "ok": True, "critical": True, "detail": "initialized"})
    except Exception as e:
        checks.append({
            "name": "mcp_server", "ok": False, "critical": True,
            "detail": str(e),
            "fix": "MCP server failed to initialize. Reinstall: pip install --force-reinstall claudia-memory",
        })

    # 10. Tool count
    try:
        from .mcp.server import list_tools as _list_tools
        import asyncio as _asyncio
        tools_result = _asyncio.run(_list_tools())
        tool_count = len(tools_result.tools) if hasattr(tools_result, "tools") else 0
        ok = tool_count > 0
        checks.append({
            "name": "tool_count", "ok": ok, "critical": True,
            "detail": f"{tool_count} tools",
            **({"fix": "No tools registered. The MCP server code may have a bug."} if not ok else {}),
        })
    except Exception as e:
        checks.append({
            "name": "tool_count", "ok": False, "critical": True,
            "detail": str(e),
            "fix": "Could not enumerate tools. Check for import errors in MCP server.",
        })

    # 11. Ollama (non-critical)
    if config:
        try:
            import httpx
            resp = httpx.get(f"{config.ollama_host}/api/tags", timeout=3)
            if resp.status_code == 200:
                checks.append({"name": "ollama", "ok": True, "critical": False, "detail": config.ollama_host})
            else:
                checks.append({
                    "name": "ollama", "ok": False, "critical": False,
                    "detail": f"HTTP {resp.status_code}",
                    "fix": "Ollama is not responding. Start it or check the configured host.",
                })
        except Exception:
            checks.append({
                "name": "ollama", "ok": False, "critical": False,
                "detail": "not reachable",
                "fix": "Ollama not running. Memory works without it, but vector search is disabled.",
            })

    # Compute overall ok (all critical checks must pass)
    result["ok"] = all(c["ok"] for c in checks if c.get("critical", False))

    # Write result file
    out_path = _write_preflight_result(result)

    # Print human-readable summary
    print(f"Claudia Memory Daemon Preflight Check")
    print(f"{'=' * 42}")
    for c in checks:
        icon = "PASS" if c["ok"] else ("WARN" if not c.get("critical") else "FAIL")
        print(f"  [{icon}] {c['name']}: {c['detail']}")
        if not c["ok"] and "fix" in c:
            print(f"         Fix: {c['fix']}")
    print()
    verdict = "ALL CHECKS PASSED" if result["ok"] else "CRITICAL CHECKS FAILED"
    print(f"  Result: {verdict}")
    print(f"  Details: {out_path}")

    return result


def attempt_repairs(preflight_result: dict, project_id: str = None) -> int:
    """Attempt to auto-fix common issues found by preflight.

    Returns the number of issues fixed.
    """
    if project_id:
        set_project_id(project_id)

    config = get_config()
    fixed = 0
    failed_checks = [c for c in preflight_result.get("checks", []) if not c["ok"]]

    if not failed_checks:
        return 0

    for check in failed_checks:
        name = check["name"]

        if name == "schema_load":
            # Can't fix missing schema.sql, that requires reinstall
            print(f"  [SKIP] {name}: requires reinstall")
            continue

        if name == "db_connect":
            # Try WAL checkpoint to clear stale locks
            try:
                db_path = config.db_path
                conn = sqlite3.connect(str(db_path), timeout=10.0)
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                conn.close()
                print(f"  [FIXED] {name}: cleared WAL checkpoint")
                fixed += 1
            except Exception as e:
                print(f"  [FAIL] {name}: {e}")

        elif name == "migrations":
            # Re-run schema + migrations
            try:
                from .database import Database
                db = Database(Path(config.db_path))
                db.initialize()
                db.close()
                print(f"  [FIXED] {name}: re-ran schema and migrations")
                fixed += 1
            except Exception as e:
                print(f"  [FAIL] {name}: {e}")

        elif name == "config_load":
            # Create default config.json
            config_path = Path.home() / ".claudia" / "config.json"
            if not config_path.exists():
                try:
                    import json as _json
                    config_path.parent.mkdir(parents=True, exist_ok=True)
                    config_path.write_text(_json.dumps({}, indent=2))
                    print(f"  [FIXED] {name}: created empty config.json")
                    fixed += 1
                except Exception as e:
                    print(f"  [FAIL] {name}: {e}")

        elif name == "sqlite_vec":
            # Try pip install sqlite-vec in the current environment
            import subprocess
            try:
                subprocess.run(
                    [sys.executable, "-m", "pip", "install", "sqlite-vec"],
                    capture_output=True, text=True, timeout=60,
                )
                print(f"  [FIXED] {name}: installed sqlite-vec")
                fixed += 1
            except Exception as e:
                print(f"  [FAIL] {name}: {e}")

        elif name == "db_path":
            # Try to create the directory
            try:
                Path(config.db_path).parent.mkdir(parents=True, exist_ok=True)
                print(f"  [FIXED] {name}: created database directory")
                fixed += 1
            except Exception as e:
                print(f"  [FAIL] {name}: {e}")

        else:
            print(f"  [SKIP] {name}: no auto-fix available")

    return fixed


def run_daemon(mcp_mode: bool = True, debug: bool = False, project_id: str = None) -> None:
    """
    Run the Claudia Memory Daemon.

    Args:
        mcp_mode: If True, run as MCP server (stdio mode)
        debug: Enable debug logging
        project_id: Optional project identifier for database isolation
    """
    # Set project context before any config access
    if project_id:
        set_project_id(project_id)

    setup_logging(debug=debug)
    logger.info("Starting Claudia Memory Daemon")
    if project_id:
        logger.info(f"Project isolation enabled: {project_id}")

    config = get_config()
    config_path = Path.home() / ".claudia" / "config.json"
    logger.info(f"Database path: {config.db_path}")
    logger.info(f"Config source: {config_path if config_path.exists() else 'defaults'}")
    logger.info(f"Project: {project_id or 'default'}")

    if not mcp_mode:
        # Only enforce singleton for the standalone background daemon.
        # The lock prevents two long-running background processes from
        # concurrently running scheduled jobs (decay, consolidation) against
        # the same SQLite file, which caused "database disk image is malformed"
        # errors.
        #
        # MCP servers are ephemeral, session-bound processes spawned by Claude
        # Code. They must NOT compete for the same lock as a running standalone
        # daemon (e.g., installed via LaunchAgent/systemd). SQLite WAL mode
        # handles concurrent read/write access safely across processes.
        _acquire_daemon_lock(Path(config.db_path).parent / "claudia.lock")

    _check_and_repair_database(Path(config.db_path))

    # Set up signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    try:
        # Initialize database
        db = get_db()
        db.initialize()

        # Log database identity
        try:
            mem_count = db.execute(
                "SELECT COUNT(*) as c FROM memories", fetch=True
            )
            count = mem_count[0]["c"] if mem_count else 0
            logger.info(f"Using database: {get_config().db_path} ({count} memories)")
        except Exception:
            logger.info(f"Using database: {get_config().db_path}")

        # Auto-consolidate hash-named databases into unified claudia.db
        _auto_consolidate()

        # Repair FTS5 and embeddings if they're out of sync with memories.
        # Handles already-affected users (v1.55.0-1.55.6) and fresh consolidations.
        _check_and_repair_indexes(Path(config.db_path))

        # Start health server and scheduler - ONLY in standalone mode.
        # MCP server processes are ephemeral and session-bound; the standalone
        # daemon (LaunchAgent/systemd) owns port 3848 and handles scheduling.
        # Starting these here in MCP mode causes [Errno 48] Address already in
        # use and double-scheduling alongside the running standalone daemon.
        if not mcp_mode:
            start_health_server()
            logger.info(f"Health server started on port {get_config().health_port}")

            start_scheduler()
            logger.info("Background scheduler started")

        if mcp_mode:
            # Run MCP server (blocks until stdin closes)
            logger.info("Starting MCP server (stdio mode)")
            asyncio.run(run_mcp_server())
        else:
            # Run as standalone daemon (for testing)
            logger.info("Running in standalone mode (no MCP)")
            import time
            while not _shutdown_requested:
                time.sleep(1)

    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    except Exception as e:
        logger.exception(f"Daemon error: {e}")
        sys.exit(1)
    finally:
        # Cleanup
        logger.info("Shutting down...")
        stop_scheduler()
        stop_health_server()
        # Close embedding service HTTP clients to avoid resource leak
        try:
            from .embeddings import get_embedding_service
            svc = get_embedding_service()
            if svc._sync_client:
                svc._sync_client.close()
                svc._sync_client = None
        except Exception:
            pass
        db = get_db()
        db.close()
        logger.info("Claudia Memory Daemon stopped")


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Claudia Memory Daemon - Superhuman memory for your AI assistant"
    )
    parser.add_argument(
        "--standalone",
        action="store_true",
        help="Run in standalone mode (without MCP server)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )
    parser.add_argument(
        "--consolidate",
        action="store_true",
        help="Run consolidation once and exit",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check system health and exit",
    )
    parser.add_argument(
        "--project-dir",
        type=str,
        help="Project directory for workspace tagging (provenance on memories, not DB isolation)",
    )
    parser.add_argument(
        "--tui",
        action="store_true",
        help="Launch the Brain Monitor terminal dashboard (requires: pip install claudia-memory[tui])",
    )
    parser.add_argument(
        "--backfill-embeddings",
        action="store_true",
        help="Generate embeddings for all memories that don't have them yet, then exit",
    )
    parser.add_argument(
        "--migrate-embeddings",
        action="store_true",
        help="Migrate embeddings to a new model/dimensions (drop and recreate vec0 tables, re-embed all data)",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Create a database backup and exit",
    )
    parser.add_argument(
        "--vault-sync",
        action="store_true",
        help="Export memory to Obsidian vault and exit (full rebuild)",
    )
    parser.add_argument(
        "--import-vault",
        action="store_true",
        help="Import user edits from Obsidian vault back into memory and exit",
    )
    parser.add_argument(
        "--migrate-vault-para",
        action="store_true",
        help="Migrate vault to PARA structure (use --preview to see plan first)",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Preview mode for --migrate-vault-para: show routing plan without making changes",
    )
    parser.add_argument(
        "--backfill-entities",
        action="store_true",
        help=(
            "Scan memories for un-linked entity references and propose "
            "creating/linking them (Proposal #51). Dry-run by default; "
            "pass --apply to write changes (creates a SQLite backup first)."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help=(
            "With --backfill-entities: actually write the changes. "
            "A SQLite backup is created at ~/.claudia/backups/ before any "
            "writes; if backup creation fails, the command aborts."
        ),
    )
    parser.add_argument(
        "--migrate-legacy",
        action="store_true",
        help="Manually migrate data from a legacy database into claudia.db",
    )
    parser.add_argument(
        "--merge-databases",
        action="store_true",
        help="Manually merge all hash-named databases into unified claudia.db",
    )
    parser.add_argument(
        "--preflight",
        action="store_true",
        help="Validate the entire startup chain without entering MCP mode. "
             "Writes results to ~/.claudia/daemon-preflight.json and exits.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="With --preflight: print the result as JSON to stdout in addition to "
             "the human-readable summary. The installer uses this for structured parsing.",
    )
    parser.add_argument(
        "--repair",
        action="store_true",
        help="Auto-fix common issues found by preflight (missing tables, stale WAL, etc.)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview migration without making changes (use with --migrate-legacy)",
    )
    parser.add_argument(
        "--legacy-db",
        type=str,
        help="Path to legacy database (default: ~/.claudia/memory/claudia.db)",
    )

    args = parser.parse_args()

    # Compute project ID from directory path if provided
    project_id = None
    if args.project_dir:
        project_id = get_project_hash(args.project_dir)
        # Set project context early for commands that don't call run_daemon
        set_project_id(project_id)
        # Set workspace path environment variable for database metadata
        os.environ["CLAUDIA_WORKSPACE_PATH"] = args.project_dir

    if args.preflight:
        preflight = run_preflight(project_id=project_id, debug=args.debug)
        if args.json:
            import json as _json
            # Sentinel lets the installer find where JSON begins even if
            # there are stray print() calls earlier in startup.
            print("PREFLIGHT_JSON_BEGIN")
            print(_json.dumps(preflight))
        sys.exit(0 if preflight["ok"] else 1)

    if args.repair:
        preflight = run_preflight(project_id=project_id, debug=args.debug)
        if preflight["ok"]:
            print("\nAll checks passed. Nothing to repair.")
            sys.exit(0)
        print(f"\nAttempting repairs...")
        failed = [c for c in preflight["checks"] if not c["ok"]]
        fixed = attempt_repairs(preflight, project_id=project_id)
        print(f"\nFixed {fixed} of {len(failed)} issues.")
        # Re-run preflight to verify
        print("\nRe-running preflight to verify...")
        verify = run_preflight(project_id=project_id, debug=args.debug)
        sys.exit(0 if verify["ok"] else 1)

    if args.consolidate:
        # One-shot consolidation
        setup_logging(debug=args.debug)
        from .services.consolidate import run_full_consolidation

        db = get_db()
        db.initialize()
        result = run_full_consolidation()
        print(f"Consolidation complete: {result}")
        return

    if args.check:
        # Health check
        import httpx

        config = get_config()
        try:
            response = httpx.get(f"http://localhost:{config.health_port}/status", timeout=5)
            print(response.json())
        except Exception as e:
            print(f"Health check failed: {e}")
            sys.exit(1)
        return

    if args.tui:
        # Launch Brain Monitor TUI
        from .tui.app import run_brain_monitor

        run_brain_monitor(db_path=get_config().db_path)
        return

    if args.backfill_embeddings:
        # One-shot: generate embeddings for memories missing them
        setup_logging(debug=args.debug)
        from .embeddings import get_embedding_service

        db = get_db()
        db.initialize()
        config = get_config()

        # Fail fast if dimensions mismatch (user needs --migrate-embeddings instead)
        stored_dims = db.execute(
            "SELECT value FROM _meta WHERE key = 'embedding_dimensions'",
            fetch=True,
        )
        if stored_dims and int(stored_dims[0]["value"]) != config.embedding_dimensions:
            print(
                f"Error: Dimension mismatch detected. "
                f"Database has {stored_dims[0]['value']}D embeddings, "
                f"config specifies {config.embedding_dimensions}D. "
                f"Run --migrate-embeddings first."
            )
            sys.exit(1)

        # Find memories not in the memory_embeddings table
        missing = db.execute(
            "SELECT m.id, m.content FROM memories m "
            "LEFT JOIN memory_embeddings me ON m.id = me.memory_id "
            "WHERE me.memory_id IS NULL",
            fetch=True,
        )

        if not missing:
            print("All memories already have embeddings. Nothing to do.")
            return

        print(f"Found {len(missing)} memories without embeddings. Generating...")
        svc = get_embedding_service()
        if not svc.is_available_sync():
            print("Error: Ollama is not available. Start Ollama and try again.")
            sys.exit(1)

        success = 0
        failed = 0
        for i, row in enumerate(missing, 1):
            embedding = svc.embed_sync(row["content"])
            if embedding:
                import json as _json
                db.execute(
                    "INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                    (row["id"], _json.dumps(embedding)),
                )
                success += 1
            else:
                failed += 1
            if i % 10 == 0 or i == len(missing):
                print(f"  Progress: {i}/{len(missing)} (success={success}, failed={failed})")

        # Update stored embedding model to match current config (clears mismatch warning)
        db.execute(
            "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', ?)",
            (svc.model,),
        )

        print(f"Backfill complete: {success} embedded, {failed} failed, {len(missing)} total.")
        return

    if args.migrate_embeddings:
        # Full embedding migration: change model and/or dimensions
        setup_logging(debug=args.debug)
        import json as _json

        from .database import Database
        from .embeddings import get_embedding_service

        db = get_db()
        db.initialize()
        config = get_config()
        svc = get_embedding_service()

        new_model = config.embedding_model
        new_dim = config.embedding_dimensions

        # Read current state from _meta
        old_model_row = db.execute(
            "SELECT value FROM _meta WHERE key = 'embedding_model'",
            fetch=True,
        )
        old_dims_row = db.execute(
            "SELECT value FROM _meta WHERE key = 'embedding_dimensions'",
            fetch=True,
        )
        old_model = old_model_row[0]["value"] if old_model_row else "unknown"
        old_dim = int(old_dims_row[0]["value"]) if old_dims_row else 384

        if old_model == new_model and old_dim == new_dim:
            # No mismatch -- offer interactive model selection
            print(f"\nCurrent embedding model: {old_model} ({old_dim}D)")
            print()
            print("Available models:")
            models_info = [
                ("1", "all-minilm:l6-v2", 384, "  23MB", "Fast, good baseline"),
                ("2", "nomic-embed-text", 768, " 274MB", "Better retrieval (+6%)"),
                ("3", "mxbai-embed-large", 1024, " 669MB", "Best accuracy, larger"),
            ]
            for num, name, dim, size, desc in models_info:
                current = " (current)" if name == old_model else ""
                print(f"  {num}) {name:<20s} {dim}D  {size}   {desc}{current}")
            print("  4) Cancel")
            print()
            choice = input("Switch to [1-4, default=4]: ").strip()

            model_map = {
                "1": ("all-minilm:l6-v2", 384),
                "2": ("nomic-embed-text", 768),
                "3": ("mxbai-embed-large", 1024),
            }

            if choice not in model_map:
                print("No changes made.")
                return

            new_model, new_dim = model_map[choice]

            if new_model == old_model and new_dim == old_dim:
                print(f"Already using {new_model}. No changes needed.")
                return

            # Update config.json with the user's choice
            config_path = Path.home() / ".claudia" / "config.json"
            try:
                if config_path.exists():
                    with open(config_path) as f:
                        cfg_data = _json.load(f)
                else:
                    cfg_data = {}
                cfg_data["embedding_model"] = new_model
                cfg_data["embedding_dimensions"] = new_dim
                with open(config_path, "w") as f:
                    _json.dump(cfg_data, f, indent=2)
                print(f"\nConfig updated: {new_model} ({new_dim}D)")
            except Exception as e:
                print(f"Warning: Could not update config.json: {e}")

            # Reinitialize embedding service with new model
            svc.model = new_model
            svc.dimensions = new_dim
            svc._available = None  # Force re-check

        # Pre-flight: verify Ollama is running and model is available
        if not svc.is_available_sync():
            # Distinguish: Ollama not running vs model not pulled
            import subprocess
            import httpx

            ollama_running = False
            try:
                resp = httpx.get(f"{svc.host}/api/tags", timeout=5)
                ollama_running = resp.status_code == 200
            except Exception:
                pass

            if not ollama_running:
                print(f"Error: Ollama is not running.")
                print(f"Please start Ollama and try again.")
                sys.exit(1)

            # Ollama is running but model is missing -- offer to pull it
            print(f"\nThe model '{new_model}' is not installed in Ollama.")
            pull_choice = input(f"Download it now? (Y/n): ").strip().lower()
            if pull_choice in ("", "y", "yes"):
                print(f"Downloading {new_model}... (this may take a minute)")
                try:
                    result = subprocess.run(
                        ["ollama", "pull", new_model],
                        capture_output=False,
                        text=True,
                    )
                    if result.returncode != 0:
                        print(f"Error: Failed to pull {new_model}.")
                        sys.exit(1)
                except FileNotFoundError:
                    print("Error: 'ollama' command not found. Please install Ollama.")
                    sys.exit(1)

                # Re-check availability after pull
                svc._available = None
                if not svc.is_available_sync():
                    print(f"Error: Model still not available after pull.")
                    sys.exit(1)
                print(f"Model '{new_model}' ready.")
            else:
                print("Migration cancelled.")
                return

        # Count embeddings across all tables
        embedding_counts = {}
        for table, pk in Database.VEC0_TABLES:
            try:
                rows = db.execute(f"SELECT COUNT(*) as cnt FROM {table}", fetch=True)
                embedding_counts[table] = rows[0]["cnt"] if rows else 0
            except Exception:
                embedding_counts[table] = 0
        total_embeddings = sum(embedding_counts.values())

        # Show migration summary
        print(f"\nEmbedding Migration")
        print(f"  Current: {old_model} ({old_dim}D)")
        print(f"  Target:  {new_model} ({new_dim}D)")
        print(f"  Embeddings to regenerate: {total_embeddings}")
        print()

        # Count source data to re-embed
        mem_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM memories WHERE invalidated_at IS NULL",
            fetch=True,
        )
        ent_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM entities WHERE deleted_at IS NULL",
            fetch=True,
        )
        ep_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM episodes WHERE summary IS NOT NULL AND summary != ''",
            fetch=True,
        )
        msg_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM messages",
            fetch=True,
        )
        ref_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM reflections",
            fetch=True,
        )
        mem_count = mem_count_rows[0]["cnt"] if mem_count_rows else 0
        ent_count = ent_count_rows[0]["cnt"] if ent_count_rows else 0
        ep_count = ep_count_rows[0]["cnt"] if ep_count_rows else 0
        msg_count = msg_count_rows[0]["cnt"] if msg_count_rows else 0
        ref_count = ref_count_rows[0]["cnt"] if ref_count_rows else 0
        total_to_embed = mem_count + ent_count + ep_count + msg_count + ref_count

        print(f"  Source data to re-embed:")
        print(f"    Memories:    {mem_count}")
        print(f"    Entities:    {ent_count}")
        print(f"    Episodes:    {ep_count}")
        print(f"    Messages:    {msg_count}")
        print(f"    Reflections: {ref_count}")
        print(f"    Total:       {total_to_embed}")
        print()

        # Pre-flight: verify sqlite-vec is available
        try:
            db.execute("SELECT vec_version()", fetch=True)
        except Exception:
            print("Error: sqlite-vec extension not available. Cannot migrate embeddings.")
            print("Install with: pip install sqlite-vec")
            sys.exit(1)

        # Confirmation
        confirm = input("Proceed with migration? (y/N): ").strip().lower()
        if confirm != "y":
            print("Migration cancelled.")
            return

        # Step 1: Backup
        print("\nStep 1/4: Creating backup...")
        backup_path = db.backup()
        print(f"  Backup at: {backup_path}")

        # Step 2: Drop and recreate vec0 tables with new dimensions
        print("\nStep 2/4: Recreating vector tables...")
        with db.transaction():
            for table, pk in Database.VEC0_TABLES:
                try:
                    db.execute(f"DROP TABLE IF EXISTS {table}")
                    db.execute(f"""
                        CREATE VIRTUAL TABLE {table} USING vec0(
                            {pk} INTEGER PRIMARY KEY,
                            embedding FLOAT[{new_dim}]
                        )
                    """)
                    print(f"  Recreated {table} ({new_dim}D)")
                except sqlite3.OperationalError as e:
                    if "no such module: vec0" in str(e):
                        print(f"  Warning: sqlite-vec not available, skipping {table}")
                    else:
                        print(f"  Error recreating {table}: {e}")
                        print("Aborting. Restore from backup to recover.")
                        sys.exit(1)

        # Step 3: Re-embed everything
        print("\nStep 3/4: Re-embedding all data...")
        results = {}

        # 3a. Memory embeddings (largest, most important)
        if mem_count > 0:
            memories = db.execute(
                "SELECT id, content FROM memories WHERE invalidated_at IS NULL",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(memories or [], 1):
                embedding = svc.embed_sync(row["content"])
                if embedding:
                    db.execute(
                        "INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == mem_count:
                    print(f"  Memories:    {i}/{mem_count}")
            results["memories"] = success
        else:
            results["memories"] = 0

        # 3b. Entity embeddings
        if ent_count > 0:
            entities = db.execute(
                "SELECT id, name, description FROM entities WHERE deleted_at IS NULL",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(entities or [], 1):
                text = f"{row['name']}: {row['description'] or ''}"
                embedding = svc.embed_sync(text)
                if embedding:
                    db.execute(
                        "INSERT INTO entity_embeddings (entity_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == ent_count:
                    print(f"  Entities:    {i}/{ent_count}")
            results["entities"] = success
        else:
            results["entities"] = 0

        # 3c. Episode embeddings (from summaries)
        if ep_count > 0:
            episodes = db.execute(
                "SELECT id, summary FROM episodes WHERE summary IS NOT NULL AND summary != ''",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(episodes or [], 1):
                embedding = svc.embed_sync(row["summary"])
                if embedding:
                    db.execute(
                        "INSERT INTO episode_embeddings (episode_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == ep_count:
                    print(f"  Episodes:    {i}/{ep_count}")
            results["episodes"] = success
        else:
            results["episodes"] = 0

        # 3d. Message embeddings
        if msg_count > 0:
            messages = db.execute(
                "SELECT id, content FROM messages",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(messages or [], 1):
                embedding = svc.embed_sync(row["content"])
                if embedding:
                    db.execute(
                        "INSERT INTO message_embeddings (message_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == msg_count:
                    print(f"  Messages:    {i}/{msg_count}")
            results["messages"] = success
        else:
            results["messages"] = 0

        # 3e. Reflection embeddings
        if ref_count > 0:
            reflections = db.execute(
                "SELECT id, content FROM reflections",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(reflections or [], 1):
                embedding = svc.embed_sync(row["content"])
                if embedding:
                    db.execute(
                        "INSERT INTO reflection_embeddings (reflection_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == ref_count:
                    print(f"  Reflections: {i}/{ref_count}")
            results["reflections"] = success
        else:
            results["reflections"] = 0

        # Step 4: Update _meta
        print("\nStep 4/4: Updating metadata...")
        db.execute(
            "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', ?)",
            (new_model,),
        )
        db.execute(
            "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_dimensions', ?)",
            (str(new_dim),),
        )

        # Clear embedding cache (old-dimension entries)
        svc._cache.clear()
        svc._model_mismatch = False

        # Summary
        print(f"\nMigration complete:")
        print(f"  Model: {new_model} ({new_dim}D)")
        print(f"  Memories re-embedded:    {results['memories']}/{mem_count}")
        print(f"  Entities re-embedded:    {results['entities']}/{ent_count}")
        print(f"  Episodes re-embedded:    {results['episodes']}/{ep_count}")
        print(f"  Messages re-embedded:    {results['messages']}/{msg_count}")
        print(f"  Reflections re-embedded: {results['reflections']}/{ref_count}")
        print(f"  Backup at: {backup_path}")
        print(f"\n  To rollback: restore the backup file.")
        return

    if args.backup:
        setup_logging(debug=args.debug)
        db = get_db()
        db.initialize()
        backup_path = db.backup()
        print(f"Backup created: {backup_path}")
        return

    if args.vault_sync:
        setup_logging(debug=args.debug)
        from .services.vault_sync import get_vault_path, get_vault_sync_service

        db = get_db()
        db.initialize()
        vault_path = get_vault_path(project_id)
        print(f"Exporting memory to vault: {vault_path}")
        svc = get_vault_sync_service(project_id)
        stats = svc.export_all()
        print(f"Vault sync complete:")
        for key, value in stats.items():
            print(f"  {key}: {value}")
        print(f"\nVault at: {vault_path}")
        print("Open this folder in Obsidian to browse your memory graph.")
        return

    if args.import_vault:
        setup_logging(debug=args.debug)
        from .services.vault_sync import get_vault_path, get_vault_sync_service

        db = get_db()
        db.initialize()
        vault_path = get_vault_path(project_id)
        print(f"Scanning vault for user edits: {vault_path}")
        svc = get_vault_sync_service(project_id)
        try:
            results = svc.import_all_edits()
        except Exception as e:
            print(f"Error importing vault edits: {e}")
            sys.exit(1)

        if not results:
            print("No user edits detected in vault.")
        else:
            print(f"Imported {len(results)} edits from vault:")
            for r in results:
                status = "OK" if r.get("success") else "FAILED"
                print(f"  [{status}] {r.get('file', 'unknown')}: {r.get('summary', '')}")
        return

    if args.migrate_vault_para:
        setup_logging(debug=args.debug)
        from .services.vault_sync import get_vault_path, run_para_migration

        db = get_db()
        db.initialize()
        vault_path = get_vault_path(project_id)

        if not vault_path.exists():
            print(f"Vault not found at {vault_path}")
            print("Run --vault-sync first to create the vault.")
            sys.exit(1)

        run_para_migration(vault_path, db=db, preview=args.preview)
        return

    if args.backfill_entities:
        # Entity-link backfill (Proposal #51). Dry-run by default; --apply
        # writes after creating a SQLite backup.
        setup_logging(debug=args.debug)
        from datetime import datetime as _dt

        from .services.backfill import (
            apply_backfill,
            format_plan_summary,
            plan_backfill,
        )

        db = get_db()
        db.initialize()

        plan = plan_backfill(db)
        print(format_plan_summary(plan))

        if not args.apply:
            # Dry-run path: we already printed the plan; nothing more to do.
            return

        # --apply: take the mandatory backup first.
        config = get_config()
        backups_dir = Path(config.backup_dir)
        try:
            backups_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            print(
                f"\nCannot create backup directory {backups_dir}: {e}\n"
                "Aborting before any database writes."
            )
            sys.exit(1)

        timestamp = _dt.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
        backup_path = backups_dir / f"memory-{timestamp}.db"

        try:
            result = apply_backfill(db, plan, backup_path=backup_path)
        except Exception as e:
            print(
                f"\nBackfill aborted (no DB writes performed): {e}\n"
                f"Backup target was: {backup_path}"
            )
            sys.exit(1)

        print(
            "\nBackfill applied:\n"
            f"  backup written to:   {result.backup_path}\n"
            f"  entities created:    {result.entities_created}\n"
            f"  entities reused:     {result.entities_reused}\n"
            f"  memory_entities links created: {result.links_created}"
        )
        return

    if args.merge_databases:
        # Manual consolidation of hash-named databases
        setup_logging(debug=args.debug)
        from .migration import (
            cleanup_old_databases,
            merge_all_databases,
            scan_hash_databases,
            verify_consolidated_db,
        )

        db = get_db()
        db.initialize()
        config = get_config()
        memory_dir = Path(config.db_path).parent

        hash_dbs = scan_hash_databases(memory_dir)
        data_dbs = [d for d in hash_dbs if d["has_data"]]
        empty_dbs = [d for d in hash_dbs if not d["has_data"]]

        if not hash_dbs:
            print("No hash-named databases found. Nothing to merge.")
            return

        print(f"\nFound {len(hash_dbs)} hash-named databases:")
        for d in hash_dbs:
            stats_str = ""
            if d["has_data"]:
                s = d["stats"]
                stats_str = f"  {s.get('memories', 0)} memories, {s.get('entities', 0)} entities"
            else:
                stats_str = "  (empty)"
            print(f"  {d['path'].name}{stats_str}")

        print(f"\nTarget: {config.db_path}")
        print(f"  {len(data_dbs)} with data, {len(empty_dbs)} empty")

        if args.dry_run:
            print("\nDry run mode: no changes will be made.\n")
            if data_dbs:
                totals = merge_all_databases(Path(config.db_path), data_dbs, dry_run=True)
                print(f"\nWould merge:")
                for key, val in totals.items():
                    if val > 0:
                        print(f"  {key}: {val}")
            return

        if data_dbs:
            # Backup before merge
            backup_path = db.backup(label="pre-merge")
            print(f"\nBackup created: {backup_path}")

            print("\nMerging...")
            totals = merge_all_databases(Path(config.db_path), data_dbs)

            if verify_consolidated_db(Path(config.db_path)):
                print("Integrity check: PASSED")
            else:
                print("Integrity check: FAILED (keeping hash databases)")
                return

            print(f"\nResults:")
            for key, val in totals.items():
                if val > 0:
                    print(f"  {key}: {val}")

        # Clean up
        deleted = cleanup_old_databases(memory_dir, hash_dbs)
        print(f"\nCleaned up {deleted} old files.")

        # Set unified_db flag
        _set_unified_db_flag(db)
        print("Unified database flag set.")
        return

    if args.migrate_legacy:
        # Manual legacy database migration
        setup_logging(debug=args.debug)
        from .migration import (
            check_legacy_database,
            is_migration_completed,
            mark_migration_completed,
            migrate_legacy_database,
        )

        db = get_db()
        db.initialize()
        config = get_config()

        # Resolve paths
        legacy_path = Path(args.legacy_db) if args.legacy_db else (
            Path.home() / ".claudia" / "memory" / "claudia.db"
        )
        active_path = Path(config.db_path)

        if not legacy_path.exists():
            print(f"Legacy database not found: {legacy_path}")
            sys.exit(1)

        if str(legacy_path.resolve()) == str(active_path.resolve()):
            print("Error: Legacy and active databases are the same file.")
            print("Use --project-dir to specify a project for isolation.")
            sys.exit(1)

        # Check legacy data
        legacy_stats = check_legacy_database(legacy_path)
        if not legacy_stats:
            print(f"Legacy database at {legacy_path} has no data to migrate.")
            return

        print(f"\nLegacy database: {legacy_path}")
        print(f"Active database: {active_path}")
        print(f"  Entities:      {legacy_stats.get('entities', 0)}")
        print(f"  Memories:      {legacy_stats.get('memories', 0)}")
        print(f"  Links:         {legacy_stats.get('links', 0)}")
        print(f"  Relationships: {legacy_stats.get('relationships', 0)}")
        if legacy_stats.get("earliest"):
            print(f"  Date range:    {legacy_stats['earliest']} to {legacy_stats['latest']}")

        if is_migration_completed(db):
            print("\nNote: Migration was already completed previously.")
            if not args.dry_run:
                confirm = input("Run again? (y/N): ").strip().lower()
                if confirm != "y":
                    print("Cancelled.")
                    return

        if args.dry_run:
            print("\nDry run mode -- no changes will be made.\n")
            results = migrate_legacy_database(legacy_path, active_path, dry_run=True)
        else:
            # Backup active database before migration
            if active_path.exists():
                backup_path = db.backup(label="pre-migration")
                print(f"\nBackup created: {backup_path}")

            print("\nMigrating...")
            results = migrate_legacy_database(legacy_path, active_path)
            mark_migration_completed(db, results)

            # Rename legacy database
            from datetime import datetime as dt
            date_suffix = dt.now().strftime("%Y-%m-%d")
            migrated_path = legacy_path.with_suffix(f".db.migrated-{date_suffix}")
            try:
                legacy_path.rename(migrated_path)
                print(f"Renamed: {legacy_path.name} -> {migrated_path.name}")
            except OSError as e:
                print(f"Warning: Could not rename legacy database: {e}")

        print(f"\nResults:")
        for key, value in results.items():
            if value > 0:
                print(f"  {key}: {value}")
        return

    # Run the daemon
    run_daemon(mcp_mode=not args.standalone, debug=args.debug, project_id=project_id)


if __name__ == "__main__":
    main()
