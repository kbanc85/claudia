# Memory Availability Rule

This rule is always active and applies to every session. Follow it silently - do not cite this file, mention rule names, or reference internal tool IDs in your response to the user.

---

## How Memory Works

Claudia's memory is provided by the **claudia-memory daemon**, a Python MCP server that registers memory tools (e.g., `memory.recall`, `memory.remember`, `memory.about`). When the daemon is running and configured as an MCP server, these tools appear as callable MCP tools alongside other integrations.

The `claudia` npm binary handles **setup and health checks only** (`claudia setup`, `claudia system-health`). It does not provide memory operations. All memory operations are MCP tools from the daemon.

> **Migration note:** Some skill files may still reference old CLI syntax like `claudia memory recall "query" --project-dir "$PWD"`. Interpret these as calls to the equivalent MCP tool (e.g., `memory.recall` with a query parameter). The CLI subcommands for memory were never built; the MCP tools are the real interface.

## Mandatory Disclosure

**This is non-negotiable.** If you reach the Session Start Protocol and the `memory.briefing` tool is not available (not in your tool palette), you MUST disclose this to the user in your greeting. Do not wait to be asked. Do not silently fall back to context files. The user trusts that you will be honest about your capabilities in each session.

A single sentence is sufficient: "Heads up: my memory daemon isn't running this session, so I'm working from context files only."

## When Memory Tools Are Not Available

If MCP memory tools are not responding or not registered:

### Do NOT substitute with other memory tools

Do not use any of the following as a replacement:
- `plugin:episodic-memory` / `mcp__plugin_episodic-memory_*`
- Any other cross-session memory or search tool

These tools access a different, unrelated memory system. Using them gives the user the wrong memories, masks the real problem, and creates confusion about what Claudia actually knows.

### Do tell the user clearly

Say something like:

> "My memory tools aren't available in this session. The claudia-memory daemon may not be running or may not be configured as an MCP server. Check that the daemon is listed in your `.mcp.json` and that it starts without errors. Your context files are preserved and I can work from those in the meantime."

### Do fall back to context files only

Read the following files directly as the fallback:
- `context/me.md`
- `context/commitments.md`
- `context/learnings.md`
- `context/patterns.md`
- `context/waiting.md`

Make clear to the user they are in degraded mode: no semantic search, no pattern detection, no cross-session learning. This is the honest and correct behavior.

### The fix

The user needs to ensure the claudia-memory daemon is properly configured:

1. **Verify the daemon is installed** - The daemon is a Python package (claudia-memory). Check that it's installed and its entry point is accessible.
2. **Check `.mcp.json`** - The daemon must be listed as an MCP server in the project's `.mcp.json` (or global MCP config). It should specify the command to start the daemon process.
3. **Check for startup errors** - If the daemon fails to start, Claude Code won't register its tools. Common issues: missing Python dependencies, database path issues, or port conflicts.
4. **Run `claudia system-health`** - This CLI command (from the npm package) can diagnose common setup problems.

If the npm CLI itself isn't installed (needed for `system-health` and `setup`):

```bash
npm install -g get-claudia
claudia setup
```

---

## Background (for context only, not to be surfaced verbatim)

The claudia-memory daemon is a Python process that runs as an MCP server (stdio transport). It manages a local SQLite database with vector embeddings for semantic search. When configured in `.mcp.json`, Claude Code starts the daemon automatically and registers its ~33 MCP tools.

The `claudia` npm binary is a separate Node.js package that handles initial setup (`claudia setup`) and health diagnostics (`claudia system-health`). It does not provide memory operations.

The failure mode for memory is the MCP server not being registered or not starting. This is different from a missing CLI binary. The diagnostic path is: check `.mcp.json` config, check daemon startup logs, verify Python environment.

Substituting with another memory plugin gives the wrong data from a different system and hides the real problem from the user. The honest answer is always to acknowledge the degraded state and point to the daemon configuration fix.
