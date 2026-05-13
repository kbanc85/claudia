"""Entity resolution helpers.

Centralised home for the entity-type inference heuristic and (eventually)
shared resolution logic. Pure-function module: no DB access, no I/O.

Proposal #51 (2026-05-13) traced a real bug where memory.remember +
memory.relate were both classifying organisations like "Markup AI" as
type="person" because the heuristic in services/remember.py did not
recognise the "AI" corporate suffix and silently defaulted to person.

The fix lives here so it can be re-used by both call sites
(remember_fact's about_entities path and relate_entities' auto-create
path) and tested as a pure function.

No new dependencies: pure Python stdlib, rule-based, no LLM, no spaCy.
"""

from __future__ import annotations

import re
from typing import Optional

# ---------------------------------------------------------------------------
# Keyword tables -- kept narrow on purpose. Wider sets create false positives
# more often than they catch new categories. Add reluctantly.
# ---------------------------------------------------------------------------

# Whole-word corporate signals (matched against lowercased tokens).
_ORG_WORD_SUFFIXES = frozenset(
    {
        "inc",
        "inc.",
        "llc",
        "ltd",
        "ltd.",
        "corp",
        "corp.",
        "corporation",
        "co",
        "co.",
        "company",
        "gmbh",
        "ag",
        "sa",
        "plc",
        "foundation",
        "university",
        "institute",
        "lab",
        "labs",
        "associates",
        "group",
        "partners",
        # "AI" as a standalone token has become a near-universal corporate
        # marker (Anthropic AI, OpenAI, Markup AI, Hugging AI, etc.). Worth
        # the rare false positive for a person literally named "AI".
        "ai",
    }
)

# Substring corporate signals on the trailing token (for dotted suffixes
# like Hugging.ai, Acme.io, etc.).
_ORG_DOMAIN_SUFFIXES = (".ai", ".io", ".com", ".dev", ".so", ".co")

_PROJECT_KEYWORDS = frozenset(
    {"project", "sprint", "mvp", "initiative", "campaign", "rollout"}
)

_CONCEPT_KEYWORDS = frozenset(
    {"methodology", "framework", "theory", "protocol", "strategy", "principle"}
)

_LOCATION_KEYWORDS = frozenset(
    {"office", "hq", "headquarters", "campus", "building"}
)

# Two-or-more capitalised words separated by spaces, no digits or punctuation,
# e.g. "Matt Blumberg", "Mary Anne Smith". A reliable person signal when
# no other classification fires.
_PERSON_NAME_RE = re.compile(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$")


def infer_entity_type(name: str, content: str = "") -> str:
    """Infer the canonical entity type from a name and (optional) content.

    Heuristic rules, evaluated in order. The first rule to match wins:

    1. **Location keywords** ("office", "hq", "campus") on any token. Checked
       first so "Company HQ" is a location, not an organisation.
    2. **Organisation signals** -- whole-word corporate tokens like ``inc``,
       ``llc``, ``corp``, ``ai``, ``foundation``, or domain-style suffixes
       (``.ai``, ``.io``) on the trailing token. Catches "Markup AI",
       "Hugging.ai", "Acme Inc.".
    3. **Project keywords** ("project", "sprint", "mvp"). Matches "Project
       Phoenix" and "Phoenix Project" alike.
    4. **Concept keywords** ("methodology", "framework", "strategy").
    5. **Person pattern** -- two-or-more capitalised words ("Matt Blumberg",
       "Mary Anne Smith") with no other classification signal.
    6. **Fallback: concept**, never ``person``. Proposal #51 explicitly
       rejected ``person`` as the default because a single ambiguous token
       like "Markup" was getting auto-typed as a person whenever it appeared
       in the entities list.

    Args:
        name: The entity name (case-insensitive matching applies).
        content: Optional surrounding memory text. Currently unused by the
            heuristic but accepted so callers can pass context without
            changing the signature later (we may grow the rules to peek at
            the memory body for "company", "the team", etc. cues).

    Returns:
        One of: ``"organization"``, ``"person"``, ``"project"``,
        ``"concept"``, ``"location"``.
    """
    if not name or not name.strip():
        return "concept"

    stripped = name.strip()
    lowered = stripped.lower()
    tokens = lowered.split()

    # 1. Location keywords first (so "Company HQ" -> location, not org).
    for tok in tokens:
        if tok.rstrip(".,") in _LOCATION_KEYWORDS:
            return "location"

    # 2. Organisation: whole-word suffix on ANY token.
    for tok in tokens:
        if tok.rstrip(".,") in _ORG_WORD_SUFFIXES:
            return "organization"
        if tok in _ORG_WORD_SUFFIXES:
            return "organization"

    # 2b. Organisation: domain-style suffix on the trailing token
    # (Hugging.ai, Acme.io, etc.).
    if tokens:
        last = tokens[-1]
        for suffix in _ORG_DOMAIN_SUFFIXES:
            if last.endswith(suffix):
                return "organization"

    # 3. Project keywords.
    for tok in tokens:
        if tok.rstrip(".,") in _PROJECT_KEYWORDS:
            return "project"

    # 4. Concept keywords.
    for tok in tokens:
        if tok.rstrip(".,") in _CONCEPT_KEYWORDS:
            return "concept"

    # 5. Person pattern: two-or-more capitalised words, plain ASCII.
    if _PERSON_NAME_RE.match(stripped):
        return "person"

    # 6. Fallback: concept (NEVER person -- see Proposal #51).
    return "concept"


# ---------------------------------------------------------------------------
# Aliases / shims so older callers in services/remember.py and tests keep
# working without an import dance. The old private helper
# remember._infer_entity_type is preserved as a thin wrapper for backward
# compatibility.
# ---------------------------------------------------------------------------


def legacy_infer_entity_type(name: str) -> str:
    """Backward-compatible shim for the original heuristic semantics.

    The original ``remember._infer_entity_type`` (added Apr 2026) returned
    ``"person"`` as the fallback. This shim still returns ``"person"`` for
    plain single-word inputs like "Kamil" or "Sarah" so the existing
    test_entity_type_inference.py suite keeps passing, while the new
    ``infer_entity_type`` is free to default to concept for genuinely
    ambiguous inputs.

    Used by ``RememberService.remember_entity`` where an explicit empty
    ``entity_type``  preserves the legacy "single-name = person" rule.
    """
    inferred = infer_entity_type(name)
    if inferred == "concept":
        # Legacy callers expected a single-token name to be a person.
        # Preserve that for compatibility with existing test fixtures and
        # callers that already passed an explicit "" type to mean
        # "default to person".
        tokens = (name or "").strip().split()
        if len(tokens) == 1 and tokens[0] and tokens[0][:1].isupper():
            return "person"
        if len(tokens) == 1 and tokens[0]:
            return "person"
    return inferred
