"""
Deterministic Guards for Claudia Memory System

Pure-Python validation on memory writes. Zero LLM cost, always on.
Guards are advisory -- they warn and auto-correct, never block writes.
"""

import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Regex patterns for commitment deadline detection
DEADLINE_PATTERNS = [
    re.compile(r"\b(by|before|due|until|deadline)\s+\w+", re.IGNORECASE),
    re.compile(r"\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b"),  # Date formats: 1/15, 01-15-2025
    re.compile(r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b", re.IGNORECASE),
    re.compile(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", re.IGNORECASE),
    re.compile(r"\b(tomorrow|tonight|next week|next month|end of (week|month|day|year))\b", re.IGNORECASE),
    re.compile(r"\bEOD\b|\bEOW\b|\bEOM\b"),
]


@dataclass
class ValidationResult:
    """Result of a validation check"""
    is_valid: bool = True
    warnings: List[str] = field(default_factory=list)
    adjustments: Dict[str, Any] = field(default_factory=dict)


def validate_memory(
    content: str,
    memory_type: str = "fact",
    importance: float = 1.0,
    metadata: Optional[Dict] = None,
) -> ValidationResult:
    """
    Validate a memory before storage.

    Checks:
    - Content length (warn >500, truncate >1000)
    - Commitment deadline detection via regex
    - Importance clamped to [0, 1]
    """
    result = ValidationResult()

    # Content length checks
    if len(content) > 1000:
        result.warnings.append(f"Content truncated from {len(content)} to 1000 characters")
        result.adjustments["content"] = content[:1000]
    elif len(content) > 500:
        result.warnings.append(f"Long content ({len(content)} chars) -- consider breaking into multiple memories")

    # Importance clamping
    if importance < 0:
        result.warnings.append(f"Importance {importance} clamped to 0.0")
        result.adjustments["importance"] = 0.0
    elif importance > 1:
        result.warnings.append(f"Importance {importance} clamped to 1.0")
        result.adjustments["importance"] = 1.0

    # Commitment deadline detection
    if memory_type == "commitment":
        has_deadline = any(p.search(content) for p in DEADLINE_PATTERNS)
        if not has_deadline:
            result.warnings.append("Commitment has no detected deadline -- consider adding a target date")

    return result


def validate_entity(
    name: str,
    entity_type: str = "",
    existing_canonical_names: Optional[List[str]] = None,
) -> ValidationResult:
    """
    Validate an entity before storage.

    Checks:
    - Type is required (non-empty)
    - Name is not empty
    - Near-duplicate name detection via SequenceMatcher (ratio > 0.85)
    """
    result = ValidationResult()

    # Name check
    if not name or not name.strip():
        result.is_valid = False
        result.warnings.append("Entity name cannot be empty")
        return result

    # Type check
    if not entity_type or not entity_type.strip():
        result.warnings.append("Entity type is required but was empty -- defaulting to 'person'")
        result.adjustments["entity_type"] = "person"

    # Near-duplicate detection
    if existing_canonical_names:
        canonical = name.strip().lower()
        for existing in existing_canonical_names:
            ratio = SequenceMatcher(None, canonical, existing.lower()).ratio()
            if ratio > 0.85 and canonical != existing.lower():
                result.warnings.append(
                    f"Near-duplicate entity name: '{name}' is similar to existing '{existing}' "
                    f"(similarity: {ratio:.2f})"
                )

    return result


def validate_relationship(strength: float = 1.0) -> ValidationResult:
    """
    Validate a relationship before storage.

    Checks:
    - Strength clamped to [0, 1]
    """
    result = ValidationResult()

    if strength < 0:
        result.warnings.append(f"Relationship strength {strength} clamped to 0.0")
        result.adjustments["strength"] = 0.0
    elif strength > 1:
        result.warnings.append(f"Relationship strength {strength} clamped to 1.0")
        result.adjustments["strength"] = 1.0

    return result
