"""Tests for updated content length warning threshold in guards.

The warning threshold was raised from 500 to 800 chars to reduce
log noise from normal summary-type memories (550-850 chars).
"""

import pytest

from claudia_memory.services.guards import validate_memory


class TestContentLengthThreshold:
    """Tests for the 800-char warning threshold."""

    def test_750_chars_no_warning(self):
        """Content of 750 chars does NOT trigger a warning."""
        content = "x" * 750
        result = validate_memory(content, "fact", 1.0)
        assert result.is_valid
        assert not any("Long content" in w for w in result.warnings)
        assert "content" not in result.adjustments

    def test_850_chars_triggers_warning(self):
        """Content of 850 chars DOES trigger a warning."""
        content = "x" * 850
        result = validate_memory(content, "fact", 1.0)
        assert result.is_valid
        assert any("Long content" in w for w in result.warnings)
        assert "content" not in result.adjustments  # No truncation yet

    def test_1001_chars_truncated(self):
        """Content of 1001 chars DOES get truncated (regression check)."""
        content = "x" * 1001
        result = validate_memory(content, "fact", 1.0)
        assert result.adjustments["content"] == "x" * 1000
        assert any("truncated" in w.lower() for w in result.warnings)

    def test_500_chars_no_warning(self):
        """Content at 500 chars should not warn (below new threshold)."""
        content = "x" * 500
        result = validate_memory(content, "fact", 1.0)
        assert result.warnings == [] or not any("Long content" in w for w in result.warnings)

    def test_800_chars_no_warning(self):
        """Content at exactly 800 chars should not warn (boundary)."""
        content = "x" * 800
        result = validate_memory(content, "fact", 1.0)
        assert not any("Long content" in w for w in result.warnings)

    def test_801_chars_triggers_warning(self):
        """Content at 801 chars should warn (just over threshold)."""
        content = "x" * 801
        result = validate_memory(content, "fact", 1.0)
        assert any("Long content" in w for w in result.warnings)
