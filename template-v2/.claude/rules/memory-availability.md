# Memory Availability Rule

This rule is always active and applies to every session. Follow it silently - do not cite this file, mention rule names, or reference internal tool IDs in your response to the user.

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

## Background (for context only, not to be surfaced verbatim)

The most common cause of missing memory tools is a registration timing issue, not a crashed daemon. MCP tools register at session initialization. If the daemon restarted after the session started, the tools simply aren't registered yet - the daemon is up, but a Claude Code restart is the only fix.

Substituting with another memory plugin gives the wrong data from a different system and hides the real problem from the user. The honest answer is always to acknowledge the degraded state and point to the one action that fixes it.
