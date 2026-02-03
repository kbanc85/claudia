# Changelog

All notable changes to Claudia will be documented in this file.

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
