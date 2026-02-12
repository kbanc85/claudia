"""
Vault Sync Service for Claudia Memory System

Exports memory data to an Obsidian-compatible vault as markdown notes
with YAML frontmatter and [[wikilinks]]. The vault is a read projection
of SQLite data -- SQLite remains the single source of truth.

Vault structure:
  ~/.claudia/vault/{project_id}/
    people/         Entity notes for persons
    projects/       Entity notes for projects
    organizations/  Entity notes for organizations
    concepts/       Entity notes for concepts
    locations/      Entity notes for locations
    patterns/       Detected pattern notes
    reflections/    Reflection notes from /meditate
    sessions/       Daily session logs
    canvases/       Obsidian canvas files (generated separately)
    _meta/          Sync metadata (last-sync.json, sync-log.md)
"""

import hashlib
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..config import get_config
from ..database import get_db

logger = logging.getLogger(__name__)

# Map entity types to vault subdirectories
ENTITY_TYPE_DIRS = {
    "person": "people",
    "project": "projects",
    "organization": "organizations",
    "concept": "concepts",
    "location": "locations",
}


def _sanitize_filename(name: str) -> str:
    """Convert an entity name to a safe filename.

    Preserves readability while removing characters that are
    problematic on Windows/macOS/Linux filesystems.
    """
    # Replace path separators and other unsafe chars
    sanitized = re.sub(r'[<>:"/\\|?*]', "", name)
    # Collapse multiple spaces/dots
    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    sanitized = sanitized.strip(".")
    # Truncate to reasonable length (Obsidian handles long names poorly)
    if len(sanitized) > 100:
        sanitized = sanitized[:100].rstrip()
    return sanitized or "untitled"


def _compute_sync_hash(content: str) -> str:
    """Compute a short hash of note content for change detection.

    Used in Phase 2 to detect user edits: if file content hash
    differs from sync_hash in frontmatter, the user modified the note.
    """
    return hashlib.sha256(content.encode()).hexdigest()[:12]


class VaultSyncService:
    """Syncs SQLite memory data to an Obsidian-compatible vault."""

    def __init__(self, vault_path: Path, db=None):
        """
        Args:
            vault_path: Root directory of the Obsidian vault.
            db: Optional database instance. Uses global singleton if None.
        """
        self.vault_path = vault_path
        self.db = db or get_db()

    def _ensure_directories(self) -> None:
        """Create the vault directory structure."""
        dirs = [
            "people", "projects", "organizations", "concepts",
            "locations", "patterns", "reflections", "sessions",
            "canvases", "_meta",
        ]
        for d in dirs:
            (self.vault_path / d).mkdir(parents=True, exist_ok=True)

    def _get_last_sync_time(self) -> Optional[str]:
        """Read last sync timestamp from _meta/last-sync.json."""
        meta_path = self.vault_path / "_meta" / "last-sync.json"
        if meta_path.exists():
            try:
                data = json.loads(meta_path.read_text())
                return data.get("last_sync")
            except (json.JSONDecodeError, IOError):
                pass
        return None

    def _save_sync_metadata(self, stats: Dict[str, Any]) -> None:
        """Write sync metadata to _meta/last-sync.json."""
        meta_path = self.vault_path / "_meta" / "last-sync.json"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "last_sync": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            "stats": stats,
        }
        meta_path.write_text(json.dumps(data, indent=2))

    def _append_sync_log(self, message: str) -> None:
        """Append a line to _meta/sync-log.md."""
        log_path = self.vault_path / "_meta" / "sync-log.md"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with open(log_path, "a") as f:
            f.write(f"- [{timestamp}] {message}\n")

    # ── Entity export ───────────────────────────────────────────

    def _get_all_entities(self, since: Optional[str] = None) -> List[Dict]:
        """Fetch entities from the database, optionally filtered by update time."""
        sql = "SELECT * FROM entities WHERE deleted_at IS NULL"
        params: list = []
        if since:
            sql += " AND updated_at >= ?"
            params.append(since)
        sql += " ORDER BY importance DESC"
        return self.db.execute(sql, tuple(params), fetch=True) or []

    def _get_entity_memories(self, entity_id: int) -> List[Dict]:
        """Fetch non-invalidated memories linked to an entity."""
        return self.db.execute(
            """
            SELECT m.* FROM memories m
            JOIN memory_entities me ON m.id = me.memory_id
            WHERE me.entity_id = ? AND m.invalidated_at IS NULL
            ORDER BY m.importance DESC, m.created_at DESC
            """,
            (entity_id,),
            fetch=True,
        ) or []

    def _get_entity_relationships(self, entity_id: int) -> List[Dict]:
        """Fetch active relationships for an entity with resolved names."""
        return self.db.execute(
            """
            SELECT r.*,
                   s.name as source_name, s.type as source_type,
                   t.name as target_name, t.type as target_type
            FROM relationships r
            JOIN entities s ON r.source_entity_id = s.id
            JOIN entities t ON r.target_entity_id = t.id
            WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
              AND r.invalid_at IS NULL
            ORDER BY r.strength DESC
            """,
            (entity_id, entity_id),
            fetch=True,
        ) or []

    def _get_entity_aliases(self, entity_id: int) -> List[str]:
        """Fetch aliases for an entity."""
        rows = self.db.execute(
            "SELECT alias FROM entity_aliases WHERE entity_id = ?",
            (entity_id,),
            fetch=True,
        ) or []
        return [r["alias"] for r in rows]

    def _build_frontmatter(self, entity: Dict, aliases: List[str]) -> str:
        """Build YAML frontmatter for an entity note."""
        lines = ["---"]
        lines.append(f"claudia_id: {entity['id']}")
        lines.append(f"type: {entity['type']}")
        lines.append(f"canonical_name: {entity['canonical_name']}")
        lines.append(f"importance: {entity['importance']}")
        lines.append(f"created: {entity['created_at']}")
        lines.append(f"updated: {entity['updated_at']}")
        if aliases:
            alias_str = ", ".join(aliases)
            lines.append(f"aliases: [{alias_str}]")
        lines.append(f"tags: [{entity['type']}]")
        # sync_hash is added after content is rendered (see export_entity)
        lines.append("---")
        return "\n".join(lines)

    def _render_relationships_section(
        self, entity_id: int, relationships: List[Dict]
    ) -> str:
        """Render the relationships section with [[wikilinks]]."""
        if not relationships:
            return ""

        lines = ["## Relationships"]
        for rel in relationships:
            # Determine the "other" entity relative to this one
            if rel["source_entity_id"] == entity_id:
                other_name = rel["target_name"]
            else:
                other_name = rel["source_name"]

            rel_type = rel["relationship_type"]
            strength = rel["strength"]
            lines.append(f"- **{rel_type}** [[{other_name}]] (strength: {strength})")
        return "\n".join(lines)

    def _render_memories_section(self, memories: List[Dict]) -> str:
        """Render memories grouped by type."""
        if not memories:
            return ""

        # Group by type
        by_type: Dict[str, List[Dict]] = {}
        for m in memories:
            mtype = m["type"] if m["type"] else "fact"
            by_type.setdefault(mtype, []).append(m)

        lines = []

        # Commitments get special treatment (checkboxes)
        commitments = by_type.pop("commitment", [])
        if commitments:
            lines.append("## Commitments")
            for c in commitments:
                # Check if there's metadata with completion info
                row_keys = c.keys() if hasattr(c, "keys") else []
                raw_meta = c["metadata"] if "metadata" in row_keys and c["metadata"] else None
                meta = json.loads(raw_meta) if raw_meta else {}
                completed = meta.get("completed")
                if completed:
                    lines.append(f"- [x] {c['content']} (completed: {completed})")
                else:
                    created = c["created_at"] if "created_at" in row_keys else ""
                    detected = created[:10] if created else ""
                    lines.append(f"- [ ] {c['content']} (detected: {detected})")

        # All other types as "Key Facts" (or type-specific headers)
        type_headers = {
            "fact": "Key Facts",
            "preference": "Preferences",
            "observation": "Observations",
            "learning": "Learnings",
        }

        for mtype, mems in by_type.items():
            header = type_headers.get(mtype, mtype.title() + "s")
            lines.append(f"## {header}")
            for m in mems:
                row_keys = m.keys() if hasattr(m, "keys") else []
                origin = m["origin_type"] if "origin_type" in row_keys and m["origin_type"] else ""
                confidence = m["confidence"] if "confidence" in row_keys else 1.0
                detail_parts = []
                if origin:
                    detail_parts.append(f"source: {origin}")
                if confidence is not None and confidence < 1.0:
                    detail_parts.append(f"confidence: {confidence}")
                detail = f" ({', '.join(detail_parts)})" if detail_parts else ""
                lines.append(f"- {m['content']}{detail}")

        return "\n".join(lines)

    def _render_recent_sessions(self, entity_name: str) -> str:
        """Render recent session mentions for an entity."""
        rows = self.db.execute(
            """
            SELECT id, narrative, started_at
            FROM episodes
            WHERE is_summarized = 1
              AND narrative LIKE ?
            ORDER BY started_at DESC
            LIMIT 5
            """,
            (f"%{entity_name}%",),
            fetch=True,
        ) or []

        if not rows:
            return ""

        lines = ["## Recent"]
        for row in rows:
            started = row["started_at"] if row["started_at"] else None
            date = started[:10] if started else "?"
            narrative = row["narrative"] if row["narrative"] else ""
            # Truncate long narratives
            if len(narrative) > 200:
                narrative = narrative[:200] + "..."
            lines.append(f"- [{date}] {narrative}")
        return "\n".join(lines)

    def export_entity(self, entity: Dict) -> Optional[Path]:
        """Export a single entity as an Obsidian note.

        Returns the path of the written file, or None on error.
        """
        entity_id = entity["id"]
        entity_name = entity["name"]
        entity_type = entity["type"]

        # Determine subdirectory
        subdir = ENTITY_TYPE_DIRS.get(entity_type, "concepts")
        target_dir = self.vault_path / subdir
        target_dir.mkdir(parents=True, exist_ok=True)

        # Fetch related data
        memories = self._get_entity_memories(entity_id)
        relationships = self._get_entity_relationships(entity_id)
        aliases = self._get_entity_aliases(entity_id)

        # Build note body (without frontmatter first, for hash calculation)
        sections = []

        # Title
        sections.append(f"# {entity_name}")

        # Description
        desc = entity["description"] if entity["description"] else None
        if desc:
            sections.append(f"\n{desc}")

        # Relationships
        rel_section = self._render_relationships_section(entity_id, relationships)
        if rel_section:
            sections.append(f"\n{rel_section}")

        # Memories
        mem_section = self._render_memories_section(memories)
        if mem_section:
            sections.append(f"\n{mem_section}")

        # Recent session mentions
        recent = self._render_recent_sessions(entity_name)
        if recent:
            sections.append(f"\n{recent}")

        body = "\n".join(sections)

        # Build frontmatter (includes sync_hash of body)
        fm_lines = ["---"]
        fm_lines.append(f"claudia_id: {entity['id']}")
        fm_lines.append(f"type: {entity_type}")
        fm_lines.append(f"canonical_name: {entity['canonical_name']}")
        fm_lines.append(f"importance: {entity['importance']}")
        fm_lines.append(f"created: {entity['created_at']}")
        fm_lines.append(f"updated: {entity['updated_at']}")
        if aliases:
            alias_str = ", ".join(aliases)
            fm_lines.append(f"aliases: [{alias_str}]")
        fm_lines.append(f"tags: [{entity_type}]")
        fm_lines.append(f"sync_hash: {_compute_sync_hash(body)}")
        fm_lines.append("---")
        frontmatter = "\n".join(fm_lines)

        full_content = f"{frontmatter}\n\n{body}\n"

        # Write file
        filename = _sanitize_filename(entity_name) + ".md"
        filepath = target_dir / filename
        try:
            filepath.write_text(full_content, encoding="utf-8")
            return filepath
        except IOError as e:
            logger.error(f"Failed to write entity note {filepath}: {e}")
            return None

    # ── Pattern export ──────────────────────────────────────────

    def _export_patterns(self) -> int:
        """Export active patterns as notes in patterns/ directory."""
        rows = self.db.execute(
            "SELECT * FROM patterns WHERE is_active = 1 ORDER BY last_observed_at DESC",
            fetch=True,
        ) or []

        count = 0
        target_dir = self.vault_path / "patterns"
        target_dir.mkdir(parents=True, exist_ok=True)

        for row in rows:
            row_keys = row.keys()
            pattern_type = row["pattern_type"] if "pattern_type" in row_keys else "pattern"
            description = row["description"] if "description" in row_keys else ""
            detected_at = row["first_observed_at"] if "first_observed_at" in row_keys else ""
            confidence = row["confidence"] if "confidence" in row_keys else 0.0

            # Build note
            lines = ["---"]
            lines.append(f"claudia_id: pattern-{row['id']}")
            lines.append(f"type: pattern")
            lines.append(f"pattern_type: {pattern_type}")
            lines.append(f"confidence: {confidence}")
            lines.append(f"detected: {detected_at}")
            lines.append("tags: [pattern]")
            lines.append("---")
            lines.append("")
            lines.append(f"# {pattern_type.replace('_', ' ').title()}")
            lines.append("")
            lines.append(description)

            # Include evidence entities if available
            evidence = row["evidence"] if "evidence" in row_keys else None
            if evidence:
                try:
                    evidence_data = json.loads(evidence)
                    if isinstance(evidence_data, dict):
                        entities = evidence_data.get("entities", [])
                        if entities:
                            lines.append("")
                            lines.append("## Related Entities")
                            for ent_name in entities:
                                lines.append(f"- [[{ent_name}]]")
                except (json.JSONDecodeError, TypeError):
                    pass

            content = "\n".join(lines) + "\n"
            slug = f"{pattern_type}-{row['id']:03d}"
            filepath = target_dir / f"{_sanitize_filename(slug)}.md"
            try:
                filepath.write_text(content, encoding="utf-8")
                count += 1
            except IOError as e:
                logger.error(f"Failed to write pattern note {filepath}: {e}")

        return count

    # ── Reflection export ───────────────────────────────────────

    def _export_reflections(self) -> int:
        """Export reflections as notes in reflections/ directory."""
        rows = self.db.execute(
            "SELECT * FROM reflections ORDER BY last_confirmed_at DESC",
            fetch=True,
        ) or []

        count = 0
        target_dir = self.vault_path / "reflections"
        target_dir.mkdir(parents=True, exist_ok=True)

        for row in rows:
            row_keys = row.keys()
            ref_type = row["reflection_type"] if "reflection_type" in row_keys else "observation"
            content = row["content"] if "content" in row_keys else ""
            importance = row["importance"] if "importance" in row_keys else 0.5
            confidence = row["confidence"] if "confidence" in row_keys else 1.0
            first_observed = row["first_observed_at"] if "first_observed_at" in row_keys else ""
            last_confirmed = row["last_confirmed_at"] if "last_confirmed_at" in row_keys else ""
            agg_count = row["aggregation_count"] if "aggregation_count" in row_keys else 1

            lines = ["---"]
            lines.append(f"claudia_id: reflection-{row['id']}")
            lines.append(f"type: reflection")
            lines.append(f"reflection_type: {ref_type}")
            lines.append(f"importance: {importance}")
            lines.append(f"confidence: {confidence}")
            lines.append(f"first_observed: {first_observed}")
            lines.append(f"last_confirmed: {last_confirmed}")
            lines.append(f"times_confirmed: {agg_count}")
            lines.append("tags: [reflection]")
            lines.append("---")
            lines.append("")
            lines.append(f"# {ref_type.title()}")
            lines.append("")
            lines.append(content)

            full_content = "\n".join(lines) + "\n"
            slug = f"{ref_type}-{row['id']:03d}"
            filepath = target_dir / f"{_sanitize_filename(slug)}.md"
            try:
                filepath.write_text(full_content, encoding="utf-8")
                count += 1
            except IOError as e:
                logger.error(f"Failed to write reflection note {filepath}: {e}")

        return count

    # ── Session log export ──────────────────────────────────────

    def _export_sessions(self, since: Optional[str] = None) -> int:
        """Export session episodes as daily notes in sessions/ directory.

        Groups episodes by date, creating one note per day.
        """
        sql = """
            SELECT id, session_id, narrative, started_at, ended_at,
                   key_topics, summary
            FROM episodes
            WHERE is_summarized = 1
        """
        params: list = []
        if since:
            sql += " AND started_at > ?"
            params.append(since)
        sql += " ORDER BY started_at DESC"

        rows = self.db.execute(sql, tuple(params), fetch=True) or []
        if not rows:
            return 0

        # Group by date
        by_date: Dict[str, List[Dict]] = {}
        for row in rows:
            started = row["started_at"] if row["started_at"] else None
            date_str = started[:10] if started else "unknown"
            by_date.setdefault(date_str, []).append(row)

        count = 0
        target_dir = self.vault_path / "sessions"
        target_dir.mkdir(parents=True, exist_ok=True)

        for date_str, episodes in by_date.items():
            lines = ["---"]
            lines.append(f"type: session-log")
            lines.append(f"date: {date_str}")
            lines.append(f"session_count: {len(episodes)}")
            lines.append("tags: [session]")
            lines.append("---")
            lines.append("")
            lines.append(f"# Sessions: {date_str}")

            for ep in episodes:
                started = ep["started_at"] if ep["started_at"] else "?"
                ended = ep["ended_at"] if ep["ended_at"] else ""

                lines.append("")
                lines.append(f"## Session at {started}")

                ep_keys = ep.keys()
                raw_topics = ep["key_topics"] if "key_topics" in ep_keys and ep["key_topics"] else None
                if raw_topics:
                    try:
                        topics = json.loads(raw_topics)
                        if topics:
                            lines.append(f"**Topics:** {', '.join(topics)}")
                    except (json.JSONDecodeError, TypeError):
                        pass

                narrative = (ep["narrative"] if "narrative" in ep_keys and ep["narrative"] else "") or \
                            (ep["summary"] if "summary" in ep_keys and ep["summary"] else "")
                if narrative:
                    lines.append("")
                    lines.append(narrative)

            content = "\n".join(lines) + "\n"
            filepath = target_dir / f"{date_str}.md"
            try:
                filepath.write_text(content, encoding="utf-8")
                count += 1
            except IOError as e:
                logger.error(f"Failed to write session note {filepath}: {e}")

        return count

    # ── Public sync methods ─────────────────────────────────────

    def export_all(self) -> Dict[str, int]:
        """Full vault rebuild from SQLite. Exports all entities, patterns,
        reflections, and sessions.

        Returns a dict with counts of exported items.
        """
        logger.info(f"Starting full vault export to {self.vault_path}")
        self._ensure_directories()

        stats = {
            "entities": 0,
            "patterns": 0,
            "reflections": 0,
            "sessions": 0,
        }

        # Export all entities
        entities = self._get_all_entities()
        for entity in entities:
            path = self.export_entity(entity)
            if path:
                stats["entities"] += 1

        # Export patterns
        stats["patterns"] = self._export_patterns()

        # Export reflections
        stats["reflections"] = self._export_reflections()

        # Export sessions
        stats["sessions"] = self._export_sessions()

        # Save metadata
        self._save_sync_metadata(stats)
        self._append_sync_log(
            f"Full sync: {stats['entities']} entities, "
            f"{stats['patterns']} patterns, "
            f"{stats['reflections']} reflections, "
            f"{stats['sessions']} session days"
        )

        logger.info(f"Full vault export complete: {stats}")
        return stats

    def export_incremental(self) -> Dict[str, int]:
        """Incremental export: only entities/sessions changed since last sync.

        Falls back to full export if no previous sync metadata exists.
        """
        last_sync = self._get_last_sync_time()
        if not last_sync:
            logger.info("No previous sync found, running full export")
            return self.export_all()

        logger.info(f"Starting incremental vault export (since {last_sync})")
        self._ensure_directories()

        stats = {
            "entities": 0,
            "patterns": 0,
            "reflections": 0,
            "sessions": 0,
        }

        # Export changed entities
        entities = self._get_all_entities(since=last_sync)
        for entity in entities:
            path = self.export_entity(entity)
            if path:
                stats["entities"] += 1

        # Patterns and reflections are always fully rebuilt (cheap operation)
        stats["patterns"] = self._export_patterns()
        stats["reflections"] = self._export_reflections()

        # Sessions since last sync
        stats["sessions"] = self._export_sessions(since=last_sync)

        self._save_sync_metadata(stats)
        self._append_sync_log(
            f"Incremental sync (since {last_sync}): "
            f"{stats['entities']} entities, "
            f"{stats['patterns']} patterns, "
            f"{stats['reflections']} reflections, "
            f"{stats['sessions']} session days"
        )

        logger.info(f"Incremental vault export complete: {stats}")
        return stats

    def get_status(self) -> Dict[str, Any]:
        """Get vault sync status information."""
        meta_path = self.vault_path / "_meta" / "last-sync.json"
        if not meta_path.exists():
            return {
                "vault_path": str(self.vault_path),
                "synced": False,
                "last_sync": None,
                "stats": None,
            }

        try:
            data = json.loads(meta_path.read_text())
            # Count files in vault
            file_counts = {}
            for subdir in ["people", "projects", "organizations", "concepts",
                           "locations", "patterns", "reflections", "sessions"]:
                d = self.vault_path / subdir
                if d.exists():
                    file_counts[subdir] = len(list(d.glob("*.md")))
                else:
                    file_counts[subdir] = 0

            return {
                "vault_path": str(self.vault_path),
                "synced": True,
                "last_sync": data.get("last_sync"),
                "stats": data.get("stats"),
                "file_counts": file_counts,
            }
        except (json.JSONDecodeError, IOError):
            return {
                "vault_path": str(self.vault_path),
                "synced": False,
                "last_sync": None,
                "stats": None,
                "error": "Could not read sync metadata",
            }


# ── Module-level convenience functions ──────────────────────────


def get_vault_path(project_id: Optional[str] = None) -> Path:
    """Compute the vault path for a project.

    Uses vault_base_dir from config, falling back to ~/.claudia/vault/.
    Path is {vault_base_dir}/{project_id}/ for project-specific vaults,
    or {vault_base_dir}/default/ for the global vault.
    """
    config = get_config()
    base_dir = getattr(config, "vault_base_dir", None)
    if base_dir is None:
        base_dir = Path.home() / ".claudia" / "vault"
    else:
        base_dir = Path(base_dir)

    folder = project_id or "default"
    return base_dir / folder


def get_vault_sync_service(project_id: Optional[str] = None, db=None) -> VaultSyncService:
    """Create a VaultSyncService for the given project."""
    vault_path = get_vault_path(project_id)
    return VaultSyncService(vault_path, db=db)


def run_vault_sync(project_id: Optional[str] = None, full: bool = False) -> Dict[str, int]:
    """Run vault sync (full or incremental).

    Args:
        project_id: Project identifier for vault path resolution.
        full: If True, force full rebuild. If False, use incremental.

    Returns:
        Dict with counts of exported items.
    """
    config = get_config()
    if not getattr(config, "vault_sync_enabled", True):
        logger.info("Vault sync is disabled in config")
        return {"skipped": True}

    svc = get_vault_sync_service(project_id)
    if full:
        return svc.export_all()
    else:
        return svc.export_incremental()
