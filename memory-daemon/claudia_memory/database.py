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
import sqlite3
import threading
from contextlib import contextmanager
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
                                # Virtual tables may fail if sqlite-vec not loaded
                                if "no such module: vec0" in str(e):
                                    logger.warning(f"Skipping vector table: {e}")
                                else:
                                    raise

                logger.info(f"Database initialized at {self.db_path}")
            else:
                logger.warning(f"Schema file not found at {schema_path}")

            # Run migrations for existing databases
            self._run_migrations(conn)

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
