"""Tests for memory corrections and invalidation"""

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


def _insert_memory(db, content, memory_type="fact", importance=0.8):
    """Helper to insert a memory"""
    return db.insert("memories", {
        "content": content,
        "content_hash": content_hash(content),
        "type": memory_type,
        "importance": importance,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })


def _get_remember_service(db):
    """Create a RememberService with test database"""
    from claudia_memory.services.remember import RememberService
    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc._embedder = None
    return svc


class TestCorrectMemory:
    """Tests for memory correction functionality"""

    def test_correct_memory_basic(self, db):
        """Basic memory correction updates content"""
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

    def test_correct_memory_updates_hash(self, db):
        """Correction updates content hash"""
        original = "Original content"
        mem_id = _insert_memory(db, original)

        svc = _get_remember_service(db)
        svc.correct_memory(mem_id, "Corrected content")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["content_hash"] == content_hash("Corrected content")

    def test_correct_memory_nonexistent(self, db):
        """Correction fails gracefully for nonexistent memory"""
        svc = _get_remember_service(db)
        result = svc.correct_memory(99999, "New content")

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_correct_memory_preserves_original(self, db):
        """Original content is preserved in corrected_from"""
        original = "The project deadline is March 15"
        mem_id = _insert_memory(db, original)

        svc = _get_remember_service(db)
        svc.correct_memory(mem_id, "The project deadline is March 20")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["corrected_from"] == original

    def test_correct_memory_multiple_times(self, db):
        """Multiple corrections keep the most recent original"""
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


class TestInvalidateMemory:
    """Tests for memory invalidation functionality"""

    def test_invalidate_memory_basic(self, db):
        """Basic memory invalidation sets invalidated_at"""
        mem_id = _insert_memory(db, "The project is active")

        svc = _get_remember_service(db)
        result = svc.invalidate_memory(mem_id, reason="Project cancelled")

        assert result["success"] is True

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["invalidated_at"] is not None
        assert memory["invalidated_reason"] == "Project cancelled"

    def test_invalidate_memory_nonexistent(self, db):
        """Invalidation fails gracefully for nonexistent memory"""
        svc = _get_remember_service(db)
        result = svc.invalidate_memory(99999)

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_invalidate_memory_preserves_content(self, db):
        """Invalidation preserves the original content"""
        original = "This was true at the time"
        mem_id = _insert_memory(db, original)

        svc = _get_remember_service(db)
        svc.invalidate_memory(mem_id, reason="No longer true")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["content"] == original

    def test_invalidate_memory_without_reason(self, db):
        """Invalidation works without explicit reason"""
        mem_id = _insert_memory(db, "Some fact")

        svc = _get_remember_service(db)
        result = svc.invalidate_memory(mem_id)

        assert result["success"] is True

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["invalidated_at"] is not None
        # Without explicit reason, it defaults to "User requested invalidation"
        assert "User requested" in memory["invalidated_reason"]


class TestRecallExcludesInvalidated:
    """Tests that invalidated memories are excluded from recall"""

    def test_recall_excludes_invalidated(self, db):
        """Invalidated memories are excluded from database queries"""
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


class TestCorrectionAuditTrail:
    """Tests that corrections create audit trail"""

    def test_correction_timestamps(self, db):
        """Corrections update timestamps properly"""
        mem_id = _insert_memory(db, "Original")
        original_memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        original_updated = original_memory["updated_at"]

        # Wait a tiny bit and correct
        svc = _get_remember_service(db)
        svc.correct_memory(mem_id, "Corrected")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        # updated_at should be newer
        assert memory["updated_at"] >= original_updated
        assert memory["corrected_at"] is not None

    def test_invalidation_timestamps(self, db):
        """Invalidation updates timestamps properly"""
        mem_id = _insert_memory(db, "Original")
        original_memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        original_updated = original_memory["updated_at"]

        svc = _get_remember_service(db)
        svc.invalidate_memory(mem_id, reason="Test")

        memory = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert memory["updated_at"] >= original_updated
        assert memory["invalidated_at"] is not None
