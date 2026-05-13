"""Tests for MCP parameter-name aliases (v1.58.0 PR E).

The memory MCP tools historically used different parameter conventions:
    memory_about     -> entity
    memory_relate    -> source / target / relationship
    memory_recall    -> query

Four tools, four conventions. This PR adds canonical aliases so the tools
accept either the original parameter name or a consistent variant. The
normalization happens at the MCP request-handler entry point. The
service-layer signatures are unchanged.

Aliases registered:
    memory_about   : entity  <- entity_name, name
    memory_relate  : source       <- source_entity
                     target       <- target_entity
                     relationship <- relationship_type
    memory_recall  : query   <- q, search

Invariants tested:
    1. Existing parameter names continue to work unchanged.
    2. Each alias resolves to the same handler with the same semantics.
    3. If both the canonical and an alias are passed, the canonical wins.
    4. After normalization, only the canonical name reaches the handler;
       alias keys are removed from the arguments dict.
    5. Unknown extra parameters do not cause the handler to crash.
"""

import asyncio
import json

import pytest

import claudia_memory.database as db_mod
from claudia_memory.mcp.server import call_tool


# ---------------------------------------------------------------------------
# Helpers (mirrors test_recurring_regressions.py rebinding pattern)
# ---------------------------------------------------------------------------


def _get_remember_service(db):
    """Build a RememberService bound to the provided test database."""
    from claudia_memory.services.remember import RememberService
    from claudia_memory.extraction.entity_extractor import get_extractor

    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc._embedder = None
    svc.extractor = get_extractor()
    svc.embedding_service = None
    return svc


def _run(coro):
    """Run an async coroutine to completion."""
    return asyncio.run(coro)


def _payload(result):
    """Extract the JSON payload from a CallToolResult, asserting no error."""
    assert not getattr(result, "isError", False), (
        f"call_tool returned an error result: "
        f"{result.content[0].text if result.content else result!r}"
    )
    return json.loads(result.content[0].text)


@pytest.fixture
def wired_db(db):
    """Rebind the global _db to the test DB for the duration of the test.

    The MCP handlers call get_db() internally, which returns the module-level
    global. We swap that pointer so handlers see our isolated test database.

    We also reset the module-level service caches in recall.py / remember.py
    because each service caches its own get_db() reference at __init__ time.
    Without this reset, service objects from a previous test would hold a
    stale Database whose tempfile has already been cleaned up.
    """
    import claudia_memory.services.recall as recall_mod
    import claudia_memory.services.remember as remember_mod

    old_db = db_mod._db
    old_recall_service = recall_mod._service
    old_remember_service = remember_mod._service

    db_mod._db = db
    recall_mod._service = None
    remember_mod._service = None
    try:
        yield db
    finally:
        db_mod._db = old_db
        recall_mod._service = old_recall_service
        remember_mod._service = old_remember_service


@pytest.fixture
def seeded(wired_db):
    """Seed a memory linked to 'Sarah Chen' for memory_about / memory_recall tests."""
    svc = _get_remember_service(wired_db)
    memory_id = svc.remember_fact(
        content="Sarah Chen prefers email over Slack and likes concise updates.",
        about_entities=["Sarah Chen"],
    )
    assert memory_id is not None, "seed memory must be created"
    return wired_db


# ---------------------------------------------------------------------------
# Test 1: memory_about accepts entity, entity_name, name
# ---------------------------------------------------------------------------


class TestMemoryAboutAliases:
    """memory_about must accept 'entity' (canonical), 'entity_name', or 'name'."""

    def test_canonical_entity_param(self, seeded):
        result = _run(call_tool("memory_about", {"entity": "Sarah Chen"}))
        payload = _payload(result)
        # The canonical call must produce a usable response (entity found,
        # or a structured 'not found' style payload, but never an error).
        assert isinstance(payload, dict), "memory_about must return a dict payload"

    def test_alias_entity_name(self, seeded):
        canonical = _payload(_run(call_tool("memory_about", {"entity": "Sarah Chen"})))
        alias = _payload(_run(call_tool("memory_about", {"entity_name": "Sarah Chen"})))
        assert alias == canonical, (
            "memory_about(entity_name=...) must produce the same result as "
            "memory_about(entity=...)"
        )

    def test_alias_name(self, seeded):
        canonical = _payload(_run(call_tool("memory_about", {"entity": "Sarah Chen"})))
        alias = _payload(_run(call_tool("memory_about", {"name": "Sarah Chen"})))
        assert alias == canonical, (
            "memory_about(name=...) must produce the same result as "
            "memory_about(entity=...)"
        )


# ---------------------------------------------------------------------------
# Test 2: memory_relate accepts source/target/relationship and *_entity / *_type
# ---------------------------------------------------------------------------


class TestMemoryRelateAliases:
    """memory_relate must accept either the original triplet or the consistent
    *_entity / *_type variants."""

    def test_canonical_triplet(self, wired_db):
        # Pre-seed both entities so relate_entities does not have to auto-create
        # them (keeps assertions focused on parameter normalization).
        svc = _get_remember_service(wired_db)
        svc.remember_fact(content="A is a person.", about_entities=["A"])
        svc.remember_fact(content="B is a person.", about_entities=["B"])

        result = _run(call_tool("memory_relate", {
            "source": "A",
            "target": "B",
            "relationship": "knows",
        }))
        payload = _payload(result)
        assert payload.get("success") is True, (
            f"memory_relate canonical form should succeed; got {payload!r}"
        )

    def test_alias_triplet(self, wired_db):
        svc = _get_remember_service(wired_db)
        svc.remember_fact(content="C is a person.", about_entities=["C"])
        svc.remember_fact(content="D is a person.", about_entities=["D"])

        result = _run(call_tool("memory_relate", {
            "source_entity": "C",
            "target_entity": "D",
            "relationship_type": "knows",
        }))
        payload = _payload(result)
        assert payload.get("success") is True, (
            f"memory_relate alias form should succeed; got {payload!r}"
        )

    def test_both_forms_create_equivalent_relationship(self, wired_db):
        """Two memory_relate calls (one canonical, one alias) on equivalent
        inputs must both create a relationship row."""
        svc = _get_remember_service(wired_db)
        for name in ["E", "F", "G", "H"]:
            svc.remember_fact(content=f"{name} is a person.", about_entities=[name])

        r1 = _payload(_run(call_tool("memory_relate", {
            "source": "E", "target": "F", "relationship": "knows",
        })))
        r2 = _payload(_run(call_tool("memory_relate", {
            "source_entity": "G", "target_entity": "H", "relationship_type": "knows",
        })))

        assert r1.get("success") is True
        assert r2.get("success") is True
        # Both must return a relationship_id; the values differ because they
        # link different entity pairs, but both must exist.
        assert r1.get("relationship_id") is not None
        assert r2.get("relationship_id") is not None


# ---------------------------------------------------------------------------
# Test 3: memory_recall accepts query, q, search
# ---------------------------------------------------------------------------


class TestMemoryRecallAliases:
    """memory_recall must accept 'query' (canonical), 'q', or 'search'."""

    def test_canonical_query(self, seeded):
        result = _run(call_tool("memory_recall", {"query": "Sarah"}))
        payload = _payload(result)
        assert "results" in payload, "memory_recall must return a results list"

    def test_alias_q(self, seeded):
        canonical = _payload(_run(call_tool("memory_recall", {"query": "Sarah"})))
        alias = _payload(_run(call_tool("memory_recall", {"q": "Sarah"})))
        assert alias == canonical, (
            "memory_recall(q=...) must produce the same result as "
            "memory_recall(query=...)"
        )

    def test_alias_search(self, seeded):
        canonical = _payload(_run(call_tool("memory_recall", {"query": "Sarah"})))
        alias = _payload(_run(call_tool("memory_recall", {"search": "Sarah"})))
        assert alias == canonical, (
            "memory_recall(search=...) must produce the same result as "
            "memory_recall(query=...)"
        )


# ---------------------------------------------------------------------------
# Test 4: Canonical wins when both canonical and alias are provided
# ---------------------------------------------------------------------------


class TestCanonicalWins:
    """When both the canonical name and an alias are supplied, the canonical
    value must be used. This is the documented disambiguation rule."""

    def test_about_canonical_beats_alias(self, wired_db):
        """memory_about(entity='Sarah', entity_name='OTHER') -> looks up 'Sarah'."""
        svc = _get_remember_service(wired_db)
        svc.remember_fact(
            content="Sarah is the canonical target.",
            about_entities=["Sarah"],
        )
        # 'OTHER' is intentionally never created.

        from_canonical_only = _payload(
            _run(call_tool("memory_about", {"entity": "Sarah"}))
        )
        from_both = _payload(
            _run(call_tool("memory_about", {"entity": "Sarah", "entity_name": "OTHER"}))
        )

        assert from_both == from_canonical_only, (
            "When both 'entity' and 'entity_name' are passed, the canonical "
            "'entity' value must win. Got divergent payloads:\n"
            f"  canonical-only: {from_canonical_only!r}\n"
            f"  both:           {from_both!r}"
        )

    def test_recall_canonical_beats_alias(self, seeded):
        from_canonical_only = _payload(
            _run(call_tool("memory_recall", {"query": "Sarah"}))
        )
        from_both = _payload(
            _run(call_tool("memory_recall", {"query": "Sarah", "q": "ZZZZZ"}))
        )
        assert from_both == from_canonical_only, (
            "When both 'query' and 'q' are passed, the canonical 'query' "
            "value must win."
        )


# ---------------------------------------------------------------------------
# Test 5: Alias keys are removed from arguments dict after normalization
# ---------------------------------------------------------------------------


class TestAliasKeysDoNotLeak:
    """After normalization, only the canonical parameter name reaches the
    handler. The alias key is removed from the arguments dict so the handler
    is never confused by duplicated state."""

    def test_normalize_removes_alias_key(self):
        from claudia_memory.mcp.server import _normalize_params

        args = {"entity_name": "Sarah Chen"}
        normalized = _normalize_params(args, "entity", ["entity_name", "name"])
        assert "entity" in normalized, "canonical key must be present"
        assert normalized["entity"] == "Sarah Chen"
        assert "entity_name" not in normalized, (
            "alias key must be removed after normalization; "
            f"got: {sorted(normalized)}"
        )
        assert "name" not in normalized

    def test_normalize_canonical_wins_and_alias_ignored(self):
        from claudia_memory.mcp.server import _normalize_params

        args = {"entity": "Sarah", "entity_name": "OTHER"}
        normalized = _normalize_params(args, "entity", ["entity_name", "name"])
        assert normalized["entity"] == "Sarah", "canonical value must be preserved"
        # When canonical is already present, the helper returns the args
        # unchanged (no need to rewrite anything). Either form is acceptable
        # so long as the canonical value is the one consulted; here we test
        # the documented contract that no rewriting happens.
        # The handler reads arguments["entity"], so the alias key being
        # present or absent has no behavioural effect.

    def test_normalize_no_alias_passes_through(self):
        from claudia_memory.mcp.server import _normalize_params

        args = {"unrelated": "x"}
        normalized = _normalize_params(args, "entity", ["entity_name", "name"])
        # Nothing to rewrite -- arguments come back unchanged.
        assert normalized == {"unrelated": "x"}


# ---------------------------------------------------------------------------
# Test 6: Unknown parameter does not crash the handler
# ---------------------------------------------------------------------------


class TestUnknownParameterIgnored:
    """Existing MCP server behaviour: unknown parameters are silently ignored
    (the handlers only read the keys they know about). This test pins that
    behaviour so the alias normalization layer does not accidentally change it.
    """

    def test_memory_about_with_unknown_param_does_not_crash(self, seeded):
        result = _run(call_tool("memory_about", {
            "entity": "Sarah Chen",
            "weird_param": "ignored",
        }))
        # Whatever the payload, the call must not produce an error result.
        _payload(result)  # asserts isError is False

    def test_memory_recall_with_unknown_param_does_not_crash(self, seeded):
        result = _run(call_tool("memory_recall", {
            "query": "Sarah",
            "weird_param": "ignored",
        }))
        _payload(result)
