# mcp/

The Model Context Protocol surface: how Claude Code talks to the memory daemon. Stdio transport, configured in the user's `.mcp.json` after install.

## Where to look first

| Concern | File | Notes |
|---------|------|-------|
| Tool registration | `server.py` | Single file defining all ~33 `memory_*` MCP tools. Each tool is a handler function paired with a JSONSchema-style parameter declaration. |

## Conventions

- **Tool names are a public API.** Never rename a `memory_*` tool. Users have skills and workflows that invoke them by name. Add new tools rather than renaming old ones.
- **Tool docstrings are how Claude Code decides when to call.** Like skill descriptions, they need a clear verb, expected inputs, and example trigger phrases. Vague tool docs cause inconsistent invocation.
- **Each tool is a thin wrapper.** The real work lives in `services/`. Handlers in `server.py` parse the MCP request, call into a service, format the response. No business logic here.
- **Parameter aliases are supported for ergonomics.** `memory_about`, `memory_relate`, and `memory_recall` accept multiple parameter names (e.g., `entity` and `name`) so users can call them naturally. See PR #57 for the canonical example.
- **Errors should be actionable.** When a handler raises, the error message reaches the user verbatim. Say what went wrong and what to try, not just "failed."
