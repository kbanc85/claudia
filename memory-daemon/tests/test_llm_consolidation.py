"""Tests for sleep-time LLM processing (Phase 4)."""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from claudia_memory.database import Database


def _setup_db():
    """Create a fresh database with initialized schema."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _insert_memory(db, content, importance=0.8, metadata=None):
    """Insert a test memory."""
    return db.insert("memories", {
        "content": content,
        "content_hash": f"hash_{content[:20]}",
        "type": "fact",
        "importance": importance,
        "metadata": json.dumps(metadata) if metadata else None,
    })


class TestLLMConsolidation:
    """Test sleep-time LLM processing."""

    def _make_service(self, db):
        """Create a ConsolidateService wired to the given DB."""
        import claudia_memory.database as db_mod
        import claudia_memory.services.consolidate as con_mod
        db_mod._db = db
        con_mod._service = None
        from claudia_memory.services.consolidate import ConsolidateService
        return ConsolidateService()

    def test_skips_when_no_llm_available(self):
        """Skips cleanly when no LLM available."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        mock_lm = MagicMock()
        mock_lm.is_available_sync.return_value = False

        with patch("claudia_memory.language_model.get_language_model_service", return_value=mock_lm):
            # Need to patch the import inside the method
            result = svc.run_llm_consolidation()

        assert result == {"skipped": True}

    def test_improves_memory_summaries(self):
        """Improves memory summaries (mock LLM), verify DB update + original preserved."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        mem_id = _insert_memory(db, "Sarah said she wants to have the meeting on Tuesday morning instead of afternoon because she has a dentist appointment in the PM", importance=0.9)

        mock_lm = MagicMock()
        mock_lm.is_available_sync.return_value = True
        mock_lm.generate_sync.return_value = "Sarah prefers Tuesday morning meetings due to afternoon dentist appointment"

        with patch("claudia_memory.language_model.get_language_model_service", return_value=mock_lm):
            result = svc.run_llm_consolidation()

        assert result["memories_improved"] == 1

        # Check DB was updated
        row = db.get_one("memories", where="id = ?", where_params=(mem_id,))
        assert "Tuesday morning" in row["content"]

        # Check original was preserved
        meta = json.loads(row["metadata"])
        assert meta["llm_improved"] is True
        assert "dentist appointment in the PM" in meta["original_content"]

    def test_skips_already_improved(self):
        """Skips already-improved memories (metadata check)."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        _insert_memory(
            db,
            "Already improved memory",
            importance=0.9,
            metadata={"llm_improved": True, "original_content": "old text"},
        )

        mock_lm = MagicMock()
        mock_lm.is_available_sync.return_value = True

        with patch("claudia_memory.language_model.get_language_model_service", return_value=mock_lm):
            result = svc.run_llm_consolidation()

        assert result["memories_improved"] == 0
        # generate_sync should not have been called for improvement
        # (it may be called for predictions though)

    def test_generates_llm_predictions(self):
        """Generates LLM predictions (mock LLM), verify predictions stored."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        _insert_memory(db, "Sarah needs the Q4 report by Friday", importance=0.8)
        _insert_memory(db, "Acme Corp meeting scheduled for next week", importance=0.7)

        mock_lm = MagicMock()
        mock_lm.is_available_sync.return_value = True

        # First call is for memory improvement, second for predictions
        mock_lm.generate_sync.side_effect = [
            # Memory improvements (may not match high enough importance)
            "Sarah needs Q4 report by Friday",
            "Acme Corp meeting next week",
            # Prediction generation
            json.dumps([
                {"content": "Follow up with Sarah about Q4 report", "priority": 0.8},
                {"content": "Prepare for Acme Corp meeting", "priority": 0.6},
            ]),
        ]

        with patch("claudia_memory.language_model.get_language_model_service", return_value=mock_lm):
            result = svc.run_llm_consolidation()

        assert result["predictions_generated"] == 2

        # Check predictions in DB
        predictions = db.execute(
            "SELECT * FROM predictions WHERE metadata LIKE '%llm_consolidation%'",
            fetch=True,
        ) or []
        assert len(predictions) == 2

    def test_handles_bad_json_from_llm(self):
        """Handles bad JSON from LLM without crash."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        _insert_memory(db, "Test memory for prediction", importance=0.8)

        mock_lm = MagicMock()
        mock_lm.is_available_sync.return_value = True
        mock_lm.generate_sync.return_value = "This is not valid JSON at all"

        with patch("claudia_memory.language_model.get_language_model_service", return_value=mock_lm):
            # Should not crash
            result = svc.run_llm_consolidation()

        # Predictions should be 0 due to bad JSON
        assert result.get("predictions_generated", 0) == 0

    def test_full_pipeline_integration(self):
        """Full pipeline integration with mocked LLM."""
        db, _ = _setup_db()
        svc = self._make_service(db)

        # Insert some memories
        for i in range(5):
            _insert_memory(db, f"Test memory number {i} about project Alpha", importance=0.5 + i * 0.1)

        mock_lm = MagicMock()
        mock_lm.is_available_sync.return_value = True

        # generate_sync returns different things based on call order
        call_count = [0]

        def mock_generate(prompt, **kwargs):
            call_count[0] += 1
            if kwargs.get("format_json"):
                return json.dumps([{"content": "Follow up on project Alpha", "priority": 0.7}])
            return f"Improved: {prompt[-50:]}"

        mock_lm.generate_sync.side_effect = mock_generate

        with patch("claudia_memory.language_model.get_language_model_service", return_value=mock_lm):
            result = svc.run_llm_consolidation()

        assert "memories_improved" in result
        assert "predictions_generated" in result
        assert result["memories_improved"] >= 0
        assert result["predictions_generated"] >= 0
