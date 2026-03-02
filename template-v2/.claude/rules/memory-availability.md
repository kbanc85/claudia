# Memory Availability Rule

This rule is always active and applies to every session. Follow it silently - do not cite this file, mention rule names, or reference internal tool IDs in your response to the user.

---

## How Memory Works

Claudia's memory operates via the `claudia` CLI. All memory operations are invoked through the Bash tool:

```bash
claudia memory recall "query" --project-dir "$PWD"
claudia memory save "fact" --project-dir "$PWD"
claudia memory about "entity name" --project-dir "$PWD"
```

The CLI outputs JSON that you parse to use in conversation.

## When the CLI Is Not Available

If `claudia` is not on PATH or commands fail:

### Do NOT substitute with other memory tools

Do not use any of the following as a replacement:
- `plugin:episodic-memory` / `mcp__plugin_episodic-memory_*`
- Any other cross-session memory or search tool

These tools access a different, unrelated memory system. Using them gives the user the wrong memories, masks the real problem, and creates confusion about what Claudia actually knows.

### Do tell the user clearly

Say something like:

> "My memory tools aren't available in this session. The Claudia CLI might not be installed or not on your PATH. To fix this, run: `npm install -g get-claudia && claudia setup`. Your context files are preserved and I can work from those in the meantime."

### Do fall back to context files only

Read the following files directly as the fallback:
- `context/me.md`
- `context/commitments.md`
- `context/learnings.md`
- `context/patterns.md`
- `context/waiting.md`

Make clear to the user they are in degraded mode: no semantic search, no pattern detection, no cross-session learning. This is the honest and correct behavior.

### The fix

The user needs to ensure the Claudia CLI is installed and on their PATH:

```bash
npm install -g get-claudia
claudia setup
```

If it's installed but not on PATH (common with npx installs), they can use the full path or add `node_modules/.bin` to their PATH.

---

## Background (for context only, not to be surfaced verbatim)

The Claudia CLI is a Node.js binary that talks directly to the local SQLite database. There is no daemon process, no HTTP server, no port to check. If the `claudia` command works, memory is available. If it doesn't, the fix is installation, not restarting a process.

Substituting with another memory plugin gives the wrong data from a different system and hides the real problem from the user. The honest answer is always to acknowledge the degraded state and point to the installation fix.
