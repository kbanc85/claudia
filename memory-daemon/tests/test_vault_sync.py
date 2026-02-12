"""Tests for VaultSyncService - Obsidian vault export."""

import json
import tempfile
from pathlib import Path

import pytest

from claudia_memory.services.vault_sync import (
    VaultSyncService,
    _sanitize_filename,
    _compute_sync_hash,
    get_vault_path,
)


@pytest.fixture
def vault_dir():
    """Create a temporary vault directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def vault_svc(db, vault_dir):
    """Create a VaultSyncService with test database and temp vault."""
    return VaultSyncService(vault_dir, db=db)


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


def _seed_relationship(db, source_id, target_id, rel_type="works_with", strength=0.8):
    """Insert a test relationship."""
    db.execute(
        """INSERT INTO relationships
           (source_entity_id, target_entity_id, relationship_type, direction, strength, origin_type)
           VALUES (?, ?, ?, 'bidirectional', ?, 'user_stated')""",
        (source_id, target_id, rel_type, strength),
    )


# ── Utility function tests ─────────────────────────────────────


def test_sanitize_filename_basic():
    assert _sanitize_filename("Sarah Chen") == "Sarah Chen"


def test_sanitize_filename_special_chars():
    assert _sanitize_filename('File: "test" <draft>') == "File test draft"


def test_sanitize_filename_long():
    long_name = "A" * 150
    result = _sanitize_filename(long_name)
    assert len(result) <= 100


def test_sanitize_filename_empty():
    assert _sanitize_filename("") == "untitled"
    assert _sanitize_filename("...") == "untitled"


def test_compute_sync_hash():
    h1 = _compute_sync_hash("hello")
    h2 = _compute_sync_hash("hello")
    h3 = _compute_sync_hash("world")
    assert h1 == h2  # deterministic
    assert h1 != h3  # different content -> different hash
    assert len(h1) == 12  # 12 hex chars


# ── Entity export tests ─────────────────────────────────────────


def test_export_single_entity(db, vault_svc, vault_dir):
    """Export a single entity creates a markdown file with correct structure."""
    eid = _seed_entity(db, "Sarah Chen", "person", "VP of Engineering")
    _seed_memory(db, "Prefers email over Slack", eid, "preference")
    _seed_memory(db, "Send proposal by Friday", eid, "commitment")

    entity = db.execute(
        "SELECT * FROM entities WHERE id = ?", (eid,), fetch=True
    )[0]
    path = vault_svc.export_entity(entity)

    assert path is not None
    assert path.exists()
    assert path.parent.name == "people"
    assert path.name == "Sarah Chen.md"

    content = path.read_text()
    # Check frontmatter
    assert "---" in content
    assert f"claudia_id: {eid}" in content
    assert "type: person" in content
    assert "sync_hash:" in content
    # Check title
    assert "# Sarah Chen" in content
    # Check description
    assert "VP of Engineering" in content
    # Check memories by type
    assert "Prefers email over Slack" in content
    assert "Send proposal by Friday" in content


def test_export_entity_with_relationships(db, vault_svc, vault_dir):
    """Relationships render as [[wikilinks]]."""
    sarah_id = _seed_entity(db, "Sarah Chen", "person")
    jim_id = _seed_entity(db, "Jim Ferry", "person")
    _seed_relationship(db, sarah_id, jim_id, "works_with", 0.9)

    entity = db.execute(
        "SELECT * FROM entities WHERE id = ?", (sarah_id,), fetch=True
    )[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "## Relationships" in content
    assert "[[Jim Ferry]]" in content
    assert "works_with" in content


def test_export_entity_type_directories(db, vault_svc, vault_dir):
    """Different entity types go to correct subdirectories."""
    _seed_entity(db, "Acme Corp", "organization")
    _seed_entity(db, "Website Redesign", "project")

    entities = db.execute("SELECT * FROM entities", fetch=True)
    for entity in entities:
        vault_svc.export_entity(entity)

    assert (vault_dir / "organizations" / "Acme Corp.md").exists()
    assert (vault_dir / "projects" / "Website Redesign.md").exists()


def test_export_entity_with_aliases(db, vault_svc, vault_dir):
    """Aliases appear in frontmatter."""
    eid = _seed_entity(db, "Sarah Chen", "person")
    db.execute(
        "INSERT INTO entity_aliases (entity_id, alias, canonical_alias) VALUES (?, ?, ?)",
        (eid, "S. Chen", "s. chen"),
    )

    entity = db.execute("SELECT * FROM entities WHERE id = ?", (eid,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "aliases:" in content
    assert "S. Chen" in content


# ── Full export tests ────────────────────────────────────────────


def test_export_all(db, vault_svc, vault_dir):
    """Full export creates notes for all entities."""
    _seed_entity(db, "Alice", "person")
    _seed_entity(db, "Bob", "person")
    _seed_entity(db, "Acme", "organization")

    stats = vault_svc.export_all()

    assert stats["entities"] == 3
    assert (vault_dir / "people" / "Alice.md").exists()
    assert (vault_dir / "people" / "Bob.md").exists()
    assert (vault_dir / "organizations" / "Acme.md").exists()
    # Metadata written
    assert (vault_dir / "_meta" / "last-sync.json").exists()


def test_export_all_creates_directory_structure(db, vault_svc, vault_dir):
    """Full export creates all subdirectories even if empty."""
    vault_svc.export_all()

    for subdir in ["people", "projects", "organizations", "concepts",
                   "locations", "patterns", "reflections", "sessions",
                   "canvases", "_meta"]:
        assert (vault_dir / subdir).is_dir()


def test_export_all_skips_deleted_entities(db, vault_svc, vault_dir):
    """Deleted entities are not exported."""
    eid = _seed_entity(db, "Deleted Person", "person")
    db.execute(
        "UPDATE entities SET deleted_at = datetime('now') WHERE id = ?", (eid,)
    )

    stats = vault_svc.export_all()
    assert stats["entities"] == 0
    assert not (vault_dir / "people" / "Deleted Person.md").exists()


# ── Incremental export tests ────────────────────────────────────


def test_incremental_falls_back_to_full(db, vault_svc, vault_dir):
    """Incremental with no prior sync does a full export."""
    _seed_entity(db, "Alice", "person")

    stats = vault_svc.export_incremental()
    assert stats["entities"] == 1
    assert (vault_dir / "_meta" / "last-sync.json").exists()


def test_incremental_after_full(db, vault_svc, vault_dir):
    """Incremental after full only exports changed entities."""
    _seed_entity(db, "Alice", "person")
    vault_svc.export_all()

    # Add a new entity
    _seed_entity(db, "Bob", "person")

    stats = vault_svc.export_incremental()
    # Bob should be exported (new since last sync)
    assert (vault_dir / "people" / "Bob.md").exists()


# ── Sync metadata tests ─────────────────────────────────────────


def test_sync_metadata_written(db, vault_svc, vault_dir):
    """Sync metadata is written after export."""
    vault_svc.export_all()

    meta_path = vault_dir / "_meta" / "last-sync.json"
    assert meta_path.exists()
    data = json.loads(meta_path.read_text())
    assert "last_sync" in data
    assert "stats" in data


def test_sync_log_appended(db, vault_svc, vault_dir):
    """Sync log is appended after each export."""
    vault_svc.export_all()
    vault_svc.export_all()

    log_path = vault_dir / "_meta" / "sync-log.md"
    assert log_path.exists()
    lines = log_path.read_text().strip().split("\n")
    assert len(lines) == 2  # Two sync entries


# ── Status tests ─────────────────────────────────────────────────


def test_get_status_no_sync(db, vault_svc, vault_dir):
    """Status before any sync shows not synced."""
    status = vault_svc.get_status()
    assert status["synced"] is False
    assert status["last_sync"] is None


def test_get_status_after_sync(db, vault_svc, vault_dir):
    """Status after sync shows sync info and file counts."""
    _seed_entity(db, "Alice", "person")
    _seed_entity(db, "Acme", "organization")
    vault_svc.export_all()

    status = vault_svc.get_status()
    assert status["synced"] is True
    assert status["last_sync"] is not None
    assert status["file_counts"]["people"] == 1
    assert status["file_counts"]["organizations"] == 1


# ── Pattern export tests ────────────────────────────────────────


def test_export_patterns(db, vault_svc, vault_dir):
    """Active patterns are exported as notes."""
    db.execute(
        """INSERT INTO patterns (name, pattern_type, description, confidence, is_active, first_observed_at, last_observed_at)
           VALUES ('cooling-jim', 'cooling_relationship', 'No contact with Jim in 30 days', 0.8, 1, datetime('now'), datetime('now'))""",
    )

    vault_svc._ensure_directories()
    count = vault_svc._export_patterns()
    assert count == 1

    pattern_files = list((vault_dir / "patterns").glob("*.md"))
    assert len(pattern_files) == 1
    content = pattern_files[0].read_text()
    assert "cooling_relationship" in content.lower() or "Cooling Relationship" in content


# ── Reflection export tests ─────────────────────────────────────


def test_export_reflections(db, vault_svc, vault_dir):
    """Reflections are exported as notes."""
    db.execute(
        """INSERT INTO reflections
           (content, reflection_type, importance, confidence, first_observed_at, last_confirmed_at, aggregation_count)
           VALUES ('User prefers bullet points', 'observation', 0.7, 0.9, datetime('now'), datetime('now'), 3)""",
    )

    vault_svc._ensure_directories()
    count = vault_svc._export_reflections()
    assert count == 1

    ref_files = list((vault_dir / "reflections").glob("*.md"))
    assert len(ref_files) == 1
    content = ref_files[0].read_text()
    assert "bullet points" in content
    assert "times_confirmed: 3" in content


# ── Session export tests ────────────────────────────────────────


def test_export_sessions(db, vault_svc, vault_dir):
    """Summarized episodes are exported as daily session notes."""
    db.execute(
        """INSERT INTO episodes
           (session_id, is_summarized, narrative, started_at, ended_at, key_topics, summary)
           VALUES ('test-session', 1, 'Discussed Q2 roadmap', '2026-02-10T14:00:00', '2026-02-10T15:00:00', '["roadmap", "Q2"]', 'Q2 planning')""",
    )

    vault_svc._ensure_directories()
    count = vault_svc._export_sessions()
    assert count == 1

    session_files = list((vault_dir / "sessions").glob("*.md"))
    assert len(session_files) == 1
    content = session_files[0].read_text()
    assert "2026-02-10" in content
    assert "roadmap" in content


# ── Vault path resolution tests ─────────────────────────────────


def test_vault_path_default():
    """Default vault path uses 'default' folder."""
    path = get_vault_path(None)
    assert path.name == "default"
    assert "vault" in str(path)


def test_vault_path_project():
    """Project-specific vault path uses project hash."""
    path = get_vault_path("abc123")
    assert path.name == "abc123"
    assert "vault" in str(path)


# ── Commitment checkbox rendering ────────────────────────────────


def test_commitment_checkboxes(db, vault_svc, vault_dir):
    """Commitments render as Obsidian checkboxes."""
    eid = _seed_entity(db, "Alice", "person")
    _seed_memory(db, "Send report by Friday", eid, "commitment")

    entity = db.execute("SELECT * FROM entities WHERE id = ?", (eid,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "## Commitments" in content
    assert "- [ ] Send report by Friday" in content
