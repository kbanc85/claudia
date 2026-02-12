"""Tests for CanvasGenerator - Obsidian canvas file generation."""

import json
import tempfile
from pathlib import Path

import pytest

from claudia_memory.services.canvas_generator import CanvasGenerator


@pytest.fixture
def vault_dir():
    """Create a temporary vault directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def canvas_gen(db, vault_dir):
    """Create a CanvasGenerator with test database and temp vault."""
    return CanvasGenerator(vault_dir, db=db)


def _seed_entity(db, name, entity_type="person", description="", importance=0.8):
    """Insert a test entity and return its id."""
    db.execute(
        """INSERT INTO entities (name, canonical_name, type, description, importance)
           VALUES (?, ?, ?, ?, ?)""",
        (name, name.lower(), entity_type, description, importance),
    )
    rows = db.execute(
        "SELECT id FROM entities WHERE canonical_name = ?",
        (name.lower(),),
        fetch=True,
    )
    return rows[0]["id"]


def _seed_relationship(db, source_id, target_id, rel_type="works_with", strength=0.8):
    """Insert a test relationship."""
    db.execute(
        """INSERT INTO relationships
           (source_entity_id, target_entity_id, relationship_type, direction, strength, origin_type)
           VALUES (?, ?, ?, 'bidirectional', ?, 'user_stated')""",
        (source_id, target_id, rel_type, strength),
    )


def _seed_memory(db, content, entity_id, memory_type="fact", importance=0.7):
    """Insert a test memory linked to an entity."""
    db.execute(
        """INSERT INTO memories (content, type, importance, source, origin_type, confidence)
           VALUES (?, ?, ?, 'test', 'user_stated', 1.0)""",
        (content, memory_type, importance),
    )
    rows = db.execute(
        "SELECT id FROM memories WHERE content = ?", (content,), fetch=True
    )
    mid = rows[0]["id"]
    db.execute(
        "INSERT INTO memory_entities (memory_id, entity_id) VALUES (?, ?)",
        (mid, entity_id),
    )
    return mid


def _validate_canvas_json(path: Path) -> dict:
    """Read and validate canvas JSON structure."""
    assert path.exists(), f"Canvas file does not exist: {path}"
    content = path.read_text()
    data = json.loads(content)
    assert "nodes" in data, "Canvas missing 'nodes'"
    assert "edges" in data, "Canvas missing 'edges'"
    assert isinstance(data["nodes"], list)
    assert isinstance(data["edges"], list)
    return data


# ── Relationship map tests ──────────────────────────────────────


def test_relationship_map_basic(db, canvas_gen, vault_dir):
    """Relationship map generates valid canvas JSON with nodes and edges."""
    # Create 3 entities with cross-relationships
    alice_id = _seed_entity(db, "Alice", "person")
    bob_id = _seed_entity(db, "Bob", "person")
    acme_id = _seed_entity(db, "Acme Corp", "organization")

    _seed_relationship(db, alice_id, bob_id, "works_with")
    _seed_relationship(db, alice_id, acme_id, "employed_by")
    _seed_relationship(db, bob_id, acme_id, "employed_by")

    path = canvas_gen.generate_relationship_map(min_relationships=2)
    data = _validate_canvas_json(path)

    assert len(data["nodes"]) == 3
    assert len(data["edges"]) >= 2

    # Check node structure
    node = data["nodes"][0]
    assert "id" in node
    assert "type" in node
    assert "x" in node
    assert "y" in node
    assert "width" in node
    assert "height" in node


def test_relationship_map_file_type_nodes(db, canvas_gen, vault_dir):
    """Relationship map nodes are type 'file' linking to vault notes."""
    alice_id = _seed_entity(db, "Alice", "person")
    bob_id = _seed_entity(db, "Bob", "person")
    _seed_relationship(db, alice_id, bob_id, "works_with")

    path = canvas_gen.generate_relationship_map(min_relationships=1)
    data = _validate_canvas_json(path)

    for node in data["nodes"]:
        assert node["type"] == "file"
        assert node["file"].endswith(".md")


def test_relationship_map_edge_labels(db, canvas_gen, vault_dir):
    """Edges have relationship type as labels."""
    alice_id = _seed_entity(db, "Alice", "person")
    bob_id = _seed_entity(db, "Bob", "person")
    _seed_relationship(db, alice_id, bob_id, "mentors")

    path = canvas_gen.generate_relationship_map(min_relationships=1)
    data = _validate_canvas_json(path)

    labels = [e.get("label") for e in data["edges"]]
    assert "mentors" in labels


def test_relationship_map_empty(db, canvas_gen, vault_dir):
    """Empty relationship map creates a placeholder canvas."""
    path = canvas_gen.generate_relationship_map()
    data = _validate_canvas_json(path)

    # Should have at least an empty note
    assert len(data["nodes"]) >= 1
    assert "No data" in data["nodes"][0].get("text", "")


def test_relationship_map_color_coding(db, canvas_gen, vault_dir):
    """Nodes are color-coded by entity type."""
    person_id = _seed_entity(db, "Alice", "person")
    org_id = _seed_entity(db, "Acme", "organization")
    _seed_relationship(db, person_id, org_id, "employed_by")

    path = canvas_gen.generate_relationship_map(min_relationships=1)
    data = _validate_canvas_json(path)

    colors = {n.get("color") for n in data["nodes"]}
    # Person = "4" (green), Organization = "5" (purple)
    assert "4" in colors or "5" in colors


# ── Morning brief tests ─────────────────────────────────────────


def test_morning_brief_structure(db, canvas_gen, vault_dir):
    """Morning brief generates a multi-card dashboard."""
    path = canvas_gen.generate_morning_brief()
    data = _validate_canvas_json(path)

    # Should have title + commitments + alerts + activity cards
    assert len(data["nodes"]) >= 3

    # Check for text-type nodes
    node_types = {n["type"] for n in data["nodes"]}
    assert "text" in node_types

    # No edges in a brief (it's a dashboard, not a graph)
    assert len(data["edges"]) == 0


def test_morning_brief_with_commitments(db, canvas_gen, vault_dir):
    """Morning brief shows pending commitments."""
    eid = _seed_entity(db, "Alice", "person")
    _seed_memory(db, "Send quarterly report", eid, "commitment")

    path = canvas_gen.generate_morning_brief()
    data = _validate_canvas_json(path)

    all_text = " ".join(n.get("text", "") for n in data["nodes"])
    assert "Send quarterly report" in all_text


def test_morning_brief_with_patterns(db, canvas_gen, vault_dir):
    """Morning brief shows active patterns and alerts."""
    db.execute(
        """INSERT INTO patterns (name, pattern_type, description, confidence, is_active, first_observed_at, last_observed_at)
           VALUES ('cooling-jim', 'cooling_relationship', 'No contact with Jim in 45 days', 0.8, 1, datetime('now'), datetime('now'))""",
    )

    path = canvas_gen.generate_morning_brief()
    data = _validate_canvas_json(path)

    all_text = " ".join(n.get("text", "") for n in data["nodes"])
    assert "Jim" in all_text or "Alerts" in all_text


# ── Project board tests ──────────────────────────────────────────


def test_project_board_basic(db, canvas_gen, vault_dir):
    """Project board shows project at center with connected entities."""
    proj_id = _seed_entity(db, "Website Redesign", "project", "Redesigning the company website")
    alice_id = _seed_entity(db, "Alice", "person")
    _seed_relationship(db, proj_id, alice_id, "involves")

    path = canvas_gen.generate_project_board("Website Redesign")
    assert path is not None
    data = _validate_canvas_json(path)

    # Project node + connected entity
    assert len(data["nodes"]) >= 2
    assert len(data["edges"]) >= 1


def test_project_board_not_found(db, canvas_gen, vault_dir):
    """Project board returns None for unknown project."""
    path = canvas_gen.generate_project_board("Nonexistent Project")
    assert path is None


def test_project_board_with_tasks(db, canvas_gen, vault_dir):
    """Project board includes commitment cards as tasks."""
    proj_id = _seed_entity(db, "Website Redesign", "project")
    _seed_memory(db, "Finish wireframes by Monday", proj_id, "commitment")

    path = canvas_gen.generate_project_board("Website Redesign")
    data = _validate_canvas_json(path)

    all_text = " ".join(n.get("text", "") for n in data["nodes"])
    assert "wireframes" in all_text.lower()


# ── Generate all tests ───────────────────────────────────────────


def test_generate_all(db, canvas_gen, vault_dir):
    """Generate all creates relationship map and morning brief."""
    # Seed some data
    alice_id = _seed_entity(db, "Alice", "person")
    bob_id = _seed_entity(db, "Bob", "person")
    _seed_relationship(db, alice_id, bob_id, "works_with")

    results = canvas_gen.generate_all()

    assert "relationship_map" in results
    assert "morning_brief" in results
    assert results["relationship_map"]["status"] == "ok"
    assert results["morning_brief"]["status"] == "ok"


def test_generate_all_creates_canvas_dir(db, canvas_gen, vault_dir):
    """Generate all creates the canvases directory."""
    canvas_gen.generate_all()
    assert (vault_dir / "canvases").is_dir()


# ── Canvas JSON validity ────────────────────────────────────────


def test_canvas_node_ids_unique(db, canvas_gen, vault_dir):
    """All node IDs within a canvas are unique."""
    alice_id = _seed_entity(db, "Alice", "person")
    bob_id = _seed_entity(db, "Bob", "person")
    carol_id = _seed_entity(db, "Carol", "person")
    _seed_relationship(db, alice_id, bob_id, "works_with")
    _seed_relationship(db, bob_id, carol_id, "works_with")
    _seed_relationship(db, alice_id, carol_id, "friends_with")

    path = canvas_gen.generate_relationship_map(min_relationships=2)
    data = _validate_canvas_json(path)

    node_ids = [n["id"] for n in data["nodes"]]
    assert len(node_ids) == len(set(node_ids)), "Duplicate node IDs found"


def test_canvas_edge_references_valid(db, canvas_gen, vault_dir):
    """All edge references point to existing nodes."""
    alice_id = _seed_entity(db, "Alice", "person")
    bob_id = _seed_entity(db, "Bob", "person")
    _seed_relationship(db, alice_id, bob_id, "works_with")

    path = canvas_gen.generate_relationship_map(min_relationships=1)
    data = _validate_canvas_json(path)

    node_ids = {n["id"] for n in data["nodes"]}
    for edge in data["edges"]:
        assert edge["fromNode"] in node_ids, f"fromNode {edge['fromNode']} not in nodes"
        assert edge["toNode"] in node_ids, f"toNode {edge['toNode']} not in nodes"
