# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Claudia is an agentic executive assistant framework that runs on Claude Code. It has two core layers:

1. **Template layer** - Markdown files (skills, commands, rules, context) that define Claudia's personality, behaviors, and workflows. This is what gets copied to users' machines on install.
2. **Memory system** - A Python-backed daemon with SQLite, vector embeddings (sqlite-vec), and three service layers (remember, recall, consolidate) that give Claudia persistent, semantically searchable memory across sessions.

Both layers are core to how Claudia works. The template layer defines *who* Claudia is. The memory system defines *what she remembers*.

This repository also contains:
- `gateway/` - Multi-channel messaging bridge (Telegram, Slack) with Anthropic/Ollama provider auto-detection
- `visualizer-threejs/` - 3D brain visualization (Three.js + D3-Force-3D) with live parameter controls
- `openclaw-skills/` - Standalone skills for OpenClaw agents (repo-only, not in npm package)
- `template/` - Legacy template (deprecated)

For full architectural diagrams and pipeline explanations, see `ARCHITECTURE.md`.

## Architecture

### Template Layer

When users run `npx get-claudia`, the CLI copies `template-v2/` to their machine. When they run `claude` inside that directory, Claude reads the template files and becomes Claudia.

Installation flow:
1. CLI copies `template-v2/` to target directory
2. User runs `claude` to start conversation
3. Onboarding skill detects missing `context/me.md` and initiates discovery
4. Structure generator creates personalized folders/files based on user's archetype

**Skills** (`.claude/skills/`) - Proactive behaviors with YAML frontmatter declaring `effort-level` (low/medium/high/max). Activate based on context. Examples: `commitment-detector.md`, `pattern-recognizer.md`.

**Commands** (`.claude/commands/`) - User-invocable workflows via `/command-name`. Examples: `/morning-brief`, `/meeting-prep`, `/capture-meeting`.

**Rules** (`.claude/rules/`) - Global behavioral principles. `claudia-principles.md` (10 core principles) and `trust-north-star.md` (provenance tracking).

**Agents** (`.claude/agents/`) - Two-tier dispatch system:
- Tier 1 (Task tool): Document Archivist, Document Processor, Schedule Analyst (Haiku, fast structured work)
- Tier 2 (Native Agent Teams): Research Scout (Sonnet, independent context, multi-turn research)
- Dispatch logic in `skills/agent-dispatcher.md`, tracked via `memory.agent_dispatch` MCP tool

**Hooks** (`.claude/hooks/`) - Session lifecycle handlers:
- `session-health-check.sh` - SessionStart: pings memory daemon, reports status
- `pre-compact.sh` - PreCompact: calls `/flush` endpoint, injects recovery reminders

### Memory System (`memory-daemon/`)

The memory system is a standalone Python application that gives Claudia persistent, semantically searchable memory. It communicates with Claude Code via MCP (Model Context Protocol) over stdio.

**Database** - SQLite with sqlite-vec extension
- 14+ tables: entities, memories, relationships, patterns, predictions, episodes, messages, documents, reflections, audit_log, metrics, agent_dispatches, and vector tables
- 3 vector tables (384-dimensional embeddings) for semantic search
- WAL mode for crash safety; content hashing for deduplication
- Per-project isolation via workspace folder hash (`~/.claudia/memory/{hash}.db`)
- Bi-temporal tracking on relationships (`valid_at`/`invalid_at`)
- Soft-delete on entities (`deleted_at`/`deleted_reason`), corrections on memories (`corrected_at`/`corrected_from`)
- Schema defined in `schema.sql` with 14 migrations in `database.py`

**Service layers** (`services/`)
- `RememberService` (`remember.py`) - Stores facts, entities, relationships; generates embeddings; deduplicates; merges entities; soft-deletes; corrections and invalidation; audit logging
- `RecallService` (`recall.py`) - Hybrid ranking (50% vector, 25% importance, 10% recency, 15% FTS); RRF scoring option; graph proximity signals; rehearsal effect; duplicate entity detection
- `ConsolidateService` (`consolidate.py`) - Importance decay, pattern detection (cooling relationships, overdue commitments), near-duplicate memory merging (cosine > 0.92), prediction generation
- `IngestService` (`ingest.py`) - Cognitive extraction: text in, structured entities/memories out
- `DocumentsService` (`documents.py`) - Document storage, deduplication, entity linking
- `AuditService` (`audit.py`) - Full audit trail for memory operations
- `MetricsService` (`metrics.py`) - System health metrics with trending
- `VerifyService` (`verify.py`) - Background verification cascade (deterministic first, LLM fallback)
- `guards.py` - Validation on writes (content length, importance clamping, deadline detection, near-duplicate warning)

**MCP tools** exposed to Claude Code (`mcp/server.py`):
- `memory.remember` - Store facts, preferences, observations, learnings (accepts `origin_type`)
- `memory.recall` - Semantic search across all memories (max 50 results)
- `memory.about` - Retrieve all context about a specific entity
- `memory.relate` - Create/strengthen relationships between entities
- `memory.entity` - Create/update entity information
- `memory.search_entities` - Search entities by name or description
- `memory.predictions` - Get proactive suggestions and insights
- `memory.prediction_feedback` - Mark predictions as acted on (feeds engagement ratio)
- `memory.consolidate` - Trigger manual consolidation
- `memory.batch` - Batch multiple memory operations in one call
- `memory.trace` - Trace provenance and source history
- `memory.correct` - Update memory content (preserves history in `corrected_from`)
- `memory.invalidate` - Mark memories as no longer true
- `memory.merge_entities` - Merge duplicate entities, preserving all references
- `memory.delete_entity` - Soft-delete with reason tracking
- `memory.find_duplicates` - Fuzzy matching for potential duplicates
- `memory.system_health` - Current system health metrics
- `memory.audit_history` - Full provenance trail ("where did you learn that?")
- `memory.agent_dispatch` - Track agent delegation performance (`dispatch_tier` field)
- `memory.file` - Store documents
- `memory.buffer_turn` / `memory.end_session` / `memory.session_context` - Session lifecycle

**Background daemon** (`daemon/`)
- Scheduled jobs via APScheduler (hourly decay, 6-hourly pattern detection, daily full consolidation, daily metrics at 5am)
- Health check endpoint on port 3848 (includes `/flush` for WAL checkpoint)
- Graceful shutdown with signal handling

**Dependencies:** Ollama (local embeddings via all-minilm:l6-v2 + optional LLM models), sqlite-vec, APScheduler, httpx, spaCy (optional NLP)

### Archetype System

Claudia detects user archetypes during onboarding:
- **Consultant/Advisor** - Multiple clients, deliverables, proposals
- **Executive/Manager** - Direct reports, initiatives, leadership
- **Founder/Entrepreneur** - Investors, team, product, fundraising
- **Solo Professional** - Mix of clients and projects
- **Content Creator** - Audience, content, collaborations

Each archetype gets custom folder structures and commands (see `template-v2/.claude/skills/structure-generator.md`).

## Development Workflow

### Testing the Installer

```bash
cd claudia
node bin/index.js ../test-install     # Fresh install
node bin/index.js .                    # Upgrade in place
node bin/index.js ../test-install --demo  # With demo database
```

### Working on the Memory Daemon

```bash
cd memory-daemon
python -m venv venv
source venv/bin/activate
pip install -e ".[dev]"

pytest tests/                          # All unit tests
pytest tests/test_database.py -v       # Single test file
pytest tests/test_recall.py::test_name # Single test function
./test.sh                              # Full suite: unit + integration + daemon startup

python -m claudia_memory              # Run daemon (MCP mode, stdio)
python -m claudia_memory --consolidate # Run just consolidation
python -m claudia_memory --tui        # Brain Monitor TUI dashboard
claudia-brain                          # Same TUI via entry point
curl http://localhost:3848/health      # Health check
```

### Adding a Database Migration

Migrations live in two places:
1. `schema.sql` - Define new columns/tables for fresh installs
2. `database.py` - Add migration handler in `_run_migrations()` for existing databases

Pattern:
```python
# In database.py _run_migrations():
if current_version < N:
    conn.execute("ALTER TABLE ... ADD COLUMN ...")
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (N, 'Description of migration')"
    )
    conn.commit()
```

**Gotcha:** `schema.sql` is parsed line-by-line splitting on `;` at line endings. `CREATE TRIGGER` statements contain internal semicolons and must go in `database.py` migration code instead (see existing FTS5 and dispatch_tier triggers).

Also add integrity checks in `_check_migration_integrity()` if the migration adds columns that could fail silently (e.g., ALTER TABLE on a table that might not exist).

### Working on the Gateway

```bash
cd gateway
npm install
npm test                               # Node --test runner
npm start                              # Start server
```

Key files: `src/config.js` (config + provider detection), `src/bridge.js` (Anthropic/Ollama routing), `src/server.js` (Express HTTP).

### Working on the Visualizer

```bash
cd visualizer-threejs
npm install
npm run dev                            # Vite dev server with HMR
npm run build                          # Production build to dist/
```

Key files: `src/main.js` (entry + config observer), `src/graph.js` (D3-Force-3D simulation), `src/nodes.js` (Three.js node rendering), `src/design-panel.js` (lil-gui settings panel).

### Modifying Templates

- Edit files in `template-v2/`
- Changes apply to new installations only
- Test by creating fresh installation: `node bin/index.js ../test-install`

**Key template files:**
- `template-v2/CLAUDE.md` - Claudia's core identity and behavior
- `template-v2/.claude/rules/claudia-principles.md` - 10 immutable principles
- `template-v2/.claude/rules/trust-north-star.md` - Provenance tracking framework
- `template-v2/.claude/skills/onboarding.md` - First-run experience
- `template-v2/.claude/skills/agent-dispatcher.md` - Two-tier agent dispatch logic

### Adding New Skills

1. Create `[skill-name].md` (or `[skill-name]/SKILL.md` for complex skills) in `template-v2/.claude/skills/`
2. Add YAML frontmatter with at minimum `effort-level` (low/medium/high/max)
3. Include Purpose, Triggers, and Behavior sections
4. Update `template-v2/.claude/skills/README.md`

### Adding New Commands

1. Create `[command-name].md` in `template-v2/.claude/commands/`
2. Define: what to surface/do, format/structure, tone guidelines, edge cases
3. Add to archetype-specific command lists in `structure-generator.md` if appropriate

## Publishing

The package is published to NPM as `get-claudia`. Update version in:
- `package.json` (version field)
- `CHANGELOG.md` (add release notes)

```bash
npm pack      # Build tarball
npm publish   # Publish to NPM
```

## Design Principles

### Personality Consistency
Claudia's voice is defined in `template-v2/CLAUDE.md` and `claudia-principles.md`. All skills and commands should maintain:
- Warm but professional tone
- Confidence with playfulness
- No em dashes (sign of lazy AI writing)
- Direct and clear communication

### Safety First
Every external action requires explicit user approval. This is non-negotiable and enforced in `claudia-principles.md`.

### Trust North Star
Every memory tracks its origin via `origin_type` (user_stated, extracted, inferred, corrected). User corrections set `origin_type=corrected` and `confidence=1.0`. The `memory.audit_history` tool provides full provenance chains.

### Relationship-Centric
People files are the primary organizing unit. Projects and tasks come and go; relationships persist.

### Progressive Disclosure
Don't overwhelm users with structure upfront. Let complexity emerge from actual needs. Onboarding creates minimal seed files; structure grows organically.

### Graceful Degradation
Everything works without the memory daemon (falls back to markdown files). No required external APIs. Ollama is optional (cognitive extraction disabled without it).

## File Locations Reference

```
claudia/
├── bin/index.js              ← CLI installer (zero-dependency, ES modules)
├── package.json              ← NPM package config (name: get-claudia)
├── template-v2/              ← Current template
│   ├── CLAUDE.md            ← Claudia's core identity
│   └── .claude/
│       ├── commands/         ← User-invocable workflows
│       ├── skills/           ← Proactive behaviors (YAML frontmatter with effort-level)
│       │   └── archetypes/  ← Archetype-specific configs
│       ├── agents/           ← Two-tier agent team definitions
│       ├── rules/            ← Global principles + trust north star
│       └── hooks/            ← Session lifecycle (health check, pre-compact)
├── memory-daemon/            ← Python memory system
│   ├── claudia_memory/
│   │   ├── __main__.py      ← Entry point (MCP, consolidation, health check)
│   │   ├── database.py      ← SQLite + sqlite-vec, migrations v1-v14
│   │   ├── schema.sql       ← 14+ table definitions
│   │   ├── config.py        ← Settings from ~/.claudia/config.json
│   │   ├── embeddings.py    ← Ollama 384-dim embedding generation
│   │   ├── language_model.py ← Local LLM client for cognitive tools
│   │   ├── mcp/server.py    ← 20+ MCP tool definitions
│   │   ├── daemon/          ← Scheduler (APScheduler) + health check (port 3848)
│   │   ├── extraction/      ← Entity extraction (spaCy or regex fallback)
│   │   ├── tui/             ← Brain Monitor terminal dashboard (Textual)
│   │   └── services/        ← Remember, Recall, Consolidate, Ingest, Documents,
│   │                           Audit, Metrics, Verify, Guards, Filestore
│   ├── scripts/             ← Install, migrate, diagnose, seed scripts
│   ├── tests/               ← 25+ test files, pytest (asyncio_mode = auto)
│   └── test.sh              ← One-click full test suite
├── gateway/                  ← Messaging bridge (Telegram, Slack)
│   ├── src/                 ← Express server, config, bridge (Anthropic/Ollama)
│   ├── tests/               ← Node --test
│   └── scripts/             ← Cross-platform installers
├── visualizer-threejs/       ← 3D brain visualization
│   ├── src/                 ← Three.js + D3-Force-3D + lil-gui
│   └── vite.config.js
├── openclaw-skills/          ← Standalone OpenClaw skills (not in npm package)
└── template/                 ← Legacy template (deprecated)
```
