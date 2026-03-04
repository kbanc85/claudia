# Archived: CLI Memory Commands (v1.51.x)

These files were the Node.js CLI implementation of Claudia's memory operations.
They are archived here for reference, not active use.

## Why archived

The `claudia` CLI binary was never reachable by end users because:

1. The package installs via `npx get-claudia` (temporary download, not global)
2. Even if globally installed, `claudia` on many systems resolves to AWS Lambda's `claudia.js`

All memory operations are now handled by the **claudia-memory daemon**, a Python MCP
server that registers ~33 tools (`memory.recall`, `memory.remember`, `memory.about`, etc.)
directly into Claude Code's tool palette.

## What replaced them

| CLI command | MCP tool equivalent |
|-------------|-------------------|
| `claudia memory save` | `memory.remember` |
| `claudia memory recall` | `memory.recall` |
| `claudia memory about` | `memory.about` |
| `claudia memory relate` | `memory.relate` |
| `claudia memory briefing` | `memory.briefing` |
| `claudia memory end-session` | `memory.end_session` |
| `claudia memory consolidate` | `memory.consolidate` |
| `claudia vault sync` | `memory.vault_sync` |
| `claudia gmail *` | Gmail MCP server |
| `claudia calendar *` | Calendar MCP server |

## What still works

The `claudia` npm CLI retains two commands used internally by the installer:

- `system-health` - Database and embedding diagnostics
- `setup` - Onboarding wizard

These run via `node cli/index.js` (not PATH), so they work without global install.

## File inventory

| Directory | Files | Lines |
|-----------|-------|-------|
| `commands/` | memory.js, vault.js, cognitive.js, google-auth.js | 2,096 |
| `core/` | google-oauth.js | 461 |
| `services/` | recall.js, consolidate.js, remember.js, vault-sync.js, documents.js, audit.js, extraction.js, ingest.js | 10,375 |
| **Total** | **13 files** | **12,932 lines** |

Archived in v1.51.25.
