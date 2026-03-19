"""Tests for <private> tag filtering in the remember pipeline."""

import pytest

from claudia_memory.services.remember import _strip_private


class TestStripPrivateUnit:
    """Unit tests for _strip_private() function."""

    def test_strip_private_basic(self):
        """Basic tag removal with surrounding text."""
        result = _strip_private("Hello <private>secret</private> world")
        assert result == "Hello  world"

    def test_strip_private_multiline(self):
        """Tag spanning multiple lines is removed."""
        content = "Before\n<private>\nline1\nline2\n</private>\nAfter"
        result = _strip_private(content)
        assert result == "Before\n\nAfter"

    def test_strip_private_case_insensitive(self):
        """Tags are case-insensitive."""
        assert "visible" in _strip_private("visible <Private>hidden</Private>")
        assert "visible" in _strip_private("visible <PRIVATE>hidden</PRIVATE>")
        assert "visible" in _strip_private("visible <pRiVaTe>hidden</pRiVaTe>")

    def test_strip_private_multiple_blocks(self):
        """Multiple private blocks are all removed."""
        content = "A <private>X</private> B <private>Y</private> C"
        result = _strip_private(content)
        assert result == "A  B  C"

    def test_strip_private_no_tags(self):
        """Content without tags passes through unchanged."""
        content = "No private tags here"
        assert _strip_private(content) == content

    def test_strip_private_entire_content(self):
        """All-private content preserves original (never store empty)."""
        content = "<private>everything is secret</private>"
        result = _strip_private(content)
        assert result == content  # Preserved, not empty

    def test_strip_private_nested(self):
        """Nested-style tags use non-greedy match (strips outer block)."""
        content = "A <private>outer <private>inner</private> rest</private> B"
        result = _strip_private(content)
        # Non-greedy: matches first <private> to first </private>
        # So "outer <private>inner" is stripped, " rest</private> B" remains
        assert "A" in result
        assert "B" in result


class TestPrivacyIntegration:
    """Integration tests verifying privacy stripping in storage pipeline."""

    def test_remember_fact_strips_private(self, db):
        """remember_fact() strips private tags before storing."""
        from claudia_memory.services.remember import RememberService

        service = RememberService()
        # Point service at the test database
        service.db = db

        memory_id = service.remember_fact(
            content="Sarah's birthday is March 5 <private>SSN: 123-45-6789</private>",
            memory_type="fact",
            source="test",
        )
        assert memory_id is not None

        # Retrieve via service's db and verify private content was stripped
        row = service.db.get_one("memories", where="id = ?", where_params=(memory_id,))
        assert row is not None
        assert "123-45-6789" not in row["content"]
        assert "Sarah's birthday is March 5" in row["content"]

    def test_buffer_turn_strips_private(self, db):
        """buffer_turn() strips private tags from both user and assistant content."""
        from claudia_memory.services.remember import RememberService

        service = RememberService()
        # Point service at the test database
        service.db = db

        result = service.buffer_turn(
            user_content="My password is <private>hunter2</private>",
            assistant_content="I noted your <private>credentials</private> request",
        )
        assert "episode_id" in result

        # Retrieve turn via service's db and verify
        turns = service.db.execute(
            "SELECT * FROM turn_buffer WHERE episode_id = ?",
            (result["episode_id"],),
            fetch=True,
        )
        assert len(turns) == 1
        assert "hunter2" not in (turns[0]["user_content"] or "")
        assert "credentials" not in (turns[0]["assistant_content"] or "")
