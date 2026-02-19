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


def _seed_entity(db, name, entity_type="person", description="", importance=0.8,
                 attention_tier=None, contact_trend=None, contact_frequency_days=None,
                 last_contact_at=None):
    """Insert a test entity and return its id."""
    db.execute(
        """INSERT INTO entities (name, canonical_name, type, description, importance,
           attention_tier, contact_trend, contact_frequency_days, last_contact_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (name, name.lower(), entity_type, description, importance,
         attention_tier, contact_trend, contact_frequency_days, last_contact_at),
    )
    rows = db.execute(
        "SELECT id FROM entities WHERE canonical_name = ?",
        (name.lower(),),
        fetch=True,
    )
    return rows[0]["id"]


def _seed_memory(db, content, entity_id, memory_type="fact", importance=0.7,
                 origin_type="user_stated", verification_status="pending"):
    """Insert a test memory linked to an entity."""
    db.execute(
        """INSERT INTO memories (content, type, importance, source, origin_type, confidence,
           verification_status)
           VALUES (?, ?, ?, 'test', ?, 1.0, ?)""",
        (content, memory_type, importance, origin_type, verification_status),
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
    assert 'name: "Sarah Chen"' in content
    assert "sync_hash:" in content
    # Check title
    assert "# Sarah Chen" in content
    # Check description
    assert "VP of Engineering" in content
    # Check memories
    assert "Prefers email over Slack" in content
    assert "Send proposal by Friday" in content
    # Check sync footer
    assert "Last synced:" in content


def test_export_entity_with_relationships(db, vault_svc, vault_dir):
    """Relationships render as a table with [[wikilinks]]."""
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
    # Table format
    assert "| Connection | Type | Strength |" in content


def test_export_entity_type_directories(db, vault_svc, vault_dir):
    """Different entity types go to correct subdirectories."""
    _seed_entity(db, "Acme Corp", "organization")
    _seed_entity(db, "Website Redesign", "project")

    entities = db.execute("SELECT * FROM entities", fetch=True)
    for entity in entities:
        vault_svc.export_entity(entity)

    assert (vault_dir / "Relationships" / "organizations" / "Acme Corp.md").exists()
    assert (vault_dir / "Active" / "Website Redesign.md").exists()


def test_export_entity_with_aliases(db, vault_svc, vault_dir):
    """Aliases appear as proper YAML list in frontmatter."""
    eid = _seed_entity(db, "Sarah Chen", "person")
    db.execute(
        "INSERT INTO entity_aliases (entity_id, alias, canonical_alias) VALUES (?, ?, ?)",
        (eid, "S. Chen", "s. chen"),
    )

    entity = db.execute("SELECT * FROM entities WHERE id = ?", (eid,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "aliases:" in content
    assert '  - "S. Chen"' in content


# ── Full export tests ────────────────────────────────────────────


def test_export_all(db, vault_svc, vault_dir):
    """Full export creates notes for all entities."""
    _seed_entity(db, "Alice", "person")
    _seed_entity(db, "Bob", "person")
    _seed_entity(db, "Acme", "organization")

    stats = vault_svc.export_all()

    assert stats["entities"] == 3
    assert (vault_dir / "Relationships" / "people" / "Alice.md").exists()
    assert (vault_dir / "Relationships" / "people" / "Bob.md").exists()
    assert (vault_dir / "Relationships" / "organizations" / "Acme.md").exists()
    # Metadata written
    assert (vault_dir / "_meta" / "last-sync.json").exists()


def test_export_all_creates_directory_structure(db, vault_svc, vault_dir):
    """Full export creates all subdirectories including .obsidian."""
    vault_svc.export_all()

    for subdir in ["Active", "Relationships/people", "Relationships/organizations",
                   "Reference/concepts", "Reference/locations",
                   "Claudia's Desk", "Claudia's Desk/patterns",
                   "Claudia's Desk/reflections", "Claudia's Desk/sessions",
                   "canvases", "_meta", ".obsidian"]:
        assert (vault_dir / subdir).is_dir(), f"Missing: {subdir}"


def test_export_all_skips_deleted_entities(db, vault_svc, vault_dir):
    """Deleted entities are not exported."""
    eid = _seed_entity(db, "Deleted Person", "person")
    db.execute(
        "UPDATE entities SET deleted_at = datetime('now') WHERE id = ?", (eid,)
    )

    stats = vault_svc.export_all()
    assert stats["entities"] == 0
    assert not (vault_dir / "Relationships" / "people" / "Deleted Person.md").exists()


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
    assert (vault_dir / "Relationships" / "people" / "Bob.md").exists()


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
    # Counts include entity notes + _Index.md MOC files (PARA paths)
    assert status["file_counts"]["Relationships/people"] >= 1
    assert status["file_counts"]["Relationships/organizations"] >= 1


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

    pattern_files = list((vault_dir / "Claudia's Desk" / "patterns").glob("*.md"))
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

    ref_files = list((vault_dir / "Claudia's Desk" / "reflections").glob("*.md"))
    assert len(ref_files) == 1
    content = ref_files[0].read_text()
    assert "bullet points" in content
    assert "times_confirmed: 3" in content


# ── Session export tests ────────────────────────────────────────


def test_export_sessions(db, vault_svc, vault_dir):
    """Sessions export to hierarchical date paths."""
    db.execute(
        """INSERT INTO episodes
           (session_id, is_summarized, narrative, started_at, ended_at, key_topics, summary)
           VALUES ('test-session', 1, 'Discussed Q2 roadmap', '2026-02-10T14:00:00', '2026-02-10T15:00:00', '["roadmap", "Q2"]', 'Q2 planning')""",
    )

    vault_svc._ensure_directories()
    count = vault_svc._export_sessions()
    assert count == 1

    # Hierarchical path: Claudia's Desk/sessions/2026/02/2026-02-10.md
    session_file = vault_dir / "Claudia's Desk" / "sessions" / "2026" / "02" / "2026-02-10.md"
    assert session_file.exists()
    content = session_file.read_text()
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


# ══════════════════════════════════════════════════════════════════
# NEW V2 TESTS: Frontmatter, Note Body, Navigation, Config
# ══════════════════════════════════════════════════════════════════


# ── Frontmatter v2 tests ─────────────────────────────────────────


def test_frontmatter_contact_fields(db, vault_svc, vault_dir):
    """Frontmatter includes contact velocity fields when available."""
    eid = _seed_entity(
        db, "Sarah Chen", "person", importance=0.85,
        attention_tier="active", contact_trend="stable",
        contact_frequency_days=4.2, last_contact_at="2026-02-10T14:00:00",
    )

    entity = db.execute("SELECT * FROM entities WHERE id = ?", (eid,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "attention_tier: active" in content
    assert "contact_trend: stable" in content
    assert "contact_frequency_days: 4.2" in content
    assert "last_contact: 2026-02-10" in content


def test_frontmatter_compound_tags(db, vault_svc, vault_dir):
    """Tags include entity type, attention tier, and contact trend."""
    eid = _seed_entity(
        db, "Sarah Chen", "person",
        attention_tier="active", contact_trend="stable",
    )

    entity = db.execute("SELECT * FROM entities WHERE id = ?", (eid,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "  - person" in content
    assert "  - active" in content
    assert "  - stable" in content


def test_frontmatter_cssclasses(db, vault_svc, vault_dir):
    """CSS classes include entity type for per-type styling."""
    eid = _seed_entity(db, "Sarah Chen", "person")
    entity = db.execute("SELECT * FROM entities WHERE id = ?", (eid,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "cssclasses:" in content
    assert "  - entity-person" in content


# ── Note body v2 tests ───────────────────────────────────────────


def test_status_callout_person(db, vault_svc, vault_dir):
    """Person entities get a status callout box."""
    eid = _seed_entity(
        db, "Sarah Chen", "person", importance=0.85,
        attention_tier="active", contact_trend="stable",
        last_contact_at="2026-02-10T14:00:00",
    )

    entity = db.execute("SELECT * FROM entities WHERE id = ?", (eid,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "> [!info] Status" in content
    assert "**Attention:** Active" in content
    assert "**Trend:** Stable" in content


def test_relationship_table(db, vault_svc, vault_dir):
    """Relationships render as a markdown table."""
    sarah_id = _seed_entity(db, "Sarah Chen", "person")
    jim_id = _seed_entity(db, "Jim Ferry", "person")
    _seed_relationship(db, sarah_id, jim_id, "works_with", 0.9)

    entity = db.execute("SELECT * FROM entities WHERE id = ?", (sarah_id,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "| [[Jim Ferry]] | works_with | 0.9 |" in content


def test_verification_grouping(db, vault_svc, vault_dir):
    """Memories are grouped by verification status in callouts."""
    eid = _seed_entity(db, "Sarah Chen", "person")
    _seed_memory(db, "Verified fact", eid, "fact", origin_type="user_stated",
                 verification_status="verified")
    _seed_memory(db, "Unverified observation", eid, "observation", origin_type="inferred",
                 verification_status="pending")

    entity = db.execute("SELECT * FROM entities WHERE id = ?", (eid,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "> [!note] Verified" in content
    assert "Verified fact" in content
    assert "> [!warning] Unverified" in content
    assert "Unverified observation" in content


def test_interaction_timeline(db, vault_svc, vault_dir):
    """Recent sessions render as callout blocks."""
    eid = _seed_entity(db, "Sarah Chen", "person")
    db.execute(
        """INSERT INTO episodes (session_id, is_summarized, narrative, started_at)
           VALUES ('sess-1', 1, 'Discussed roadmap with Sarah Chen', '2026-02-10T14:00:00')""",
    )

    entity = db.execute("SELECT * FROM entities WHERE id = ?", (eid,), fetch=True)[0]
    path = vault_svc.export_entity(entity)
    content = path.read_text()

    assert "## Recent Interactions" in content
    assert "> [!example]" in content
    assert "Discussed roadmap" in content


# ── Navigation tests ─────────────────────────────────────────────


def test_home_dashboard_created(db, vault_svc, vault_dir):
    """Full export creates Home.md dashboard."""
    _seed_entity(db, "Alice", "person")
    vault_svc.export_all()

    home = vault_dir / "Home.md"
    assert home.exists()
    content = home.read_text()
    assert "# Home" in content
    assert "Active" in content or "Relationships" in content


def test_moc_indices_created(db, vault_svc, vault_dir):
    """Full export creates _Index.md in each entity type directory."""
    _seed_entity(db, "Alice", "person")
    _seed_entity(db, "Acme", "organization")
    vault_svc.export_all()

    assert (vault_dir / "Relationships" / "people" / "_Index.md").exists()
    assert (vault_dir / "Relationships" / "organizations" / "_Index.md").exists()

    content = (vault_dir / "Relationships" / "people" / "_Index.md").read_text()
    assert "[[Alice]]" in content


def test_attention_items_in_dashboard(db, vault_svc, vault_dir):
    """Dashboard shows entities needing attention."""
    _seed_entity(
        db, "Jim Ferry", "person", importance=0.7,
        attention_tier="watchlist", contact_trend="dormant",
        last_contact_at="2026-01-01T10:00:00",
    )
    vault_svc.export_all()

    content = (vault_dir / "Home.md").read_text()
    assert "[[Jim Ferry]]" in content
    assert "dormant" in content


# ── Session tests ────────────────────────────────────────────────


def test_session_hierarchical_path(db, vault_svc, vault_dir):
    """Sessions use hierarchical YYYY/MM/date.md paths."""
    db.execute(
        """INSERT INTO episodes
           (session_id, is_summarized, narrative, started_at)
           VALUES ('s1', 1, 'Test narrative', '2026-02-10T14:00:00')""",
    )
    vault_svc._ensure_directories()
    vault_svc._export_sessions()

    assert (vault_dir / "Claudia's Desk" / "sessions" / "2026" / "02" / "2026-02-10.md").exists()


def test_narrative_wikification(db, vault_svc, vault_dir):
    """Entity names in session narratives are wrapped in [[wikilinks]]."""
    _seed_entity(db, "Sarah Chen", "person")
    db.execute(
        """INSERT INTO episodes
           (session_id, is_summarized, narrative, started_at)
           VALUES ('s1', 1, 'Met with Sarah Chen about the project', '2026-02-10T14:00:00')""",
    )

    vault_svc._ensure_directories()
    vault_svc._export_sessions()

    session_file = vault_dir / "Claudia's Desk" / "sessions" / "2026" / "02" / "2026-02-10.md"
    content = session_file.read_text()
    assert "[[Sarah Chen]]" in content


# ── .obsidian config tests ───────────────────────────────────────


def test_obsidian_config_created(db, vault_svc, vault_dir):
    """Full export creates .obsidian/ config files."""
    vault_svc.export_all()

    assert (vault_dir / ".obsidian" / "graph.json").exists()
    assert (vault_dir / ".obsidian" / "snippets" / "claudia-theme.css").exists()
    assert (vault_dir / ".obsidian" / "app.json").exists()
    assert (vault_dir / ".obsidian" / "workspace.json").exists()
    assert (vault_dir / ".obsidian" / "appearance.json").exists()


def test_obsidian_config_not_overwritten(db, vault_svc, vault_dir):
    """Obsidian config files are not overwritten on subsequent syncs."""
    vault_svc.export_all()

    # Modify graph.json
    graph_path = vault_dir / ".obsidian" / "graph.json"
    custom = '{"custom": true}'
    graph_path.write_text(custom)

    # Run again
    vault_svc.export_all()

    # Should not be overwritten
    assert graph_path.read_text() == custom


# ── Format versioning tests ──────────────────────────────────────


def test_format_version_in_metadata(db, vault_svc, vault_dir):
    """Sync metadata includes vault_format_version."""
    vault_svc.export_all()

    meta = json.loads((vault_dir / "_meta" / "last-sync.json").read_text())
    assert meta["vault_format_version"] == 2
