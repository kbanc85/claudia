"""Tests for cognitive tools: language model service and ingest service."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from claudia_memory.language_model import LanguageModelService
from claudia_memory.services.ingest import IngestService, _parse_json_response


# ---------------------------------------------------------------------------
# JSON parser tests (no network, no mocks)
# ---------------------------------------------------------------------------

class TestParseJsonResponse:
    """Test the JSON response parser that handles LLM output quirks."""

    def test_clean_json(self):
        result = _parse_json_response('{"key": "value"}')
        assert result == {"key": "value"}

    def test_json_with_whitespace(self):
        result = _parse_json_response('  \n{"key": "value"}\n  ')
        assert result == {"key": "value"}

    def test_json_in_code_fence(self):
        text = '```json\n{"key": "value"}\n```'
        result = _parse_json_response(text)
        assert result == {"key": "value"}

    def test_json_in_plain_code_fence(self):
        text = '```\n{"key": "value"}\n```'
        result = _parse_json_response(text)
        assert result == {"key": "value"}

    def test_json_with_preamble(self):
        text = 'Here is the output:\n{"key": "value"}'
        result = _parse_json_response(text)
        assert result == {"key": "value"}

    def test_invalid_json(self):
        result = _parse_json_response("not json at all")
        assert result is None

    def test_empty_string(self):
        result = _parse_json_response("")
        assert result is None

    def test_nested_json(self):
        text = '{"entities": [{"name": "Sarah", "type": "person"}], "topics": ["Q3"]}'
        result = _parse_json_response(text)
        assert result["entities"][0]["name"] == "Sarah"
        assert result["topics"] == ["Q3"]

    def test_json_with_trailing_text(self):
        text = '{"key": "value"}\nSome trailing explanation'
        result = _parse_json_response(text)
        assert result == {"key": "value"}


# ---------------------------------------------------------------------------
# Language model service tests (mocked HTTP)
# ---------------------------------------------------------------------------

class TestLanguageModelService:
    """Test the Ollama language model service."""

    def test_no_model_configured(self):
        """When language_model is empty, service reports unavailable."""
        with patch("claudia_memory.language_model.get_config") as mock_config:
            mock_config.return_value = MagicMock(
                ollama_host="http://localhost:11434",
                language_model="",
            )
            svc = LanguageModelService(model="")
            assert svc.is_available_sync() is False

    def test_model_configured_but_ollama_down(self):
        """When Ollama is unreachable, service reports unavailable."""
        svc = LanguageModelService(host="http://localhost:99999", model="qwen3:4b")
        svc._available = None
        assert svc.is_available_sync() is False

    def test_sync_generate_unavailable_returns_none(self):
        """generate_sync returns None when unavailable."""
        svc = LanguageModelService(model="")
        svc._available = False
        result = svc.generate_sync("test prompt")
        assert result is None


# ---------------------------------------------------------------------------
# Ingest service tests (mocked LLM)
# ---------------------------------------------------------------------------

class TestIngestService:
    """Test the ingest service with mocked language model."""

    @pytest.mark.asyncio
    async def test_ingest_llm_unavailable(self):
        """When LLM is unavailable, returns fallback with raw text."""
        with patch("claudia_memory.services.ingest.get_language_model_service") as mock_get:
            mock_llm = AsyncMock()
            mock_llm.is_available = AsyncMock(return_value=False)
            mock_get.return_value = mock_llm

            svc = IngestService()
            svc.llm = mock_llm
            result = await svc.ingest("Some meeting text", source_type="meeting")

            assert result["status"] == "llm_unavailable"
            assert result["raw_text"] == "Some meeting text"
            assert result["data"] is None

    @pytest.mark.asyncio
    async def test_ingest_successful_extraction(self):
        """When LLM returns valid JSON, parses and returns it."""
        mock_extraction = {
            "participants": [{"name": "Sarah", "role": "investor"}],
            "key_decisions": [{"decision": "Launch in August", "made_by": "Sarah"}],
            "action_items": [],
            "commitments": [{"content": "Send deck by Friday", "who": "User", "importance": 0.9}],
            "facts": [{"content": "Q3 launch target is August 15", "type": "fact", "about": ["Q3"], "importance": 0.8}],
            "entities": [{"name": "Sarah", "type": "person", "description": "Investor"}],
            "relationships": [{"source": "User", "target": "Sarah", "relationship": "investor_of"}],
            "topics": ["Q3 launch", "fundraising"],
            "sentiment_summary": "Positive and productive",
        }

        with patch("claudia_memory.services.ingest.get_language_model_service") as mock_get:
            mock_llm = AsyncMock()
            mock_llm.is_available = AsyncMock(return_value=True)
            mock_llm.generate = AsyncMock(return_value=json.dumps(mock_extraction))
            mock_get.return_value = mock_llm

            svc = IngestService()
            svc.llm = mock_llm
            result = await svc.ingest("Meeting transcript here...", source_type="meeting")

            assert result["status"] == "extracted"
            assert result["data"]["participants"][0]["name"] == "Sarah"
            assert len(result["data"]["commitments"]) == 1
            assert result["raw_text"] == "Meeting transcript here..."

    @pytest.mark.asyncio
    async def test_ingest_parse_error(self):
        """When LLM returns garbage, returns parse_error with raw output."""
        with patch("claudia_memory.services.ingest.get_language_model_service") as mock_get:
            mock_llm = AsyncMock()
            mock_llm.is_available = AsyncMock(return_value=True)
            mock_llm.generate = AsyncMock(return_value="This is not JSON at all!!!")
            mock_get.return_value = mock_llm

            svc = IngestService()
            svc.llm = mock_llm
            result = await svc.ingest("Some text")

            assert result["status"] == "parse_error"
            assert result["raw_text"] == "Some text"
            assert "raw_output" in result

    @pytest.mark.asyncio
    async def test_ingest_with_context(self):
        """Context string is passed to the LLM prompt."""
        with patch("claudia_memory.services.ingest.get_language_model_service") as mock_get:
            mock_llm = AsyncMock()
            mock_llm.is_available = AsyncMock(return_value=True)
            mock_llm.generate = AsyncMock(return_value='{"facts": [], "entities": [], "topics": [], "summary": "test", "commitments": [], "action_items": [], "relationships": []}')
            mock_get.return_value = mock_llm

            svc = IngestService()
            svc.llm = mock_llm
            await svc.ingest("Email body", source_type="email", context="Email from Jim about Q3")

            # Verify context was included in the prompt
            call_args = mock_llm.generate.call_args
            assert "Email from Jim about Q3" in call_args.kwargs.get("prompt", call_args[1].get("prompt", ""))

    @pytest.mark.asyncio
    async def test_ingest_default_source_type(self):
        """Default source_type is 'general'."""
        with patch("claudia_memory.services.ingest.get_language_model_service") as mock_get:
            mock_llm = AsyncMock()
            mock_llm.is_available = AsyncMock(return_value=False)
            mock_get.return_value = mock_llm

            svc = IngestService()
            svc.llm = mock_llm
            result = await svc.ingest("Some text")

            assert result["source_type"] == "general"
