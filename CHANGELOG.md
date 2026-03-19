# Changelog

All notable changes to Claudia will be documented in this file.

## 1.55.19 (2026-03-19)

### The Self-Healer

Bulletproof installer for non-technical users. Existing installs auto-fix on the next `npx get-claudia`.

- **Auto-rebuild Python 3.14 venvs** -- If your existing venv uses Python 3.14+ and a compatible Python (3.13/3.12/3.11) is available, the installer automatically rebuilds the venv. No user action needed.
- **Auto-install Python 3.12** -- On macOS with Homebrew, if only Python 3.14 exists, the installer runs `brew install python@3.12` automatically before creating the venv.
- **LaunchAgent verification** -- After registering the macOS LaunchAgent, the installer now verifies the standalone daemon is actually running via `launchctl list`. If not running, force-reloads the agent. On Linux, enables and starts the systemd user service. Fixes the silent failure where backups, consolidation, and decay never ran.
- **Clear degradation messaging** -- When falling back to Python 3.14+ (no compatible version available), the installer now shows a yellow warning explaining that spaCy is unavailable and entity extraction will use regex only.

## 1.55.18 (2026-03-19)

### Data Quality & Python Compatibility

Six fixes addressing two community discussions. All additive, no schema changes, no new pip dependencies.

- **Briefing counts now exclude invalidated records** -- The `memory.briefing` MCP tool was counting soft-deleted commitments (58 shown when 14 active). Added `AND invalidated_at IS NULL` to both commitment count queries and `AND deleted_at IS NULL` to the cooling relationships query. The first numbers users see at session start are now accurate. (Discussion #25)
- **Entity type inference from name keywords** -- New `_infer_entity_type()` function detects organizational keywords (Inc, LLC, Corp, University), project keywords (Project, Sprint, MVP), concept keywords (methodology, framework), and location keywords (Office, HQ) in entity names. "Acme Corp" now creates an organization entity, not a person. Only runs when creating new entities; explicit types and existing entities are never overridden. (Discussion #25)
- **Consolidation fuzzy name dedup** -- Added Method 3 to overnight dedup: SequenceMatcher fuzzy name comparison across same-type entity pairs. Catches typo variants like "Kris Krisko" vs "Kris Krisco" (>= 0.90 similarity) and prefix matches like "Sarah" vs "Sarah Johnson". Advisory only: stores candidates in predictions table for user review, never auto-merges. Runs even without sqlite-vec. (Discussion #25)
- **Wildcard entity search works** -- `memory.entities(query="*")` now returns all non-deleted entities instead of nothing. The `*` was being wrapped in `LIKE "%*%"`, matching the literal asterisk. Also added `AND deleted_at IS NULL` to all search paths. (Discussion #25)
- **Installer prefers Python < 3.14** -- Both `install.sh` and `bin/index.js` now try Python 3.13, 3.12, and 3.11 before falling back to 3.14+. Previously, systems with only 3.12 and 3.14 installed (no 3.13) would get a 3.14 venv, causing spaCy to fail with a Pydantic V1 ConfigError. The daemon still works on 3.14 (graceful degradation to regex-only extraction), but prefers < 3.14 when available. (Discussion #29)
- **Python version cap** -- `requires-python` in pyproject.toml now caps at `<3.14` until spaCy (blis wheels), pydantic-core (PyO3 ceiling), and numpy (cp314 wheels) ship 3.14 support.
- 706 tests pass, 0 regressions, 46 new tests across 4 new test files.

## 1.55.17 (2026-03-18)

### The Quiet Observer

Three features adapted from claude-mem research. All additive, no schema changes, no migrations, no new pip dependencies.

- **Privacy tag filtering** -- Content wrapped in `<private>...</private>` tags is stripped before storage. Applied at all three entry points: `remember_fact()`, `remember_message()`, and `buffer_turn()`. Case-insensitive, multiline, non-greedy. If stripping would produce empty content, the original is preserved. Users can now share sensitive context with Claudia while keeping specific details out of the database.
- **Session briefing injection** -- The SessionStart hook now also fetches `http://localhost:3848/briefing` (the daemon's existing HTTP endpoint) with a 3s timeout. When the daemon is running, the briefing data arrives in `additionalContext` before Claude's first response, eliminating the need for a separate `memory.briefing` MCP tool call. Graceful degradation when daemon is offline.
- **Passive tool capture** -- New PostToolUse hook writes tool invocations to `~/.claudia/observations.jsonl` (~1ms per write, file append only). The daemon polls this file every 30s and ingests only relevant observations. Relevance filter checks 4 signals: tool name (gmail, slack, telegram, Rube apps), Claudia file paths (context/, people/, workspaces/), known entity mentions, and commitment language. Configurable via 5 new fields in `config.json` (`observation_capture_enabled`, `observation_capture_all`, `observation_relevant_tools`, `observation_relevant_paths`, `observation_ingest_interval`). Pure code operations are captured but filtered out during ingestion unless they mention known people or contain commitment language.
- 660 tests pass, 0 regressions, 23 new tests across 2 new test files.

## 1.55.16 (2026-03-18)

### Reliability Fixes

Three fixes for issues surfaced from daemon logs. All backward-compatible, no schema changes.

- **Overnight jobs now fire after sleep** -- APScheduler's `BackgroundScheduler` now has `misfire_grace_time=14400` (4 hours) and `coalesce=True`. Previously, the default 1-second grace time meant every scheduled job (decay, backup, consolidation, vault sync) was silently skipped when a Mac slept through the 2am-3:15am window. Now jobs fire immediately on wake if missed within the last 4 hours, with multiple missed runs collapsed into one execution.
- **Reduced log noise from summary memories** -- The content length warning threshold was raised from 500 to 800 chars. Legitimate summary-type memories (550-850 chars) no longer trigger "Long content" warnings. Hard truncation at 1000 chars is unchanged.
- **Fuzzy entity dedup on write** -- `_ensure_entity()` and `_find_or_create_entity()` now perform a fuzzy pre-check (SequenceMatcher > 0.90) before creating new entities. Name variants like "Kris Krisko" vs "Kris Krisco" (ratio ~0.92) match the existing entity instead of creating a duplicate. Only compares entities of the same type, skips deleted entities.
- **Expanded STOP_WORDS** -- Added ~55 common English words that spaCy misidentifies as entities ("drawn", "overall", "recently", "several", etc.). Prevents ghost entities from cluttering the graph.
- **Person entities require 2+ words** -- Regex-extracted person entities must have at least two words (e.g., "First Last"). Single-word extractions like "Metal" or "Drawn" are rejected. spaCy-identified entities are unaffected.
- 637 tests pass, 0 regressions, 22 new tests across 4 new test files.

## 1.55.15 (2026-03-18)

- **Fix mixed-timezone datetime crash** -- The memory daemon could crash with `can't subtract offset-naive and offset-aware datetimes` when recall or consolidation queries hit records with timezone suffixes (e.g., `+00:00` from email or transcript timestamps). Added a shared `parse_naive()` utility that strips timezone info on parse, applied across 14 locations in 5 files (recall.py, consolidate.py, server.py, vault_sync.py, canvas_generator.py). Replaces the older `[:19]` string truncation workaround. 615 tests pass.
- **License updated to PolyForm Noncommercial 1.0.0** -- README, package.json, and ARCHITECTURE.md now reflect the license change from Apache 2.0 to PolyForm NC. Free for personal, research, educational, and nonprofit use. Commercial licensing available via mail@kbanc.com.

## 1.55.14 (2026-03-16)

- **LaunchAgent no longer bakes in --project-dir** -- The standalone background daemon now starts without a `--project-dir` argument. This forces a plist content change for all existing installs, which triggers an automatic LaunchAgent reload on next `claudia setup`, picking up the current Python daemon code. Previously, the plist could be identical across updates, leaving old daemon code running indefinitely even after `pip install --upgrade`.
- **Cleanup of orphaned empty hash databases** -- On each startup, if the database is already unified and empty hash-named DB files exist (created by stale old-code daemon processes), they are silently removed. Prevents phantom databases from accumulating in `~/.claudia/memory/`.
- **Root cause:** After the v1.55 consolidation, users whose LaunchAgent was running old pre-unified-DB code would see scheduled jobs (consolidation, backups, decay) operating against an empty `6af67351bcfa.db` while all real memories lived in `claudia.db`. Health check showed `schema_version: 0` and `-1` counts.

## 1.55.13 (2026-03-16)

- **Gmail & Calendar MCPs as standard options** -- The standalone `gmail` (`@gongrzhe/server-gmail-autoauth-mcp`) and `google-calendar` (`@gongrzhe/server-calendar-autoauth-mcp`) servers are now first-class options alongside workspace-mcp. Two paths for Google integration: Option A (lightweight, focused, fewer tools) and Option B (all-in-one workspace-mcp with Drive, Docs, Sheets, etc.). Both can coexist.
- **Auto-detect Gmail/Calendar credentials** -- The installer now checks `~/.gmail-mcp/` and `~/.calendar-mcp/` for existing OAuth credentials. If found, it automatically adds `gmail` and `google-calendar` entries to `.mcp.json`. No manual config needed.
- **Installer no longer removes standalone MCPs** -- Running `npx get-claudia google` (workspace-mcp setup) no longer deletes existing `gmail` or `google-calendar` entries. Both integration paths coexist safely.
- **Completion message shows Google MCPs** -- The installer now lists detected Gmail and Calendar servers in the MCP config summary line.
- **Updated docs** -- CLAUDE.md and .mcp.json.example files document both Google integration paths with setup instructions for each.

## 1.55.12 (2026-03-15)

- **Feedback skill** -- New `/feedback` command lets users share bugs, ideas, or suggestions. Claudia collects system context (version, OS, memory count, daemon health), builds a pre-filled GitHub Discussion URL, and opens it in the browser. The user reviews and submits. No data is sent without their knowledge.
- **GitHub Discussions enabled** -- Feedback and community discussion now live at github.com/kbanc85/claudia/discussions.
- **Installer feedback hint** -- Completion message now mentions `/feedback` and links to Discussions.

## 1.55.11 (2026-03-15)

- **Auto-repair corrupt claudia.db** -- Installer detects when `claudia.db` is empty or corrupt (no tables, malformed disk image) and removes it along with stale WAL/SHM files so the daemon can create a fresh one. Previously, a corrupt db with leftover SHM files caused "database disk image is malformed" on every startup, blocking the daemon and preventing database consolidation.
- **Color scheme** -- Replaced all green in the installer with cyan/teal to match Claude's palette. The installer now only uses white, cyan, and yellow throughout.

## 1.55.10 (2026-03-15)

### The Personality Update

The installer now has personality. A thinking wave pulses during setup, rotating subtitles add charm, and the completion message adapts to who you are.

- **Thinking wave** -- A traveling pulse animation (`░▒▓█▓▒░`) appears under the progress bar during install. Smooth, subtle, and makes the wait feel alive.
- **Rotating subtitles** -- A dim quoted line cycles through 12 messages during install ("Calibrating charm levels...", "Loading opinions...", "I never forget a face. Or a deadline."). Starts at a random position so repeat installs feel fresh.
- **Context-aware completion** -- Fresh installs say "She's waiting to meet you" with onboarding hints and suggested first commands. Upgrades show the new version number and suggest /morning-brief and /inbox-check. The `cd` command is only shown when needed.
- **Removed eye blink** -- The v1.55.9 blinking eyes corrupted the portrait by writing to the wrong terminal line. Replaced with the cleaner thinking wave.

## 1.55.9 (2026-03-15)

- **Blinking eyes** -- Portrait eyes blink during install. (Removed in 1.55.10 due to terminal rendering bug.)
- **Rotating subtitles** -- First version of subtitle rotation.
- **Context-aware completion** -- First version of adaptive completion messages.

## 1.55.8 (2026-03-15)

### The Vector Search Fix

v1.55.7 fixed FTS5 recall but broke vector/semantic search for every user. Three raw `sqlite3.connect()` calls skipped loading the `sqlite_vec` extension, and three KNN queries lacked the required `k = ?` constraint for JOINs. Net effect: 0% embedding coverage and silent fallback to keyword matching.

- **`load_sqlite_vec()` helper** -- Extracted the vec0 extension loading logic from `Database._get_connection()` into a standalone public function. Any raw connection that touches vec0 tables calls this one function. Eliminates the entire class of "forgot to load extension" bugs.
- **Backfill worker fix** -- `_backfill_worker()` now loads sqlite_vec on its raw connection. Previously it crashed within 60ms of starting because it couldn't query or write to vec0 tables. Degrades gracefully if the extension isn't available.
- **Index repair fix** -- `_check_and_repair_indexes()` now loads sqlite_vec on its raw connection. Previously it always reported 0 embeddings (triggering unnecessary backfill every startup). Improved exception handling distinguishes "no such table" from "no such module."
- **KNN `k = ?` constraint** -- Added `AND k = ?` to all three `embedding MATCH` queries in recall.py (`recall()`, `recall_episodes()`, `search_reflections()`). vec0's KNN queries require this constraint when JOINs are present because SQLite's query planner can't push an outer `LIMIT` into the virtual table scan.
- **Smarter briefing message** -- Embedding health check now reads `_meta['indexes_repaired']` to distinguish "backfill in progress" from "backfill never started." No longer tells users to "Start Ollama" when the real problem was a code bug.
- **9 new tests** -- Helper extraction, Database integration, backfill/repair patterns, KNN constraint behavior (both success and documented failure without `k`). All 615 tests pass.

## 1.55.7 (2026-03-15)

### The Recall Recovery Release

After v1.55 consolidation, recall could return zero results despite all memories existing. Three-layer fix restores recall for affected users automatically on next startup.

- **FTS5 rebuild after consolidation** -- `merge_all_databases()` now rebuilds the FTS5 full-text index after merging. The migration's separate SQLite connection bypassed triggers that keep FTS5 in sync, leaving the index empty.
- **LIKE fallback fix** -- `_keyword_search()` now falls through to SQL LIKE when FTS5 returns 0 rows (not just on exception). Previously, an empty-but-functional FTS5 table returned nothing and the LIKE fallback never activated.
- **Startup index repair** -- New `_check_and_repair_indexes()` runs on every daemon startup (idempotent). Detects FTS5 and embedding gaps, rebuilds FTS5 instantly, and starts a background embedding backfill thread if Ollama is available.
- **Background embedding backfill** -- Non-blocking thread generates missing vector embeddings in batches of 25. Tolerant of missing Ollama (logs warning, recall uses LIKE fallback). Progress logged to daemon.log.
- **Embedding health in briefing** -- Session briefing now shows embedding coverage percentage when below 90%, so Claudia can inform the user about regeneration status.
- **5 new tests** -- FTS rebuild after merge, recall works after merge, standalone FTS rebuild, LIKE fallback when FTS empty, FTS MATCH preferred when populated. All 613 tests pass.

## 1.55.6 (2026-03-15)

- **Post-consolidation status report** -- After merging databases, Claudia's first greeting includes live database stats (memories, entities, relationships, episodes, reflections, patterns) and explains the backup schedule going forward. The whats-new file now contains a full status table and backup retention details.
- **Briefing consolidation awareness** -- The session briefing detects both pending consolidation (shows counts, asks user) and just-completed consolidation (shows final stats, explains backup schedule). Claudia surfaces this in her greeting regardless of what the user says first.

## 1.55.5 (2026-03-15)

- **Consolidation alert in briefing** -- When legacy hash databases exist but haven't been merged yet, the session briefing surfaces a pending consolidation alert with memory counts. Claudia will ask the user if they want to consolidate rather than silently noting version numbers.
- **Consolidation notice overwrites installer release notes** -- After a successful merge, the whats-new file shows what actually happened (merged N memories from M databases) instead of generic changelog text.

## 1.55.4 (2026-03-15)

- **Installer URL** -- Banner now shows claudia.aiadopters.club instead of the GitHub URL.

## 1.55.3 (2026-03-15)

- **Installer polish** -- Memory System step shows memory count from claudia.db when available instead of raw file count. DB scan shows totals ("4 databases to consolidate (2,118 memories, 319 entities)") and fixes "1 memories" grammar. MCP Config no longer warns about multiple stdio servers (they work fine now).

## 1.55.2 (2026-03-15)

- **BUG FIX: dbScan scope error** -- `dbScan` was declared inside the try block but referenced in the vault callback outside it. Moved declaration to outer scope.

## 1.55.1 (2026-03-15)

- **BUG FIX: installer DB scan display** -- The memory database scan output was being overwritten by the progress renderer's ANSI cursor movements. Moved scan results to print after the renderer finishes so all legacy database stats are visible.

## 1.55.0 (2026-03-15)

### The Unified Memory Release

Claudia no longer fragments your memory across dozens of invisible database files. Every project, every session, one brain.

- **Single database** -- All sessions now use `~/.claudia/memory/claudia.db` regardless of which project directory you're in. No more hash-named files like `6af67351bcfa.db` that nobody can identify or recover.
- **Automatic consolidation** -- On first startup after upgrade, Claudia detects your existing hash-named databases, merges all their data into the unified `claudia.db`, and cleans up the old files. Zero manual steps.
- **Workspace provenance** -- New `workspace_id` column on memories tracks which project directory created each memory. This is provenance metadata ("where did I learn this?"), not a filter wall. Recall stays global: Claudia remembers Sarah regardless of which project you're in.
- **Human-readable backups** -- Backups now live in `~/.claudia/backups/` with clear names like `claudia-daily-2026-03-15.db` and `claudia-pre-merge-2026-03-15.db` instead of cryptic timestamps alongside the database file.
- **Pre-merge safety net** -- Before any consolidation, a backup is created automatically. If anything goes wrong, your data is recoverable.
- **DB identity logging** -- Every daemon startup logs exactly which database it's using and how many memories it contains. No more guessing.
- **Manual merge CLI** -- `python -m claudia_memory --merge-databases` lets you preview (`--dry-run`) or manually trigger consolidation.
- **Schema migration 21** -- Adds `workspace_id TEXT` column and index to memories table.
- **39 new tests** -- Full coverage for unified DB, consolidation, backup naming, and workspace tagging. All 608 tests pass.

## 1.54.4 (2026-03-14)

### The One-Click Setup Release

Google Workspace setup went from 15 minutes to 2. Real user testing revealed painful friction in API enablement, broken OAuth URLs, missing API documentation, and a config typo that silently broke auth for new installs.

- **One-click API enablement** -- `npx get-claudia google` now generates a single URL that enables all required APIs for your chosen tier (4/8/11 APIs) in one browser page. No more visiting each API individually.
- **Tiered API reference** -- New `TIER_APIS` mapping in `google-setup.js` with `extractProjectNumber()` and `buildApiEnableUrl()` exports. Project number is auto-extracted from the Client ID.
- **Re-auth documentation** -- All setup docs now include step 9: if you enable new APIs after initial sign-in, delete `~/.workspace-mcp/token.json` and restart Claude Code.
- **BUG FIX: env var mismatch** -- `template-v2/CLAUDE.md` referenced `GOOGLE_CLIENT_ID` instead of `GOOGLE_OAUTH_CLIENT_ID`. New users following docs would get silent auth failures. Fixed.
- **Principle 15: URL Integrity** -- New principle across all three `claudia-principles.md` copies: never modify, reformat, or line-wrap URLs. Prevents Claudia from corrupting OAuth URLs.
- **Complete API list** -- Docs now list all 11 APIs across tiers (added Slides, Forms, Apps Script, Chat, People API) instead of a vague "and any others you want."
- **12 new tests** -- `extractProjectNumber` (4 tests), `buildApiEnableUrl` (4 tests), `TIER_APIS` structure (4 tests). All 26 google-setup tests pass.

## 1.54.0 (2026-03-05)

### The Compound Tools Release

Two new MCP tools that collapse multiple sequential memory calls into single round trips, inspired by the programmatic tool calling pattern.

- **`memory.multi_recall`** — Execute multiple recall queries in one call. Each query can have its own limit, type filter, and entity filter. Results are deduplicated server-side across queries. Replaces sequential `memory.recall` calls when searching across multiple dimensions.
- **`memory.deep_context`** — Full deep-context pipeline in a single call: entity lookup + broad semantic recall + connected entity pulls (top N by strength) + temporal sweep + episode search. Deduplicates by memory ID across all 5 steps. Returns structured JSON ready for synthesis. Replaces 6-8 sequential `memory.about`/`memory.recall` calls.
- Updated `deep-context` skill to use the new compound tool as primary method (with sequential fallback)
- Updated `meeting-prep` skill to use `memory.deep_context` for one-call person context
- Updated `morning-brief` skill to reference `memory.multi_recall` for follow-up queries
- Added compound tools reference table to `memory-manager` skill documentation

## 1.53.4 (2026-03-04)

### The Skill Sharpening Release

Systematic improvement of Claudia's 41 default skills for better contextual triggering, testing, and maintainability. Follows the Skill Creator's best practices for description-driven activation and progressive disclosure.

- **Improved skill descriptions** -- 8 SKILL.md files updated with richer trigger context so Claude matches skills more accurately from natural language (meditate, new-person, draft-reply, follow-up-draft, memory-manager, pattern-recognizer, meeting-prep, weekly-review)
- **Skill index v2 with examples** -- `skill-index.json` bumped to schema v2. All 41 entries now include `examples` arrays with 3-6 natural-language utterances for long-tail matching (e.g., "anything urgent this morning?" triggers morning-brief)
- **Consolidated overlapping skills (43 to 41)** -- Merged `concierge` into `research/SKILL.md` (tool detection, staleness tracking, proactive offers). Merged `structure-evolution` into `capability-suggester.md` (usage gap detection, business depth upgrades, suggestion library)
- **Eval templates for 5 skills** -- Added `evals/basic.yaml` for morning-brief, capture-meeting, new-person, diagnose, and meditate. Compatible with the Skill Creator plugin for automated quality testing
- **Reference files for 4 skills** -- Added `references/` subdirectories for diagnose (common-issues), ingest-sources (extraction-patterns), research (source-evaluation), and new-workspace (workspace-templates). Keeps SKILL.md lean via progressive disclosure
- **README updated** -- Documented `examples` field in schema reference, added progressive disclosure and eval documentation, updated effort level table for 41 skills

## 1.53.3 (2026-03-04)

### Fix: Actually restore disabled MCP servers on upgrade

v1.53.2 added restore logic for `_disabled_`-prefixed keys in `mcpServers`, but an early return (`if (!config._disabled_mcpServers) return`) prevented it from running. The function now handles both migration paths independently: the `_disabled_mcpServers` stash (Path 1) and `_disabled_*` prefixed keys directly in `mcpServers` (Path 2). Path 2 is now generic and renames any `_disabled_*` key, not just gmail/google-calendar.

## 1.53.2 (2026-03-04)

### Re-enable Gmail and Calendar MCPs

Gmail and Calendar MCP servers were disabled in v1.53.1 as a workaround for Claude Code bug #17962 (multiple stdio servers). Multiple stdio servers now work reliably, so these are re-enabled.

- **Gmail and Calendar enabled by default** -- `.mcp.json.example` ships `gmail` and `google-calendar` as active entries (no `_disabled_` prefix). Both require Google Cloud credentials (see Google Integration Setup in CLAUDE.md).
- **Restore function re-enables Gmail/Calendar** -- `restoreMcpServers()` now also restores `gmail` and `google-calendar` from `_disabled_mcpServers` on upgrade. Additionally handles `_disabled_`-prefixed keys in `mcpServers` itself.
- **Diagnose skill updated** -- Removed multiple-stdio warning (Step 1b) and the advice to disable Gmail/Calendar. Step 1b now simply lists active servers without warning about conflicts.
- **Removed stdio_warning from config notes** -- `.mcp.json.example` no longer warns about multiple stdio servers or suggests disabling Gmail/Calendar.

## 1.53.1 (2026-03-04)

### The One-Stdio Fix: Memory Tools Actually Connect

The daemon was healthy, all 26 tools registered, preflight passed, but tools silently vanished from Claude Code's palette. Root cause: `.mcp.json.example` shipped with 4 active stdio MCP servers. Claude Code bug [#17962](https://github.com/anthropics/claude-code/issues/17962) means only one stdio server connects reliably. Additionally, the daemon's JSON schemas used union type shorthand (`["integer","string"]`) that Claude Code's Zod validator may reject ([#10031](https://github.com/anthropics/claude-code/issues/10031)).

- **Disable extra stdio servers by default** -- `.mcp.json.example` now ships gmail and google-calendar as `_disabled_` prefixed keys. Only `claudia-memory` is active as stdio. Matches the v1.49.0 pattern that worked.
- **Rube switched to HTTP transport** -- Rube (Composio) entry changed from `command: npx` (stdio) to `type: http` with `url: https://mcp.composio.dev`. No stdio conflict, no slot consumed.
- **Fix JSON Schema union types** -- Tool schemas changed from `["integer","string"]` and `["array","string"]` to simple `"string"` and `"array"`. The `_coerce_int()` and `_coerce_arg()` helpers already handle type conversion at runtime, so the unions were unnecessary and potentially caused all tools to vanish.
- **Multi-stdio detection in installer** -- New `warnMultipleStdioServers()` warns during install if >1 stdio server is active. New "MCP Config" progress step shows stdio server count.
- **Post-install component checklist** -- Installer now shows a component summary (Personality & Skills, Memory Daemon, MCP Config, Stdio Servers) with status indicators after install/upgrade.
- **Diagnose skill: Step 1b** -- New diagnostic step counts active stdio servers and flags multiples. New common issue entry for "Multiple stdio MCP servers" with fix instructions.
- **Fix `restoreMcpServers()`** -- Restore function no longer re-enables gmail/google-calendar as active stdio servers on upgrade. Only `claudia-memory` is restored from `_disabled_mcpServers`.
- **Closed GitHub issues** -- [#7](https://github.com/kbanc85/claudia/issues/7) (migration 20 UNIQUE constraint) and [#8](https://github.com/kbanc85/claudia/issues/8) (schema.sql missing from npm) were both fixed in earlier releases by the removal of the Node.js CLI.

## 1.53.0 (2026-03-04)

### The Reliability Release: Self-Diagnosing MCP Daemon

The memory daemon had 12 silent failure points between `python -m claudia_memory` and tools appearing in Claude Code. Every failure produced the same user experience: "tools not in palette, no idea why." This release makes the daemon observable, self-diagnosing, and self-healing.

- **`--preflight` flag** -- Validates all 11 startup steps (Python version, MCP SDK, config, database path, database connection, schema, migrations, sqlite-vec, MCP server, tool count, Ollama) without entering MCP mode. Writes structured JSON results to `~/.claudia/daemon-preflight.json` with specific fix instructions for each failure. Exit code 0 if all critical checks pass, 1 if any fail.
- **`--repair` flag** -- Reads preflight results and auto-fixes common issues: clears stale WAL checkpoints, creates missing database directories, re-runs schema and migrations, installs sqlite-vec, creates default config.json. Re-runs preflight after repairs to verify.
- **Startup manifest** -- Daemon writes `~/.claudia/daemon-session.json` (PID, timestamp, db path, stdin type, tool count) when it successfully enters the MCP stdio loop. Updated with `exited_at` on clean shutdown. Lets diagnostics distinguish "never started" from "started then died" from "running."
- **Installer runs preflight** -- After installing the daemon and configuring `.mcp.json`, the installer now runs `--preflight` and reports results. Users see exactly whether their daemon will work at install time.
- **Rewritten diagnose skill** -- `/diagnose` now checks `.mcp.json` config, runs preflight, inspects the session manifest, checks the standalone daemon, and probes the database directly. Each failure shows the specific fix command. Replaces the old skill that only checked CLI availability (irrelevant to MCP startup).
- **Missing schema.sql is now a hard error** -- Previously logged a warning and continued with no tables. Now raises `FileNotFoundError` with a reinstall command.
- **Better startup logging** -- Daemon logs database path, config source, and project ID at startup for easier debugging.
- **Archived dead code** -- Removed old `cli/`, `docs/plans/`, `template/`, `site/`, `openclaw-skills/` directories that were no longer referenced.

## 1.51.26 (2026-03-04)

### The Memory Fix: Auto-Install Daemon for All Users

The memory daemon source was not included in the npm package and the installer did not install it. Users had to manually `pip install` the daemon from source, which nobody did. The MCP server never started, Claude Code silently skipped it, and Claudia had no memory capabilities.

- **Bundle daemon source in npm package** -- `memory-daemon/claudia_memory/` (40 files) and `pyproject.toml` now ship with the npm tarball. Package size goes from ~500KB to ~2.7MB.
- **Add "Memory Daemon" step to installer** -- New Step 4 detects Python 3.10+, creates a venv at `~/.claudia/daemon/venv/`, pip installs the bundled daemon source, and verifies the import. Non-blocking: warns and continues if Python is missing.
- **Auto-configure `.mcp.json`** -- New `ensureDaemonMcpConfig()` writes the correct daemon entry with the absolute venv Python path. Preserves all existing MCP server entries. Creates the file if it doesn't exist.
- **Strengthen Session Start Protocol** -- Three mandatory outcomes when checking `memory.briefing`: tool responds (healthy), tool errors (tell user), tool missing (MUST disclose degraded mode immediately).
- **Add Mandatory Disclosure rule** -- `memory-availability.md` now requires upfront honesty when the daemon isn't running. No silent fallback to context files.
- **Update `.mcp.json.example`** -- Daemon entry now says "Auto-configured by installer" instead of manual setup instructions.

## 1.51.25 (2026-03-04)

### The Cleanup: Strip Unreachable CLI Code

The `claudia` CLI binary shipped 40+ memory subcommands (12,932 lines) that no user could reach because the package isn't globally installed (`npx get-claudia` is a temporary download) and `claudia` on many systems resolves to AWS Lambda's `claudia.js`. This release archives that dead code and cleans up the installer.

- **Archived 13 CLI files** to `_archived/cli-v1/` (12,932 lines, ~160KB). Commands, services, and OAuth code moved out of the active codebase but preserved for reference.
- **Pruned `cli/index.js`** from 694 lines to 47. Only `system-health` and `setup` remain (used internally by the installer).
- **Removed `claudia` bin entry** from `package.json`. No more PATH collision with AWS Lambda's `claudia.js`.
- **Removed Gmail/Calendar credential message** from installer output. Setup info already lives in `.mcp.json.example` and CLAUDE.md.
- **Removed silent global CLI install** attempt that ran `npm install -g` behind the scenes.
- **Removed demo database seeder** that called the now-archived `claudia memory save` command.
- **Updated `writeWhatsNewFile()`** to reference MCP tools instead of non-existent CLI commands.
- **Updated Session Start Protocol** in CLAUDE.md to use `memory.briefing` MCP tool instead of the unreachable `claudia system-health` CLI command.
- **Updated health check fallback** message to point to CLAUDE.md instead of the unreachable CLI.

## 1.51.24 (2026-03-04)

### Installer: MCP-Primary Memory Architecture

The installer was actively disabling the claudia-memory MCP daemon and reporting "CLI ready," directly contradicting the documentation updates from v1.51.22-23. This release aligns the installer with the MCP-primary architecture.

- **Removed daemon disabling** -- `disableLegacyMcpServers()` no longer removes `claudia-memory` from `.mcp.json`. The function and its global config warning counterpart have been removed entirely.
- **Daemon restoration for existing users** -- `restoreMcpServers()` now includes `claudia-memory` and `claudia_memory` in its restore list. Users who upgraded through v1.51.13+ will get their daemon config automatically restored from `_disabled_mcpServers`.
- **Updated status messages** -- Memory system check now reports "Database ready" instead of "CLI ready". Completion message mentions the daemon.
- **Template includes daemon** -- `.mcp.json.example` now lists `claudia-memory` as an MCP server with setup instructions. Memory note updated to describe MCP daemon architecture.
- **Removed legacy cleanup** -- Removed `cleanupLegacyDaemon()` stub and all "legacy daemon" language from the installer.

## 1.51.23 (2026-03-04)

### Memory Interface Alignment (Patch)

- **claudia-principles.md: 2 CLI references fixed** -- Source Preservation section now references `memory.file` MCP tool instead of `claudia memory document store`. Auto-Memory Discipline pointer example now references `memory.recall` MCP tool instead of CLI syntax.

## 1.51.22 (2026-03-04)

### Memory Interface Alignment (CLI to MCP)

All documentation previously referenced a CLI interface (`claudia memory recall`, `claudia memory save`, etc.) that was never built. The actual working interface is MCP tools from the claudia-memory daemon. This release updates the 8 highest-priority files to match reality.

- **memory-manager.md: full rewrite** -- Authoritative memory reference now describes MCP tools (`memory.recall`, `memory.remember`, `memory.about`, etc.) instead of non-existent CLI subcommands. Includes full MCP Tool Reference table and migration note for skills not yet updated.
- **memory-availability.md: MCP architecture** -- Failure mode documentation now correctly describes the daemon not running (check `.mcp.json`, verify daemon startup) instead of a missing CLI binary.
- **CLAUDE.md: session protocol** -- Session start/end instructions now reference `memory.briefing`, `memory.session_context`, and `memory.end_session` MCP tools instead of CLI commands.
- **morning-brief: MCP tool calls** -- All CLI commands replaced with MCP equivalents (`memory.morning_context`, `memory.recall`, `memory.about`, `memory.dormant_relationships`).
- **capture-meeting: MCP tool calls** -- Document filing (`memory.file`), batch operations (`memory.batch`), and provenance linking updated to MCP syntax.
- **meditate: MCP tool calls** -- Reflection retrieval, storage (`memory.end_session`), and natural language editing examples updated to MCP syntax.
- **hooks.json: MCP instructions** -- Session start verification, context loading, turn buffering, and source filing instructions now reference MCP tools.
- **pre-compact.sh/.py: advisory-only** -- Removed non-functional CLI calls. Now emits advisory text pointing Claude to the correct MCP tools for pre-compaction capture.

## 1.51.21 (2026-03-04)

### Data Freshness Protections

- **New rule: data-freshness** -- Establishes canonical source hierarchy (source files > database > context files > MEMORY.md). When tiers disagree, higher-authority sources win. Includes the Freshness Test: verify counts against source files before reporting them.
- **Principle 14: Auto-Memory Discipline** -- MEMORY.md is for structural knowledge, not volatile data. Introduces the Pointer Rule (store "files are at X" not "9 completed") and the Timestamp Rule (dated facts need verification notes).
- **Trust North Star Principle 6: Data Freshness is a Trust Obligation** -- Reporting a stale count is the same category of trust violation as presenting an inference as fact. Adds verification triggers and freshness signaling guidelines.
- **morning-brief: workspace verification** -- Before reporting project status, scans workspace directories for actual file counts. Reports from file-system truth, not summaries. Flags discrepancies transparently.
- **capture-meeting: downstream updates** -- Step 5 "Organize" replaced with prescriptive "Downstream Updates" (5a: person files, 5b: commitments, 5c: workspace files). Factual updates (last contact, history) proceed automatically; consequential changes still require confirmation.

## 1.51.20 (2026-03-03)

### Fix: Multi-Source Status Reconciliation

- **capture-meeting: concrete verification commands** -- Replaced vague "query current state" with specific grep commands for counting completed/outstanding items. Grep count is now explicitly authoritative over in-session memory.
- **capture-meeting: mandatory source reconciliation (Step 5b)** -- After any status change, all three sources (file YAML, memory DB, dashboard tracker) must be updated and cross-checked. Never use in-session counts.
- **capture-meeting: error recovery guidance** -- Documents how to handle cascading "sibling tool call errored" failures by re-running commands individually.
- **what-am-i-missing: Data Consistency Check (section 6)** -- New check cross-references memory DB against file-based trackers, flags contradictions like "memory says completed but tracker says outstanding."
- **morning-brief: verification step** -- Overdue/at-risk items now verified against actual file state before reporting, catching stale memory DB entries.
- **New rule: shell-compatibility** -- Bans zsh-reserved variable names (`status`, `path`, `prompt`), documents safe patterns for macOS default shell.

## 1.51.19 (2026-03-03)

### Installer UX + License Update

- **Installer now asks y/n before installing or upgrading** -- Users confirm before any files are written. Auto-approves in non-TTY environments (CI/scripts) and with `--yes`/`-y` flags.
- **Blank line between banner and status** -- Visual spacing between "Research in AI that learns how you work" and the first status line.
- **Logo hairline adjusted** -- Top hair block shifted left to better align with the face.
- **License changed to PolyForm Noncommercial 1.0.0** -- Replaces Apache 2.0. Free for personal, research, educational, and nonprofit use. Commercial licensing available via mail@kbanc.com.

## 1.51.18 (2026-03-03)

### Fix: Embedding Storage + Functional Health Checks

- **Fix: Vec0 primary keys now use BigInt** -- sqlite-vec v0.1.6 + better-sqlite3 requires `BigInt()` for INTEGER PRIMARY KEY columns in vec0 virtual tables. JS numbers are 64-bit floats, which sqlite-vec rejects. This was the actual root cause of the "Only integers are allows for primary key values" error on every embedding INSERT. Applied to all 6 INSERT locations across memory, entity, episode, and reflection embeddings.
- **Fix: Vec0 MATCH queries now include `k = ?` constraint** -- All 3 vector search queries (memory recall, reflection search, episode search) were missing the required `AND k = ?` clause in the WHERE, causing "A LIMIT or 'k = ?' constraint is required on vec0 knn queries" errors. Semantic search now works end-to-end.
- **New: Functional health checks in `system-health`** -- Health command now runs a full embedding roundtrip test: generate embedding via Ollama, verify dimensions match config, INSERT into vec0, MATCH query back, cleanup. Also checks dimension consistency across config, database _meta, and actual model output. Reports `memories_with_embeddings` count to surface coverage gaps.
- **New: `resetAvailability()` on EmbeddingService** -- Health check now clears the cached availability state before probing, so it always reports live status instead of stale cache.
- **New: Embedding coverage warning** -- If fewer than 50% of memories have embeddings, health check warns and suggests `--backfill-embeddings`.

## 1.51.17 (2026-03-03)

### Critical: Fix Embedding Storage + CLI Documentation

- **Fix: Embeddings now stored as Float32Array** -- All vec0 virtual table inserts (memory, entity, episode, reflection embeddings) were using `JSON.stringify()` which better-sqlite3 rejects. Now uses `new Float32Array()` matching the sqlite-vec Node.js API. This restores semantic/vector search, which was silently falling back to keyword-only FTS matching.
- **Fix: CLI reference in memory-manager.md** -- Corrected inaccurate flags (`--about`, `--summary`, `--action`), added batch JSON schema with examples, documented all 45+ subcommands including temporal, graph, provenance, and session groups. Added valid option values table.
- **Fix: Batch error messages now show expected format** -- "Invalid JSON input" now includes the expected `{"op":...}` schema inline. Added validation for missing `op` field and non-array input.
- **Fix: Embedding failure warnings now explicit** -- Changed from misleading "cosmetic" stderr messages to clear warnings explaining semantic search won't find the memory.
- **Fix: capture-meeting skill** -- Added pronoun context requirement for agent dispatch (prevents Haiku misgendering). Added pre-query step for dashboard/tracker state to prevent stale counts. Fixed `document store` example syntax (positional file arg, not flags).

## 1.51.16 (2026-03-03)

### Rube: Categorized App Directory

- **Categorized app list in CLAUDE.md** -- Rube section now shows apps by category (Communication, Meeting Notes & Transcription, Project Management, Databases, CRM, etc.) so users know exactly what they can connect. Includes Granola, Otter.ai, Fireflies.ai, Jira, Linear, Airtable, Supabase, HubSpot, Stripe, and many more.
- **More usage examples** -- Added examples for Granola meeting notes, Jira sprints, Stripe payments, Airtable records.

## 1.51.15 (2026-03-03)

### Rube Integration (500+ Apps)

- **Optional Rube MCP server** -- Connect Slack, Notion, Drive, GitHub, Linear, Jira, and 500+ more apps through a single MCP server via Rube (by Composio). Each user creates their own free Rube account at rube.app, connects apps via one-click OAuth, and pastes one API key. Works alongside existing Gmail/Calendar MCPs.
- **Comprehensive setup guidance in CLAUDE.md** -- Claudia can now walk users through Rube setup step by step, troubleshoot connection issues, and explain the difference between Rube and individual MCPs.

## 1.51.14 (2026-03-03)

### Installer Banner Fix

- **Fix: installer no longer shows `claudia google login`** -- The post-install banner now points to "Google Integration Setup" in CLAUDE.md instead of the old CLI login command, matching the MCP-first approach from v1.51.13.

## 1.51.13 (2026-03-03)

### Gmail & Calendar: Back to MCP

- **Reverted Gmail and Calendar from CLI to MCP servers** -- Gmail and Calendar integrations now use the third-party MCP packages (`@gongrzhe/server-gmail-autoauth-mcp` and `@gongrzhe/server-calendar-autoauth-mcp`) instead of Claudia's built-in CLI commands. Each user sets up their own Google Cloud Console project with their own OAuth credentials. No shared authentication. Setup instructions in CLAUDE.md.
- **Existing users: MCPs auto-restored** -- If v1.51.9-v1.51.12 moved your Gmail/Calendar MCPs to `_disabled_mcpServers`, the installer now moves them back to active `mcpServers`.
- CLI commands (`claudia gmail`, `claudia calendar`) remain available as a fallback.

## 1.51.12 (2026-03-03)

### OAuth Login: Instant Exit + Auto-Close Tab

- **Fix: login commands now exit immediately** -- Three-pronged fix for the 2-minute hang: (1) `openBrowser()` child process is now `.unref()`'d so it doesn't keep the event loop alive, (2) `process.exit(0)` in all login command handlers as a safety net, (3) the browser callback page now auto-closes after 3 seconds with `window.close()` and shows a "Close This Tab" button as fallback.

## 1.51.11 (2026-03-03)

### OAuth Login Speed Fix

- **Fix: `claudia google login` no longer hangs for 2 minutes** -- The OAuth callback server used HTTP/1.1 keep-alive connections by default. After the browser received the "Connected!" page, it held the TCP connection open, preventing the Node.js process from exiting. The command would hang until Claude Code's 2-minute Bash timeout killed it. Fixed by setting `Connection: close` headers on all responses and calling `server.closeAllConnections()` (Node 18.2+) to force-destroy sockets immediately. Login now completes in ~10 seconds.

## 1.51.10 (2026-03-03)

### Global MCP Config Warning

- **Warn about legacy MCP servers in global `~/.claude.json`** -- The installer now checks the global Claude Code config for legacy MCP servers (memory daemon, Gmail, Calendar) that overlap with Claudia's native CLI commands. These global entries can't be auto-fixed (they're shared across all projects), but the installer warns the user with specific instructions to clean them up. This catches the case where project-level `.mcp.json` is clean but a global config is still launching duplicate MCP servers.

## 1.51.9 (2026-03-03)

### MCP Disable Fix

- **Fix: legacy MCP servers now properly disabled** -- Previous versions set `_disabled: true` inside `mcpServers` entries, which is not a supported Claude Code feature. Claude Code was still launching the legacy MCP servers (memory daemon, Gmail, Calendar) even though they appeared "disabled." The installer now uses Claude Code's native disable format: servers are **moved** from `mcpServers` to the `_disabled_mcpServers` top-level key. This matches what Claude Code's own `/mcp` toggle does. The full config is preserved in `_disabled_mcpServers` so users can move it back to re-enable if needed.

## 1.51.8 (2026-03-03)

### Memory MCP Retirement

- **Legacy `claudia-memory` MCP auto-disabled on install/upgrade** -- The old Python daemon MCP server is now automatically disabled in `.mcp.json`, just like the Gmail/Calendar MCPs. The native `claudia memory` CLI replaces it entirely. This prevents Claude Code from using the MCP tools instead of the CLI commands.

### Proactive Memory Lookup

- **"Search before asking" rule** -- Claudia now has an explicit directive to always query memory when someone is referenced by name or relationship ("my wife", "my boss", "my client"). She resolves the reference via `memory recall` and `memory about` before asking the user for information she might already have.

## 1.51.7 (2026-03-03)

### Gmail Draft

- **`claudia gmail draft`** -- Create draft emails with optional attachments via the Gmail API. Same MIME support as `gmail send` (--attach for images/files, --html, --cc, --bcc, --thread, --reply-to) but all fields are optional since drafts can be completed in the Gmail UI. Uses the `drafts.create` endpoint.

### Installer Self-Update

- **Self-update trampoline** -- `npx get-claudia .` now checks the npm registry on startup and automatically re-executes with the latest version if the cached copy is outdated. No more stale installs from npx caching. Falls back gracefully if offline. Protected against infinite recursion via `CLAUDIA_SKIP_UPDATE_CHECK` env var.

## 1.51.6 (2026-03-03)

### Gmail Send

- **`claudia gmail send`** -- Send emails with optional attachments via the Gmail API. Supports `--to`, `--subject`, `--body` (required), plus `--cc`, `--bcc`, `--attach` (repeatable for multiple files), `--html` (HTML body), `--thread` (reply to a thread), and `--reply-to` (threading headers). MIME message constructed with Node.js built-ins only (no external dependencies). Attachments are base64-encoded with MIME type detection from file extension. 25 MB per-file limit enforced client-side.

## 1.51.5 (2026-03-02)

### Database Migration Fix

- **Fix: migration 20 `fact_id` column** -- SQLite does not allow `UNIQUE` constraints on `ALTER TABLE ADD COLUMN`. Migration 20 was silently failing, leaving the `fact_id` column missing and all memory writes broken (`table memories has no column named fact_id`). Fixed by adding the column without the constraint and enforcing uniqueness via a `CREATE UNIQUE INDEX` instead. Existing databases stuck at this broken state will self-heal on next startup.
- **Fix: `schema.sql` missing from npm package** -- The `memory-daemon/claudia_memory/schema.sql` file was not included in the published npm tarball, causing `[database] Schema file not found` warnings on every CLI invocation. Added to `package.json` `files` array.

## 1.51.4 (2026-03-02)

### MCP Cleanup

- **Gmail/Calendar MCPs auto-disabled on install/upgrade** -- The installer now detects active Gmail and Google Calendar MCP servers in `.mcp.json` and disables them automatically. Claudia's native CLI commands (`claudia google login`, `claudia gmail search`, `claudia calendar list`, etc.) replace these external MCP servers entirely.
- **`.mcp.json.example` cleaned up** -- Removed Gmail and Calendar MCP entries from the template. Added a note pointing users to `claudia google login` instead.

## 1.51.3 (2026-03-02)

### Google Polish

- **Unified login** -- `claudia google login` connects both Gmail and Calendar in a single OAuth flow. All 5 scopes requested at once, tokens saved for both services. `claudia google status` and `claudia google logout` manage both.
- **Calendar search & read** -- `claudia calendar search "meeting"` searches events by text. `claudia calendar read <eventId>` shows full event details including attendees, conference links, and description. Calendar now has full parity with Gmail commands.
- **OAuth callback page reworked** -- Light theme with Claudia's color palette (cyan/teal accents on white). Removed broken base64 image. Single "Connected" heading (no more duplicate badge). Service-aware: shows Gmail features, Calendar features, or both for unified login.
- **Faster terminal recognition** -- Added progress messages ("Waiting for browser authorization...", "Token received, finishing setup...") and a 10-second fetch timeout on the token exchange to prevent hanging.
- **Installer updated** -- Completion message now shows `claudia google login` (unified) instead of separate Gmail/Calendar commands.
- **CLAUDE.md command table expanded** -- Added `claudia google login/status/logout`, `claudia calendar search`, `claudia calendar read` to the CLI reference.
- **Landing page** -- `site/index.html` with Claudia branding, feature cards, install command with copy button.
- **Privacy policy page** -- `site/privacy.html`, styled HTML version of PRIVACY.md.
- **Terms of service page** -- `site/tos.html`, Apache 2.0, as-is, no liability, no accounts.

## 1.51.2 (2026-03-02)

### Gmail/Calendar CLI Discoverability

- **CLAUDE.md updated** -- Gmail and Calendar CLI commands are now documented in the Integrations section of `CLAUDE.md`. Claude Code will recognize `claudia gmail login`, `claudia gmail search`, etc. as shell commands and execute them via the Bash tool instead of trying to interpret them as questions.

## 1.51.1 (2026-03-02)

### Installer: Auto-Install Ollama + Robust Model Pull

- **Auto-install Ollama** -- Installer detects if Ollama is missing and installs it automatically via Homebrew (macOS) or the official install script (Linux). Windows users are guided to download manually.
- **Auto-start Ollama** -- If Ollama is installed but not running, the installer starts it and waits for the API to respond before pulling models.
- **Ollama key fix** -- Fresh Ollama installs can be missing `~/.ollama/id_ed25519`, causing silent pull failures. The installer now generates the key with `ssh-keygen` if absent, and retries the pull after restarting Ollama if the first attempt fails.

## 1.51.0 (2026-03-02)

### Google Integration

- **Gmail CLI** -- `claudia gmail login` opens your browser for Google OAuth. After signing in, Claudia can search, read, and send emails via `claudia gmail search`, `claudia gmail read`. Sign out with `claudia gmail logout`.
- **Calendar CLI** -- `claudia calendar login` connects Google Calendar. List upcoming events with `claudia calendar list`. Sign out with `claudia calendar logout`.
- **Loopback OAuth** -- Uses Google's Desktop App flow: temporary localhost server catches the callback, tokens stored locally at `~/.claudia/tokens/`. No server, no data collection.
- **Branded callback page** -- OAuth success page shows Claudia's logo, feature cards for what the connection enables, and a privacy note.
- **Privacy policy** -- `PRIVACY.md` added for Google Cloud app verification. Documents zero-collection, local-only architecture.
- **Installer updated** -- Post-install completion message shows `claudia gmail login` and `claudia calendar login` as optional next steps.

## 1.50.2 (2026-03-02)

### Auto Global Install

- **`claudia` auto-installed on PATH** -- After a successful install, `npx get-claudia .` now checks if `claudia` is on PATH. If not, silently runs `npm install -g get-claudia` so hooks and Claude Code can find the CLI immediately.
- **Completion message improved** -- Shows "Memory is ready" confirmation and simplified next steps.

## 1.50.1 (2026-03-02)

### Installer Fix

- **Installer rewritten for CLI** -- `bin/index.js` no longer depends on `memory-daemon/scripts/install.sh`. Environment, AI Models, Memory System, and Health Check steps now use direct Ollama HTTP calls, `createRequire` for native dep verification, and `claudia system-health` via the CLI.
- **MCP setup removed** -- `setupMcpJson()` eliminated. No `.mcp.json` is created or modified during install.
- **Demo seeder uses CLI** -- `--demo` flag now seeds via `claudia memory save` instead of Python `seed_demo.py`.
- **Dead code removed** -- STATUS line parser and `createInterface` import cleaned up.

## 1.50.0 (2026-03-02)

### The CLI Migration

Claudia's memory system is rewritten as pure Node.js CLI subcommands, replacing the Python MCP daemon entirely. No more daemon startup bugs, port conflicts, or MCP schema drift. Claude invokes memory via `claudia memory <command>` through the Bash tool.

- **21 new CLI files** -- Full Node.js implementation in `cli/` with better-sqlite3, sqlite-vec, and Ollama HTTP client. 7 core modules, 8 services, 5 command groups, 1 entry point.
- **36 memory subcommands** -- `claudia memory save`, `recall`, `about`, `relate`, `batch`, `end-session`, `consolidate`, `briefing`, `temporal`, `graph`, `entities`, `modify`, `session`, `document`, `provenance`, `summary`, `reflections`, `project-health`, and more.
- **Full MCP parity** -- All 21 MCP daemon tools ported to CLI equivalents with identical behavior and DB compatibility. Reads existing Python-created `.db` files with zero migration.
- **35 template files updated** -- Every skill, hook, rule, and agent file rewritten to use CLI commands instead of MCP tool calls. Zero `memory.*` MCP references remain.
- **Hooks rewritten** -- `session-health-check` and `pre-compact` hooks now call `claudia system-health` and `claudia memory consolidate` instead of HTTP pings to localhost:3848.
- **MCP server entry removed** -- `.mcp.json.example` no longer registers `claudia-memory` as an MCP server. The CLI is the sole interface.

## 1.49.0 (2026-03-01)

### Visual Polish

Edge rendering and environment controls tuned for the React brain explorer. Integrates and closes PR #5.

- **Smoother edge curves** -- Radial-basis orbital spread at node surfaces replaces flat normal offsets. Uniform arc-length sampling (`getSpacedPoints`) and higher segment counts (28-72) eliminate visible faceting on curved connections.
- **Family-aware line lengths** -- Edges classified into entity, memory, and pattern families. Each family has an independent line-length slider that reheats the d3-force layout to spread clusters differently.
- **Grid color picker** -- Live environment control for grid tint, plus adjusted opacity/thickness curves for stronger visual feedback.
- **Per-family particle colors** -- Entity, memory, and pattern particles can now be colored independently from node colors via Settings.
- **Theme refresh** -- Matrix Rain, TRON Arena, and Neo Tokyo redesigned with punchier palettes, stronger glow values, and tighter contrast ratios.

## 1.48.0 (2026-02-28)

### The React Brain

Claudia's Brain Visualizer is rebuilt from the ground up on React and react-three-fiber, replacing the vanilla JS + 3d-force-graph frontend entirely. Integrates and closes PR #4.

- **React + react-three-fiber frontend** -- Component-based 3D graph explorer with AppShell, BrainScene, NodeGlyphs, EdgeLayer, LabelLayer, SceneFx engine. Zustand store for state management. d3-force-3d layout runs in a dedicated web worker.
- **10 UI components** -- TopHudBar, LeftSidebar, RightInspector, BottomTimeline, SearchPalette, FilterDrawer, SettingsPanel, DatabaseSwitcher, GraphViewport, and 10 visual themes with live switching.
- **Old frontend removed** -- Deleted vanilla JS modules (main.js, renderer.js, camera.js, settings.js, themes.js), modular directories (data/, effects/, graph/, materials/, ui/), public-legacy/, and src-legacy/.
- **Unused dependencies cleaned** -- Removed 3d-force-graph, sigma, and graphology. Added React 19, react-three-fiber, drei, postprocessing, d3-force-3d, zustand.
- **Bug fix: invalidated_at filter** -- Added `WHERE invalidated_at IS NULL` to `loadGraphDataset()`, `/api/entity/:id`, and `/api/timeline` endpoints. Soft-deleted memories no longer appear in the graph.
- **Bug fix: hardcoded personal name removed** -- `findHubEntityId()` now uses a pure highest-relationship heuristic instead of a hardcoded regex.

## 1.47.0 (2026-02-28)

### The Safety Net

Fixes silent data loss when upgrading from single-database to project-isolated databases, and adds a labeled backup infrastructure to prevent future data loss.

- **Legacy database migration** -- Auto-detects stranded `claudia.db` data and migrates it into the active project database on daemon startup. Schema-adaptive reads handle databases from any schema version. Entity matching by `(canonical_name, type)` with content-hash deduplication prevents duplicates.
- **`--migrate-legacy` CLI** -- Manual migration with `--dry-run` preview, `--legacy-db` custom path, and detailed stats output. Standalone `scripts/migrate-legacy-db.py` for recovery without daemon.
- **Labeled backups** -- Daily (2:30 AM, 7-day retention) and weekly (Sunday 2:45 AM, 4-week retention) scheduled backups with independent retention tracking. Pre-migration backups created automatically.
- **Backup verification** -- Every backup validated with `PRAGMA integrity_check`. Corrupt backups are deleted immediately.
- **Database registry** -- Central `~/.claudia/memory/registry.json` enumerates all known project databases with workspace paths and timestamps.
- **Integrity fixes** -- WAL cleanup uses direct path concatenation (was fragile `.replace`), backup sorting by `mtime` (was alphabetical, broke with mixed labels).
- **24 new tests** -- Full migration coverage: entity mapping, dedup, pattern merging, schema gaps, dry-run, rollback on failure, idempotency. 532 total tests, 0 regressions.

## 1.46.0 (2026-02-28)

### Brain Visualizer v4.2

Complete rebuild of the 3D Brain Visualizer with a modular architecture, GPU-accelerated rendering, and rich exploration APIs.

**Frontend (v4.0-v4.2):**
- Modular architecture -- monolithic files split into 26 focused modules (data/, effects/, graph/, materials/, ui/)
- GPU memory particles -- 900+ memory nodes rendered in a single `THREE.Points` draw call with custom ShaderMaterial
- Luminance-gated chromatic aberration -- post-processing bloom + CA that only applies to bright pixels, keeping text sharp
- 10 visual themes -- Cosmos, Deep Ocean, Midnight, Aurora, Solar, Nebula, Forest, Sunset, Crystal, Neon
- Quality presets -- LOW/MEDIUM/HIGH/ULTRA with runtime switching (no reload needed)
- Connection view presets -- All Connections, Strong Bonds, People Map, Projects, Concepts
- Sidebar insights -- Memory Breakdown and Insights panels with live data
- Dramatic node selection -- highlighted neighborhood pops at full brightness while background softens to 35% opacity
- Async particle flow -- memory-to-entity particles with per-link speed variation via deterministic hash
- Midnight theme subtle color -- desaturated hues for entity type distinction while maintaining elegant aesthetic

**Backend (8 new API endpoints):**
- `/api/graph/overview` -- entity-first overview with inferred relationships and commitment overlays
- `/api/graph/neighborhood/:graphId` -- ego-graph exploration with configurable depth
- `/api/graph/trace` -- BFS shortest-path tracing between entities with shared memory evidence
- `/api/search` -- text search across entities, memories, and patterns with relevance scoring
- `/api/commitments/active` -- active commitment tracking with deadline and priority sorting
- `/api/insights` -- exploration signals: top entities, urgent commitments, cooling relationships, active patterns
- Enhanced `/api/graph` with signal scoring, entity stats, overdue detection, and richer metadata
- Enhanced `/api/stats` with safe fallbacks for optional schema columns and commitment counts

**Backend architecture:**
- `graph-contract.js` -- normalized node/edge types, utility functions, schema-adaptive queries
- `graph-data.js` -- central data loading layer with entity stats, commitment inference, inferred relationships
- Schema-adaptive SQL -- conditional column selection for backward compatibility across database versions

## 1.45.1 (2026-02-26)

### Open Source & Polish

Claudia is now Apache 2.0 licensed, with installer polish and creator attribution.

- **Apache 2.0 license** -- Replaces PolyForm Noncommercial for proper open-source status, wider adoption, and required attribution via NOTICE file
- **Logo alignment** -- Hair centered over face in both the installer banner and session greeting
- **Creator attribution** -- "by Kamil Banc" with GitHub link and research tagline in Claudia blue/white below the installer logo
- **Non-TTY fallback** -- Piped output now includes attribution and tagline

## 1.45.0 (2026-02-26)

### Ultra-Compact Installer

The installer output drops from ~80-100 lines to ~15 lines with a unified progress display, real-time status updates, and zero redundancy.

- **Progress bar** -- 5 unified steps (Environment, AI Models, Memory System, Obsidian Vault, Health Check) replace the old Phase 1/2 + Step 1-8 hierarchy
- **STATUS protocol** -- `install.sh` and `install.ps1` now support `CLAUDIA_EMBEDDED=1` mode, emitting machine-parseable `STATUS:step:state:detail` lines for programmatic consumers
- **In-place rendering** -- TTY-aware display with spinner animation and `[████░░░░] 3/5` progress bar that updates in place
- **Non-TTY fallback** -- Clean append-mode output without ANSI codes for CI/piped environments
- **Compact banner** -- Portrait-only art (7 rows instead of 12), no typewriter animation
- **Backward compatible** -- Running `install.sh` standalone produces identical output to before

## 1.44.0 (2026-02-25)

### The Judgment Layer

Claudia can now learn your business trade-offs and apply them automatically. A new Judgment Architecture lets her understand which tasks matter most, when to escalate, and what to always surface, based on rules that evolve from your actual behavior during session reflections.

**New: Judgment Awareness skill**
- Loads user-defined rules from `context/judgment.yaml` silently at session start
- Rules use natural language conditions (not code), matching how `claudia-principles.md` works
- Five rule categories: priorities, escalation, overrides, surfacing, delegation
- Strict hierarchy: principles > trust north star > judgment rules > reflections
- Graceful degradation: Claudia works fine without any judgment file

**Extended: Meditate skill**
- New reflection question: "Did any judgment-relevant decisions happen this session?"
- Proposes judgment rules when session behavior reveals repeatable business trade-offs
- User approves, edits, or rejects proposed rules before they're saved
- Rules written to `context/judgment.yaml` with provenance tracking (`meditate/YYYY-MM-DD`)

**Integrations:**
- Morning Brief checks judgment rules for surfacing triggers and priority ordering
- Commitment Detector boosts importance for entity-linked escalation rules
- Risk Surfacer raises severity by one level when escalation rules match

**Archetype starter templates:**
- Optional priority frameworks for all 5 archetypes (Consultant, Founder, Executive, Solo, Creator)
- Only created when user explicitly requests them during onboarding or later sessions

**Invocation consistency fix:**
- Added explicit `invocation: proactive` to 5 skills that only had legacy `user-invocable: false`

## 1.43.0 (2026-02-24)

### The Trim

Claudia's template and memory daemon got a significant trim. Template files shed ~4,000 lines of redundant prose, archetypes now reference a shared base structure instead of duplicating it, and the MCP server was refactored from a monolithic handler into a clean registry pattern. Several memory-side fixes improve correctness.

**Template simplification (-4,000 lines):**
- `CLAUDE.md` condensed: session startup, vault lookups, and skill tables trimmed to essentials with pointers to dedicated skill files
- `claudia-principles.md` cut from verbose examples to concise principles (same 10 rules, fewer words)
- All 5 archetype files (consultant, executive, founder, solo, creator) stripped of duplicated structure definitions; now reference `_base-structure.md`
- `memory-manager.md` streamlined to remove redundant operational detail
- `what-am-i-missing` skill tightened
- `accountability-check` skill removed (functionality absorbed into `what-am-i-missing`)
- `skill-index.json` updated to reflect removals

**MCP server refactor:**
- Converted from monolithic `call_tool()` switch to `@tool_handler` decorator registry pattern
- Each tool handler is now a self-contained function with its own schema
- Backward-compatible aliases preserved for all 28 legacy tool names

**Memory daemon fixes:**
- WAL checkpoint upgraded from PASSIVE to TRUNCATE for more reliable crash recovery
- Deadline surge updates (overdue/48h/7d importance bumps) now wrapped in a single transaction
- Entity matching in recall uses word-boundary regex instead of substring containment (prevents false matches on short names)
- Single-character entity names excluded from text matching
- Recency decay half-life is now configurable via `recency_half_life_days` (default: 30)

**Dev docs:**
- `CLAUDE.md` updated with vault sync docs, config reference, diagnostics section, correct visualizer port, test count
- New `docs/plans/desktop-strategy/` with 8 design documents for future desktop app exploration

510 tests pass (5 skipped), 0 regressions.

## 1.42.4 (2026-02-24)

Consolidated the memory daemon test suite from 47 files to 39 by merging 13 related test files into 5 well-organized modules. All 508 tests pass with zero regressions. No test logic changed, just better structure.

- **Guards:** `test_guards.py` + `test_relationship_guards.py` merged into `test_validation_guards.py`
- **Daemon lifecycle:** `test_health.py` + `test_scheduler.py` + `test_startup.py` + `test_backup.py` merged into `test_daemon_lifecycle.py`
- **Entity lifecycle:** `test_entity_management.py` + `test_corrections.py` merged into `test_entity_lifecycle.py`
- **Vault sync:** `test_vault_sync.py` + `test_vault_sync_v2.py` merged into `test_vault_operations.py`
- **Graph:** `test_graph.py` + `test_graph_retrieval.py` + `test_graph_analytics.py` merged into `test_graph_operations.py`

508 tests pass (5 skipped), 0 regressions.

## 1.42.3 (2026-02-21)

Four fixes from a live field report:

- **Critical fix:** Fresh installs now correctly pass `--project-dir` to the standalone daemon's LaunchAgent (macOS) and Task Scheduler entry (Windows). Previously the daemon always ran maintenance jobs (decay, pattern detection, consolidation) against the global default database instead of the project-specific one. Upgrades trigger a rewrite of the plist/task with the correct path.
- **Medium fix:** `memory.system_health` now fetches scheduler state from the running daemon's HTTP endpoint (`GET :3848/status`) instead of calling `get_scheduler().is_running()` in-process — which always returned `False` inside the MCP subprocess. Scheduler status is now accurate.
- **New:** `POST /backup` endpoint on port 3848 lets you trigger a backup with `curl -X POST http://localhost:3848/backup`. New `memory.backup` MCP tool does the same with an HTTP-first / direct-fallback pattern.
- **New:** Orphan episodes (sessions that ended without an explicit `memory.end_session` call) are now auto-closed during nightly consolidation. Episodes open for more than 24 hours get a synthetic `ended_at` and `is_summarized = 1`, eliminating false positives in health reports.

503 tests pass (5 skipped), 0 regressions.

## 1.42.2 (2026-02-19)

Refreshed README to better communicate Claudia's strengths, cognitive architecture, and real-world value. Added "How Her Mind Works" section explaining Remember/Recall/Consolidate/Vault in plain English. Expanded "See It in Action" with morning brief and pattern detection examples. Updated feature cards for PARA vault, background learning, and pattern detection. Promoted cognitive extraction from hidden details to visible paragraph. Cleaned up commands table (removed archived gateway/relay, added vault sync, brain, deep-context, and more).

## 1.42.1 (2026-02-19)

Updated vault-awareness skill and architecture docs to reflect the PARA structure shipped in v1.42.0. Claudia now references correct PARA paths (Active/, Relationships/, Reference/, Archive/, Claudia's Desk/) in deep links, routing logic, and navigation guidance. Added vault to ARCHITECTURE.md installed files tree.

## 1.42.0 (2026-02-19)

### PARA Second Brain

The vault is now a proper second brain for business. Entities route into PARA-inspired folders based on their activity status, not just their type. Claudia's machine-readable files live in her own named zone.

**Vault PARA restructure:**
- Four human-facing folders: `Active/` (projects with attention), `Relationships/` (people + organizations), `Reference/` (concepts + locations), `Archive/` (dormant or explicitly archived entities)
- Routing uses existing `attention_tier` and `contact_trend` fields: archived or dormant entities go to Archive, everything else routes by entity type
- `Claudia's Desk/` is Claudia's named zone for MOC files, patterns, reflections, sessions, and dataview query templates
- Home.md rewritten as PARA navigation dashboard with active projects, relationship counts, needs-attention callouts, and quick links
- `--migrate-vault-para` CLI flag with safety-first workflow: backs up both database and vault, copies (not moves), verifies file counts, cleans up only after verification passes
- Old `--organize-vault` (wing migration) removed along with `use_claudia_wing` and `claudia_wing_dir` config fields

**Self-awareness mechanism:**
- Installer now writes `context/whats-new.md` after install/upgrade with the current version's changelog and full skill inventory (grouped by invocation type)
- Claudia reads it at session start, mentions the update in her greeting, then deletes the file
- `showWhatsNew()` now reads from CHANGELOG.md dynamically instead of hardcoded bullets

**Fixes:**
- Logo alignment corrected (hair line shifted 2 spaces right)
- Removed phantom `/curate-vault` from skills table
- Added `/brain`, `/deep-context`, `/fix-duplicates`, `/memory-health` to contextual skills table

503 tests pass (5 skipped), 0 regressions.

## 1.41.0 (2026-02-19)

### Vault Organizer: Efficiency-First Architecture

The vault is now dual-purpose: a human-browsable Obsidian graph and Claudia's own cheap read layer. Session start overhead drops from ~1,800 tokens to ~550 on healthy days. Every data access path now has a cheaper degraded-mode equivalent.

**Session start token reduction (~70% savings):**
- `memory.briefing` is now the primary session-start call (~500 tokens) replacing `memory.session op=context` (~1,200 tokens). Deep context loads only when the briefing flags alerts (overdue commitments, cooling relationships, unread messages)
- Session health hook output trimmed from ~700 tokens to ~50: user profile injection removed (profile lives in `context/me.md`; Claudia reads it when needed), daemon-down messages condensed to one-liners per platform
- New `/briefing` HTTP endpoint on port 3848 so future hooks can access briefing data without MCP

**Living MOCs as Claudia's read layer:**
- Three pre-computed vault files generated on every sync: `MOC-People.md` (tier-grouped relationship health map with last contact, trend, open commitments), `MOC-Commitments.md` (overdue / due this week / open / recently completed), `MOC-Projects.md` (tier-grouped with connected people and commitment counts)
- Reading `MOC-People.md` replaces `memory.graph op=network` for overview queries (~0 MCP tokens vs 200-300+). CLAUDE.md documents the vault file paths and when to use vault reads vs MCP calls
- MOC files regenerated on every incremental sync (pure SQL, <50ms, no embeddings)

**Pattern backlinks:**
- Entity notes now include a "Related Patterns" section linking to patterns that reference them
- Pattern notes include typed entity wikilinks back to the people/projects they describe
- Vault graph coherent: no orphaned pattern nodes

**Claudia Wing (opt-in vault organizer):**
- New `--organize-vault` CLI flag migrates an existing flat vault into a typed container structure: `claudia/relational/` for people/concepts, `claudia/ops/` for projects/orgs, `claudia/self/` for reflections, `claudia/` root for MOC files
- `--organize-vault --preview` shows the migration plan without making changes
- Copy-not-move semantics: originals preserved, aliases injected into frontmatter so existing Obsidian wikilinks resolve
- `use_claudia_wing: false` by default -- fully opt-in, no disruption to existing vaults

**Consolidation vault reweave:**
- After Phase 3 (pattern detection), `run_full_consolidation()` now triggers an incremental vault sync inline, keeping MOC files current for the next morning session
- 4R phase labels added as inline documentation: Reduce (decay), Reflect (merge), Reweave (pattern detection + vault sync), Verify (dedupe + cleanup)
- 3:15 AM scheduled full sync retained as safety net

**Fallback chain: MCP tools → vault MOC files → vault entity files → `context/` files**

503 tests pass (5 skipped).

## 1.40.5 (2026-02-18)

### Brain Visualizer: Performance Fix

- **Replaced O(N) triggerRefresh() with O(k) targeted material updates** - Node clicks no longer force 3d-force-graph to re-evaluate color/width callbacks on every node and link. Instead, directly manipulates Three.js materials on just the selected neighborhood (~5-20 items). Saves/restores original materials on selection change.
- **Skipped idle memory nodes in per-frame animation loop** - Memory nodes that aren't actively spawning, pulsing, or shimmering are now skipped in `animateNodes()`. Since memories outnumber entities 3:1+, this eliminates ~75% of per-frame iterations.
- **Reduced bloom strength 30% across all 10 themes** - UnrealBloomPass strength reduced by 0.7x and radius by 0.75x. Maintains glow aesthetic while cutting GPU bloom cost. Ultra quality preset scaled proportionally.
- **Faster force simulation settling** - Increased `d3AlphaDecay` default from 0.008 to 0.02, so the graph stabilizes ~2.5x faster and stops burning CPU on force calculations.
- **Guarded theme change listeners** - Both `links.js` and `nodes.js` theme listeners now track the previous theme ID and skip reconfiguration when it hasn't changed.
- **Replaced full node rebuild on theme change** - Theme switches no longer call `Graph.nodeThreeObject()` (which recreated all geometries, materials, and textures). Now updates `material.color` and `material.emissive` in-place on existing meshes.

## 1.40.4 (2026-02-18)

### Brain Visualizer: One-Command Experience

- **Visualizer now ships with npm package** - Added `visualizer` to `package.json` `files` array so `npx get-claudia` installs the 3D brain visualizer automatically
- **Pre-built frontend included** - Removed `dist/` from `.npmignore` so the Vite-built frontend ships ready to serve. No dev tools needed on the user's machine.
- **Auto-open browser** - New `--open` flag on `server.js` launches the browser automatically after the server starts. Uses `execFile` (not `exec`) for shell injection safety, with platform detection for macOS/Linux/Windows.
- **Single-server brain skill** - Rewrote `/brain` skill from a 6-step two-server flow (Express + Vite dev server) to a 4-step single-server experience. One process, one port (3849), one command.

## 1.40.3 (2026-02-18)

### MCP Tool UnboundLocalError Fixes

- **Fixed: `memory.temporal` (operation: "upcoming") crashing with UnboundLocalError** - A `from ..services.recall import recall_upcoming_deadlines` inside the legacy `memory.upcoming` alias branch caused Python to treat `recall_upcoming_deadlines` as a local variable throughout the entire `call_tool` function, making it unbound at the merged-tool dispatch site. Removed the redundant local import; the name is already imported at module level.
- **Fixed: `memory.graph` (operation: "reconnect") crashing with UnboundLocalError** - Two `from datetime import datetime` imports inside if-branches of the `memory.end_session` handler caused the same scoping problem for `datetime`, which is used earlier in the function by the reconnect handler. Removed the redundant local imports; `datetime` is already imported at module level.

## 1.40.2 (2026-02-18)

### Port Conflict Fix + Graceful Degraded Mode

- **Fixed: MCP process crashes with [Errno 48] when standalone daemon is running** - When the LaunchAgent/systemd daemon holds port 3848, Claude Code's ephemeral MCP server process was unconditionally trying to bind the same port and failing before registering any tools. `start_health_server()` and `start_scheduler()` are now guarded by `if not mcp_mode:`, consistent with the existing singleton lock guard. MCP processes are session-bound and ephemeral; the standalone daemon owns the port and the scheduler.
- **User profile injected in degraded session context** - When the daemon auto-restarts (or is otherwise unavailable), the session-health-check hook now appends the contents of `context/me.md` to the hook output. Claudia can greet the user naturally and work from markdown context even before memory tools become available.
- **Improved fallback mode in CLAUDE.md** - When memory tools are absent, Claudia now reads `context/me.md` and related files immediately as her first action, before saying anything, then greets the user naturally using that context. Clearer guidance on when to offer troubleshooting vs. when a `/diagnose` run is the right next step.
- **Cleaner rule language** - `claudia-principles.md` now explicitly prohibits referencing internal implementation details (skill files, hook names, MCP tool IDs) in conversation. `memory-availability.md` rewritten for concision, with the "Why This Matters" section condensed to avoid verbatim surfacing.

## 1.40.1 (2026-02-18)

### Memory Tool Guard + Singleton Lock Fix

- **Fixed: MCP server blocked by standalone daemon (singleton lock conflict)** - When the LaunchAgent or systemd service runs the daemon with `--standalone`, it held the global `claudia.lock`. Claude Code's MCP server would try to acquire the same lock, see another daemon running, and exit silently with code 0 -- leaving memory tools unregistered. Fixed by making the lock conditional on standalone mode only. MCP servers are ephemeral and don't need the lock; SQLite WAL handles concurrent access safely.
- **Explicit episodic-memory guard** - Claudia now has explicit instructions (hooks.json, new `memory-availability.md` rule) to never use `plugin:episodic-memory` as a substitute for her own `mcp__claudia-memory__*` tools. Using the wrong tool masked the real problem and returned unrelated memories.
- **Clearer restart message from health hook** - When the daemon auto-restarts, the hook now explicitly tells Claudia that MCP tools are NOT yet registered in the current session (because MCP connects at session start, before the restart). Claudia tells the user to restart Claude Code -- one clear action, no command to type.
- **New `memory-availability.md` rule** - Session-level rule reinforcing the no-substitute policy and explaining the restart-only fix. Acts as belt-and-suspenders alongside hooks.json.
- **`/diagnose` updated** - Detects standalone daemon process count, explains the pre-v1.40.1 lock conflict, and provides fix instructions for users on older versions.

## 1.40.0 (2026-02-18)

### MCP Tool Consolidation

- **41 tools reduced to 21 visible tools** - Related MCP tools consolidated into 8 composite tools with `operation` parameters, improving LLM tool selection accuracy (degrades above ~15-20 tools)
- **8 new merged tools** - `memory.temporal`, `memory.graph`, `memory.entities`, `memory.vault`, `memory.modify`, `memory.session`, `memory.document`, `memory.provenance` each combine 2-5 related operations
- **Full backward compatibility** - All 28 old tool names remain callable as aliases in `call_tool()`, just hidden from `list_tools()`. Existing hooks, scripts, and integrations continue working
- **`memory.purge` hidden** - Destructive admin operation removed from tool listing (still callable by skills that need it)
- **Template files updated** - 19 skill, hook, and rule files updated to reference new merged tool names
- **Archived gateway/telegram references cleaned** - Removed stale references to archived relay/gateway/visualizer components from template files

## 1.39.4 (2026-02-17)

### Daemon Robustness Path B

- **Per-request transaction isolation** - Every MCP tool call is now wrapped in a single SQLite transaction. If a service function fails mid-way, the connection rolls back cleanly instead of leaving dirty state that could corrupt sibling calls.
- **Startup integrity check with auto-restore** - On daemon start, a read-only `PRAGMA integrity_check` runs before accepting any requests. If the database is corrupt, the latest rolling backup is automatically restored and stale WAL files are removed. A critical log message guides manual recovery if no backup exists.
- **Session health-check auto-restart** - When the daemon is installed but stopped, the session hook now attempts a silent restart (launchctl on macOS, systemctl on Linux) and re-checks health before falling back to a manual suggestion. Most dropped-daemon situations self-heal without user intervention.
- **7 new tests** - Transaction isolation (commit on success, rollback on exception, cursor reuse) and startup integrity (healthy db, backup restore, no-backup logging, missing db skip).

## 1.39.3 (2026-02-16)

### Session Greeting Fix

- **Fixed distorted robot logo** - Reduced leading whitespace so code block renderers can't strip the indentation that creates the face overhang. Added top padding for clean rendering.

## 1.39.2 (2026-02-16)

### Installer Fixes

- **Cognitive tools now auto-install** - Non-interactive mode (via `npx`) now installs the recommended LLM (qwen3:4b) instead of silently skipping. Previously, upgrading via `npx get-claudia .` would leave cognitive tools disabled with no prompt offered.
- **Suppressed confection/Pydantic UserWarning** - The previous fix only filtered DeprecationWarning; confection emits a UserWarning on Python 3.14. Now all Python warnings are suppressed during install.
- **Clean venv on upgrade** - `python -m venv --clear` ensures stale packages from a previous Python version don't persist (fixes Python 3.14 packages lingering after selecting 3.13)

## 1.39.1 (2026-02-16)

### Installer Bug Fixes

- **Fixed `set -e` abort during upgrade** - The install script would abort at "Checking embeddings..." and report "Memory setup had issues" even though the core installation succeeded. The `--backfill-embeddings` and markdown migration commands now properly capture exit codes under `set -e`
- **Actionable error messages** - Backfill failures now explain *why* (Ollama not responding, embedding model changed, etc.) instead of silently skipping
- **Suppressed harmless Python warnings** - Pydantic V1 deprecation warnings on Python 3.14 no longer appear during install
- **Failure details logged** - Backfill errors are written to `~/.claudia/install.log` for debugging
- **Improved retry guidance** - The installer now points to diagnostics (`~/.claudia/diagnose.sh`) when memory setup fails

### Session Greeting

- **Claudia now shows her robot logo** at the start of every session, giving a consistent visual identity in the terminal

## 1.39.0 (2026-02-16) - The Graph Intelligence Upgrade

### Enhanced Graph Retrieval

Six GraphRAG-inspired enhancements to Claudia's memory system, improving how she understands relationships and connections between entities.

#### Strength-Aware Graph Traversal
- Graph proximity scoring now accounts for relationship strength instead of flat hop-distance values
- 1-hop scores scale with edge strength (0.5-0.8 range); 2-hop scores multiply path strengths
- Multi-entity bonus: memories connecting multiple query entities get a 15% boost per additional connection, helping "connect-the-dots" queries

#### Entity Summaries
- New `entity_summaries` table caches structured overviews for entities with sufficient memories
- Summaries include key facts, relationships, open commitments, and contact velocity
- Generated during consolidation, refreshed on a configurable schedule (default: 7 days)

#### Entity Overview MCP Tool
- New `memory.entity_overview` tool for community-style queries across one or more entities
- Returns cross-entity patterns, relationship maps, shared memories, and open commitments
- Enables questions like "what connects Sarah, the Acme deal, and the budget review?"

#### Auto-Dedupe Entity Detection
- Identifies potential duplicate entities using vec0's native KNN search on embeddings and alias overlap
- Stores merge suggestions as predictions for user review (does not auto-merge)
- Each detection method runs independently, so alias overlap works even without sqlite-vec

#### Provenance Chain Rendering
- `memory.trace` now returns structured provenance chains showing a memory's full lifecycle
- Chain steps: origin, source document, episode, context, memory, correction, invalidation, entities

#### New Configuration Options
- `enable_entity_summaries` (default: true), `entity_summary_min_memories` (default: 2), `entity_summary_max_age_days` (default: 7)
- `enable_auto_dedupe` (default: true), `auto_dedupe_threshold` (default: 0.90)
- `graph_proximity_weight` (default: 0.15) - all configurable via `~/.claudia/config.json`

### Installer UX for Non-Technical Users

Six improvements to reduce friction for users who aren't comfortable with terminals and dependency management.

- **Unmissable restart instruction** - Bold yellow with explicit command, instead of dim text users miss
- **pip install logging** - Output goes to `~/.claudia/install.log` instead of `/dev/null`, with failure guidance
- **Post-install health check** - Verifies the daemon actually started on both macOS and Linux
- **Non-interactive LLM skip** - `npx` installs no longer hang on the cognitive tools prompt
- **Onboarding time estimate** - First-run greeting sets expectations ("takes about 5 minutes")
- **Obsidian explainer** - Tells users what Obsidian is when it's not detected

### Database
- New migration 19: `entity_summaries` table with indexes and integrity check
- Migration integrity now covers all 19 migrations

### Testing
- 22 new tests in `test_graph_retrieval.py` covering all graph enhancements
- 478 tests passing, 0 regressions

#### Stats
- Install: `npx get-claudia@1.39.0`

## 1.38.0 (2026-02-14)

### Workspace Templates

9 new Obsidian workspace templates for project management. These ship with the installer and are available in your vault's `workspaces/_templates/` directory.

- **Agreement** - Contract and agreement tracking with key terms and change history
- **Dashboard** - Project overview with phase tracker, deliverables, and dataview queries
- **Deliverable** - Individual deliverable tracking with evidence strength scoring
- **Interview** - Assessment interview template with 6-dimension scoring
- **Invoice** - Invoice tracking with line items and payment status
- **Meeting** - Meeting capture with decisions, action items, and themes
- **Pipeline** - Sales pipeline with active engagements, leads, and capacity tracking
- **Theme** - Theme/topic tracking with evidence and deliverable implications
- **Timeline** - Chronological project timeline

### New Skills

- **new-workspace** - Create a workspace skeleton for a new project, client, or venture. Gathers details, creates directory structure with populated templates, validates generated files, and updates your main dashboard.
- **gateway** - Start, stop, or check status of the Claudia Gateway service for Telegram and Slack messaging integration.
- **setup-gateway** - Guided walkthrough for setting up the API-based gateway (lightweight, fast chat interface).
- **setup-telegram** - Guided walkthrough for setting up the Telegram relay (full agent sessions with all skills and memory).
- **inbox-check** - Lightweight inbox triage across all configured email accounts. Uses a fast subagent to fetch messages, then provides judgment on what matters and what needs a reply.

### Vault Sync Improvements

#### Markdown table validation
The vault sync service now validates markdown tables at every entity export write point. Detects corrupted tables where header and separator rows have been merged onto a single line (a rendering issue that causes tables to display as raw text in Obsidian). Warnings are logged when corruption is detected.

#### Table repair method
New `_repair_broken_tables()` method that can split merged header/separator lines back into proper multi-line format. Available for future automatic repair integration.

### Skill Improvements

- **capture-meeting** - Added table rendering validation to the quality checklist
- **new-workspace** - Includes Step 3 "Validate Generated Files" to catch table corruption at creation time

### Installer

#### Python 3.13 support
- Added Python 3.13 to pyproject.toml classifiers (was already working, now official)

#### Visible spaCy status
- When spaCy can't install (e.g., Python 3.14+), the installer now displays a clear message explaining that entity extraction will use pattern matching instead of NLP, rather than failing silently

#### Optional memory daemon
- New `--no-memory` flag for template-only installs without the Python memory daemon
- Upgrades now also receive workspace templates (`workspaces/` added to framework paths)

### Compatibility

- **Python:** 3.10, 3.11, 3.12, 3.13 (tested)
- **Python 3.14+:** Installs with reduced NLP (pattern matching instead of spaCy). Core functionality unaffected.

#### Stats
- Install: `npx get-claudia@1.38.0`

---

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
