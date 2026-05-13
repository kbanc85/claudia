"""Tests for entity resolution on memory.remember (Proposal #51).

Confirmed bug from 2026-05-13:
    memory_remember(content="Matt Blumberg said X",
                    entities=["Matt Blumberg", "Markup AI"])

Behaviour observed:
    - Matt Blumberg got linked correctly (a "person").
    - Markup AI was auto-created with type="person" because the
      _infer_entity_type heuristic does not recognise the "AI" suffix
      as a corporate indicator.
    - memory_about("Markup AI") therefore surfaces a misclassified entity.

These tests pin the fix: entities passed via about_entities must be
created if missing, linked to the memory, and given a sensible type
(organization for corporate suffixes, project for project names,
concept as fallback -- never person by default).
"""

from datetime import datetime

import pytest


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


def _get_remember_service(db):
    """Create a RememberService wired to the test database.

    Matches the pattern from test_fuzzy_entity.py / test_entity_type_inference.py.
    """
    from claudia_memory.services.remember import RememberService

    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc._embedder = None
    from claudia_memory.extraction.entity_extractor import get_extractor

    svc.extractor = get_extractor()
    svc.embedding_service = None
    return svc


def _entity_by_name(db, name):
    """Look up an entity by its (lowercased) canonical_name."""
    return db.get_one(
        "entities",
        where="canonical_name = ?",
        where_params=(name.lower(),),
    )


# ---------------------------------------------------------------------------
# 1. Bug-repro: the exact 2026-05-13 scenario from Proposal #51
# ---------------------------------------------------------------------------


class TestProposal51Repro:
    """The single failing test that drove this fix."""

    def test_remember_with_entities_creates_entity_records(self, db):
        """Repro of Proposal #51 bug from 2026-05-13.

        memory_remember with entities=[...] must:
          1. create an entity row for each name (if missing)
          2. classify the type sensibly (Markup AI -> organization, not person)
          3. link the memory to each entity via memory_entities

        Before the fix, "Markup AI" was created as type="person" because the
        _infer_entity_type heuristic did not recognise the "AI" corporate
        suffix. This test fails on main and passes after the fix.
        """
        svc = _get_remember_service(db)

        memory_id = svc.remember_fact(
            content="Matt Blumberg said the placement angle should be the operator track.",
            about_entities=["Matt Blumberg", "Markup AI"],
        )
        assert memory_id is not None, "memory should have been created"

        # 1. Both entities exist.
        matt = _entity_by_name(db, "Matt Blumberg")
        markup = _entity_by_name(db, "Markup AI")
        assert matt is not None, "Matt Blumberg entity should be created"
        assert markup is not None, "Markup AI entity should be created"

        # 2. Types are correct.
        assert matt["type"] == "person", "Matt Blumberg should be a person"
        assert markup["type"] == "organization", (
            f"Markup AI should be an organization (got {markup['type']!r}). "
            "Proposal #51: AI suffix indicates a company, not a person."
        )

        # 3. Memory is linked to both entities.
        links = db.execute(
            "SELECT entity_id FROM memory_entities WHERE memory_id = ?",
            (memory_id,),
            fetch=True,
        ) or []
        linked_ids = {row["entity_id"] for row in links}
        assert matt["id"] in linked_ids, "memory should be linked to Matt Blumberg"
        assert markup["id"] in linked_ids, "memory should be linked to Markup AI"


# ---------------------------------------------------------------------------
# 2. Type inference heuristics (organization / person / project / concept)
# ---------------------------------------------------------------------------


class TestInferEntityTypeHeuristics:
    """Pure-function tests on infer_entity_type.

    These extend the existing test_entity_type_inference.py coverage with
    the new heuristics that Proposal #51 requires (AI suffix, fallback to
    concept instead of person).
    """

    def _infer(self, name, content=""):
        from claudia_memory.services.entities import infer_entity_type

        return infer_entity_type(name, content)

    # Organization signals -------------------------------------------------

    def test_ai_suffix_is_organization(self):
        """'Markup AI' must classify as organization (Proposal #51 core)."""
        assert self._infer("Markup AI") == "organization"

    def test_dot_ai_suffix_is_organization(self):
        assert self._infer("Hugging.ai") == "organization"

    def test_co_suffix_is_organization(self):
        assert self._infer("Banc Co.") == "organization"

    def test_inc_suffix_is_organization(self):
        assert self._infer("Acme Inc.") == "organization"

    def test_llc_suffix_is_organization(self):
        assert self._infer("Acme LLC") == "organization"

    def test_corp_suffix_is_organization(self):
        assert self._infer("Acme Corp") == "organization"

    def test_ltd_suffix_is_organization(self):
        assert self._infer("Acme Ltd") == "organization"

    # Person signals -------------------------------------------------------

    def test_first_last_name_is_person(self):
        """Two capitalised words (no corporate suffix) -> person."""
        assert self._infer("Matt Blumberg") == "person"

    def test_three_name_pattern_is_person(self):
        """Three capitalised words with no suffix -> still a person."""
        assert self._infer("Mary Anne Smith") == "person"

    # Project signals ------------------------------------------------------

    def test_project_prefix_is_project(self):
        assert self._infer("Project Phoenix") == "project"

    def test_project_suffix_is_project(self):
        """'Phoenix Project' should be classified as project."""
        assert self._infer("Phoenix Project") == "project"

    # Concept fallback -----------------------------------------------------

    def test_single_capitalised_word_is_concept(self):
        """A single capitalised noun with no other signal -> concept.

        Proposal #51 specifically: the fallback must NOT be 'person'.
        """
        assert self._infer("Curiosity") == "concept"

    def test_lowercase_unknown_falls_back_to_concept(self):
        """No-signal, no-pattern strings fall through to concept (never person)."""
        assert self._infer("something vague") == "concept"

    def test_no_signal_returns_concept_not_person(self):
        """Explicit guard: 'aibrain' looks weird, must not default to person."""
        assert self._infer("aibrain") == "concept"


# ---------------------------------------------------------------------------
# 3. relate_entities also uses inference (no more default-to-person)
# ---------------------------------------------------------------------------


class TestRelateUsesTypeInference:
    """relate_entities auto-creates source/target with inferred types."""

    def test_relate_creates_org_when_target_has_ai_suffix(self, db):
        """memory.relate(source='Matt Blumberg', target='Markup AI', ...) creates
        Markup AI as type=organization, not person.
        """
        svc = _get_remember_service(db)
        svc.relate_entities(
            source_name="Matt Blumberg",
            target_name="Markup AI",
            relationship_type="ceo_of",
        )

        markup = _entity_by_name(db, "Markup AI")
        assert markup is not None
        assert markup["type"] == "organization"

    def test_relate_creates_person_for_plain_name(self, db):
        """Plain first+last name still defaults to person."""
        svc = _get_remember_service(db)
        svc.relate_entities(
            source_name="Matt Blumberg",
            target_name="Holly Smith",
            relationship_type="works_with",
        )

        holly = _entity_by_name(db, "Holly Smith")
        assert holly is not None
        assert holly["type"] == "person"


# ---------------------------------------------------------------------------
# 4. Backfill command: dry-run is default
# ---------------------------------------------------------------------------


def _seed_orphan_memory(db, content, entity_name):
    """Insert a memory directly that mentions an entity but isn't linked.

    Simulates the pre-fix state where memories have entity references in
    their content (or were saved without about_entities populated) but
    no rows exist in memory_entities / entities.
    """
    return db.insert(
        "memories",
        {
            "content": content,
            "content_hash": f"hash-{content[:30]}-{datetime.utcnow().isoformat()}",
            "type": "fact",
            "importance": 1.0,
            "confidence": 1.0,
            "source": "test",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        },
    )


class TestBackfillCommand:
    """Backfill: plan (dry-run) is the default; apply requires a backup."""

    def test_plan_backfill_writes_nothing(self, db):
        """plan_backfill scans memories but makes no DB changes."""
        from claudia_memory.services.backfill import plan_backfill

        # Seed an orphan memory mentioning a known name.
        _seed_orphan_memory(db, "Matt Blumberg ran the meeting.", "Matt Blumberg")

        entities_before = db.execute(
            "SELECT COUNT(*) AS n FROM entities", fetch=True
        )[0]["n"]
        links_before = db.execute(
            "SELECT COUNT(*) AS n FROM memory_entities", fetch=True
        )[0]["n"]

        plan = plan_backfill(db)

        entities_after = db.execute(
            "SELECT COUNT(*) AS n FROM entities", fetch=True
        )[0]["n"]
        links_after = db.execute(
            "SELECT COUNT(*) AS n FROM memory_entities", fetch=True
        )[0]["n"]

        # No writes whatsoever.
        assert entities_before == entities_after
        assert links_before == links_after

        # Plan reports something to do.
        assert plan.orphan_count >= 1
        assert any(p["name"].lower() == "matt blumberg" for p in plan.proposed_entities)

    def test_apply_requires_backup(self, db, tmp_path):
        """apply_backfill creates a SQLite backup before any writes."""
        from claudia_memory.services.backfill import apply_backfill, plan_backfill

        _seed_orphan_memory(db, "Matt Blumberg owns the deal.", "Matt Blumberg")
        plan = plan_backfill(db)

        backup_path = tmp_path / "backups" / "memory-2026-05-13.db"
        result = apply_backfill(db, plan, backup_path=backup_path)

        assert backup_path.exists(), "backup file must exist after --apply"
        assert backup_path.stat().st_size > 0, "backup must not be empty"
        assert result.entities_created >= 1
        assert result.links_created >= 1

    def test_apply_aborts_when_backup_fails(self, db, tmp_path, monkeypatch):
        """If the backup cannot be created, apply_backfill raises BEFORE any DB write."""
        from claudia_memory.services import backfill as backfill_mod
        from claudia_memory.services.backfill import apply_backfill, plan_backfill

        _seed_orphan_memory(db, "Matt Blumberg signed off.", "Matt Blumberg")
        plan = plan_backfill(db)

        entities_before = db.execute(
            "SELECT COUNT(*) AS n FROM entities", fetch=True
        )[0]["n"]

        # Force backup to fail.
        def broken_backup(*_args, **_kwargs):
            raise OSError("simulated backup failure")

        monkeypatch.setattr(backfill_mod, "_create_backup", broken_backup)

        backup_path = tmp_path / "backups" / "memory-2026-05-13.db"
        with pytest.raises(OSError):
            apply_backfill(db, plan, backup_path=backup_path)

        entities_after = db.execute(
            "SELECT COUNT(*) AS n FROM entities", fetch=True
        )[0]["n"]
        assert entities_after == entities_before, (
            "no entities should be created when backup fails"
        )

    def test_apply_is_idempotent(self, db, tmp_path):
        """Running --apply twice in a row produces no new writes the second time."""
        from claudia_memory.services.backfill import apply_backfill, plan_backfill

        _seed_orphan_memory(db, "Matt Blumberg signed the SOW.", "Matt Blumberg")

        first_plan = plan_backfill(db)
        first_backup = tmp_path / "backups" / "memory-first.db"
        first_result = apply_backfill(db, first_plan, backup_path=first_backup)
        assert first_result.entities_created >= 1

        # Second pass: plan should be empty (everything already linked).
        second_plan = plan_backfill(db)
        assert second_plan.orphan_count == 0, "backfill must be idempotent"

        second_backup = tmp_path / "backups" / "memory-second.db"
        second_result = apply_backfill(db, second_plan, backup_path=second_backup)
        assert second_result.entities_created == 0
        assert second_result.links_created == 0


# ---------------------------------------------------------------------------
# 5. Latency budget: 3-entity remember_fact must finish under 50ms
# ---------------------------------------------------------------------------


class TestLatencyBudget:
    """Performance guard: the entity-linking work added by Proposal #51
    must stay under 50ms on the test fixture DB.

    We stub out ``embed_sync`` so the measurement isolates the entity
    resolution + memory_entities insert path (the surface area we changed).
    Real Ollama latency is a separate concern owned by the embedding
    service; not this PR's regression risk.
    """

    def test_remember_with_3_entities_under_50ms(self, db, monkeypatch):
        import time

        from claudia_memory.services import remember as remember_mod

        # Replace embed_sync with a no-op so we measure entity-linking, not
        # the embedding HTTP call that happens to live on the same machine.
        monkeypatch.setattr(remember_mod, "embed_sync", lambda _text: None)

        svc = _get_remember_service(db)

        # Warm-up: priming any one-shot import or schema state.
        svc.remember_fact(
            content="Warm-up fact, ignored.",
            about_entities=["Warmup Person"],
        )

        start = time.perf_counter()
        svc.remember_fact(
            content="Matt Blumberg and Holly Smith met with Markup AI's board.",
            about_entities=["Matt Blumberg", "Holly Smith", "Markup AI"],
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0

        # Record measurement for the report (printed by pytest -s).
        print(f"\nLATENCY remember_fact 3-entities: {elapsed_ms:.2f}ms")
        assert elapsed_ms < 50.0, (
            f"remember_fact with 3 entities took {elapsed_ms:.2f}ms (>50ms budget)"
        )
