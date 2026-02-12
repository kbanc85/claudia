"""Tests for canvas preservation in CanvasGenerator.

Covers Phase 4 canvas hash tracking, user-edit preservation, and
the _load_canvas_hashes / _save_canvas_hashes roundtrip.
"""

import json
from pathlib import Path

import pytest

from claudia_memory.services.canvas_generator import CanvasGenerator


def _insert_entity(db, name, entity_type="person", importance=0.8):
    """Insert a test entity and return its row ID."""
    db.execute(
        "INSERT INTO entities (name, canonical_name, type, description, importance) "
        "VALUES (?, ?, ?, '', ?)",
        (name, name.lower(), entity_type, importance),
    )
    rows = db.execute(
        "SELECT id FROM entities WHERE canonical_name = ?",
        (name.lower(),),
        fetch=True,
    )
    return rows[0]["id"]


def _insert_relationship(db, source_id, target_id, rel_type="works_with", strength=0.8):
    """Insert a test relationship between two entities."""
    db.execute(
        "INSERT INTO relationships "
        "(source_entity_id, target_entity_id, relationship_type, direction, strength, origin_type) "
        "VALUES (?, ?, ?, 'bidirectional', ?, 'user_stated')",
        (source_id, target_id, rel_type, strength),
    )


def test_canvas_hash_stored(db, tmp_path):
    """generate_all() writes canvas_hashes into _meta/last-sync.json."""
    gen = CanvasGenerator(tmp_path, db=db)

    gen.generate_all()

    meta_file = tmp_path / "_meta" / "last-sync.json"
    assert meta_file.exists()
    data = json.loads(meta_file.read_text())
    assert "canvas_hashes" in data

    hashes = data["canvas_hashes"]
    # Both standard canvases should have hash entries
    assert "relationship-map" in hashes
    assert "morning-brief" in hashes
    # Hashes should be non-empty hex strings
    assert len(hashes["relationship-map"]) > 0
    assert len(hashes["morning-brief"]) > 0


def test_canvas_preservation_modified(db, tmp_path):
    """A user-modified canvas is preserved; a -generated.canvas alternate is created."""
    gen = CanvasGenerator(tmp_path, db=db)

    # First generation
    results_1 = gen.generate_all()
    assert results_1["relationship_map"]["status"] == "ok"
    assert results_1["morning_brief"]["status"] == "ok"

    # Simulate user editing the relationship-map canvas
    canvas_path = tmp_path / "canvases" / "relationship-map.canvas"
    assert canvas_path.exists()
    original_data = json.loads(canvas_path.read_text())
    original_data["nodes"].append({
        "id": "user-custom-node",
        "type": "text",
        "text": "My custom annotation",
        "x": 100, "y": 100,
        "width": 200, "height": 80,
    })
    canvas_path.write_text(json.dumps(original_data, indent=2))

    # Second generation -- should detect the edit and preserve
    gen2 = CanvasGenerator(tmp_path, db=db)
    results_2 = gen2.generate_all()

    assert results_2["relationship_map"]["status"] == "preserved"
    assert "generated_path" in results_2["relationship_map"]

    # User's file should still have the custom node
    user_data = json.loads(canvas_path.read_text())
    node_ids = [n["id"] for n in user_data["nodes"]]
    assert "user-custom-node" in node_ids

    # The alternate generated file should exist
    alt_path = Path(results_2["relationship_map"]["generated_path"])
    assert alt_path.exists()
    assert alt_path.name == "relationship-map-generated.canvas"


def test_canvas_preservation_unmodified(db, tmp_path):
    """An unmodified canvas is regenerated in place (updated normally)."""
    gen = CanvasGenerator(tmp_path, db=db)

    # First generation
    gen.generate_all()
    canvas_path = tmp_path / "canvases" / "morning-brief.canvas"
    assert canvas_path.exists()
    first_content = canvas_path.read_text()

    # Second generation without modifications
    gen2 = CanvasGenerator(tmp_path, db=db)
    results = gen2.generate_all()

    assert results["morning_brief"]["status"] == "ok"
    # Canvas should be regenerated (updated in place)
    assert canvas_path.exists()

    # No alternate file should exist since we did not modify the canvas
    alt_path = tmp_path / "canvases" / "morning-brief-generated.canvas"
    assert not alt_path.exists()


def test_load_save_canvas_hashes(db, tmp_path):
    """_load_canvas_hashes and _save_canvas_hashes roundtrip correctly."""
    gen = CanvasGenerator(tmp_path, db=db)

    # Initially empty
    assert gen._load_canvas_hashes() == {}

    # Save some hashes
    test_hashes = {
        "relationship-map": "abc123def456",
        "morning-brief": "789012345678",
    }
    gen._save_canvas_hashes(test_hashes)

    # Load them back
    loaded = gen._load_canvas_hashes()
    assert loaded == test_hashes

    # Verify persistence in the JSON file
    meta_file = tmp_path / "_meta" / "last-sync.json"
    assert meta_file.exists()
    data = json.loads(meta_file.read_text())
    assert data["canvas_hashes"] == test_hashes

    # Update with new hashes and verify merge behavior
    updated_hashes = {
        "relationship-map": "new_hash_value",
        "morning-brief": "another_new_hash",
        "project-board": "extra_canvas_hash",
    }
    gen._save_canvas_hashes(updated_hashes)
    loaded2 = gen._load_canvas_hashes()
    assert loaded2 == updated_hashes
