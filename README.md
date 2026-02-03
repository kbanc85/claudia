<p align="center">
<img src="assets/claudia-banner.gif" alt="Claudia" width="500">
</p>

<h3 align="center">A thinking partner who tracks relationships, not just tasks.</h3>

<p align="center">
Catches commitments. Remembers context. Connects the dots across your network.
</p>

<p align="center">
  <a href="https://github.com/kbanc85/claudia/stargazers"><img src="https://img.shields.io/github/stars/kbanc85/claudia?style=flat-square" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/get-claudia"><img src="https://img.shields.io/npm/v/get-claudia?style=flat-square" alt="npm version"></a>
  <a href="https://github.com/kbanc85/claudia/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue?style=flat-square" alt="License"></a>
</p>

<p align="center">
<a href="#try-it-in-30-seconds"><strong>Try the Demo</strong></a> ·
<a href="#what-makes-claudia-different">Why Claudia</a> ·
<a href="#quick-start">Install</a> ·
<a href="#how-it-works">How It Works</a>
</p>

---

<!-- TODO: Add GIF of /brain 3D visualization here -->
<!-- <p align="center">
<img src="assets/brain-visualization.gif" alt="Claudia's 3D Memory Graph" width="700">
</p> -->

## The Problem With AI Assistants

You tell ChatGPT about Sarah on Monday. By Wednesday, it's forgotten.

You make a promise in a meeting. Nobody tracks it. You promise a deliverable on Friday and lose track of it by Wednesday. You meet someone important, and three weeks later you can't remember what you talked about.

**AI tools don't have memory. Claudia does.**

---

## What Makes Claudia Different

<table>
<tr>
<td width="33%" align="center">
<h3>🎯 Catches Commitments</h3>
<p>Say "I'll send that by Friday" and she tracks it. On Friday morning, she reminds you.</p>
</td>
<td width="33%" align="center">
<h3>🔗 Remembers Relationships</h3>
<p>Mention Sarah from Acme and Claudia surfaces: last conversation, open promises, sentiment.</p>
</td>
<td width="33%" align="center">
<h3>⚠️ Warns Before Things Slip</h3>
<p>Haven't talked to your best client in 3 weeks? She tells you before it's a problem.</p>
</td>
</tr>
<tr>
<td width="33%" align="center">
<h3>📄 Shows Her Work</h3>
<p>Every fact traces to its source. Ask "how do you know that?" and she shows the receipt.</p>
</td>
<td width="33%" align="center">
<h3>🧠 Visualize Your Memory</h3>
<p>Run <code>/brain</code> to see a 3D graph of everything she knows: people, projects, connections.</p>
</td>
<td width="33%" align="center">
<h3>🔒 Fully Local</h3>
<p>Everything runs on your machine. Your data never leaves. Delete anything, anytime.</p>
</td>
</tr>
</table>

---

## Try It in 30 Seconds

Demo mode creates a pre-populated installation with realistic fake data. No setup, no configuration.

```bash
npx get-claudia my-demo --demo
cd my-demo
claude
```

**What's in the demo:**
- 60 people across investor, founder, and client networks
- 15 organizations and 15 projects
- 115 memories (facts, commitments, observations)
- Overdue items and relationship warnings to explore
- Full 3D brain visualization

The demo database is isolated in `~/.claudia/demo/`. Your real data is never touched.

---

## Quick Start

```bash
npx get-claudia
cd claudia
claude
```

<p align="center">
<img src="assets/claudia-install.gif" alt="Installing Claudia" width="600">
</p>

Say hi. She'll introduce herself, learn about you in a natural conversation, and generate a personalized workspace within a few sessions.

**Requirements:** [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Node.js 14+, Python 3.10+ (for memory)

<details>
<summary><strong>Upgrading from a previous version?</strong></summary>

```bash
cd your-claudia-directory
npx get-claudia .
```

This upgrades framework files while preserving your data (context/, people/, projects/).

</details>

<details>
<summary><strong>Add Brain Visualizer to existing install</strong></summary>

```bash
# macOS/Linux
bash "$(npm root -g)/get-claudia/visualizer/scripts/install.sh"

# Windows (PowerShell)
& "$(npm root -g)\get-claudia\visualizer\scripts\install.ps1"
```

</details>

---

## See It in Action

<!-- TODO: Replace with GIF showing memory recall -->

```
You:     What do I know about Sarah Chen?

Claudia: Sarah Chen is CEO at Meridian Ventures. You met at SaaStr 2025.

         📊 Relationship Health: Strong (last contact 3 days ago)

         🎯 Open Commitments:
         • Send updated pitch deck to Sarah [OVERDUE - was due Friday]

         💡 Recent Context:
         • She's interested in AI infrastructure angle
         • Wants to see technical architecture doc
         • Bringing in technical partner for next meeting

         🔗 Connected to: Series A (project), Priya Sharma (introduced by)

         Source: Call notes from Jan 28, Email thread Jan 30
```

From here, every conversation builds on the last. She remembers.

---

## Who It's For

Claudia detects your work style and generates structure that fits:

| Role | What You Get |
|------|--------------|
| **Consultant** | Client folders, deliverable tracking, pipeline commands |
| **Executive** | Direct reports, initiatives, board prep, leadership tools |
| **Founder** | Investor CRM, fundraising cycles, team and product tracking |
| **Solo Professional** | Flexible structure for wearing many hats |
| **Creator** | Audience growth, content calendar, collaboration tracking |

---

## Key Commands

| Command | What It Does |
|---------|--------------|
| `/morning-brief` | What needs attention today: commitments, meetings, warnings |
| `/brain` | Launch 3D memory visualization |
| `/meeting-prep [person]` | One-page briefing before a call |
| `/capture-meeting` | Process notes into decisions, commitments, action items |
| `/what-am-i-missing` | Surface risks, overdue items, cooling relationships |
| `/memory-audit` | See everything Claudia knows, with source chains |

<details>
<summary><strong>All commands</strong></summary>

| Command | What It Does |
|---------|--------------|
| `/weekly-review` | Guided reflection across relationships and projects |
| `/accountability-check` | Outstanding commitments and waiting-on items |
| `/draft-reply` | Email response drafts in your voice |
| `/follow-up-draft [person]` | Post-meeting thank-you and summary |
| `/new-person [name]` | Create a relationship file |
| `/pipeline-review` | Active deals, capacity, pipeline health |
| `/client-health` | Status across all client relationships |

</details>

---

## How It Works

Claudia has two layers:

**Template layer** (markdown) defines who she is. Skills, commands, rules, and identity files that Claude reads on startup.

**Memory system** (Python) defines what she remembers. SQLite + vector embeddings + three services:

| Service | What It Does |
|---------|--------------|
| **Remember** | Stores facts, entities, relationships with embeddings |
| **Recall** | Retrieves via hybrid ranking (vector + importance + recency) |
| **Consolidate** | Background: decay old memories, detect patterns, generate predictions |

```
You ──► Claude Code ──► Reads Claudia's templates ──► Becomes Claudia
                                                           │
                                                           ▼
                              Memory daemon (local) ◄── MCP tools
                                      │
                                      ▼
                        SQLite + vectors + Ollama (all local)
```

<details>
<summary><strong>Technical deep dive</strong></summary>

**Semantic search** uses hybrid ranking: 50% vector similarity, 25% importance, 10% recency, 15% full-text. Accessing a memory boosts it (rehearsal effect).

**Document storage** keeps files, transcripts, emails on disk, linked to people and memories. Content-hash deduplication. Automatic lifecycle management.

**Provenance chains** trace any fact to its source email, transcript, or conversation.

**Graph traversal** connects dots across your network. Ask about one person, see related entities with top memories.

**Per-project isolation** keeps work memories separate from personal. Each workspace gets its own database.

**Session narratives** capture tone and emotional context, not just facts.

For full architecture diagrams, see [ARCHITECTURE.md](ARCHITECTURE.md).

</details>

<details>
<summary><strong>Cognitive tools (local LLM extraction)</strong></summary>

Paste a meeting transcript. A local language model extracts structured data (entities, facts, commitments) in seconds. Claude reviews and applies judgment.

- Runs locally via [Ollama](https://ollama.com), no API keys
- Models: Qwen3-4B (recommended), SmolLM3-3B, Llama 3.2-3B
- Falls back gracefully when no model installed

Four extraction modes: **meeting**, **email**, **document**, **general**.

</details>

---

## Privacy and Safety

- **Fully local.** Memory, embeddings, cognitive tools run on your machine. No external APIs for storage.
- **No external actions without approval.** Every email, calendar event, external action requires your explicit "yes."
- **Your data is yours.** `~/.claudia/memory/` (SQLite), `~/.claudia/files/` (documents), readable markdown. Delete anything.

---

## System Requirements

| Component | Required | Purpose |
|-----------|----------|---------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Yes | Runtime |
| Node.js 14+ | Yes | Installer |
| Python 3.10+ | Recommended | Memory system |
| [Ollama](https://ollama.com) | Recommended | Embeddings + cognitive tools |

Without the memory system, Claudia still works using markdown files. With it, she gains semantic search, pattern detection, and predictions.

**Platforms:** macOS, Linux, Windows

---

<details>
<summary><strong>Troubleshooting</strong></summary>

**Memory tools not appearing?**
```bash
~/.claudia/diagnose.sh
# Then restart Claude Code in a NEW terminal
```

**Check daemon health:**
```bash
curl http://localhost:3848/health
tail -f ~/.claudia/daemon-stderr.log
```

**Ollama not running after reboot?**
```bash
launchctl load ~/Library/LaunchAgents/com.ollama.serve.plist
```

**Pull models manually:**
```bash
ollama pull all-minilm:l6-v2    # Embeddings
ollama pull qwen3:4b             # Cognitive tools (optional)
```

</details>

---

## Contributing

Claudia is source-available under the PolyForm Noncommercial License.

- **Template changes:** `template-v2/`
- **Memory system:** `memory-daemon/` (tests: `pytest tests/`)
- **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Dev guide:** [CLAUDE.md](CLAUDE.md)

---

## License

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)

**Free for:** Personal use, research, education, nonprofits.
**Requires permission:** Commercial use. Contact [mail@kbanc.com](mailto:mail@kbanc.com)

---

<p align="center">
Created by <a href="https://github.com/kbanc85">Kamil Banc</a> · <a href="https://x.com/kamilbanc">@kamilbanc</a> · <a href="https://aiadopters.club">AI Adopters Club</a>
</p>

<p align="center">
<em>"I learn how you work. Let's get started."</em>
</p>

<p align="center">
If Claudia helps you, a ⭐ on GitHub means a lot.
</p>
