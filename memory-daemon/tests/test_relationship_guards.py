"""Tests for origin-aware relationship strength guards."""

import pytest

from claudia_memory.services.guards import (
    ORIGIN_STRENGTH_CEILING,
    REINFORCEMENT_BY_ORIGIN,
    validate_relationship,
)


class TestOriginStrengthCeilings:
    """Test that relationship strength is capped by origin authority."""

    def test_inferred_capped_at_half(self):
        """Inferred relationships are capped at 0.5 strength."""
        result = validate_relationship(strength=1.0, origin_type="inferred")
        assert "strength" in result.adjustments
        assert result.adjustments["strength"] == 0.5
        assert any("ceiling" in w for w in result.warnings)

    def test_user_stated_uncapped(self):
        """User-stated relationships allow full 1.0 strength."""
        result = validate_relationship(strength=1.0, origin_type="user_stated")
        # No cap needed -- user_stated ceiling is 1.0
        assert result.adjustments.get("strength", 1.0) == 1.0
        assert not any("ceiling" in w for w in result.warnings)

    def test_extracted_capped_at_0_8(self):
        """Extracted relationships are capped at 0.8 strength."""
        result = validate_relationship(strength=1.0, origin_type="extracted")
        assert "strength" in result.adjustments
        assert result.adjustments["strength"] == 0.8
        assert any("ceiling" in w for w in result.warnings)

    def test_corrected_uncapped(self):
        """Corrected relationships allow full 1.0 strength (same as user_stated)."""
        result = validate_relationship(strength=1.0, origin_type="corrected")
        assert result.adjustments.get("strength", 1.0) == 1.0
        assert not any("ceiling" in w for w in result.warnings)

    def test_unknown_origin_defaults_to_0_5(self):
        """Unknown origin types default to 0.5 ceiling."""
        result = validate_relationship(strength=0.9, origin_type="mystery")
        assert result.adjustments["strength"] == 0.5

    def test_strength_below_ceiling_untouched(self):
        """Strength already below ceiling is not adjusted."""
        result = validate_relationship(strength=0.3, origin_type="inferred")
        # 0.3 < 0.5 ceiling, so no adjustment for ceiling
        assert "strength" not in result.adjustments or result.adjustments.get("strength") == 0.3


class TestReinforcementScaling:
    """Test that reinforcement increments scale by origin."""

    def test_inferred_increment_is_0_05(self):
        assert REINFORCEMENT_BY_ORIGIN["inferred"] == 0.05

    def test_extracted_increment_is_0_1(self):
        assert REINFORCEMENT_BY_ORIGIN["extracted"] == 0.1

    def test_user_stated_increment_is_0_2(self):
        assert REINFORCEMENT_BY_ORIGIN["user_stated"] == 0.2

    def test_corrected_increment_is_0_2(self):
        assert REINFORCEMENT_BY_ORIGIN["corrected"] == 0.2


class TestCeilingValues:
    """Verify the ceiling constants are correct."""

    def test_ceiling_values(self):
        assert ORIGIN_STRENGTH_CEILING == {
            "user_stated": 1.0,
            "extracted": 0.8,
            "inferred": 0.5,
            "corrected": 1.0,
        }
