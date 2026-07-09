"""OKF conformance for the vault projection builders (vault_sync.py).

All five frontmatter builders (entity notes, patterns, reflections, session
logs, and the MOC ``_Index`` builder) emit OKF-conformant frontmatter via
``claudia_memory.okf``.

Sync-hash safety (the subtle part, plan Task 7 step 1)
------------------------------------------------------
``sync_hash`` is computed over the note BODY only: at write time
``sync_hash = _compute_sync_hash(body)`` where ``body`` is the sections join,
NOT including the frontmatter (see ``write_entity_note``). ``detect_user_edits``
recomputes ``_compute_sync_hash(body)`` after splitting the file with
``raw.split("---", 2)`` (``_parse_frontmatter``); ``maxsplit=2`` stops after the
closing fence, so the body's own ``---`` horizontal rule stays in the body and
the frontmatter is never hashed.

Consequence: reformatting the FRONTMATTER (which this change does) cannot alter
the stored hash or the extracted body, so a re-sync produces zero spurious
user-edit flags. The builders must preserve three invariants for this to hold,
and these tests assert all three:
  1. ``sync_hash`` stays in the emitted frontmatter with its body-derived value.
  2. The body bytes are untouched.
  3. No bare ``---`` line is emitted inside the frontmatter block (which would
     corrupt ``split("---", 2)``).
"""

import json
import tempfile
from pathlib import Path

import pytest

from claudia_memory import okf
from claudia_memory.services.vault_sync import (
    VaultSyncService,
    _compute_sync_hash,
)


@pytest.fixture
def vault_dir():
    with tempfile.TemporaryDirectory() as tmp:
        yield Path(tmp)


@pytest.fixture
def svc(db, vault_dir):
    return VaultSyncService(vault_dir, db=db)


# ── seed helpers ─────────────────────────────────────────────────


def _seed_entity(db, name, entity_type="person", description="", importance=0.8,
                 attention_tier=None, contact_trend=None):
    db.execute(
        """INSERT INTO entities (name, canonical_name, type, description, importance,
           attention_tier, contact_trend) VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (name, name.lower(), entity_type, description, importance,
         attention_tier, contact_trend),
    )
    return db.execute(
        "SELECT * FROM entities WHERE canonical_name = ?", (name.lower(),), fetch=True
    )[0]


def _seed_pattern(db, name="Delays on Fridays", ptype="scheduling",
                  desc="Tends to push work to Friday afternoons."):
    db.execute(
        """INSERT INTO patterns (name, description, pattern_type, confidence, is_active,
           first_observed_at) VALUES (?, ?, ?, 0.75, 1, '2026-05-10T00:00:00')""",
        (name, desc, ptype),
    )


def _seed_reflection(db, rtype="learning", content="Prefers bullet points over prose."):
    db.execute(
        """INSERT INTO reflections (reflection_type, content, importance, confidence,
           aggregation_count, first_observed_at, last_confirmed_at)
           VALUES (?, ?, 0.7, 0.9, 2, '2026-05-10T00:00:00', '2026-05-14T00:00:00')""",
        (rtype, content),
    )


def _seed_episode(db, session_id="s1", started="2026-05-15T09:00:00",
                  narrative="Worked with Sarah Chen on the launch plan."):
    db.execute(
        """INSERT INTO episodes (session_id, narrative, started_at, is_summarized, key_topics)
           VALUES (?, ?, ?, 1, ?)""",
        (session_id, narrative, started, json.dumps(["planning"])),
    )


def _people_note(svc):
    return next((svc.vault_path / "Relationships" / "people").glob("*.md"))


# ── entity notes ─────────────────────────────────────────────────


def test_entity_note_emits_okf_core_and_keeps_extensions(db, svc):
    ent = _seed_entity(db, "Sarah Chen", "person", description="VP Engineering at Acme.")
    svc._ensure_directories()
    path = svc.export_entity(ent)
    assert path is not None
    raw = path.read_text(encoding="utf-8")
    data, _ = okf.parse_frontmatter(raw)

    # OKF core
    assert data["type"] == "person"
    assert data["type"] in okf.TYPE_VOCABULARY
    assert data["title"] == "Sarah Chen"                # title = canonical display name
    assert data["description"] == "VP Engineering at Acme."
    assert data.get("timestamp")                         # from updated_at

    # Claudia extensions preserved
    assert data["name"] == "Sarah Chen"                  # legacy key kept alongside title
    assert str(data["claudia_id"]) == str(ent["id"])
    assert data["cssclasses"] == ["entity-person"]
    assert "sync_hash" in data


def test_entity_note_sync_hash_matches_body(db, svc):
    ent = _seed_entity(db, "Sarah Chen", "person", description="VP Eng")
    svc._ensure_directories()
    path = svc.export_entity(ent)
    raw = path.read_text(encoding="utf-8")
    # Use the SAME extraction detect_user_edits uses.
    fm, body = VaultSyncService._parse_frontmatter(raw)
    assert _compute_sync_hash(body) == fm["sync_hash"]


def test_entity_frontmatter_has_no_bare_dash_fence_inside_block(db, svc):
    ent = _seed_entity(db, "Sarah Chen", "person", description="Has -- dashes")
    svc._ensure_directories()
    raw = svc.export_entity(ent).read_text(encoding="utf-8")
    # Everything up to the SECOND '---' is the frontmatter block.
    parts = raw.split("---", 2)
    assert len(parts) == 3  # exactly two fences bound a clean block


def test_resync_produces_no_user_edit_flags(db, svc):
    _seed_entity(db, "Sarah Chen", "person", description="VP Eng")
    _seed_entity(db, "Acme Corp", "organization", description="Client")
    svc.export_all()
    assert svc.detect_user_edits() == []   # first sync: clean
    svc.export_all()                        # format is stable across syncs
    assert svc.detect_user_edits() == []   # still clean, no spurious flags


def test_frontmatter_only_change_is_not_a_user_edit(db, svc):
    _seed_entity(db, "Sarah Chen", "person")
    svc.export_all()
    note = _people_note(svc)
    raw = note.read_text(encoding="utf-8")
    # Mutate ONLY the frontmatter (add an extension field). Body untouched.
    note.write_text(raw.replace("type: person", "type: person\nextra_marker: hi", 1),
                    encoding="utf-8")
    edits = svc.detect_user_edits()
    assert all(e["file_path"] != str(note) for e in edits)


def test_body_change_is_a_user_edit(db, svc):
    _seed_entity(db, "Sarah Chen", "person")
    svc.export_all()
    note = _people_note(svc)
    note.write_text(note.read_text(encoding="utf-8") + "\n\nUSER ADDED A LINE\n",
                    encoding="utf-8")
    edits = svc.detect_user_edits()
    assert any(e["file_path"] == str(note) for e in edits)


# ── Claudia's Desk builders ──────────────────────────────────────


def test_pattern_note_okf(db, svc):
    _seed_pattern(db)
    svc._ensure_directories()
    assert svc._export_patterns() == 1
    note = next((svc.vault_path / "Claudia's Desk" / "patterns").glob("*.md"))
    data, _ = okf.parse_frontmatter(note.read_text(encoding="utf-8"))
    assert data["type"] == "pattern"
    assert data.get("title")
    assert data["pattern_type"] == "scheduling"   # extension preserved
    assert "claudia_id" in data


def test_pattern_builder_is_deterministic(db, svc):
    _seed_pattern(db)
    svc._ensure_directories()
    svc._export_patterns()
    note = next((svc.vault_path / "Claudia's Desk" / "patterns").glob("*.md"))
    first = note.read_text(encoding="utf-8")
    svc._export_patterns()  # overwrite
    assert note.read_text(encoding="utf-8") == first  # stable across syncs


def test_reflection_note_okf(db, svc):
    _seed_reflection(db)
    svc._ensure_directories()
    assert svc._export_reflections() == 1
    note = next((svc.vault_path / "Claudia's Desk" / "reflections").glob("*.md"))
    data, _ = okf.parse_frontmatter(note.read_text(encoding="utf-8"))
    assert data["type"] == "reflection"
    assert data.get("title")
    assert data["reflection_type"] == "learning"
    assert data["times_confirmed"] == 2


def test_session_log_okf(db, svc):
    _seed_episode(db)
    svc._ensure_directories()
    assert svc._export_sessions() == 1
    notes = list((svc.vault_path / "Claudia's Desk" / "sessions").rglob("*.md"))
    assert notes
    data, _ = okf.parse_frontmatter(notes[0].read_text(encoding="utf-8"))
    assert data["type"] == "session-log"
    assert data.get("title")
    assert data["session_count"] == 1


def test_moc_index_has_type_moc(db, svc):
    _seed_entity(db, "Sarah Chen", "person")
    svc._ensure_directories()
    svc._export_moc_indices()
    idx = svc.vault_path / "Relationships" / "people" / "_Index.md"
    assert idx.exists()
    data, _ = okf.parse_frontmatter(idx.read_text(encoding="utf-8"))
    assert data["type"] == "moc"                  # recon C4 fix
    assert data["type"] in okf.TYPE_VOCABULARY
    assert data["cssclasses"] == ["moc-index"]    # extension preserved
