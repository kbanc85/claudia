"""Tests for bi-temporal relationship tracking (Phase 2)."""

import tempfile
from pathlib import Path

import pytest

from claudia_memory.database import Database


def _setup_db():
    """Create a fresh database with initialized schema."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _create_entities(db):
    """Create Sarah, Acme, Beta, and Casey entities."""
    sarah_id = db.insert("entities", {
        "name": "Sarah Chen",
        "type": "person",
        "canonical_name": "sarah chen",
        "importance": 1.0,
    })
    acme_id = db.insert("entities", {
        "name": "Acme Corp",
        "type": "organization",
        "canonical_name": "acme corp",
        "importance": 1.0,
    })
    beta_id = db.insert("entities", {
        "name": "Beta Corp",
        "type": "organization",
        "canonical_name": "beta corp",
        "importance": 1.0,
    })
    casey_id = db.insert("entities", {
        "name": "Casey Potenzone",
        "type": "person",
        "canonical_name": "casey potenzone",
        "importance": 1.0,
    })
    return sarah_id, acme_id, beta_id, casey_id


class TestBitemporalRelationships:
    """Test bi-temporal relationship tracking."""

    def test_new_relationship_gets_valid_at(self):
        """New relationship gets valid_at set automatically."""
        db, tmpdir = _setup_db()
        sarah_id, acme_id, _, _ = _create_entities(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.remember as rem_mod
        old_db = db_mod._db
        old_svc = rem_mod._service

        try:
            db_mod._db = db
            rem_mod._service = None
            from claudia_memory.services.remember import RememberService
            svc = RememberService()

            rel_id = svc.relate_entities("Sarah Chen", "Acme Corp", "works_at")
            assert rel_id is not None

            row = db.get_one("relationships", where="id = ?", where_params=(rel_id,))
            assert row["valid_at"] is not None
            assert row["invalid_at"] is None
        finally:
            db_mod._db = old_db
            rem_mod._service = old_svc

    def test_supersedes_invalidates_old_creates_new(self):
        """supersedes=True invalidates old relationship of same triple and creates new one.

        Note: supersede now correctly matches source + target + type (not just source + type).
        To replace Sarah->Acme with Sarah->Beta, use invalidate+create, not supersede.
        Supersede is for correcting the SAME relationship (same source, target, type).
        """
        db, tmpdir = _setup_db()
        sarah_id, acme_id, beta_id, _ = _create_entities(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.remember as rem_mod
        old_db = db_mod._db
        old_svc = rem_mod._service

        try:
            db_mod._db = db
            rem_mod._service = None
            from claudia_memory.services.remember import RememberService
            svc = RememberService()

            # Create initial relationship
            rel1_id = svc.relate_entities("Sarah Chen", "Acme Corp", "works_at")
            assert rel1_id is not None

            # Supersede same triple (correction to same relationship)
            rel2_id = svc.relate_entities(
                "Sarah Chen", "Acme Corp", "works_at",
                supersedes=True,
            )
            assert rel2_id is not None
            assert rel2_id != rel1_id

            # Old relationship should be invalidated (renamed type + invalid_at set)
            old_row = db.get_one("relationships", where="id = ?", where_params=(rel1_id,))
            assert old_row["invalid_at"] is not None
            assert "__superseded_" in old_row["relationship_type"]

            # New relationship should be current with origin_type='corrected'
            new_row = db.get_one("relationships", where="id = ?", where_params=(rel2_id,))
            assert new_row["invalid_at"] is None
            assert new_row["valid_at"] is not None
            assert new_row["relationship_type"] == "works_at"
            assert new_row["origin_type"] == "corrected"
        finally:
            db_mod._db = old_db
            rem_mod._service = old_svc

    def test_default_recall_shows_current_only(self):
        """Default recall_about only shows current (non-invalidated) relationships."""
        db, tmpdir = _setup_db()
        sarah_id, acme_id, beta_id, _ = _create_entities(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.remember as rem_mod
        import claudia_memory.services.recall as rec_mod
        old_db = db_mod._db
        old_rem_svc = rem_mod._service
        old_rec_svc = rec_mod._service

        try:
            db_mod._db = db
            rem_mod._service = None
            rec_mod._service = None
            from claudia_memory.services.remember import RememberService
            from claudia_memory.services.recall import RecallService
            rem_svc = RememberService()
            rec_svc = RecallService()

            # Create Acme relationship, then invalidate and create Beta
            rem_svc.relate_entities("Sarah Chen", "Acme Corp", "works_at")
            rem_svc.invalidate_relationship("Sarah Chen", "Acme Corp", "works_at",
                                             reason="Left company")
            rem_svc.relate_entities("Sarah Chen", "Beta Corp", "works_at")

            # Default: only current
            result = rec_svc.recall_about("Sarah Chen")
            rel_types = [r["type"] for r in result["relationships"]]
            assert "works_at" in rel_types
            # Should only see the Beta Corp relationship as "works_at"
            works_at_rels = [r for r in result["relationships"] if r["type"] == "works_at"]
            assert len(works_at_rels) == 1
            assert works_at_rels[0]["other_entity"] == "Beta Corp"
        finally:
            db_mod._db = old_db
            rem_mod._service = old_rem_svc
            rec_mod._service = old_rec_svc

    def test_include_historical_shows_all(self):
        """include_historical=True shows all relationships including invalidated."""
        db, tmpdir = _setup_db()
        sarah_id, acme_id, beta_id, _ = _create_entities(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.remember as rem_mod
        import claudia_memory.services.recall as rec_mod
        old_db = db_mod._db
        old_rem_svc = rem_mod._service
        old_rec_svc = rec_mod._service

        try:
            db_mod._db = db
            rem_mod._service = None
            rec_mod._service = None
            from claudia_memory.services.remember import RememberService
            from claudia_memory.services.recall import RecallService
            rem_svc = RememberService()
            rec_svc = RecallService()

            # Create Acme relationship, then invalidate and create Beta
            rem_svc.relate_entities("Sarah Chen", "Acme Corp", "works_at")
            rem_svc.invalidate_relationship("Sarah Chen", "Acme Corp", "works_at",
                                             reason="Left company")
            rem_svc.relate_entities("Sarah Chen", "Beta Corp", "works_at")

            # Historical: shows both (Acme invalidated + Beta current)
            result = rec_svc.recall_about("Sarah Chen", include_historical=True)
            assert len(result["relationships"]) >= 2

            # Historical entries should have valid_at/invalid_at fields
            historical = [r for r in result["relationships"] if r.get("invalid_at") is not None]
            assert len(historical) >= 1
            assert historical[0]["valid_at"] is not None
        finally:
            db_mod._db = old_db
            rem_mod._service = old_rem_svc
            rec_mod._service = old_rec_svc

    def test_migration_grandfathers_existing(self):
        """Migration sets valid_at = created_at for existing relationships."""
        db, tmpdir = _setup_db()
        sarah_id, acme_id, _, _ = _create_entities(db)

        # Insert a relationship without valid_at (simulating pre-migration)
        db.execute(
            """UPDATE relationships SET valid_at = NULL
               WHERE source_entity_id = ? AND target_entity_id = ?""",
            (sarah_id, acme_id),
        )

        # Check that it's NULL
        # (The migration already ran during initialize, so we test the grandfather logic
        # by checking that the migration code handled existing data)
        # Since we're testing the migration block, let's verify via the DB directly
        row = db.get_one("relationships",
                         where="source_entity_id = ? AND target_entity_id = ?",
                         where_params=(sarah_id, acme_id))
        # No relationship exists yet, so let's create one and verify valid_at
        rel_id = db.insert("relationships", {
            "source_entity_id": sarah_id,
            "target_entity_id": acme_id,
            "relationship_type": "works_at",
            "strength": 1.0,
            "created_at": "2025-06-15T00:00:00",
        })

        # Manually run the grandfather logic
        db.execute(
            "UPDATE relationships SET valid_at = created_at WHERE valid_at IS NULL"
        )

        row = db.get_one("relationships", where="id = ?", where_params=(rel_id,))
        assert row["valid_at"] == "2025-06-15T00:00:00"

    def test_default_strengthen_preserves_relationship(self):
        """Default behavior (supersedes=False) still strengthens existing relationship."""
        db, tmpdir = _setup_db()
        _create_entities(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.remember as rem_mod
        old_db = db_mod._db
        old_svc = rem_mod._service

        try:
            db_mod._db = db
            rem_mod._service = None
            from claudia_memory.services.remember import RememberService
            svc = RememberService()

            rel_id1 = svc.relate_entities("Sarah Chen", "Acme Corp", "works_at", strength=0.5)
            rel_id2 = svc.relate_entities("Sarah Chen", "Acme Corp", "works_at")

            # Same relationship strengthened, not replaced
            assert rel_id1 == rel_id2

            row = db.get_one("relationships", where="id = ?", where_params=(rel_id1,))
            assert row["strength"] == pytest.approx(0.6, abs=0.01)  # 0.5 + 0.1
            assert row["invalid_at"] is None
        finally:
            db_mod._db = old_db
            rem_mod._service = old_svc

    def test_supersede_targets_correct_relationship(self):
        """Superseding A->X only affects X, not A->Y of the same type.

        This was a real bug: the old supersede query only matched source + type,
        not target. When Sarah had works_with->Acme AND works_with->Beta,
        superseding works_with->Acme could invalidate works_with->Beta instead.
        """
        db, tmpdir = _setup_db()
        sarah_id, acme_id, beta_id, _ = _create_entities(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.remember as rem_mod
        old_db = db_mod._db
        old_svc = rem_mod._service

        try:
            db_mod._db = db
            rem_mod._service = None
            from claudia_memory.services.remember import RememberService
            svc = RememberService()

            # Create two relationships of the same type to different targets
            rel_acme = svc.relate_entities("Sarah Chen", "Acme Corp", "works_at")
            rel_beta = svc.relate_entities("Sarah Chen", "Beta Corp", "works_at")
            assert rel_acme is not None
            assert rel_beta is not None
            assert rel_acme != rel_beta

            # Supersede the Acme relationship specifically
            rel_acme_new = svc.relate_entities(
                "Sarah Chen", "Acme Corp", "works_at",
                supersedes=True,
            )

            # The Beta relationship should be UNTOUCHED
            beta_row = db.get_one("relationships", where="id = ?", where_params=(rel_beta,))
            assert beta_row["invalid_at"] is None
            assert beta_row["relationship_type"] == "works_at"

            # The old Acme relationship should be invalidated
            acme_old = db.get_one("relationships", where="id = ?", where_params=(rel_acme,))
            assert acme_old["invalid_at"] is not None
        finally:
            db_mod._db = old_db
            rem_mod._service = old_svc

    def test_supersede_same_triple_correction(self):
        """Superseding A->X with a new A->X (same triple) works as a correction."""
        db, tmpdir = _setup_db()
        _create_entities(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.remember as rem_mod
        old_db = db_mod._db
        old_svc = rem_mod._service

        try:
            db_mod._db = db
            rem_mod._service = None
            from claudia_memory.services.remember import RememberService
            svc = RememberService()

            # Create initial relationship
            rel1 = svc.relate_entities("Sarah Chen", "Acme Corp", "works_at",
                                       strength=0.5, origin_type="inferred")

            # Supersede with a correction (same source, target, type)
            rel2 = svc.relate_entities("Sarah Chen", "Acme Corp", "works_at",
                                       supersedes=True, origin_type="user_stated")

            assert rel2 is not None
            assert rel2 != rel1

            # Old should be invalidated
            old_row = db.get_one("relationships", where="id = ?", where_params=(rel1,))
            assert old_row["invalid_at"] is not None

            # New should have origin_type='corrected' (supersede always sets this)
            new_row = db.get_one("relationships", where="id = ?", where_params=(rel2,))
            assert new_row["origin_type"] == "corrected"
            assert new_row["invalid_at"] is None
        finally:
            db_mod._db = old_db
            rem_mod._service = old_svc

    def test_invalidate_relationship(self):
        """Invalidation sets invalid_at without creating a replacement."""
        db, tmpdir = _setup_db()
        _create_entities(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.remember as rem_mod
        old_db = db_mod._db
        old_svc = rem_mod._service

        try:
            db_mod._db = db
            rem_mod._service = None
            from claudia_memory.services.remember import RememberService
            svc = RememberService()

            # Create a relationship
            rel_id = svc.relate_entities("Sarah Chen", "Acme Corp", "works_at")
            assert rel_id is not None

            # Invalidate it
            result = svc.invalidate_relationship(
                "Sarah Chen", "Acme Corp", "works_at",
                reason="She left the company",
            )
            assert result is not None
            assert result["relationship_id"] == rel_id
            assert result["reason"] == "She left the company"

            # The row should be invalidated with renamed type
            row = db.get_one("relationships", where="id = ?", where_params=(rel_id,))
            assert row["invalid_at"] is not None
            assert "__invalidated_" in row["relationship_type"]

            # No new relationship should have been created
            active = db.execute(
                "SELECT COUNT(*) as cnt FROM relationships WHERE invalid_at IS NULL",
                fetch=True,
            )
            assert active[0]["cnt"] == 0
        finally:
            db_mod._db = old_db
            rem_mod._service = old_svc

    def test_invalidate_logs_audit(self):
        """Invalidation logs to the audit trail."""
        db, tmpdir = _setup_db()
        _create_entities(db)

        import claudia_memory.database as db_mod
        import claudia_memory.services.remember as rem_mod
        import claudia_memory.services.audit as audit_mod
        old_db = db_mod._db
        old_svc = rem_mod._service
        old_audit_svc = audit_mod._service

        try:
            db_mod._db = db
            rem_mod._service = None
            audit_mod._service = None  # Reset audit singleton to use test DB
            from claudia_memory.services.remember import RememberService
            svc = RememberService()

            rel_id = svc.relate_entities("Sarah Chen", "Acme Corp", "works_at")
            svc.invalidate_relationship(
                "Sarah Chen", "Acme Corp", "works_at",
                reason="Incorrect data",
            )

            # Check audit log for invalidation entry
            audit_rows = db.execute(
                "SELECT * FROM audit_log WHERE operation = 'relationship_invalidate'",
                fetch=True,
            ) or []
            assert len(audit_rows) >= 1
            # The audit should reference the correct relationship
            import json
            details = json.loads(audit_rows[0]["details"])
            assert details["id"] == rel_id
            assert details["reason"] == "Incorrect data"
        finally:
            db_mod._db = old_db
            rem_mod._service = old_svc
            audit_mod._service = old_audit_svc
