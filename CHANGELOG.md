# Changelog

All notable changes to Claudia will be documented in this file.

## 1.37.3 (2026-02-12)

### The Second Brain Upgrade

The Obsidian vault is no longer a data dump. It's a genuinely useful knowledge base with visual hierarchy, navigation, and graph theming out of the box.

#### Added
- **Home dashboard** - `Home.md` serves as the vault entry point with quick navigation links (entity counts), attention watchlist, open commitments, and recent activity table. Regenerated on every sync.
- **MOC index files** - `_Index.md` in each entity type directory, grouped by attention tier (active, watchlist, standard, archive) with sortable tables.
- **Status callouts** - Person notes show attention tier, trend, last contact, and frequency in an `[!info]` callout. Project notes show connected people count and open commitments.
- **Verification-grouped memories** - Key facts split into verified (`[!note]`) and unverified (`[!warning]`) callout blocks with origin and confidence tags.
- **Relationship tables** - Connections displayed as scannable tables (Connection | Type | Strength) instead of flat bullet lists.
- **Interaction timeline** - Last 10 sessions in dated `[!example]` callouts instead of 5 truncated bullets.
- **People overview canvas** - New `people-overview.canvas` showing person-to-person relationships only (who works with whom).
- **Morning brief reconnection card** - Surfaces dormant/decelerating contacts with importance > 0.3 in the morning brief canvas.
- **Narrative wikification** - Session narratives wrap known entity names in `[[wikilinks]]`, connecting sessions to entities in graph view.
- **7 Dataview templates** - Added Active Network, Entity Overview, Session Log. Open Commitments upgraded to TASK query.
- **.obsidian config** - Ships graph.json (7 color groups by entity type), claudia-theme.css (emoji prefixes, tag color pills), workspace.json (opens Home.md with graph sidebar). Created on first sync, never overwrites.
- **Vault format versioning** - `vault_format_version: 2` in `_meta/last-sync.json`. Old vaults auto-rebuild on sync.

#### Changed
- **Rich frontmatter** - Added `name`, `attention_tier`, `contact_trend`, `contact_frequency_days`, `last_contact`, compound `tags` (type + tier + trend), `cssclasses` for CSS styling. Fixed `aliases` to proper YAML list format.
- **Hierarchical sessions** - Session files now use `sessions/YYYY/MM/YYYY-MM-DD.md` paths instead of flat `sessions/YYYY-MM-DD.md`.
- **Grouped relationship map** - Quadrant layout by entity type (People top-left, Projects top-right, Orgs bottom-left, Concepts bottom-right) with group container nodes instead of flat circular layout.

#### Fixed
- **sqlite3.Row access** - Added `_row_get()` helper for safe field access on `sqlite3.Row` objects (which lack `.get()`). Fixes crashes in frontmatter and status callout rendering.

#### Stats
- 456 tests pass, 5 skipped, 0 regressions
- Install: `npx get-claudia`

---

## 1.37.2 (2026-02-12)

### Python 3.14 Compatibility

#### Fixed
- **macOS installer** now prefers Python 3.13 over 3.14 for spaCy compatibility. Searches Homebrew symlinks, then Cellar paths, with SQLite extension validation. Falls back to 3.14 gracefully when 3.13 is unavailable.
- **Windows installer** now prefers Python 3.10-3.13, falling back to 3.14+ with a visible warning about reduced NLP capabilities.

#### Stats
- Install: `npx get-claudia`

---

## 1.37.1 (2026-02-12)

### Directory Policy Compliance

#### Added
- **MCP tool annotations** - All 42 tools now include `title` and `ToolAnnotations` (readOnlyHint, destructiveHint, openWorldHint) for Anthropic Software Directory compliance. 23 read-only, 12 write-safe, 7 destructive, 2 open-world.
- **Vault awareness skill** indexed in skill-index.json (was missing)

#### Fixed
- **memory-manager.md** tool reference now includes all 7 tools added in v1.37.0: `memory.upcoming`, `memory.since`, `memory.timeline`, `memory.reconnections`, `memory.project_health`, `memory.summary`, `memory.import_vault_edits`
- **skill-index.json** descriptions updated for relationship-tracker, risk-surfacer, and morning-brief to reflect temporal/velocity capabilities

#### Stats
- 436 tests pass, 5 skipped, 0 regressions
- Install: `npx get-claudia`

---

## 1.37.0 (2026-02-12)

### The Proactive Intelligence Upgrade

Claudia now thinks ahead. She tracks deadlines, notices when relationships are cooling, syncs her memory to an Obsidian vault, and generates visual dashboards you can browse in Obsidian's graph view.

#### Added
- **Temporal intelligence** - Memories now carry deadline and temporal marker metadata. New `memory.upcoming`, `memory.since`, and `memory.timeline` MCP tools let Claudia surface what's due, what happened recently, and full chronological views.
- **Contact velocity tracking** - Entities track `last_contact_at`, `contact_frequency_days`, and `contact_trend` (accelerating/stable/decelerating/stale). New `memory.reconnections` tool surfaces relationships that need attention.
- **Attention tiers** - Entities are automatically classified into inner_circle, active, peripheral, or dormant based on contact patterns. Consolidation updates tiers nightly.
- **Obsidian vault sync** - Every entity becomes a markdown note with `[[wikilinks]]` in `~/.claudia/vault/`. Obsidian's graph view acts as a relationship visualizer. Sync runs nightly and on-demand.
- **Canvas generation** - Relationship maps, morning brief dashboards, and project boards generated as `.canvas` files for Obsidian. Canvas preservation ensures manual edits survive re-generation.
- **Vault edit import** - New `memory.import_vault_edits` tool detects when you've edited vault markdown files and syncs changes back into the memory database.
- **Project health tool** - New `memory.project_health` surfaces stale projects and at-risk deliverables.
- **Temporal extraction** - `extraction/temporal.py` parses natural language deadlines ("by Friday", "end of Q1") into ISO dates with confidence scores.

#### Changed
- **Installer streamlined** - Replaced visualizer setup with Obsidian vault detection. Install is now 2 phases (memory daemon + Obsidian vault) instead of 4.
- **Skills updated** - Commitment detector, relationship tracker, risk surfacer, morning brief, and vault awareness skills all leverage the new temporal and contact velocity data.
- **Consolidation enhanced** - Three new sub-steps: surge approaching deadlines, update contact velocity, update attention tiers. Each wrapped in independent try-except for resilience.

#### Database
- Migration 17: `deadline_at` and `temporal_markers` columns on memories table
- Migration 18: `last_contact_at`, `contact_frequency_days`, `contact_trend`, `attention_tier` columns on entities table
- Both migrations are purely additive with duplicate-column guards. Existing databases upgrade safely.

#### Stats
- 436 tests pass, 5 skipped, 0 regressions
- 6 new test files covering temporal extraction, temporal recall, vault sync, canvas preservation, and consolidation v2
- Install: `npx get-claudia`

---

## 1.36.1 (2026-02-10)

### Fix: Edge Bundling & Highlight Intensity

#### Fixed
- Edge bundling algorithm: inverted endpoint stiffness (middle points now move most), force averaging that killed dense clusters (accumulated instead), flat force falloff (now inverse-square)
- Highlight intensity toned down: radius 1.3 to 0.8, opacity 0.65 to 0.45, particle count 6 to 3
- Installer now attempts visualizer install on upgrades even if memory step had issues

---

## 1.36.0 (2026-02-10)

### Brain Visualizer V1

The 3D brain visualizer gets four upgrades that make dense graphs readable, search smarter, and the visual experience more customizable.

#### Added
- **Edge bundling** - Tightly interconnected clusters (e.g., YPO Forum V+) now render bundled "highway" edges instead of spaghetti. Uses force-directed edge bundling (FDEB) as a post-processing pass after simulation settles. Configurable strength, radius, and endpoint stiffness via design panel.
- **5 new dark themes** - Noir Signal (high-contrast black + crimson), Arctic Command (cool blue-white ops center), Synth Wave (retro neon pink/cyan), Copper Patina (warm industrial copper/teal), Phosphor Terminal (green-on-black CRT). Now 10 themes total.
- **Resolution picker** - Control render resolution via settings gear or design panel. Options: Auto (device default), 0.5x (performance), 1x, 1.5x, 2x (retina). Useful for HiDPI tradeoffs or screen recording at specific resolutions.
- **Search prioritizes people** - People entities now always appear before other types in search results, sorted by importance within each tier.

---

## 1.35.2 (2026-02-09)

### Fix: Embedding Migration Column Name

Fixed `--migrate-embeddings` crashing on the memories table. The migration code used `deleted_at` (which exists on entities) instead of `invalidated_at` (which is the correct soft-delete column on memories). Also fixed matching query in the migration test file.

#### Fixed
- Memory queries in migration now use `invalidated_at IS NULL` instead of `deleted_at IS NULL`
- Test file `test_embedding_migration.py` updated to match

---

## 1.35.1 (2026-02-09)

### UX: Friendlier Embedding Migration

`--migrate-embeddings` no longer requires manual config editing. It now shows an interactive model picker, auto-updates config.json, and offers to download missing models from Ollama automatically. Three simple prompts: pick a number, press Enter to download, press Y to migrate.

#### Improved
- Interactive model selection menu with size/accuracy info and current model marked
- Auto-pull: if the selected model isn't installed in Ollama, offers to download it with one keypress
- Better error messages: distinguishes "Ollama not running" from "model not pulled"
- Config.json updated automatically when user picks a new model (no manual JSON editing)

---

## 1.35.0 (2026-02-09)

### The Memory Upgrade

Claudia's memory system got meaningfully better in three ways: she no longer accidentally surfaces outdated facts, she can now switch to better embedding models with a single command, and the install/upgrade flow maintains her semantic search automatically.

### Added

- **Embedding model migration** - New `--migrate-embeddings` CLI command safely transitions between embedding models (e.g., `all-minilm:l6-v2` at 384D to `nomic-embed-text` at 768D). Pre-flight checks, automatic backup, progress reporting, and clear rollback instructions. Vec0 dimensions are now configurable via `config.json`.
- **Embedding backfill on upgrade** - The installer now auto-backfills missing embeddings across all databases during upgrades, and detects model mismatches with clear guidance.
- **Config-aware model pulling** - Installer reads `embedding_model` from `config.json` instead of hardcoding `all-minilm:l6-v2`, so users with custom models get the right model pulled during install.
- **`memory.system_health` MCP tool** - Surfaces daemon health, memory counts, and embedding status directly inside Claude sessions.
- **`memory.summary` MCP tool** - Lightweight entity summaries with proper soft-delete filtering.
- **Database backup** - `Database.backup()` with SQLite online backup API and rolling retention (configurable, default 3).
- **Embedding cache** - Thread-safe LRU cache (256 entries, SHA256 keys) for embedding deduplication. Includes `clear()` for post-migration invalidation.
- **Retention cleanup** - Consolidation Phase 4 trims old audit logs (90d), predictions (30d), turn buffer (60d), and metrics (90d). All thresholds configurable.
- **Dimension mismatch detection** - `_check_model_consistency()` now checks both model name and dimensions, warns on startup if database doesn't match config.
- **Skill index** - `skill-index.json` (43 skills, ~3K tokens) for fast skill lookup without loading all skill files.
- **Enhanced session hooks** - Health check hook now calls `/status` for memory counts and embedding warnings.

### Fixed

- **Invalidated memories no longer surface** - Added `invalidated_at IS NULL` filter to all 6 recall paths. Previously, memories marked as no longer true could still appear in search results.
- **Backfill format bug** - `--backfill-embeddings` was using `struct.pack()` (binary blobs) instead of `json.dumps()` (JSON strings), silently corrupting the vec0 index. Fixed to match all other code paths.
- **Adaptive decay** - High-importance memories (>0.7) now decay at half rate with a configurable floor at `min_importance_threshold`.

### Changed

- **Vec0 tables moved to database.py** - All 5 vec0 `CREATE VIRTUAL TABLE` statements moved from `schema.sql` to `database.py` for runtime dimension configuration. `VEC0_TABLES` class attribute provides canonical table list.
- **Scheduler trimmed** - Reduced from 8 scheduled jobs to 3 (daily decay, pattern detection, full consolidation). Removed: verification, predictions, LLM consolidation, metrics, document lifecycle.
- **Config validation** - Warns on uncommon `embedding_dimensions` values, enforces minimums on `backup_retention_count` and all retention day settings.

### Stats

- 341 tests (+42 new across 5 test files), 0 regressions
- Install: `npx get-claudia`

---

## 1.34.2 (2026-02-08)

### Hotfix: Python 3.14 sqlite-vec Loading

Python 3.14 tightened SQLite extension security, requiring explicit `enable_load_extension(True)` before any extension can be loaded. This broke semantic search for every Python 3.14 user -- vector embeddings never loaded, and recall silently fell back to text-only matching.

### Fixed

- **sqlite-vec loading on Python 3.14+** - Added `enable_load_extension(True)` before `sqlite_vec.load()` and re-locked after. Guarded with `hasattr()` for Python builds that omit extension loading entirely (`SQLITE_OMIT_LOAD_EXTENSION`).

### Added

- **`--backfill-embeddings` CLI flag** - One-shot command (`python3 -m claudia_memory --backfill-embeddings`) to generate embeddings for all memories missing them. Useful after fixing the sqlite-vec loading issue on existing installations.

### Stats

- 299 tests (+1 new), 0 regressions
- Install: `npx get-claudia`

---

## 1.34.1 (2026-02-08)

### Hotfix: Tool Name Compatibility

The Anthropic Messages API requires tool names to match `^[a-zA-Z0-9_-]{1,128}$`, but the memory daemon's MCP tools use dot-notation (`memory.recall`, `memory.remember`, etc.). The gateway passed these names through verbatim, causing every API request with tool_use to fail with a 400 error. No user could send a message through Telegram with tool_use enabled.

### Fixed

- **Anthropic tool name conversion** - Dots are now converted to underscores when sending tool schemas to the Anthropic API (`memory.recall` becomes `memory_recall`), and converted back when calling the MCP daemon.
- **Bidirectional name resolution** - `isExposed()` safety gate now accepts both MCP dot-names and Anthropic underscore-names. The conversion only replaces the first underscore (namespace separator), preserving underscores within tool names like `search_entities`.
- **Verbose error logging** - LLM call errors now log `status`, `body`, and `stack` in addition to the error message, making API failures debuggable without guesswork.

### Stats

- 78 gateway tests (+3 new), 0 regressions
- Install: `npx get-claudia`

---

## 1.34.0 (2026-02-08)

### The Quick Setup

Setting up Telegram used to mean 70 seconds of codebase exploration followed by a wall of text. Now there's a dedicated `/setup-gateway` skill that walks you through it one step at a time: create bot, get user ID, write secrets to shell profile, generate gateway.json, start and verify. The gateway also defaults to Haiku now (fast and cheap for chat), instead of Sonnet.

### Added

- **`/setup-gateway` skill** - Guided walkthrough for gateway Telegram/Slack setup with fast pre-flight checks (file existence + env vars, no codebase exploration), step-by-step flow with user confirmation at each stage, and automatic config generation.
- **Setup-telegram clarification** - `setup-telegram.md` now clearly labels itself as the relay path (full `claude -p` sessions) and points users to `/setup-gateway` for the simpler API-based path.

### Changed

- **Default gateway model** - Changed from `claude-sonnet-4-20250514` to `claude-haiku-4-5-20251001`. Existing users with a model in their `gateway.json` are unaffected (deepMerge preserves their value).
- **Gateway SKILL.md** - Fixed port typo (3848 to 3849), added `/setup-gateway` suggestions for missing install and missing token errors.
- **Trigger deconfliction** - "connect Telegram" now routes to `/setup-gateway` (the common case). Relay-specific phrases ("Telegram relay", "set up relay") route to `/setup-telegram`.

### Stats

- 75 gateway tests, 0 regressions
- Install: `npx get-claudia`

---

## 1.33.0 (2026-02-08)

### Claudia Thinks for Herself

The gateway now exposes 14 memory tools to Claude via native Anthropic/Ollama tool_use. Instead of only getting pre-loaded context, Claudia can now decide mid-conversation to search for more memories, store new facts, correct outdated information, or trace where she learned something. She uses tools naturally without announcing them.

### Added

- **API-native tool_use** - New `ToolManager` (`tools.js`) dynamically loads MCP tool schemas from the memory daemon at startup, filters to a curated 14-tool subset, and converts to Anthropic/Ollama formats. No hardcoded schemas to maintain.
- **Tool execution loop** - `_callAnthropicWithTools()` and `_callOllamaWithTools()` in `bridge.js` run an iterative tool loop (max 5 rounds, configurable) letting Claude chain tool calls before producing a final response.
- **Safety chokepoint** - `_executeToolCall()` rejects non-exposed tools and auto-injects `source_channel` on write operations (`memory.remember`, `memory.batch`, `memory.correct`).
- **`toolUse` config** - Global and per-channel setting. `undefined` (default) auto-detects by provider: enabled for Anthropic, disabled for Ollama.
- **`toolUseMaxIterations` config** - Max tool loop rounds per message (default 5).
- **`preRecall` config** - Keep programmatic pre-call recall alongside tool_use (default true, belt-and-suspenders).

### Changed

- **`processMessage()`** branches between tool_use and standard LLM paths based on resolved config.
- **`_buildSystemPrompt()`** appends tool usage instructions when tool_use is active.
- **`getStatus()`** includes `toolUseEnabled` and `toolCount` fields.

### Stats

- 75 gateway tests (was 49), 0 regressions
- 26 new tests across 2 files (tools, bridge-tooluse)
- Install: `npx get-claudia`

---

## 1.32.0 (2026-02-08)

### The Real Claudia on Telegram

The gateway now loads Claudia's full personality from template files instead of a generic 8-line prompt. Telegram and Slack Claudia feels like the real Claudia: warm, witty, principled. Plus per-channel model config so you can run Haiku on Telegram (~$27/mo) and Sonnet on Slack (~$86/mo).

### Added

- **Per-channel model config** - Each channel (telegram, slack) can specify its own `model` in `gateway.json`, overriding the global default. Empty string means "use global." Resolved per-message in `_resolveModel()`.
- **Claudia personality loading** - New `personality.js` module extracts gateway-relevant sections from `template-v2/CLAUDE.md` (identity, mission, style, behaviors, boundaries) and `claudia-principles.md` (principles 1-10). Prepends a chat-adapted preamble.
- **Personality resolution chain** - `personalityDir` config > auto-detect `template-v2/` in dev mode > `systemPromptPath` legacy > `DEFAULT_SYSTEM_PROMPT` fallback. Cached after first load.
- **`personalityMaxChars` config** - Safety limit (default 15,000) to prevent oversized system prompts. Truncates at last complete line.

### Changed

- **`_callAnthropic()` and `_callOllama()`** now receive the resolved model as a parameter instead of reading from config directly.
- **`getStatus()`** includes `personalityLoaded` boolean.
- **Gateway logs** now include `channel` and resolved `model` in LLM call logs.

### Stats

- 49 gateway tests (was 22), 0 regressions
- 27 new tests across 3 files (personality, bridge-model, config)
- Install: `npx get-claudia`

---

## 1.31.0 (2026-02-07)

### The Telegram Relay

Claudia can now talk to you over Telegram. The relay spawns `claude -p` for each message, so she has full access to skills, memory, MCP tools, and her complete personality. Not a simplified chatbot; the real Claudia, in your pocket.

### Added

- **Telegram relay** - New `relay/` module that bridges Telegram messages to Claude Code via `claude -p`. Handles text, photos, and document attachments with session persistence and concurrency guards.
- **File sending over Telegram** - Claudia can create files (SVG diagrams, HTML pages, CSV exports) and send them back as Telegram attachments. Images go inline, documents as file attachments. Supported: png, jpg, jpeg, gif, webp, pdf, svg, csv, xlsx, docx, txt, html, json.
- **Channel-aware memory** - Memories stored via Telegram are tagged with `source_channel: "telegram"`. New `source_channel` column (migration 16) on the memories table, exposed through `memory.remember`, `memory.batch`, and recall results.
- **`/setup-telegram` skill** - Guided 7-step walkthrough: create bot via @BotFather, find user ID, install deps, create config, set token, start relay, test it. Checks existing state and skips completed steps.
- **Relay in installer** - Phase 4/4 in `npx get-claudia`. Copies source to `~/.claudia/relay/`, runs npm install, creates `claudia-relay` CLI wrapper, sets up LaunchAgent (macOS) / systemd (Linux) / scheduled task (Windows).
- **Telegram HTML formatter** - Converts markdown to Telegram-compatible HTML (bold, italic, code, pre blocks). Strips unsupported formatting gracefully.
- **Message chunking** - Splits long responses at sentence boundaries to stay within Telegram's 4096-char limit.

### Stats

- 5 new relay test files (chunker, config, formatter, session, telegram)
- 2 new memory daemon test files (source_channel, database migration)
- Install: `npx get-claudia`

---

## 1.30.0 (2026-02-07)

### The Trust Model

Relationships now behave like synaptic connections: weak traces that strengthen through repeated activation, decay without reinforcement, and respect the authority of their source. A single batch inference can no longer create a 0.9-strength relationship. Instead, inferred relationships start capped at 0.5 and must earn trust through re-encounter.

### Added

- **`memory.invalidate_relationship` MCP tool** - Mark a relationship as incorrect or ended without creating a replacement. Use when someone leaves a company, ends a partnership, or when data was wrong. The relationship is preserved for history but excluded from active queries.
- **Origin-aware strength ceilings** - Every relationship now tracks how it was learned (`origin_type`): `user_stated` (ceiling 1.0), `extracted` (0.8), `inferred` (0.5), `corrected` (1.0). Strength is automatically capped by origin authority.
- **Scaled reinforcement** - Re-encountering a relationship strengthens it by an amount proportional to the new evidence: user statements add +0.2, extracted evidence +0.1, inferences +0.05. Repeated weak signals compound into strong connections.
- **Origin upgrades** - When a relationship first seen as `inferred` is later confirmed by `user_stated`, the origin and ceiling both upgrade, lifting the strength cap.

### Fixed

- **Supersede targeted wrong relationship** - When an entity had multiple relationships of the same type (e.g., works_at Acme AND works_at Beta), supersede matched only source + type, picking one arbitrarily. Could invalidate the wrong relationship. Now matches the full source + target + type triple.
- **Non-atomic supersede** - Three separate auto-committed operations (invalidate, rename, insert) meant a crash mid-sequence could leave corrupted state. Wrapped in a `Database.transaction()` context manager that commits on success, rolls back on error.
- **Batch operations dropped relationship parameters** - `memory.batch` relate operations silently ignored `origin_type`, `supersedes`, `valid_at`, and `direction`. All parameters now forwarded correctly.

### Changed

- **`recall_about` includes origin_type** - Relationship results now include provenance so the visualizer and entity lookups show how each relationship was learned.
- **map-connections skill uses origin_type** - Replaced manual strength mapping (0.9/0.6/0.3) with honest origin classification. Set `origin_type` based on evidence quality and let the system enforce the ceiling.
- **New `Database.transaction()` context manager** - Explicit multi-step transactions for operations that must be atomic.

### Stats

- 295 tests, 0 regressions
- 14 new tests, 1 updated (guards, bitemporal, batch parallel)
- Migration 15: adds `origin_type` column to relationships

---

## 1.29.2 (2026-02-07)

### Fixed

- **Brain visualizer missing from npm package** - v1.29.1 incorrectly removed `visualizer/` from the `files` array, assuming it was a legacy directory. It actually contains `server.js` (the Express API backend) and `scripts/install.sh` (called by the installer). New users got "Visualizer files not found. Skipping." and the brain visualizer never installed.

---

## 1.29.1 (2026-02-07)

### Post-Release Fixes

Full code review across the entire repository caught bugs, dead references, and a resource leak that slipped through v1.29.0.

### Fixed

- **`run_decay()` always reported 0 memories decayed** - `SELECT changes()` was called after subsequent UPDATE statements instead of immediately after the memories UPDATE, so the metric was always 0. Decay itself worked fine; only the reported count was wrong.
- **7 dead MCP tool references in template** - Skills and hooks still referenced `memory.predictions` and `memory.agent_dispatch` (removed in v1.29.0). These would fail silently at runtime. Replaced with `memory.session_context` or removed dispatch logging steps.
- **Embedding service HTTP clients leaked on shutdown** - The `EmbeddingService.close()` method existed but was never called during daemon shutdown. Added cleanup in the `finally` block.

### Changed

- **Config parse errors now log a warning** - Previously, a malformed `~/.claudia/config.json` was silently ignored. Now logs the error and falls back to defaults.
- **`embed_batch` handles individual failures gracefully** - One failed embedding no longer crashes the entire batch. Uses `return_exceptions=True` and converts exceptions to `None`.
- **Duplicate dispatch_tier trigger removed** - The trigger was created in both migration 14 and the post-migration setup. Removed the redundant copy from migration 14.

### Stats

- 277 tests, 0 regressions
- 14 files changed across memory-daemon, template, installer, and docs

---

## 1.29.0 (2026-02-07)

### The Robustness Release

Claudia's memory system was overbuilt and underverified. Eight background jobs ran overnight, but three crashed, two never confirmed completing, and predictions had never generated a single result. This release strips the system down to what works, fixes what was broken, and adds the observability to prove it.

### Fixed

- **Hourly verification crash** - The `verification_status` column was missing on databases created before migration 5. The migration integrity check now detects and self-heals this on next daemon startup.

### Added

- **`memory.system_health` MCP tool** - Was documented but never implemented. Now returns schema version, component status (database/embeddings/scheduler), active job list with next run times, and data counts. Also powers the enhanced `/status` HTTP endpoint.
- **Pipeline integration test** - 8 end-to-end tests proving the core data flow works: entity creation, memory storage, relationships, decay, pattern detection, session lifecycle, and deduplication.
- **Shared test conftest.py** - Eliminates duplicated database fixture across 12+ test files.
- **Scheduler test** - Verifies exactly 3 jobs are registered, none of the removed ones sneak back.

### Changed

- **Scheduler slimmed from 8 jobs to 3** - Kept: daily decay (2 AM), pattern detection (every 6h), full consolidation (3 AM). Removed: hourly verification (crashed), daily predictions (never worked), LLM consolidation (requires local model most users lack), metrics collection (no consumer), weekly document lifecycle (4 documents). Service code retained for future re-enablement.
- **3 MCP tools deferred** - Removed `memory.predictions`, `memory.prediction_feedback`, `memory.agent_dispatch`. These exposed features that either never worked or had no data flowing through them.
- **Full consolidation no longer generates predictions** - `run_full_consolidation()` now runs decay, merging, and pattern detection only.

### Stats

- 277 tests, 0 regressions
- 16 new tests (pipeline, scheduler, health check, migration integrity)
- Net code reduction: ~145 lines removed from MCP tools, ~50 from scheduler

---

## 1.28.4 (2026-02-06)

### Windows 11 Compatibility

Claudia now works on Windows 11 out of the box. A user reported five cascading failures after installing via `npx get-claudia` on Windows: hooks crashed (no bash), MCP tools didn't load (wrong entry point), sqlite-vec failed silently, and the diagnose skill only spoke Unix.

### Fixed

- **Hooks crash on Windows** - Session hooks hardcoded `bash` as executor, which doesn't exist on vanilla Windows. Hooks now try `python3 > python > bash` with a graceful JSON fallback. New cross-platform Python hooks (`session-health-check.py`, `pre-compact.py`) handle macOS, Linux, and Windows natively.
- **MCP entry point bypassed __main__.py** - The installer wrote `.mcp.json` with `-m claudia_memory.mcp.server`, skipping project isolation, the health server, and background scheduling. Fixed to use `-m claudia_memory --project-dir ${workspaceFolder}`.
- **sqlite-vec silent failure on Windows** - Method 1 failure logged at DEBUG (invisible). Upgraded to WARNING. Added Windows DLL search paths (package directory rglob, sys.executable/DLLs) and architecture mismatch guidance.
- **Bash health check missing Windows case** - Added `msys*|cygwin*|MINGW*` OSTYPE detection with Task Scheduler status check and PowerShell `Invoke-WebRequest` fallback for curl.

### Changed

- **Diagnose skill is cross-platform** - Added platform detection step, Windows PowerShell equivalents for all diagnostic commands (process check, health endpoint, log tail, database query, Task Scheduler), and Windows recovery commands.
- **New diagnose issue: wrong MCP entry point** - Detection and fix instructions for the `.mcp.json` entry point bug, helping existing users self-heal.
- **`.mcp.json.example` Windows note** - Added `_windows` field documenting the Windows Python path.

---

## 1.28.3 (2026-02-06)

### Resilient Memory Tools

Claudia's memory tools now defend against two classes of LLM serialization errors that caused silent failures during session wrap-up.

### Fixed

- **String-serialized arrays** - LLMs sometimes send array parameters as JSON strings (e.g., `'["Alice"]'` instead of `["Alice"]`). All 16 top-level array parameters across 10 MCP tools now accept both native arrays and JSON strings, with transparent runtime coercion.
- **Missing episode_id in end_session** - When `buffer_turn` was never called during a session, `end_session` would fail because `episode_id` was required. It's now optional with automatic episode creation.

### Added

- **Parallel batch embeddings** - `memory.batch` now collects all texts upfront and embeds them in parallel before executing operations, reducing latency for multi-operation calls.
- **Agent-accelerated extraction** - Document Processor agent gains `memory_operations` extraction type, returning ready-to-store `memory.batch` operations. Capture-meeting and memory-manager skills updated to use the agent pipeline.
- **16 new tests** for LLM coercion defense (coerce utility, episode auto-creation, schema validation).

---

## 1.28.2 (2026-02-06)

### Fixed

- **end_session FK constraint fix** - Calling `memory.end_session` with a non-existent episode_id (e.g., 0 or before `buffer_turn` creates one) no longer crashes with a FOREIGN KEY constraint error. The MCP handler now auto-creates a minimal episode, and the service layer returns a clear error for direct callers.

---

## 1.28.1 (2026-02-06)

### Don't Let Me Forget

Claudia no longer silently falls back to markdown when the memory daemon is off. She now detects why the daemon is down and proactively offers to fix it.

### Changed

- **Proactive daemon startup** - Session health check hook now detects whether the daemon is installed but stopped vs never installed, and provides the exact platform-specific restart command (launchctl on macOS, systemd on Linux).
- **No silent degradation** - Memory manager skill and session start protocol updated to always tell the user what they're missing and offer to fix it, rather than quietly operating at reduced capability.
- **Crash log surfacing** - Health check hook now includes recent daemon error log lines in its output to help diagnose issues faster.

---

## 1.28.0 (2026-02-06)

### Brain Monitor

A real-time terminal dashboard for watching Claudia's memory system. Four live panels show neural activity, daemon health, entity constellations, and memory landscapes, all updating in your terminal.

### Added

- **Brain Monitor TUI** - Textual-based terminal dashboard (`python -m claudia_memory --tui`) with four widgets: Neural Pulse (write/read/link activity), Identity (daemon health + stats), Constellation (entity dot grid), and Landscape (importance distribution).
- **`/brain-monitor` skill** - Launch the TUI dashboard from any Claudia session. Simple one-command launch with background execution.
- **`claudia-brain` CLI entry point** - Direct command to launch the Brain Monitor without the `python -m` invocation.
- **TUI auto-install** - `textual>=0.80.0` now installs automatically during memory daemon setup (both fresh installs and upgrades).

### Changed

- Install scripts (`install.sh`, `install.ps1`) now use `pip install -e ".[tui]"` instead of plain `-e .` to include the TUI extra.
- `requirements.txt` includes `textual>=0.80.0` as a core dependency.
- `pyproject.toml` declares `[tui]` optional extra and includes `tui/*.tcss` in package data.

---

## 1.27.0 (2026-02-06)

### Zero-Prompt Seamless Install

The installer no longer asks any questions. Everything installs automatically with smart defaults.

### Changed

- **Zero-prompt installer** - Memory system, brain visualizer, and messaging gateway all install automatically. No interactive prompts. Ollama auto-installs via Homebrew (macOS) or winget/direct download (Windows).
- **Modern banner** - Version badge, typewriter tagline, and "by Kamil Banc" all render in yellow. Phase indicators (1/3, 2/3, 3/3) show progress through memory, visualizer, and gateway setup.
- **Gateway auto-install** - Gateway installs silently alongside the memory system. Interactive Telegram/Slack wizard skipped during main install; users configure tokens at their own pace via `~/.claudia/gateway.json`.
- **Installation summary** - Final output shows a status table for all three components (Memory, Visualizer, Gateway) with Active/Skipped/Installed status.
- **What's New updated** - Highlights zero-prompt install, gateway auto-setup, document storage, and provenance.

### Technical

- `CLAUDIA_NONINTERACTIVE=1` env var passed to `memory-daemon/scripts/install.sh` and `install.ps1` to auto-install Ollama without prompting. LLM model selection menu preserved (meaningful user choice).
- `CLAUDIA_GATEWAY_SKIP_SETUP=1` env var passed to `gateway/scripts/install.sh` and `install.ps1` to skip the interactive Telegram/Slack wizard.
- Removed `readline` import from `bin/index.js` (no longer needed).
- All scripts remain fully interactive when run standalone (env vars default to 0).

---

## 1.26.0 (2026-02-05)

### The Full Sweep

13 improvements across skills, config, tests, and security in a single pass.

### Added

- **Skill disambiguation rules** in agent-dispatcher: clear routing tables for content processing (meeting vs email vs extraction) and research vs analysis queries, with cost-minimizing priority rule.
- **MCP tool reference** in memory-manager: complete catalog of all 33 memory tools grouped by category (Core, Session, Documents, Analysis, Trust, Network, Gateway, Admin).
- **Config validation** in memory daemon: warn-and-reset for out-of-range values (decay rate, max results, importance threshold, ranking weight sum).
- **`dispatch_tier` constraint trigger**: database now rejects invalid tier values (must be 'task' or 'native_team').
- **Gateway test expansion**: 7 new tests covering deepMerge (4 cases), PID file operations (3 cases), and structure-based config loading.
- **Dispatch tier integrity test**: verifies the trigger rejects invalid values with `IntegrityError`.

### Changed

- **`/deep-context` memory budget fixed**: was 190-270 (exceeded stated 100-200), now capped at 180. Added deduplication step, edge case handling (entity not found, sparse connections, daemon unavailable, contradictions).
- **Archetype phantom commands removed**: all 5 archetypes referenced `.claude/commands/` files that don't exist as standalone skills. Removed phantom file references, kept inline template content.
- **CLAUDE.md/principles redundancy reduced**: condensed duplicate Safety First and Source Preservation sections in CLAUDE.md to brief references to `claudia-principles.md`.
- **Consolidation error handling**: phase-level try/except wrapping (decay, merging, pattern detection, predictions) so one failure doesn't abort the entire consolidation run.
- **Node engine requirement**: bumped from >=14.0.0 to >=18.0.0 (Node 14 EOL'd April 2023).
- **Gateway config security**: warns when Telegram/Slack tokens are stored in plaintext config file instead of environment variables.
- **Greeting instruction**: changed impossible "never the same greeting twice" to practical "change it up frequently".
- **Structure generator**: archetype commands described as built-in templates, not separate command files.

---

## 1.25.0 (2026-02-05)

### Opus 4.6 Integration

Claudia now leverages Claude Opus 4.6's expanded capabilities: native agent teams, deeper recall from the 1M context window, effort levels for skills, and a new /deep-context skill for comprehensive analysis.

### Added

- **Two-tier agent dispatch** - Agents now dispatch via two mechanisms: Tier 1 (Task tool) for fast, structured Haiku agents (Document Archivist, Document Processor, Schedule Analyst), and Tier 2 (Native Agent Teams) for Research Scout, which gets independent context and multi-turn tool access.
- **Effort levels** - All 39 skills now declare an `effort-level` (low/medium/high/max) in YAML frontmatter, signaling how much thinking budget each task requires.
- **`/deep-context` skill** - Full-context deep analysis that pulls 100-200 memories across multiple dimensions (entity, semantic, connected entities, temporal sweep) for meeting prep, relationship analysis, and strategic planning. Effort level: max.
- **`dispatch_tier` field** - `memory.agent_dispatch` now tracks whether each dispatch used Task tool ("task") or native agent teams ("native_team").
- **Briefing packets** - Tier 2 agents receive structured briefing packets with task context, relevant entities, and constraints since they don't have direct memory access.
- **Database migration v14** - Adds `dispatch_tier` column to `agent_dispatches` table.
- **Skills README effort table** - Documents all effort levels and explains the system.

### Changed

- **`max_recall_results` bumped to 50** - Up from 20, leveraging the 1M context window for richer recall.
- **Pre-compact hook** - Tone changed from alarm ("CONTEXT COMPACTION OCCURRED") to advisory, reflecting that compaction is less frequent with 1M context.
- **Agent dispatcher** - Rewritten with two-tier architecture, briefing packet construction, and effort routing guidance.
- **Agent definitions** - All four agents now include `dispatch-tier` in frontmatter (task or native_team).
- **Research Scout** - Added briefing expectations section for native team dispatch.
- **Agents README** - Updated with two-tier architecture diagram and dispatch-tier in agent definition format.
- **CLAUDE.md "My Team" section** - Updated to describe two-tier dispatch system.
- **Memory manager** - Added `/deep-context` reference and note about reduced compaction frequency.
- **11 proactive skills** - Added YAML frontmatter with `name`, `description`, and `effort-level` (previously had `**Purpose:**` header format only).
- **Native agent teams enabled** - `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` set in settings.local.json.

### Why This Matters

Before: All agents dispatched identically via Task tool. Skills had no thinking budget signal. Recall was capped at 20 results. Deep analysis required manual memory queries.

After: Research Scout operates as a true autonomous teammate with its own context and tools. Skills declare effort levels so the model allocates appropriate thinking. Recall can pull up to 50 results for richer context. `/deep-context` automates comprehensive 100-200 memory pulls for strategic analysis.

---

## 1.24.0 (2026-02-05)

### Trust North Star + Agent Team

Claudia now has a team of specialized agents and a foundational commitment to accuracy. Trust is her #1 priority, and she has help.

### Added

- **Trust North Star rule** - Core principle: every memory must be accurate and traceable. New `origin_type` field tracks whether information came from the user directly, was extracted from documents, was inferred, or was corrected.
- **Origin tracking** - Memories now track `origin_type` (user_stated, extracted, inferred, corrected) with auto-detection based on source and importance.
- **`memory.audit_history` tool** - Get the full audit trail for any entity or memory. Answer "where did you learn that?" with precision.
- **`memory.agent_dispatch` tool** - Log when Claudia delegates tasks to her agent team, track performance and judgment requirements.
- **Agent team** - Four specialized sub-agents that help Claudia work faster:
  - **Document Archivist** (Haiku) - PRIMARY entry point for pasted content, adds provenance
  - **Research Scout** (Sonnet) - Web searches, fact-finding, synthesis
  - **Document Processor** (Haiku) - Extracts structured data from documents
  - **Schedule Analyst** (Haiku) - Calendar pattern analysis
- **`agent-dispatcher` skill** - Core logic for when and how to delegate to agents.
- **`hire-agent` skill** - Suggests new agents based on repeated task patterns.
- **Database migration v13** - Adds `origin_type` column to memories, `agent_dispatches` table for tracking.

### Changed

- **RecallResult** - Now includes `confidence`, `verification_status`, and `origin_type` fields.
- **`remember_fact()`** - Now accepts `origin_type` parameter with auto-detection fallback.
- **`correct_memory()`** - Automatically sets `origin_type=corrected` and `confidence=1.0`.
- **CLAUDE.md** - Added "My Team" section describing Claudia's agent team.
- **`memory-manager` skill** - Added Trust North Star reference and origin tracking requirement.

### Why This Matters

Before: Claudia could confidently state something she'd inferred, with no way to distinguish it from what the user actually said. Processing large documents blocked the conversation.

After: Every memory has traceable provenance. "Where did you learn that?" has an answer. Pasted content goes to the Document Archivist for processing while Claudia stays responsive. Trust is earned through accuracy.

---

## 1.23.0 (2026-02-05)

### Proactive Memory

Claudia now captures important information as it happens, not just at session end. Context compaction can't steal what's already stored.

### Added

- **PreCompact hook** - Fires before context compaction, triggers `/flush` endpoint to checkpoint the database and injects recovery reminders into compacted context.
- **`/flush` endpoint** - New daemon endpoint forces WAL checkpoint to ensure all buffered data is durably written.
- **Proactive capture rules** - New behavioral guidelines for storing commitments, entities, and relationships mid-conversation instead of waiting for session end.
- **Turn buffering tests** - 7 new tests covering the full session lifecycle (buffer_turn, end_session, get_unsummarized).

### Changed

- **`commitment-detector` skill** - Now calls `memory.remember` immediately when a commitment is detected, before adding to markdown.
- **`memory-manager` skill** - Rewrote "Proactive Capture Rules" section with Claudia's personality. Explains the why (context compaction risk) not just the what (call these tools).

### Why This Matters

Before: Important information could be lost if context compacted before session end, or if the user closed the terminal abruptly.

After: Commitments, entities, and relationships are stored as they're discovered. The PreCompact hook provides a safety net. Turn buffering catches orphaned sessions.

---

## 1.22.0 (2026-02-05)

### The Learning Loop

Claudia's memory system now actually learns from experience. She can fix mistakes, merge duplicates, track what changed, and measure her own health.

### Added

- **Audit logging** - Full audit trail for all memory operations. Every merge, correction, deletion, and creation is logged with timestamps and details.
- **Metrics system** - System health metrics collected daily at 5am. Track entity counts, memory stats, data quality indicators over time.
- **Entity merge tool** - `memory.merge_entities` combines duplicate entities, preserving all references (memories, relationships, aliases).
- **Entity delete tool** - `memory.delete_entity` soft-deletes with reason tracking. Historical references preserved.
- **Memory correction tool** - `memory.correct` updates content while preserving history in `corrected_from` field.
- **Memory invalidation tool** - `memory.invalidate` marks memories as no longer true without destroying them.
- **Fuzzy duplicate detection** - `find_duplicate_entities()` uses SequenceMatcher for similarity scoring.
- **`/fix-duplicates` skill** - Find and merge duplicate entities through natural language.
- **`/memory-health` skill** - System health dashboard showing entity counts, memory stats, and data quality.
- **49 new tests** - Comprehensive coverage for audit, metrics, entity management, and corrections.

### Changed

- **Database migration v12** - Added `audit_log` and `metrics` tables, soft-delete columns on entities, correction columns on memories.
- **Scheduler** - Added daily metrics collection job at 5am.
- **`memory-manager` skill** - New "User Corrections" section with triggers and workflow for fixing mistakes.

### Why This Matters

Before: Memory mistakes were permanent. Duplicates accumulated. No way to know if the system was healthy.

After: Say "that's not right about Sarah" and Claudia corrects it. Run `/fix-duplicates` to clean up. Check `/memory-health` to see how the system is doing. Full audit trail for accountability.

---

## 1.21.1 (2026-02-04)

### Bulletproof Memory

Claudia now verifies the memory system is working at session start and enforces source preservation as a hard requirement.

### Fixed

- **Python 3.14 compatibility** - Fixed `asyncio.get_event_loop()` deprecation in standalone daemon mode that was crashing the health endpoint.

### Added

- **`/diagnose` skill** - Full diagnostic tool that checks MCP tools, daemon process, health endpoint, and database. Provides specific fix instructions for each failure mode.
- **Memory verification at session start** - Claudia now checks that `memory.*` tools are available before proceeding. If missing, warns user and suggests `/diagnose`.
- **Hard source preservation requirement** - "STOP. File it FIRST." is now a hard stop in the workflow, not a suggestion.

### Changed

- **Session start protocol** - Now has explicit 4-step verification: check tools → load context → catch up → greet.
- **`/ingest-sources` workflow** - Now files each source during Phase 2 (extraction), not Phase 5 (after everything). File-Then-Extract, not Extract-Then-File.
- **`memory-manager` skill** - Added "Hard Requirements" section at top making source preservation non-negotiable.
- **`hooks.json`** - Added `memory_verification` and `source_filing` notes.

### Why This Matters

Before: Claudia could read 40 transcripts, extract to a dashboard, but never file the sources. Next session, no provenance.

After: She literally cannot proceed past "read source" without filing it first. And if memory tools aren't available, she warns you immediately instead of silently failing.

---

## 1.21.0 (2026-02-04)

### The Reflections Release

Claudia can now generate persistent learnings about how to work with you. These reflections decay much slower than regular memories and compound over time.

### Added

- **`/meditate` skill** - End-of-session reflection workflow. Claudia reviews the conversation, generates 1-3 learnings (observations, patterns, learnings, questions), and presents them for your approval before storing.
- **Reflections table** - Schema v10 migration with 4 reflection types, content hashing for duplicate detection, and aggregation tracking for confirmed patterns.
- **`memory.reflections` MCP tool** - CRUD operations for reflections with get, search, update, and delete actions.
- **Slow decay model** - Reflections decay at 0.999 daily (~693 day half-life) vs memories at 0.995 (~138 days). Well-confirmed reflections (3+ aggregation) decay even slower at 0.9995.
- **Reflection aggregation** - ConsolidateService merges semantically similar reflections (>85% cosine similarity) while preserving timeline (first observed, last confirmed).
- **Natural language editing** - Tell Claudia "that reflection about Monday mornings is wrong" and she'll find and update it.

### Changed

- **`memory.end_session`** - Now accepts a `reflections` array parameter for storing approved reflections alongside the session narrative.
- **`memory-manager` skill** - New "Reflections (Enhanced Memory)" section documenting the full reflection lifecycle.

### Why This Matters

Before: Each session started fresh. Claudia remembered facts, but not meta-learnings about working with you.

After: "You prefer bullet points for technical content but conversational flow for discussions" persists across sessions. Claudia adapts to your style, remembers what works, and compounds that knowledge over time.

---

## 1.20.0 (2026-02-04)

### The Skills Migration

All 22 commands are now skills. Claudia responds to natural language, not just slash commands.

### Changed

- **Commands → Skills** - Every command converted to a skill directory with YAML frontmatter. Skills activate contextually based on what you say.
- **8 explicit-only skills** - Some workflows still require `/skill-name`: `/brain`, `/databases`, `/capture-meeting`, `/file-document`, `/gateway`, `/ingest-sources`, `/memory-audit`, `/new-person`
- **14 contextual skills** - The rest respond to natural language triggers. Say "check my pipeline" instead of `/pipeline-review`. Ask "what am I missing?" instead of running a command.
- **Updated CLAUDE.md** - Complete skills reference with trigger examples and invocation patterns.
- **Updated skills README** - Tables showing explicit vs contextual skills with descriptions.

### Why This Matters

Before: You had to remember `/command-name` syntax and what each command did.

After: Just tell Claudia what you need. She recognizes intent and activates the right workflow. Explicit skills remain for precision when you want it.

---

## 1.19.0 (2026-02-04)

### The Source Preservation Release

Claudia now files raw source material (transcripts, emails, documents) before extracting from it. Every fact she remembers can trace back to its source.

### Added

- **Source Preservation principle (#12)** - New core principle: always file raw sources before extraction. Added to `claudia-principles.md` with clear guidance on what gets filed, how, and why.
- **`/file-document` command** - Ad-hoc document capture for emails, research, contracts, and any content worth keeping. Files are automatically routed to entity-aware folders (`people/`, `clients/`, `projects/`).
- **Document Filing guidance** - New section in `memory-manager.md` skill with explicit flows for when and how to file different document types.

### Changed

- **`/capture-meeting` workflow** - Filing is now Step 1 (mandatory), not Step 3 (suggested). Quality checklist now requires "Raw transcript/notes filed" verification.
- **Core Behavior #8** - Added "Source Preservation" to CLAUDE.md core behaviors, explaining the provenance chain and file routing.
- **File locations table** - Added "Filed documents" row pointing to `~/.claudia/files/` (entity-routed).
- **Commands table** - Added `/file-document` command.

### Why This Matters

Before: Claudia would extract facts into person files and memory, but the full transcript lived only in conversation context (which compresses away).

After: Raw sources are filed first, creating a provenance chain. Ask "where did you learn that?" and she can cite the exact document, email, or transcript.

---

## 1.18.1 (2026-02-03)

### Fixed

- **PowerShell 5.1 compatibility** - Fixed parse errors in both visualizer and gateway Windows installers. PowerShell 5.1 (default on Windows 10) had issues with here-strings containing code structures, Unicode characters in interpolated strings, and the `&&` operator. All installers now use string arrays, explicit concatenation, and ASCII-safe symbols.

---

## 1.18.0 (2026-02-03)

### Brain Visualizer: Real-Time Settings & Smart Navigation

Design panel settings now update the visualization instantly. No more refreshing the window to see changes take effect.

### Added

- **Live force simulation updates** - Adjusting charge, distance, or decay in the design panel immediately reheats the simulation and applies new forces. Watch nodes reorganize in real-time.
- **Live glow sprite updates** - Glow size and intensity sliders update existing node halos without recreating meshes.
- **Live link curvature updates** - Changing link curvature, opacity, or radius triggers immediate geometry rebuild.
- **Live emissive intensity** - Node emissive settings apply instantly to all visible nodes.
- **Reload hint toasts** - Settings that truly require reload (particle count, star count) now show a brief toast notification explaining why.
- **Smart H-key navigation** - When the design panel is open and a node is selected, pressing `H` jumps to the relevant settings section:
  - Entity nodes → Opens "Nodes" folder + "Entity Colors"
  - Memory nodes → Opens "Nodes" folder + "Memory Colors"
  - Pattern nodes → Opens "Nodes" folder
  - Scrolls and briefly highlights the target folder

### Technical Details

New exports in visualizer modules:
- `graph.js`: `updateSimulationForces()` - Updates running d3-force simulation
- `nodes.js`: `refreshNodeGlows()`, `refreshNodeEmissive()` - Update sprite scales and material properties
- `design-panel.js`: `setSelectedNodeCallback()`, `focusSectionForNode()` - Smart navigation system

---

## 1.17.2 (2026-02-03)

### Fixed

- **Windows visualizer installer** - Fixed PowerShell parse errors on Windows caused by parentheses being interpreted as subexpressions when inside interpolated strings. Changed tree view output to use string concatenation.
- **Streamlined install flow** - Gateway now auto-installs like the visualizer (no prompt). Installation only asks one question: whether to set up the memory system. Memory -> Visualizer -> Gateway all install in sequence.

---

## 1.17.1 (2026-02-03)

### Docs

- Added upgrade instructions for existing users to install the brain visualizer

---

## 1.17.0 (2026-02-03)

### Brain Visualizer Auto-Install

The 3D memory visualizer now installs automatically when you set up the memory system. No more manual file copying.

### Added

- **Visualizer auto-install** - When you say "yes" to memory system setup, the brain visualizer is automatically installed to `~/.claudia/visualizer/` and `~/.claudia/visualizer-threejs/`. Just run `/brain` and it works.
- **Cross-platform installers** - `visualizer/scripts/install.sh` (macOS/Linux) and `visualizer/scripts/install.ps1` (Windows) handle Node.js version checks, file copying, npm install, and launcher script creation.
- **Launcher script** - `~/.claudia/bin/brain` starts both the API backend (port 3849) and Three.js frontend (port 5173/5174), then opens your browser.

### Changed

- **README updates** - Fixed license badge (was Apache 2.0, now PolyForm Noncommercial). Added Demo Mode section with clear instructions. Added `/brain` command to the command table.
- **Installer flow** - The visualizer now chains after memory daemon setup: memory -> visualizer (auto) -> gateway (if requested) -> finish.

### How It Works

After running `npx get-claudia` and saying "yes" to memory setup:
1. Memory daemon installs (Python venv, Ollama models, SQLite database)
2. Visualizer auto-installs (copies files, runs npm install)
3. Gateway setup runs (if you said yes)
4. You can immediately use `/brain` to see your memory graph

---

## 1.16.0 (2026-02-03)

### License Change: PolyForm Noncommercial

Claudia is now licensed under [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/).

### What This Means

**Free for:**
- Personal use
- Research and experimentation
- Education and learning
- Hobby projects
- Nonprofits, charities, and government

**Requires permission:**
- Commercial use (contact mail@kbanc.com or open a GitHub issue)

### Why

This license protects the project while keeping it freely available for the community. You can view, use, modify, and share Claudia for any noncommercial purpose. Commercial use requires a separate license.

### Changed

- LICENSE file updated to PolyForm Noncommercial 1.0.0
- package.json license field updated
- README updated with license details
- template-v2/LICENSE and NOTICE updated

---

## 1.15.1 (2026-02-03)

### MCP Template Cleanup

Cleaner MCP server config for new users. Removed redundant servers, clearer setup instructions.

### Changed

- **Removed redundant MCP servers from template** -- `filesystem`, `brave-search`, `fetch`, `web-search` removed (Claude Code has native tools for all of these)
- **Kept useful servers** -- `claudia-memory`, `gmail`, `google-calendar` remain as templates
- **Clearer setup instructions** -- Each server has `_setup` field with one-line instructions
- **Security note** -- Explicitly states OAuth tokens are stored locally, never shared

### Why

Claude Code now has built-in `WebSearch`, `WebFetch`, and file tools (`Read`, `Write`, `Edit`). The old MCP servers for these functions were redundant and the `filesystem` server with placeholder path caused startup failures.

---

## 1.15.0 (2026-02-03)

### Database Switcher

View all Claudia databases, see what's in each, and switch between them.

### Added

- **`/databases` command** -- List all Claudia databases with stats (size, people, memories, last activity). Shows which workspace each database belongs to.
- **`/databases use <hash>`** -- Switch to a different database by modifying `.mcp.json`. Requires Claude restart to take effect.
- **`/databases info <hash>`** -- Deep dive into a specific database: entity breakdown, memory types, relationship count, top entities.
- **`/databases delete <hash>`** -- Delete a database with explicit confirmation. Cannot delete the currently active database.
- **`_meta` table** -- Databases now store their workspace path internally, making hash-based filenames reversible. Legacy databases show "Unknown (legacy)".
- **`CLAUDIA_DB_OVERRIDE` env var** -- Force a specific database path, bypassing project hash detection. Used by `/databases use`.

### Technical

- Schema migration v9 adds `_meta` table
- `CLAUDIA_WORKSPACE_PATH` env var set by daemon on startup
- Config priority: `CLAUDIA_DB_OVERRIDE` > `CLAUDIA_DEMO_MODE` > project hash > default

---

## 1.14.1 (2026-02-03)

### Database Selector

Switch between different Claudia databases directly from the visualizer UI.

### Added

- **Database dropdown** in the HUD bar to select which database to visualize
- **`GET /api/databases`** endpoint lists all available databases
- **`POST /api/database/switch`** endpoint switches to a different database
- Graph automatically reloads when switching databases

---

## 1.14.0 (2026-02-03)

### Brain Visualizer

Full 3D memory visualization with design controls and per-project database isolation.

### Added

- **Three.js Brain Visualizer** -- Real-time 3D force-directed graph of your memory system. Entities, relationships, memories, and patterns rendered with bloom, particles, and ambient effects.
- **Design control panel** -- Press `H` to open live GUI. Adjust colors, bloom, fog, animations, particles, and more in real-time. Export/import configs as JSON.
- **`/brain` command** -- Launch the visualizer from any Claudia session. Auto-detects and starts API backend + frontend.
- **Per-project database isolation** -- Visualizer uses `--project-dir` to select the correct database via SHA256 path hashing. Each Claudia installation sees only its own memories.
- **API backend** (`visualizer/`) -- Express server on port 3849. Endpoints: `/api/graph`, `/api/stats`, `/api/entity/:id`, `/api/timeline`, `/api/events` (SSE).
- **~300 config parameters** -- Full control over entity colors, memory colors, link colors, lighting, nodes, links, particles, animations, bloom, fog, ambient particles, starfield, nebula, camera, and simulation forces.

### Architecture

```
Port 3848: Memory daemon (MCP, embeddings)
Port 3849: API server (graph data from SQLite)
Port 5173: Vite frontend (Three.js visualization)
```

### Stats

- 2 new directories: `visualizer/`, `visualizer-threejs/`
- 25 new files
- ~10,000 lines added

---

## 1.13.1 (2026-02-03)

### Demo Mode

Safe, isolated demo installations for testing and demos.

### Added

- **`--demo` installer flag** -- `npx get-claudia my-demo --demo` creates an installation pre-populated with realistic fake data. Perfect for testing features or giving demos without using real data.
- **Demo database isolation** -- Demo data lives in `~/.claudia/demo/`, completely separate from real data in `~/.claudia/memory/`. Safety checks prevent accidental writes to production data.
- **`seed_demo.py` script** -- Manually seed demo data with 12 people, 3 organizations, 3 projects, relationships with varying dormancy, commitments (some overdue), patterns, predictions, and past session episodes.
- **`CLAUDIA_DEMO_MODE` env var** -- Set to `1` to use demo database. The installer configures this automatically with `--demo`.

---

## 1.13.0 (2026-02-02)

### Relationship Intelligence

Claudia now maps your network. Graph analytics, attribute inference, proactive relationship surfacing.

### Added

- **`/map-connections` command** -- Scans `people/`, `projects/`, `context/` directories. Extracts entities and relationships with confidence levels (0.9 explicit, 0.6 co-mentioned, 0.3 inferred). Reports new entities, new relationships, and inferred connections.
- **Attribute-based inference** -- Extracts structured attributes from text: geography (city/state/country), industry keywords, role/title, community memberships (YPO, EO, clubs, associations). `infer_connections()` suggests relationships between people with shared attributes.
- **`memory.project_network`** -- New MCP tool returns all people and organizations connected to a project, plus their 1-hop extended network.
- **`memory.find_path`** -- BFS pathfinding between any two entities. Returns the shortest relationship chain.
- **`memory.network_hubs`** -- Identifies most-connected entities in your network. Configurable minimum connection threshold.
- **`memory.dormant_relationships`** -- Surfaces relationships that need attention based on days since last memory. Configurable dormancy threshold and minimum strength.
- **Relationship health dashboard** -- Morning brief now includes 30/60/90-day dormancy buckets, introduction opportunities (people with shared attributes who aren't connected), and forming clusters (groups frequently mentioned together).
- **Introduction opportunity detection** -- Pattern detector identifies pairs of people who share geography+industry, community membership, or company but have no explicit relationship.
- **Cluster forming alerts** -- Detects when 3+ people are frequently mentioned together, suggesting a project or team may be forming.

### Changed

- **`morning-brief.md`** -- Now documents the relationship health dashboard section showing dormant relationships, introduction opportunities, and forming clusters.

### Stats

- 23 new tests for graph analytics
- 138 total tests passing
- 2,177 lines added

---

## 1.12.0 (2026-02-02)

### The Intelligence Upgrade

Smarter folder structure. Relationship history. Better recall scoring. Overnight LLM processing.

### Added

- **Entity-aware document folders** -- Documents linked to known entities now route to `people/`, `clients/`, or `projects/` folders by entity type and canonical name. Unlinked files fall back to `general/`. Deterministic path construction from entity metadata.
- **Bi-temporal relationships** -- Relationships gain `valid_at` and `invalid_at` columns (schema v8). `supersedes=True` on `memory.relate` invalidates the old relationship instead of deleting it. `memory.about` filters to current relationships by default; `include_historical=True` shows the full timeline.
- **Reciprocal Rank Fusion (RRF)** -- Replaces fixed weighted-sum scoring with rank-based fusion across 5 independent signals: vector similarity, FTS5, importance, recency, and graph proximity. Eliminates scale sensitivity between signals. Configurable via `rrf_k` and `enable_rrf`.
- **Graph proximity scoring** -- Memories linked to entities mentioned in the query get a recall boost: 1.0 for direct entity matches, 0.7 for one-hop graph neighbors, 0.4 for two-hop. Uses existing `_expand_graph()` recursive CTE.
- **Sleep-time LLM consolidation** -- Optional daily 3:30 AM job rewrites high-importance memories for clarity (preserving originals in metadata) and generates richer predictions using the local Ollama model. Gracefully skips when no LLM is available.

### Changed

- **`_build_relative_path()`** now prefixes unlinked files with `general/` to avoid collisions with entity folders. Existing files are unaffected (paths stored in DB are absolute).
- **`_expand_graph()`** now includes entity `id` in returned dicts for downstream use by graph proximity scoring.
- **5 new config fields**: `rrf_k`, `enable_rrf`, `graph_proximity_enabled`, `llm_consolidation_batch_size`, `enable_llm_consolidation`.

---

## 1.11.0 (2026-02-02)

### The Provenance Release

Every claim traces to a source. Every document links to people and projects. Auditable, verifiable, robust.

### Added

- **Document storage** -- Store transcripts, emails, and files on disk with automatic registration in SQLite. Deduplication by file hash. Lifecycle management (active, dormant, archived, purged). Three new MCP tools: `memory.file`, `memory.documents`, `memory.purge`.
- **Provenance tracking** -- New `memory_sources` table links memories to their source documents. `memory.trace` now includes document references. `save_source_material()` auto-registers in the documents table.
- **Graph traversal** -- `memory.about` responses now include a `connected` field showing related entities via recursive CTE traversal of the relationship graph. Cycle prevention, weak-edge pruning, configurable depth.
- **Compact session briefing** -- New `memory.briefing` MCP tool returns ~500 token aggregate summary (commitment counts, cooling relationships, unread messages, top prediction, recent activity). Replaces full file loading at session startup.
- **`/memory-audit` command** -- Full system audit or entity-specific deep dive. Shows memory counts, top people/projects, provenance chains, linked documents.
- **Installer "What's New" section** -- Fresh installs and upgrades now show a brief feature summary in yellow/cyan matching the Claudia banner.

### Fixed

- **FTS5 on fresh installs** -- FTS5 virtual table was only created in migration v4, but fresh databases skipped it. Added post-migration setup block that creates FTS5 regardless of migration path. All 7 pre-existing FTS5 test failures now pass.
- **FTS5 test skip markers** -- Tests gracefully skip when FTS5 module is unavailable in the SQLite build.

### Changed

- **`capture-meeting.md`** -- New step stores raw transcript via `memory.file` and links to extracted memories.
- **`meeting-prep.md`** -- Queries `memory.documents` for recent files involving the meeting person.
- **`memory-manager.md`** -- Session startup uses `memory.briefing` instead of `memory.predictions`, with fallback.

---

## 1.10.1 (2026-02-01)

### Fixed

- **PATH auto-configuration** -- The installer now auto-appends `~/.claudia/bin` to your shell rc file (zshrc/bashrc) and updates the current session, so `claudia-gateway` works immediately. Windows installer auto-adds to user PATH via registry.
- **Interactive setup guide** -- After install, the gateway offers a step-by-step walkthrough for setting up Telegram or Slack. Walks you through @BotFather, token collection, user ID lookup, and writes everything to `gateway.json` automatically. No more guessing.
- **`bin/index.js` next steps** -- Now shows the full `~/.claudia/bin/claudia-gateway` path as fallback if the short command isn't found.

---

## 1.10.0 (2026-02-01)

### Gateway: Local Model Support (Zero API Key)

The gateway now works without an Anthropic API key by using local Ollama models. Users who picked a model during memory daemon setup (qwen3, smollm3, llama3.2) can use the same model for chat. Provider auto-detects at startup: Anthropic if `ANTHROPIC_API_KEY` is set, Ollama otherwise.

### Added

- **Ollama provider in bridge** - New `_callOllama()` method using `/api/chat` with multi-turn conversation support, 0.7 temperature for chat, 60s timeout, and 2-retry logic matching the memory daemon pattern.
- **Provider auto-detection** - `start()` tries Anthropic first (dynamic import), falls back to Ollama (pings `/api/tags`), throws a helpful error if neither is available.
- **Shared config reading** - Gateway reads `~/.claudia/config.json` `language_model` field (written by memory daemon installer) to auto-detect which Ollama model to use.
- **Installer model menu** - Both `install.sh` and `install.ps1` now offer to pull a local model if Ollama is installed and no model is configured. Same menu as memory daemon: qwen3:4b, smollm3:3b, llama3.2:3b, or skip.
- **`ollama.host` and `ollama.model`** config fields with `OLLAMA_HOST` env override.
- **Local-only data flow diagram** in README showing the fully offline path (phone to gateway to Ollama, no cloud).

### Changed

- **Anthropic SDK is now dynamically imported** - The gateway no longer crashes at startup if `@anthropic-ai/sdk` isn't installed but user only uses Ollama.
- **Installer security checklist** adapts based on whether a local model was detected (skips the "Set ANTHROPIC_API_KEY" step).
- **`getStatus()`** returns `provider` and `providerReady` instead of `anthropicReady`.

---

## 1.9.4 (2026-02-01)

### Messaging Gateway: Talk to Claudia from Your Phone

The gateway lets you message Claudia from Telegram or Slack. Messages flow through the gateway running on your machine to the Anthropic API, with full access to Claudia's memory system. Everything stays local except the API call itself.

### Added

- **Gateway bundled in `npx get-claudia`** - The installer now asks whether to set up the messaging gateway after the memory system question. Gateway source, install scripts, and CLI wrapper are all included in the NPM package.
- **`gateway/scripts/install.sh`** - macOS/Linux installer: checks Node 18+, copies source to `~/.claudia/gateway/`, runs `npm install`, generates config, creates CLI wrapper and LaunchAgent/systemd unit (disabled by default, requires API keys first).
- **`gateway/scripts/install.ps1`** - Windows PowerShell equivalent using Task Scheduler.
- **`gateway/README.md`** - Setup guides for Telegram and Slack, full config reference, security documentation (deny-by-default allowlist, API key stripping, data flow diagram), CLI commands, proactive notifications, and troubleshooting.
- **`.npmignore`** - Keeps `node_modules/` and `package-lock.json` out of the NPM tarball.

### Changed

- **`bin/index.js`** - Both setup questions (memory + gateway) are now asked upfront before spawning any child processes. Gateway setup chains after memory via continuation-passing. `showNextSteps` displays gateway-specific instructions when applicable.
- **`package.json`** - Added `gateway` to the `files` array.

### Security Model

- **Deny-by-default**: No `allowedUsers` entries means nobody can message your Claudia
- **Secrets stay in env vars**: `saveConfig` strips all API keys/tokens before writing `gateway.json` to disk
- **Service disabled on install**: LaunchAgent/systemd/Task Scheduler entries are created but not enabled, so the gateway won't start until you've configured credentials

---

## 1.9.3 (2026-01-31)

### Fixed

- **Upgrade crash on memory migration** - Existing databases failed with `no such column: verification_status` during upgrade because `schema.sql` tried to create an index on a migration-added column before migrations ran. The schema initializer now tolerates missing-column errors, letting migrations add the columns first.

---

## 1.9.1 (2026-01-31)

### Concierge: Context-Aware Web Research

Claudia can now research topics using whatever web tools are available, connect findings to her memory graph, and track when information gets stale.

### Added

- **Concierge skill** (`concierge.md`) - Tool-agnostic research behavior that detects available tools (built-in WebFetch/WebSearch, free MCP servers, or paid options) and adapts. Checks memory before searching, builds context-aware queries using entity knowledge, and stores key findings with source provenance.
- **`/research [topic]` command** - Deep research workflow supporting factual, exploratory, comparative, and competitive research. Synthesizes across multiple sources and connects findings to known relationships and projects.
- **Free MCP server recommendations** - `.mcp.json.example` now includes `@anthropics/mcp-server-fetch` and `@mcp-server/web-search` (DuckDuckGo) as optional no-API-key power-ups alongside the existing Brave Search option.
- **Updated connector-discovery** - Search & Research section expanded to show the full spectrum from free built-in tools to paid options with plain-language guidance.

### How It Works

Claudia checks memory first (avoiding redundant fetches), uses whatever tools are available, and stores key facts with `source:web:` provenance. On future queries, she surfaces previously researched information and flags when it might be stale. No new dependencies, no API keys required for base functionality.

---

## 1.9.0 (2026-01-31)

### Hybrid Search, Session Context, Compact Recall, and Anticipatory Memory

Four upgrades to the memory system that make Claudia significantly smarter at finding what matters and surfacing it at the right time.

### Added

- **FTS5 hybrid search** - Memory recall now combines vector similarity with full-text search (BM25 via SQLite FTS5 with porter stemming). Exact keyword matches no longer slip through the cracks. Four-factor scoring: vector (0.50), importance (0.25), FTS (0.15), recency (0.10).
- **`memory.session_context` tool** - Single MCP call at session start loads everything: unsummarized sessions needing catch-up, recent memories (48h), active predictions, commitments (7d), and episode narratives. Three token budget tiers (brief/normal/full). Replaces the previous pattern of 3+ separate tool calls.
- **Compact recall mode** - `memory.recall` now accepts `compact=true` for lightweight browsing (80-char snippets, top 3 entities) and `ids=[...]` for fetching full content by ID. Enables browse-then-fetch workflows that save tokens.
- **`memory.morning_context` tool** - Curated morning digest in one call: stale commitments, cooling relationships, cross-entity connections, predictions, and recent activity (72h). Powers the `/morning-brief` command.
- **Cross-entity pattern detection** - Consolidation now detects person entities that co-occur in 2+ memories without an explicit relationship, surfacing hidden connections ("Alice and Bob appear together in 4 memories. Are they connected?").
- **Schema migration v4** - FTS5 virtual table with auto-sync triggers (insert/update/delete) and backfill of existing memories. Fully backward compatible.

### Changed

- **Session Start Protocol** added to CLAUDE.md: call `memory.session_context` first, catch up unsummarized sessions, then greet with context.
- **hooks.json** updated: `context_load` step replaces individual memory.recall and memory.predictions calls.
- **morning-brief.md** updated to use `memory.morning_context` as primary data source.
- **Search weights** rebalanced: vector 0.60 -> 0.50, importance 0.30 -> 0.25, recency 0.10 unchanged, FTS 0.15 (new).
- **`_keyword_search` fallback** now tries FTS5 MATCH before falling back to LIKE.

### Technical Details

- FTS5 triggers created in migration code (not schema.sql) due to the line-based SQL parser not supporting internal semicolons in trigger bodies.
- All new features degrade gracefully: FTS5 catches exceptions and returns empty dict on old DBs, session_context returns "no context" on empty DBs.
- No new Python dependencies. FTS5 is built into SQLite since 3.9.0.
- 16 new unit tests across two test files (test_fts_hybrid.py, test_session_context.py).

---

## 1.8.1 (2026-01-30)

### Memory Efficiency, Fallback Guidance, and Visual Formatting

Template refinements for smarter memory usage and scannable structured output.

### Added

- **Episodic-memory plugin fallback** - Memory manager now detects whether the `episodic-memory` Claude Code plugin is installed and guides gracefully when it's missing. Covers all four availability states (daemon+plugin, daemon-only, plugin-only, neither).
- **Memory efficiency rules** - New section preventing redundant memory calls: session-local dedup, recall/about overlap avoidance, file-vs-memory rule, batch preference, skip-fresh-context.
- **Output formatting principle** (#11 in claudia-principles) - Structured output uses emoji section headers, bold titles, and trailing horizontal rules for visual distinction from regular conversation.
- **Emoji formatting** for morning-brief, capture-meeting, and weekly-review output templates.
- **Trailing `---`** on risk-surfacer alert blocks.

---

## 1.8.0 (2026-01-30)

### Cognitive Tools: Local LLM Extraction

Claudia can now use a local language model to extract structured data from meeting transcripts, emails, and documents without sending anything to an external API. Optional during install, zero-cost, fully private.

### Added

- **`cognitive.ingest` MCP tool** - Extract entities, facts, commitments, action items, and relationships from raw text using a local Ollama language model. Supports four source types: meeting, email, document, and general.
- **Language model service** (`language_model.py`) - Ollama generation service parallel to the existing embedding service. Same architecture: HTTP client, retry logic, async/sync variants, graceful degradation.
- **Installer model selection** - During memory system install, users choose a local model: Qwen3-4B (recommended), SmolLM3-3B, Llama 3.2-3B, or skip. Choice is persisted to `~/.claudia/config.json`.
- **Configurable via `language_model`** - Set to `""` in config to disable cognitive tools entirely. Claudia works identically to previous versions when no model is installed.

### How It Works

When the user pastes a meeting transcript or email, Claude calls `cognitive.ingest` instead of parsing the text itself. The local model extracts structured JSON (entities, facts, commitments, relationships). Claude reviews the structured output and applies judgment, saving tokens and time.

If no language model is available, the tool returns the raw text and Claude handles extraction directly (previous behavior).

### Extraction Prompts

Four specialized prompt templates optimized for structured JSON output:
- **Meeting** - Participants, decisions, action items, commitments, sentiment
- **Email** - Sender, recipients, action items, tone, summary
- **Document** - Title, key points, entities, relationships
- **General** - Facts, commitments, action items, entities

---

## 1.7.0 (2026-01-30)

### Episodic Memory Provenance

Memories now carry source provenance, so Claudia can trace any fact back to the original email, transcript, document, or conversation it came from.

### Added

- **Source tracing on recall** - Every memory result now includes `source`, `source_id`, and `source_context` fields identifying where the information originated.
- **`memory.trace` MCP tool** - On-demand provenance reconstruction. Returns the full chain: memory, source episode narrative, archived conversation turns, and source material file preview. Zero cost until invoked.
- **Source material storage** - `memory.remember`, `memory.end_session`, and `memory.batch` accept `source_material` to save raw text (emails, transcripts, docs) to `~/.claudia/memory/sources/` as human-readable markdown files.
- **Archived turn buffer** - Session conversation turns are now archived instead of deleted after summarization, preserving the raw exchange for later tracing.
- **Schema migration v3** - Adds `source_context` to memories table and `is_archived` to turn_buffer. Fully backward compatible with existing databases.

---

## 1.6.0 (2026-01-29)

### In-Place Upgrades

Running `npx get-claudia` in an existing Claudia directory now upgrades framework files (skills, commands, rules, hooks, identity) while preserving your data (context/, people/, projects/). Previously, the installer refused to run if Claudia files already existed, leaving existing users with no upgrade path.

### Added

- **Upgrade support** - Installer detects existing Claudia instances and selectively updates `.claude/` and `CLAUDE.md` without touching user data. Works for users on any previous version (v1.0+).
- **`memory.batch` MCP tool** - Execute entity creation, memory storage, and relationship linking in a single call. Reduces mid-session memory operations from 3-5 tool calls to 1.
- **Behavioral optimizations** in memory-manager skill:
  - Silent processing with structured Session Update output format
  - File write efficiency (wait for complete data before writing)
  - Information lookup priority chain (memory.about > file read > ask user)
  - Lazy startup (2 calls max instead of 5+ file reads)

### Upgrade Instructions

Existing users on any version:
```bash
cd your-claudia-directory
npx get-claudia .
```

---

## 1.5.2 (2026-01-29)

### Fixed

- **Windows** - Ollama installer now runs silently (`/S` flag) after the user confirms. Previously it opened the GUI installer requiring manual clicks.

---

## 1.5.1 (2026-01-29)

### Automatic Ollama Installation

The installer now offers to install Ollama automatically on all platforms when it isn't already present.

### Changed

- **macOS/Linux** - Tries Homebrew first (macOS), then falls back to the official Ollama install script (`curl -fsSL https://ollama.com/install.sh | sh`). Works on both macOS and Linux now (previously macOS-only).
- **Windows** - Tries `winget install Ollama.Ollama` first, then falls back to downloading and running `OllamaSetup.exe` directly. PATH is refreshed automatically so the installer can continue without restarting the terminal.

---

## 1.5.0 (2026-01-29)

### Windows Support

Claudia's memory system now installs and runs on Windows.

### Added

- **Windows installer** (`install.ps1`) - Full 8-step PowerShell installer matching macOS/Linux functionality. Uses Windows Task Scheduler for auto-start instead of LaunchAgent/systemd.
- **Windows diagnostics** (`diagnose.ps1`) - 11 diagnostic checks for troubleshooting on Windows.
- **Platform detection** - `bin/index.js` detects Windows and spawns PowerShell with the correct full path (fixes Git Bash PATH issues). Uses Windows venv paths for `.mcp.json`.

### Tested

- Windows 10, Python 3.12, PowerShell 5.1

---

## 1.4.1 (2026-01-28)

### Fixed

- **spaCy crash on Python 3.14** - The entity extractor only caught `ImportError` when spaCy failed to load, but Python 3.14 triggers an internal `ConfigError` from Pydantic v1 instead. Broadened the exception handler so the daemon falls back to regex-based entity extraction gracefully instead of crashing on startup.

---

## 1.4.0 (2026-01-28)

### Per-Turn Memory Capture & Session Narratives

Claudia now captures every meaningful conversation turn and generates rich narrative summaries at session end. If a session ends abruptly, the next session catches up automatically.

### Added

- **Turn buffering** - `memory.buffer_turn` stores raw conversation turns without expensive embedding generation. Lightweight, crash-safe via SQLite WAL mode.
- **Session narratives** - `memory.end_session` lets Claude write a free-form narrative that enhances structured data with tone, emotional context, unresolved threads, reasons behind decisions, and half-formed ideas.
- **Orphan session catch-up** - `memory.unsummarized` detects sessions that ended without a summary. Next session start generates retroactive summaries from buffered turns.
- **Episode semantic search** - `recall_episodes()` searches session narratives by vector similarity, giving Claude access to the texture of past conversations.
- **Database migration system** - Version-tracked schema migrations in `database.py` so existing databases upgrade automatically.
- **Architecture documentation** - `ARCHITECTURE.md` with mermaid diagrams showing memory pipeline, data flow, and system components.

### Changed

- **CLAUDE.md** - Elevated memory system as core architecture alongside the template layer. Added development workflow for the memory daemon.
- **Memory manager skill** - Rewritten to use per-turn buffering instead of auto-remembering. Added detailed guidance on writing session narratives that enhance rather than compress information.
- **Session hooks** - Updated to include catch-up behavior at session start and narrative summarization at session end.
- **`recall_about()`** - Now includes recent session narratives mentioning the entity.

### Schema Changes

- `episodes` table: added `narrative`, `turn_count`, `is_summarized` columns
- New `turn_buffer` table for raw conversation turn storage
- New `episode_embeddings` virtual table for narrative semantic search
- Migration v2 applied automatically on existing databases

### Rollback

Tag `pre-memory-capture` on commit `834fb5e` (v1.3.2) provides a clean rollback point.

---

## 1.3.2 (2026-01-28)

### Fixed

- **MCP schema validation** - Moved `_comment` and `_comment2` out of `mcpServers` in `.mcp.json.example`. Claude Code's validator rejected these string values as invalid server definitions, causing parse errors when users renamed the file to `.mcp.json`.

---

## 1.3.1 (2026-01-28)

### Per-Project Memory Isolation

Each Claudia installation now gets its own isolated memory database, so memories from work projects don't mix with personal projects.

### Added

- **--project-dir argument** - Memory daemon accepts project directory for database isolation
- **Automatic isolation** - `.mcp.json.example` uses `${workspaceFolder}` to auto-isolate per project
- **Deterministic hashing** - Same project directory always maps to same database file

### How It Works

When Claude Code launches the MCP server, it passes the workspace folder. The daemon hashes the path to create a unique database:

```
~/.claudia/memory/
├── claudia.db          ← Global fallback (backward compatible)
├── a1b2c3d4.db         ← Project A's memories
├── e5f6g7h8.db         ← Project B's memories
```

### Backward Compatible

Existing installations without `--project-dir` continue using the global database.

---

## 1.3.0 (2026-01-28)

### Business Operating System

Claudia now generates business-grade folder structures for all archetypes, with depth that users choose during onboarding.

### Added

- **Business Depth Selection** - During onboarding, users choose between Full, Starter, or Minimal structure
- **Universal Business Modules** - Pipeline tracking, financial management, accountability, templates, and insights available to all archetypes
- **Deep Per-Client Structure** (Consultant) - Milestone plans, stakeholder maps, blockers, decision logs, wins documentation
- **Enhanced Archetypes** - All 5 archetypes upgraded with business depth variations
- **Structure Evolution Skill** - Claudia proactively suggests structural improvements as she observes your workflow
- **4 New Commands**:
  - `/pipeline-review` - Review active pipeline, deals, capacity
  - `/financial-snapshot` - Revenue, expenses, invoicing status
  - `/client-health` - Health check across all clients (Consultant/Solo)
  - `/accountability-check` - Surface commitments, overdue items, waiting-on

### Philosophy

Structure grows organically from actual needs. Users who want minimal setup get minimal setup. Power users get full business operating systems. Claudia watches for friction and offers targeted additions over time.

---

## 1.2.5 (2026-01-28)

### Memory System: Fully Automatic Installation

The memory system now works automatically after install with no manual intervention required.

### Fixed

- **sqlite-vec on Python 3.13+** - Now tries the Python package first before `enable_load_extension()`, which isn't available on Python 3.13
- **Ollama auto-start on macOS** - Creates LaunchAgent so Ollama starts on boot
- **Model pull reliability** - Ensures Ollama is running before attempting to pull the embedding model
- **Boot resilience** - Daemon waits up to 10 seconds for Ollama to start after reboot

### Added

- Comprehensive verification step at end of install showing status of all services
- 5 new checks in `diagnose.sh`: Ollama running, LaunchAgent configured, embedding model, sqlite-vec working
- Retry logic in embeddings service (5 attempts, 2s delay) for Ollama connection

---

## 1.0.0 (2026-01-23) - get-claudia

### Package Rename

The npm package has been renamed from `create-claudia` to `get-claudia` for a cleaner install experience:

```bash
npx get-claudia
```

### README Overhaul

- Character-authentic README that reflects Claudia's personality
- ASCII banner header
- "Busy work is my job. Judgment is yours." tagline
- Clear comparison table (Traditional AI vs Claudia)
- Sample onboarding conversation showing her personality
- 5 archetype icons (Consultant, Executive, Founder, Solo, Creator)
- "Adapt and create" philosophy section
- Created by Kamil Banc attribution

### Includes all features from 2.0.0-beta.1

---

## 2.0.0-beta.1 (2026-01-23)

### Complete Rebuild: Adaptive, Learning AI Executive Assistant

This is a major release that transforms Claudia from a static template into an adaptive, learning system.

### Added

**Conversational Onboarding**
- Claudia now greets new users and learns about them through natural conversation
- Detects user archetype (Consultant, Executive, Founder, Solo, Creator)
- Generates personalized folder structure based on user's work style
- Creates archetype-specific commands tailored to user's needs

**Skills System (8 Proactive Capabilities)**
- `onboarding.md` - First-run discovery flow
- `structure-generator.md` - Creates personalized folders and files
- `relationship-tracker.md` - Surfaces context when people are mentioned
- `commitment-detector.md` - Automatically catches promises in conversations
- `pattern-recognizer.md` - Notices trends over time
- `risk-surfacer.md` - Proactively warns about issues
- `capability-suggester.md` - Suggests new commands based on usage patterns
- `memory-manager.md` - Handles cross-session persistence

**5 Archetype Templates**
- Consultant/Advisor - clients, pipeline, proposals
- Executive/Manager - direct reports, initiatives, board
- Founder/Entrepreneur - investors, team, product, fundraising
- Solo Professional - clients, projects, finances
- Content Creator - content calendar, audience, collaborations

**Memory System**
- `context/learnings.md` - Persists preferences and patterns across sessions
- Session start/end hooks for loading and saving context
- Claudia remembers your preferences, successful approaches, and areas to watch

**Self-Evolution**
- Claudia can suggest new commands when she notices repeated behaviors
- Proposes structure changes when new categories emerge
- Learns what works and adapts over time

### Changed

**Ultra-Minimal Seed**
- Fresh install is now just CLAUDE.md and .claude/ folder
- Everything else is generated during onboarding
- Much smaller initial footprint

**9 Base Commands (All Users)**
- `/morning-brief` - Daily priorities and warnings
- `/meeting-prep` - Pre-meeting briefing
- `/capture-meeting` - Process meeting notes
- `/what-am-i-missing` - Surface risks and blind spots
- `/weekly-review` - Guided weekly reflection
- `/new-person` - Create relationship file
- `/follow-up-draft` - Post-meeting emails
- `/draft-reply` - Email response drafts
- `/summarize-doc` - Document summaries

**Enhanced CLAUDE.md**
- Embedded onboarding behavior
- Skills documentation
- Memory system integration
- Clearer safety principles

### Removed
- Static folder structure (now generated dynamically)
- Pre-created template files (now created during onboarding)
- One-size-fits-all commands (now archetype-specific)

---

## 1.0.0 (2026-01-23)

### Initial Release

- Created `npx create-claudia` CLI package
- FIGlet ASCII banner in ANSI Shadow style (yellow)
- Copies complete Claudia template directory structure:
  - `CLAUDE.md` - Claudia's personality and capabilities
  - `.claude/commands/` - 17 built-in slash commands
  - `people/` - Relationship context files
  - `context/` - Commitments, patterns, waiting, outreach
  - `projects/` - Project templates
  - `tasks/` - Task blueprints for recurring work
  - `content/` - Content planning
  - `expansions/` - Optional capability extensions
- Error handling for existing directories
- Custom directory name support (`npx create-claudia my-name`)
- Apache 2.0 license
