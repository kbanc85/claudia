"""
Vault Sync Service for Claudia Memory System

Exports memory data to an Obsidian-compatible vault as markdown notes
with YAML frontmatter and [[wikilinks]]. The vault is a read projection
of SQLite data -- SQLite remains the single source of truth.

Vault structure (PARA-inspired):
  ~/.claudia/vault/{project_id}/
    Active/                   Projects with attention_tier in (active, watchlist)
    Relationships/
      people/                 Person entities (non-archived)
      organizations/          Organization entities (non-archived)
    Reference/
      concepts/               Concept entities
      locations/              Location entities
    Archive/
      people/                 Dormant or archived people
      projects/               Completed or archived projects
      organizations/          Past organizations
    Claudia's Desk/           Claudia's efficient lookup zone
      MOC-People.md           Flat tier table for quick reads
      MOC-Commitments.md      Commitment tracking table
      MOC-Projects.md         Project overview table
      patterns/               Detected pattern notes
      reflections/            Reflection notes from /meditate
      sessions/               Daily session logs (YYYY/MM/YYYY-MM-DD.md)
      _queries/               Dataview query templates
    canvases/                 Visual dashboards (human-facing)
    Home.md                   PARA-style navigation dashboard
    _meta/                    Sync metadata (last-sync.json, sync-log.md)
    .obsidian/                Obsidian config
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


def _row_get(row, key, default=None):
    """Safely get a value from a dict or sqlite3.Row.

    sqlite3.Row supports [] access and .keys() but not .get().
    This helper works for both types.
    """
    try:
        if hasattr(row, "get"):
            return row.get(key, default)
        if hasattr(row, "keys") and key in row.keys():
            val = row[key]
            return val if val is not None else default
        return default
    except (KeyError, IndexError):
        return default


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
        """Create the PARA vault directory structure."""
        dirs = [
            "Active",
            "Relationships/people", "Relationships/organizations",
            "Reference/concepts", "Reference/locations",
            "Archive/people", "Archive/projects", "Archive/organizations",
            "Claudia's Desk", "Claudia's Desk/patterns",
            "Claudia's Desk/reflections", "Claudia's Desk/sessions",
            "Claudia's Desk/_queries",
            "canvases", "_meta",
            ".obsidian", ".obsidian/snippets",
        ]
        for d in dirs:
            (self.vault_path / d).mkdir(parents=True, exist_ok=True)

    def _para_dir(self, entity_type: str, entity: Dict) -> Path:
        """Route entity to PARA folder based on type + activity status.

        Archive: explicitly archived or dormant 90+ days.
        Otherwise: route by entity type to Active/Relationships/Reference.
        """
        tier = _row_get(entity, "attention_tier") or "standard"
        trend = _row_get(entity, "contact_trend")

        # Archive: explicitly archived or dormant 90+ days
        if tier == "archive" or trend == "dormant":
            subdir = ENTITY_TYPE_DIRS.get(entity_type, "concepts")
            return self.vault_path / "Archive" / subdir

        # Route by entity type to remaining PARA buckets
        if entity_type == "project":
            return self.vault_path / "Active"
        elif entity_type == "person":
            return self.vault_path / "Relationships" / "people"
        elif entity_type == "organization":
            return self.vault_path / "Relationships" / "organizations"
        elif entity_type == "location":
            return self.vault_path / "Reference" / "locations"
        else:
            # concept and anything else
            return self.vault_path / "Reference" / "concepts"

    def _pattern_dir(self) -> Path:
        """Patterns live in Claudia's Desk."""
        return self.vault_path / "Claudia's Desk" / "patterns"

    def _reflection_dir(self) -> Path:
        """Reflections live in Claudia's Desk."""
        return self.vault_path / "Claudia's Desk" / "reflections"

    def _moc_dir(self) -> Path:
        """MOC files and Home.md live in Claudia's Desk."""
        return self.vault_path / "Claudia's Desk"

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

    def _get_vault_format_version(self) -> int:
        """Read vault format version from _meta/last-sync.json."""
        meta_path = self.vault_path / "_meta" / "last-sync.json"
        if meta_path.exists():
            try:
                data = json.loads(meta_path.read_text())
                return data.get("vault_format_version", 1)
            except (json.JSONDecodeError, IOError):
                pass
        return 0  # No sync yet

    def _save_sync_metadata(self, stats: Dict[str, Any]) -> None:
        """Write sync metadata to _meta/last-sync.json."""
        meta_path = self.vault_path / "_meta" / "last-sync.json"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        # Preserve existing keys (like canvas_hashes) if present
        existing = {}
        if meta_path.exists():
            try:
                existing = json.loads(meta_path.read_text())
            except (json.JSONDecodeError, IOError):
                pass
        existing.update({
            "last_sync": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            "vault_format_version": 2,
            "stats": stats,
        })
        meta_path.write_text(json.dumps(existing, indent=2))

    def _append_sync_log(self, message: str) -> None:
        """Append a line to _meta/sync-log.md."""
        log_path = self.vault_path / "_meta" / "sync-log.md"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with open(log_path, "a") as f:
            f.write(f"- [{timestamp}] {message}\n")

    # ── Table validation ─────────────────────────────────────────

    def _validate_markdown_tables(self, content: str) -> List[str]:
        """Scan markdown content for broken tables where header and separator
        rows are merged onto a single line.

        A valid markdown table has:
            Line 1: | Header1 | Header2 |
            Line 2: |---------|---------|
            Line 3+: | data    | data    |

        A broken table has these merged:
            | Header1 | Header2 |---------|---------|

        Returns a list of warning strings describing each broken table found.
        """
        warnings = []
        for line in content.split("\n"):
            # Look for lines that have pipe-delimited text cells followed
            # immediately by separator dashes (no newline between them).
            # Pattern: a cell with text (| word |) followed by separator (|---|)
            if re.search(
                r"\|[^|\-\n][^|\n]*\|[-\s|]{3,}",
                line,
            ) and "---" in line:
                warnings.append(
                    "Broken table detected: header and separator merged "
                    "on single line"
                )
        return warnings

    def _repair_broken_tables(self, content: str) -> str:
        """Attempt to repair broken markdown tables where header, separator,
        and optional data rows have been merged onto a single line.

        The corruption looks like:
            | Col1 | Col2 |------|------| data1 | data2 |

        Repair splits this back into proper multi-line format:
            | Col1 | Col2 |
            |------|------|
            | data1 | data2 |

        Returns the repaired content string.
        """
        repaired_lines = []
        for line in content.split("\n"):
            # Match a line that starts with header cells and then has
            # a separator portion (dashes and pipes) on the same line.
            match = re.match(
                r"^(\|[^-\n]+(?:\|[^-\n]+)*\|)([-|\s]*---[-|\s]*)(.*)$",
                line,
            )
            if not match:
                repaired_lines.append(line)
                continue

            header_part = match.group(1).strip()
            sep_raw = match.group(2).strip()
            remainder = match.group(3).strip()

            # Reconstruct a clean separator row based on the number of
            # columns in the header row.
            header_cells = [
                c.strip()
                for c in header_part.strip("|").split("|")
            ]
            col_count = len(header_cells)
            separator = "|" + "|".join(
                " " + "-" * max(len(c), 3) + " " for c in header_cells
            ) + "|"

            repaired_lines.append(header_part)
            repaired_lines.append(separator)

            # If there is leftover content after the separator, split it
            # into data rows.
            if remainder:
                data_cells = [
                    c.strip()
                    for c in remainder.strip("|").split("|")
                    if c.strip()
                ]
                for i in range(0, len(data_cells), col_count):
                    row_cells = data_cells[i : i + col_count]
                    while len(row_cells) < col_count:
                        row_cells.append("")
                    row_line = "| " + " | ".join(row_cells) + " |"
                    repaired_lines.append(row_line)

        return "\n".join(repaired_lines)

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

    def _build_frontmatter(self, entity: Dict, aliases: List[str],
                            sync_hash: str = "") -> str:
        """Build YAML frontmatter for an entity note.

        Includes contact velocity fields, compound tags for graph filtering,
        and cssclasses for per-type CSS styling in Obsidian.
        """
        etype = entity["type"]

        lines = ["---"]
        lines.append(f"claudia_id: {entity['id']}")
        lines.append(f"type: {etype}")
        # Quoted name for YAML safety (handles colons, special chars)
        lines.append(f'name: "{entity["name"]}"')
        lines.append(f"importance: {entity['importance']}")

        # Contact velocity fields (from entities table)
        attention_tier = _row_get(entity, "attention_tier")
        if attention_tier:
            lines.append(f"attention_tier: {attention_tier}")

        contact_trend = _row_get(entity, "contact_trend")
        if contact_trend:
            lines.append(f"contact_trend: {contact_trend}")

        freq = _row_get(entity, "contact_frequency_days")
        if freq is not None:
            lines.append(f"contact_frequency_days: {freq}")

        last_contact = _row_get(entity, "last_contact_at")
        if last_contact:
            # Date-only for cleaner display
            lines.append(f"last_contact: {last_contact[:10]}")

        lines.append(f"created: {entity['created_at']}")
        lines.append(f"updated: {entity['updated_at']}")

        # Aliases as proper YAML list
        if aliases:
            lines.append("aliases:")
            for alias in aliases:
                lines.append(f'  - "{alias}"')

        # Compound tags: [type, tier, trend] for graph filtering
        tags = [etype]
        if attention_tier and attention_tier != "standard":
            tags.append(attention_tier)
        if contact_trend:
            tags.append(contact_trend)
        lines.append(f"tags:")
        for tag in tags:
            lines.append(f"  - {tag}")

        # CSS classes for per-type styling
        lines.append(f"cssclasses:")
        lines.append(f"  - entity-{etype}")

        if sync_hash:
            lines.append(f"sync_hash: {sync_hash}")

        lines.append("---")
        return "\n".join(lines)

    def _render_status_callout(self, entity: Dict) -> str:
        """Render a status callout box at the top of person/project notes.

        Shows attention tier, trend, last contact, frequency, and importance
        in a compact Obsidian callout block.
        """
        etype = entity["type"]

        if etype == "person":
            attention = _row_get(entity, "attention_tier")
            trend = _row_get(entity, "contact_trend")
            last_contact = _row_get(entity, "last_contact_at")
            freq = _row_get(entity, "contact_frequency_days")
            importance = _row_get(entity, "importance", 0)

            # Only render if we have at least some contact data
            if not attention and not trend and not last_contact:
                return ""

            parts_line1 = []
            if attention:
                parts_line1.append(f"**Attention:** {attention.title()}")
            if trend:
                parts_line1.append(f"**Trend:** {trend.title()}")
            if last_contact:
                # Format as readable date
                date_str = last_contact[:10]
                try:
                    dt = datetime.fromisoformat(date_str)
                    date_str = dt.strftime("%b %d, %Y")
                except (ValueError, TypeError):
                    pass
                parts_line1.append(f"**Last Contact:** {date_str}")

            parts_line2 = []
            if freq is not None:
                parts_line2.append(f"**Frequency:** Every ~{freq:.0f} days")
            parts_line2.append(f"**Importance:** {importance}")

            lines = ["> [!info] Status"]
            lines.append(f"> {' | '.join(parts_line1)}")
            if parts_line2:
                lines.append(f"> {' | '.join(parts_line2)}")
            return "\n".join(lines)

        elif etype == "project":
            # Project variant: connected people count
            entity_id = entity["id"]
            people_count = self.db.execute(
                """
                SELECT COUNT(DISTINCT e.id) as cnt
                FROM entities e
                JOIN relationships r ON (
                    (r.source_entity_id = ? AND r.target_entity_id = e.id) OR
                    (r.target_entity_id = ? AND r.source_entity_id = e.id)
                )
                WHERE e.type = 'person' AND e.deleted_at IS NULL AND r.invalid_at IS NULL
                """,
                (entity_id, entity_id),
                fetch=True,
            )
            pcount = people_count[0]["cnt"] if people_count else 0

            commitment_count = self.db.execute(
                """
                SELECT COUNT(*) as cnt FROM memories m
                JOIN memory_entities me ON m.id = me.memory_id
                WHERE me.entity_id = ? AND m.type = 'commitment' AND m.invalidated_at IS NULL
                """,
                (entity_id,),
                fetch=True,
            )
            ccount = commitment_count[0]["cnt"] if commitment_count else 0

            lines = ["> [!info] Status"]
            lines.append(f"> **People:** {pcount} connected | **Open Commitments:** {ccount} | **Importance:** {entity['importance']}")
            return "\n".join(lines)

        return ""

    def _render_relationships_section(
        self, entity_id: int, relationships: List[Dict]
    ) -> str:
        """Render the relationships section as a scannable markdown table."""
        if not relationships:
            return ""

        lines = ["## Relationships", ""]
        lines.append("| Connection | Type | Strength |")
        lines.append("|------------|------|----------|")
        for rel in relationships:
            # Determine the "other" entity relative to this one
            if rel["source_entity_id"] == entity_id:
                other_name = rel["target_name"]
            else:
                other_name = rel["source_name"]

            rel_type = rel["relationship_type"]
            strength = rel["strength"]
            lines.append(f"| [[{other_name}]] | {rel_type} | {strength} |")
        return "\n".join(lines)

    def _render_memories_section(self, memories: List[Dict]) -> str:
        """Render memories grouped by verification status with Obsidian callouts.

        Commitments get checkboxes. Other memories are split into verified
        (note callout) and unverified (warning callout) groups for trust visibility.
        """
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

        # Split remaining memories by verification status
        verified = []
        unverified = []
        for mtype, mems in by_type.items():
            for m in mems:
                row_keys = m.keys() if hasattr(m, "keys") else []
                vstatus = m["verification_status"] if "verification_status" in row_keys and m["verification_status"] else "pending"
                origin = m["origin_type"] if "origin_type" in row_keys and m["origin_type"] else ""
                confidence = m["confidence"] if "confidence" in row_keys else 1.0

                detail_parts = []
                if origin:
                    detail_parts.append(f"source: {origin}")
                if confidence is not None and confidence < 1.0:
                    detail_parts.append(f"confidence: {confidence}")
                detail = f" ({', '.join(detail_parts)})" if detail_parts else ""
                entry = f"- {m['content']}{detail}"

                if vstatus == "verified" or origin == "user_stated":
                    verified.append(entry)
                else:
                    unverified.append(entry)

        lines.append("")
        lines.append("## Key Facts")
        if verified:
            lines.append("")
            lines.append("> [!note] Verified")
            for entry in verified:
                lines.append(f"> {entry}")

        if unverified:
            lines.append("")
            lines.append("> [!warning] Unverified")
            for entry in unverified:
                lines.append(f"> {entry}")

        if not verified and not unverified:
            lines.append("")
            lines.append("*No facts recorded yet.*")

        return "\n".join(lines)

    def _render_recent_sessions(self, entity_name: str) -> str:
        """Render recent session mentions as Obsidian callout blocks."""
        rows = self.db.execute(
            """
            SELECT id, narrative, started_at
            FROM episodes
            WHERE is_summarized = 1
              AND narrative LIKE ?
            ORDER BY started_at DESC
            LIMIT 10
            """,
            (f"%{entity_name}%",),
            fetch=True,
        ) or []

        if not rows:
            return ""

        lines = ["## Recent Interactions"]
        for row in rows:
            started = row["started_at"] if row["started_at"] else None
            date = started[:10] if started else "?"
            # Format date nicely
            try:
                dt = datetime.fromisoformat(date)
                date_display = dt.strftime("%b %d, %Y")
            except (ValueError, TypeError):
                date_display = date
            narrative = row["narrative"] if row["narrative"] else ""
            if len(narrative) > 300:
                narrative = narrative[:300] + "..."
            lines.append("")
            lines.append(f"> [!example] {date_display}")
            # Wrap narrative lines with > prefix for callout
            for nline in narrative.split("\n"):
                lines.append(f"> {nline}")
        return "\n".join(lines)

    def _get_related_patterns(self, entity_id: int) -> List[Dict]:
        """Fetch active patterns that reference this entity in their evidence."""
        try:
            rows = self.db.execute(
                """
                SELECT DISTINCT p.id, p.description, p.pattern_type, p.confidence
                FROM patterns p
                WHERE p.is_active = 1
                  AND p.evidence LIKE ?
                LIMIT 5
                """,
                (f"%{entity_id}%",),
                fetch=True,
            ) or []
        except Exception:
            rows = []
        return rows

    def _render_related_patterns(self, patterns: List[Dict]) -> str:
        """Render a 'Related Patterns' section with wikilinks to pattern notes."""
        if not patterns:
            return ""
        lines = ["## Related Patterns", ""]
        for p in patterns:
            ptype = p["pattern_type"] if p["pattern_type"] else "pattern"
            confidence = p["confidence"] if p["confidence"] else 0.0
            pid = p["id"]
            slug = f"{ptype}-{pid:03d}"
            lines.append(
                f"- [[{_sanitize_filename(slug)}]] "
                f"- *{ptype}* (confidence: {confidence:.2f})"
            )
        return "\n".join(lines)

    def export_entity(self, entity: Dict) -> Optional[Path]:
        """Export a single entity as an Obsidian note.

        Returns the path of the written file, or None on error.
        """
        entity_id = entity["id"]
        entity_name = entity["name"]
        entity_type = entity["type"]

        # Determine subdirectory via PARA routing
        target_dir = self._para_dir(entity_type, entity)
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

        # Status callout (person/project only)
        status = self._render_status_callout(entity)
        if status:
            sections.append(f"\n{status}")

        # Relationships (table format)
        rel_section = self._render_relationships_section(entity_id, relationships)
        if rel_section:
            sections.append(f"\n{rel_section}")

        # Memories (verification-grouped callouts)
        mem_section = self._render_memories_section(memories)
        if mem_section:
            sections.append(f"\n{mem_section}")

        # Recent session mentions (callout timeline)
        recent = self._render_recent_sessions(entity_name)
        if recent:
            sections.append(f"\n{recent}")

        # Related patterns backlinks
        related_patterns = self._get_related_patterns(entity_id)
        if related_patterns:
            sections.append(f"\n{self._render_related_patterns(related_patterns)}")

        # Sync footer
        sync_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        sections.append(f"\n---\n*Last synced: {sync_time}*")

        body = "\n".join(sections)

        # Build frontmatter using consolidated method (includes sync_hash)
        frontmatter = self._build_frontmatter(
            entity, aliases, sync_hash=_compute_sync_hash(body)
        )

        full_content = f"{frontmatter}\n\n{body}\n"

        # Write file
        filename = _sanitize_filename(entity_name) + ".md"
        filepath = target_dir / filename
        try:
            filepath.write_text(full_content, encoding="utf-8")
            # Validate markdown tables in the exported note
            table_warnings = self._validate_markdown_tables(full_content)
            for warning in table_warnings:
                logger.warning("%s in %s", warning, filepath.name)
            return filepath
        except IOError as e:
            logger.error(f"Failed to write entity note {filepath}: {e}")
            return None

    def export_entity_by_name(self, name: str) -> Optional[Path]:
        """Export a single entity by canonical name lookup.

        Convenience method for real-time write-through: looks up the entity
        by name and exports it. Returns the path of the written file, or None.
        """
        from ..extraction.entity_extractor import get_extractor
        extractor = get_extractor()
        canonical = extractor.canonical_name(name)

        entity = self.db.get_one(
            "entities",
            where="canonical_name = ? AND deleted_at IS NULL",
            where_params=(canonical,),
        )
        if not entity:
            # Try alias lookup
            alias_row = self.db.get_one(
                "entity_aliases",
                where="canonical_alias = ?",
                where_params=(canonical,),
            )
            if alias_row:
                entity = self.db.get_one(
                    "entities",
                    where="id = ? AND deleted_at IS NULL",
                    where_params=(alias_row["entity_id"],),
                )

        if entity:
            self._ensure_directories()
            return self.export_entity(entity)
        return None

    def export_entity_by_id(self, entity_id: int) -> Optional[Path]:
        """Export a single entity by ID.

        Direct ID-based export for cases where the entity ID is already known.
        Returns the path of the written file, or None.
        """
        entity = self.db.get_one(
            "entities",
            where="id = ? AND deleted_at IS NULL",
            where_params=(entity_id,),
        )
        if entity:
            self._ensure_directories()
            return self.export_entity(entity)
        return None

    # ── Pattern export ──────────────────────────────────────────

    def _export_patterns(self) -> int:
        """Export active patterns as notes in patterns/ directory."""
        rows = self.db.execute(
            "SELECT * FROM patterns WHERE is_active = 1 ORDER BY last_observed_at DESC",
            fetch=True,
        ) or []

        count = 0
        target_dir = self._pattern_dir()
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
                        # Also try entity_ids for typed wikilinks
                        entity_ids = evidence_data.get("entity_ids", [])
                        if entity_ids and not entities:
                            ent_links = []
                            for eid in entity_ids[:5]:
                                ent_row = self.db.execute(
                                    "SELECT name FROM entities WHERE id = ? AND deleted_at IS NULL",
                                    (eid,),
                                    fetch=True,
                                )
                                if ent_row:
                                    # Use simple wikilinks (Obsidian resolves by filename)
                                    ent_links.append(f"[[{ent_row[0]['name']}]]")
                            if ent_links:
                                if not entities:
                                    lines.append("")
                                    lines.append("## Related Entities")
                                for link in ent_links:
                                    lines.append(f"- {link}")
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
        target_dir = self._reflection_dir()
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

    def _wikify_narrative(self, narrative: str) -> str:
        """Wrap known entity names in a narrative with [[wikilinks]].

        This is what makes the graph view show session-to-entity connections.
        Fetches all non-deleted entity names and wraps exact matches.
        """
        if not narrative:
            return narrative

        # Cache entity names if not already cached
        if not hasattr(self, "_entity_names_cache"):
            rows = self.db.execute(
                "SELECT name FROM entities WHERE deleted_at IS NULL ORDER BY LENGTH(name) DESC",
                fetch=True,
            ) or []
            # Sort by length DESC so longer names match first (e.g., "Sarah Chen" before "Sarah")
            self._entity_names_cache = [r["name"] for r in rows]

        result = narrative
        for name in self._entity_names_cache:
            # Only wrap if not already inside a [[wikilink]]
            if name in result and f"[[{name}]]" not in result:
                result = result.replace(name, f"[[{name}]]")
        return result

    def _export_sessions(self, since: Optional[str] = None) -> int:
        """Export session episodes as daily notes in hierarchical sessions/ directory.

        Groups episodes by date. Uses sessions/YYYY/MM/YYYY-MM-DD.md path
        structure to prevent flat folder with hundreds of files.
        Narratives are wikified to create graph connections.
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

        for date_str, episodes in by_date.items():
            lines = ["---"]
            lines.append(f"type: session-log")
            lines.append(f"date: {date_str}")
            lines.append(f"session_count: {len(episodes)}")
            lines.append("tags:")
            lines.append("  - session")
            lines.append("---")
            lines.append("")
            lines.append(f"# Sessions: {date_str}")

            for ep in episodes:
                started = ep["started_at"] if ep["started_at"] else "?"

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
                    # Wikify entity names in narratives
                    narrative = self._wikify_narrative(narrative)
                    lines.append("")
                    lines.append(narrative)

            content = "\n".join(lines) + "\n"

            # Hierarchical path: Claudia's Desk/sessions/YYYY/MM/YYYY-MM-DD.md
            desk = self.vault_path / "Claudia's Desk" / "sessions"
            if date_str != "unknown" and len(date_str) >= 7:
                year = date_str[:4]
                month = date_str[5:7]
                target_dir = desk / year / month
            else:
                target_dir = desk
            target_dir.mkdir(parents=True, exist_ok=True)

            filepath = target_dir / f"{date_str}.md"
            try:
                filepath.write_text(content, encoding="utf-8")
                count += 1
            except IOError as e:
                logger.error(f"Failed to write session note {filepath}: {e}")

        return count

    # ── Dataview templates ──────────────────────────────────────

    def _export_dataview_templates(self) -> int:
        """Generate starter Dataview query notes in _queries/.

        These are created once and never overwritten (user may customize).
        Returns count of templates created.
        """
        queries_dir = self.vault_path / "Claudia's Desk" / "_queries"
        queries_dir.mkdir(parents=True, exist_ok=True)
        created = 0

        dv_tip = "> [!tip] This query requires the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin.\n"
        templates = {
            "Upcoming Deadlines.md": (
                "# Upcoming Deadlines\n\n"
                "Commitments sorted by deadline date.\n\n"
                "```dataview\n"
                "TABLE type, importance\n"
                "FROM \"Active\" OR \"Relationships\" OR \"Archive\"\n"
                "WHERE contains(file.content, \"- [ ]\")\n"
                "SORT importance DESC\n"
                "```\n\n" + dv_tip
            ),
            "Cooling Relationships.md": (
                "# Cooling Relationships\n\n"
                "People with decelerating or dormant contact trends.\n\n"
                "```dataview\n"
                "TABLE contact_trend, last_contact, importance\n"
                "FROM \"Relationships/people\" OR \"Archive/people\"\n"
                "WHERE contact_trend = \"decelerating\" OR contact_trend = \"dormant\"\n"
                "SORT last_contact ASC\n"
                "```\n\n" + dv_tip
            ),
            "Active Network.md": (
                "# Active Network\n\n"
                "People in the active attention tier.\n\n"
                "```dataview\n"
                "TABLE contact_trend, last_contact, contact_frequency_days, importance\n"
                "FROM \"Relationships/people\"\n"
                "WHERE attention_tier = \"active\"\n"
                "SORT importance DESC\n"
                "```\n\n" + dv_tip
            ),
            "Recent Memories.md": (
                "# Recent Memories\n\n"
                "What Claudia learned this week.\n\n"
                "```dataview\n"
                "TABLE type, importance, created\n"
                "FROM \"Active\" OR \"Relationships\" OR \"Reference\"\n"
                "WHERE date(created) >= date(today) - dur(7 days)\n"
                "SORT created DESC\n"
                "LIMIT 50\n"
                "```\n\n" + dv_tip
            ),
            "Open Commitments.md": (
                "# Open Commitments\n\n"
                "All tracked commitments across entities.\n\n"
                "```dataview\n"
                "TASK\n"
                "FROM \"Active\" OR \"Relationships\"\n"
                "WHERE !completed\n"
                "SORT file.name ASC\n"
                "```\n\n" + dv_tip
            ),
            "Entity Overview.md": (
                "# Entity Overview\n\n"
                "All entities grouped by type and sorted by importance.\n\n"
                "```dataview\n"
                "TABLE type, attention_tier, contact_trend, importance\n"
                "FROM \"Active\" OR \"Relationships\" OR \"Reference\" OR \"Archive\"\n"
                "SORT type ASC, importance DESC\n"
                "```\n\n" + dv_tip
            ),
            "Session Log.md": (
                "# Session Log\n\n"
                "Recent conversation sessions.\n\n"
                "```dataview\n"
                "TABLE date, session_count\n"
                "FROM \"Claudia's Desk/sessions\"\n"
                "SORT date DESC\n"
                "LIMIT 30\n"
                "```\n\n" + dv_tip
            ),
        }

        for filename, content in templates.items():
            filepath = queries_dir / filename
            if not filepath.exists():
                try:
                    filepath.write_text(content, encoding="utf-8")
                    created += 1
                except IOError as e:
                    logger.error(f"Failed to write Dataview template {filepath}: {e}")

        if created:
            logger.info(f"Created {created} Dataview query templates in Claudia's Desk/_queries/")
        return created

    # ── Home dashboard & MOC indices ─────────────────────────────

    def _export_home_dashboard(self) -> None:
        """Generate Home.md as a PARA-style navigation dashboard.

        Written to vault root (not Claudia's Desk) since it's the
        human-facing entry point. Always regenerated on sync.
        """
        lines = ["# Home"]
        lines.append("")

        # Active Projects section
        active_projects = self.db.execute(
            """
            SELECT name, attention_tier, importance
            FROM entities
            WHERE type = 'project' AND deleted_at IS NULL
              AND (attention_tier IN ('active', 'watchlist') OR attention_tier IS NULL)
              AND COALESCE(contact_trend, '') != 'dormant'
            ORDER BY importance DESC
            LIMIT 15
            """,
            fetch=True,
        ) or []

        lines.append("## Active Projects")
        if active_projects:
            lines.append("")
            for p in active_projects:
                tier = p["attention_tier"] or "standard"
                lines.append(f"- [[{p['name']}]] ({tier})")
        else:
            lines.append("")
            lines.append("*No active projects yet.*")

        # Relationships
        people_count = self.db.execute(
            "SELECT COUNT(*) as c FROM entities WHERE type = 'person' AND deleted_at IS NULL",
            fetch=True,
        ) or []
        org_count = self.db.execute(
            "SELECT COUNT(*) as c FROM entities WHERE type = 'organization' AND deleted_at IS NULL",
            fetch=True,
        ) or []
        pc = people_count[0]["c"] if people_count else 0
        oc = org_count[0]["c"] if org_count else 0

        lines.append("")
        lines.append("## Relationships")
        lines.append("")
        lines.append(f"- [[Relationships/people/|People]] ({pc} tracked)")
        lines.append(f"- [[Relationships/organizations/|Organizations]] ({oc} tracked)")

        # Needs attention
        watchlist = self.db.execute(
            """
            SELECT name, contact_trend, last_contact_at
            FROM entities
            WHERE deleted_at IS NULL
              AND type = 'person'
              AND (attention_tier = 'watchlist'
                   OR contact_trend IN ('decelerating', 'dormant'))
              AND importance > 0.3
            ORDER BY last_contact_at ASC NULLS FIRST
            LIMIT 8
            """,
            fetch=True,
        ) or []

        if watchlist:
            lines.append("")
            lines.append("### Needs Attention")
            lines.append("")
            for w in watchlist:
                trend = w["contact_trend"] or "watch"
                last = w["last_contact_at"]
                if last:
                    try:
                        days_ago = (datetime.utcnow() - datetime.fromisoformat(last[:19])).days
                        lines.append(f"- [[{w['name']}]] - {trend} ({days_ago}d)")
                    except (ValueError, TypeError):
                        lines.append(f"- [[{w['name']}]] - {trend}")
                else:
                    lines.append(f"- [[{w['name']}]] - {trend}")

        # Quick Links
        lines.append("")
        lines.append("## Quick Links")
        lines.append("")
        lines.append("- [[Claudia's Desk/MOC-Commitments|Open Commitments]]")
        lines.append("- [[Claudia's Desk/MOC-People|Relationship Map]]")
        lines.append("- [[Claudia's Desk/MOC-Projects|Project Overview]]")
        lines.append("- [[Reference/|Reference Materials]]")
        lines.append("- [[Archive/|Archive]]")

        # Recent activity
        recent_sessions = self.db.execute(
            """
            SELECT started_at, narrative FROM episodes
            WHERE is_summarized = 1 AND narrative IS NOT NULL
            ORDER BY started_at DESC LIMIT 5
            """,
            fetch=True,
        ) or []

        if recent_sessions:
            lines.append("")
            lines.append("## Recent Activity")
            lines.append("")
            lines.append("| Date | Summary |")
            lines.append("|------|---------|")
            for s in recent_sessions:
                date = s["started_at"][:10] if s["started_at"] else "?"
                narrative = s["narrative"] or ""
                if len(narrative) > 80:
                    narrative = narrative[:80] + "..."
                narrative = self._wikify_narrative(narrative)
                lines.append(f"| {date} | {narrative} |")

        # Footer
        sync_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        lines.append(f"\n---\n*Last synced: {sync_time}*")

        content = "\n".join(lines) + "\n"
        # Home.md lives at vault root (human-facing entry point)
        filepath = self.vault_path / "Home.md"
        filepath.write_text(content, encoding="utf-8")

    def _export_moc_indices(self) -> None:
        """Generate _Index.md files in PARA entity directories.

        Creates indices in Relationships/people/, Relationships/organizations/,
        Active/, Reference/concepts/, Reference/locations/ with tables
        grouped by attention_tier for quick overview.
        """
        # Map PARA directories to the entity types they contain
        para_indices = {
            "Relationships/people": ("person", "People"),
            "Relationships/organizations": ("organization", "Organizations"),
            "Active": ("project", "Active Projects"),
            "Reference/concepts": ("concept", "Concepts"),
            "Reference/locations": ("location", "Locations"),
        }

        for para_path, (etype, title) in para_indices.items():
            # For Active projects, exclude archived/dormant
            if para_path == "Active":
                entities = self.db.execute(
                    """
                    SELECT name, importance, attention_tier, contact_trend, last_contact_at
                    FROM entities
                    WHERE type = ? AND deleted_at IS NULL
                      AND COALESCE(attention_tier, 'standard') != 'archive'
                      AND COALESCE(contact_trend, '') != 'dormant'
                    ORDER BY importance DESC
                    """,
                    (etype,),
                    fetch=True,
                ) or []
            else:
                # For Relationships/Reference, exclude archived/dormant (those go to Archive/)
                entities = self.db.execute(
                    """
                    SELECT name, importance, attention_tier, contact_trend, last_contact_at
                    FROM entities
                    WHERE type = ? AND deleted_at IS NULL
                      AND COALESCE(attention_tier, 'standard') != 'archive'
                      AND COALESCE(contact_trend, '') != 'dormant'
                    ORDER BY importance DESC
                    """,
                    (etype,),
                    fetch=True,
                ) or []

            lines = ["---"]
            lines.append("tags:")
            lines.append("  - moc")
            lines.append("cssclasses:")
            lines.append("  - moc-index")
            lines.append("---")
            lines.append("")
            lines.append(f"# {title}")

            if not entities:
                lines.append("")
                lines.append(f"*No {etype} entities tracked yet.*")
            else:
                # Group by attention tier
                tiers: Dict[str, List[Dict]] = {}
                for e in entities:
                    tier = e["attention_tier"] or "standard"
                    tiers.setdefault(tier, []).append(e)

                tier_order = ["active", "watchlist", "standard"]
                for tier in tier_order:
                    tier_entities = tiers.pop(tier, [])
                    if not tier_entities:
                        continue

                    lines.append("")
                    lines.append(f"## {tier.title()}")
                    lines.append("")

                    if etype == "person":
                        lines.append("| Name | Trend | Last Contact | Importance |")
                        lines.append("|------|-------|-------------|-----------|")
                        for e in tier_entities:
                            trend = e["contact_trend"] or "-"
                            last = e["last_contact_at"][:10] if e["last_contact_at"] else "-"
                            lines.append(f"| [[{e['name']}]] | {trend} | {last} | {e['importance']} |")
                    else:
                        lines.append("| Name | Importance |")
                        lines.append("|------|-----------|")
                        for e in tier_entities:
                            lines.append(f"| [[{e['name']}]] | {e['importance']} |")

                # Any remaining tiers
                for tier, tier_entities in tiers.items():
                    lines.append("")
                    lines.append(f"## {tier.title()}")
                    lines.append("")
                    lines.append("| Name | Importance |")
                    lines.append("|------|-----------|")
                    for e in tier_entities:
                        lines.append(f"| [[{e['name']}]] | {e['importance']} |")

            content = "\n".join(lines) + "\n"
            target_dir = self.vault_path / para_path
            target_dir.mkdir(parents=True, exist_ok=True)
            filepath = target_dir / "_Index.md"
            filepath.write_text(content, encoding="utf-8")

    # ── Obsidian config ────────────────────────────────────────

    def _export_obsidian_config(self) -> None:
        """Create .obsidian/ configuration files for graph colors, CSS, and workspace.

        Idempotent: only writes files that don't already exist, so user
        customizations in .obsidian/ are never overwritten.
        """
        obsidian_dir = self.vault_path / ".obsidian"
        obsidian_dir.mkdir(parents=True, exist_ok=True)

        # graph.json -- Color groups by entity type tag
        graph_path = obsidian_dir / "graph.json"
        if not graph_path.exists():
            graph_config = {
                "collapse-filter": False,
                "search": "",
                "showTags": False,
                "showAttachments": False,
                "hideUnresolved": True,
                "showOrphan": False,
                "collapse-color-groups": False,
                "colorGroups": [
                    {"query": "tag:#person", "color": {"a": 1, "rgb": 5025616}},      # green
                    {"query": "tag:#project", "color": {"a": 1, "rgb": 14701138}},     # red
                    {"query": "tag:#organization", "color": {"a": 1, "rgb": 11141375}},# purple
                    {"query": "tag:#concept", "color": {"a": 1, "rgb": 65535}},        # cyan
                    {"query": "tag:#session", "color": {"a": 1, "rgb": 10066329}},     # gray
                    {"query": "tag:#pattern", "color": {"a": 1, "rgb": 16744448}},     # orange
                    {"query": "tag:#moc", "color": {"a": 1, "rgb": 16776960}},         # yellow
                ],
                "collapse-display": False,
                "showArrow": True,
                "textFadeMultiplier": -3,
                "nodeSizeMultiplier": 1,
                "lineSizeMultiplier": 1,
                "collapse-forces": False,
                "centerStrength": 0.5,
                "repelStrength": 10,
                "linkStrength": 1,
                "linkDistance": 250,
                "scale": 1,
                "close": False,
            }
            graph_path.write_text(json.dumps(graph_config, indent=2), encoding="utf-8")

        # snippets/claudia-theme.css -- Visual identity
        snippets_dir = obsidian_dir / "snippets"
        snippets_dir.mkdir(parents=True, exist_ok=True)
        css_path = snippets_dir / "claudia-theme.css"
        if not css_path.exists():
            css_content = """\
/* Claudia Vault Theme */

/* Entity type emoji prefixes in Reading View */
.entity-person .inline-title::before { content: "\\01F464 "; }
.entity-project .inline-title::before { content: "\\01F4C1 "; }
.entity-organization .inline-title::before { content: "\\01F3E2 "; }
.entity-concept .inline-title::before { content: "\\01F4A1 "; }
.entity-location .inline-title::before { content: "\\01F4CD "; }

/* Tag color pills matching graph colors */
.tag[href="#person"] { background-color: #4CAF50; color: white; }
.tag[href="#project"] { background-color: #E05252; color: white; }
.tag[href="#organization"] { background-color: #AA00FF; color: white; }
.tag[href="#concept"] { background-color: #00BCD4; color: white; }
.tag[href="#session"] { background-color: #999999; color: white; }
.tag[href="#pattern"] { background-color: #FF9800; color: white; }
.tag[href="#moc"] { background-color: #FFEB3B; color: #333; }
.tag[href="#active"] { background-color: #4CAF50; color: white; }
.tag[href="#watchlist"] { background-color: #FF9800; color: white; }
.tag[href="#dormant"] { background-color: #999999; color: white; }
.tag[href="#decelerating"] { background-color: #E05252; color: white; }

/* MOC index styling */
.moc-index h1 { text-align: center; font-size: 2em; }

/* Compact frontmatter panel */
.metadata-container { font-size: 0.85em; }
"""
            css_path.write_text(css_content, encoding="utf-8")

        # app.json -- Enable CSS snippets, readable line length, show frontmatter
        app_path = obsidian_dir / "app.json"
        if not app_path.exists():
            app_config = {
                "readableLineLength": True,
                "showFrontmatter": True,
                "livePreview": True,
            }
            app_path.write_text(json.dumps(app_config, indent=2), encoding="utf-8")

        # appearance.json -- Enable the CSS snippet
        appearance_path = obsidian_dir / "appearance.json"
        if not appearance_path.exists():
            appearance_config = {
                "enabledCssSnippets": ["claudia-theme"],
            }
            appearance_path.write_text(json.dumps(appearance_config, indent=2), encoding="utf-8")

        # workspace.json -- Open Home.md on first launch with graph in right sidebar
        workspace_path = obsidian_dir / "workspace.json"
        if not workspace_path.exists():
            workspace_config = {
                "main": {
                    "id": "main",
                    "type": "split",
                    "children": [
                        {
                            "id": "editor",
                            "type": "tabs",
                            "children": [
                                {
                                    "id": "home-tab",
                                    "type": "leaf",
                                    "state": {
                                        "type": "markdown",
                                        "state": {
                                            "file": "Home.md",
                                            "mode": "preview",
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                    "direction": "horizontal",
                },
                "active": "home-tab",
            }
            workspace_path.write_text(json.dumps(workspace_config, indent=2), encoding="utf-8")

    def _check_obsidian_rest_api(self) -> bool:
        """Check if Obsidian Local REST API plugin is running.

        Pings localhost on the configured port to detect the plugin.
        Returns True if available, False otherwise.
        """
        config = get_config()
        if not getattr(config, "obsidian_rest_api_enabled", False):
            return False

        port = getattr(config, "obsidian_rest_api_port", 27124)
        try:
            import httpx
            resp = httpx.get(f"https://localhost:{port}/", timeout=2, verify=False)
            return resp.status_code in (200, 401)  # 401 means plugin is there but needs auth
        except Exception:
            return False

    # ── MOC generators ──────────────────────────────────────────

    def _generate_moc_people(self) -> str:
        """Generate MOC-People.md -- relationship health map for Claudia's read layer.

        Pre-computed markdown Claudia can read instead of calling memory.graph op=network.
        Organized by attention tier for quick scanning.
        """
        from datetime import datetime as _dt

        timestamp = _dt.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        lines = ["# People — Health Map", "", f"> Last updated: {timestamp}", ""]

        # Query all people with tier/trend/last_contact
        people = self.db.execute(
            """
            SELECT id, name, attention_tier, contact_trend, last_contact_at
            FROM entities
            WHERE type = 'person' AND deleted_at IS NULL AND importance > 0.05
            ORDER BY importance DESC
            """,
            fetch=True,
        ) or []

        if not people:
            lines.append("*No people tracked yet.*")
            lines.append(f"\n---\n*Last updated: {timestamp}*")
            return "\n".join(lines)

        # Group by tier
        tiers: Dict[str, List] = {"active": [], "watchlist": [], "standard": [], "archive": []}
        for p in people:
            tier = (p["attention_tier"] or "standard").lower()
            if tier not in tiers:
                tier = "standard"
            tiers[tier].append(p)

        tier_config = [
            ("active", "🔴 Active (needs attention now)"),
            ("watchlist", "🟡 Watchlist (declining attention)"),
            ("standard", "⚪ Standard"),
            ("archive", "🔵 Archive (dormant 90+ days)"),
        ]

        now = datetime.utcnow()

        for tier_key, tier_heading in tier_config:
            tier_people = tiers.get(tier_key, [])
            if not tier_people:
                continue

            lines.append(f"## {tier_heading}")
            lines.append("")
            lines.append("| Name | Last Contact | Trend | Open Commitments |")
            lines.append("|------|-------------|-------|-----------------|")

            for p in tier_people:
                # Last contact days
                last_contact = p["last_contact_at"]
                if last_contact:
                    try:
                        dt = datetime.fromisoformat(last_contact[:19])
                        days_ago = (now - dt).days
                        last_str = f"{days_ago}d ago"
                    except (ValueError, TypeError):
                        last_str = last_contact[:10]
                else:
                    last_str = "-"

                trend = p["contact_trend"] or "-"

                # Count open commitments
                comm_rows = self.db.execute(
                    """
                    SELECT COUNT(*) as cnt FROM memories m
                    JOIN memory_entities me ON m.id = me.memory_id
                    WHERE me.entity_id = ? AND m.type = 'commitment' AND m.invalidated_at IS NULL
                    """,
                    (p["id"],),
                    fetch=True,
                )
                comm_count = comm_rows[0]["cnt"] if comm_rows else 0

                lines.append(
                    f"| [[people/{_sanitize_filename(p['name'])}]] | {last_str} | {trend} | {comm_count} |"
                )

            lines.append("")

        lines.append(f"---\n*Last updated: {timestamp}*")
        return "\n".join(lines)

    def _generate_moc_commitments(self) -> str:
        """Generate MOC-Commitments.md -- open commitments overview for Claudia's read layer.

        Pre-computed markdown Claudia can read instead of calling memory.recall type=commitment.
        Organized by urgency: overdue, due this week, open, recently completed.
        """
        from datetime import datetime as _dt

        timestamp = _dt.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        lines = ["# Open Commitments", "", f"> Last updated: {timestamp}", ""]

        def _get_commitments(sql, params=()):
            rows = self.db.execute(sql, params, fetch=True) or []
            result = []
            for row in rows:
                # Get entity names
                ent_rows = self.db.execute(
                    """
                    SELECT e.name, e.type FROM entities e
                    JOIN memory_entities me ON e.id = me.entity_id
                    WHERE me.memory_id = ? AND e.deleted_at IS NULL
                    LIMIT 3
                    """,
                    (row["id"],),
                    fetch=True,
                ) or []
                entities = ent_rows
                result.append((row, entities))
            return result

        # Overdue
        overdue = _get_commitments(
            """
            SELECT id, content, deadline_at FROM memories
            WHERE type = 'commitment' AND invalidated_at IS NULL
              AND deadline_at IS NOT NULL AND deadline_at < datetime('now')
            ORDER BY deadline_at ASC LIMIT 20
            """
        )
        if overdue:
            lines.append("## ⚠️ Overdue")
            lines.append("")
            lines.append("| Commitment | Person/Project | Deadline |")
            lines.append("|------------|---------------|---------|")
            for row, entities in overdue:
                content = row["content"][:80] + ("..." if len(row["content"]) > 80 else "")
                ent_links = ", ".join(
                    f"[[{ENTITY_TYPE_DIRS.get(e['type'], 'concepts')}/{_sanitize_filename(e['name'])}]]"
                    for e in entities
                ) if entities else "-"
                deadline = row["deadline_at"][:10] if row["deadline_at"] else "-"
                lines.append(f"| {content} | {ent_links} | {deadline} |")
            lines.append("")

        # Due this week
        due_week = _get_commitments(
            """
            SELECT id, content, deadline_at FROM memories
            WHERE type = 'commitment' AND invalidated_at IS NULL
              AND deadline_at BETWEEN datetime('now') AND datetime('now', '+7 days')
            ORDER BY deadline_at ASC LIMIT 20
            """
        )
        if due_week:
            lines.append("## 📅 Due This Week")
            lines.append("")
            lines.append("| Commitment | Person/Project | Deadline |")
            lines.append("|------------|---------------|---------|")
            for row, entities in due_week:
                content = row["content"][:80] + ("..." if len(row["content"]) > 80 else "")
                ent_links = ", ".join(
                    f"[[{ENTITY_TYPE_DIRS.get(e['type'], 'concepts')}/{_sanitize_filename(e['name'])}]]"
                    for e in entities
                ) if entities else "-"
                deadline = row["deadline_at"][:10] if row["deadline_at"] else "-"
                lines.append(f"| {content} | {ent_links} | {deadline} |")
            lines.append("")

        # Open (no deadline)
        open_nd = _get_commitments(
            """
            SELECT id, content, deadline_at FROM memories
            WHERE type = 'commitment' AND invalidated_at IS NULL
              AND (deadline_at IS NULL OR deadline_at > datetime('now', '+7 days'))
            ORDER BY importance DESC LIMIT 30
            """
        )
        if open_nd:
            lines.append("## 🔄 Open (no deadline)")
            lines.append("")
            for row, entities in open_nd:
                content = row["content"][:80] + ("..." if len(row["content"]) > 80 else "")
                ent_links = " ".join(
                    f"[[{ENTITY_TYPE_DIRS.get(e['type'], 'concepts')}/{_sanitize_filename(e['name'])}]]"
                    for e in entities
                )
                suffix = f" ({ent_links})" if ent_links else ""
                lines.append(f"- [ ] {content}{suffix}")
            lines.append("")

        # Recently completed
        completed = _get_commitments(
            """
            SELECT id, content, invalidated_at as deadline_at FROM memories
            WHERE type = 'commitment' AND invalidated_at IS NOT NULL
              AND invalidated_at > datetime('now', '-7 days')
            ORDER BY invalidated_at DESC LIMIT 10
            """
        )
        if completed:
            lines.append("## ✅ Recently Completed (last 7 days)")
            lines.append("")
            for row, entities in completed:
                content = row["content"][:80] + ("..." if len(row["content"]) > 80 else "")
                lines.append(f"- [x] {content}")
            lines.append("")

        if not overdue and not due_week and not open_nd:
            lines.append("*No open commitments tracked.*")
            lines.append("")

        lines.append(f"---\n*Last updated: {timestamp}*")
        return "\n".join(lines)

    def _generate_moc_projects(self) -> str:
        """Generate MOC-Projects.md -- project status overview for Claudia's read layer."""
        from datetime import datetime as _dt

        timestamp = _dt.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        lines = ["# Projects Overview", "", f"> Last updated: {timestamp}", ""]

        projects = self.db.execute(
            """
            SELECT id, name, importance, attention_tier, updated_at
            FROM entities
            WHERE type = 'project' AND deleted_at IS NULL
            ORDER BY importance DESC
            """,
            fetch=True,
        ) or []

        if not projects:
            lines.append("*No projects tracked yet.*")
            lines.append(f"\n---\n*Last updated: {timestamp}*")
            return "\n".join(lines)

        # Group by tier
        tiers: Dict[str, List] = {"active": [], "standard": [], "archive": []}
        for p in projects:
            tier = (p["attention_tier"] or "standard").lower()
            if tier not in tiers:
                tier = "standard"
            tiers[tier].append(p)

        tier_config = [
            ("active", "## Active Projects"),
            ("standard", "## Standard Projects"),
            ("archive", "## Archive"),
        ]

        for tier_key, tier_heading in tier_config:
            tier_projects = tiers.get(tier_key, [])
            if not tier_projects:
                continue

            lines.append(tier_heading)
            lines.append("")
            lines.append("| Name | Connected People | Open Commitments | Importance |")
            lines.append("|------|-----------------|-----------------|-----------|")

            for p in tier_projects:
                # Count connected people
                people_rows = self.db.execute(
                    """
                    SELECT COUNT(DISTINCT e.id) as cnt
                    FROM entities e
                    JOIN relationships r ON (
                        (r.source_entity_id = ? AND r.target_entity_id = e.id) OR
                        (r.target_entity_id = ? AND r.source_entity_id = e.id)
                    )
                    WHERE e.type = 'person' AND e.deleted_at IS NULL AND r.invalid_at IS NULL
                    """,
                    (p["id"], p["id"]),
                    fetch=True,
                )
                people_count = people_rows[0]["cnt"] if people_rows else 0

                # Count open commitments
                comm_rows = self.db.execute(
                    """
                    SELECT COUNT(*) as cnt FROM memories m
                    JOIN memory_entities me ON m.id = me.memory_id
                    WHERE me.entity_id = ? AND m.type = 'commitment' AND m.invalidated_at IS NULL
                    """,
                    (p["id"],),
                    fetch=True,
                )
                comm_count = comm_rows[0]["cnt"] if comm_rows else 0

                lines.append(
                    f"| [[projects/{_sanitize_filename(p['name'])}]] | {people_count} | {comm_count} | {p['importance']} |"
                )

            lines.append("")

        lines.append(f"---\n*Last updated: {timestamp}*")
        return "\n".join(lines)

    def _write_moc_file(self, filename: str, content: str) -> None:
        """Write a MOC file to the correct vault location (respects wing config)."""
        moc_dir = self._moc_dir()
        moc_dir.mkdir(parents=True, exist_ok=True)
        filepath = moc_dir / filename
        try:
            filepath.write_text(content, encoding="utf-8")
        except IOError as e:
            logger.error(f"Failed to write MOC file {filepath}: {e}")

    # ── Public sync methods ─────────────────────────────────────

    def export_all(self) -> Dict[str, int]:
        """Full vault rebuild from SQLite. Exports all entities, patterns,
        reflections, sessions, Home dashboard, MOC indices, and .obsidian config.

        Returns a dict with counts of exported items.
        """
        logger.info(f"Starting full vault export to {self.vault_path}")
        self._ensure_directories()

        # Clear entity name cache for wikification
        if hasattr(self, "_entity_names_cache"):
            del self._entity_names_cache

        stats = {
            "entities": 0,
            "patterns": 0,
            "reflections": 0,
            "sessions": 0,
            "mocs": 0,
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

        # Export sessions (hierarchical, wikified)
        stats["sessions"] = self._export_sessions()

        # Export Dataview query templates (only if they don't exist yet)
        self._export_dataview_templates()

        # Export Home dashboard (always regenerated)
        self._export_home_dashboard()

        # Export MOC index files (always regenerated)
        self._export_moc_indices()

        # Write top-level MOC files (Claudia's read layer)
        self._write_moc_file("MOC-People.md", self._generate_moc_people())
        self._write_moc_file("MOC-Commitments.md", self._generate_moc_commitments())
        self._write_moc_file("MOC-Projects.md", self._generate_moc_projects())
        stats["mocs"] = 3

        # Export .obsidian config (idempotent, never overwrites)
        self._export_obsidian_config()

        # Save metadata with format version
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
            "mocs": 0,
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

        # Always regenerate MOC files (pure SQL, fast)
        self._write_moc_file("MOC-People.md", self._generate_moc_people())
        self._write_moc_file("MOC-Commitments.md", self._generate_moc_commitments())
        self._write_moc_file("MOC-Projects.md", self._generate_moc_projects())
        stats["mocs"] = 3

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
            # Count files in vault (PARA structure)
            file_counts = {}
            for subdir in [
                "Active", "Relationships/people", "Relationships/organizations",
                "Reference/concepts", "Reference/locations",
                "Archive/people", "Archive/projects", "Archive/organizations",
                "Claudia's Desk/patterns", "Claudia's Desk/reflections",
            ]:
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

    # ── Bidirectional sync (Phase 4) ────────────────────────────

    def detect_user_edits(self) -> List[Dict[str, Any]]:
        """Detect notes that users have edited in the vault.

        Walks all .md files, compares content hash to sync_hash in frontmatter.
        Returns list of edits with file path, entity ID, and change info.
        """
        edits = []
        for subdir in [
            "Active", "Relationships/people", "Relationships/organizations",
            "Reference/concepts", "Reference/locations",
            "Archive/people", "Archive/projects", "Archive/organizations",
        ]:
            d = self.vault_path / subdir
            if not d.exists():
                continue
            for filepath in d.glob("*.md"):
                try:
                    raw = filepath.read_text(encoding="utf-8")
                    fm, body = self._parse_frontmatter(raw)
                    if not fm or "sync_hash" not in fm:
                        continue

                    current_hash = _compute_sync_hash(body)
                    if current_hash != fm["sync_hash"]:
                        edits.append({
                            "file_path": str(filepath),
                            "entity_id": fm.get("claudia_id"),
                            "entity_type": fm.get("type"),
                            "old_hash": fm["sync_hash"],
                            "new_hash": current_hash,
                        })
                except (IOError, UnicodeDecodeError) as e:
                    logger.debug(f"Could not read vault note {filepath}: {e}")

        return edits

    def import_vault_edit(self, file_path: Path) -> Dict[str, Any]:
        """Import user edits from a vault note back into SQLite.

        Human edits always win: all changes use origin_type='user_stated'
        and confidence=1.0.

        Returns summary of changes applied.
        """
        from .remember import get_remember_service

        filepath = Path(file_path)
        raw = filepath.read_text(encoding="utf-8")
        fm, body = self._parse_frontmatter(raw)

        if not fm or "claudia_id" not in fm:
            return {"error": "No claudia_id in frontmatter", "file": str(filepath)}

        entity_id = fm["claudia_id"]
        entity_type = fm.get("type", "concept")
        svc = get_remember_service()
        changes = {"entity_id": entity_id, "facts_added": 0, "facts_updated": 0,
                    "commitments_completed": 0, "description_updated": False}

        # Get current entity from DB
        entity = self.db.get_one("entities", where="id = ?", where_params=(entity_id,))
        if not entity:
            return {"error": f"Entity {entity_id} not found", "file": str(filepath)}

        entity_name = entity["name"]

        # Parse body sections
        lines = body.strip().split("\n")

        # Extract description (text after title, before first ## heading)
        desc_lines = []
        in_desc = False
        for line in lines:
            if line.startswith("# "):
                in_desc = True
                continue
            if line.startswith("## "):
                break
            if in_desc and line.strip():
                desc_lines.append(line.strip())

        new_desc = " ".join(desc_lines).strip() if desc_lines else None
        if new_desc and new_desc != (_row_get(entity, "description") or ""):
            self.db.update(
                "entities",
                {"description": new_desc, "updated_at": datetime.utcnow().isoformat()},
                "id = ?",
                (entity_id,),
            )
            changes["description_updated"] = True

        # Parse commitment checkboxes
        current_section = None
        for line in lines:
            if line.startswith("## "):
                current_section = line[3:].strip().lower()
                continue

            if current_section == "commitments":
                # Check for completed checkboxes: - [x]
                completed_match = re.match(r"^-\s*\[x\]\s*(.+?)(?:\s*\(.*\))?\s*$", line, re.IGNORECASE)
                if completed_match:
                    content = completed_match.group(1).strip()
                    # Find matching commitment in DB
                    mem = self.db.execute(
                        """
                        SELECT m.id FROM memories m
                        JOIN memory_entities me ON m.id = me.memory_id
                        WHERE me.entity_id = ? AND m.type = 'commitment'
                          AND m.content LIKE ? AND m.invalidated_at IS NULL
                        LIMIT 1
                        """,
                        (entity_id, f"%{content[:40]}%"),
                        fetch=True,
                    )
                    if mem:
                        from .remember import invalidate_memory
                        invalidate_memory(mem[0]["id"], reason="completed (marked in vault)")
                        changes["commitments_completed"] += 1

            elif current_section in ("key facts", "preferences", "observations", "learnings"):
                # Check for new bullets
                bullet_match = re.match(r"^-\s+(.+?)(?:\s*\(.*\))?\s*$", line)
                if bullet_match:
                    fact_content = bullet_match.group(1).strip()
                    if not fact_content:
                        continue

                    # Check if this fact already exists
                    from ..database import content_hash
                    fact_hash = content_hash(fact_content)
                    existing = self.db.get_one(
                        "memories",
                        where="content_hash = ?",
                        where_params=(fact_hash,),
                    )
                    if not existing:
                        # Map section to type
                        type_map = {
                            "key facts": "fact",
                            "preferences": "preference",
                            "observations": "observation",
                            "learnings": "learning",
                        }
                        mem_type = type_map.get(current_section, "fact")
                        svc.remember_fact(
                            content=fact_content,
                            memory_type=mem_type,
                            about_entities=[entity_name],
                            importance=0.8,
                            origin_type="user_stated",
                            confidence=1.0,
                            source="vault_import",
                        )
                        changes["facts_added"] += 1

        # Update sync_hash in frontmatter
        new_hash = _compute_sync_hash(body)
        updated_raw = raw.replace(
            f"sync_hash: {fm.get('sync_hash', '')}",
            f"sync_hash: {new_hash}",
        )
        filepath.write_text(updated_raw, encoding="utf-8")

        self._append_sync_log(
            f"Imported edits from {filepath.name}: "
            f"{changes['facts_added']} facts, "
            f"{changes['commitments_completed']} commitments completed"
        )

        return changes

    def import_all_edits(self) -> Dict[str, Any]:
        """Scan vault for user edits and import them all.

        Returns summary of all changes applied.
        """
        edits = self.detect_user_edits()
        if not edits:
            return {"edits_found": 0, "changes": []}

        results = []
        for edit in edits:
            try:
                change = self.import_vault_edit(Path(edit["file_path"]))
                results.append(change)
            except Exception as e:
                logger.warning(f"Failed to import edit from {edit['file_path']}: {e}")
                results.append({"error": str(e), "file": edit["file_path"]})

        return {"edits_found": len(edits), "changes": results}

    @staticmethod
    def _parse_frontmatter(raw: str) -> tuple:
        """Parse YAML frontmatter from a markdown file.

        Returns (frontmatter_dict, body_text) tuple.
        Returns (None, raw) if no frontmatter found.
        """
        if not raw.startswith("---"):
            return None, raw

        parts = raw.split("---", 2)
        if len(parts) < 3:
            return None, raw

        fm_text = parts[1].strip()
        body = parts[2].strip()

        try:
            import yaml
            fm = yaml.safe_load(fm_text)
            if not isinstance(fm, dict):
                return None, raw
            return fm, body
        except ImportError:
            # Fallback: simple key-value parsing
            fm = {}
            for line in fm_text.split("\n"):
                if ":" in line:
                    key, _, value = line.partition(":")
                    fm[key.strip()] = value.strip()
            return fm, body
        except Exception:
            return None, raw


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

    # Auto-upgrade: if vault format version < 2, force full rebuild
    if not full and svc._get_vault_format_version() < 2:
        logger.info("Vault format version < 2, forcing full rebuild for upgrade")
        full = True

    if full:
        return svc.export_all()
    else:
        return svc.export_incremental()


def run_para_migration(vault_path: Path, db=None, preview: bool = False) -> Dict[str, Any]:
    """Migrate an existing flat or wing vault to the PARA structure.

    Safety-first workflow:
    1. Backup database + vault directory
    2. Create PARA directory structure
    3. Copy (not move) entity notes into PARA folders
    4. Move patterns/reflections/sessions/MOC files into Claudia's Desk/
    5. Verify all entities accounted for
    6. Clean up empty old directories
    7. Run full vault export to regenerate everything
    8. Report summary

    Args:
        vault_path: Path to the vault root.
        db: Optional database instance.
        preview: If True, print routing plan without making changes.

    Returns:
        Dict with migration results.
    """
    import shutil as _shutil
    from datetime import datetime as _dt

    from ..database import get_db as _get_db
    _db = db or _get_db()

    # Build routing plan: entity -> PARA folder
    entities = _db.execute(
        """
        SELECT id, name, type, attention_tier, contact_trend
        FROM entities WHERE deleted_at IS NULL
        ORDER BY type, name
        """,
        fetch=True,
    ) or []

    # Map entity types to legacy flat directories
    LEGACY_DIRS = {
        "person": ["people"],
        "project": ["projects"],
        "organization": ["organizations"],
        "concept": ["concepts"],
        "location": ["locations"],
    }

    # Also check wing directories for migrations from wing layout
    WING_DIRS = {
        "person": ["claudia/relational/people"],
        "project": ["claudia/ops/projects"],
        "organization": ["claudia/ops/organizations"],
        "concept": ["claudia/relational/concepts"],
        "location": ["claudia/relational/locations"],
    }

    def _route_entity(etype: str, entity: Dict) -> str:
        """Compute PARA path for an entity."""
        tier = _row_get(entity, "attention_tier") or "standard"
        trend = _row_get(entity, "contact_trend")

        if tier == "archive" or trend == "dormant":
            subdir = ENTITY_TYPE_DIRS.get(etype, "concepts")
            return f"Archive/{subdir}"

        if etype == "project":
            return "Active"
        elif etype == "person":
            return "Relationships/people"
        elif etype == "organization":
            return "Relationships/organizations"
        elif etype == "location":
            return "Reference/locations"
        else:
            return "Reference/concepts"

    # Build migration plan
    migrations = []  # list of (source_path, dest_path, entity_name)
    missing = []  # entities with no source file found

    for entity in entities:
        etype = entity["type"]
        name = entity["name"]
        filename = _sanitize_filename(name) + ".md"
        dest_dir = _route_entity(etype, entity)

        # Find source file in legacy or wing locations
        source = None
        search_dirs = LEGACY_DIRS.get(etype, []) + WING_DIRS.get(etype, [])
        for sdir in search_dirs:
            candidate = vault_path / sdir / filename
            if candidate.exists():
                source = candidate
                break

        if source:
            dest = vault_path / dest_dir / filename
            if source != dest:
                migrations.append((source, dest, name))
        else:
            missing.append(name)

    # Also plan Claudia's Desk file moves
    desk_moves = []  # (source, dest, description)

    # MOC files
    for moc_name in ["MOC-People.md", "MOC-Commitments.md", "MOC-Projects.md"]:
        src = vault_path / moc_name
        if src.exists():
            desk_moves.append((src, vault_path / "Claudia's Desk" / moc_name, moc_name))
        # Also check wing root
        src_wing = vault_path / "claudia" / moc_name
        if src_wing.exists():
            desk_moves.append((src_wing, vault_path / "Claudia's Desk" / moc_name, moc_name))

    # Patterns
    for pdir in [vault_path / "patterns", vault_path / "claudia" / "relational" / "patterns"]:
        if pdir.exists():
            for f in pdir.glob("*.md"):
                desk_moves.append((f, vault_path / "Claudia's Desk" / "patterns" / f.name, f"pattern: {f.name}"))

    # Reflections
    for rdir in [vault_path / "reflections", vault_path / "claudia" / "self"]:
        if rdir.exists():
            for f in rdir.glob("*.md"):
                desk_moves.append((f, vault_path / "Claudia's Desk" / "reflections" / f.name, f"reflection: {f.name}"))

    # Sessions (recursive)
    for sdir in [vault_path / "sessions"]:
        if sdir.exists():
            for f in sdir.rglob("*.md"):
                rel = f.relative_to(sdir)
                desk_moves.append((f, vault_path / "Claudia's Desk" / "sessions" / rel, f"session: {rel}"))

    # _queries
    for qdir in [vault_path / "_queries"]:
        if qdir.exists():
            for f in qdir.glob("*.md"):
                desk_moves.append((f, vault_path / "Claudia's Desk" / "_queries" / f.name, f"query: {f.name}"))

    if preview:
        print(f"\nPARA Migration Preview")
        print(f"  Entities to route: {len(entities)}")
        print(f"  Files to move: {len(migrations)}")
        print(f"  Desk files to move: {len(desk_moves)}")
        print(f"  Missing source files: {len(missing)}")
        print()
        print("Entity routing plan:")
        shown = migrations[:25]
        for src, dst, name in shown:
            print(f"  {src.relative_to(vault_path)} -> {dst.relative_to(vault_path)}")
        if len(migrations) > 25:
            print(f"  ... and {len(migrations) - 25} more")
        if desk_moves:
            print()
            print("Claudia's Desk moves:")
            for src, dst, desc in desk_moves[:10]:
                print(f"  {desc}")
            if len(desk_moves) > 10:
                print(f"  ... and {len(desk_moves) - 10} more")
        if missing:
            print()
            print(f"Entities without vault files (will be created by export_all):")
            for name in missing[:10]:
                print(f"  {name}")
        print()
        print("Run without --preview to execute migration.")
        return {"preview": True, "entities": len(entities), "files_to_move": len(migrations)}

    # Step 1: Backup
    print("\nStep 1/7: Creating backups...")
    backup_path = _db.backup()
    print(f"  Database backed up to: {backup_path}")

    timestamp = _dt.utcnow().strftime("%Y-%m-%d-%H%M%S")
    vault_backup = vault_path.parent / f"vault-backup-{timestamp}"
    _shutil.copytree(vault_path, vault_backup)
    print(f"  Vault backed up to: {vault_backup}")

    # Step 2: Create PARA directory structure
    print("\nStep 2/7: Creating PARA directories...")
    para_dirs = [
        "Active",
        "Relationships/people", "Relationships/organizations",
        "Reference/concepts", "Reference/locations",
        "Archive/people", "Archive/projects", "Archive/organizations",
        "Claudia's Desk", "Claudia's Desk/patterns",
        "Claudia's Desk/reflections", "Claudia's Desk/sessions",
        "Claudia's Desk/_queries",
    ]
    for d in para_dirs:
        (vault_path / d).mkdir(parents=True, exist_ok=True)
    print(f"  Created {len(para_dirs)} directories")

    # Step 3: Copy entity notes into PARA folders
    print("\nStep 3/7: Copying entity notes to PARA structure...")
    migrated = 0
    errors = 0
    for src, dst, name in migrations:
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            _shutil.copy2(src, dst)
            migrated += 1
        except Exception as e:
            logger.warning(f"Migration failed for {name}: {e}")
            errors += 1
    print(f"  Copied {migrated} entity files ({errors} errors)")

    # Step 4: Move Claudia's Desk files
    print("\nStep 4/7: Moving Claudia's files to Claudia's Desk...")
    desk_moved = 0
    for src, dst, desc in desk_moves:
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            _shutil.copy2(src, dst)
            desk_moved += 1
        except Exception as e:
            logger.warning(f"Desk move failed for {desc}: {e}")
    print(f"  Moved {desk_moved} files to Claudia's Desk/")

    # Step 5: Verify
    print("\nStep 5/7: Verifying migration...")
    expected = len(entities)
    # Count .md files in PARA entity directories (excluding _Index.md)
    actual = 0
    for para_dir in ["Active", "Relationships/people", "Relationships/organizations",
                      "Reference/concepts", "Reference/locations",
                      "Archive/people", "Archive/projects", "Archive/organizations"]:
        d = vault_path / para_dir
        if d.exists():
            actual += sum(1 for f in d.glob("*.md") if f.name != "_Index.md")

    if actual < expected - len(missing):
        print(f"  WARNING: Expected {expected - len(missing)} files, found {actual}.")
        print(f"  Missing files will be created by the full export in Step 7.")
    else:
        print(f"  Verified: {actual} entity files in PARA structure")

    # Step 6: Clean up empty old directories
    print("\nStep 6/7: Cleaning up old directories...")
    cleaned = 0
    skipped = []
    old_dirs = ["people", "projects", "organizations", "concepts", "locations",
                "patterns", "reflections", "sessions", "_queries"]
    for old_dir in old_dirs:
        old_path = vault_path / old_dir
        if not old_path.exists():
            continue
        # Check for user-created files (no claudia_id in frontmatter)
        user_files = []
        for f in old_path.rglob("*.md"):
            try:
                content = f.read_text(encoding="utf-8", errors="replace")
                if "claudia_id:" not in content:
                    user_files.append(f)
            except IOError:
                pass
        if user_files:
            skipped.append((old_dir, len(user_files)))
        else:
            try:
                _shutil.rmtree(old_path)
                cleaned += 1
            except Exception as e:
                logger.warning(f"Could not remove {old_dir}: {e}")

    # Also clean up wing directories if they exist
    wing_path = vault_path / "claudia"
    if wing_path.exists():
        try:
            _shutil.rmtree(wing_path)
            cleaned += 1
        except Exception:
            pass

    print(f"  Removed {cleaned} old directories")
    if skipped:
        for dirname, count in skipped:
            print(f"  Kept {dirname}/ ({count} user-created files)")

    # Step 7: Full vault export
    print("\nStep 7/7: Regenerating vault from SQLite...")
    svc = VaultSyncService(vault_path, db=_db)
    stats = svc.export_all()
    print(f"  Export complete: {stats}")

    # Report
    print(f"\n{'=' * 50}")
    print(f"PARA Migration Complete")
    print(f"  Entity files migrated: {migrated}")
    print(f"  Claudia's Desk files: {desk_moved}")
    print(f"  Old directories cleaned: {cleaned}")
    print(f"  Database backup: {backup_path}")
    print(f"  Vault backup: {vault_backup}")
    if missing:
        print(f"  Entities without prior files (created fresh): {len(missing)}")
    if skipped:
        print(f"  Directories with user files (preserved): {[s[0] for s in skipped]}")
    print(f"\nYour vault is now organized. Claudia will use the new structure from her next session.")
    print(f"To rollback: delete the vault and rename {vault_backup.name} back.")

    return {
        "migrated": migrated,
        "desk_moved": desk_moved,
        "errors": errors,
        "cleaned": cleaned,
        "vault_backup": str(vault_backup),
        "db_backup": str(backup_path),
    }
