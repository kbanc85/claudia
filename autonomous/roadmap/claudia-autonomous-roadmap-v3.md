<!--
SOURCE OF TRUTH, v3. Treat this file as immutable.
Any updates to the roadmap go into a new v4 file in this directory,
not by editing this one. Derived artefacts (CHECKLIST.md, phases/*,
risks/risk-register.md) should be regenerated from the newer version.
Original filename: claudia-autonomous-roadmap-v3.md
Committed: 2026-04-08
-->

# Claudia Autonomous: implementation roadmap v3

*Standalone reference for Claude Code development sessions. Every task is self-contained with exact file paths, success criteria, and rollback instructions.*

**Product**: Fork Hermes Agent v0.7.0 (MIT, commit `abf1e98`, released April 3, 2026), rebrand completely to Claudia, infuse with Claudia's chief-of-staff intelligence. Ship as `npx get-claudia --agent`.

**Constraints decided**:
- Dev team is Claude Code (parallel sessions, each needs self-contained context)
- No deadline, ship when solid
- Product for subscribers, community, and public
- Permanent fork, own repo (`kbanc85/claudia-autonomous`), no upstream contribution
- No migration from Claudia v1, this is a new product
- Full capability on frontier models, graceful "Claudia Lite" on local models
- Server deployment target (Mac Mini, VPS, cloud VM), 24/7 operation
- OpenRouter as primary provider model selector preserved
- 12 core skills for MVP, rest archived
- SQLite + local vector embeddings for memory, Obsidian sync deferred
- `/brain` visualiser ships in MVP
- Meeting intelligence (Otter/Granola/Fathom) ships post-MVP as user tutorial

---

## Critical discovery: Hermes v0.7.0 changes the game

Hermes shipped a **pluggable memory provider interface** on April 3, 2026 (PR #4623). Memory backends now implement a simple provider ABC and register via the plugin system. This means Claudia's hybrid memory system can be implemented as a memory provider plugin rather than replacing the memory tool wholesale. The integration path just got dramatically cleaner.

The v0.7.0 release also includes gateway hardening (race conditions, approval routing, flood control), credential pool rotation, and the Camofox anti-detection browser. All of this comes free with the fork.

---

## Hermes codebase: what you're forking

**Root-level files requiring rename** (the word "hermes" appears in filenames):
- `hermes` (CLI entry point script)
- `hermes_constants.py` (16 lines, API URLs)
- `hermes_state.py` (session DB, FTS5 search)
- `hermes_time.py` (timezone utilities)
- `setup-hermes.sh` (installer script)

**Directories requiring rename**:
- `hermes_cli/` (CLI package, env_loader, plugins, commands)

**Key architectural files** (rename internal references only):
- `run_agent.py` (6,933 lines, the AIAgent class, ReAct loop, 90-iteration budget, subagent delegation)
- `model_tools.py` (386 lines, tool registry orchestration, discovery)
- `toolsets.py` (toolset resolution and validation)
- `cli.py` (CLI entry point)
- `batch_runner.py` (trajectory generation)
- `utils.py` (shared utilities)

**Directories to keep structurally intact**:
- `agent/` (prompt_builder, model_metadata, context_compressor, prompt_caching, usage_pricing, display, trajectory)
- `tools/` (~20 tool modules including memory_tool, browser_tool, terminal_tool, delegate_tool, file_tools, etc.)
- `gateway/` (Telegram, Discord, Slack, WhatsApp, Signal, Email)
- `cron/` (scheduler with job storage)
- `skills/` + `optional-skills/`
- `plugins/` (plugin system with hooks)
- `environments/` (local, Docker, SSH, Daytona, Singularity, Modal backends)
- `honcho_integration/` (user modelling)
- `docs/` (full rewrite needed)

**Directories to remove entirely**:
- `landingpage/` (Hermes landing page)
- `website/` (Hermes website)
- `datagen-config-examples/` (research tooling, not relevant)
- `mini-swe-agent/` (submodule, SWE benchmark tooling)
- `tinker-atropos/` (submodule, RL training)
- `acp_adapter/` and `acp_registry/` (ACP protocol, evaluate later)

**Config directory**: `~/.hermes/` becomes `~/.claudia/`
- `SOUL.md` (persona, replaced with Claudia identity)
- `MEMORY.md` (active memory, replaced by Claudia hybrid system)
- `USER.md` (user preferences, replaced by Claudia relational model)
- `skills/` (user skills)
- `cli-config.yaml` (model, provider, toolset config)

---

## Claudia codebase: what you're infusing

**`template-v2/`** contains 41 markdown skill files defining:
- Identity and personality (chief-of-staff, female persona, proactive, strategic)
- Behavioural rules (approval gates, source attribution, judgment application)
- 12 core skills for MVP:
  1. `claudia-draft` (email composition, highest usage)
  2. `morning-brief` (daily orientation)
  3. `inbox-check` (email monitoring)
  4. `research` / `cross-reference-research` (information lookup)
  5. `capture-meeting` (transcript processing)
  6. `draft-reply` (email replies)
  7. `commit-commands` (git operations)
  8. `meeting-prep` (pre-call briefings)
  9. `new-person` (relationship creation)
  10. `send-followup` (post-meeting follow-ups)
  11. `what-am-i-missing` (risk/gap detection)
  12. `weekly-review` (guided reflection)

**`memory-daemon/`** contains the Python memory system:
- SQLite database with vector storage
- Ollama embeddings (all-minilm:l6-v2)
- Hybrid ranking: 50% vector similarity, 25% importance, 10% recency, 15% FTS + rehearsal boost
- Entity CRUD (people, organisations, projects)
- Relationship tracking with health scores
- Commitment lifecycle management
- Provenance chains
- Adaptive decay and consolidation
- Session narratives
- 756 passing tests

**`bin/`** contains the npm installer (`npx get-claudia`)

**`assets/`** contains branding (banner GIF, logos)

---

## Phase 0: Fork, security baseline, and test harness (5 days)

### Objective
Clean fork with no user-facing "hermes" references, known security baseline, and test infrastructure ready for all subsequent phases.

### Task 0.1: Clone and create repo
```bash
git clone https://github.com/NousResearch/hermes-agent.git claudia-autonomous
cd claudia-autonomous
rm -rf .git
git init
git remote add origin https://github.com/kbanc85/claudia-autonomous.git
```

Remove submodules (not needed):
```bash
rm -rf mini-swe-agent/ tinker-atropos/ .gitmodules
```

Remove directories not needed:
```bash
rm -rf landingpage/ website/ datagen-config-examples/ acp_adapter/ acp_registry/
```

**Success**: Clean directory, git initialised, no submodules.

### Task 0.2: Build curated rebrand map

Create `rebrand-map.csv` with four columns: `original`, `replacement`, `scope`, `notes`.

**Filename renames** (structural):
| Original | Replacement |
|---|---|
| `hermes` (root script) | `claudia` |
| `hermes_constants.py` | `claudia_constants.py` |
| `hermes_state.py` | `claudia_state.py` |
| `hermes_time.py` | `claudia_time.py` |
| `hermes_cli/` | `claudia_cli/` |
| `setup-hermes.sh` | `setup-claudia.sh` |
| `RELEASE_v0.2.0.md` | Remove |
| `RELEASE_v0.3.0.md` | Remove |
| `AGENTS.md` | Rewrite for Claudia |

**String replacements** (inside files, case-sensitive):
| Original | Replacement | Notes |
|---|---|---|
| `hermes-agent` | `claudia-autonomous` | Package name, repo refs |
| `hermes_agent` | `claudia_autonomous` | Python package references |
| `Hermes Agent` | `Claudia` | Display name |
| `Hermes agent` | `Claudia` | Display name variant |
| `hermes agent` | `claudia` | Lowercase display |
| `HERMES_HOME` | `CLAUDIA_HOME` | Env variable |
| `~/.hermes` | `~/.claudia` | Config directory |
| `hermes_cli` | `claudia_cli` | Package import |
| `hermes_constants` | `claudia_constants` | Module import |
| `hermes_state` | `claudia_state` | Module import |
| `hermes_time` | `claudia_time` | Module import |
| `hermes model` | `claudia model` | CLI command refs in docs |
| `hermes gateway` | `claudia gateway` | CLI command refs |
| `hermes setup` | `claudia setup` | CLI command refs |
| `hermes update` | `claudia update` | CLI command refs |
| `hermes tools` | `claudia tools` | CLI command refs |
| `hermes doctor` | `claudia doctor` | CLI command refs |
| `hermes claw` | `claudia migrate` | Migration from Hermes/OpenClaw |
| `NousResearch` | `kbanc85` | Repo owner (in URLs only) |
| `Nous Research` | `Kamil Banc` | Attribution (where appropriate) |
| `nousresearch.com` | Remove/replace | Domain references |

**Strings to NOT replace**:
- `hermetic` (not related)
- Any variable named `hermes` inside function bodies that serves as a local reference (review manually)
- Binary files (.png, .gif, etc.)
- Lock files (regenerate instead)

**Process**: Run `grep -rn "hermes" --include="*.py" --include="*.yaml" --include="*.md" --include="*.sh" --include="*.toml" --include="*.json" --include="*.nix" --include="*.txt" .` to build the complete list. Apply with targeted sed per file, not global. Review each change. Budget a full day.

**Success**: `grep -ri "hermes" --include="*.py" --include="*.yaml" --include="*.md" --include="*.sh"` returns zero results in user-facing files. Internal comments may retain historical references with a `# Originally from Hermes Agent (MIT)` note.

### Task 0.3: Security baseline audit

Before changing any logic, audit the unmodified fork:
- Review `docs/user-guide/security` content
- Test command allowlists in `tools/approval.py`
- Verify DM pairing in gateway
- Check container isolation in Docker backend
- Test cron path guards (path-traversal fix from April 5, 2026)
- Review secret exfiltration blocking (new in v0.7.0)

Document findings in `docs/decisions/security-baseline.md`.

**Success**: Written security baseline document covering each attack surface.

### Task 0.4: Define test harness

Create three test tiers:
1. **Unit**: Memory operations, tool registry, config loading. Use pytest with markers.
2. **Integration**: Skill execution across 3+ models (use pytest markers: `@pytest.mark.frontier`, `@pytest.mark.local`).
3. **E2E**: Cron → gateway → memory pipeline. Run against a local Ollama model.

Set up in `tests/` with CI workflow in `.github/workflows/test.yml`.

Port applicable tests from Claudia's 756-test suite (memory operations, entity CRUD, hybrid search).

**Success**: `pytest tests/ -q` passes. CI workflow runs on push.

### Task 0.5: Boot test

Run the renamed setup script and verify:
```bash
./setup-claudia.sh
claudia --help
# Should show "Claudia" branding
# /model command should work
# First-run wizard should reference Claudia
```

**Success**: Agent boots, displays Claudia branding, accepts a basic conversation.

### Rollback
Re-clone original Hermes.

### Deliverable
Clean fork that boots with Claudia branding, security baseline documented, test harness ready.

---

## Phase 1: Visual rebrand and persona injection (4-5 days)

### Objective
100% Claudia visuals, commands, and personality before touching logic.

### Task 1.1: Replace assets
- Replace all files in `assets/` with Claudia equivalents (banner, logos, TUI colours)
- Update any ASCII art or terminal branding strings in `claudia_cli/`

### Task 1.2: Inject Claudia persona into SOUL.md

Consolidate Claudia's `template-v2/` identity, rules, and behavioural files into a single `SOUL.md` that lives at `~/.claudia/SOUL.md` (loaded by `agent/prompt_builder.py` via `load_soul_md()`).

Content must include:
- Chief-of-staff identity and personality
- Approval gates (no external actions without user confirmation)
- Source attribution requirements
- Proactive behaviour directives (commitment detection, risk surfacing, relationship awareness)
- Judgment application rules
- Communication style (direct, strategic, shows her work)

Also modify `agent/prompt_builder.py`'s `DEFAULT_AGENT_IDENTITY` constant to reflect Claudia's baseline persona for cases where SOUL.md is absent.

### Task 1.3: Stub migration command

Rename `hermes claw migrate` to `claudia migrate`. Keep the command structure but stub the implementation (it will be fully built in Phase 6). The setup wizard's detection logic for `~/.openclaw/` stays intact but is extended in Phase 6 to also detect `~/.hermes/`.

### Task 1.4: Update config defaults

Modify `cli-config.yaml.example`:
- Default model: a frontier model via OpenRouter
- Default persona: Claudia
- Branding strings

### Task 1.5: Update all docs

Rewrite `README.md`, `CONTRIBUTING.md`, `docs/` to reference Claudia only. Add `THIRD-PARTY.md` with MIT attribution to Hermes Agent.

### Task 1.6: Preserve model selector

Verify `/model` command works across all providers (OpenRouter, Anthropic direct, OpenAI, Ollama, custom endpoints). This is critical, it's the escape from Claude Code lock-in.

### Rollback
Revert branding PR, personality reverts to default.

### Deliverable
Bootable agent branded 100% as Claudia, model switching works, still uses default Hermes memory/skills.

---

## Phase 2A: Memory, core hybrid search (7-10 days)

### Objective
Replace Hermes's flat-file memory (MEMORY.md/USER.md) with Claudia's hybrid search as a pluggable memory provider, using the v0.7.0 provider ABC interface.

### Why this timeline
Previous roadmap versions estimated 4-7 days. That was wrong. The hybrid scoring algorithm alone contains six sub-components that each need implementation and testing. 7-10 days is realistic for one Claude Code session per sub-component plus integration testing.

### Task 2A.1: Study the v0.7.0 memory provider interface

Read these files before writing any code:
- `tools/memory_tool.py` (current memory implementation)
- `plugins/` directory (hindsight plugin shows how providers register)
- PR #4623 (pluggable memory provider ABC)
- `claudia_state.py` (SessionDB with FTS5, this stays, it handles conversation sessions)

Understand the provider ABC contract: what methods must be implemented, how providers register, how memory is injected into the system prompt.

### Task 2A.2: Implement Claudia memory provider

Create `plugins/claudia_memory/` as a memory provider plugin:

**Sub-task 2A.2a: SQLite schema**
- Create database schema for entities (people, organisations, projects), memories, relationships, commitments
- Include columns for importance score, access count (rehearsal), timestamps
- Enable WAL mode by default (mandatory for concurrency)

**Sub-task 2A.2b: Embedding pipeline**
- Set up Ollama integration for all-minilm:l6-v2
- Implement embedding generation for new memories
- Handle offline fallback (when Ollama unavailable, skip vector scoring, use FTS only)

**Sub-task 2A.2c: Hybrid search algorithm**
- 50% vector similarity (cosine distance against query embedding)
- 25% importance score (user-assigned or system-inferred)
- 10% recency (time-decay function)
- 15% FTS score (SQLite FTS5)
- Rehearsal boost: accessing a memory increments its access count, which feeds back into ranking

**Sub-task 2A.2d: Entity CRUD**
- Create/read/update/delete for people, organisations, projects
- Profile isolation (Hermes strength, keep it)

**Sub-task 2A.2e: Offline degradation path**
Define what works when:
- Ollama running, embeddings available: full hybrid search
- Ollama down, no embeddings: FTS + importance + recency only (skip vector component, reweight remaining to 100%)
- No internet, no Ollama: pure FTS + local SQLite only

**Sub-task 2A.2f: Register as provider**
Wire the plugin into the v0.7.0 provider system. The Claudia memory provider becomes the default.

### Task 2A.3: Concurrency design

Implement for simultaneous access from cron jobs, gateway messages, interactive sessions, and subagents:
- WAL mode (mandatory, already decided)
- Connection pooling for readers (multiple concurrent reads are fine in WAL)
- Write serialisation via a dedicated write queue or SQLite's built-in write locking
- Test with synthetic load: 3 concurrent writers simulating cron + gateway + interactive session

### Task 2A.4: Unit tests

Port relevant tests from Claudia's 756-test suite:
- Hybrid search ranking accuracy
- Entity CRUD operations
- Rehearsal effect (access boosts ranking)
- Offline fallback (FTS-only mode)
- Concurrency under load

### Rollback
Fall back to Hermes's default built-in memory provider (MEMORY.md/USER.md). The provider ABC makes this a config change, not a code revert.

### Deliverable
Memory that recalls with Claudia's hybrid scoring, handles concurrent access, and degrades gracefully offline.

---

## Phase 2B: Memory, advanced features (5-7 days)

### Objective
Add relationship graphs, commitment tracking, and adaptive decay.

### Task 2B.1: Relationship graphs
- Store relationships between entities with type (colleague, client, investor, friend, etc.) and health score
- Health score decays based on time since last interaction
- Surface relationship warnings ("Haven't spoken to Marcus in 18 days, usually weekly")

### Task 2B.2: Commitment lifecycle
- Detect commitments in conversation ("I'll send that by Friday")
- Store with: who, what, deadline, status (open/completed/overdue)
- Surface overdue commitments in morning briefs and proactive alerts

### Task 2B.3: Provenance chains
- Every memory traces back to its source (conversation session, meeting transcript, email)
- "How do you know that?" returns the source chain

### Task 2B.4: Adaptive decay and consolidation
- Nightly job (2 AM): memories that haven't been accessed decay in importance
- Consolidation: merge duplicate memories, detect cross-session patterns
- Wire as a Hermes cron job

### Task 2B.5: Cost governance hooks
- Add token logging to every LLM call (extend the usage tracking Hermes already has)
- Implement model-tier routing: cheap model (Haiku-class) for routine tool calls, expensive model (Sonnet-class) for reasoning and judgment
- Add cost alerts: warn user when approaching budget thresholds
- Wire budget enforcement in the agent loop (`run_agent.py`'s conversation loop), checking before each LLM call

### Task 2B.6: Prompt budget accounting

Define token budgets per system prompt component. Measure actual token counts:
| Component | Target budget | Truncation strategy |
|---|---|---|
| Core agent instructions | ~2,000 tokens | Fixed, no truncation |
| Claudia persona + rules | ~1,500 tokens | Fixed, no truncation |
| Memory snapshot | ~1,500 tokens max | Truncate oldest memories first |
| Relationship context | ~800 tokens max | Only include for mentioned entities |
| Skills index (Level 0) | ~3,000 tokens | Progressive disclosure already handles this |
| Judgment rules | ~500 tokens | Fixed, no truncation |
| **Total baseline** | **~9,300 tokens** | |

Test on smallest target model context window. If total exceeds 25% of context, implement aggressive truncation for memory and relationship components.

### Rollback
Disable advanced features, keep Phase 2A core memory.

### Deliverable
Production-grade Claudia memory with relationship intelligence, commitment tracking, cost governance, and defined prompt budgets.

---

## Phase 3: Skills audit and porting (6-8 days)

*Start analytical work (Tasks 3.1-3.3) during Phase 2A. Actual porting (Tasks 3.4+) requires memory to be functional.*

### Objective
Port 12 core Claudia skills into the Hermes skill format. Verify they work across frontier and local models.

### Task 3.1: Claude Code dependency analysis (can start during Phase 2A)

For each of the 12 core skills, answer:
1. Does it require Claude Code's built-in file system access? (If yes, map to Hermes's `file_tools`)
2. Does it require Claude Code's bash execution? (If yes, map to Hermes's `terminal_tool`)
3. Does it require MCP tools that only exist in Claudia's daemon? (If yes, map to the new memory provider)
4. Does it conflict with an existing Hermes tool?

### Task 3.2: Model compatibility test script (can start during Phase 2A)

Write an automated test that:
- Takes a skill's prompt template
- Sends it to 3+ model endpoints (Claude Sonnet via OpenRouter, GPT-4.1, Llama 3.3 70B via local Ollama)
- Captures the output
- Flags: malformed responses, missed instructions, hallucinated tool calls, format failures
- Generates a compatibility report

Run against all 12 core skills.

### Task 3.3: Skill spreadsheet (can start during Phase 2A)

Create `docs/decisions/skill-audit.md`:
| Skill | Claude Code dependency | Hermes equivalent | Model compat | Decision |
|---|---|---|---|---|
| claudia-draft | Email composition (no deps) | None | Test | Keep |
| morning-brief | Memory queries | claudia_memory provider | Test | Keep |
| ... | | | | |

### Task 3.4: Port core skills

Convert 12 core skills from Claudia's markdown template format to Hermes-style skill files in `~/.claudia/skills/claudia-core/`:
- Follow agentskills.io standard (progressive disclosure: Level 0 name/description, Level 1 full skill, Level 2 reference files)
- Register via the skill registry
- Each skill gets a corresponding slash command

### Task 3.5: Archive non-core skills

Move remaining 29 skills to `optional-skills/claudia-archive/`. Users can opt-in via `/skill toggle`.

### Task 3.6: Self-improvement integration

Wire Hermes's autonomous skill creation into Claudia's judgment system:
- After complex tasks (5+ tool calls), agent generates a skill document
- Before saving, apply Claudia's judgment filter (does this skill align with chief-of-staff role?)
- Saved skills go to `~/.claudia/skills/autogenerated/`

### Task 3.7: Subagent personality inheritance

Decide and implement: when Claudia delegates to subagents via `delegate_task`:
- **Recommendation**: Subagents get abbreviated Claudia persona (~500 tokens) covering voice and approval rules, but not full relationship context or judgment layer
- Prevents personality breaks in gateway responses while keeping prompt budget manageable for subagent context windows

### Rollback
Keep only the 5 highest-usage skills (claudia-draft, morning-brief, inbox-check, research, meeting-prep). Archive rest.

### Deliverable
12 core skills working across models, self-improvement loop respects Claudia judgment, subagent personality defined.

---

## Phase 4: Proactive behaviour layer (4-5 days)

*Can run in parallel with Phase 5 if you have two Claude Code sessions.*

### Objective
Claudia doesn't just respond, she anticipates. Wire proactive intelligence into the agent loop and cron system.

### Task 4.1: Pre-LLM hooks

Modify `agent/prompt_builder.py` to always inject before each LLM call:
- Current Claudia persona context
- Active judgment rules
- Relevant relationship context for entities mentioned in the current message
- Any pending commitments approaching deadline

### Task 4.2: Post-LLM hooks (commitment detection)

Create `plugins/claudia_proactive.py` with `post_llm_call` hook:
- Scan agent output for commitment language ("I'll", "by Friday", "next week", etc.)
- Extract and store commitments in memory
- Surface newly detected commitments to the user for confirmation

### Task 4.3: Cron-triggered proactive tasks

Wire these as Hermes cron jobs:
| Job | Schedule | Action |
|---|---|---|
| Morning brief | Daily 7 AM (user-configurable) | Generate brief, deliver via active gateway |
| Commitment check | Daily 9 AM | Surface approaching/overdue commitments |
| Relationship health | Weekly Monday | Flag cooling contacts |
| Memory consolidation | Daily 2 AM | Run decay, dedup, pattern detection |

### Task 4.4: Model-agnostic prompt testing

Test all proactive prompts on:
- Frontier: Claude Sonnet, GPT-4.1 (via OpenRouter)
- Local: Llama 3.3 70B, Gemma 4 (via Ollama)

Verify commitment detection, relationship awareness, and judgment application work acceptably on each.

### Rollback
Revert hooks. Disable cron jobs. Agent reverts to reactive-only mode.

### Deliverable
Claudia proactively detects commitments, monitors relationships, and delivers scheduled intelligence.

---

## Phase 5: Autonomy, gateways, and cost controls (4-6 days)

*Can run in parallel with Phase 4.*

### Objective
24/7 operation across all messaging platforms with responsible resource use.

### Task 5.1: Gateway rebranding

Update all gateway modules (Telegram, Discord, Slack, WhatsApp, Signal, Email) with Claudia branding. Bot names, welcome messages, command responses.

### Task 5.2: Message format standardisation

Define a canonical internal message format all gateways translate to/from:
```python
class ClaudiaMessage:
    text: str
    sender_id: str
    platform: str
    attachments: list[Attachment]
    thread_id: Optional[str]
    timestamp: datetime
```

Handle per-platform constraints:
- Telegram: 4096 char limit → multi-message splitting
- Discord: 2000 char limit → multi-message splitting
- Email: threading model → thread_id mapping
- WhatsApp: media handling differences

### Task 5.3: Cron integration

- Import Claudia's scheduled tasks from Phase 4
- Test natural-language cron creation ("remind me every Monday at 9am")
- Verify cron jobs deliver via the active gateway

### Task 5.4: Cost governance enforcement

- Token budget per session (configurable, warn at 80%, hard stop at 100%)
- Model-tier routing active: route tool calls to cheap models, route reasoning to frontier
- Daily cost summary via cron → gateway
- Serverless hibernation notes for Daytona/Modal deployments

### Task 5.5: Concurrency testing

Full load test: simultaneous cron execution + gateway message arrival + interactive terminal session + subagent delegation. All hitting memory concurrently.

### Rollback
Disable non-terminal gateways. Disable cron. Terminal-only mode.

### Deliverable
Claudia runs 24/7, reachable from any platform, with cost controls active.

---

## Phase 6: Visualiser, installer, and polish (5-7 days)

### Objective
Seamless user experience from install to daily operation.

### Task 6.1: `/brain` visualiser

Port Claudia's 3D brain visualiser as a skill that serves a local web page:
- Show entities as nodes, relationships as edges
- Colour-code by relationship health
- Future: overlay cron job activity and autonomous task execution

### Task 6.2: Installer update

Update `bin/index.js` for `npx get-claudia --agent`:
- Detect `--agent` flag
- Clone/download Claudia Autonomous
- Run `setup-claudia.sh`
- First-run wizard (model selection, gateway setup, API key entry)
- Docker and Nix options

### Task 6.3: First-run experience

The setup wizard should:
1. Detect existing installations (`~/.hermes/` and `~/.openclaw/`) and offer migration (see Task 6.6)
2. Ask for OpenRouter API key (or offer local Ollama)
3. Select a model
4. Optionally configure a messaging gateway
5. Create `~/.claudia/` with default SOUL.md
6. Boot into a conversation where Claudia introduces herself

### Task 6.4: Meeting intelligence tutorial

Create `docs/guides/meeting-intelligence.md`:
- Step-by-step setup for Otter, Granola, Fathom, or Fireflies
- How to configure transcript ingestion
- How Claudia processes transcripts via `capture-meeting` skill

### Task 6.5: Feedback and bug reporting

Implement `/feedback` and `/bug` commands:
- Collect context (model, platform, session excerpt with user approval)
- Submit to a GitHub issue template or webhook

### Task 6.6: Migration from Hermes and OpenClaw

Rewrite the existing OpenClaw migration code (now at `claudia migrate`) to detect and import from both Hermes (`~/.hermes/`) and OpenClaw (`~/.openclaw/`). This is a user acquisition channel: every existing Hermes or OpenClaw user can switch to Claudia with zero friction.

**Detection**: On first run (`claudia setup`), check for `~/.hermes/` first (larger community, more likely), then `~/.openclaw/`. If found, offer migration before configuration begins. Also available anytime via `claudia migrate`.

**From Hermes (`~/.hermes/`), import**:
- API keys and provider config (OpenRouter key, model preferences from `cli-config.yaml`)
- User-created skills (`~/.hermes/skills/`) → `~/.claudia/skills/hermes-imports/`
- SOUL.md persona → offer to merge with Claudia's persona or archive as reference
- MEMORY.md and USER.md → ingest as seed data into Claudia's hybrid memory (convert flat text entries into structured memory records with default importance scores)
- Gateway configs (Telegram bot tokens, Discord tokens, platform pairings, allowed users)
- Cron jobs → convert to Claudia cron format
- Command allowlists
- TTS assets

**From OpenClaw (`~/.openclaw/`), import**:
- Same as what Hermes already imports from OpenClaw (persona, memories, skills, API keys, messaging settings, allowlists, TTS assets, workspace instructions)

**CLI interface**:
```bash
claudia migrate                          # Interactive, auto-detects source
claudia migrate --from hermes            # Explicit source
claudia migrate --from openclaw          # Explicit source
claudia migrate --dry-run                # Preview what would be imported
claudia migrate --preset user-data       # Import without secrets
claudia migrate --preset full            # Import everything including API keys
claudia migrate --overwrite              # Overwrite existing conflicts
```

**Nuances**:
- Hermes skills in agentskills.io format can be imported directly (same standard)
- OpenClaw skills may need format conversion
- Memory ingestion from MEMORY.md/USER.md should parse each entry, assign default importance (0.5), generate embeddings, and store in Claudia's SQLite. Flag as "imported" in provenance.
- Never delete the source directory (`~/.hermes/` or `~/.openclaw/`), only copy from it
- If both exist, offer to import from both sequentially

### Rollback
Installer falls back to manual setup. Visualiser disabled.

### Deliverable
Polished install experience, working visualiser, Hermes/OpenClaw migration path, documentation for meeting intelligence.

---

## Phase 7: Testing, edge cases, and release (5-7 days)

### Objective
Production readiness.

### Task 7.1: Run all three test tiers
- Unit: all memory operations, tool registration, config loading
- Integration: 12 core skills across 3+ models
- E2E: cron → gateway → memory → response pipeline

### Task 7.2: Edge case testing
- Offline operation (no internet, local Ollama only)
- Context window exhaustion (what happens at 85% context on a 32K model?)
- Concurrent subagents all writing memory
- Gateway reconnection after network interruption
- Malformed user input via each gateway platform
- Migration from Hermes (`~/.hermes/` with populated data: skills, memories, gateway configs, cron jobs)
- Migration from OpenClaw (`~/.openclaw/` with populated data)
- Migration when both `~/.hermes/` and `~/.openclaw/` exist simultaneously
- Migration `--dry-run` produces accurate preview without side effects

### Task 7.3: Security re-audit
- Re-run Phase 0 security checks against modified codebase
- Verify no "hermes" references leaked through
- Check that Claudia persona doesn't override safety guards

### Task 7.4: Beta release
- Tag `v0.1.0-beta`
- Release to a small group of AI Adopters Club subscribers
- Collect feedback for 1-2 weeks

### Task 7.5: Documentation review
- All docs reference Claudia only
- README accurately describes capabilities
- Installation guide tested on clean macOS and Ubuntu machines

### Deliverable
Tagged beta release, tested across platforms, documentation complete.

---

## Phase 8: Maintenance and evolution

### Upstream monitoring
- Watch Hermes releases for security patches and infrastructure improvements
- Cherry-pick specific fixes (security, gateway stability, new execution backends)
- Never full rebase, always targeted cherry-picks
- Track in `docs/decisions/upstream-cherry-picks.md`

### Community
- Contribution guidelines: new skills must pass Claudia's judgment filter
- Skill submission process via PR
- Bug reports via GitHub issues

### Post-MVP roadmap
- Meeting intelligence integrations (Otter API, Granola, Fathom)
- Obsidian PARA vault sync
- `/brain` visualiser with real-time cron/task monitoring
- Claudia Lite mode definition (explicit feature set for local models)
- Voice interaction via gateway TTS/STT

### Quarterly reviews
- Review fork vs upstream divergence
- Decide what to cherry-pick
- Skill usage telemetry (opt-in) to inform pruning

---

## Timeline summary

| Phase | Duration | Can parallelise with |
|---|---|---|
| 0: Fork + security + test harness | 5 days | Nothing |
| 1: Visual rebrand + persona | 4-5 days | Nothing |
| 2A: Core hybrid memory | 7-10 days | Phase 3 analytical work (3.1-3.3) |
| 2B: Advanced memory + cost governance | 5-7 days | Phase 3 analytical work continues |
| 3: Skills porting | 6-8 days | Phase 4 and 5 can start late in Phase 3 |
| 4: Proactive behaviour | 4-5 days | Phase 5 |
| 5: Autonomy + gateways | 4-6 days | Phase 4 |
| 6: Visualiser + installer + polish | 5-7 days | Nothing |
| 7: Testing + beta release | 5-7 days | Nothing |

**Critical path**: Phases 0 → 1 → 2A → 2B → 3 → 6 → 7
**Parallel track**: Phase 3 analytical (during 2A/2B), Phases 4+5 (parallel)

**Total**: 10-14 weeks to beta. Not 6-10 weeks. Previous estimates were optimistic. This timeline accounts for Claude Code session overhead (context loading, codebase re-familiarisation each session), the memory system's real complexity, and the model compatibility testing that previous plans handwaved.

---

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Memory provider ABC doesn't support Claudia's full feature set | High | Extend the ABC if needed, or register additional tools alongside the provider |
| Skills degrade on non-Anthropic models | Medium | Model compatibility test script (Task 3.2) catches this early |
| Rebrand misses "hermes" references that surface at runtime | Low | Grep sweep + integration tests + beta testers |
| 6,933-line run_agent.py is too large for single Claude Code sessions | Medium | Work on specific methods/sections, not the whole file |
| Concurrent memory access causes data corruption | High | WAL mode + write serialisation + synthetic load testing in Phase 2A |
| Prompt budget exceeds small model context windows | Medium | Aggressive truncation strategies + Claudia Lite mode definition |
| Gateway message format differences cause UX breaks | Medium | Canonical message format (Task 5.2) + per-platform testing |

---

## Decision log template

For every significant decision, record in `docs/decisions/YYYY-MM-DD-topic.md`:

```markdown
# Decision: [title]
**Date**: [date]
**Status**: [proposed/accepted/superseded]
**Context**: What prompted this decision?
**Options considered**: List each with pros/cons
**Decision**: What was chosen and why
**Consequences**: What changes as a result
```

Start with:
1. Fork vs wrapper (Phase 0)
2. Memory provider strategy (Phase 2A)
3. Subagent personality inheritance (Phase 3)
4. Cost governance enforcement point (Phase 2B)
