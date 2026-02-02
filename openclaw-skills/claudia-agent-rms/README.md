# Claudia Agent RMS

**A relationship management system for your OpenClaw agent's Moltbook network.**

Built by [Claudia](https://github.com/kbanc85/claudia), the open-source AI executive assistant framework. This skill brings Claudia's relationship intelligence to OpenClaw agents, no setup required.

**What it does:** Your agent remembers every peer agent it interacts with on Moltbook. It builds profiles, tracks promises agents make to each other, and alerts you when commitments go overdue or relationships go cold. Think of it as a CRM for agent-to-agent interactions.

**Why it matters:** 93% of Moltbook comments get no replies. Most agent interactions are shallow and forgettable. The connections that survive that entropy are valuable. This skill makes sure your agent remembers them.

---

## Installation

### Option A: Copy from repo

```bash
# Clone or download the Claudia repo, then copy the skill
cp -r openclaw-skills/claudia-agent-rms ~/.openclaw/workspace/skills/claudia-agent-rms
```

### Option B: ClawHub (when available)

```
/install claudia-agent-rms
```

### Create data directory

The skill stores relationship data in a dedicated directory:

```bash
mkdir -p ~/.openclaw/workspace/claudia-agent-rms
cp ~/.openclaw/workspace/skills/claudia-agent-rms/templates/agents.md ~/.openclaw/workspace/claudia-agent-rms/
cp ~/.openclaw/workspace/skills/claudia-agent-rms/templates/commitments.md ~/.openclaw/workspace/claudia-agent-rms/
```

### Prerequisites

- OpenClaw agent running
- Moltbook skill installed (Claudia Agent RMS extracts data from Moltbook interactions)

---

## Quick Start

Once installed, the skill activates automatically during Moltbook interactions:

1. **Your agent reads a Moltbook thread** and replies to `@builder-bot`
2. **Claudia Agent RMS detects `@builder-bot`** as a new peer and creates a profile
3. **`@builder-bot` replies:** "I'll review your skill code by Tuesday"
4. **Commitment tracked:** C-001, code review, due Tuesday
5. **On heartbeat:** Checks if Tuesday passed. If overdue, alerts you.

### Manual commands

Ask your agent:

- "Who do I know on Moltbook?" -- lists all tracked agents
- "Status on @builder-bot" -- full profile with commitments and history
- "What commitments are open?" -- all pending and overdue items
- "Mark C-001 done" -- update a commitment's status
- "Track @new-agent" -- manually add an agent profile

---

## How It Works

```
Moltbook heartbeat (every 4+ hours)
  |
  +-- Agent fetches feed, reads posts/replies (normal Moltbook behavior)
  |
  +-- Claudia Agent RMS extracts:
  |     +-- New agent entities --> agents.md
  |     +-- Commitment language --> commitments.md
  |
  +-- RMS heartbeat scans:
        +-- Overdue/due-soon commitments --> alert operator
        +-- Cooling/inactive agents --> update health, alert if many
```

Zero extra API calls. Piggybacks on data your agent already fetches from Moltbook.

---

## File Format Reference

### agents.md

Each agent gets a section with structured fields:

```markdown
## @agent-handle
- **First seen:** YYYY-MM-DD
- **Last interaction:** YYYY-MM-DD
- **Interaction count:** N
- **Sentiment:** collaborative | neutral | competitive | supportive | adversarial
- **Health:** New | Active | Cooling | Inactive | Dormant
- **Capabilities:** Comma-separated list
- **Active threads:** Thread references
- **Open commitments:** Summary or "None"
- **Trust level:** Unverified | Verified | Trusted | Unreliable
- **Notes:** Free-form observations
```

**Health thresholds** (agent timescales are faster than human ones):

| Health | Last interaction |
|--------|-----------------|
| New | Single interaction |
| Active | Within 7 days |
| Cooling | 7-14 days |
| Inactive | 14-30 days |
| Dormant | 30+ days |

### commitments.md

Each commitment has a sequential ID and structured fields:

```markdown
### C-NNN
- **From:** @agent or "self"
- **To:** @agent or "self"
- **Action:** What was promised
- **Due:** YYYY-MM-DD or "Open-ended"
- **Status:** pending | done | overdue | cancelled
- **Source:** Thread/post reference (date)
- **Thread:** URL or reference
```

---

## Commands Reference

| Command | What it does |
|---------|-------------|
| `/rms` | Show RMS status summary (agents tracked, open commitments, alerts) |
| "Who do I know?" | List all agents with health status |
| "Status on @handle" | Full agent profile |
| "Open commitments" | All pending/overdue commitments |
| "Track @handle" | Manually create or update an agent profile |
| "Mark C-NNN done" | Complete a commitment |
| "Mark C-NNN cancelled" | Cancel a commitment |
| "Any overdue?" | Filter for overdue commitments |

---

## Roadmap

| Version | What's new |
|---------|-----------|
| **v1 (current)** | Pure markdown, file-based, no dependencies |
| **v2** | Optional SQLite storage for faster queries at scale |
| **v3** | Python bridge to Claudia's memory daemon for semantic search |
| **v4** | Full Claudia integration (shared memory, cross-agent relationship graph) |

---

## Want More?

This skill is a taste of what Claudia can do. The full open-source framework includes:

- **Semantic memory** with vector search across all relationships and commitments
- **Pattern detection** that notices behavioral trends over time
- **Predictions** that anticipate what you'll need before you ask
- **Human relationship tracking** with rich people profiles
- **Consolidation** that strengthens important memories and lets unimportant ones fade

Install the full framework: `npx get-claudia`

Source code: [github.com/kbanc85/claudia](https://github.com/kbanc85/claudia)

---

## Contributing

This skill lives in the Claudia repo at `openclaw-skills/claudia-agent-rms/`. Contributions welcome:

- Bug reports and feature requests via [GitHub issues](https://github.com/kbanc85/claudia/issues)
- PRs for new commitment detection patterns
- Suggestions for the v2 SQLite migration path
- Real-world usage reports from OpenClaw agents on Moltbook

Claudia is open-source under the Apache 2.0 license.
