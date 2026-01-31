"""Tests for deterministic guards -- pure functions, no DB needed"""

from claudia_memory.services.guards import (
    validate_entity,
    validate_memory,
    validate_relationship,
)


def test_validate_memory_normal():
    """Normal memory passes without warnings"""
    result = validate_memory("Buy groceries", "fact", 0.8)
    assert result.is_valid
    assert result.warnings == []
    assert result.adjustments == {}


def test_validate_memory_long_content_warning():
    """Content >500 chars warns but does not truncate"""
    content = "x" * 600
    result = validate_memory(content, "fact", 1.0)
    assert result.is_valid
    assert len(result.warnings) == 1
    assert "Long content" in result.warnings[0]
    assert "content" not in result.adjustments


def test_validate_memory_truncate_very_long():
    """Content >1000 chars gets truncated"""
    content = "x" * 1200
    result = validate_memory(content, "fact", 1.0)
    assert result.adjustments["content"] == "x" * 1000
    assert "truncated" in result.warnings[0].lower()


def test_validate_memory_importance_clamped():
    """Importance outside [0, 1] gets clamped"""
    result_high = validate_memory("test", "fact", 1.5)
    assert result_high.adjustments["importance"] == 1.0

    result_low = validate_memory("test", "fact", -0.5)
    assert result_low.adjustments["importance"] == 0.0


def test_validate_memory_commitment_no_deadline():
    """Commitment without deadline gets a warning"""
    result = validate_memory("I will finish the report", "commitment", 1.0)
    assert any("no detected deadline" in w.lower() for w in result.warnings)


def test_validate_memory_commitment_with_deadline():
    """Commitment with a deadline pattern does not warn"""
    result = validate_memory("Finish report by Friday", "commitment", 1.0)
    assert not any("no detected deadline" in w.lower() for w in result.warnings)


def test_validate_entity_near_duplicate():
    """Similar entity names trigger a warning"""
    result = validate_entity("Sarah Chen", "person", ["sarah chenn", "bob smith"])
    assert any("near-duplicate" in w.lower() for w in result.warnings)


def test_validate_entity_empty_name():
    """Empty entity name is invalid"""
    result = validate_entity("", "person")
    assert not result.is_valid


def test_validate_relationship_strength_clamped():
    """Strength outside [0, 1] gets clamped"""
    result = validate_relationship(1.5)
    assert result.adjustments["strength"] == 1.0

    result2 = validate_relationship(-0.2)
    assert result2.adjustments["strength"] == 0.0
