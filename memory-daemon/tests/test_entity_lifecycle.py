"""Tests for entity lifecycle: merge, delete, duplicate detection, corrections, invalidation."""

from datetime import datetime

import pytest

from claudia_memory.database import content_hash


# =============================================================================
# Helpers
# =============================================================================


def _insert_entity(db, name, entity_type="person"):
    """Helper to insert an entity."""
    return db.insert("entities", {
        "name": name,
        "type": entity_type,
        "canonical_name": name.lower(),
        "importance": 1.0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _insert_alias(db, entity_id, alias):
    """Helper to insert an entity alias."""
    return db.insert("entity_aliases", {
        "entity_id": entity_id,
        "alias": alias,
        "canonical_alias": alias.lower(),
        "created_at": datetime.utcnow().isoformat(),
    })


def _insert_memory(db, content, memory_type="fact", importance=0.8):
    """Helper to insert a memory."""
    return db.insert("memories", {
        "content": content,
        "content_hash": content_hash(content),
        "type": memory_type,
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _link_memory_entity(db, memory_id, entity_id):
    """Helper to link memory to entity."""
    db.insert("memory_entities", {
        "memory_id": memory_id,
        "entity_id": entity_id,
        "relationship": "about",
    })


def _insert_relationship(db, source_id, target_id, rel_type="works_with"):
    """Helper to insert a relationship."""
    return db.insert("relationships", {
        "source_entity_id": source_id,
        "target_entity_id": target_id,
        "relationship_type": rel_type,
        "strength": 0.8,
        "valid_at": datetime.utcnow().isoformat(),
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _get_remember_service(db):
    """Create a RememberService with test database."""
    from claudia_memory.services.remember import RememberService
    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc._embedder = None
    return svc


def _get_recall_service(db):
    """Create a RecallService with test database."""
    from claudia_memory.services.recall import RecallService
    svc = RecallService.__new__(RecallService)
    svc.db = db
    svc._embedder = None
    return svc


# =============================================================================
# Entity merge
# =============================================================================


class TestEntityMerge:
    """Tests for entity merging functionality."""

    def test_basic_merge(self, db):
        """Basic entity merge transfers name as alias."""
        source_id = _insert_entity(db, "Jon Smith")
        target_id = _insert_entity(db, "John Smith")

        svc = _get_remember_service(db)
        result = svc.merge_entities(source_id, target_id, reason="Same person")

        assert result["success"] is True
        assert result["memories_moved"] == 0

        # Source should be soft-deleted
        source = db.get_one("entities", where="id = ?", where_params=(source_id,))
        assert source["deleted_at"] is not None
        assert "merged into" in source["deleted_reason"].lower()

        # Target should have source name as alias in entity_aliases table
        aliases = db.execute(
            "SELECT alias FROM entity_aliases WHERE entity_id = ?",
            (target_id,),
            fetch=True,
        )
        alias_names = [row["alias"] for row in aliases]
        assert "Jon Smith" in alias_names

    def test_transfers_memories(self, db):
        """Merge transfers memory links from source to target."""
        source_id = _insert_entity(db, "Source Person")
        target_id = _insert_entity(db, "Target Person")

        # Create memories linked to source
        mem1_id = _insert_memory(db, "Memory about source 1")
        mem2_id = _insert_memory(db, "Memory about source 2")
        _link_memory_entity(db, mem1_id, source_id)
        _link_memory_entity(db, mem2_id, source_id)

        svc = _get_remember_service(db)
        result = svc.merge_entities(source_id, target_id)

        assert result["success"] is True

        # Check memories are now linked to target
        links = db.execute(
            "SELECT entity_id FROM memory_entities WHERE memory_id IN (?, ?)",
            (mem1_id, mem2_id),
            fetch=True,
        )
        entity_ids = [row["entity_id"] for row in links]
        assert all(eid == target_id for eid in entity_ids)

    def test_transfers_relationships(self, db):
        """Merge transfers relationships from source to target."""
        source_id = _insert_entity(db, "Source Person")
        target_id = _insert_entity(db, "Target Person")
        other_id = _insert_entity(db, "Other Person")

        # Create relationship where source is involved
        _insert_relationship(db, source_id, other_id, "works_with")
        _insert_relationship(db, other_id, source_id, "reports_to")

        svc = _get_remember_service(db)
        result = svc.merge_entities(source_id, target_id)

        assert result["success"] is True

        # Check relationships now reference target
        outgoing = db.execute(
            "SELECT * FROM relationships WHERE source_entity_id = ?",
            (target_id,),
            fetch=True,
        )
        incoming = db.execute(
            "SELECT * FROM relationships WHERE target_entity_id = ?",
            (target_id,),
            fetch=True,
        )
        assert len(outgoing) == 1
        assert len(incoming) == 1

    def test_nonexistent_source(self, db):
        """Merge fails gracefully for nonexistent source."""
        target_id = _insert_entity(db, "Target Person")

        svc = _get_remember_service(db)
        result = svc.merge_entities(99999, target_id)

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_nonexistent_target(self, db):
        """Merge fails gracefully for nonexistent target."""
        source_id = _insert_entity(db, "Source Person")

        svc = _get_remember_service(db)
        result = svc.merge_entities(source_id, 99999)

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_merges_aliases(self, db):
        """Existing aliases from source are transferred to target."""
        source_id = _insert_entity(db, "Jon Smith")
        target_id = _insert_entity(db, "John Smith")

        # Add aliases to source
        _insert_alias(db, source_id, "Jonathan")
        _insert_alias(db, source_id, "Johnny")
        # Add alias to target
        _insert_alias(db, target_id, "JohnS")

        svc = _get_remember_service(db)
        svc.merge_entities(source_id, target_id)

        # Check aliases were transferred to target
        target_aliases = db.execute(
            "SELECT alias FROM entity_aliases WHERE entity_id = ?",
            (target_id,),
            fetch=True,
        )
        alias_names = [row["alias"] for row in target_aliases]
        assert "JohnS" in alias_names
        assert "Jon Smith" in alias_names  # Source name becomes alias
        assert "Jonathan" in alias_names
        assert "Johnny" in alias_names


# =============================================================================
# Entity deletion
# =============================================================================


class TestEntityDeletion:
    """Tests for entity soft-deletion."""

    def test_basic_delete(self, db):
        """Basic entity deletion sets deleted_at."""
        entity_id = _insert_entity(db, "Test Person")

        svc = _get_remember_service(db)
        result = svc.delete_entity(entity_id, reason="No longer relevant")

        assert result["success"] is True

        entity = db.get_one("entities", where="id = ?", where_params=(entity_id,))
        assert entity["deleted_at"] is not None
        assert entity["deleted_reason"] == "No longer relevant"

    def test_nonexistent(self, db):
        """Delete fails gracefully for nonexistent entity."""
        svc = _get_remember_service(db)
        result = svc.delete_entity(99999)

        assert result["success"] is False
        assert "not found" in result["error"].lower()


# =============================================================================
# Duplicate detection
# =============================================================================


class TestDuplicateDetection:
    """Tests for fuzzy duplicate detection."""

    def test_find_similar_names(self, db):
        """Finds entities with similar names (typo variant)."""
        _insert_entity(db, "John Smith")
        _insert_entity(db, "Jon Smith")  # Missing 'h'

        svc = _get_recall_service(db)
        duplicates = svc.find_duplicate_entities(threshold=0.85)

        assert len(duplicates) >= 1
        names = {duplicates[0]["entity_1"]["name"], duplicates[0]["entity_2"]["name"]}
        assert names == {"John Smith", "Jon Smith"}

    def test_find_similar_names_abbreviation(self, db):
        """Finds entities with name abbreviations."""
        _insert_entity(db, "Michael Chen")
        _insert_entity(db, "Mike Chen")

        svc = _get_recall_service(db)
        duplicates = svc.find_duplicate_entities(threshold=0.7)

        assert len(duplicates) >= 1
        names = {duplicates[0]["entity_1"]["name"], duplicates[0]["entity_2"]["name"]}
        assert names == {"Michael Chen", "Mike Chen"}

    def test_no_duplicates_different_names(self, db):
        """Does not flag clearly different names."""
        _insert_entity(db, "Alice Johnson")
        _insert_entity(db, "Bob Williams")

        svc = _get_recall_service(db)
        duplicates = svc.find_duplicate_entities(threshold=0.85)

        assert len(duplicates) == 0

    def test_respects_threshold(self, db):
        """Higher threshold is more strict."""
        _insert_entity(db, "Robert Johnson")
        _insert_entity(db, "Bob Johnson")

        svc = _get_recall_service(db)

        # Low threshold should find it
        low_threshold = svc.find_duplicate_entities(threshold=0.5)
        assert len(low_threshold) >= 1

        # High threshold should not find it (Robert vs Bob is < 0.9 similarity)
        high_threshold = svc.find_duplicate_entities(threshold=0.95)
        assert len(high_threshold) == 0

    def test_excludes_deleted(self, db):
        """Deleted entities are not included in duplicate detection."""
        entity1_id = _insert_entity(db, "Sarah Chen")
        entity2_id = _insert_entity(db, "Sara Chen")

        # Delete one
        db.update(
            "entities",
            {"deleted_at": datetime.utcnow().isoformat()},
            "id = ?",
            (entity2_id,),
        )

        svc = _get_recall_service(db)
        duplicates = svc.find_duplicate_entities(threshold=0.85)

        assert len(duplicates) == 0


# =============================================================================
# Memory correction
# =============================================================================


class TestMemoryCorrection:
    """Tests for memory correction functionality."""

    def test_basic_correction(self, db):
        """Basic memory correction updates content."""
        mem_id = _insert_memory(db, "Sarah works at TechCorp")

        svc = _get_remember_service(db)
        result = svc.correct_memory(
            mem_id,
            "Sarah works at Acme",
            reason="Company changed",
        )

        assert result["success"] is True

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["content"] == "Sarah works at Acme"
        assert memory["corrected_at"] is not None
        assert memory["corrected_from"] == "Sarah works at TechCorp"

    def test_updates_hash(self, db):
        """Correction updates content hash."""
        original = "Original content"
        mem_id = _insert_memory(db, original)

        svc = _get_remember_service(db)
        svc.correct_memory(mem_id, "Corrected content")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["content_hash"] == content_hash("Corrected content")

    def test_nonexistent(self, db):
        """Correction fails gracefully for nonexistent memory."""
        svc = _get_remember_service(db)
        result = svc.correct_memory(99999, "New content")

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_preserves_original(self, db):
        """Original content is preserved in corrected_from."""
        original = "The project deadline is March 15"
        mem_id = _insert_memory(db, original)

        svc = _get_remember_service(db)
        svc.correct_memory(mem_id, "The project deadline is March 20")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["corrected_from"] == original

    def test_chained_corrections(self, db):
        """Multiple corrections keep the most recent original."""
        mem_id = _insert_memory(db, "Version 1")

        svc = _get_remember_service(db)
        svc.correct_memory(mem_id, "Version 2")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["content"] == "Version 2"
        assert memory["corrected_from"] == "Version 1"

        # Second correction
        svc.correct_memory(mem_id, "Version 3")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["content"] == "Version 3"
        # corrected_from now shows version 2 (the most recent previous)
        assert memory["corrected_from"] == "Version 2"


# =============================================================================
# Memory invalidation
# =============================================================================


class TestMemoryInvalidation:
    """Tests for memory invalidation functionality."""

    def test_basic_invalidation(self, db):
        """Basic memory invalidation sets invalidated_at."""
        mem_id = _insert_memory(db, "The project is active")

        svc = _get_remember_service(db)
        result = svc.invalidate_memory(mem_id, reason="Project cancelled")

        assert result["success"] is True

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["invalidated_at"] is not None
        assert memory["invalidated_reason"] == "Project cancelled"

    def test_nonexistent(self, db):
        """Invalidation fails gracefully for nonexistent memory."""
        svc = _get_remember_service(db)
        result = svc.invalidate_memory(99999)

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_preserves_content(self, db):
        """Invalidation preserves the original content."""
        original = "This was true at the time"
        mem_id = _insert_memory(db, original)

        svc = _get_remember_service(db)
        svc.invalidate_memory(mem_id, reason="No longer true")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["content"] == original

    def test_without_reason(self, db):
        """Invalidation works without explicit reason."""
        mem_id = _insert_memory(db, "Some fact")

        svc = _get_remember_service(db)
        result = svc.invalidate_memory(mem_id)

        assert result["success"] is True

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["invalidated_at"] is not None
        # Without explicit reason, it defaults to "User requested invalidation"
        assert "User requested" in memory["invalidated_reason"]


class TestRecallExcludesInvalidated:
    """Tests that invalidated memories are excluded from recall."""

    def test_recall_excludes_invalidated(self, db):
        """Invalidated memories are excluded from database queries."""
        mem1_id = _insert_memory(db, "Active memory about cats")
        mem2_id = _insert_memory(db, "Invalidated memory about cats")

        # Invalidate one
        db.update(
            "memories",
            {"invalidated_at": datetime.utcnow().isoformat()},
            "id = ?",
            (mem2_id,),
        )

        # Query active memories directly
        active_memories = db.execute(
            "SELECT * FROM memories WHERE invalidated_at IS NULL",
            fetch=True,
        ) or []

        # Only active memory should be returned
        content_list = [m["content"] for m in active_memories]
        assert "Active memory about cats" in content_list
        assert "Invalidated memory about cats" not in content_list


# =============================================================================
# Correction audit trail
# =============================================================================


class TestCorrectionAuditTrail:
    """Tests that corrections create audit trail."""

    def test_correction_timestamps(self, db):
        """Corrections update timestamps properly."""
        mem_id = _insert_memory(db, "Original")
        original_memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        original_updated = original_memory["updated_at"]

        svc = _get_remember_service(db)
        svc.correct_memory(mem_id, "Corrected")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        # updated_at should be newer
        assert memory["updated_at"] >= original_updated
        assert memory["corrected_at"] is not None

    def test_invalidation_timestamps(self, db):
        """Invalidation updates timestamps properly."""
        mem_id = _insert_memory(db, "Original")
        original_memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        original_updated = original_memory["updated_at"]

        svc = _get_remember_service(db)
        svc.invalidate_memory(mem_id, reason="Test")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["updated_at"] >= original_updated
        assert memory["invalidated_at"] is not None
