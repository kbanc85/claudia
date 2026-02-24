# ClawDia Desktop: Product Requirements Document

*Personal data lake meets proactive AI assistant. One app, every relationship, nothing forgotten.*

---

## 1. Product Vision

ClawDia is a desktop application that turns every piece of your digital life into a single, searchable, relationship-centric memory.

Today, your information lives in silos. Emails sit in Gmail. Meeting notes live in Fireflies or Granola. Calendar events are in Google Calendar. Conversations happen in chat. Each tool knows its own piece, but nothing connects them. You forget what was promised, lose track of who knows whom, and miss the patterns hiding in plain sight.

ClawDia changes this. Every data source feeds into one semantic memory. Emails become remembered facts. Meeting transcripts become tracked commitments. Calendar events become relationship touchpoints. All of it searchable by meaning, organized around people, and surfaced proactively when it matters.

This is not another AI chat wrapper. It is a personal data lake with a personality.

**The core insight:** The value is not in any single connector or any single AI conversation. The value is in the accumulation. After a month of use, ClawDia knows your world: who matters to you, what you owe them, how your relationships are trending, and what you are about to forget. No other tool does this because no other tool combines a relationship-centric memory system with the data ingestion reach of a desktop agent framework.

**Built on two proven foundations:**
- **Rowboat** (8,100 stars, Apache 2.0, YC S24) provides the shipping desktop app, agent framework, connectors, and MCP support
- **Claudia's memory daemon** (503 tests, 42+ releases, 16 database migrations) provides the intelligence that makes it different from everything else

---

## 2. Target Users

ClawDia serves professionals whose effectiveness depends on relationships and follow-through:

- **Consultants and advisors** juggling multiple client relationships, deliverables, and commitments across engagements
- **Executives and managers** tracking direct reports, initiatives, decisions, and the organizational web around them
- **Founders and entrepreneurs** managing investor relationships, team context, fundraising timelines, and partnership opportunities
- **Solo professionals** maintaining a personal practice where every client relationship is revenue
- **Content creators** mapping audience relationships, collaborator networks, and content pipelines

The common thread: people whose biggest risk is not incompetence but forgetting -- a promise made in a meeting two weeks ago, a relationship that quietly went cold, a pattern in their own behavior they cannot see from inside it.

---

## 3. Architecture Overview

ClawDia does not rebuild what already works. It takes Rowboat's proven desktop shell and fills it with Claudia's proven intelligence.

### How It Fits Together

```
ClawDia Desktop (Electron)
│
├── Rowboat Foundation (kept as-is)
│   ├── Desktop Shell
│   │   ├── Cross-platform (macOS, Windows, Linux)
│   │   ├── Background process management
│   │   ├── Type-safe IPC via Zod schemas
│   │   ├── Global search (Cmd+K / Ctrl+K)
│   │   ├── Tabbed interface with sidebar
│   │   └── Settings panel
│   │
│   ├── Agent Framework
│   │   ├── Conversation agent  ←── gets Claudia's personality + memory tools
│   │   ├── Task agents         ←── run background memory maintenance
│   │   ├── Pipeline agents     ←── data ingestion chains
│   │   └── Escalation agents   ←── error handling
│   │
│   ├── Connectors (all kept)
│   │   ├── Gmail sync
│   │   ├── Google Calendar sync
│   │   ├── Google Drive
│   │   ├── Fireflies (meeting transcripts)
│   │   ├── Granola (meeting notes)
│   │   ├── Composio (100+ SaaS tools)
│   │   └── MCP servers (external tools)
│   │
│   ├── LLM Support
│   │   ├── Anthropic (Claude) ← default
│   │   ├── OpenAI
│   │   ├── Google Gemini
│   │   ├── OpenRouter
│   │   └── Ollama (fully local)
│   │
│   └── UI Components
│       ├── Chat with streaming
│       ├── Knowledge tree / file browser
│       ├── Graph visualization
│       └── Settings panels
│
└── Deep Integration Layer (new)
    ├── Python Sidecar
    │   ├── Claudia memory daemon (MCP over stdio)
    │   ├── 21 MCP tools for memory operations
    │   ├── SQLite + sqlite-vec (single file, zero servers)
    │   ├── Health check on port 3848
    │   └── 3 scheduled jobs (decay, patterns, consolidation)
    │
    ├── Dedicated IPC Channels
    │   ├── clawdia:memory:recall    (semantic search for UI)
    │   ├── clawdia:memory:about     (entity detail for people page)
    │   ├── clawdia:memory:entities  (entity list/search)
    │   ├── clawdia:memory:graph     (relationship graph data)
    │   ├── clawdia:memory:temporal  (commitments, morning brief)
    │   └── clawdia:memory:health    (daemon status)
    │
    ├── Knowledge Ingestion Pipeline
    │   ├── Gmail sync output  ──→ cognitive.ingest ──→ memory.remember
    │   ├── Calendar events    ──→ entity extraction ──→ memory.relate
    │   ├── Meeting transcripts ─→ commitment detection ──→ memory.remember
    │   └── Any connector      ──→ same pipeline
    │
    ├── Personality Injection
    │   ├── 10 core principles from claudia-principles.md
    │   ├── Archetype-specific adaptations
    │   ├── Trust signaling (language shifts by confidence)
    │   └── Challenge-constructively behavior
    │
    └── Proactive Scheduler
        ├── Morning brief generation
        ├── Commitment check (overdue detection)
        ├── Relationship pulse (cooling alerts)
        └── System tray notifications
```

### The Data Lake Pattern

This is what makes ClawDia different from "Rowboat with a memory plugin." Every connector becomes a memory source:

1. **Gmail sync** runs on schedule, pulling new emails to `~/.rowboat/gmail_sync/`
2. **Ingestion pipeline** picks up new content and runs `cognitive.ingest` (LLM-powered entity extraction)
3. **Extracted facts** flow into `memory.remember` with `source_channel: "gmail"` and `origin_type: "extracted"`
4. **Entities and relationships** are created or strengthened automatically
5. **Overnight consolidation** detects patterns across all sources: the same person mentioned in emails, meetings, and calendar events gets a unified profile

The same pattern applies to every connector. Calendar events create relationship touchpoints. Meeting transcripts surface commitments. Composio actions feed context. Everything flows into one memory, searchable by meaning, organized around people.

**Dual storage:** Rowboat's existing markdown knowledge files remain (they work with Obsidian). Claudia's memory adds a semantic search layer on top. Users get both: browsable files and intelligent recall.

### What Gets Replaced

Rowboat's server dependencies are replaced with Claudia's lighter alternatives:

| Rowboat (current) | ClawDia (replacement) | Why |
|---|---|---|
| MongoDB (data storage) | SQLite + sqlite-vec | Single file, zero servers, 503 tests prove it works |
| Qdrant (vector search) | sqlite-vec | 2MB extension vs. separate server process |
| Redis (job queue) | APScheduler + SQLite state | One less server to install and maintain |
| Flat markdown vault | PARA-structured vault | Organized second brain (Active, Relationships, Reference, Archive) |

This eliminates three server processes users would otherwise need to install and keep running.

---

## 4. What Stays from Rowboat

Everything. This is a non-negotiable design principle. Rowboat is a shipping product with 8,100 stars of community validation. We extend it, we do not strip it.

### Desktop Shell
- Electron 39 with React 19, Vite 7, TailwindCSS, Radix UI
- Cross-platform installers (macOS, Windows, Linux)
- Background process management
- Type-safe IPC between renderer and main process via Zod schemas
- Global search (Cmd+K / Ctrl+K)
- Tabbed interface with sidebar navigation
- Settings panel and onboarding flow

### Agent Framework
- **Conversation agents** handle user-facing chat (this is where Claudia's personality lives)
- **Task agents** run internal work silently (memory maintenance, data processing)
- **Pipeline agents** chain multi-step operations (ingestion, extraction, storage)
- **Escalation agents** handle failures gracefully
- Agents communicate via @mentions and can be assigned specific tools and LLM models

### MCP Tool System
- First-class MCP client and server support
- Tools importable from external MCP servers
- Tools assignable to specific agents
- This is the natural connection point for Claudia's 21 memory tools

### Connectors
- Gmail (native OAuth integration)
- Google Calendar (native)
- Google Drive (native)
- Fireflies (meeting transcript ingestion)
- Granola (meeting note ingestion)
- Composio (100+ SaaS tools through one integration)
- Any MCP-compatible external tool server

### UI Components
- Chat interface with LLM streaming
- Knowledge tree / file browser
- Graph visualization
- File upload and document viewing
- Settings and configuration panels

### LLM Provider Support
- Anthropic Claude (default for ClawDia)
- OpenAI
- Google Gemini
- OpenRouter
- Ollama (fully local, no API key needed)
- All via Vercel AI SDK

---

## 5. What Gets Added

These capabilities do not exist in Rowboat. They are what makes ClawDia more than another AI desktop app.

### 5.1 Memory Daemon (Python Sidecar)

The memory daemon is Claudia's brain. It runs as a Python process alongside the Electron app, communicating via MCP over stdio.

**What it provides:**
- Persistent, semantically searchable memory across every session
- Hybrid search ranking: 50% vector similarity + 25% importance + 10% recency + 15% full-text search
- Content deduplication (cosine similarity > 0.92 triggers merge)
- 16 database migrations with integrity checks
- 19 SQLite tables covering entities, memories, relationships, patterns, episodes, reflections, audit trails
- Configurable embedding model (default: all-minilm:l6-v2 at 384 dimensions via Ollama)
- Health check endpoint on port 3848
- WAL mode for crash safety

**21 MCP tools exposed:**
- `memory.remember` / `memory.recall` / `memory.about` / `memory.relate` (core CRUD)
- `memory.temporal` (upcoming deadlines, morning digest, timeline)
- `memory.graph` (network view, hub entities, dormant relationships, path finding)
- `memory.entities` (create, search, merge, delete, overview)
- `memory.vault` (Obsidian sync, canvas generation)
- `memory.modify` (corrections, invalidation)
- `memory.session` / `memory.document` / `memory.provenance` (lifecycle, storage, audit)
- `cognitive.ingest` (LLM-powered entity extraction from text)
- Plus 28 backward-compatible aliases for older tool names

### 5.2 Personality Layer

ClawDia has a consistent character defined by 10 core principles:

- Warm but professional. Confident with playfulness.
- Challenges constructively without nagging
- Adapts communication style to user archetype while maintaining core identity
- Shifts language based on memory confidence ("You mentioned" vs. "I think" vs. "I have conflicting information")
- Every external action requires explicit user approval (non-negotiable safety rule)

**Archetype-specific adaptations:**
- **Consultants** get client health tracking, pipeline reviews, meeting prep focused on client context
- **Executives** get team relationship mapping, delegation tracking, board prep
- **Founders** get investor relationship tracking, runway awareness, hiring pipeline context
- **Solo professionals** get client relationship management, project tracking
- **Creators** get audience relationship tracking, content pipeline, collaboration mapping

Personality is injected into the conversation agent's system prompt at startup, composed from personality base + archetype overlay + user context.

### 5.3 Relationship Tracking

Every other AI tool organizes around tasks or documents. ClawDia organizes around people.

- **Attention tiers:** Tier 1 (active), Tier 2 (watch), Tier 3 (dormant) -- assigned automatically based on interaction frequency
- **Contact velocity:** Accelerating, stable, decelerating, or dormant -- tracks the trend, not just the last touchpoint
- **Relationship strength:** 0-1 scale combining frequency, depth, and recency
- **Cooling detection:** Automated alerts when someone drops tiers
- **Reconnection suggestions:** Context-aware reminders ("You last discussed the Acme proposal with Sarah three weeks ago")
- **Bi-temporal tracking:** Relationships have `valid_at`/`invalid_at` for historical accuracy

### 5.4 Commitment Detection

A proactive behavior running during every conversation:

- Catches explicit promises ("I'll send that by Friday")
- Catches implicit obligations ("I should follow up with Sarah about the proposal")
- Extracts deadlines when stated
- Tracks status: open, completed, overdue
- Escalating alerts: 48 hours before due, due today, past due
- No manual entry required -- detection is automatic

### 5.5 Pattern Recognition

Overnight consolidation surfaces what you cannot see from inside individual moments:

- Cooling relationships (contact velocity declining across weeks)
- Overcommitment patterns ("Third time this week you mentioned being stretched thin")
- Communication preferences (who prefers email vs. who prefers chat)
- Cross-entity connections (co-mentioned people without explicit relationships)
- Introduction opportunities (Person A has a skill Person B needs)

### 5.6 Morning Briefs

A daily summary surfacing what needs attention:

- Overdue commitments (escalating urgency)
- Relationships that are cooling
- Upcoming deadlines
- Patterns detected overnight
- Reconnection suggestions

Delivered via in-app notification with system tray alert.

### 5.7 PARA-Structured Vault

An Obsidian-compatible second brain, automatically maintained:

- **Active/** -- projects being worked on now
- **Relationships/** -- people and organizations with living profiles
- **Reference/** -- concepts, locations, reference material
- **Archive/** -- dormant entities and completed projects
- **Claudia's Desk/** -- MOC (Master of Concepts) files, patterns, reflections, session logs

Auto-generated index files, cross-linked with wiki-style backlinks. Canvas files for Obsidian's visual graph view. If ClawDia disappeared tomorrow, your knowledge lives on in plain markdown files you own.

### 5.8 3D Brain Visualizer

A force-directed graph rendering the entire relationship and knowledge network:

- People, projects, concepts, organizations as interactive nodes
- Relationships as edges with strength visualization
- Color-coded by attention tier
- Click-to-explore navigation
- Embedded in the app as a tab (existing Express + Vite + 3d-force-graph codebase)

---

## 6. New UI Pages

These pages extend Rowboat's existing UI with memory-powered views. All data comes through the dedicated IPC channels, not through the chat interface.

### 6.1 People Page

**Purpose:** Relationship CRM powered by memory.

**Features:**
- Sortable list of all people entities (by attention tier, contact velocity, last interaction)
- Detail view showing: relationship properties, interaction timeline, shared commitments, connected entities
- Contact trend sparkline (visual velocity indicator)
- Quick actions: log interaction, set reminder, view in graph
- Tier badges (Tier 1/2/3) with color coding
- Cooling alert indicators

**Data source:** `clawdia:memory:entities` (search, filter) + `clawdia:memory:about` (detail)

### 6.2 Commitments Page

**Purpose:** Track everything you owe and everything owed to you.

**Features:**
- Three sections: Overdue (red), Due This Week (amber), Open (neutral)
- Each commitment shows: what was promised, to whom, when detected, original context
- Status toggles: mark complete, snooze, dismiss
- Filter by person, project, or date range
- Chronological and priority sort options

**Data source:** `clawdia:memory:temporal` (upcoming operation)

### 6.3 Morning Brief View

**Purpose:** Start the day knowing what matters.

**Features:**
- Auto-generated daily digest
- Sections: commitments, cooling relationships, upcoming events, patterns noticed, reconnection suggestions
- Dismissable items with "I handled this" acknowledgment
- Configurable delivery time
- System tray notification when brief is ready

**Data source:** `clawdia:memory:temporal` (morning operation)

### 6.4 Memory Browser

**Purpose:** Semantic search across everything ClawDia knows.

**Features:**
- Search bar with natural language input ("What did Sarah say about the budget?")
- Results ranked by hybrid scoring (vector + importance + recency + FTS)
- Filter by: entity type, source channel (gmail, calendar, meeting, conversation), date range, origin type
- Each result shows: content, source, confidence, linked entities
- Click-through to original source when available

**Data source:** `clawdia:memory:recall`

### 6.5 Enhanced Graph View

**Purpose:** Extend Rowboat's existing graph with relationship intelligence.

**Features:**
- Existing Rowboat graph enhanced with memory relationship data
- Node sizing by relationship strength
- Edge coloring by velocity (warming/cooling)
- Attention tier color coding
- Hub entity detection and highlighting
- Path finding between entities ("How do I know this person?")
- Option to switch to 3D brain visualizer

**Data source:** `clawdia:memory:graph` (network, hubs, path operations)

### 6.6 Enhanced File Browser

**Purpose:** Extend Rowboat's file browser with PARA structure.

**Features:**
- Existing file browser enhanced with PARA organization
- Quick navigation: Active, Relationships, Reference, Archive
- Entity-linked files highlighted
- Vault sync status indicator
- One-click vault sync trigger

**Data source:** `clawdia:memory:vault` (status operation) + file system

---

## 7. Integration Points (Engineering Reference)

These are the specific places where Claudia's intelligence connects to Rowboat's codebase.

### 7.1 Personality Injection

**Where:** Rowboat's copilot agent (`packages/core/src/application/assistant/agent.ts`) has customizable instructions.

**What:** Compose a system prompt from:
- Claudia's core personality (adapted from `template-v2/CLAUDE.md`)
- 10 principles (from `claudia-principles.md`)
- Trust signaling rules (from `trust-north-star.md`)
- User's archetype overlay
- User context (name, preferences from onboarding)

**How:** System prompt builder runs at agent initialization. Reads personality files from app resources, user config from `~/.clawdia/config.json`, assembles and injects into the agent's instruction field.

### 7.2 Knowledge Graph to Memory Pipeline

**Where:** Rowboat's knowledge graph builder (`packages/core/src/knowledge/build_graph.ts`) polls source folders and creates markdown notes.

**What:** After creating markdown notes (existing behavior), ALSO feed extracted entities and facts into the memory daemon.

**How:** After `build_graph.ts` processes a source file:
1. Run `cognitive.ingest` on the extracted content
2. Store results via `memory.remember` with appropriate `source_channel` and `origin_type: "extracted"`
3. Create entity relationships via `memory.relate`
4. Markdown notes remain (dual storage) -- memory adds the semantic search layer

### 7.3 Memory Daemon Process Management

**Where:** Electron main process (`apps/main/src/main.ts`), service initialization.

**What:** Start, monitor, and restart the Python memory daemon alongside the app.

**How:**
1. On app launch, spawn `python3 -m claudia_memory` as child process
2. Register as MCP server in Rowboat's MCP client
3. Monitor health via port 3848 health check
4. Auto-restart on crash (with exponential backoff)
5. Graceful shutdown on app quit (send SIGTERM, wait, then SIGKILL)
6. Surface daemon status in settings UI

### 7.4 Dedicated IPC Channel Registration

**Where:** IPC handler registration (`apps/main/src/ipc.ts`), preload API surface (`apps/preload/src/preload.ts`), IPC schemas (`packages/shared/src/ipc.ts`).

**What:** New IPC channels for direct memory queries from the renderer, bypassing the agent framework for UI responsiveness.

**How:**
1. Define Zod schemas for each `clawdia:memory:*` channel in shared IPC types
2. Register handlers in main process that proxy to memory daemon MCP tools
3. Expose typed API in preload script
4. Renderer components call these directly for UI data (lists, searches, detail views)

### 7.5 DI Container Extension

**Where:** Awilix DI container (`packages/core/src/di/container.ts`).

**What:** Register memory daemon client, personality builder, and ingestion pipeline as injectable services.

**How:**
1. Add `MemoryDaemonClient` service (wraps MCP tool calls)
2. Add `PersonalityBuilder` service (composes system prompts)
3. Add `IngestionPipeline` service (connector output to memory)
4. Register in container alongside existing Rowboat services

---

## 8. Phased Delivery

### Phase 1: Fork + Memory Daemon (Weeks 1-3)

**Goal:** Forked app running locally with Claudia's memory operational.

| # | Task | Detail |
|---|------|--------|
| 1.1 | Fork and rebrand | Fork Rowboat repo. Rename references (package names, window title, about screen). Swap logo and accent colors. |
| 1.2 | Python sidecar process management | Add daemon spawn/monitor/restart logic in Electron main process. Health check polling. Graceful shutdown on app quit. |
| 1.3 | Register memory daemon as MCP server | Connect spawned daemon to Rowboat's MCP client. Verify tool discovery (21 tools appear in agent tool list). |
| 1.4 | Add dedicated memory IPC channels | Define Zod schemas for `clawdia:memory:*` channels. Register handlers in main process. Expose in preload. |
| 1.5 | Inject personality into copilot agent | Build system prompt composer. Load personality files from app resources. Inject into conversation agent instructions. |
| 1.6 | End-to-end verification | Chat creates memories (`memory.remember`). Recall surfaces relevant context (`memory.recall`). Personality is consistent. |

**Milestone:** App launches, chat works with memory context, LLM remembers and recalls across sessions.

### Phase 2: Memory UI Pages (Weeks 4-5)

**Goal:** Users can see and interact with their memory through dedicated UI pages.

| # | Task | Detail |
|---|------|--------|
| 2.1 | People page | Entity list with tier badges, contact velocity sparklines. Detail view with interaction timeline and connected entities. |
| 2.2 | Memory browser | Semantic search bar. Hybrid-ranked results with source, confidence, and entity links. Filter by type, channel, date. |
| 2.3 | Enhanced graph view | Add memory relationship data to existing graph. Node sizing by strength. Edge coloring by velocity. Hub detection. |
| 2.4 | Commitments page | Three-section layout (overdue, due this week, open). Status toggles. Filter by person and project. |
| 2.5 | Sidebar navigation | Add new pages to sidebar. Badge counts for overdue commitments and cooling relationships. |

**Milestone:** Users can browse people, search memories, view relationship graphs, and track commitments through the UI.

### Phase 3: Data Lake Pipeline (Weeks 6-7)

**Goal:** Every connector feeds into memory automatically.

| # | Task | Detail |
|---|------|--------|
| 3.1 | Adapt knowledge graph builder | After `build_graph.ts` creates markdown, also run `cognitive.ingest` and store results via `memory.remember`. Dual storage. |
| 3.2 | Gmail to memory pipeline | Gmail sync output runs through entity extraction. Emails become facts with `source_channel: "gmail"`. People, commitments, and topics extracted. |
| 3.3 | Calendar to memory pipeline | Calendar events create relationship touchpoints. Attendees linked as entities. Recurring meetings tracked for relationship velocity. |
| 3.4 | Meeting transcript pipeline | Fireflies and Granola output processed through commitment detection. Decisions, action items, and follow-ups stored. |
| 3.5 | Unified search | Combine Rowboat's file grep with Claudia's semantic recall. Single search bar returns both file matches and memory results. |
| 3.6 | PARA vault structure | Replace flat markdown vault with PARA organization. Auto-routing: projects to Active, people to Relationships, etc. |

**Milestone:** Emails, calendar events, and meeting transcripts automatically flow into memory. Search works across files and memories.

### Phase 4: Proactive Features (Weeks 8-9)

**Goal:** ClawDia tells users what they are missing before they ask.

| # | Task | Detail |
|---|------|--------|
| 4.1 | Morning brief generation | Daily digest assembled from commitments, cooling relationships, patterns, reconnection suggestions. Configurable delivery time. |
| 4.2 | System tray notifications | Morning brief alert. Overdue commitment escalation. Cooling relationship warnings. Configurable notification preferences. |
| 4.3 | Commitment check scheduler | Background scan for approaching and overdue commitments. Escalating urgency (48h before, due today, past due). |
| 4.4 | Relationship pulse | Periodic scan for tier changes. Cooling detection across all tracked people. Reconnection suggestions with context. |
| 4.5 | Morning brief view | Dedicated UI page for the daily digest. Dismissable items. "I handled this" acknowledgments. |
| 4.6 | Dashboard page | Status overview: active commitments count, cooling relationships, recent activity, memory stats, daemon health. |

**Milestone:** Users receive proactive alerts about commitments, relationships, and patterns without asking.

### Phase 5: Onboarding and Polish (Weeks 10-11)

**Goal:** A non-technical user can install and understand the app.

| # | Task | Detail |
|---|------|--------|
| 5.1 | First-run wizard | Name, LLM provider selection, API key entry (or Ollama detection). Archetype identification through guided questions. |
| 5.2 | Archetype-specific setup | After archetype detection: customize folder structure, enable relevant skills, adapt personality overlay. |
| 5.3 | Error handling | Daemon failure recovery (clear user messaging, retry logic). Missing Python detection with install guidance. Missing Ollama with fallback to API embeddings. |
| 5.4 | UI polish | Keyboard shortcuts for common actions. Dark mode support. Window size and position persistence. Loading states for memory queries. |
| 5.5 | Settings page extension | Memory configuration (embedding model, vault path, consolidation schedule). Daemon status and restart button. Data export/import. |

**Milestone:** First-time users can install, configure, and start using ClawDia without technical knowledge.

### Phase 6: Distribution (Weeks 12-14)

**Goal:** Downloadable installers for all platforms.

| # | Task | Detail |
|---|------|--------|
| 6.1 | Electron Forge packaging | macOS DMG (ARM + Intel universal), Windows NSIS installer, Linux AppImage. |
| 6.2 | Code signing | macOS notarization (Apple Developer certificate). Windows Authenticode signing. |
| 6.3 | Auto-updater | Electron's built-in auto-update with update server. Version checking on app launch. |
| 6.4 | Python bundling | PyInstaller or embedded Python runtime. Eliminates system Python requirement for end users. |
| 6.5 | CI/CD pipeline | GitHub Actions matrix: build and sign for macOS ARM/Intel, Windows x64, Linux x64. Automated release publishing. |
| 6.6 | Landing page and docs | Download page with platform detection. Getting started guide. FAQ covering LLM providers and privacy. |

**Milestone:** Users can download a single installer, run it, and have ClawDia working without installing Python, Ollama, or any other dependency manually.

---

## 9. Open Questions

These need decisions before or during implementation:

### Python Bundling Strategy

**Question:** How do we ship the Python memory daemon with the Electron app so users don't need Python installed?

**Options:**
- **PyInstaller** -- bundle daemon as single executable (~100MB added to installer, but zero Python dependency for users)
- **Embedded Python** -- ship minimal Python runtime with the app (smaller than PyInstaller, more control, more maintenance)
- **System Python requirement** -- require users to have Python 3.10+ installed (simplest for dev, worst for user experience)

**Recommendation:** Start with system Python during development (Phases 1-5). Switch to PyInstaller for Phase 6 distribution. The sidecar lifecycle pattern from Claudia2 informs process management either way.

### Embedding Model Fallback

**Question:** Ollama is required for local embeddings. What if users don't want to install it?

**Options:**
- **Ollama only** -- require it, provide clear install guidance
- **API-based fallback** -- offer OpenAI/Anthropic embedding APIs as alternative (costs money, requires internet)
- **Bundled ONNX** -- ship a small transformer model directly (~50MB, no external dependency)

**Recommendation:** Default to Ollama (consistent with Claudia v1). Add API-based embeddings as fallback in Phase 5. Consider ONNX for Phase 6 if bundle size is acceptable.

### Database Migration

**Question:** Do we replace Rowboat's MongoDB with Claudia's SQLite, or run both?

**Options:**
- **Full replacement** -- migrate all Rowboat data models to SQLite. Clean but significant engineering work.
- **Dual database** -- keep MongoDB for Rowboat's existing features, add SQLite for memory. Simpler integration but two databases to manage.
- **Gradual migration** -- start with dual database, migrate Rowboat models to SQLite over time.

**Recommendation:** Start with dual database. Claudia's memory lives in SQLite (its proven home). Rowboat's existing features keep MongoDB initially. Migrate Rowboat to SQLite in a later phase if the dual-database approach creates maintenance burden. This reduces Phase 1 risk significantly.

### Branding

**Question:** Final name and visual identity.

**Considerations:**
- "ClawDia" is the working name (portmanteau of Claudia + paw/claw metaphor)
- Need logo, color palette, app icon, installer branding
- Must be distinct from both Rowboat and Claudia v1
- Domain availability and trademark search needed

**Decision needed:** Confirm name and commission visual identity before Phase 1.

### License

**Question:** What license for the ClawDia fork?

**Considerations:**
- Rowboat is Apache 2.0 (allows any use, modification, redistribution, commercial use)
- Claudia memory daemon is currently MIT
- Fork must comply with Apache 2.0 attribution requirements
- Commercial distribution is allowed under both licenses

**Recommendation:** Apache 2.0 for the fork (matches upstream, simplest compliance). Include Rowboat attribution in about screen and license file.

### Composio Dependency

**Question:** Composio provides 100+ tool integrations but is a third-party service. How critical is it?

**Considerations:**
- Composio is a dependency, not a core component
- Individual connector failures should not affect core memory functionality
- Users who don't need Composio tools shouldn't be affected by its presence

**Recommendation:** Keep as optional integration. Graceful degradation if Composio is unavailable. Core memory + native connectors (Gmail, Calendar, Fireflies, Granola) work independently.

---

## 10. Success Metrics

### Phase 1 Complete
- App launches on macOS, Windows, Linux
- Chat creates and recalls memories across sessions
- Personality is present and consistent
- Memory daemon starts and stops cleanly with app lifecycle

### Phase 3 Complete
- At least 3 connector pipelines feeding into memory automatically
- Unified search returns results from both files and memory
- People page shows entities from multiple sources (email + calendar + conversations)

### Phase 6 Complete (Product Launch)
- A non-technical user can download, install, and be productive in under 10 minutes
- Memory accumulates passively from connected data sources
- Morning briefs surface actionable items without user prompting
- Commitment tracking catches promises without manual entry
- All data stays local (zero cloud dependencies for core functionality)

---

## 11. What We Are NOT Building

Clarity about scope is as important as the feature list:

- **Not a SaaS product.** No cloud backend, no user accounts, no hosted data. Everything runs locally.
- **Not a team tool.** ClawDia is a personal assistant for one person. Multi-user collaboration is out of scope.
- **Not replacing Rowboat's agent framework.** We extend it, we do not rewrite it. Rowboat's agent routing, tool system, and MCP support stay exactly as they are.
- **Not building new connectors.** We use Rowboat's existing connectors (Gmail, Calendar, Drive, Fireflies, Granola, Composio, MCP). New connectors come from upstream Rowboat or third-party MCP servers.
- **Not adding voice.** Claudia2's untested 807-line Rust voice pipeline stays behind. Voice can be added later via an MCP server if demand warrants it.
- **Not rebuilding the memory daemon.** Claudia's memory system has 503 tests and 42+ releases. We integrate it as-is, not rewrite it in TypeScript or Rust.

---

## 12. Source File Reference

### Rowboat (fork from github.com/rowboatlabs/rowboat)

| File | Purpose | Integration Point |
|------|---------|-------------------|
| `apps/x/apps/main/src/main.ts` | Electron lifecycle, service init | Sidecar process management |
| `apps/x/apps/main/src/ipc.ts` | IPC handler registration | `clawdia:memory:*` channels |
| `apps/x/apps/preload/src/preload.ts` | Renderer API surface | Memory query API |
| `apps/x/packages/shared/src/ipc.ts` | Zod IPC schemas | Memory channel types |
| `apps/x/packages/core/src/application/assistant/agent.ts` | Copilot agent | Personality injection |
| `apps/x/packages/core/src/knowledge/build_graph.ts` | Knowledge graph builder | Memory ingestion pipeline |
| `apps/x/packages/core/src/mcp/` | MCP client | Memory daemon connection |
| `apps/x/packages/core/src/di/container.ts` | Awilix DI container | Service registration |
| `apps/x/apps/renderer/src/components/` | UI components | Extended pages |

### Claudia Memory Daemon (integrate from this repo)

| File | Purpose | Role in ClawDia |
|------|---------|-----------------|
| `memory-daemon/claudia_memory/__main__.py` | Entry point | Sidecar process target |
| `memory-daemon/claudia_memory/mcp/server.py` | 21 MCP tools | Agent + IPC tool source |
| `memory-daemon/claudia_memory/database.py` | SQLite + migrations | Data layer |
| `memory-daemon/claudia_memory/schema.sql` | 19 tables | Schema definition |
| `memory-daemon/claudia_memory/services/recall.py` | Hybrid search | Memory browser backend |
| `memory-daemon/claudia_memory/services/remember.py` | Memory storage | Ingestion pipeline target |
| `memory-daemon/claudia_memory/services/consolidate.py` | Background intelligence | Overnight processing |
| `memory-daemon/claudia_memory/services/ingest.py` | Entity extraction | Connector pipeline |
| `memory-daemon/claudia_memory/daemon/health.py` | Health check server | Process monitoring |
| `memory-daemon/claudia_memory/config.py` | ~100 settings | Configuration surface |

### Claudia Personality (inject into copilot agent)

| File | Purpose |
|------|---------|
| `template-v2/CLAUDE.md` | Full personality definition |
| `template-v2/.claude/rules/claudia-principles.md` | 10 core principles |
| `template-v2/.claude/rules/trust-north-star.md` | Provenance tracking rules |
| `template-v2/.claude/skills/commitment-detector.md` | Commitment detection behavior |
| `template-v2/.claude/skills/pattern-recognizer.md` | Pattern recognition behavior |
| `template-v2/.claude/skills/structure-generator.md` | Archetype-specific setup |
