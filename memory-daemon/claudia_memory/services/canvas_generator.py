"""
Canvas Generator for Claudia Memory System

Generates Obsidian .canvas JSON files for visual dashboards:
- Relationship map: entities as nodes, relationships as edges
- Morning brief: commitments, warnings, focus areas
- Project board: project + connected entities and tasks

Canvas JSON format (Obsidian):
{
  "nodes": [
    {"id": "...", "type": "file"|"text"|"link"|"group",
     "x": N, "y": N, "width": N, "height": N, ...}
  ],
  "edges": [
    {"id": "...", "fromNode": "...", "toNode": "...",
     "fromSide": "right", "toSide": "left", "label": "..."}
  ]
}
"""

import hashlib
import json
import logging
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..database import get_db

logger = logging.getLogger(__name__)

# Node sizing by entity type
NODE_SIZES = {
    "person": (250, 80),
    "project": (280, 90),
    "organization": (260, 80),
    "concept": (220, 70),
    "location": (220, 70),
}
DEFAULT_NODE_SIZE = (240, 80)

# Colors by entity type (Obsidian canvas uses color indices 1-6)
NODE_COLORS = {
    "person": "4",      # green
    "project": "1",     # red
    "organization": "5", # purple
    "concept": "6",     # cyan
    "location": "3",    # yellow
}


def _node_id(prefix: str, entity_id: int) -> str:
    """Generate a deterministic node ID."""
    return f"{prefix}-{entity_id}"


def _edge_id(from_id: str, to_id: str, label: str = "") -> str:
    """Generate a deterministic edge ID."""
    raw = f"{from_id}:{to_id}:{label}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


class CanvasGenerator:
    """Generates Obsidian .canvas files from memory data."""

    def __init__(self, vault_path: Path, db=None):
        self.vault_path = vault_path
        self.db = db or get_db()
        self.canvas_dir = vault_path / "canvases"

    def _ensure_dir(self) -> None:
        self.canvas_dir.mkdir(parents=True, exist_ok=True)

    def _layout_circle(
        self, count: int, radius: float = 400, center: Tuple[float, float] = (0, 0)
    ) -> List[Tuple[float, float]]:
        """Compute positions for nodes arranged in a circle."""
        positions = []
        for i in range(count):
            angle = (2 * math.pi * i) / max(count, 1)
            x = center[0] + radius * math.cos(angle)
            y = center[1] + radius * math.sin(angle)
            positions.append((x, y))
        return positions

    def _entity_to_note_path(self, entity: Dict) -> str:
        """Get the relative vault path for an entity note."""
        from .vault_sync import ENTITY_TYPE_DIRS, _sanitize_filename
        subdir = ENTITY_TYPE_DIRS.get(entity["type"], "concepts")
        filename = _sanitize_filename(entity["name"]) + ".md"
        return f"{subdir}/{filename}"

    # ── Relationship Map ────────────────────────────────────────

    def generate_relationship_map(
        self,
        min_relationships: int = 2,
        max_entities: int = 50,
    ) -> Path:
        """Generate a relationship map canvas.

        Shows entities as file-linked nodes with relationship edges.
        Only includes entities with at least `min_relationships` connections.

        Returns the path to the generated .canvas file.
        """
        self._ensure_dir()

        # Fetch entities with relationship counts
        entities = self.db.execute(
            """
            SELECT e.*, COUNT(DISTINCT r.id) as rel_count
            FROM entities e
            LEFT JOIN relationships r
              ON (e.id = r.source_entity_id OR e.id = r.target_entity_id)
              AND r.invalid_at IS NULL
            WHERE e.deleted_at IS NULL
            GROUP BY e.id
            HAVING rel_count >= ?
            ORDER BY rel_count DESC, e.importance DESC
            LIMIT ?
            """,
            (min_relationships, max_entities),
            fetch=True,
        ) or []

        if not entities:
            logger.info("No entities with enough relationships for canvas")
            return self._write_empty_canvas("relationship-map")

        entity_ids = {e["id"] for e in entities}

        # Fetch relationships between included entities
        id_list = ",".join(str(eid) for eid in entity_ids)
        relationships = self.db.execute(
            f"""
            SELECT r.*, s.name as source_name, t.name as target_name
            FROM relationships r
            JOIN entities s ON r.source_entity_id = s.id
            JOIN entities t ON r.target_entity_id = t.id
            WHERE r.source_entity_id IN ({id_list})
              AND r.target_entity_id IN ({id_list})
              AND r.invalid_at IS NULL
            """,
            fetch=True,
        ) or []

        # Layout entities in a circle
        positions = self._layout_circle(len(entities))
        nodes = []
        id_map = {}

        for i, entity in enumerate(entities):
            nid = _node_id("e", entity["id"])
            id_map[entity["id"]] = nid
            w, h = NODE_SIZES.get(entity["type"], DEFAULT_NODE_SIZE)
            color = NODE_COLORS.get(entity["type"], "0")
            x, y = positions[i]

            note_path = self._entity_to_note_path(entity)
            nodes.append({
                "id": nid,
                "type": "file",
                "file": note_path,
                "x": int(x),
                "y": int(y),
                "width": w,
                "height": h,
                "color": color,
            })

        # Build edges
        edges = []
        seen_edges = set()
        for rel in relationships:
            src_id = id_map.get(rel["source_entity_id"])
            tgt_id = id_map.get(rel["target_entity_id"])
            if not src_id or not tgt_id:
                continue

            edge_key = tuple(sorted([src_id, tgt_id]))
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)

            eid = _edge_id(src_id, tgt_id, rel["relationship_type"])
            edges.append({
                "id": eid,
                "fromNode": src_id,
                "toNode": tgt_id,
                "fromSide": "right",
                "toSide": "left",
                "label": rel["relationship_type"],
            })

        canvas = {"nodes": nodes, "edges": edges}
        filepath = self.canvas_dir / "relationship-map.canvas"
        filepath.write_text(json.dumps(canvas, indent=2), encoding="utf-8")
        logger.info(f"Generated relationship map: {len(nodes)} nodes, {len(edges)} edges")
        return filepath

    # ── Morning Brief ───────────────────────────────────────────

    def generate_morning_brief(self) -> Path:
        """Generate a morning brief canvas.

        Shows pending commitments, cooling relationships, and recent patterns
        as text cards arranged in a dashboard layout.
        """
        self._ensure_dir()
        nodes = []
        x_offset = 0
        card_width = 350
        card_gap = 40

        # Title card
        nodes.append({
            "id": "title",
            "type": "text",
            "text": f"# Morning Brief\n*Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC*",
            "x": 0, "y": -120,
            "width": card_width * 3 + card_gap * 2,
            "height": 80,
            "color": "1",
        })

        # Column 1: Commitments
        commitments = self.db.execute(
            """
            SELECT m.content, m.created_at, m.importance,
                   GROUP_CONCAT(e.name) as entities
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE m.type = 'commitment'
              AND m.invalidated_at IS NULL
            GROUP BY m.id
            ORDER BY m.importance DESC
            LIMIT 10
            """,
            fetch=True,
        ) or []

        commit_lines = ["## Commitments\n"]
        if commitments:
            for c in commitments:
                entities_val = c["entities"] if c["entities"] else None
                ent = f" ([[{entities_val}]])" if entities_val else ""
                commit_lines.append(f"- [ ] {c['content']}{ent}")
        else:
            commit_lines.append("*No pending commitments*")

        nodes.append({
            "id": "commitments",
            "type": "text",
            "text": "\n".join(commit_lines),
            "x": 0, "y": 0,
            "width": card_width,
            "height": max(200, len(commitments) * 35 + 80),
            "color": "4",
        })

        # Column 2: Cooling relationships (patterns)
        cooling = self.db.execute(
            """
            SELECT description, confidence, last_observed_at
            FROM patterns
            WHERE is_active = 1
              AND pattern_type = 'cooling_relationship'
            ORDER BY last_observed_at DESC
            LIMIT 5
            """,
            fetch=True,
        ) or []

        # Also get recent warnings from other pattern types
        warnings = self.db.execute(
            """
            SELECT description, pattern_type, confidence
            FROM patterns
            WHERE is_active = 1
              AND pattern_type != 'cooling_relationship'
            ORDER BY last_observed_at DESC
            LIMIT 5
            """,
            fetch=True,
        ) or []

        alert_lines = ["## Alerts\n"]
        if cooling:
            alert_lines.append("### Cooling Relationships")
            for c in cooling:
                alert_lines.append(f"- {c['description']}")
        if warnings:
            alert_lines.append("\n### Patterns Detected")
            for w in warnings:
                ptype = w["pattern_type"].replace("_", " ").title()
                alert_lines.append(f"- **{ptype}**: {w['description']}")
        if not cooling and not warnings:
            alert_lines.append("*No active alerts*")

        nodes.append({
            "id": "alerts",
            "type": "text",
            "text": "\n".join(alert_lines),
            "x": card_width + card_gap, "y": 0,
            "width": card_width,
            "height": max(200, (len(cooling) + len(warnings)) * 35 + 120),
            "color": "1",
        })

        # Column 3: Recent activity summary
        recent_48h = datetime.utcnow() - timedelta(hours=48)
        recent_str = recent_48h.isoformat()

        recent_counts = {}
        for table, sql in [
            ("memories", f"SELECT COUNT(*) as c FROM memories WHERE created_at > '{recent_str}'"),
            ("entities", f"SELECT COUNT(*) as c FROM entities WHERE created_at > '{recent_str}' AND deleted_at IS NULL"),
            ("sessions", f"SELECT COUNT(*) as c FROM episodes WHERE started_at > '{recent_str}'"),
        ]:
            try:
                rows = self.db.execute(sql, fetch=True) or []
                recent_counts[table] = rows[0]["c"] if rows else 0
            except Exception:
                recent_counts[table] = 0

        activity_lines = ["## Recent Activity (48h)\n"]
        activity_lines.append(f"- **{recent_counts.get('memories', 0)}** new memories")
        activity_lines.append(f"- **{recent_counts.get('entities', 0)}** new entities")
        activity_lines.append(f"- **{recent_counts.get('sessions', 0)}** sessions")

        nodes.append({
            "id": "activity",
            "type": "text",
            "text": "\n".join(activity_lines),
            "x": (card_width + card_gap) * 2, "y": 0,
            "width": card_width,
            "height": 200,
            "color": "6",
        })

        canvas = {"nodes": nodes, "edges": []}
        filepath = self.canvas_dir / "morning-brief.canvas"
        filepath.write_text(json.dumps(canvas, indent=2), encoding="utf-8")
        logger.info(f"Generated morning brief canvas: {len(nodes)} cards")
        return filepath

    # ── Project Board ───────────────────────────────────────────

    def generate_project_board(self, project_name: str) -> Optional[Path]:
        """Generate a project board canvas for a specific project.

        Shows the project entity at center with connected people/orgs
        arranged around it, and relevant commitments as task cards.

        Returns the canvas path, or None if project not found.
        """
        self._ensure_dir()
        from ..extraction.entity_extractor import get_extractor
        canonical = get_extractor().canonical_name(project_name)

        # Find project entity
        project = self.db.get_one(
            "entities",
            where="canonical_name = ? AND deleted_at IS NULL",
            where_params=(canonical,),
        )
        if not project:
            logger.warning(f"Project '{project_name}' not found")
            return None

        pid = project["id"]

        # Get connected entities
        connected = self.db.execute(
            """
            SELECT DISTINCT e.*, r.relationship_type, r.strength
            FROM entities e
            JOIN relationships r ON (
                (r.source_entity_id = ? AND r.target_entity_id = e.id) OR
                (r.target_entity_id = ? AND r.source_entity_id = e.id)
            )
            WHERE e.deleted_at IS NULL
              AND r.invalid_at IS NULL
            ORDER BY r.strength DESC
            """,
            (pid, pid),
            fetch=True,
        ) or []

        # Get project commitments
        commitments = self.db.execute(
            """
            SELECT m.content, m.importance, m.created_at
            FROM memories m
            JOIN memory_entities me ON m.id = me.memory_id
            WHERE me.entity_id = ?
              AND m.type = 'commitment'
              AND m.invalidated_at IS NULL
            ORDER BY m.importance DESC
            LIMIT 10
            """,
            (pid,),
            fetch=True,
        ) or []

        nodes = []
        edges = []

        # Center: project node
        project_nid = _node_id("p", pid)
        note_path = self._entity_to_note_path(project)
        nodes.append({
            "id": project_nid,
            "type": "file",
            "file": note_path,
            "x": 0, "y": 0,
            "width": 300, "height": 100,
            "color": NODE_COLORS.get("project", "1"),
        })

        # Connected entities in a circle
        positions = self._layout_circle(len(connected), radius=350)
        for i, ent in enumerate(connected):
            nid = _node_id("e", ent["id"])
            w, h = NODE_SIZES.get(ent["type"], DEFAULT_NODE_SIZE)
            color = NODE_COLORS.get(ent["type"], "0")
            x, y = positions[i]

            ent_note_path = self._entity_to_note_path(ent)
            nodes.append({
                "id": nid,
                "type": "file",
                "file": ent_note_path,
                "x": int(x), "y": int(y),
                "width": w, "height": h,
                "color": color,
            })

            rel_type = ent["relationship_type"] if "relationship_type" in ent.keys() else ""
            eid = _edge_id(project_nid, nid, rel_type)
            edges.append({
                "id": eid,
                "fromNode": project_nid,
                "toNode": nid,
                "label": rel_type,
            })

        # Tasks column (to the right)
        if commitments:
            task_lines = ["## Tasks\n"]
            for c in commitments:
                task_lines.append(f"- [ ] {c['content']}")

            nodes.append({
                "id": "tasks",
                "type": "text",
                "text": "\n".join(task_lines),
                "x": 500, "y": -200,
                "width": 300,
                "height": max(150, len(commitments) * 30 + 80),
                "color": "3",
            })

        canvas = {"nodes": nodes, "edges": edges}
        slug = project_name.lower().replace(" ", "-")[:30]
        filepath = self.canvas_dir / f"project-{slug}.canvas"
        filepath.write_text(json.dumps(canvas, indent=2), encoding="utf-8")
        logger.info(
            f"Generated project board for '{project_name}': "
            f"{len(nodes)} nodes, {len(edges)} edges"
        )
        return filepath

    # ── Helpers ──────────────────────────────────────────────────

    def _write_empty_canvas(self, name: str) -> Path:
        """Write an empty canvas with just a note."""
        self._ensure_dir()
        canvas = {
            "nodes": [{
                "id": "empty",
                "type": "text",
                "text": f"# {name.replace('-', ' ').title()}\n\n*No data to display yet. "
                        f"Start adding memories and relationships.*",
                "x": 0, "y": 0,
                "width": 400, "height": 150,
            }],
            "edges": [],
        }
        filepath = self.canvas_dir / f"{name}.canvas"
        filepath.write_text(json.dumps(canvas, indent=2), encoding="utf-8")
        return filepath

    def generate_all(self) -> Dict[str, Any]:
        """Generate all standard canvases.

        Returns a dict with paths and status for each canvas.
        """
        results = {}

        try:
            path = self.generate_relationship_map()
            results["relationship_map"] = {"path": str(path), "status": "ok"}
        except Exception as e:
            logger.exception("Error generating relationship map")
            results["relationship_map"] = {"status": "error", "error": str(e)}

        try:
            path = self.generate_morning_brief()
            results["morning_brief"] = {"path": str(path), "status": "ok"}
        except Exception as e:
            logger.exception("Error generating morning brief")
            results["morning_brief"] = {"status": "error", "error": str(e)}

        return results


# ── Module-level convenience ────────────────────────────────────


def get_canvas_generator(vault_path: Path, db=None) -> CanvasGenerator:
    """Create a CanvasGenerator for the given vault path."""
    return CanvasGenerator(vault_path, db=db)
