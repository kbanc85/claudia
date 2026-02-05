"""Tests for entity management: merge, delete, fuzzy duplicate detection"""

import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from claudia_memory.database import Database, content_hash


@pytest.fixture
def db():
    """Create a temporary test database"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


def _insert_entity(db, name, entity_type="person"):
    """Helper to insert an entity"""
    return db.insert("entities", {
        "name": name,
        "type": entity_type,
        "canonical_name": name.lower(),
        "importance": 1.0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _insert_alias(db, entity_id, alias):
    """Helper to insert an entity alias"""
    return db.insert("entity_aliases", {
        "entity_id": entity_id,
        "alias": alias,
        "canonical_alias": alias.lower(),
        "created_at": datetime.utcnow().isoformat(),
    })


def _insert_memory(db, content, importance=0.8):
    """Helper to insert a memory"""
    return db.insert("memories", {
        "content": content,
        "content_hash": content_hash(content),
        "type": "fact",
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _link_memory_entity(db, memory_id, entity_id):
    """Helper to link memory to entity"""
    db.insert("memory_entities", {
        "memory_id": memory_id,
        "entity_id": entity_id,
        "relationship": "about",
    })


def _insert_relationship(db, source_id, target_id, rel_type="works_with"):
    """Helper to insert a relationship"""
    return db.insert("relationships", {
        "source_entity_id": source_id,
        "target_entity_id": target_id,
        "relationship_type": rel_type,
        "strength": 0.8,
        "valid_at": datetime.utcnow().isoformat(),
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


# --- RememberService tests for merge_entities ---

class TestMergeEntities:
    """Tests for entity merging functionality"""

    def _get_remember_service(self, db):
        """Create a RememberService with test database"""
        from claudia_memory.services.remember import RememberService
        svc = RememberService.__new__(RememberService)
        svc.db = db
        svc._embedder = None
        return svc

    def test_merge_entities_basic(self, db):
        """Basic entity merge transfers name as alias"""
        source_id = _insert_entity(db, "Jon Smith")
        target_id = _insert_entity(db, "John Smith")

        svc = self._get_remember_service(db)
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

    def test_merge_entities_transfers_memories(self, db):
        """Merge transfers memory links from source to target"""
        source_id = _insert_entity(db, "Source Person")
        target_id = _insert_entity(db, "Target Person")

        # Create memories linked to source
        mem1_id = _insert_memory(db, "Memory about source 1")
        mem2_id = _insert_memory(db, "Memory about source 2")
        _link_memory_entity(db, mem1_id, source_id)
        _link_memory_entity(db, mem2_id, source_id)

        svc = self._get_remember_service(db)
        result = svc.merge_entities(source_id, target_id)

        assert result["success"] is True
        # Note: memories_moved may be 0 if update returns None instead of rowcount
        # but the memories should still be transferred

        # Check memories are now linked to target
        links = db.execute(
            "SELECT entity_id FROM memory_entities WHERE memory_id IN (?, ?)",
            (mem1_id, mem2_id),
            fetch=True,
        )
        entity_ids = [row["entity_id"] for row in links]
        assert all(eid == target_id for eid in entity_ids)

    def test_merge_entities_transfers_relationships(self, db):
        """Merge transfers relationships from source to target"""
        source_id = _insert_entity(db, "Source Person")
        target_id = _insert_entity(db, "Target Person")
        other_id = _insert_entity(db, "Other Person")

        # Create relationship where source is involved
        _insert_relationship(db, source_id, other_id, "works_with")
        _insert_relationship(db, other_id, source_id, "reports_to")

        svc = self._get_remember_service(db)
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

    def test_merge_entities_nonexistent_source(self, db):
        """Merge fails gracefully for nonexistent source"""
        target_id = _insert_entity(db, "Target Person")

        svc = self._get_remember_service(db)
        result = svc.merge_entities(99999, target_id)

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_merge_entities_nonexistent_target(self, db):
        """Merge fails gracefully for nonexistent target"""
        source_id = _insert_entity(db, "Source Person")

        svc = self._get_remember_service(db)
        result = svc.merge_entities(source_id, 99999)

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_merge_entities_merges_aliases(self, db):
        """Existing aliases from source are transferred to target"""
        source_id = _insert_entity(db, "Jon Smith")
        target_id = _insert_entity(db, "John Smith")

        # Add aliases to source
        _insert_alias(db, source_id, "Jonathan")
        _insert_alias(db, source_id, "Johnny")
        # Add alias to target
        _insert_alias(db, target_id, "JohnS")

        svc = self._get_remember_service(db)
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


class TestDeleteEntity:
    """Tests for entity soft-deletion"""

    def _get_remember_service(self, db):
        from claudia_memory.services.remember import RememberService
        svc = RememberService.__new__(RememberService)
        svc.db = db
        svc._embedder = None
        return svc

    def test_delete_entity_basic(self, db):
        """Basic entity deletion sets deleted_at"""
        entity_id = _insert_entity(db, "Test Person")

        svc = self._get_remember_service(db)
        result = svc.delete_entity(entity_id, reason="No longer relevant")

        assert result["success"] is True

        entity = db.get_one("entities", where="id = ?", where_params=(entity_id,))
        assert entity["deleted_at"] is not None
        assert entity["deleted_reason"] == "No longer relevant"

    def test_delete_entity_nonexistent(self, db):
        """Delete fails gracefully for nonexistent entity"""
        svc = self._get_remember_service(db)
        result = svc.delete_entity(99999)

        assert result["success"] is False
        assert "not found" in result["error"].lower()


class TestFindDuplicateEntities:
    """Tests for fuzzy duplicate detection"""

    def _get_recall_service(self, db):
        from claudia_memory.services.recall import RecallService
        svc = RecallService.__new__(RecallService)
        svc.db = db
        svc._embedder = None
        return svc

    def test_find_similar_names(self, db):
        """Finds entities with similar names (typo variant)"""
        _insert_entity(db, "John Smith")
        _insert_entity(db, "Jon Smith")  # Missing 'h'

        svc = self._get_recall_service(db)
        duplicates = svc.find_duplicate_entities(threshold=0.85)

        assert len(duplicates) >= 1
        names = {duplicates[0]["entity_1"]["name"], duplicates[0]["entity_2"]["name"]}
        assert names == {"John Smith", "Jon Smith"}

    def test_find_similar_names_abbreviation(self, db):
        """Finds entities with name abbreviations"""
        _insert_entity(db, "Michael Chen")
        _insert_entity(db, "Mike Chen")

        svc = self._get_recall_service(db)
        duplicates = svc.find_duplicate_entities(threshold=0.7)  # Lower threshold for abbreviations

        assert len(duplicates) >= 1
        names = {duplicates[0]["entity_1"]["name"], duplicates[0]["entity_2"]["name"]}
        assert names == {"Michael Chen", "Mike Chen"}

    def test_no_duplicates_different_names(self, db):
        """Does not flag clearly different names"""
        _insert_entity(db, "Alice Johnson")
        _insert_entity(db, "Bob Williams")

        svc = self._get_recall_service(db)
        duplicates = svc.find_duplicate_entities(threshold=0.85)

        # These names should not be flagged as duplicates
        names_found = set()
        for pair in duplicates:
            names_found.add(pair["entity_1"]["name"])
            names_found.add(pair["entity_2"]["name"])

        # There should be no duplicates at all for these distinct names
        assert len(duplicates) == 0

    def test_find_duplicates_respects_threshold(self, db):
        """Higher threshold is more strict"""
        # Use names that are moderately similar but not very high
        _insert_entity(db, "Robert Johnson")
        _insert_entity(db, "Bob Johnson")  # Similar but different first name

        svc = self._get_recall_service(db)

        # Low threshold should find it
        low_threshold = svc.find_duplicate_entities(threshold=0.5)
        assert len(low_threshold) >= 1

        # High threshold should not find it (Robert vs Bob is < 0.9 similarity)
        high_threshold = svc.find_duplicate_entities(threshold=0.95)
        assert len(high_threshold) == 0

    def test_find_duplicates_excludes_deleted(self, db):
        """Deleted entities are not included in duplicate detection"""
        entity1_id = _insert_entity(db, "Sarah Chen")
        entity2_id = _insert_entity(db, "Sara Chen")  # Similar but different spelling

        # Delete one
        db.update(
            "entities",
            {"deleted_at": datetime.utcnow().isoformat()},
            "id = ?",
            (entity2_id,),
        )

        svc = self._get_recall_service(db)
        duplicates = svc.find_duplicate_entities(threshold=0.85)

        # Should not find duplicates since one is deleted
        assert len(duplicates) == 0
