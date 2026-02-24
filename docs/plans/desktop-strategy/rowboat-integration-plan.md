# Rowboat Integration Plan: How the Fork Would Work

*This document outlines the concrete strategy for building a Claudia desktop app on top of Rowboat's open-source foundation. It's more technical than the strategy overview, but written to be understood by anyone following along.*

---

## Rowboat at a Glance

| Detail | Value |
|--------|-------|
| Repository | github.com/rowboatlabs/rowboat |
| Stars | 8,100+ |
| License | Apache 2.0 (fork, modify, sell freely) |
| Version | v0.1.57 (February 2026) |
| Core team | 4 developers (1,365 total commits) |
| Backed by | Y Combinator S24, $500K seed |
| Desktop | Electron 39 + React 19 + Vite 7 |
| Backend | Next.js with React Server Components |
| Databases | MongoDB, Qdrant (vectors), Redis (jobs) |
| AI support | OpenAI, Anthropic, Gemini, OpenRouter, Ollama |
| Knowledge | Obsidian-compatible markdown vault |
| Integrations | Gmail, Calendar, Drive, Granola, Fireflies, MCP, Composio (100+ tools) |

---

## What We Keep from Rowboat

These are proven components we use as-is or with light modification:

### The Desktop Shell

Rowboat's Electron app provides:
- Cross-platform distribution (macOS, Windows, Linux) with downloadable installers
- Background process management (agents can run when the app is minimized)
- Type-safe IPC between frontend and backend via Zod schemas
- Global search (Cmd+K / Ctrl+K)
- Tabbed interface with sidebar navigation
- Settings panel and onboarding flow

We rebrand the shell as Claudia and customize the UI, but the infrastructure stays.

### The Agent Framework

Rowboat has four agent types that we keep:

1. **Conversation agents** -- the user-facing agent that handles direct chat. This becomes Claudia's primary personality interface.
2. **Task agents** -- internal specialists that do work without talking to the user. Perfect for Claudia's background memory operations (consolidation, pattern detection).
3. **Pipeline agents** -- sequential processors for multi-step data flows. Ideal for Claudia's ingestion pipeline (extract facts, find entities, score importance, store).
4. **Escalation agents** -- fallback handlers when something fails. Useful for graceful error handling.

Agents already communicate via @mentions and can be assigned specific tools and LLM models.

### MCP Tool System

Rowboat has first-class MCP support. This is critical because Claudia's memory daemon already exposes 21 MCP tools. The integration path is natural:

- Rowboat can import tools from external MCP servers
- Tools can be assigned to specific agents
- Claudia's memory tools (recall, remember, about, relate, briefing, etc.) plug directly into this system

### Integrations

We keep all of Rowboat's existing integrations:
- Gmail, Google Calendar, Google Drive (native)
- Granola and Fireflies (meeting transcription ingestion)
- Composio (100+ SaaS tools)
- MCP (external tool servers)

These extend Claudia's reach without us building connector code.

### UI Components

Rowboat's React 19 + TailwindCSS + Radix UI component library gives us:
- Chat interface with streaming
- Knowledge tree navigation
- Graph visualization (which we can enhance with Claudia's 3D visualizer)
- File upload and document viewing
- Settings and configuration panels

---

## What We Replace

These are the major substitutions where Claudia's approach is proven superior:

### MongoDB to SQLite + sqlite-vec

**Why:** Rowboat requires a MongoDB server for data storage. This is heavy -- MongoDB is a server process that needs to be installed, configured, and kept running. Claudia's SQLite approach is a single file, zero configuration, zero server process.

**What changes:**
- All data models move from MongoDB collections to SQLite tables
- Claudia's existing 16-migration schema handles the data layer
- The database file lives at `~/.claudia/memory/claudia.db`
- WAL mode provides crash safety and concurrent read access
- Per-project isolation via workspace folder hashing

**What we gain:** Dramatically simpler deployment, smaller footprint, no server process, proven crash recovery, 503 tests covering the data layer.

### Qdrant to sqlite-vec

**Why:** Rowboat uses Qdrant (a separate vector database server) for semantic search and RAG. This is another server dependency. Claudia does the same work with sqlite-vec, a 2MB SQLite extension.

**What changes:**
- Vector embeddings stored in sqlite-vec virtual tables (384-dimensional by default)
- Hybrid ranking: 50% vector similarity + 25% importance + 10% recency + 15% full-text search
- Duplicate detection at cosine > 0.92
- Embedding model configurable (default: all-minilm:l6-v2 via Ollama)
- Embedding migration tooling included for model switches

**What we gain:** No separate vector database to manage, proven hybrid ranking that outperforms pure vector search, 2MB instead of hundreds of MB.

### Redis to SQLite-Based Job Queue

**Why:** Rowboat uses Redis for job queuing and caching. Another server dependency.

**What changes:**
- Scheduled jobs (consolidation, decay, pattern detection) managed by APScheduler with SQLite-backed state
- Only 3 scheduled jobs needed: daily_decay (2 AM), pattern_detection (every 6h), full_consolidation (3 AM)
- Embedding cache: thread-safe LRU (256 entries) with SHA256 keys, in-memory

**What we gain:** One less server to run. The job system is already proven in 42+ releases.

### Markdown Vault to PARA-Structured Vault

**Why:** Rowboat's knowledge vault uses flat markdown with wiki-style backlinks. Claudia's vault uses the PARA organizational framework, which is more structured and integrates with Obsidian's graph view.

**What changes:**
- Vault organized as Active/, Relationships/, Reference/, Archive/ plus Claudia's Desk/
- Auto-generated MOC (Master of Concepts) files for People, Commitments, Projects
- Index files in each subfolder
- Canvas files for Obsidian graph visualization
- Entity routing: attention_tier=archive or contact_trend=dormant goes to Archive, otherwise routed by type

**What we gain:** A second brain that's actually organized, not just a pile of markdown files. Users own their data in a structure that works with or without Claudia.

---

## What We Add from Claudia

These are the capabilities that don't exist in Rowboat and make Claudia special:

### Memory Daemon (Python Sidecar)

The memory daemon is Claudia's brain. It runs as a Python sidecar process alongside the Electron app.

**Architecture:**
- Python 3.10+ process started by the Electron app on launch
- Communicates via MCP over stdio (same protocol Rowboat already supports)
- Exposes 21 MCP tools for memory operations
- Manages its own SQLite database independently
- Health check endpoint for monitoring
- Auto-restart on crash with hook-based recovery

**Services included:**
- `remember.py` -- Store facts, entities, relationships with provenance (~3,000 lines)
- `recall.py` -- Hybrid semantic search with rehearsal effects (~2,500 lines)
- `consolidate.py` -- Background intelligence: decay, patterns, merging (~2,800 lines)
- `health.py` -- System status and diagnostics
- `vault_sync.py` -- Obsidian vault generation and sync
- `embedding.py` -- Ollama-based embedding with caching

**Integration approach:**
- Electron's main process spawns the Python daemon on app start
- MCP tools registered as available tools in Rowboat's agent framework
- Conversation agent gets memory tools (recall, about, remember)
- Background task agent gets maintenance tools (consolidate, briefing)

### Personality Layer

Claudia has a consistent identity. This needs to be injected into the conversation agent's system prompt.

**What gets added:**
- Core personality principles (10 rules from `claudia-principles.md`)
- Writing style guidelines (warm, professional, no em-dashes, confident with playfulness)
- Trust signaling patterns (language shifts based on memory confidence)
- Challenge-constructively behavior (pushes back without nagging)
- Archetype-specific adaptations (different focus areas for Consultants, Executives, Founders, Solo, Creators)

**How it works:**
- On first run, the onboarding wizard identifies the user's archetype
- System prompt composed from personality base + archetype overlay + user context
- Personality consistent across all interactions, regardless of which agent handles the message

### Relationship Tracking

Rowboat has a knowledge graph but no relationship intelligence. Claudia adds:

- **Attention tiers** (Tier 1/2/3) based on interaction frequency
- **Contact velocity** (accelerating/stable/decelerating/dormant)
- **Relationship strength** (0-1 scale combining frequency, depth, recency)
- **Cooling detection** with automated alerts
- **Reconnection suggestions** with contextual reminders
- **Relationship properties** (type, strength, valid_at/invalid_at with temporal tracking)

### Commitment Detection

A proactive skill that runs during every conversation:

- Catches explicit promises ("I'll send that by Friday")
- Catches implicit obligations ("I promised Sarah I'd review the proposal")
- Extracts deadlines when stated
- Tracks status: open, completed, overdue
- Escalating alerts: 48 hours before, due today, past due
- Morning brief integration

### Pattern Recognition

Overnight consolidation detects:

- Cooling relationships (contact velocity declining)
- Overdue commitments (deadline passed)
- Communication preferences (email vs. chat patterns)
- Cross-entity patterns (co-mentioned people without explicit connections)
- Behavioral patterns (overcommitting, procrastination, energy mapping)
- Introduction opportunities (Person A has what Person B needs)

### Morning Briefs

A daily summary surfacing:
- Active commitments (overdue first, then due this week, then open)
- Cooling relationships (who you haven't talked to)
- Recent activity summary
- Patterns noticed
- Reconnection suggestions

### 3D Brain Visualizer

The existing force-directed graph visualizer (Express + Vite + 3d-force-graph):
- Can be embedded in the Electron app as a tab or window
- Renders people, projects, concepts, organizations as interactive nodes
- Color-coded by attention tier
- Edge strength visualization
- Click-to-explore navigation

---

## What We Salvage from Claudia2

These good ideas from the abandoned rebuild deserve to live on:

### Sidecar Lifecycle Pattern
Claudia2's approach to starting, monitoring, and restarting the Python sidecar alongside the desktop app. The pattern is sound even though the implementation wasn't tested.

### Onboarding Wizard
The 7-step first-run flow: welcome, archetype identification, priority discovery, relationship mapping, tool preferences, folder structure proposal, confirmation. This UX concept adapts to Rowboat's existing onboarding infrastructure.

### CI/CD Matrix
GitHub Actions matrix builds for macOS ARM/Intel, Windows x64, Linux x64. The build pipeline design is reusable even with Electron instead of Tauri.

### Diagnostic Logging
Structured logging patterns for debugging the sidecar-desktop communication layer.

---

## Integration Phases

### Phase 1: Foundation (Weeks 1-3)

**Goal:** Fork running locally with Claudia's database layer.

1. Fork Rowboat repository
2. Remove MongoDB, Qdrant, and Redis dependencies
3. Integrate SQLite + sqlite-vec as the data layer
4. Adapt Rowboat's data models to Claudia's schema
5. Get the desktop app launching with the new database backend
6. Verify existing UI components work with the new data layer

**Milestone:** App launches, you can chat with an LLM, data persists in SQLite.

### Phase 2: Memory Integration (Weeks 3-5)

**Goal:** Claudia's memory system fully operational inside the desktop app.

1. Integrate the Python memory daemon as a sidecar process
2. Register Claudia's MCP tools in Rowboat's agent framework
3. Wire the conversation agent to use recall/remember tools
4. Set up background task agent for consolidation
5. Configure the 3 scheduled jobs (decay, patterns, consolidation)
6. Test the remember-recall-consolidate pipeline end-to-end

**Milestone:** Conversations create memories, memories are recalled in context, consolidation runs overnight.

### Phase 3: Claudia's Soul (Weeks 5-7)

**Goal:** The app feels like Claudia, not like Rowboat.

1. Inject Claudia's personality into the conversation agent's system prompt
2. Build the onboarding wizard (archetype detection, priority discovery)
3. Add commitment detection as a proactive skill
4. Add relationship tracking with attention tiers and cooling alerts
5. Add morning brief generation
6. Customize the UI with Claudia's branding and color scheme

**Milestone:** First complete Claudia experience in a desktop app.

### Phase 4: Polish and Ship (Weeks 7-10)

**Goal:** Ready for early users.

1. Add pattern recognition and proactive alerts
2. Integrate the 3D brain visualizer as an app tab
3. Set up PARA vault sync for Obsidian users
4. Build CI/CD pipeline for cross-platform builds
5. Test on macOS, Windows, Linux
6. Create installer packages and auto-update mechanism
7. Write user documentation and first-run guidance

**Milestone:** Downloadable desktop app that a non-technical user can install and use.

---

## Technical Decisions to Make

These are questions that need answers during implementation:

### Electron vs. Tauri

Rowboat uses Electron (100+ MB bundle, higher memory usage). Tauri (which Claudia2 attempted) produces smaller bundles (~10-15MB) with lower memory usage, but the integration work is harder because Rowboat's entire frontend assumes Electron.

**Recommendation:** Keep Electron for the fork. Switching to Tauri means rewriting Rowboat's IPC layer, desktop integration, and build pipeline. That's weeks of work for a smaller binary. Optimize later if bundle size becomes a user complaint.

### React vs. Svelte

Rowboat uses React 19. Claudia2 used Svelte 5. Do we keep React or migrate?

**Recommendation:** Keep React. The entire Rowboat UI component library is React. Migrating to Svelte means rewriting every component. Not worth it for a fork. Claudia2's Svelte components were never tested anyway.

### LLM Provider Strategy

Rowboat already supports OpenAI, Anthropic, Gemini, OpenRouter, and Ollama via Vercel AI SDK.

**Recommendation:** Keep Rowboat's multi-provider approach. Default to Anthropic (Claude is what users expect from "Claudia"), but let users choose. Ollama support is important for users who want fully local operation.

### Python Sidecar Packaging

The memory daemon is Python 3.10+. How do we bundle it with the Electron app?

**Options:**
- **PyInstaller:** Bundle Python into a single executable. Claudia2 planned this. Adds ~100MB to the installer but eliminates the Python dependency.
- **Embedded Python:** Ship a minimal Python runtime with the app. Smaller than PyInstaller, more control.
- **System Python requirement:** Require users to have Python installed. Simplest for development, worst for user experience.

**Recommendation:** Start with system Python requirement for early development. Switch to PyInstaller for distribution. The sidecar lifecycle pattern from Claudia2 informs how to manage the process.

### Embedding Model

Claudia v1 uses Ollama with all-minilm:l6-v2 (384 dimensions). This requires Ollama to be installed.

**Options:**
- **Keep Ollama:** Proven, supports model switching, but adds a dependency.
- **ONNX runtime:** Bundle a small transformer model directly. No external dependency, but limited to one model.
- **API-based embeddings:** Use OpenAI or Anthropic embedding APIs. Simplest, but costs money and requires internet.

**Recommendation:** Default to Ollama (consistent with v1), but add API-based embeddings as a fallback for users who don't want to install Ollama. The embedding layer in Claudia is already abstracted enough to support multiple backends.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Rowboat's API changes in future versions | Medium | Medium | Pin to v0.1.57 initially. Track upstream changes. Cherry-pick useful updates. |
| SQLite performance at scale | Low | Medium | Already proven in v1 with 503 tests. WAL mode handles concurrent access. |
| Python sidecar packaging complexity | Medium | High | Start with system Python. Switch to PyInstaller before public release. |
| Rowboat team pivots or abandons project | Low | Medium | Apache 2.0 license means fork is fully independent. We don't depend on upstream. |
| User confusion about Ollama requirement | Medium | Medium | Clear onboarding wizard. Fallback to API embeddings. |
| Electron bundle size complaints | Low | Low | Standard for desktop apps. Optimize later if needed. |

---

## What Success Looks Like

**Week 3:** A forked Rowboat app running locally with SQLite instead of MongoDB. Chat works, data persists.

**Week 5:** Claudia's memory is alive inside the app. Conversations create memories. Recall surfaces relevant context. Consolidation runs in the background.

**Week 7:** The app feels like Claudia. Personality is present. Commitments are caught. Relationships are tracked. Morning briefs are generated.

**Week 10:** A downloadable desktop app that a non-technical user can install on Mac, Windows, or Linux, start a conversation, and experience an AI that remembers them, knows their people, and tells them what they're missing.

---

## Summary

The fork strategy works because both codebases are proven in their domains:

- **Rowboat** proves that a desktop AI coworker app can ship, scale, and serve users.
- **Claudia** proves that relationship-centric memory, proactive intelligence, and trust provenance make AI genuinely useful.

Neither could build what the other has in a reasonable timeframe. Together, they fill each other's gaps perfectly.
