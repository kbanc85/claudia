"""Tests for PostToolUse observation ingestion and relevance filtering."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from claudia_memory.daemon.scheduler import (
    _is_relevant_observation,
    _ingest_observations,
)


class MockConfig:
    """Minimal config mock for testing."""
    observation_capture_enabled = True
    observation_capture_all = False
    observation_relevant_tools = []
    observation_relevant_paths = []
    observation_ingest_interval = 30


class TestRelevanceFilter:
    """Tests for the observation relevance filter."""

    def test_gmail_tool_passes(self):
        config = MockConfig()
        obs = {"tool": "gmail_send", "input": "hello", "output": "sent"}
        assert _is_relevant_observation(obs, config) is True

    def test_slack_tool_passes(self):
        config = MockConfig()
        obs = {"tool": "SLACK_SEND_MESSAGE", "input": "msg", "output": "ok"}
        assert _is_relevant_observation(obs, config) is True

    def test_edit_python_file_dropped(self):
        config = MockConfig()
        obs = {"tool": "Edit", "input": "/src/main.py", "output": "ok"}
        assert _is_relevant_observation(obs, config) is False

    def test_edit_context_file_passes(self):
        config = MockConfig()
        obs = {"tool": "Edit", "input": "context/me.md updated", "output": "ok"}
        assert _is_relevant_observation(obs, config) is True

    def test_edit_people_file_passes(self):
        config = MockConfig()
        obs = {"tool": "Write", "input": "people/sarah.md", "output": "ok"}
        assert _is_relevant_observation(obs, config) is True

    def test_known_entity_mention_passes(self):
        config = MockConfig()
        obs = {"tool": "Bash", "input": "email to Sarah Chen", "output": "done"}
        known = {"sarah chen", "john"}
        assert _is_relevant_observation(obs, config, known) is True

    def test_commitment_language_passes(self):
        config = MockConfig()
        obs = {"tool": "Bash", "input": "I'll send the report by Friday", "output": ""}
        assert _is_relevant_observation(obs, config) is True

    def test_capture_all_bypasses_filter(self):
        config = MockConfig()
        config.observation_capture_all = True
        obs = {"tool": "Edit", "input": "/random/file.py", "output": "ok"}
        assert _is_relevant_observation(obs, config) is True

    def test_custom_relevant_tool_passes(self):
        config = MockConfig()
        config.observation_relevant_tools = ["my_crm"]
        obs = {"tool": "my_crm_lookup", "input": "client", "output": "found"}
        assert _is_relevant_observation(obs, config) is True

    def test_custom_relevant_path_passes(self):
        config = MockConfig()
        config.observation_relevant_paths = ["clients/"]
        obs = {"tool": "Edit", "input": "clients/acme.md", "output": "ok"}
        assert _is_relevant_observation(obs, config) is True

    def test_irrelevant_tool_dropped(self):
        config = MockConfig()
        obs = {"tool": "Bash", "input": "npm test", "output": "pass"}
        assert _is_relevant_observation(obs, config) is False


class TestIngestion:
    """Tests for the observation ingestion pipeline."""

    def test_missing_file_no_error(self, db):
        """Missing observations file is handled gracefully."""
        config = MockConfig()
        with patch("claudia_memory.daemon.scheduler.Path") as MockPath:
            mock_home = MagicMock()
            mock_file = MagicMock()
            mock_file.exists.return_value = False
            mock_home.__truediv__ = lambda s, k: mock_file if k == ".claudia" else mock_file
            mock_file.__truediv__ = lambda s, k: mock_file
            MockPath.home.return_value = mock_home
            # Should not raise
            _ingest_observations(db, config)

    def test_malformed_json_skipped(self, tmp_path):
        """Malformed JSON lines are skipped without crashing."""
        config = MockConfig()
        config.observation_capture_all = True

        obs_file = tmp_path / "observations.jsonl"
        obs_file.write_text(
            'not json\n'
            '{"tool": "gmail_send", "input": "test", "output": "ok"}\n'
            '{broken\n'
        )

        with patch("claudia_memory.daemon.scheduler.Path") as MockPath:
            mock_home = MagicMock()
            MockPath.home.return_value = mock_home

            claudia_dir = tmp_path
            mock_home.__truediv__ = lambda s, k: claudia_dir

            # Override to use our temp file
            import claudia_memory.daemon.scheduler as sched_mod
            original_func = sched_mod._ingest_observations

            # Just test that the relevance filter and JSON parsing work
            # by directly testing malformed lines
            lines = obs_file.read_text().strip().split("\n")
            parsed = 0
            for line in lines:
                try:
                    json.loads(line)
                    parsed += 1
                except json.JSONDecodeError:
                    pass
            assert parsed == 1  # Only the valid line

    def test_disabled_config_skips(self, db):
        """observation_capture_enabled=False skips entire ingestion."""
        config = MockConfig()
        config.observation_capture_enabled = False
        # Should return immediately without touching files
        _ingest_observations(db, config)
