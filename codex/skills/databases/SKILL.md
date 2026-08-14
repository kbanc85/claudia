---
name: databases
description: "Inspect Claudia's unified production memory database and backups. Use for database identity, health, counts, schema, WAL, backup inventory, or an explicitly approved database override."
---

# Claudia Databases for Codex

Inspect first; mutate only with explicit approval.

## Default view

Prefer Claudia Memory tools when available. Otherwise inspect `~/.claudia/memory/claudia.db` read-only and report:

- canonical database path and file size;
- counts for memories, entities, relationships, episodes, commitments, and sources;
- WAL/SHM presence;
- most recent verified backup;
- any legacy hash databases that still contain data.

Never infer health from file existence alone. Use `memory-health` for the complete system check.

## Database overrides

Switch only when the user explicitly names or approves the target database.

1. Resolve the exact target path and verify it is a readable SQLite database.
2. Show the current and target paths and explain that a Codex restart is required.
3. Back up `.mcp.json`.
4. Add `CLAUDIA_DB_OVERRIDE` to `mcpServers.claudia-memory.env` in the workspace `.mcp.json`.
5. Run `npx get-claudia codex .` so the generated plugin MCP declaration stays aligned.
6. Start a new Codex session and verify the active database through a memory health call.

Never edit the installed plugin cache and never write directly to Claudia's SQLite database.

