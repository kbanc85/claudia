# Memory Availability Rule

This rule is always active and applies to every session.

---

## When Memory Tools Are Missing

If `mcp__claudia-memory__*` tools are **not listed in your available tools**, follow these rules strictly:

### Do NOT substitute with other memory tools

Do not use any of the following as a replacement for missing memory tools:
- `plugin:episodic-memory` / `mcp__plugin_episodic-memory_*`
- Any other cross-session memory or search tool not in the `mcp__claudia-memory__*` family

These tools access a different, unrelated memory system. Using them gives the user the wrong memories, masks the real connectivity problem, and creates confusion about what Claudia actually knows.

### Do tell the user clearly

Say something like:

> "My memory tools aren't connected in this session. The daemon is likely running but the MCP connection isn't registered yet. To fix this, restart Claude Code (close and reopen the window). Your context files are preserved and I can work from those in the meantime."

### Do fall back to context files only

Read the following files directly as the fallback:
- `context/me.md`
- `context/commitments.md`
- `context/learnings.md`
- `context/patterns.md`
- `context/waiting.md`

Make clear to the user they are in degraded mode: no semantic search, no pattern detection, no cross-session learning. This is the honest and correct behavior.

### The fix is one action

The user only needs to do one thing: **restart Claude Code**. The daemon auto-restarts via launchctl/systemctl. There is no command to type. Just close and reopen the Claude Code window.

---

## Why This Matters

The most common cause of missing memory tools is not a crashed daemon but a **registration timing issue**: the daemon was restarted (auto or manually) after the current Claude Code session started. MCP tools connect at session initialization, not dynamically. The daemon is up; the tools just aren't registered yet.

Silently using `plugin:episodic-memory` as a fallback:
1. Gives the wrong data (different memory system, different scope)
2. Makes it look like memory is working when it isn't
3. Prevents the user from knowing they need to restart

Always be transparent about the degraded state.
