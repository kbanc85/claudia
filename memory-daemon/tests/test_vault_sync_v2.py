"""Tests for VaultSyncService Phase 1 + Phase 4 additions.

Covers entity export by name/ID, user edit detection, Dataview template
generation, and write-through graceful failure.
"""

import json
from pathlib import Path

import pytest

from claudia_memory.services.vault_sync import VaultSyncService


def _insert_entity(db, name, entity_type="person", importance=1.0):
    """Insert a test entity and return its row ID."""
    db.execute(
        "INSERT INTO entities (name, type, canonical_name, importance) VALUES (?, ?, ?, ?)",
        (name, entity_type, name.lower(), importance),
    )
    rows = db.execute(
        "SELECT id FROM entities WHERE canonical_name = ?",
        (name.lower(),),
        fetch=True,
    )
    return rows[0]["id"]


# ── Phase 1: export_entity_by_name / export_entity_by_id ──────────


def test_export_entity_by_name(db, tmp_path):
    """Exporting an entity by name creates a .md file in the correct subdirectory."""
    _insert_entity(db, "Test Person", "person", 1.0)
    service = VaultSyncService(tmp_path, db=db)

    result = service.export_entity_by_name("Test Person")

    assert result is not None
    assert result.exists()
    assert result.suffix == ".md"
    assert result.parent.name == "people"
    content = result.read_text()
    assert "# Test Person" in content
    assert "type: person" in content


def test_export_entity_by_id(db, tmp_path):
    """Exporting an entity by ID creates a .md file."""
    entity_id = _insert_entity(db, "Test Person", "person", 1.0)
    service = VaultSyncService(tmp_path, db=db)

    result = service.export_entity_by_id(entity_id)

    assert result is not None
    assert result.exists()
    assert result.suffix == ".md"
    content = result.read_text()
    assert f"claudia_id: {entity_id}" in content


def test_export_entity_by_name_not_found(db, tmp_path):
    """Exporting a nonexistent entity by name returns None without crashing."""
    service = VaultSyncService(tmp_path, db=db)

    result = service.export_entity_by_name("Nobody Here")

    assert result is None


# ── Phase 4: detect_user_edits ─────────────────────────────────────


def test_detect_unmodified_note(db, tmp_path):
    """An exported note with unchanged content shows no edits."""
    _insert_entity(db, "Test Person", "person", 1.0)
    service = VaultSyncService(tmp_path, db=db)
    service.export_entity_by_name("Test Person")

    edits = service.detect_user_edits()

    assert edits == []


def test_detect_modified_note(db, tmp_path):
    """Modifying an exported note's body triggers edit detection."""
    _insert_entity(db, "Test Person", "person", 1.0)
    service = VaultSyncService(tmp_path, db=db)
    filepath = service.export_entity_by_name("Test Person")
    assert filepath is not None

    # Simulate a user edit by appending content
    original = filepath.read_text()
    filepath.write_text(original + "\nUser added this line.\n")

    edits = service.detect_user_edits()

    assert len(edits) == 1
    assert edits[0]["file_path"] == str(filepath)
    assert edits[0]["old_hash"] != edits[0]["new_hash"]


# ── Dataview templates ─────────────────────────────────────────────


def test_dataview_templates_created(db, tmp_path):
    """Calling _export_dataview_templates creates 7 query notes in _queries/."""
    service = VaultSyncService(tmp_path, db=db)

    count = service._export_dataview_templates()

    assert count == 7
    queries_dir = tmp_path / "Claudia's Desk" / "_queries"
    assert queries_dir.is_dir()
    md_files = list(queries_dir.glob("*.md"))
    assert len(md_files) == 7

    expected_names = {
        "Upcoming Deadlines.md",
        "Cooling Relationships.md",
        "Active Network.md",
        "Recent Memories.md",
        "Open Commitments.md",
        "Entity Overview.md",
        "Session Log.md",
    }
    actual_names = {f.name for f in md_files}
    assert actual_names == expected_names


def test_dataview_templates_not_overwritten(db, tmp_path):
    """Once created, Dataview templates are not overwritten on subsequent calls."""
    service = VaultSyncService(tmp_path, db=db)
    service._export_dataview_templates()

    # Modify one template
    target = tmp_path / "Claudia's Desk" / "_queries" / "Active Network.md"
    custom_content = "# My Custom Active Network\nI changed this."
    target.write_text(custom_content)

    # Call again -- should not overwrite
    count = service._export_dataview_templates()

    assert count == 0  # No new templates created
    assert target.read_text() == custom_content


# ── Write-through graceful failure ─────────────────────────────────


def test_write_through_graceful_failure(db, tmp_path):
    """The service handles write failures gracefully without crashing."""
    _insert_entity(db, "Test Person", "person", 1.0)

    # Point the vault at a path inside a file (not a directory), so directory
    # creation inside export_entity will work but we verify the service
    # doesn't crash when things go wrong.  Use a read-only directory to
    # simulate a blocked write.
    blocked_path = tmp_path / "blocked"
    blocked_path.mkdir()

    service = VaultSyncService(blocked_path, db=db)

    # Export should succeed normally when the path exists
    result = service.export_entity_by_name("Test Person")
    assert result is not None

    # Now make the target file read-only and try to overwrite
    result.chmod(0o444)
    result.parent.chmod(0o555)

    try:
        # Re-export should fail gracefully (return None), not raise
        result2 = service.export_entity_by_id(
            db.execute(
                "SELECT id FROM entities WHERE canonical_name = ?",
                ("test person",),
                fetch=True,
            )[0]["id"]
        )
        # The method returns None on IOError
        assert result2 is None
    finally:
        # Restore permissions for cleanup
        result.parent.chmod(0o755)
        result.chmod(0o644)
