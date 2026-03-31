"""Tests for MCP tool name backward compatibility (dot-notation aliases).

PR #32 renamed tools from memory.xxx to memory_xxx for Claude Desktop compat.
The alias layer ensures both forms resolve to the same handler during transition.
"""

import asyncio
import pytest


class TestDotAliasRegistration:
    """Verify that dot-notation aliases are registered in _TOOL_HANDLERS."""

    def test_dot_aliases_registered(self):
        """Core alias: memory.recall must resolve to the same handler as memory_recall."""
        from claudia_memory.mcp.server import _TOOL_HANDLERS

        assert "memory_recall" in _TOOL_HANDLERS, "memory_recall not registered"
        assert "memory.recall" in _TOOL_HANDLERS, "memory.recall alias not registered"
        assert _TOOL_HANDLERS["memory.recall"] is _TOOL_HANDLERS["memory_recall"], \
            "memory.recall and memory_recall must point to the same handler"

    def test_all_memory_tools_have_dot_aliases(self):
        """Every memory_xxx tool must have a memory.xxx alias."""
        from claudia_memory.mcp.server import _TOOL_HANDLERS

        underscore_keys = [k for k in _TOOL_HANDLERS if k.startswith("memory_")]
        assert len(underscore_keys) > 0, "No memory_ tools found"

        for key in underscore_keys:
            dot_alias = key.replace("_", ".", 1)
            assert dot_alias in _TOOL_HANDLERS, f"Missing dot alias for {key}: expected {dot_alias}"
            assert _TOOL_HANDLERS[dot_alias] is _TOOL_HANDLERS[key], \
                f"{dot_alias} and {key} must point to the same handler"

    def test_cognitive_ingest_unchanged(self):
        """cognitive.ingest uses dots natively and must NOT get an underscore alias."""
        from claudia_memory.mcp.server import _TOOL_HANDLERS

        assert "cognitive.ingest" in _TOOL_HANDLERS, "cognitive.ingest should still be registered"
        assert "cognitive_ingest" not in _TOOL_HANDLERS, \
            "cognitive_ingest should NOT exist (alias loop must only affect memory_ prefix)"


class TestListToolsUnderscore:
    """Verify list_tools() only advertises underscore names."""

    def test_list_tools_uses_underscore_only(self):
        """list_tools() must return only underscore names, never dot names."""
        from claudia_memory.mcp.server import list_tools

        result = asyncio.run(list_tools())
        tool_names = [t.name for t in result.tools]

        # Sanity: memory_recall should be listed
        assert "memory_recall" in tool_names, "memory_recall missing from list_tools"

        # No dot-notation names should appear in the advertised list
        dot_names = [n for n in tool_names if "." in n and n.startswith("memory")]
        assert dot_names == [], f"list_tools must not advertise dot names: {dot_names}"


class TestCallDispatch:
    """Verify call_tool dispatches for both name forms."""

    def test_dispatch_underscore_name(self):
        """memory_recall must resolve in the handler registry."""
        from claudia_memory.mcp.server import _TOOL_HANDLERS

        handler = _TOOL_HANDLERS.get("memory_recall")
        assert handler is not None, "memory_recall not found in _TOOL_HANDLERS"

    def test_dispatch_dot_name(self):
        """memory.recall must resolve in the handler registry (backward compat)."""
        from claudia_memory.mcp.server import _TOOL_HANDLERS

        handler = _TOOL_HANDLERS.get("memory.recall")
        assert handler is not None, "memory.recall not found in _TOOL_HANDLERS (backward compat broken)"
