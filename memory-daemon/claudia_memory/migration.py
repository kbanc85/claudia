"""
Legacy Database Migration for Claudia Memory System

Fixes silent data loss when the daemon switched from a single claudia.db
to project-hash naming ({sha256[:12]}.db) without migrating existing data.

Operates purely at the SQLite level — no service-layer dependencies
(no Ollama, no embedding service, no RememberService).
"""

import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from .database import content_hash

logger = logging.getLogger(__name__)

# Names to filter out as garbage during entity migration
GARBAGE_NAMES = frozenset({"test", "unknown", "none", "n/a", "na", "tbd", "todo", "tmp"})


# ── Schema helpers ───────────────────────────────────────────────────

def get_table_columns(conn: sqlite3.Connection, table: str) -> Set[str]:
    """Get column names for a table using PRAGMA table_info."""
    try:
        result = conn.execute(f"PRAGMA table_info({table})").fetchall()
        return {row[1] for row in result}
    except sqlite3.OperationalError:
        return set()


def get_table_names(conn: sqlite3.Connection) -> Set[str]:
    """Get all table names in a database."""
    try:
        result = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        return {row[0] for row in result}
    except sqlite3.OperationalError:
        return set()


def _build_select(columns_available: Set[str], columns_wanted: List[str],
                  defaults: Dict[str, Any] = None) -> Tuple[str, List[str]]:
    """Build a SELECT clause that adapts to available columns.

    For columns that exist in the source, selects them directly.
    For columns that are wanted but missing, uses a default value expression.
    Returns (select_clause, ordered_column_names).
    """
    defaults = defaults or {}
    parts = []
    names = []

    for col in columns_wanted:
        if col in columns_available:
            parts.append(col)
            names.append(col)
        elif col in defaults:
            default = defaults[col]
            if default is None:
                parts.append(f"NULL AS {col}")
            elif isinstance(default, str):
                parts.append(f"'{default}' AS {col}")
            elif isinstance(default, (int, float)):
                parts.append(f"{default} AS {col}")
            else:
                parts.append(f"NULL AS {col}")
            names.append(col)
        # else: skip column entirely

    return ", ".join(parts), names


def _is_garbage_entity(name: str) -> bool:
    """Check if an entity name is garbage (test data, meaningless)."""
    stripped = name.strip()
    if len(stripped) <= 1:
        return True
    if stripped.lower() in GARBAGE_NAMES:
        return True
    return False


# ── Pre-migration checks ────────────────────────────────────────────

def check_legacy_database(legacy_path: Path) -> Optional[Dict]:
    """Check if a legacy database exists and has meaningful data.

    Returns a dict with stats if the database has data worth migrating,
    or None if it doesn't exist or is empty.
    """
    if not legacy_path.exists():
        return None

    try:
        conn = sqlite3.connect(f"file:{legacy_path}?mode=ro", uri=True, timeout=5)
        conn.row_factory = sqlite3.Row

        tables = get_table_names(conn)
        stats = {"path": str(legacy_path), "tables": list(tables)}

        if "entities" in tables:
            row = conn.execute("SELECT COUNT(*) as c FROM entities").fetchone()
            stats["entities"] = row["c"]
        else:
            stats["entities"] = 0

        if "memories" in tables:
            row = conn.execute("SELECT COUNT(*) as c FROM memories").fetchone()
            stats["memories"] = row["c"]
        else:
            stats["memories"] = 0

        if "memory_entities" in tables:
            row = conn.execute("SELECT COUNT(*) as c FROM memory_entities").fetchone()
            stats["links"] = row["c"]
        else:
            stats["links"] = 0

        if "relationships" in tables:
            row = conn.execute("SELECT COUNT(*) as c FROM relationships").fetchone()
            stats["relationships"] = row["c"]
        else:
            stats["relationships"] = 0

        # Date range
        if stats["memories"] > 0:
            range_row = conn.execute(
                "SELECT MIN(created_at) as earliest, MAX(created_at) as latest FROM memories"
            ).fetchone()
            stats["earliest"] = range_row["earliest"]
            stats["latest"] = range_row["latest"]

        conn.close()

        # Only worth migrating if there's actual data
        if stats["entities"] == 0 and stats["memories"] == 0:
            return None

        return stats

    except (sqlite3.Error, OSError) as e:
        logger.warning(f"Could not read legacy database {legacy_path}: {e}")
        return None


def is_migration_completed(active_db) -> bool:
    """Check if legacy migration has already been completed.

    Looks for 'legacy_migration_completed' key in _meta table.
    """
    try:
        rows = active_db.execute(
            "SELECT value FROM _meta WHERE key = 'legacy_migration_completed'",
            fetch=True,
        )
        return bool(rows and rows[0]["value"])
    except Exception:
        return False


def mark_migration_completed(active_db, stats: Dict) -> None:
    """Mark legacy migration as completed in _meta table."""
    active_db.execute(
        "INSERT OR REPLACE INTO _meta (key, value, updated_at) "
        "VALUES ('legacy_migration_completed', ?, datetime('now'))",
        (json.dumps({
            "completed_at": datetime.now().isoformat(),
            "stats": stats,
        }),),
    )


# ── Core migration ──────────────────────────────────────────────────

def migrate_legacy_database(
    legacy_path: Path,
    active_path: Path,
    dry_run: bool = False,
) -> Dict[str, int]:
    """Migrate data from a legacy claudia.db into the active project database.

    Opens legacy db read-only and active db read-write. The entire operation
    is wrapped in a single transaction — if anything fails, nothing changes.

    Args:
        legacy_path: Path to the legacy claudia.db
        active_path: Path to the active project database
        dry_run: If True, count what would be migrated without making changes

    Returns:
        Dict with migration counts per table
    """
    results = {
        "entities_created": 0,
        "entities_mapped": 0,
        "entities_skipped": 0,
        "memories_migrated": 0,
        "memories_duplicate": 0,
        "links_migrated": 0,
        "links_skipped": 0,
        "relationships_migrated": 0,
        "relationships_duplicate": 0,
        "patterns_created": 0,
        "patterns_merged": 0,
        "episodes_migrated": 0,
        "episodes_duplicate": 0,
        "messages_migrated": 0,
        "documents_migrated": 0,
        "documents_mapped": 0,
        "entity_documents_migrated": 0,
        "memory_sources_migrated": 0,
        "aliases_migrated": 0,
        "reflections_migrated": 0,
    }

    # Open legacy database read-only
    legacy_conn = sqlite3.connect(f"file:{legacy_path}?mode=ro", uri=True, timeout=10)
    legacy_conn.row_factory = sqlite3.Row

    # Open active database read-write
    active_conn = sqlite3.connect(str(active_path), timeout=30)
    active_conn.row_factory = sqlite3.Row
    active_conn.execute("PRAGMA journal_mode = WAL")
    active_conn.execute("PRAGMA foreign_keys = OFF")  # Defer FK checks during bulk migration

    legacy_tables = get_table_names(legacy_conn)
    active_tables = get_table_names(active_conn)

    try:
        if not dry_run:
            active_conn.execute("BEGIN")

        # ── 1. Entities ─────────────────────────────────────────
        entity_id_map = {}  # legacy_id -> active_id

        if "entities" in legacy_tables and "entities" in active_tables:
            entity_id_map = _migrate_entities(
                legacy_conn, active_conn, results, dry_run
            )

        # ── 2. Memories ─────────────────────────────────────────
        memory_id_map = {}

        if "memories" in legacy_tables and "memories" in active_tables:
            memory_id_map = _migrate_memories(
                legacy_conn, active_conn, results, dry_run
            )

        # ── 3. Memory-entity links ──────────────────────────────
        if "memory_entities" in legacy_tables and "memory_entities" in active_tables:
            _migrate_memory_entities(
                legacy_conn, active_conn, entity_id_map, memory_id_map,
                results, dry_run
            )

        # ── 4. Relationships ────────────────────────────────────
        if "relationships" in legacy_tables and "relationships" in active_tables:
            _migrate_relationships(
                legacy_conn, active_conn, entity_id_map, results, dry_run
            )

        # ── 5. Patterns ────────────────────────────────────────
        if "patterns" in legacy_tables and "patterns" in active_tables:
            _migrate_patterns(
                legacy_conn, active_conn, results, dry_run
            )

        # ── 6. Episodes & Messages ──────────────────────────────
        episode_id_map = {}

        if "episodes" in legacy_tables and "episodes" in active_tables:
            episode_id_map = _migrate_episodes(
                legacy_conn, active_conn, results, dry_run
            )

        if "messages" in legacy_tables and "messages" in active_tables:
            _migrate_messages(
                legacy_conn, active_conn, episode_id_map, results, dry_run
            )

        # ── 7. Documents ───────────────────────────────────────
        document_id_map = {}

        if "documents" in legacy_tables and "documents" in active_tables:
            document_id_map = _migrate_documents(
                legacy_conn, active_conn, results, dry_run
            )

        # ── 8. Entity-document links ────────────────────────────
        if "entity_documents" in legacy_tables and "entity_documents" in active_tables:
            _migrate_entity_documents(
                legacy_conn, active_conn, entity_id_map, document_id_map,
                results, dry_run
            )

        # ── 9. Memory sources ──────────────────────────────────
        if "memory_sources" in legacy_tables and "memory_sources" in active_tables:
            _migrate_memory_sources(
                legacy_conn, active_conn, memory_id_map, document_id_map,
                results, dry_run
            )

        # ── 10. Entity aliases ─────────────────────────────────
        if "entity_aliases" in legacy_tables and "entity_aliases" in active_tables:
            _migrate_entity_aliases(
                legacy_conn, active_conn, entity_id_map, results, dry_run
            )

        # ── 11. Reflections ────────────────────────────────────
        if "reflections" in legacy_tables and "reflections" in active_tables:
            _migrate_reflections(
                legacy_conn, active_conn, entity_id_map, episode_id_map,
                results, dry_run
            )

        # Commit the transaction
        if not dry_run:
            active_conn.execute("COMMIT")
            logger.info("Legacy migration committed successfully")

    except Exception:
        if not dry_run:
            try:
                active_conn.execute("ROLLBACK")
            except Exception:
                pass
        raise

    finally:
        # Re-enable foreign keys
        try:
            active_conn.execute("PRAGMA foreign_keys = ON")
        except Exception:
            pass
        legacy_conn.close()
        active_conn.close()

    return results


# ── Per-table migration functions ────────────────────────────────────

def _migrate_entities(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    results: Dict[str, int],
    dry_run: bool,
) -> Dict[int, int]:
    """Migrate entities. Returns old_id -> new_id map."""
    entity_id_map = {}

    legacy_cols = get_table_columns(legacy_conn, "entities")
    active_cols = get_table_columns(active_conn, "entities")

    # Columns we want to migrate (intersection of what's useful)
    wanted = [
        "id", "name", "type", "canonical_name", "description",
        "importance", "created_at", "updated_at", "metadata",
    ]
    # Optional newer columns with defaults
    defaults = {
        "last_contact_at": None,
        "contact_frequency_days": None,
        "contact_trend": None,
        "attention_tier": "standard",
    }
    for col in defaults:
        if col in active_cols:
            wanted.append(col)

    select_clause, col_names = _build_select(legacy_cols, wanted, defaults)
    legacy_entities = legacy_conn.execute(
        f"SELECT {select_clause} FROM entities"
    ).fetchall()

    # Build lookup of active entities by (canonical_name, type)
    active_entities = active_conn.execute(
        "SELECT id, name, canonical_name, type FROM entities"
    ).fetchall()

    active_lookup = {}
    for e in active_entities:
        cn = e["canonical_name"] or e["name"].lower()
        active_lookup[(cn.lower(), e["type"])] = e["id"]

    # Check for deleted entities in active db (skip those)
    deleted_in_active = set()
    if "deleted_at" in active_cols:
        deleted_rows = active_conn.execute(
            "SELECT canonical_name, type FROM entities WHERE deleted_at IS NOT NULL"
        ).fetchall()
        for d in deleted_rows:
            cn = d["canonical_name"] or ""
            deleted_in_active.add((cn.lower(), d["type"]))

    for entity in legacy_entities:
        legacy_id = entity["id"]
        name = entity["name"]
        etype = entity["type"]

        # Filter garbage
        if _is_garbage_entity(name):
            results["entities_skipped"] += 1
            continue

        # Compute canonical name for matching
        cn = entity["canonical_name"] if "canonical_name" in col_names and entity["canonical_name"] else name.lower()
        match_key = (cn.lower(), etype)

        # Skip if deleted in active
        if match_key in deleted_in_active:
            results["entities_skipped"] += 1
            continue

        # Try to match existing entity
        if match_key in active_lookup:
            entity_id_map[legacy_id] = active_lookup[match_key]
            results["entities_mapped"] += 1
            continue

        if dry_run:
            # Assign a fake ID for counting
            entity_id_map[legacy_id] = -(results["entities_created"] + 1)
            results["entities_created"] += 1
            continue

        # Insert new entity
        insert_cols = []
        insert_vals = []
        for col in col_names:
            if col == "id":
                continue  # Let active db assign new ID
            if col in active_cols:
                insert_cols.append(col)
                insert_vals.append(entity[col])

        if insert_cols:
            placeholders = ", ".join(["?"] * len(insert_cols))
            col_str = ", ".join(insert_cols)
            cursor = active_conn.execute(
                f"INSERT INTO entities ({col_str}) VALUES ({placeholders})",
                insert_vals,
            )
            new_id = cursor.lastrowid
            entity_id_map[legacy_id] = new_id

            # Update lookup for future matches
            active_lookup[match_key] = new_id
            results["entities_created"] += 1

    logger.info(
        f"Entities: {results['entities_created']} created, "
        f"{results['entities_mapped']} mapped, "
        f"{results['entities_skipped']} skipped"
    )
    return entity_id_map


def _migrate_memories(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    results: Dict[str, int],
    dry_run: bool,
) -> Dict[int, int]:
    """Migrate memories. Returns old_id -> new_id map."""
    memory_id_map = {}

    legacy_cols = get_table_columns(legacy_conn, "memories")
    active_cols = get_table_columns(active_conn, "memories")

    wanted = [
        "id", "content", "content_hash", "type", "importance", "confidence",
        "source", "source_id", "source_context", "created_at", "updated_at",
        "last_accessed_at", "access_count", "metadata",
    ]
    defaults = {
        "verified_at": None,
        "verification_status": "pending",
        "source_channel": "claude_code",
        "deadline_at": None,
        "temporal_markers": None,
        "origin_type": "extracted",
        "corrected_at": None,
        "corrected_from": None,
        "invalidated_at": None,
        "invalidated_reason": None,
    }
    for col in defaults:
        if col in active_cols:
            wanted.append(col)

    select_clause, col_names = _build_select(legacy_cols, wanted, defaults)

    # Collect existing content hashes in active db for dedup
    existing_hashes = set()
    hash_rows = active_conn.execute(
        "SELECT content_hash FROM memories WHERE content_hash IS NOT NULL"
    ).fetchall()
    for row in hash_rows:
        existing_hashes.add(row["content_hash"])

    legacy_memories = legacy_conn.execute(
        f"SELECT {select_clause} FROM memories"
    ).fetchall()

    for memory in legacy_memories:
        legacy_id = memory["id"]
        mem_hash = memory["content_hash"]

        # Generate hash if missing
        if not mem_hash and memory["content"]:
            mem_hash = content_hash(memory["content"])

        # Dedup by content hash
        if mem_hash and mem_hash in existing_hashes:
            results["memories_duplicate"] += 1
            # Map to existing memory with same hash for link remapping
            existing = active_conn.execute(
                "SELECT id FROM memories WHERE content_hash = ?", (mem_hash,)
            ).fetchone()
            if existing:
                memory_id_map[legacy_id] = existing["id"]
            continue

        if dry_run:
            memory_id_map[legacy_id] = -(results["memories_migrated"] + 1)
            results["memories_migrated"] += 1
            if mem_hash:
                existing_hashes.add(mem_hash)
            continue

        # Insert new memory
        insert_cols = []
        insert_vals = []
        for col in col_names:
            if col == "id":
                continue
            if col in active_cols:
                val = memory[col]
                # Ensure content_hash is set
                if col == "content_hash" and not val and memory["content"]:
                    val = content_hash(memory["content"])
                insert_cols.append(col)
                insert_vals.append(val)

        if insert_cols:
            placeholders = ", ".join(["?"] * len(insert_cols))
            col_str = ", ".join(insert_cols)
            try:
                cursor = active_conn.execute(
                    f"INSERT INTO memories ({col_str}) VALUES ({placeholders})",
                    insert_vals,
                )
                new_id = cursor.lastrowid
                memory_id_map[legacy_id] = new_id
                results["memories_migrated"] += 1
                if mem_hash:
                    existing_hashes.add(mem_hash)
            except sqlite3.IntegrityError:
                # content_hash UNIQUE constraint
                results["memories_duplicate"] += 1

    logger.info(
        f"Memories: {results['memories_migrated']} migrated, "
        f"{results['memories_duplicate']} duplicate"
    )
    return memory_id_map


def _migrate_memory_entities(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    entity_id_map: Dict[int, int],
    memory_id_map: Dict[int, int],
    results: Dict[str, int],
    dry_run: bool,
) -> None:
    """Migrate memory-entity links with ID remapping."""
    legacy_links = legacy_conn.execute(
        "SELECT memory_id, entity_id, relationship FROM memory_entities"
    ).fetchall()

    for link in legacy_links:
        new_memory_id = memory_id_map.get(link["memory_id"])
        new_entity_id = entity_id_map.get(link["entity_id"])

        if not new_memory_id or not new_entity_id:
            results["links_skipped"] += 1
            continue

        if dry_run:
            results["links_migrated"] += 1
            continue

        try:
            cursor = active_conn.execute(
                "INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relationship) "
                "VALUES (?, ?, ?)",
                (new_memory_id, new_entity_id, link["relationship"]),
            )
            if cursor.rowcount > 0:
                results["links_migrated"] += 1
            else:
                results["links_skipped"] += 1
        except sqlite3.IntegrityError:
            results["links_skipped"] += 1

    logger.info(
        f"Memory-entity links: {results['links_migrated']} migrated, "
        f"{results['links_skipped']} skipped"
    )


def _migrate_relationships(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    entity_id_map: Dict[int, int],
    results: Dict[str, int],
    dry_run: bool,
) -> None:
    """Migrate entity relationships with ID remapping."""
    legacy_cols = get_table_columns(legacy_conn, "relationships")
    active_cols = get_table_columns(active_conn, "relationships")

    wanted = [
        "source_entity_id", "target_entity_id", "relationship_type",
        "strength", "direction", "created_at", "updated_at", "metadata",
    ]
    defaults = {
        "origin_type": "extracted",
        "valid_at": None,
        "invalid_at": None,
    }
    for col in defaults:
        if col in active_cols:
            wanted.append(col)

    select_clause, col_names = _build_select(legacy_cols, wanted, defaults)
    legacy_rels = legacy_conn.execute(
        f"SELECT {select_clause} FROM relationships"
    ).fetchall()

    for rel in legacy_rels:
        new_source = entity_id_map.get(rel["source_entity_id"])
        new_target = entity_id_map.get(rel["target_entity_id"])

        if not new_source or not new_target:
            results["relationships_duplicate"] += 1
            continue

        if dry_run:
            results["relationships_migrated"] += 1
            continue

        insert_cols = []
        insert_vals = []
        for col in col_names:
            if col in active_cols:
                val = rel[col]
                if col == "source_entity_id":
                    val = new_source
                elif col == "target_entity_id":
                    val = new_target
                insert_cols.append(col)
                insert_vals.append(val)

        if insert_cols:
            placeholders = ", ".join(["?"] * len(insert_cols))
            col_str = ", ".join(insert_cols)
            try:
                active_conn.execute(
                    f"INSERT OR IGNORE INTO relationships ({col_str}) VALUES ({placeholders})",
                    insert_vals,
                )
                results["relationships_migrated"] += 1
            except sqlite3.IntegrityError:
                results["relationships_duplicate"] += 1

    logger.info(
        f"Relationships: {results['relationships_migrated']} migrated, "
        f"{results['relationships_duplicate']} duplicate"
    )


def _migrate_patterns(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    results: Dict[str, int],
    dry_run: bool,
) -> None:
    """Migrate patterns. Matches merge; non-matches create new."""
    legacy_patterns = legacy_conn.execute(
        "SELECT * FROM patterns"
    ).fetchall()

    for pattern in legacy_patterns:
        # Try to match by name + type
        existing = active_conn.execute(
            "SELECT id, occurrences, evidence, first_observed_at "
            "FROM patterns WHERE name = ? AND pattern_type = ?",
            (pattern["name"], pattern["pattern_type"]),
        ).fetchone()

        if existing:
            if dry_run:
                results["patterns_merged"] += 1
                continue

            # Merge: combine occurrences and evidence
            new_occurrences = existing["occurrences"] + pattern["occurrences"]
            existing_evidence = _safe_json_parse(existing["evidence"], [])
            pattern_evidence = _safe_json_parse(pattern["evidence"], [])
            merged_evidence = existing_evidence + pattern_evidence

            # Use earliest first_observed_at
            first_observed = min(
                existing["first_observed_at"] or "",
                pattern["first_observed_at"] or "",
            ) or pattern["first_observed_at"]

            active_conn.execute(
                "UPDATE patterns SET occurrences = ?, evidence = ?, "
                "first_observed_at = ?, last_observed_at = MAX(last_observed_at, ?) "
                "WHERE id = ?",
                (
                    new_occurrences,
                    json.dumps(merged_evidence),
                    first_observed,
                    pattern["last_observed_at"],
                    existing["id"],
                ),
            )
            results["patterns_merged"] += 1
        else:
            if dry_run:
                results["patterns_created"] += 1
                continue

            # Insert new pattern (without id, let autoincrement assign)
            cols = [k for k in dict(pattern).keys() if k != "id"]
            vals = [pattern[k] for k in cols]
            placeholders = ", ".join(["?"] * len(cols))
            col_str = ", ".join(cols)
            try:
                active_conn.execute(
                    f"INSERT INTO patterns ({col_str}) VALUES ({placeholders})",
                    vals,
                )
                results["patterns_created"] += 1
            except sqlite3.IntegrityError:
                results["patterns_merged"] += 1

    logger.info(
        f"Patterns: {results['patterns_created']} created, "
        f"{results['patterns_merged']} merged"
    )


def _migrate_episodes(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    results: Dict[str, int],
    dry_run: bool,
) -> Dict[int, int]:
    """Migrate episodes. Returns old_id -> new_id map."""
    episode_id_map = {}

    legacy_cols = get_table_columns(legacy_conn, "episodes")
    active_cols = get_table_columns(active_conn, "episodes")

    wanted = [
        "id", "session_id", "summary", "started_at", "ended_at",
        "message_count", "turn_count", "is_summarized", "metadata",
    ]
    defaults = {
        "narrative": None,
        "source": "claude_code",
        "ingested_at": None,
        "key_topics": None,
    }
    for col in defaults:
        if col in active_cols:
            wanted.append(col)

    select_clause, col_names = _build_select(legacy_cols, wanted, defaults)
    legacy_episodes = legacy_conn.execute(
        f"SELECT {select_clause} FROM episodes"
    ).fetchall()

    for ep in legacy_episodes:
        legacy_id = ep["id"]
        session_id = ep["session_id"]

        # Dedup by session_id
        if session_id:
            existing = active_conn.execute(
                "SELECT id FROM episodes WHERE session_id = ?", (session_id,)
            ).fetchone()
            if existing:
                episode_id_map[legacy_id] = existing["id"]
                results["episodes_duplicate"] += 1
                continue

        if dry_run:
            episode_id_map[legacy_id] = -(results["episodes_migrated"] + 1)
            results["episodes_migrated"] += 1
            continue

        insert_cols = []
        insert_vals = []
        for col in col_names:
            if col == "id":
                continue
            if col in active_cols:
                insert_cols.append(col)
                insert_vals.append(ep[col])

        if insert_cols:
            placeholders = ", ".join(["?"] * len(insert_cols))
            col_str = ", ".join(insert_cols)
            try:
                cursor = active_conn.execute(
                    f"INSERT INTO episodes ({col_str}) VALUES ({placeholders})",
                    insert_vals,
                )
                episode_id_map[legacy_id] = cursor.lastrowid
                results["episodes_migrated"] += 1
            except sqlite3.IntegrityError:
                results["episodes_duplicate"] += 1

    logger.info(
        f"Episodes: {results['episodes_migrated']} migrated, "
        f"{results['episodes_duplicate']} duplicate"
    )
    return episode_id_map


def _migrate_messages(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    episode_id_map: Dict[int, int],
    results: Dict[str, int],
    dry_run: bool,
) -> None:
    """Migrate messages with episode ID remapping."""
    legacy_cols = get_table_columns(legacy_conn, "messages")

    # Collect existing content hashes for dedup
    existing_hashes = set()
    hash_rows = active_conn.execute(
        "SELECT content_hash FROM messages WHERE content_hash IS NOT NULL"
    ).fetchall()
    for row in hash_rows:
        existing_hashes.add(row["content_hash"])

    legacy_messages = legacy_conn.execute(
        "SELECT id, episode_id, role, content, content_hash, created_at, metadata "
        "FROM messages"
    ).fetchall()

    for msg in legacy_messages:
        # Dedup by content_hash
        msg_hash = msg["content_hash"]
        if msg_hash and msg_hash in existing_hashes:
            continue

        new_episode_id = episode_id_map.get(msg["episode_id"])
        if not new_episode_id:
            continue

        if dry_run:
            results["messages_migrated"] += 1
            if msg_hash:
                existing_hashes.add(msg_hash)
            continue

        try:
            active_conn.execute(
                "INSERT INTO messages (episode_id, role, content, content_hash, created_at, metadata) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (new_episode_id, msg["role"], msg["content"],
                 msg_hash, msg["created_at"], msg["metadata"]),
            )
            results["messages_migrated"] += 1
            if msg_hash:
                existing_hashes.add(msg_hash)
        except sqlite3.IntegrityError:
            pass

    logger.info(f"Messages: {results['messages_migrated']} migrated")


def _migrate_documents(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    results: Dict[str, int],
    dry_run: bool,
) -> Dict[int, int]:
    """Migrate documents. Returns old_id -> new_id map."""
    document_id_map = {}

    legacy_docs = legacy_conn.execute("SELECT * FROM documents").fetchall()

    for doc in legacy_docs:
        legacy_id = doc["id"]
        file_hash = doc["file_hash"]

        # Dedup by file_hash
        if file_hash:
            existing = active_conn.execute(
                "SELECT id FROM documents WHERE file_hash = ?", (file_hash,)
            ).fetchone()
            if existing:
                document_id_map[legacy_id] = existing["id"]
                results["documents_mapped"] += 1
                continue

        if dry_run:
            document_id_map[legacy_id] = -(results["documents_migrated"] + 1)
            results["documents_migrated"] += 1
            continue

        cols = [k for k in dict(doc).keys() if k != "id"]
        vals = [doc[k] for k in cols]
        placeholders = ", ".join(["?"] * len(cols))
        col_str = ", ".join(cols)
        try:
            cursor = active_conn.execute(
                f"INSERT INTO documents ({col_str}) VALUES ({placeholders})",
                vals,
            )
            document_id_map[legacy_id] = cursor.lastrowid
            results["documents_migrated"] += 1
        except sqlite3.IntegrityError:
            results["documents_mapped"] += 1

    logger.info(
        f"Documents: {results['documents_migrated']} migrated, "
        f"{results['documents_mapped']} mapped"
    )
    return document_id_map


def _migrate_entity_documents(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    entity_id_map: Dict[int, int],
    document_id_map: Dict[int, int],
    results: Dict[str, int],
    dry_run: bool,
) -> None:
    """Migrate entity-document links with ID remapping."""
    legacy_links = legacy_conn.execute(
        "SELECT entity_id, document_id, relationship FROM entity_documents"
    ).fetchall()

    for link in legacy_links:
        new_entity_id = entity_id_map.get(link["entity_id"])
        new_doc_id = document_id_map.get(link["document_id"])

        if not new_entity_id or not new_doc_id:
            continue

        if dry_run:
            results["entity_documents_migrated"] += 1
            continue

        try:
            active_conn.execute(
                "INSERT OR IGNORE INTO entity_documents "
                "(entity_id, document_id, relationship) VALUES (?, ?, ?)",
                (new_entity_id, new_doc_id, link["relationship"]),
            )
            results["entity_documents_migrated"] += 1
        except sqlite3.IntegrityError:
            pass

    logger.info(
        f"Entity-document links: {results['entity_documents_migrated']} migrated"
    )


def _migrate_memory_sources(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    memory_id_map: Dict[int, int],
    document_id_map: Dict[int, int],
    results: Dict[str, int],
    dry_run: bool,
) -> None:
    """Migrate memory-document source links with ID remapping."""
    legacy_links = legacy_conn.execute(
        "SELECT memory_id, document_id, excerpt FROM memory_sources"
    ).fetchall()

    for link in legacy_links:
        new_memory_id = memory_id_map.get(link["memory_id"])
        new_doc_id = document_id_map.get(link["document_id"])

        if not new_memory_id or not new_doc_id:
            continue

        if dry_run:
            results["memory_sources_migrated"] += 1
            continue

        try:
            active_conn.execute(
                "INSERT OR IGNORE INTO memory_sources "
                "(memory_id, document_id, excerpt) VALUES (?, ?, ?)",
                (new_memory_id, new_doc_id, link["excerpt"]),
            )
            results["memory_sources_migrated"] += 1
        except sqlite3.IntegrityError:
            pass

    logger.info(
        f"Memory sources: {results['memory_sources_migrated']} migrated"
    )


def _migrate_entity_aliases(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    entity_id_map: Dict[int, int],
    results: Dict[str, int],
    dry_run: bool,
) -> None:
    """Migrate entity aliases with ID remapping."""
    legacy_aliases = legacy_conn.execute(
        "SELECT entity_id, alias, canonical_alias FROM entity_aliases"
    ).fetchall()

    for alias_row in legacy_aliases:
        new_entity_id = entity_id_map.get(alias_row["entity_id"])
        if not new_entity_id:
            continue

        if dry_run:
            results["aliases_migrated"] += 1
            continue

        try:
            active_conn.execute(
                "INSERT OR IGNORE INTO entity_aliases "
                "(entity_id, alias, canonical_alias) VALUES (?, ?, ?)",
                (new_entity_id, alias_row["alias"], alias_row["canonical_alias"]),
            )
            results["aliases_migrated"] += 1
        except sqlite3.IntegrityError:
            pass

    logger.info(f"Aliases: {results['aliases_migrated']} migrated")


def _migrate_reflections(
    legacy_conn: sqlite3.Connection,
    active_conn: sqlite3.Connection,
    entity_id_map: Dict[int, int],
    episode_id_map: Dict[int, int],
    results: Dict[str, int],
    dry_run: bool,
) -> None:
    """Migrate reflections with entity/episode ID remapping."""
    legacy_cols = get_table_columns(legacy_conn, "reflections")
    active_cols = get_table_columns(active_conn, "reflections")

    wanted = [
        "id", "episode_id", "reflection_type", "content", "content_hash",
        "about_entity_id", "importance", "confidence", "decay_rate",
        "aggregated_from", "aggregation_count", "first_observed_at",
        "last_confirmed_at", "created_at", "updated_at",
        "surfaced_count", "last_surfaced_at",
    ]

    select_clause, col_names = _build_select(legacy_cols, wanted, {})
    legacy_refs = legacy_conn.execute(
        f"SELECT {select_clause} FROM reflections"
    ).fetchall()

    # Existing content hashes for dedup
    existing_hashes = set()
    hash_rows = active_conn.execute(
        "SELECT content_hash FROM reflections WHERE content_hash IS NOT NULL"
    ).fetchall()
    for row in hash_rows:
        existing_hashes.add(row["content_hash"])

    for ref in legacy_refs:
        ref_hash = ref["content_hash"] if "content_hash" in col_names else None
        if not ref_hash and ref["content"]:
            ref_hash = content_hash(ref["content"])

        # Dedup
        if ref_hash and ref_hash in existing_hashes:
            continue

        if dry_run:
            results["reflections_migrated"] += 1
            if ref_hash:
                existing_hashes.add(ref_hash)
            continue

        insert_cols = []
        insert_vals = []
        for col in col_names:
            if col == "id":
                continue
            if col not in active_cols:
                continue

            val = ref[col]

            # Remap IDs
            if col == "about_entity_id" and val:
                val = entity_id_map.get(val)
                if not val:
                    val = None  # Entity not migrated, keep reflection but unlink
            elif col == "episode_id" and val:
                val = episode_id_map.get(val)
                if not val:
                    val = None

            # Ensure content_hash is set
            if col == "content_hash" and not val:
                val = ref_hash

            insert_cols.append(col)
            insert_vals.append(val)

        if insert_cols:
            placeholders = ", ".join(["?"] * len(insert_cols))
            col_str = ", ".join(insert_cols)
            try:
                active_conn.execute(
                    f"INSERT INTO reflections ({col_str}) VALUES ({placeholders})",
                    insert_vals,
                )
                results["reflections_migrated"] += 1
                if ref_hash:
                    existing_hashes.add(ref_hash)
            except sqlite3.IntegrityError:
                pass

    logger.info(f"Reflections: {results['reflections_migrated']} migrated")


# ── Utilities ────────────────────────────────────────────────────────

def _safe_json_parse(text: str, default: Any = None) -> Any:
    """Parse JSON safely, returning default on failure."""
    if not text:
        return default
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return default
