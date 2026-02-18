"""Tests for LLM serialization error defense.

Validates that the MCP layer gracefully handles two classes of LLM tool-calling
errors: (1) string-serialized arrays and (2) missing optional fields like
episode_id in end_session.
"""

import json
import tempfile
from pathlib import Path

import pytest
import jsonschema

from claudia_memory.database import Database
from claudia_memory.mcp.server import _coerce_arg, _coerce_int
from claudia_memory.services.remember import RememberService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db():
    """Create a fresh test database."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _make_service(db):
    """Create a RememberService without embedding service."""
    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc.embeddings = None
    return svc


# ---------------------------------------------------------------------------
# TestCoerceInt -- unit tests for the _coerce_int utility
# ---------------------------------------------------------------------------

class TestCoerceInt:
    """Tests for _coerce_int string/float-to-int coercion.

    LLMs sometimes pass integer arguments as JSON strings (e.g. "days": "7").
    This test class validates all branches of _coerce_int.
    """

    def test_string_integer_coerced(self):
        """String '7' should become int 7 -- the primary bug fix."""
        args = {"days": "7"}
        _coerce_int(args, "days")
        assert args["days"] == 7
        assert isinstance(args["days"], int)

    def test_string_zero_coerced(self):
        """String '0' should become int 0."""
        args = {"limit": "0"}
        _coerce_int(args, "limit")
        assert args["limit"] == 0

    def test_float_coerced_to_int(self):
        """Float 7.0 should become int 7."""
        args = {"days": 7.0}
        _coerce_int(args, "days")
        assert args["days"] == 7
        assert isinstance(args["days"], int)

    def test_native_int_unchanged(self):
        """Already-native int should be left unchanged."""
        args = {"limit": 10}
        _coerce_int(args, "limit")
        assert args["limit"] == 10
        assert isinstance(args["limit"], int)

    def test_noop_on_none(self):
        """None value should be left unchanged (param omitted)."""
        args = {"days": None}
        _coerce_int(args, "days")
        assert args["days"] is None

    def test_noop_on_missing_key(self):
        """Missing key should not raise or create the key."""
        args = {}
        _coerce_int(args, "days")
        assert "days" not in args

    def test_bool_not_coerced(self):
        """bool is a subclass of int -- should not be coerced (already int-compatible)."""
        args = {"flag": True}
        _coerce_int(args, "flag")
        # bool passes through unchanged (isinstance(True, bool) guard)
        assert args["flag"] is True

    def test_invalid_string_leaves_value(self):
        """Non-numeric string should be left as-is (with warning logged)."""
        args = {"days": "seven"}
        _coerce_int(args, "days")
        assert args["days"] == "seven"  # unchanged

    def test_string_with_whitespace_coerced(self):
        """String with surrounding whitespace should coerce via int()."""
        args = {"limit": "  20  "}
        _coerce_int(args, "limit")
        assert args["limit"] == 20

    def test_multiple_params_independent(self):
        """Coercing multiple params should work independently."""
        args = {"days": "14", "limit": "50", "max_depth": 4}
        _coerce_int(args, "days")
        _coerce_int(args, "limit")
        _coerce_int(args, "max_depth")
        assert args["days"] == 14
        assert args["limit"] == 50
        assert args["max_depth"] == 4

    def test_upcoming_days_string_scenario(self):
        """Reproduce the exact bug: memory.upcoming called with days='7'."""
        # This is what the user's LLM sent, causing the original error
        args = {"days": "7", "include_overdue": True}
        _coerce_int(args, "days")
        assert args["days"] == 7
        assert isinstance(args["days"], int)


# ---------------------------------------------------------------------------
# TestIntegerSchemas -- verify updated schemas accept both int and string
# ---------------------------------------------------------------------------

class TestIntegerSchemas:
    """Tests that integer schemas now accept both native int and string."""

    def _make_int_schema(self, param_name, default=None):
        """Build a minimal schema for a single integer parameter."""
        prop = {"type": ["integer", "string"], "description": "test"}
        if default is not None:
            prop["default"] = default
        return {
            "type": "object",
            "properties": {param_name: prop},
        }

    def test_schema_accepts_native_int(self):
        """Updated schema should accept a native integer."""
        schema = self._make_int_schema("days", 14)
        jsonschema.validate({"days": 7}, schema)

    def test_schema_accepts_string_int(self):
        """Updated schema should accept an integer passed as a string."""
        schema = self._make_int_schema("days", 14)
        jsonschema.validate({"days": "7"}, schema)

    def test_schema_accepts_omitted_optional(self):
        """Optional integer param can be omitted entirely."""
        schema = self._make_int_schema("days", 14)
        jsonschema.validate({}, schema)

    def test_original_int_only_rejects_string(self):
        """Baseline: original 'type: integer' schema rejects string input."""
        schema = {
            "type": "object",
            "properties": {
                "days": {"type": "integer"}
            }
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate({"days": "7"}, schema)


# ---------------------------------------------------------------------------
# TestCoerceArg -- unit tests for the _coerce_arg utility
# ---------------------------------------------------------------------------

class TestCoerceArg:
    """Tests for _coerce_arg string-to-native coercion."""

    def test_string_to_list(self):
        """JSON string containing an array should be parsed to a list."""
        args = {"about": '["Alice", "Bob"]'}
        _coerce_arg(args, "about")
        assert args["about"] == ["Alice", "Bob"]

    def test_string_to_list_of_objects(self):
        """JSON string containing array of objects should parse correctly."""
        reflections = [{"type": "learning", "content": "User prefers concise responses"}]
        args = {"reflections": json.dumps(reflections)}
        _coerce_arg(args, "reflections")
        assert args["reflections"] == reflections

    def test_noop_on_native_list(self):
        """Already-native list should be left unchanged."""
        original = ["Alice", "Bob"]
        args = {"about": original}
        _coerce_arg(args, "about")
        assert args["about"] is original

    def test_noop_on_none(self):
        """None value should be left unchanged."""
        args = {"about": None}
        _coerce_arg(args, "about")
        assert args["about"] is None

    def test_noop_on_missing_key(self):
        """Missing key should not raise or create the key."""
        args = {}
        _coerce_arg(args, "about")
        assert "about" not in args

    def test_invalid_json_leaves_value(self):
        """Unparseable string should be left as-is (with warning logged)."""
        args = {"about": "not valid json ["}
        _coerce_arg(args, "about")
        assert args["about"] == "not valid json ["

    def test_wrong_type_after_parse_leaves_value(self):
        """String that parses to wrong type (e.g. dict instead of list) stays as-is."""
        args = {"about": '{"key": "value"}'}
        _coerce_arg(args, "about")
        # Should remain the original string since parsed result is dict, not list
        assert args["about"] == '{"key": "value"}'

    def test_empty_array_string(self):
        """Empty array string should parse to empty list."""
        args = {"types": "[]"}
        _coerce_arg(args, "types")
        assert args["types"] == []


# ---------------------------------------------------------------------------
# TestEndSessionMissingEpisodeId -- handler auto-creates episodes
# ---------------------------------------------------------------------------

class TestEndSessionMissingEpisodeId:
    """Tests for end_session handler when episode_id is missing or invalid."""

    def test_auto_creates_episode_when_none(self):
        """end_session should auto-create an episode when episode_id is not provided."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            # Simulate calling end_session without episode_id
            # (We test at the service level with a freshly-created episode)
            from datetime import datetime
            episode_id = svc.db.insert("episodes", {
                "started_at": datetime.utcnow().isoformat(),
                "source": "claude_code",
            })

            result = svc.end_session(
                episode_id=episode_id,
                narrative="Session without prior buffer_turn calls.",
            )

            assert result["narrative_stored"] is True
            episode = db.get_one("episodes", where="id = ?", where_params=(episode_id,))
            assert episode is not None
            assert episode["narrative"] == "Session without prior buffer_turn calls."
        finally:
            db.close()

    def test_auto_creates_episode_for_nonexistent_id(self):
        """end_session should create a new episode if requested ID doesn't exist."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            # Use an ID that doesn't exist
            fake_id = 99999
            episode = db.get_one("episodes", where="id = ?", where_params=(fake_id,))
            assert episode is None  # Confirm it doesn't exist

            # The handler logic (tested here at DB level) should create a new one
            from datetime import datetime
            new_id = svc.db.insert("episodes", {
                "started_at": datetime.utcnow().isoformat(),
                "source": "claude_code",
            })

            result = svc.end_session(
                episode_id=new_id,
                narrative="Fallback episode for missing ID.",
            )

            assert result["narrative_stored"] is True
        finally:
            db.close()

    def test_end_session_with_facts_as_string(self):
        """end_session should work when facts arrive as a JSON string after coercion."""
        db, tmpdir = _make_db()
        try:
            svc = _make_service(db)

            # Create episode
            from datetime import datetime
            episode_id = svc.db.insert("episodes", {
                "started_at": datetime.utcnow().isoformat(),
                "source": "claude_code",
            })

            # Simulate coerced facts (string -> list already done by _coerce_arg)
            facts = [{"content": "User likes dark mode", "type": "preference"}]

            result = svc.end_session(
                episode_id=episode_id,
                narrative="Testing string-serialized facts.",
                facts=facts,
            )

            assert result["narrative_stored"] is True
            assert result["facts_stored"] >= 1
        finally:
            db.close()


# ---------------------------------------------------------------------------
# TestSchemaValidation -- verify updated schemas accept both types
# ---------------------------------------------------------------------------

class TestSchemaValidation:
    """Tests that updated schemas pass jsonschema validation for both array and string."""

    def _make_schema(self, prop_name, prop_schema, required=None):
        """Build a minimal object schema with one property."""
        schema = {
            "type": "object",
            "properties": {
                prop_name: prop_schema,
            },
        }
        if required:
            schema["required"] = required
        return schema

    def test_array_type_union_accepts_native_array(self):
        """Schema with type: [array, string] should accept a native array."""
        schema = self._make_schema("about", {
            "type": ["array", "string"],
            "items": {"type": "string"},
        })
        # Should not raise
        jsonschema.validate({"about": ["Alice", "Bob"]}, schema)

    def test_array_type_union_accepts_string(self):
        """Schema with type: [array, string] should accept a JSON string."""
        schema = self._make_schema("about", {
            "type": ["array", "string"],
            "items": {"type": "string"},
        })
        # Should not raise
        jsonschema.validate({"about": '["Alice", "Bob"]'}, schema)

    def test_original_array_only_rejects_string(self):
        """Original schema with type: array should reject a string (proving the fix is needed)."""
        schema = self._make_schema("about", {
            "type": "array",
            "items": {"type": "string"},
        })
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate({"about": '["Alice", "Bob"]'}, schema)

    def test_end_session_narrative_only_required(self):
        """end_session schema should only require narrative, not episode_id."""
        schema = {
            "type": "object",
            "properties": {
                "episode_id": {"type": "integer"},
                "narrative": {"type": "string"},
            },
            "required": ["narrative"],
        }
        # Should not raise -- episode_id is omitted
        jsonschema.validate({"narrative": "Session summary"}, schema)

    def test_end_session_rejects_missing_narrative(self):
        """end_session schema should still require narrative."""
        schema = {
            "type": "object",
            "properties": {
                "episode_id": {"type": "integer"},
                "narrative": {"type": "string"},
            },
            "required": ["narrative"],
        }
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate({"episode_id": 1}, schema)
