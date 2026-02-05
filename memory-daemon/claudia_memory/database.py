"""
Database management for Claudia Memory System

Handles SQLite connection with:
- WAL mode for crash safety
- sqlite-vec extension for vector similarity search
- Connection pooling for multi-threaded access
- Schema migration system
"""

import hashlib
import json
import logging
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple

from .config import get_config

logger = logging.getLogger(__name__)


class Database:
    """Thread-safe SQLite database with sqlite-vec support"""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or get_config().db_path
        self._local = threading.local()
        self._lock = threading.Lock()
        self._initialized = False

    def _get_connection(self) -> sqlite3.Connection:
        """Get thread-local database connection"""
        if not hasattr(self._local, "connection") or self._local.connection is None:
            conn = sqlite3.connect(
                str(self.db_path),
                check_same_thread=False,
                timeout=30.0,
            )
            conn.row_factory = sqlite3.Row

            # Enable WAL mode for crash safety
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            conn.execute("PRAGMA foreign_keys = ON")

            # Try to load sqlite-vec for vector search
            # Priority: sqlite_vec Python package first (works on Python 3.13+),
            # then fall back to native extension loading
            loaded = False

            # Method 1: Try sqlite_vec Python package (recommended, works everywhere)
            try:
                import sqlite_vec
                sqlite_vec.load(conn)
                loaded = True
                logger.debug("Loaded sqlite-vec via Python package")
            except ImportError:
                logger.debug("sqlite_vec package not installed")
            except Exception as e:
                logger.debug(f"sqlite_vec package failed: {e}")

            # Method 2: Try native extension loading (for systems with pre-installed sqlite-vec)
            if not loaded:
                try:
                    conn.enable_load_extension(True)
                    sqlite_vec_paths = [
                        "vec0",  # If installed system-wide
                        "/usr/local/lib/sqlite-vec/vec0",
                        "/opt/homebrew/lib/sqlite-vec/vec0",
                        str(Path.home() / ".local" / "lib" / "sqlite-vec" / "vec0"),
                    ]

                    for path in sqlite_vec_paths:
                        try:
                            conn.load_extension(path)
                            loaded = True
                            logger.debug(f"Loaded sqlite-vec from {path}")
                            break
                        except sqlite3.OperationalError:
                            continue

                    conn.enable_load_extension(False)
                except AttributeError:
                    # Python 3.13+ may not have enable_load_extension
                    logger.debug("enable_load_extension not available (Python 3.13+)")
                except Exception as e:
                    logger.debug(f"Extension loading failed: {e}")

            if not loaded:
                logger.warning(
                    "sqlite-vec not available. Vector search will be disabled. "
                    "Install with: pip install sqlite-vec"
                )

            self._local.connection = conn

        return self._local.connection

    @contextmanager
    def connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Context manager for database connection"""
        conn = self._get_connection()
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise
        else:
            conn.commit()

    @contextmanager
    def cursor(self) -> Generator[sqlite3.Cursor, None, None]:
        """Context manager for database cursor"""
        with self.connection() as conn:
            cursor = conn.cursor()
            try:
                yield cursor
            finally:
                cursor.close()

    def initialize(self) -> None:
        """Initialize database schema"""
        if self._initialized:
            return

        with self._lock:
            if self._initialized:
                return

            # Ensure directory exists
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

            # Read and execute schema
            schema_path = Path(__file__).parent / "schema.sql"
            if schema_path.exists():
                with open(schema_path) as f:
                    schema_sql = f.read()

                with self.connection() as conn:
                    # Split by semicolons but handle virtual table creation specially
                    statements = []
                    current = []

                    for line in schema_sql.split("\n"):
                        stripped = line.strip()
                        # Skip comments
                        if stripped.startswith("--"):
                            continue
                        current.append(line)
                        if stripped.endswith(";"):
                            stmt = "\n".join(current).strip()
                            if stmt:
                                statements.append(stmt)
                            current = []

                    for stmt in statements:
                        if stmt.strip():
                            try:
                                conn.execute(stmt)
                            except sqlite3.OperationalError as e:
                                err_msg = str(e)
                                # Virtual tables may fail if sqlite-vec not loaded
                                if "no such module: vec0" in err_msg:
                                    logger.warning(f"Skipping vector table: {e}")
                                # Indexes on columns added by migrations will fail on
                                # existing databases; _run_migrations() will create them
                                elif "no such column" in err_msg:
                                    logger.debug(f"Skipping index for not-yet-migrated column: {e}")
                                else:
                                    raise

                logger.info(f"Database initialized at {self.db_path}")
            else:
                logger.warning(f"Schema file not found at {schema_path}")

            # Run migrations for existing databases
            self._run_migrations(conn)

            # Store workspace path in _meta for database identification
            self._store_workspace_path(conn)

            self._initialized = True

    def _run_migrations(self, conn: sqlite3.Connection) -> None:
        """Run database migrations for schema changes."""
        try:
            # Check current schema version
            cursor = conn.execute(
                "SELECT MAX(version) as v FROM schema_migrations"
            )
            row = cursor.fetchone()
            current_version = row["v"] if row and row["v"] else 0
        except sqlite3.OperationalError:
            # schema_migrations table doesn't exist yet, schema.sql will create it
            return

        # Check if migrations actually completed (columns exist)
        effective_version = self._check_migration_integrity(conn)
        if effective_version is not None:
            logger.info(f"Migration integrity check: effective version is {effective_version}, not {current_version}")
            current_version = effective_version

        if current_version < 2:
            # Migration 2: Add turn_buffer, episode narrative columns, episode_embeddings
            migration_stmts = [
                "ALTER TABLE episodes ADD COLUMN narrative TEXT",
                "ALTER TABLE episodes ADD COLUMN turn_count INTEGER DEFAULT 0",
                "ALTER TABLE episodes ADD COLUMN is_summarized INTEGER DEFAULT 0",
                """CREATE TABLE IF NOT EXISTS turn_buffer (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
                    turn_number INTEGER NOT NULL,
                    user_content TEXT,
                    assistant_content TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                )""",
                "CREATE INDEX IF NOT EXISTS idx_turn_buffer_episode ON turn_buffer(episode_id)",
            ]
            for stmt in migration_stmts:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
                        logger.warning(f"Migration 2 statement failed: {e}")

            # Try to create episode_embeddings virtual table
            try:
                conn.execute(
                    """CREATE VIRTUAL TABLE IF NOT EXISTS episode_embeddings USING vec0(
                        episode_id INTEGER PRIMARY KEY,
                        embedding FLOAT[384]
                    )"""
                )
            except sqlite3.OperationalError as e:
                if "no such module: vec0" in str(e):
                    logger.warning("Skipping episode_embeddings virtual table: sqlite-vec not available")
                else:
                    logger.warning(f"Could not create episode_embeddings: {e}")

            # Mark existing episodes as summarized if they have a summary
            try:
                conn.execute(
                    "UPDATE episodes SET is_summarized = 1 WHERE summary IS NOT NULL AND summary != ''"
                )
            except sqlite3.OperationalError:
                pass

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (2, 'Add turn_buffer table, episode narrative/summary columns, episode_embeddings')"
            )
            conn.commit()
            logger.info("Applied migration 2: turn buffer and session narratives")

        if current_version < 3:
            # Migration 3: Add source_context to memories, is_archived to turn_buffer
            migration_stmts = [
                "ALTER TABLE memories ADD COLUMN source_context TEXT",
                "ALTER TABLE turn_buffer ADD COLUMN is_archived INTEGER DEFAULT 0",
            ]
            for stmt in migration_stmts:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    if "duplicate column" not in str(e).lower():
                        logger.warning(f"Migration 3 statement failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (3, 'Add source_context to memories, is_archived to turn_buffer for episodic provenance')"
            )
            conn.commit()
            logger.info("Applied migration 3: episodic memory provenance")

        if current_version < 4:
            # Migration 4: Add FTS5 full-text search table and auto-sync triggers
            try:
                conn.execute(
                    """CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                        content,
                        content=memories,
                        content_rowid=id,
                        tokenize='porter unicode61'
                    )"""
                )

                # Auto-sync triggers
                conn.execute(
                    """CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
                        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
                    END"""
                )
                conn.execute(
                    """CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
                        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
                    END"""
                )
                conn.execute(
                    """CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
                        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
                        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
                    END"""
                )

                # Backfill existing memories into FTS5 index
                conn.execute(
                    "INSERT INTO memories_fts(rowid, content) SELECT id, content FROM memories"
                )

                conn.execute(
                    "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (4, 'Add FTS5 full-text search table and auto-sync triggers for hybrid search')"
                )
                conn.commit()
                logger.info("Applied migration 4: FTS5 hybrid search")
            except Exception as e:
                logger.warning(f"Migration 4 (FTS5) failed: {e}. FTS5 may not be available.")
                # FTS5 is optional; the system degrades gracefully without it

        if current_version < 5:
            # Migration 5: Add verification columns to memories, pattern_name to predictions
            migration_stmts = [
                "ALTER TABLE memories ADD COLUMN verified_at TEXT",
                "ALTER TABLE memories ADD COLUMN verification_status TEXT DEFAULT 'pending'",
                "ALTER TABLE predictions ADD COLUMN prediction_pattern_name TEXT",
            ]
            for stmt in migration_stmts:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    if "duplicate column" not in str(e).lower():
                        logger.warning(f"Migration 5 statement failed: {e}")

            # Index for verification queries
            try:
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_memories_verification ON memories(verification_status)"
                )
            except sqlite3.OperationalError as e:
                logger.warning(f"Migration 5 index failed: {e}")

            # Grandfather existing memories as verified
            try:
                conn.execute(
                    """UPDATE memories SET verification_status = 'verified', verified_at = datetime('now')
                       WHERE verification_status = 'pending' OR verification_status IS NULL"""
                )
            except sqlite3.OperationalError as e:
                logger.warning(f"Migration 5 grandfather failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (5, 'Add verification columns to memories, prediction_pattern_name to predictions')"
            )
            conn.commit()
            logger.info("Applied migration 5: memory verification and prediction feedback")

        if current_version < 6:
            # Migration 6: Add source tracking and ingested_at for gateway integration
            migration_stmts = [
                "ALTER TABLE episodes ADD COLUMN source TEXT",
                "ALTER TABLE episodes ADD COLUMN ingested_at TEXT",
                "ALTER TABLE turn_buffer ADD COLUMN source TEXT",
            ]
            for stmt in migration_stmts:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    if "duplicate column" not in str(e).lower():
                        logger.warning(f"Migration 6 statement failed: {e}")

            # Index for inbox queries (unread gateway episodes)
            try:
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_episodes_source_ingested ON episodes(source, ingested_at)"
                )
            except sqlite3.OperationalError as e:
                logger.warning(f"Migration 6 index failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (6, 'Add source and ingested_at to episodes, source to turn_buffer for gateway integration')"
            )
            conn.commit()
            logger.info("Applied migration 6: gateway source tracking and inbox")

        if current_version < 7:
            # Migration 7: Document storage and provenance tracking
            migration_stmts = [
                """CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_hash TEXT,
                    filename TEXT NOT NULL,
                    mime_type TEXT,
                    file_size INTEGER,
                    storage_provider TEXT DEFAULT 'local',
                    storage_path TEXT,
                    source_type TEXT,
                    source_ref TEXT,
                    summary TEXT,
                    lifecycle TEXT DEFAULT 'active',
                    last_accessed_at TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    workspace_id TEXT,
                    metadata TEXT
                )""",
                "CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash)",
                "CREATE INDEX IF NOT EXISTS idx_documents_lifecycle ON documents(lifecycle)",
                "CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type)",
                "CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id)",
                """CREATE TABLE IF NOT EXISTS entity_documents (
                    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
                    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    relationship TEXT DEFAULT 'about',
                    created_at TEXT DEFAULT (datetime('now')),
                    PRIMARY KEY (entity_id, document_id, relationship)
                )""",
                "CREATE INDEX IF NOT EXISTS idx_entity_documents_doc ON entity_documents(document_id)",
                """CREATE TABLE IF NOT EXISTS memory_sources (
                    memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
                    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    excerpt TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    PRIMARY KEY (memory_id, document_id)
                )""",
                "CREATE INDEX IF NOT EXISTS idx_memory_sources_doc ON memory_sources(document_id)",
            ]
            for stmt in migration_stmts:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    if "already exists" not in str(e).lower():
                        logger.warning(f"Migration 7 statement failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (7, 'Add documents, entity_documents, memory_sources tables for provenance tracking')"
            )
            conn.commit()
            logger.info("Applied migration 7: document storage and provenance")

        if current_version < 8:
            # Migration 8: Bi-temporal relationship tracking
            migration_stmts = [
                "ALTER TABLE relationships ADD COLUMN valid_at TEXT",
                "ALTER TABLE relationships ADD COLUMN invalid_at TEXT",
            ]
            for stmt in migration_stmts:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    if "duplicate column" not in str(e).lower():
                        logger.warning(f"Migration 8 statement failed: {e}")

            # Index for temporal queries
            try:
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_relationships_temporal ON relationships(invalid_at, valid_at)"
                )
            except sqlite3.OperationalError as e:
                logger.warning(f"Migration 8 index failed: {e}")

            # Grandfather: existing relationships are current (valid since creation)
            try:
                conn.execute(
                    "UPDATE relationships SET valid_at = created_at WHERE valid_at IS NULL"
                )
            except sqlite3.OperationalError as e:
                logger.warning(f"Migration 8 grandfather failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (8, 'Add valid_at, invalid_at to relationships for bi-temporal tracking')"
            )
            conn.commit()
            logger.info("Applied migration 8: bi-temporal relationships")

        if current_version < 9:
            # Migration 9: Add _meta table for database identification
            try:
                conn.execute(
                    """CREATE TABLE IF NOT EXISTS _meta (
                        key TEXT PRIMARY KEY,
                        value TEXT,
                        updated_at TEXT DEFAULT (datetime('now'))
                    )"""
                )
            except sqlite3.OperationalError as e:
                if "already exists" not in str(e).lower():
                    logger.warning(f"Migration 9 statement failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (9, 'Add _meta table for database identification and workspace path tracking')"
            )
            conn.commit()
            logger.info("Applied migration 9: database metadata table")

        if current_version < 10:
            # Migration 10: Add reflections table for /meditate skill
            migration_stmts = [
                """CREATE TABLE IF NOT EXISTS reflections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    episode_id INTEGER REFERENCES episodes(id),
                    reflection_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    content_hash TEXT,
                    about_entity_id INTEGER REFERENCES entities(id),
                    importance REAL DEFAULT 0.7,
                    confidence REAL DEFAULT 0.8,
                    decay_rate REAL DEFAULT 0.999,
                    aggregated_from TEXT,
                    aggregation_count INTEGER DEFAULT 1,
                    first_observed_at TEXT DEFAULT (datetime('now')),
                    last_confirmed_at TEXT DEFAULT (datetime('now')),
                    embedding BLOB,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT,
                    surfaced_count INTEGER DEFAULT 0,
                    last_surfaced_at TEXT
                )""",
                "CREATE INDEX IF NOT EXISTS idx_reflections_type ON reflections(reflection_type)",
                "CREATE INDEX IF NOT EXISTS idx_reflections_importance ON reflections(importance DESC)",
                "CREATE INDEX IF NOT EXISTS idx_reflections_entity ON reflections(about_entity_id)",
                "CREATE INDEX IF NOT EXISTS idx_reflections_episode ON reflections(episode_id)",
            ]
            for stmt in migration_stmts:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    if "already exists" not in str(e).lower():
                        logger.warning(f"Migration 10 statement failed: {e}")

            # Try to create reflection_embeddings virtual table
            try:
                conn.execute(
                    """CREATE VIRTUAL TABLE IF NOT EXISTS reflection_embeddings USING vec0(
                        reflection_id INTEGER PRIMARY KEY,
                        embedding FLOAT[384]
                    )"""
                )
            except sqlite3.OperationalError as e:
                if "no such module: vec0" in str(e):
                    logger.warning("Skipping reflection_embeddings virtual table: sqlite-vec not available")
                else:
                    logger.warning(f"Could not create reflection_embeddings: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (10, 'Add reflections table and reflection_embeddings for /meditate skill')"
            )
            conn.commit()
            logger.info("Applied migration 10: reflections table")

        if current_version < 11:
            # Migration 11: Add compound index for fast source lookup on documents
            try:
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_documents_source_lookup ON documents(source_type, source_ref)"
                )
            except sqlite3.OperationalError as e:
                if "already exists" not in str(e).lower():
                    logger.warning(f"Migration 11 index failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (11, 'Add compound index for fast source lookup on documents')"
            )
            conn.commit()
            logger.info("Applied migration 11: source lookup index")

        if current_version < 12:
            # Migration 12: Audit logging, metrics, and soft-delete/correction columns
            migration_stmts = [
                # Audit log table for operation tracking
                """CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT DEFAULT (datetime('now')),
                    operation TEXT NOT NULL,
                    details TEXT,
                    session_id TEXT,
                    user_initiated INTEGER DEFAULT 0,
                    entity_id INTEGER,
                    memory_id INTEGER
                )""",
                "CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC)",
                "CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON audit_log(operation)",
                "CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_id)",
                "CREATE INDEX IF NOT EXISTS idx_audit_log_memory ON audit_log(memory_id)",
                # Metrics table for system health tracking
                """CREATE TABLE IF NOT EXISTS metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT DEFAULT (datetime('now')),
                    metric_name TEXT NOT NULL,
                    metric_value REAL NOT NULL,
                    dimensions TEXT
                )""",
                "CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(metric_name, timestamp DESC)",
                # Soft-delete columns on entities
                "ALTER TABLE entities ADD COLUMN deleted_at TEXT",
                "ALTER TABLE entities ADD COLUMN deleted_reason TEXT",
                # Correction and invalidation columns on memories
                "ALTER TABLE memories ADD COLUMN corrected_at TEXT",
                "ALTER TABLE memories ADD COLUMN corrected_from TEXT",
                "ALTER TABLE memories ADD COLUMN invalidated_at TEXT",
                "ALTER TABLE memories ADD COLUMN invalidated_reason TEXT",
            ]
            for stmt in migration_stmts:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    err_str = str(e).lower()
                    if "duplicate column" not in err_str and "already exists" not in err_str:
                        logger.warning(f"Migration 12 statement failed: {e}")

            # Indexes for querying corrected/invalidated memories
            try:
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_memories_invalidated ON memories(invalidated_at)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_entities_deleted ON entities(deleted_at)"
                )
            except sqlite3.OperationalError as e:
                logger.warning(f"Migration 12 index failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (12, 'Add audit_log, metrics tables, soft-delete on entities, correction/invalidation on memories')"
            )
            conn.commit()
            logger.info("Applied migration 12: audit logging, metrics, soft-delete/correction columns")

        if current_version < 13:
            # Migration 13: Trust North Star - origin_type on memories, agent_dispatches table
            migration_stmts = [
                # Origin type for memory provenance tracking
                "ALTER TABLE memories ADD COLUMN origin_type TEXT DEFAULT 'inferred'",
                # Agent dispatches table for tracking sub-agent tasks
                """CREATE TABLE IF NOT EXISTS agent_dispatches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_name TEXT NOT NULL,
                    dispatch_category TEXT NOT NULL,
                    task_summary TEXT,
                    started_at TEXT DEFAULT (datetime('now')),
                    completed_at TEXT,
                    duration_ms INTEGER,
                    success INTEGER DEFAULT 1,
                    required_claudia_judgment INTEGER DEFAULT 0,
                    judgment_reason TEXT,
                    episode_id INTEGER REFERENCES episodes(id),
                    user_approved INTEGER DEFAULT 1,
                    metadata TEXT
                )""",
                "CREATE INDEX IF NOT EXISTS idx_agent_dispatches_agent ON agent_dispatches(agent_name)",
                "CREATE INDEX IF NOT EXISTS idx_agent_dispatches_category ON agent_dispatches(dispatch_category)",
                "CREATE INDEX IF NOT EXISTS idx_agent_dispatches_started ON agent_dispatches(started_at DESC)",
            ]
            for stmt in migration_stmts:
                try:
                    conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    err_str = str(e).lower()
                    if "duplicate column" not in err_str and "already exists" not in err_str:
                        logger.warning(f"Migration 13 statement failed: {e}")

            # Grandfather existing memories: high-importance from conversation = user_stated
            try:
                conn.execute(
                    """UPDATE memories SET origin_type = 'user_stated'
                       WHERE origin_type IS NULL
                         AND source = 'conversation'
                         AND importance >= 0.9"""
                )
                conn.execute(
                    """UPDATE memories SET origin_type = 'inferred'
                       WHERE origin_type IS NULL"""
                )
            except sqlite3.OperationalError as e:
                logger.warning(f"Migration 13 grandfather failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (13, 'Add origin_type to memories, agent_dispatches table for Trust North Star')"
            )
            conn.commit()
            logger.info("Applied migration 13: Trust North Star (origin_type, agent_dispatches)")

        if current_version < 14:
            # Migration 14: Add dispatch_tier to agent_dispatches for native agent teams
            try:
                conn.execute(
                    "ALTER TABLE agent_dispatches ADD COLUMN dispatch_tier TEXT DEFAULT 'task'"
                )
            except sqlite3.OperationalError as e:
                if "duplicate column" not in str(e).lower():
                    logger.warning(f"Migration 14 statement failed: {e}")

            conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (14, 'Add dispatch_tier to agent_dispatches for native agent team support')"
            )
            conn.commit()
            logger.info("Applied migration 14: dispatch_tier for native agent teams")

        # FTS5 setup: ensure memories_fts exists regardless of migration path.
        # The FTS5 virtual table + triggers contain internal semicolons that the
        # schema.sql line-based parser can't handle, so we always check here.
        try:
            check = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'"
            ).fetchone()
            if not check:
                conn.execute("""
                    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                        content,
                        content='memories',
                        content_rowid='id',
                        tokenize='porter unicode61'
                    )
                """)
                conn.execute("""
                    CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
                        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
                    END
                """)
                conn.execute("""
                    CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
                        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
                    END
                """)
                conn.execute("""
                    CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE OF content ON memories BEGIN
                        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
                        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
                    END
                """)
                # Backfill existing memories
                conn.execute(
                    "INSERT INTO memories_fts(rowid, content) SELECT id, content FROM memories"
                )
                conn.execute(
                    "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (4, 'FTS5 full-text search with auto-sync triggers')"
                )
                conn.commit()
                logger.info("Created FTS5 table and triggers for full-text search")
        except sqlite3.OperationalError as e:
            if "fts5" in str(e).lower():
                logger.warning(f"FTS5 not available in this SQLite build: {e}")
            else:
                logger.warning(f"FTS5 setup failed: {e}")

    def _get_table_columns(self, conn: sqlite3.Connection, table: str) -> set:
        """Get column names for a table."""
        result = conn.execute(f"PRAGMA table_info({table})").fetchall()
        return {row[1] for row in result}  # row[1] is column name

    def _check_migration_integrity(self, conn: sqlite3.Connection) -> Optional[int]:
        """Check if migrations completed properly by verifying expected columns exist.

        Returns the effective schema version based on what actually exists,
        which may be lower than what schema_migrations claims.
        Returns None if all migrations completed properly.
        """
        # Migration 8 added valid_at, invalid_at to relationships
        rel_cols = self._get_table_columns(conn, "relationships")
        if "invalid_at" not in rel_cols or "valid_at" not in rel_cols:
            logger.warning("Migration 8 incomplete: relationships missing bi-temporal columns")
            return 7  # Force re-run from migration 8

        # Migration 10 added reflections table
        tables = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        if "reflections" not in tables:
            logger.warning("Migration 10 incomplete: reflections table missing")
            return 9  # Force re-run from migration 10

        # Migration 12 added audit_log, metrics tables and soft-delete/correction columns
        if "audit_log" not in tables or "metrics" not in tables:
            logger.warning("Migration 12 incomplete: audit_log or metrics table missing")
            return 11  # Force re-run from migration 12

        entity_cols = self._get_table_columns(conn, "entities")
        if "deleted_at" not in entity_cols:
            logger.warning("Migration 12 incomplete: entities missing deleted_at column")
            return 11

        memory_cols = self._get_table_columns(conn, "memories")
        if "invalidated_at" not in memory_cols or "corrected_at" not in memory_cols:
            logger.warning("Migration 12 incomplete: memories missing correction/invalidation columns")
            return 11

        # Migration 13 added origin_type to memories, agent_dispatches table
        if "origin_type" not in memory_cols:
            logger.warning("Migration 13 incomplete: memories missing origin_type column")
            return 12

        if "agent_dispatches" not in tables:
            logger.warning("Migration 13 incomplete: agent_dispatches table missing")
            return 12

        # Migration 14 added dispatch_tier to agent_dispatches
        dispatch_cols = self._get_table_columns(conn, "agent_dispatches")
        if "dispatch_tier" not in dispatch_cols:
            logger.warning("Migration 14 incomplete: agent_dispatches missing dispatch_tier column")
            return 13

        return None  # All good

    def _store_workspace_path(self, conn: sqlite3.Connection) -> None:
        """Store workspace path in _meta table for database identification.

        The workspace path is sourced from:
        1. CLAUDIA_WORKSPACE_PATH environment variable (set by MCP server)
        2. Derived from database filename if it looks like a workspace hash

        This allows the /databases command to show which workspace each database belongs to.
        """
        # Check if _meta table exists (may not on very first run before schema executes)
        try:
            check = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='_meta'"
            ).fetchone()
            if not check:
                return
        except sqlite3.OperationalError:
            return

        # Get workspace path from environment (set by MCP server from cwd)
        workspace_path = os.environ.get("CLAUDIA_WORKSPACE_PATH")

        if workspace_path:
            # Store or update workspace_path
            conn.execute(
                """INSERT INTO _meta (key, value, updated_at)
                   VALUES ('workspace_path', ?, datetime('now'))
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')""",
                (workspace_path,)
            )

            # Store created_at if not already set
            conn.execute(
                """INSERT OR IGNORE INTO _meta (key, value, updated_at)
                   VALUES ('created_at', ?, datetime('now'))""",
                (datetime.now().isoformat(),)
            )

            conn.commit()
            logger.debug(f"Stored workspace path in _meta: {workspace_path}")

    def execute(
        self, sql: str, params: Tuple = (), fetch: bool = False
    ) -> Optional[List[sqlite3.Row]]:
        """Execute SQL statement with optional fetch"""
        with self.cursor() as cursor:
            cursor.execute(sql, params)
            if fetch:
                return cursor.fetchall()
            return None

    def execute_many(self, sql: str, params_list: List[Tuple]) -> None:
        """Execute SQL statement with multiple parameter sets"""
        with self.cursor() as cursor:
            cursor.executemany(sql, params_list)

    def insert(self, table: str, data: Dict[str, Any]) -> int:
        """Insert a row and return the ID"""
        columns = ", ".join(data.keys())
        placeholders = ", ".join(["?" for _ in data])
        sql = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"

        with self.cursor() as cursor:
            cursor.execute(sql, tuple(data.values()))
            return cursor.lastrowid

    def update(
        self, table: str, data: Dict[str, Any], where: str, where_params: Tuple = ()
    ) -> int:
        """Update rows and return count of affected rows"""
        set_clause = ", ".join([f"{k} = ?" for k in data.keys()])
        sql = f"UPDATE {table} SET {set_clause} WHERE {where}"

        with self.cursor() as cursor:
            cursor.execute(sql, tuple(data.values()) + where_params)
            return cursor.rowcount

    def delete(self, table: str, where: str, where_params: Tuple = ()) -> int:
        """Delete rows and return count of affected rows"""
        sql = f"DELETE FROM {table} WHERE {where}"

        with self.cursor() as cursor:
            cursor.execute(sql, where_params)
            return cursor.rowcount

    def query(
        self,
        table: str,
        columns: List[str] = None,
        where: str = None,
        where_params: Tuple = (),
        order_by: str = None,
        limit: int = None,
        offset: int = None,
    ) -> List[sqlite3.Row]:
        """Query rows from a table"""
        cols = ", ".join(columns) if columns else "*"
        sql = f"SELECT {cols} FROM {table}"

        if where:
            sql += f" WHERE {where}"
        if order_by:
            sql += f" ORDER BY {order_by}"
        if limit:
            sql += f" LIMIT {limit}"
        if offset:
            sql += f" OFFSET {offset}"

        return self.execute(sql, where_params, fetch=True) or []

    def get_one(
        self,
        table: str,
        columns: List[str] = None,
        where: str = None,
        where_params: Tuple = (),
    ) -> Optional[sqlite3.Row]:
        """Get a single row from a table"""
        rows = self.query(table, columns, where, where_params, limit=1)
        return rows[0] if rows else None

    def close(self) -> None:
        """Close the thread-local connection"""
        if hasattr(self._local, "connection") and self._local.connection:
            self._local.connection.close()
            self._local.connection = None


# Content hash utility
def content_hash(content: str) -> str:
    """Generate SHA256 hash of content for deduplication"""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


# Global database instance
_db: Optional[Database] = None


def get_db() -> Database:
    """Get or create the global database instance"""
    global _db
    if _db is None:
        _db = Database()
        _db.initialize()
    return _db


def reset_db() -> None:
    """Reset the global database instance (for testing)"""
    global _db
    if _db:
        _db.close()
    _db = None
