"""Forward-looking regression tests for bug classes that have recurred across releases.

These tests are permanent sentinels guarding against five distinct bug
classes identified by the v1.55-v1.57 release-history analysis. Each test
maps to one historical bug class and the patch releases where that class
appeared. The tests are expected to PASS on a healthy main; they exist so
that any future regression of these specific failure modes is caught the
moment it lands rather than after a user-visible incident.

Bug class map:
    R1 -> Proposal #51 entity-linking regression (v1.58.0, PR #54)
    R2 -> "Semantic search actually works now" class
           (v1.51.18, v1.55.7 Recall Recovery, v1.55.8 Vector Search Fix)
    R3 -> Embedding migration column class
           (v1.35.1, v1.35.2 Embedding Migration, v1.51.17 Fix Embeddings)
    R4 -> Database migration / stale SHM class
           (v1.51.5 Database Migration Fix, v1.55.14 Daemon Stability Fix)
    R5 -> Bulletproof memory / memory tool guard class
           (v1.21.1 Bulletproof Memory, v1.40.1 Memory Tool Guard)

Conventions:
    - Uses the shared `db` fixture from conftest.py.
    - Wires services to the test DB via the same __new__/attribute-injection
      pattern used by tests/test_pipeline.py and tests/test_entity_resolution.py.
    - No mocks of internal services; tests exercise the real service layer.
"""

import json
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from claudia_memory.database import Database, content_hash


# ---------------------------------------------------------------------------
# Shared helpers (mirrors the pattern from test_pipeline.py / test_entity_resolution.py)
# ---------------------------------------------------------------------------


def _get_remember_service(db):
    """Build a RememberService bound to the provided test database."""
    from claudia_memory.services.remember import RememberService
    from claudia_memory.extraction.entity_extractor import get_extractor

    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc._embedder = None
    svc.extractor = get_extractor()
    svc.embedding_service = None
    return svc


def _get_recall_service(db):
    """Build a RecallService bound to the provided test database."""
    from claudia_memory.services.recall import RecallService
    from claudia_memory.extraction.entity_extractor import get_extractor
    from claudia_memory.config import MemoryConfig

    svc = RecallService.__new__(RecallService)
    svc.db = db
    svc.embedding_service = None
    svc.extractor = get_extractor()
    svc.config = MemoryConfig()
    return svc


# ---------------------------------------------------------------------------
# R1: Entity linking on remember_fact (Proposal #51 / PR #54, v1.58.0)
# ---------------------------------------------------------------------------


def test_remember_with_entities_creates_entity_records(db):
    """R1: entities passed to remember_fact must be created and linked.

    Bug class: Proposal #51 entity-linking regression.
    Historical releases: v1.58.0 (just fixed in PR #54).

    Scenario from 2026-05-13: calling remember_fact with about_entities=[...]
    must (1) create entity rows for missing names, (2) link the memory to
    each entity via memory_entities. If this ever regresses, downstream
    surfaces like memory_about / project network / recall_about silently
    fail to find the entity.

    This test is a permanent sentinel alongside the existing
    test_entity_resolution.py coverage from PR A.
    """
    svc = _get_remember_service(db)

    memory_id = svc.remember_fact(
        content="Matt Blumberg said the placement angle should be the operator track.",
        about_entities=["Matt Blumberg"],
    )
    assert memory_id is not None, "remember_fact must return a memory id"

    # Entity row exists.
    matt = db.get_one(
        "entities",
        where="canonical_name = ?",
        where_params=("matt blumberg",),
    )
    assert matt is not None, "Matt Blumberg entity should be created"

    # Memory is linked to the entity via memory_entities.
    links = db.execute(
        "SELECT entity_id FROM memory_entities WHERE memory_id = ?",
        (memory_id,),
        fetch=True,
    ) or []
    linked_ids = {row["entity_id"] for row in links}
    assert matt["id"] in linked_ids, (
        "memory_entities must contain a row linking the memory to Matt Blumberg. "
        "Without this link, memory_about('Matt Blumberg') silently misses the fact."
    )


# ---------------------------------------------------------------------------
# R2: Recall returns results after seed writes
#     ("Semantic Search Actually Works Now" class:
#      v1.51.18, v1.55.7 Recall Recovery, v1.55.8 Vector Search Fix)
# ---------------------------------------------------------------------------


def test_recall_returns_results_after_seed_writes(db):
    """R2: recall() must return results for content that was just remembered.

    Bug class: "Semantic Search Actually Works Now" -- recall silently
    returning zero results despite memories existing in the DB.
    Historical releases:
        v1.51.18 (recall regression),
        v1.55.7 (Recall Recovery Release),
        v1.55.8 (Vector Search Fix).

    Seeds 5 distinct memories via the real RememberService and asks the
    real RecallService for a phrase that appears in one of them. At least
    one result must come back. The point of this guard is not score
    accuracy -- it is detecting a "0 results" failure mode that has
    appeared in production multiple times.

    No Ollama is required: when embed_sync returns None (no live model),
    the service falls back to FTS5 -> LIKE, which is what users
    experience on a fresh machine before embeddings are warm.
    """
    remember_svc = _get_remember_service(db)
    recall_svc = _get_recall_service(db)

    seeded = [
        "The quarterly board meeting is scheduled for March 15",
        "Sarah Chen prefers email over Slack for important updates",
        "Project Phoenix kickoff happens next Tuesday at 10am",
        "Acme Corp signed the renewal contract last Friday",
        "Quentin owes us a follow-up on the supply chain question",
    ]
    for content in seeded:
        mid = remember_svc.remember_fact(
            content=content,
            memory_type="fact",
            importance=0.8,
            source="test",
        )
        assert mid is not None, f"seed write failed for: {content!r}"

    # Pick a phrase that clearly appears in one of the seeded memories.
    results = recall_svc.recall(
        "board meeting",
        include_low_importance=True,
    )

    assert len(results) >= 1, (
        f"recall returned 0 results after seeding {len(seeded)} memories. "
        "This is the v1.55.7 / v1.55.8 failure mode: writes succeed but "
        "reads silently come back empty."
    )
    assert any("board meeting" in r.content.lower() for r in results), (
        "recall returned results, but none matched the seeded phrase. "
        "Check the keyword/FTS fallback path in RecallService."
    )


# ---------------------------------------------------------------------------
# R3: Embedding migration preserves recall
#     (v1.35.1, v1.35.2 Embedding Migration, v1.51.17 Fix Embeddings)
# ---------------------------------------------------------------------------


def test_embedding_migration_preserves_recall(db):
    """R3: an embedding migration must not break recall on existing memories.

    Bug class: "Fix Embedding Migration Column" -- migrating to a new
    embedding dimension wiped recall for previously-stored memories,
    sometimes by losing a column reference, sometimes by leaving the
    embedding table in a dimension-mismatched state.
    Historical releases: v1.35.1, v1.35.2 (Embedding Migration),
    v1.51.17 (Fix Embeddings).

    Migration helpers live in database.py (Database.VEC0_TABLES) and the
    real migration step is "drop vec0 + recreate + re-embed". We don't
    require sqlite-vec to be present to verify the recall-still-works
    guarantee: we instead exercise the equivalent path that runs on
    machines without vec0 -- re-embedding a memory and confirming that
    subsequent recall still returns it via the FTS/keyword fallback. This
    matches what production users experience on the "embeddings warm
    after migration" gap.
    """
    remember_svc = _get_remember_service(db)
    recall_svc = _get_recall_service(db)

    # Step 1: seed a memory with a distinctive phrase.
    distinctive = "platinum giraffe operates the supply chain dashboard"
    mid = remember_svc.remember_fact(
        content=distinctive,
        memory_type="fact",
        importance=0.8,
        source="test",
    )
    assert mid is not None

    # Step 2: verify recall sees it before any migration step.
    results_before = recall_svc.recall("platinum giraffe", include_low_importance=True)
    assert len(results_before) >= 1, (
        "Pre-migration recall failed. This is upstream of R3 and means "
        "test R2 should also be failing. Investigate that first."
    )

    # Step 3: simulate the migration step that operates on the embedding
    # store. On a machine without vec0, memory_embeddings rows simply do
    # not exist for this memory, so the "drop + recreate" surface is a
    # no-op for the keyword fallback. On a vec0 machine the migration
    # would drop the vec0 table and re-embed. Either way, recall via
    # FTS/keyword must continue to return the memory because the
    # canonical row lives in `memories`, not in the embedding store.
    #
    # We exercise the migration's _meta touch (analogous to what
    # --migrate-embeddings does in production) to make sure the recall
    # path is not coupled to a stale _meta value.
    db.execute(
        "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_dimensions', ?)",
        ("768",),
    )
    db.execute(
        "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', ?)",
        ("nomic-embed-text",),
    )

    # Step 4: recall must still return the memory after the migration step.
    results_after = recall_svc.recall("platinum giraffe", include_low_importance=True)
    assert len(results_after) >= 1, (
        "Recall broke after a simulated embedding migration. This is the "
        "v1.35.1 / v1.35.2 / v1.51.17 failure mode: memories survive the "
        "migration in the `memories` table but recall stops returning them."
    )
    assert any("giraffe" in r.content.lower() for r in results_after)


# ---------------------------------------------------------------------------
# R4: Daemon DB-open tolerates a stale -shm file
#     (v1.51.5 Database Migration Fix, v1.55.14 Daemon Stability Fix)
# ---------------------------------------------------------------------------


def test_daemon_startup_with_stale_shm_file():
    """R4: opening a DB next to a stale `-shm` file must not raise.

    Bug class: "Database Migration Fix" / daemon stability. The installer
    at bin/index.js (around lines 1077-1108) defensively removes a stale
    `-shm`/`-wal` pair before the daemon starts. The daemon's own
    DB-open path should ALSO tolerate the situation, because users can
    end up with stale SHM after a hard kill, a crashed migration, or a
    file-system snapshot restore.
    Historical releases: v1.51.5 (Database Migration Fix),
    v1.55.14 (Daemon Stability Fix).

    Scenario:
      1. Create and initialise a DB, then close it.
      2. Plant a garbage `-shm` file next to the closed DB.
      3. Reopen the DB via the daemon's normal Database(path).initialize() path.
      4. Confirm a basic query still works without an unhandled exception.

    A real regression would surface as `sqlite3.DatabaseError: database
    disk image is malformed` on the first connection -- the exact symptom
    fixed in v1.51.5.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "claudia.db"

        # 1. Create + close a healthy DB.
        first = Database(db_path)
        first.initialize()
        # Force a write so the DB has real content.
        first.execute(
            "INSERT OR REPLACE INTO _meta (key, value) VALUES ('healthcheck', '1')"
        )
        first.close()

        # 2. Plant a stale (garbage-bytes) -shm file alongside the DB.
        shm_path = Path(str(db_path) + "-shm")
        shm_path.write_bytes(b"\x00" * 32 + b"stale-garbage-from-prior-crash")
        assert shm_path.exists()

        # 3. Reopen the DB and run a query through the normal daemon path.
        #    This must not raise -- if it does, R4 has regressed.
        reopened = Database(db_path)
        try:
            reopened.initialize()
            rows = reopened.execute(
                "SELECT value FROM _meta WHERE key = 'healthcheck'",
                fetch=True,
            ) or []
            assert rows, (
                "DB reopened without exception but the seed row was lost. "
                "This still counts as an R4 regression: the daemon now "
                "appears healthy while having silently discarded data."
            )
            assert rows[0]["value"] == "1"
        finally:
            reopened.close()


# ---------------------------------------------------------------------------
# R5: Briefing returns valid structure on an empty database
#     (v1.21.1 Bulletproof Memory, v1.40.1 Memory Tool Guard)
# ---------------------------------------------------------------------------


def test_briefing_returns_structure_when_db_empty(db, monkeypatch):
    """R5: memory_briefing must not crash or return None on an empty DB.

    Bug class: "Bulletproof Memory" / "Memory Tool Guard". When a user
    opens a brand-new workspace, every memory tool gets called against
    a freshly-initialised, empty database. Historically the briefing
    code path has raised on missing rows, returned None, or returned
    an empty string -- each of which Claude Code reports as a hard MCP
    tool failure to the user during their very first session.
    Historical releases: v1.21.1 (Bulletproof Memory),
    v1.40.1 (Memory Tool Guard).

    The real service entrypoint lives in
    claudia_memory.mcp.server._build_briefing(), which reads from the
    global get_db(). We rebind the module-level global to point at the
    test DB, call _build_briefing(), and verify:
      - it does NOT raise
      - it returns a non-empty string (not None, not "")
      - the structure contains the canonical "Session Briefing" header
        and at least one of the expected aggregate sections
    """
    import claudia_memory.database as db_mod

    old_db = db_mod._db
    db_mod._db = db
    try:
        # Importing inside the rebinding window so the module picks up
        # the test DB through get_db().
        from claudia_memory.mcp.server import _build_briefing

        briefing = _build_briefing()

        # Must not be None and must be a string.
        assert briefing is not None, (
            "_build_briefing returned None on an empty DB. This is the "
            "v1.21.1 'Bulletproof Memory' failure mode."
        )
        assert isinstance(briefing, str), (
            f"_build_briefing returned {type(briefing).__name__}, expected str."
        )

        # Must contain the canonical header.
        assert "Session Briefing" in briefing, (
            "Briefing output is missing the 'Session Briefing' header. "
            "Downstream parsers / Claudia's session-start protocol rely "
            "on this anchor."
        )

        # Must contain at least one of the structured sections that the
        # builder always emits. On an empty DB the fallback line
        # ("No context available yet...") OR the "Recent activity"
        # aggregate must appear -- both are valid healthy outputs and
        # both prove the function ran to completion instead of crashing
        # on the first missing query.
        assert (
            "No context available yet" in briefing
            or "Recent activity:" in briefing
        ), (
            "Briefing returned a string but none of the expected sections. "
            "This is the v1.40.1 'Memory Tool Guard' failure mode: the "
            "function appears to return content but the structure is broken."
        )
    finally:
        db_mod._db = old_db
