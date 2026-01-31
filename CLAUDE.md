# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Claudia is an agentic executive assistant framework that runs on Claude Code. It has two core layers:

1. **Template layer** - Markdown files (skills, commands, rules, context) that define Claudia's personality, behaviors, and workflows. This is what gets copied to users' machines on install.
2. **Memory system** - A Python-backed daemon with SQLite, vector embeddings (sqlite-vec), and three service layers (remember, recall, consolidate) that give Claudia persistent, semantically searchable memory across sessions.

Both layers are core to how Claudia works. The template layer defines *who* Claudia is. The memory system defines *what she remembers*.

This repository contains:
- `bin/index.js` - NPM installer CLI that bootstraps new Claudia instances
- `template-v2/` - Current template with minimal seed files (recommended)
- `memory-daemon/` - Python memory system with SQLite database, vector search, and background services
- `template/` - Legacy template with pre-built examples
- `assets/` - Banner art and demo assets

For full architectural diagrams and pipeline explanations, see `ARCHITECTURE.md`.

## Architecture

### Template Layer

When users run `npx get-claudia`, the CLI copies `template-v2/` to their machine. When they run `claude` inside that directory, Claude reads the template files and becomes Claudia.

Installation flow:
1. CLI copies `template-v2/` to target directory
2. User runs `claude` to start conversation
3. Onboarding skill detects missing `context/me.md` and initiates discovery
4. Structure generator creates personalized folders/files based on user's archetype

**Skills** (`.claude/skills/`)
- Proactive behaviors that activate based on context
- Examples: `onboarding.md`, `commitment-detector.md`, `pattern-recognizer.md`
- Skills invoke other skills and use commands

**Commands** (`.claude/commands/`)
- User-invocable workflows via `/command-name`
- Examples: `/morning-brief`, `/meeting-prep`, `/capture-meeting`
- Commands read/write to context files and people files

**Rules** (`.claude/rules/`)
- Global behavioral principles in `claudia-principles.md`
- Always active, guide all interactions

**Context Files** (generated in `context/`)
- `me.md` - User profile (presence indicates onboarding complete)
- `commitments.md` - Active promises being tracked
- `waiting.md` - Items waiting on others
- `patterns.md` - Observed behavioral patterns
- `learnings.md` - Claudia's memory about working with this user

**People Files** (generated in `people/`)
- Relationship-centric organization
- Template-based structure for consistency
- Tracks communication history, commitments, sentiment

### Memory System (`memory-daemon/`)

The memory system is a standalone Python application that gives Claudia persistent, semantically searchable memory. It communicates with Claude Code via MCP (Model Context Protocol) over stdio.

**Database** - SQLite with sqlite-vec extension
- 10+ tables: entities, memories, relationships, patterns, predictions, episodes, messages, and more
- 3 vector tables (384-dimensional embeddings) for semantic search
- WAL mode for crash safety; content hashing for deduplication
- Per-project isolation via workspace folder hash
- Schema defined in `memory-daemon/claudia_memory/schema.sql`

**Service layers** (`memory-daemon/claudia_memory/services/`)
- `RememberService` - Stores facts, entities, relationships; generates embeddings; deduplicates
- `RecallService` - Semantic search with multi-factor ranking (60% vector similarity, 30% importance, 10% recency); rehearsal effect boosts accessed memories
- `ConsolidateService` - Importance decay, pattern detection (cooling relationships, overdue commitments, communication styles), prediction generation

**Background daemon** (`memory-daemon/claudia_memory/daemon/`)
- Scheduled consolidation tasks (hourly decay, 6-hourly pattern detection, daily full consolidation)
- Health check endpoint on port 3848
- Graceful shutdown with signal handling

**MCP tools** exposed to Claude Code (`memory-daemon/claudia_memory/mcp/server.py`):
- `memory.remember` - Store facts, preferences, observations, learnings
- `memory.recall` - Semantic search across all memories
- `memory.about` - Retrieve all context about a specific entity
- `memory.relate` - Create/strengthen relationships between entities
- `memory.predictions` - Get proactive suggestions and insights
- `memory.consolidate` - Trigger manual consolidation
- `memory.entity` - Create/update entity information
- `memory.search_entities` - Search entities by name or description
- `memory.buffer_turn` - Buffer a conversation turn for session capture
- `memory.end_session` - End session and create episode summary
- `memory.unsummarized` - Get buffered turns not yet summarized
- `memory.batch` - Batch multiple memory operations in one call
- `memory.trace` - Trace provenance and source history of a memory

**Dependencies:** Ollama (local embeddings via all-minilm:l6-v2 + optional cognitive models like Qwen3/SmolLM3), sqlite-vec, APScheduler, spaCy (optional NLP)

### Cognitive Tools (`memory-daemon/claudia_memory/extraction/` and `language_model.py`)

Optional local LLM pipeline for structured extraction from unstructured text. Uses Ollama models (Qwen3, SmolLM3, Llama 3.2) to extract entities and memories from meetings, emails, and documents.

- `LanguageModelService` (`language_model.py`) - Async/sync Ollama client for local LLM generation
- `EntityExtractor` (`extraction/entity_extractor.py`) - NLP extraction using spaCy (preferred) or regex fallback
- `IngestService` (`services/ingest.py`) - Orchestrates extraction: text goes in, structured entities/memories come out. Claude applies judgment to results.

Four extraction modes: meeting, email, document, general. All processing is local.

### Archetype System

Claudia detects user archetypes during onboarding:
- **Consultant/Advisor** - Multiple clients, deliverables, proposals
- **Executive/Manager** - Direct reports, initiatives, leadership
- **Founder/Entrepreneur** - Investors, team, product, fundraising
- **Solo Professional** - Mix of clients and projects
- **Content Creator** - Audience, content, collaborations

Each archetype gets custom folder structures and commands (see `template-v2/.claude/skills/structure-generator.md` for specifics).

## Development Workflow

### Testing the Installer

```bash
# From repo root
cd claudia
node bin/index.js ../test-install

# Or test in current directory
node bin/index.js .
```

### Modifying Templates

**Template v2 (current):**
- Edit files in `template-v2/`
- Changes apply to new installations only
- Test by creating fresh installation

**Key template files:**
- `template-v2/CLAUDE.md` - Claudia's core identity and behavior
- `template-v2/.claude/rules/claudia-principles.md` - Global principles
- `template-v2/.claude/skills/onboarding.md` - First-run experience
- `template-v2/.claude/skills/structure-generator.md` - Archetype structures

### Testing Onboarding Flow

To trigger onboarding in a Claudia instance:
1. Delete `context/me.md` from the instance
2. Start `claude` in that directory
3. Onboarding skill activates automatically

### Adding New Skills

1. Create `[skill-name].md` in `template-v2/.claude/skills/`
2. Follow structure of existing skills:
   - **Purpose** - What it does
   - **Triggers** - When it activates
   - **Behavior** - Detailed workflow
3. Update `template-v2/.claude/skills/README.md` if needed

### Adding New Commands

1. Create `[command-name].md` in `template-v2/.claude/commands/`
2. Define clear sections:
   - What to surface/do
   - Format/structure
   - Tone guidelines
   - Edge cases
3. Add to archetype-specific command lists in `structure-generator.md` if appropriate

### Working on the Memory Daemon

The memory system is a Python application in `memory-daemon/`.

```bash
# Set up development environment
cd memory-daemon
python -m venv venv
source venv/bin/activate
pip install -e ".[dev]"

# Run unit tests (uses asyncio_mode = auto via pyproject.toml)
pytest tests/
pytest tests/test_database.py -v     # Single test file

# One-click full test suite (unit + integration + daemon startup)
./test.sh

# Run the daemon directly (MCP mode, connects via stdio)
python -m claudia_memory

# Run just consolidation
python -m claudia_memory --consolidate

# Check health endpoint
curl http://localhost:3848/health
```

**Key files to know:**
- `schema.sql` - All table definitions. Change this when adding new data types.
- `services/remember.py` - Write path. How memories, entities, and relationships get stored.
- `services/recall.py` - Read path. Semantic search, scoring, and retrieval logic.
- `services/consolidate.py` - Background maintenance. Decay, pattern detection, predictions.
- `services/ingest.py` - Cognitive tool pipeline. Local LLM extraction of entities/memories from text.
- `mcp/server.py` - Tool definitions exposed to Claude Code. Add new MCP tools here.
- `language_model.py` - Ollama LLM client used by IngestService for cognitive extraction.
- `database.py` - Connection management, thread safety, helper methods.

**Migrating existing markdown data:**
```bash
python memory-daemon/scripts/migrate_markdown.py --dry-run
python memory-daemon/scripts/migrate_markdown.py
```

## Publishing

The package is published to NPM as `get-claudia`. Update version in:
- `package.json` (version field)
- `CHANGELOG.md` (add release notes)

Build tarball:
```bash
npm pack
```

Publish:
```bash
npm publish
```

## Important Design Principles

### Minimal Initial Structure
Template v2 provides only seed files. Structure grows organically based on user needs during onboarding.

### Personality Consistency
Claudia's voice is defined in `template-v2/CLAUDE.md` and `claudia-principles.md`. All skills and commands should maintain:
- Warm but professional tone
- Confidence with playfulness
- No em dashes (sign of lazy AI writing)
- Direct and clear communication

### Safety First
Every external action requires explicit user approval. This is non-negotiable and enforced in `claudia-principles.md`.

### Relationship-Centric
People files are the primary organizing unit. Projects and tasks come and go; relationships persist.

### Progressive Disclosure
Don't overwhelm users with structure upfront. Let complexity emerge from actual needs.

## File Locations Reference

```
claudia/
├── bin/index.js              ← CLI installer
├── package.json              ← NPM package config (name: get-claudia)
├── template-v2/              ← Current template (use this)
│   ├── CLAUDE.md            ← Claudia's core identity
│   └── .claude/
│       ├── commands/         ← User-invocable workflows
│       ├── skills/           ← Proactive behaviors
│       │   └── archetypes/  ← Archetype-specific configs
│       ├── rules/            ← Global principles
│       └── hooks/            ← Event handlers
├── memory-daemon/            ← Python memory system
│   ├── claudia_memory/
│   │   ├── __main__.py      ← Entry point
│   │   ├── database.py      ← SQLite + sqlite-vec connection management
│   │   ├── schema.sql       ← Database table definitions
│   │   ├── config.py        ← Settings and defaults
│   │   ├── embeddings.py    ← Ollama embedding generation (384-dim)
│   │   ├── language_model.py ← Local LLM client for cognitive tools
│   │   ├── mcp/server.py    ← MCP tool definitions (13 tools)
│   │   ├── daemon/          ← Scheduler and health check (port 3848)
│   │   ├── extraction/      ← Entity extraction (spaCy or regex)
│   │   └── services/        ← Remember, Recall, Consolidate, Ingest
│   ├── scripts/             ← Install and migration scripts
│   ├── tests/               ← Pytest suite (asyncio_mode = auto)
│   ├── test.sh              ← One-click test runner (unit + integration + daemon)
│   └── pyproject.toml       ← Python config (requires Python 3.10+)
└── template/                 ← Legacy template (deprecated)
```

## Common Modifications

**Changing onboarding questions:**
Edit `template-v2/.claude/skills/onboarding.md` Phase 2

**Adding new archetype:**
1. Create `template-v2/.claude/skills/archetypes/[name].md`
2. Add detection signals to `onboarding.md` Phase 3
3. Add folder structure to `structure-generator.md`
4. Define archetype-specific commands

**Modifying Claudia's personality:**
Edit `template-v2/CLAUDE.md` "How I Carry Myself" section

**Changing safety rules:**
Edit `template-v2/.claude/rules/claudia-principles.md` (requires strong justification)
