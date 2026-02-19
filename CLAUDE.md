# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Claudia is an agentic executive assistant framework that runs on Claude Code. It has two core layers:

1. **Template layer** - Markdown files (skills, commands, rules, context) that define Claudia's personality, behaviors, and workflows. This is what gets copied to users' machines on install.
2. **Memory system** - A Python-backed daemon with SQLite, vector embeddings (sqlite-vec), and three service layers (remember, recall, consolidate) that give Claudia persistent, semantically searchable memory across sessions.

Both layers are core to how Claudia works. The template layer defines *who* Claudia is. The memory system defines *what she remembers*.

This repository also contains:
- `docs/` - Design plans and internal docs
- `openclaw-skills/` - Standalone skills for OpenClaw agents (repo-only, not in npm package, no tests -- pure markdown)
- `visualizer/` - 3D brain graph (Express + Vite + 3d-force-graph; included in npm package)
- `template/` - Legacy template (deprecated)

Previously included gateway and relay directories were archived to the `archive/pre-obsidian` branch. The visualizer was retained and ships with the npm package.

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
- Dispatch logic in `skills/agent-dispatcher.md`

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
- Schema defined in `schema.sql` with 16 migrations in `database.py`

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

**MCP tools** exposed to Claude Code (`mcp/server.py`) - 21 visible tools (13 standalone + 8 merged):

Standalone tools:
- `memory.remember` - Store facts, preferences, observations, learnings (accepts `origin_type`, `source_channel`)
- `memory.recall` - Semantic search across all memories (max 50 results); results include `source_channel`
- `memory.about` - Retrieve all context about a specific entity
- `memory.relate` - Create/strengthen relationships between entities
- `memory.batch` - Batch multiple memory operations in one call (accepts `source_channel`)
- `memory.end_session` - End session with narrative, reflections, structured extractions
- `memory.consolidate` - Trigger manual consolidation
- `memory.briefing` - Compact session-start data
- `memory.summary` - Lightweight entity summaries
- `memory.reflections` - Query/update/delete session reflections
- `memory.system_health` - Current system health and diagnostics
- `memory.project_health` - Relationship velocity projection
- `cognitive.ingest` - NLP entity/memory extraction from text

Merged tools (each uses an `operation` parameter to select sub-function):
- `memory.temporal` - Time-based queries: `upcoming` (deadlines), `since` (recent changes), `timeline` (entity history), `morning` (curated morning digest)
- `memory.graph` - Relationship graph: `network` (project network), `path` (find connection path), `hubs` (hub entities), `dormant` (dormant relationships), `reconnect` (reconnection suggestions)
- `memory.entities` - Entity management: `create`, `search`, `merge`, `delete`, `overview`
- `memory.vault` - Obsidian vault: `sync`, `status`, `canvas` (generate canvas), `import` (import vault edits)
- `memory.modify` - Memory corrections: `correct`, `invalidate`, `invalidate_relationship`
- `memory.session` - Session lifecycle: `buffer` (buffer turn), `context` (session context), `unsummarized` (unsummarized turns)
- `memory.document` - Document storage: `store`, `search`
- `memory.provenance` - Audit trails: `trace` (memory provenance), `audit` (entity/memory audit history)

All 28 old tool names (e.g. `memory.entity`, `memory.search_entities`, `memory.trace`) remain callable as backward-compatible aliases in `call_tool()` but are hidden from `list_tools()`.

**Background daemon** (`daemon/`)
- 3 scheduled jobs via APScheduler: daily decay at 2 AM, pattern detection every 6 hours, full consolidation at 3 AM
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

**Important:** Use `python3`, not `python`. Some systems don't alias `python` to Python 3.

```bash
cd memory-daemon
python3 -m venv venv
source venv/bin/activate
pip install -e ".[dev]"

pytest tests/                          # All unit tests
pytest tests/test_database.py -v       # Single test file
pytest tests/test_recall.py::test_name # Single test function
./test.sh                              # Full suite: unit + integration + daemon startup

python3 -m claudia_memory              # Run daemon (MCP mode, stdio)
python3 -m claudia_memory --consolidate # Run just consolidation
python3 -m claudia_memory --tui        # Brain Monitor TUI dashboard
claudia-brain                          # Same TUI via entry point
curl http://localhost:3848/health      # Health check
```

### Working on the Visualizer

```bash
cd visualizer
npm install
npm start          # Production mode (Express serves static build on :3847)
npm run dev        # Dev mode with Vite HMR
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

## Gotchas

- **`openclaw-skills/` is repo-only** and not included in the npm package. It's for OpenClaw agent development only.
- **`visualizer/` IS in the npm package** (`files` array in `package.json`). It ships with `get-claudia` and is installed alongside `template-v2/` and `memory-daemon/`.
- **Obsidian vault sync** (`memory-daemon/claudia_memory/services/vault_sync.py`) is exposed via the `memory.vault` MCP tool (`sync`, `status`, `canvas`, `import` operations). The canvas generator writes `.canvas` files for Obsidian's graph view.
- **`schema.sql` splits on `;` at line endings.** `CREATE TRIGGER` with internal semicolons must go in `database.py` instead (see inline note in Adding a Database Migration).

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
│   │   ├── database.py      ← SQLite + sqlite-vec, migrations v1-v16
│   │   ├── schema.sql       ← 14+ table definitions
│   │   ├── config.py        ← Settings from ~/.claudia/config.json
│   │   ├── embeddings.py    ← Ollama 384-dim embedding generation
│   │   ├── language_model.py ← Local LLM client for cognitive tools
│   │   ├── mcp/server.py    ← 21 MCP tools (13 standalone + 8 merged, 28 hidden aliases)
│   │   ├── daemon/          ← Scheduler (APScheduler) + health check (port 3848)
│   │   ├── extraction/      ← Entity extraction (spaCy or regex fallback)
│   │   ├── tui/             ← Brain Monitor terminal dashboard (Textual)
│   │   └── services/        ← Remember, Recall, Consolidate, Ingest, Documents,
│   │                           Audit, Metrics, Verify, Guards, Filestore
│   ├── scripts/             ← Install, migrate, diagnose, seed scripts
│   ├── tests/               ← 25+ test files, pytest (asyncio_mode = auto)
│   └── test.sh              ← One-click full test suite
├── docs/                    ← Design plans and internal docs
│   └── plans/
├── openclaw-skills/          ← Standalone OpenClaw skills (not in npm package)
├── visualizer/               ← 3D brain graph (Express + Vite; ships with npm)
└── template/                 ← Legacy template (deprecated)
```
