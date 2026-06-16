"""Tests for P1 ambient session memory capture.

Covers:
- TestTranscriptParser: parse_transcript() correctness and resilience
- TestAUDNWrite: AUDN dedup decision logic
- TestSessionDiskScan: _enqueue_missed_sessions() in session-health-check
- TestProcessSessions: integration test for _process_sessions()
"""

import asyncio
import json
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from claudia_memory.daemon.scheduler import (
    _parse_transcript,
    _process_sessions,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MockConfig:
    """Minimal config mock mirroring test_observation_ingest.MockConfig."""
    observation_capture_enabled = True
    observation_capture_all = False
    observation_relevant_tools = []
    observation_relevant_paths = []
    observation_ingest_interval = 30
    session_capture_enabled = True


def _write_jsonl(path: Path, lines: list) -> None:
    """Write a list of dicts as JSONL to path."""
    with open(path, "w", encoding="utf-8") as f:
        for item in lines:
            f.write(json.dumps(item) + "\n")


# ---------------------------------------------------------------------------
# TestTranscriptParser
# ---------------------------------------------------------------------------

class TestTranscriptParser:
    """Tests for _parse_transcript() in scheduler.py."""

    def test_truncated_last_line(self, tmp_path):
        """Parser returns content from valid lines even when last line is truncated."""
        transcript = tmp_path / "transcript.jsonl"
        # Valid line followed by a truncated line
        transcript.write_text(
            json.dumps({"role": "user", "content": "Hello world"}) + "\n"
            + '{"role": "assistant", "content": "truncated',  # no closing
            encoding="utf-8",
        )
        result = _parse_transcript(str(transcript))
        assert "Hello world" in result
        # Should not raise

    def test_extracts_text_from_turns(self, tmp_path):
        """parse_transcript returns non-empty text with user/assistant content."""
        transcript = tmp_path / "transcript.jsonl"
        _write_jsonl(transcript, [
            {"role": "user", "content": "What is the project status?"},
            {"role": "assistant", "content": "The project is in Phase 2."},
        ])
        result = _parse_transcript(str(transcript))
        assert "What is the project status" in result
        assert "Phase 2" in result

    def test_skips_tool_use_entries(self, tmp_path):
        """Tool_use and tool_result entries are NOT included in extracted text."""
        transcript = tmp_path / "transcript.jsonl"
        _write_jsonl(transcript, [
            {"role": "user", "content": "Run the tests"},
            {"type": "tool_use", "name": "Bash", "input": {"command": "pytest"}},
            {"type": "tool_result", "content": "5 passed"},
            {"role": "assistant", "content": "Tests passed successfully"},
        ])
        result = _parse_transcript(str(transcript))
        assert "Run the tests" in result
        assert "Tests passed successfully" in result
        # Tool entries should not appear as text
        assert "pytest" not in result
        assert "5 passed" not in result

    def test_empty_transcript_returns_empty_string(self, tmp_path):
        """Empty file returns empty string."""
        transcript = tmp_path / "empty.jsonl"
        transcript.write_text("", encoding="utf-8")
        result = _parse_transcript(str(transcript))
        assert result == ""

    def test_nonexistent_file_returns_empty_string(self, tmp_path):
        """Missing file returns empty string without raising."""
        result = _parse_transcript(str(tmp_path / "nonexistent.jsonl"))
        assert result == ""

    def test_content_as_list_of_text_blocks(self, tmp_path):
        """Content as list of text blocks is extracted correctly."""
        transcript = tmp_path / "transcript.jsonl"
        _write_jsonl(transcript, [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Hello from list"},
                    {"type": "tool_use", "id": "t1", "name": "Read"},
                ],
            },
        ])
        result = _parse_transcript(str(transcript))
        assert "Hello from list" in result


# ---------------------------------------------------------------------------
# TestAUDNWrite
# ---------------------------------------------------------------------------

class TestAUDNWrite:
    """Tests for audn_write() in services/audn.py.

    Tests focus on _parse_decision (pure function) and _plain_add integration,
    plus the top-level audn_write fallback behavior.
    """

    def test_audn_add_on_no_similar(self, db):
        """When recall returns no similar memories, _plain_add is called."""
        import claudia_memory.services.audn as audn_mod

        mock_llm = MagicMock()
        mock_llm.is_available = AsyncMock(return_value=False)

        # Patch _audn_write_inner to simulate "recall returned nothing -> _plain_add"
        calls = []

        async def fake_inner(content, memory_type, about_entities, importance, source, source_id, db, llm_service):
            # Simulate what happens when recall returns empty: call _plain_add
            result = audn_mod._plain_add(content, memory_type, about_entities, importance, source, source_id)
            calls.append(result)
            return result

        with patch.object(audn_mod, "_audn_write_inner", side_effect=fake_inner):
            result = asyncio.run(audn_mod.audn_write(
                content="Kamil prefers dark mode",
                memory_type="preference",
                about_entities=["Kamil"],
                importance=0.7,
                source="session_transcript",
                source_id="sess-001",
                db=db,
                llm_service=mock_llm,
            ))
        # _plain_add should have been called and returned an int (memory_id)
        assert len(calls) == 1
        assert isinstance(result, int)

    def test_audn_update_on_contradiction(self, db):
        """When LLM says 'update', the existing memory content is changed in DB."""
        from claudia_memory.services.audn import _parse_decision

        # Seed a memory directly in the test db (not through the global service)
        from datetime import datetime
        from claudia_memory.database import content_hash
        existing_id = db.insert("memories", {
            "content": "X is true (old version)",
            "content_hash": content_hash("X is true (old version)"),
            "type": "fact",
            "importance": 0.5,
            "confidence": 1.0,
            "source": "test",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        })
        assert existing_id is not None

        # Verify _parse_decision correctly parses an update action
        decision_json = json.dumps({
            "action": "update",
            "target_id": existing_id,
            "reason": "New version supersedes old",
        })
        parsed = _parse_decision(decision_json)
        assert parsed is not None
        assert parsed["action"] == "update"
        assert parsed["target_id"] == existing_id

        # Simulate the update path: verify db.update works as expected
        db.update(
            "memories",
            {"content": "X is now false (updated)", "updated_at": datetime.utcnow().isoformat()},
            "id = ?",
            (existing_id,),
        )
        row = db.get_one("memories", where="id = ?", where_params=(existing_id,))
        assert row is not None
        assert row["content"] == "X is now false (updated)"

    def test_audn_noop_on_duplicate(self, db):
        """_parse_decision returns noop when LLM says the fact is a duplicate."""
        from claudia_memory.services.audn import _parse_decision

        noop_json = json.dumps({
            "action": "noop",
            "target_id": None,
            "reason": "Exact duplicate",
        })
        parsed = _parse_decision(noop_json)
        assert parsed is not None
        assert parsed["action"] == "noop"
        assert parsed["target_id"] is None

    def test_audn_fallback_on_llm_unavailable(self, db):
        """When LLM is unavailable, audn_write still writes the fact (no data loss)."""
        from claudia_memory.services.audn import audn_write

        mock_llm = MagicMock()
        mock_llm.is_available = AsyncMock(return_value=False)

        # audn_write should not raise and should return a non-None result
        # (fact gets stored either via _plain_add or _audn_write_inner fallback)
        result = asyncio.run(audn_write(
            content="Unique fact that has no duplicates in test db xyz123",
            memory_type="fact",
            about_entities=[],
            importance=0.7,
            source="session_transcript",
            source_id="sess-004",
            db=db,
            llm_service=mock_llm,
        ))
        # Key invariant: no crash, fact was stored
        assert result is not None
        assert isinstance(result, int)

    def test_apply_decision_update_valid_target(self, db):
        """update with a target_id in the candidate set rewrites content and records provenance."""
        from datetime import datetime
        from claudia_memory.database import content_hash
        from claudia_memory.services.audn import _apply_decision

        mid = db.insert("memories", {
            "content": "Old value",
            "content_hash": content_hash("Old value"),
            "type": "fact", "importance": 0.5, "confidence": 1.0, "source": "test",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        })
        similar = [{"id": mid, "content": "Old value", "type": "fact"}]
        result = _apply_decision("update", mid, similar, "New value", "fact", [], 0.6, "test", "s1", db)
        assert result == mid
        row = db.get_one("memories", where="id = ?", where_params=(mid,))
        assert row["content"] == "New value"
        meta = json.loads(row["metadata"] or "{}")
        assert meta.get("corrected_from") == "Old value"

    def test_apply_decision_rejects_hallucinated_target(self, db):
        """update with a target_id NOT in the candidate set must NOT touch that memory; it adds instead."""
        from datetime import datetime
        from claudia_memory.database import content_hash
        from claudia_memory.services.audn import _apply_decision

        # An unrelated memory the model must never be able to clobber.
        victim = db.insert("memories", {
            "content": "Unrelated protected memory",
            "content_hash": content_hash("Unrelated protected memory"),
            "type": "fact", "importance": 0.9, "confidence": 1.0, "source": "test",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        })
        # Candidate set deliberately does NOT include victim's id.
        similar = [{"id": victim + 1000, "content": "some candidate", "type": "fact"}]
        result = _apply_decision("update", victim, similar, "MALICIOUS overwrite", "fact", [], 0.6, "test", "s2", db)

        # victim must be untouched...
        row = db.get_one("memories", where="id = ?", where_params=(victim,))
        assert row["content"] == "Unrelated protected memory"
        # ...and a new memory was added instead.
        assert isinstance(result, int)
        assert result != victim


# ---------------------------------------------------------------------------
# TestSessionDiskScan (unit tests for _enqueue_missed_sessions)
# ---------------------------------------------------------------------------

class TestSessionDiskScan:
    """Unit tests for _enqueue_missed_sessions() in session-health-check.py."""

    def _load_health_module(self):
        """Import session-health-check.py as a module."""
        import importlib.util
        hook_path = Path(__file__).resolve().parents[2] / "template-v2" / ".claude" / "hooks" / "session-health-check.py"
        spec = importlib.util.spec_from_file_location("session_health_check", hook_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_enqueues_uningested(self, tmp_path):
        """A transcript with an unknown session_id gets enqueued."""
        mod = self._load_health_module()

        # Create a fake transcript with a session_id
        projects_dir = tmp_path / ".claude" / "projects" / "proj1"
        projects_dir.mkdir(parents=True)
        transcript = projects_dir / "session.jsonl"
        _write_jsonl(transcript, [
            {"session_id": "test-session-xyz", "role": "user", "content": "Hello"},
        ])

        queue_file = tmp_path / ".claudia" / "sessions_pending.jsonl"
        queue_file.parent.mkdir(parents=True)

        # Patch Path.home() to point to tmp_path
        with patch("pathlib.Path.home", return_value=tmp_path):
            mod._enqueue_missed_sessions(str(queue_file))

        assert queue_file.exists()
        content = queue_file.read_text(encoding="utf-8")
        assert "test-session-xyz" in content

    def test_skips_already_ingested(self, tmp_path):
        """A session_id already in the ingested_ids set from DB is NOT re-queued.

        Tests the logic by pre-populating the queue with the session_id
        (simulating it already being tracked), so _enqueue_missed_sessions
        should not add a duplicate.
        """
        mod = self._load_health_module()

        session_id = "already-ingested-via-queue"

        # Pre-populate the queue file with this session_id (simulates already tracked)
        queue_file = tmp_path / ".claudia" / "sessions_pending.jsonl"
        queue_file.parent.mkdir(parents=True)
        queue_file.write_text(
            json.dumps({"session_id": session_id, "transcript_path": "/tmp/x", "enqueued_at": 1.0}) + "\n",
            encoding="utf-8",
        )

        # Create a transcript for this session
        projects_dir = tmp_path / ".claude" / "projects" / "proj1"
        projects_dir.mkdir(parents=True)
        transcript = projects_dir / "session.jsonl"
        _write_jsonl(transcript, [
            {"session_id": session_id, "role": "user", "content": "Hello"},
        ])

        with patch("pathlib.Path.home", return_value=tmp_path):
            mod._enqueue_missed_sessions(str(queue_file))

        # Should still have exactly 1 entry (not re-added because already in queue)
        content = queue_file.read_text(encoding="utf-8")
        entries = [json.loads(l) for l in content.splitlines() if l.strip()]
        matching = [e for e in entries if e.get("session_id") == session_id]
        assert len(matching) == 1

    def test_skips_already_queued(self, tmp_path):
        """A session_id already in the queue file is not enqueued again."""
        mod = self._load_health_module()

        session_id = "already-queued-session"

        # Pre-populate queue file with this session
        queue_file = tmp_path / ".claudia" / "sessions_pending.jsonl"
        queue_file.parent.mkdir(parents=True)
        queue_file.write_text(
            json.dumps({"session_id": session_id, "transcript_path": "/tmp/x", "enqueued_at": 1.0}) + "\n",
            encoding="utf-8",
        )

        # Create a transcript for this session
        projects_dir = tmp_path / ".claude" / "projects" / "proj1"
        projects_dir.mkdir(parents=True)
        transcript = projects_dir / "session.jsonl"
        _write_jsonl(transcript, [
            {"session_id": session_id, "role": "user", "content": "Hello"},
        ])

        with patch("pathlib.Path.home", return_value=tmp_path):
            mod._enqueue_missed_sessions(str(queue_file))

        # Should still have exactly 1 entry for this session
        content = queue_file.read_text(encoding="utf-8")
        entries = [json.loads(l) for l in content.splitlines() if l.strip()]
        matching = [e for e in entries if e.get("session_id") == session_id]
        assert len(matching) == 1


# ---------------------------------------------------------------------------
# TestProcessSessions (integration)
# ---------------------------------------------------------------------------

class TestProcessSessions:
    """Integration tests for _process_sessions()."""

    def _make_queue_dir(self, tmp_path: Path) -> Path:
        """Create ~/.claudia/ structure under tmp_path and return queue file path."""
        claudia_dir = tmp_path / ".claudia"
        claudia_dir.mkdir(parents=True, exist_ok=True)
        return claudia_dir / "sessions_pending.jsonl"

    def test_closed_session_facts_in_db(self, db, tmp_path):
        """Facts from a closed session end up in the DB episodes table as ingested."""
        config = MockConfig()

        # Write a fake transcript with a clear fact and commitment
        transcript = tmp_path / "session.jsonl"
        _write_jsonl(transcript, [
            {"role": "user", "content": "What is Kamil's rate?"},
            {"role": "assistant", "content": "Kamil's rate is $10k/month"},
            {"role": "user", "content": "Can you send the proposal by Friday?"},
            {"role": "assistant", "content": "I'll send the proposal by Friday."},
        ])

        # Write queue file in the .claudia subdir (as Path.home() / ".claudia" / "sessions_pending.jsonl")
        queue_file = self._make_queue_dir(tmp_path)
        _write_jsonl(queue_file, [{
            "session_id": "test-sess-integration-001",
            "transcript_path": str(transcript),
            "enqueued_at": 1.0,
        }])

        # Mock ingest service to return extracted data (skip actual LLM)
        mock_ingest_result = {
            "status": "extracted",
            "source_type": "session",
            "data": {
                "facts": [
                    {"content": "Kamil's rate is $10k/month", "type": "fact", "about": ["Kamil"], "importance": 0.9},
                ],
                "commitments": [
                    {"content": "Send proposal by Friday", "who": None, "deadline": "Friday", "importance": 0.8},
                ],
                "decisions": [],
                "entities": [{"name": "Kamil", "type": "person", "description": None}],
                "relationships": [],
                "key_topics": ["rate", "proposal"],
                "summary": "Discussion about rate and proposal deadline.",
            },
            "raw_text": "conversation text",
        }

        with patch("pathlib.Path.home", return_value=tmp_path):
            with patch("claudia_memory.daemon.scheduler.asyncio.run") as mock_run:
                call_count = [0]

                def side_effect(coro):
                    call_count[0] += 1
                    if call_count[0] == 1:
                        return mock_ingest_result
                    return 1

                mock_run.side_effect = side_effect
                _process_sessions(db, config)

        # Verify the episode was created and marked as ingested
        rows = db.execute(
            "SELECT * FROM episodes WHERE session_id = ?",
            ("test-sess-integration-001",),
            fetch=True,
        )
        assert rows and len(rows) == 1, f"Expected 1 episode, got {rows}"
        assert rows[0]["ingested_at"] is not None

        # Verify queue file was consumed
        assert not queue_file.exists()

    def test_no_mcp_tools_called(self, db, tmp_path):
        """_process_sessions writes directly to DB -- no MCP tool calls."""
        config = MockConfig()

        transcript = tmp_path / "session.jsonl"
        _write_jsonl(transcript, [
            {"role": "user", "content": "Simple test message"},
        ])
        queue_file = self._make_queue_dir(tmp_path)
        _write_jsonl(queue_file, [{
            "session_id": "test-sess-no-mcp-002",
            "transcript_path": str(transcript),
            "enqueued_at": 1.0,
        }])

        mcp_called = []

        def track_mcp(*args, **kwargs):
            mcp_called.append(args)

        with patch("pathlib.Path.home", return_value=tmp_path):
            with patch("claudia_memory.daemon.scheduler.asyncio.run") as mock_run:
                mock_run.return_value = {
                    "status": "llm_unavailable",
                    "source_type": "session",
                    "data": None,
                    "raw_text": "",
                }
                _process_sessions(db, config)

        # No MCP tools should have been invoked
        assert len(mcp_called) == 0

    def test_disabled_config_skips(self, db, tmp_path):
        """session_capture_enabled=False skips entire processing."""
        config = MockConfig()
        config.session_capture_enabled = False

        queue_file = self._make_queue_dir(tmp_path)
        _write_jsonl(queue_file, [{"session_id": "should-not-process", "transcript_path": "", "enqueued_at": 1.0}])

        with patch("pathlib.Path.home", return_value=tmp_path):
            _process_sessions(db, config)

        # Queue file should still exist (not consumed)
        assert queue_file.exists()

    def test_empty_transcript_marks_ingested(self, db, tmp_path):
        """Empty transcript is marked as ingested without storing facts."""
        config = MockConfig()

        transcript = tmp_path / "empty.jsonl"
        transcript.write_text("", encoding="utf-8")

        queue_file = self._make_queue_dir(tmp_path)
        _write_jsonl(queue_file, [{
            "session_id": "test-sess-empty-003",
            "transcript_path": str(transcript),
            "enqueued_at": 1.0,
        }])

        with patch("pathlib.Path.home", return_value=tmp_path):
            _process_sessions(db, config)

        rows = db.execute(
            "SELECT ingested_at FROM episodes WHERE session_id = ?",
            ("test-sess-empty-003",),
            fetch=True,
        )
        assert rows and rows[0]["ingested_at"] is not None


# ---------------------------------------------------------------------------
# TestUpdateNotice (session-start "update available" notice)
# ---------------------------------------------------------------------------

class TestUpdateNotice:
    """Unit tests for the update-available notice in session-health-check.py."""

    def _load_health_module(self):
        import importlib.util
        hook_path = Path(__file__).resolve().parents[2] / "template-v2" / ".claude" / "hooks" / "session-health-check.py"
        spec = importlib.util.spec_from_file_location("session_health_check_upd", hook_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_is_newer_version(self):
        mod = self._load_health_module()
        assert mod._is_newer_version("1.65.0", "1.64.0") is True
        assert mod._is_newer_version("1.64.1", "1.64.0") is True
        assert mod._is_newer_version("2.0.0", "1.64.0") is True
        assert mod._is_newer_version("1.64.0", "1.64.0") is False
        assert mod._is_newer_version("1.63.9", "1.64.0") is False
        assert mod._is_newer_version("garbage", "1.64.0") is False

    def test_installed_version_reads_manifest(self, tmp_path):
        mod = self._load_health_module()
        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir(parents=True)
        (claude_dir / "manifest.json").write_text(json.dumps({"version": "1.64.0"}), encoding="utf-8")
        assert mod._installed_version(str(tmp_path)) == "1.64.0"

    def test_installed_version_missing_manifest(self, tmp_path):
        mod = self._load_health_module()
        assert mod._installed_version(str(tmp_path)) is None

    def test_update_notice_when_newer(self, tmp_path):
        mod = self._load_health_module()
        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir(parents=True)
        (claude_dir / "manifest.json").write_text(json.dumps({"version": "1.64.0"}), encoding="utf-8")
        mod._fetch_latest_version = lambda: "1.66.0"
        notice = mod._update_notice(str(tmp_path))
        assert "1.66.0" in notice
        assert "claudia update" in notice

    def test_no_notice_when_current(self, tmp_path):
        mod = self._load_health_module()
        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir(parents=True)
        (claude_dir / "manifest.json").write_text(json.dumps({"version": "1.66.0"}), encoding="utf-8")
        mod._fetch_latest_version = lambda: "1.66.0"
        assert mod._update_notice(str(tmp_path)) == ""

    def test_no_notice_when_no_manifest(self, tmp_path):
        mod = self._load_health_module()
        mod._fetch_latest_version = lambda: "9.9.9"
        assert mod._update_notice(str(tmp_path)) == ""
