"""Tests for deterministic guards -- pure functions, no DB needed."""

import pytest

from claudia_memory.services.guards import (
    ORIGIN_STRENGTH_CEILING,
    REINFORCEMENT_BY_ORIGIN,
    validate_entity,
    validate_memory,
    validate_relationship,
)


# =============================================================================
# Memory validation
# =============================================================================


class TestMemoryValidation:
    """Tests for validate_memory guard."""

    def test_normal_passes(self):
        """Normal memory passes without warnings."""
        result = validate_memory("Buy groceries", "fact", 0.8)
        assert result.is_valid
        assert result.warnings == []
        assert result.adjustments == {}

    def test_long_content_warning(self):
        """Content >500 chars warns but does not truncate."""
        content = "x" * 600
        result = validate_memory(content, "fact", 1.0)
        assert result.is_valid
        assert len(result.warnings) == 1
        assert "Long content" in result.warnings[0]
        assert "content" not in result.adjustments

    def test_truncate_very_long(self):
        """Content >1000 chars gets truncated."""
        content = "x" * 1200
        result = validate_memory(content, "fact", 1.0)
        assert result.adjustments["content"] == "x" * 1000
        assert "truncated" in result.warnings[0].lower()

    def test_importance_clamped(self):
        """Importance outside [0, 1] gets clamped."""
        result_high = validate_memory("test", "fact", 1.5)
        assert result_high.adjustments["importance"] == 1.0

        result_low = validate_memory("test", "fact", -0.5)
        assert result_low.adjustments["importance"] == 0.0

    def test_commitment_no_deadline(self):
        """Commitment without deadline gets a warning."""
        result = validate_memory("I will finish the report", "commitment", 1.0)
        assert any("no detected deadline" in w.lower() for w in result.warnings)

    def test_commitment_with_deadline(self):
        """Commitment with a deadline pattern does not warn."""
        result = validate_memory("Finish report by Friday", "commitment", 1.0)
        assert not any("no detected deadline" in w.lower() for w in result.warnings)


# =============================================================================
# Entity validation
# =============================================================================


class TestEntityValidation:
    """Tests for validate_entity guard."""

    def test_near_duplicate(self):
        """Similar entity names trigger a warning."""
        result = validate_entity("Sarah Chen", "person", ["sarah chenn", "bob smith"])
        assert any("near-duplicate" in w.lower() for w in result.warnings)

    def test_empty_name(self):
        """Empty entity name is invalid."""
        result = validate_entity("", "person")
        assert not result.is_valid


# =============================================================================
# Relationship validation
# =============================================================================


class TestBasicRelationshipValidation:
    """Tests for basic strength clamping in validate_relationship."""

    def test_strength_clamped(self):
        """Strength outside [0, 1] gets clamped."""
        # Use user_stated (ceiling=1.0) to isolate the clamping logic from origin ceilings
        result = validate_relationship(1.5, origin_type="user_stated")
        assert result.adjustments["strength"] == 1.0

        result2 = validate_relationship(-0.2, origin_type="user_stated")
        assert result2.adjustments["strength"] == 0.0


class TestOriginAwareRelationshipValidation:
    """Tests for origin-aware relationship strength guards."""

    # -- Origin strength ceilings --

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

    # -- Reinforcement scaling --

    def test_inferred_increment_is_0_05(self):
        assert REINFORCEMENT_BY_ORIGIN["inferred"] == 0.05

    def test_extracted_increment_is_0_1(self):
        assert REINFORCEMENT_BY_ORIGIN["extracted"] == 0.1

    def test_user_stated_increment_is_0_2(self):
        assert REINFORCEMENT_BY_ORIGIN["user_stated"] == 0.2

    def test_corrected_increment_is_0_2(self):
        assert REINFORCEMENT_BY_ORIGIN["corrected"] == 0.2

    # -- Ceiling constant values --

    def test_ceiling_values(self):
        assert ORIGIN_STRENGTH_CEILING == {
            "user_stated": 1.0,
            "extracted": 0.8,
            "inferred": 0.5,
            "corrected": 1.0,
        }
