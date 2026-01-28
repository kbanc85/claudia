# Changelog

All notable changes to Claudia will be documented in this file.

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
