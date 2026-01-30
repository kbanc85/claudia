<p align="center">
<img src="assets/claudia-banner.gif" alt="Claudia" width="500">
</p>

<p align="center">
  <a href="https://github.com/kbanc85/claudia/stargazers"><img src="https://img.shields.io/github/stars/kbanc85/claudia?style=flat-square" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/get-claudia"><img src="https://img.shields.io/npm/v/get-claudia?style=flat-square" alt="npm version"></a>
  <a href="https://github.com/kbanc85/claudia/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D14-brightgreen?style=flat-square" alt="Node.js"></a>
  <a href="https://python.org"><img src="https://img.shields.io/badge/python-%3E%3D3.10-blue?style=flat-square" alt="Python"></a>
</p>

<h3 align="center">An AI executive assistant who learns how you work.</h3>

<p align="center">
<em>"Busy work is my job. Judgment is yours."</em>
</p>

<p align="center">
Created by <a href="https://github.com/kbanc85">Kamil Banc</a> · <a href="https://x.com/kamilbanc">@kamilbanc</a> · <a href="https://aiadopters.club">AI Adopters Club</a>
</p>

---

## What Is Claudia?

Claudia is an open-source agentic executive assistant that runs on [Claude Code](https://docs.anthropic.com/en/docs/claude-code). She remembers your conversations, tracks your relationships, detects commitments you make, and adapts her workflow to match how you actually work.

Everything runs locally. Your data stays on your machine.

**She is not a chatbot.** She's a thinking partner with persistent memory, proactive skills, and a personality that sharpens over time.

---

## Quick Start

```bash
npx get-claudia
```

The installer walks you through everything: creates your workspace, installs the memory system, and optionally sets up a local language model for cognitive tools. Then:

```bash
cd claudia
claude
```

Say hi. She'll introduce herself and learn about you in a natural conversation. Within a few minutes, she'll generate a personalized workspace structure, commands, and workflows tailored to your role.

**Requirements:** [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Node.js 14+, Python 3.10+ (for memory system)

**Already have Claudia?** Upgrade from any version:
```bash
cd your-claudia-directory
npx get-claudia .
```

This upgrades framework files while preserving your data (context/, people/, projects/).

---

## Key Features

### Persistent Memory

Claudia remembers across sessions. Not in a chat history sense, but semantically. She stores facts, preferences, commitments, and observations in a local SQLite database with vector embeddings. When you mention a person or topic, she recalls what she knows and surfaces what's relevant.

- **Semantic search** with 60/30/10 scoring (vector similarity, importance, recency)
- **Per-project isolation** so work memories don't mix with personal projects
- **Session narratives** that capture tone, emotional context, and unresolved threads
- **Source provenance** for tracing any fact back to the email, transcript, or conversation it came from

### Proactive Skills

Eight built-in skills that activate automatically based on context:

| Skill | What It Does |
|-------|-------------|
| **Commitment Detector** | Catches promises in conversation. "I'll send that by Friday" triggers a tracking offer |
| **Relationship Tracker** | Surfaces relevant context when people are mentioned. Tracks contact frequency, sentiment |
| **Pattern Recognizer** | Notices recurring themes after 3+ observations. "You tend to overcommit on Mondays" |
| **Risk Surfacer** | Proactively warns about overdue items, cooling relationships, capacity issues |
| **Memory Manager** | Handles session startup, shutdown, and cross-session persistence |
| **Capability Suggester** | Notices repeated tasks and offers to create commands for them |
| **Onboarding** | First-run discovery that generates your personalized workspace |
| **Structure Generator** | Creates folder structures and commands matched to your archetype |

### Cognitive Tools (New in v1.8)

Paste a meeting transcript or email. Instead of Claude parsing it token by token, a local language model extracts structured data (entities, facts, commitments, action items) in seconds. Claude then reviews the structured output and applies judgment.

- Runs locally via Ollama, no API keys
- Choose your model: Qwen3-4B (recommended), SmolLM3-3B, or Llama 3.2-3B
- Falls back gracefully when no model is installed

### Archetype System

During onboarding, Claudia detects your work style and generates structure that fits:

| Archetype | Optimized For |
|-----------|--------------|
| **Consultant** | Multiple clients, deliverables, proposals, pipeline |
| **Executive** | Direct reports, initiatives, leadership, board prep |
| **Founder** | Investors, team, product, fundraising |
| **Solo Professional** | Mix of clients and projects, wearing many hats |
| **Creator** | Audience, content calendar, collaborations |

Each archetype gets custom folder structures, commands, and templates. Structure grows organically from actual needs.

### Commands

| Command | What It Does |
|---------|-------------|
| `/morning-brief` | What needs attention today: commitments, meetings, warnings |
| `/meeting-prep [person]` | One-page briefing before a call |
| `/capture-meeting` | Process notes into decisions, commitments, action items |
| `/what-am-i-missing` | Surface risks, overdue items, cooling relationships |
| `/weekly-review` | Guided reflection across relationships and projects |
| `/draft-reply` | Email response drafts in your voice |
| `/follow-up-draft [person]` | Post-meeting thank-you and summary |
| `/new-person [name]` | Create a relationship file |
| `/pipeline-review` | Active deals, capacity, pipeline health |
| `/accountability-check` | Outstanding commitments and waiting-on items |

---

## How It Works

Claudia has two layers:

**Template layer** (markdown) defines who she is. Skills, commands, rules, and identity files that Claude reads on startup. This is what makes her Claudia rather than generic Claude.

**Memory system** (Python) defines what she remembers. A daemon running locally with SQLite, vector embeddings (Ollama), and three service layers:

- **Remember** stores facts, entities, and relationships with embeddings for semantic search
- **Recall** retrieves memories using hybrid ranking (vector similarity + importance + recency)
- **Consolidate** runs in the background: decaying old memories, detecting patterns, generating predictions

```
You talk to Claude Code
    |
    v
Claude reads Claudia's template files (skills, commands, rules)
    |
    v
Claude becomes Claudia: personality, proactive behaviors, safety principles
    |
    v
Claudia calls memory tools via MCP (remember, recall, about, ingest)
    |
    v
Memory daemon processes locally: SQLite + vector search + Ollama
    |
    v
Everything stays on your machine
```

For the full technical picture with diagrams, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Your First Conversation

When you first run `claude`, she introduces herself:

```
Claudia: Hey there. I'm Claudia. Before we dive into anything, I'd love
         to know who I'm working with. What's your name?

You:     Sarah

Claudia: Nice to meet you, Sarah. What do you do? I'm curious about
         your role, industry, what a typical week looks like.

You:     I'm a fractional CMO. I work with 4 clients right now.

Claudia: Got it. What are your top priorities right now?

You:     Client deliverables, growing my pipeline, and not dropping balls

Claudia: Based on what you've shared, here's how I'd organize things:

         clients/
            [one folder per client]
         people/
            [key relationships]
         context/
            commitments.md
            waiting.md

         And I'll set up commands for your work:
         /morning-brief, /client-status, /meeting-prep

         Want me to create this?

You:     Yes, do it

Claudia: Done. Try '/morning-brief' to see what needs attention,
         or tell me about one of your clients.
```

From here, every conversation builds on the last. She remembers.

---

## Self-Evolution

Claudia suggests improvements as she learns your patterns:

> "I notice you draft LinkedIn posts almost daily. Want me to add a `/linkedin-quick` command?"

> "You often ask about project status on Mondays. Should I add that to your morning brief?"

> "You've mentioned being stretched thin in three conversations this week."

She challenges constructively, surfaces what you might be missing, and adapts her structure to fit how your work actually evolves.

---

## Privacy and Safety

- **Fully local.** Memory, embeddings, and cognitive tools run on your machine. No external APIs (unless you choose to use Claude Code's cloud connection for the main conversation).
- **No external actions without approval.** Every email, calendar event, and external action requires your explicit "yes." This is non-negotiable and enforced at the framework level.
- **Your data is yours.** Memories live in `~/.claudia/memory/` as SQLite databases. Context lives in readable markdown files. Delete anything, anytime.

---

## System Requirements

| Component | Required | Purpose |
|-----------|----------|---------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Yes | Runtime for Claudia |
| Node.js 14+ | Yes | NPM installer |
| Python 3.10+ | Recommended | Memory system daemon |
| [Ollama](https://ollama.com) | Recommended | Local embeddings + cognitive tools |

The memory system and Ollama are optional. Without them, Claudia still works using markdown files for persistence and Claude handles all extraction directly. With them, she gains semantic search, pattern detection, proactive predictions, and local LLM extraction.

**Supported platforms:** macOS, Linux, Windows

---

## Troubleshooting

**Memory tools not appearing?**
```bash
# Run the diagnostic script
~/.claudia/diagnose.sh

# Common fixes:
# 1. Restart Claude Code in a NEW terminal (reads .mcp.json at startup)
# 2. Check daemon health: curl http://localhost:3848/health
# 3. View logs: tail -f ~/.claudia/daemon-stderr.log
```

**Ollama not running after reboot?**
```bash
launchctl load ~/Library/LaunchAgents/com.ollama.serve.plist
# Or start manually: ollama serve
```

**Pull models manually**
```bash
ollama pull all-minilm:l6-v2    # Embeddings (required for vector search)
ollama pull qwen3:4b             # Cognitive tools (optional)
```

**Vector search not working?**
```bash
~/.claudia/daemon/venv/bin/python -c "import sqlite_vec; print('ok')"
# If not: ~/.claudia/daemon/venv/bin/pip install sqlite-vec
```

---

## Contributing

Claudia is open source under Apache 2.0. Contributions welcome.

- **Template changes:** Edit files in `template-v2/`. Changes apply to new installations.
- **Memory system:** Python code in `memory-daemon/`. Run tests with `pytest tests/`.
- **Architecture overview:** See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design.
- **Development guide:** See [CLAUDE.md](CLAUDE.md) for the developer workflow.

---

## License

Apache 2.0

---

## Credits

Created by [Kamil Banc](https://github.com/kbanc85) · [@kamilbanc](https://x.com/kamilbanc)

Part of the [AI Adopters Club](https://aiadopters.club) -- helping teams build AI-first reflexes.

If Claudia helps you, a star on GitHub means a lot.

---

<p align="center">
<em>"I learn how you work. Let's get started."</em>
</p>
