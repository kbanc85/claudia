# Claudia Memory System

A superhuman memory system for Claudia that:
- **Never forgets** - SQLite + sqlite-vec for permanent, vector-searchable storage
- **Runs 24/7** - Background daemon with scheduled consolidation
- **Crash-safe** - WAL mode means every write survives terminal close
- **Proactive** - Predictions and cross-references across all your data
- **Zero signup** - Local Ollama for embeddings, no API keys needed

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Claude Code (Terminal)                                         │
│  - User talks to Claudia                                        │
│  - Claudia calls memory.* MCP tools automatically              │
└─────────────────────────┬───────────────────────────────────────┘
                          │ MCP Protocol
┌─────────────────────────▼───────────────────────────────────────┐
│  Claudia Memory Daemon (Always Running)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │
│  │  MCP Server  │  │  Scheduler   │  │  Health Check    │      │
│  │  (stdio)     │  │  (APScheduler)│  │  (HTTP :3848)   │      │
│  └──────────────┘  └──────────────┘  └──────────────────┘      │
│                          │                                      │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Services: Remember | Recall | Consolidate | Predict │      │
│  └──────────────────────────────────────────────────────┘      │
│                          │                                      │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  SQLite + sqlite-vec (~/.claudia/memory/claudia.db)  │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│  Ollama (Local Embeddings)                                      │
│  - Model: all-minilm:l6-v2 (45MB, 384 dimensions)              │
│  - Runs locally, no API keys needed                             │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Automatic Installation

During Claudia setup:
```bash
npx get-claudia my-project
# Answer 'y' to "Set up enhanced memory system?"
```

### Manual Installation

```bash
cd memory-daemon
./scripts/install.sh
```

### Verify Installation

```bash
# Check health
curl http://localhost:3848/health

# Check status
curl http://localhost:3848/status

# Check stats
curl http://localhost:3848/stats
```

## MCP Tools

Once installed, Claudia has access to these tools:

| Tool | Description |
|------|-------------|
| `memory.remember` | Store facts, preferences, observations |
| `memory.recall` | Semantic search across all memories |
| `memory.about` | Get everything known about an entity |
| `memory.relate` | Create relationships between entities |
| `memory.predictions` | Get proactive suggestions |
| `memory.consolidate` | Manual consolidation trigger |
| `memory.entity` | Create/update entity information |
| `memory.search_entities` | Search for people, projects, etc. |

## How It Works

### Remembering

Every conversation turn and explicit fact is stored with:
- Content and type (fact, preference, observation, commitment)
- Related entities (people, projects, organizations)
- Vector embedding for semantic search
- Importance score (decays over time)

### Recalling

Searches combine:
- **Vector similarity** (60%) - Semantic meaning
- **Importance** (30%) - How significant the memory is
- **Recency** (10%) - How fresh the memory is

Accessing a memory boosts its importance (rehearsal effect).

### Consolidating

The daemon runs scheduled tasks:
- **Hourly**: Light importance decay
- **Every 6 hours**: Pattern detection
- **Daily 3am**: Full consolidation
- **Daily 6am**: Generate predictions

### Predictions

The system proactively generates:
- **Relationship alerts** - "Sarah: no contact in 45 days"
- **Commitment reminders** - "Proposal due tomorrow"
- **Pattern insights** - "You've mentioned capacity concerns 3 times"

## Configuration

Edit `~/.claudia/config.json`:

```json
{
  "decay_rate_daily": 0.995,
  "min_importance_threshold": 0.1,
  "consolidation_interval_hours": 6,
  "max_recall_results": 20,
  "embedding_model": "all-minilm:l6-v2",
  "health_port": 3848
}
```

## Migration

For existing Claudia users with markdown files:

```bash
python scripts/migrate_markdown.py --all
```

This imports:
- `context/me.md` - User profile
- `context/learnings.md` - Learned preferences
- `context/patterns.md` - Behavioral patterns
- `people/*.md` - Relationship files

## Development

### Run Tests

```bash
pip install -e ".[dev]"
pytest
```

### Run Standalone (No MCP)

```bash
python -m claudia_memory --standalone --debug
```

### Trigger Consolidation

```bash
python -m claudia_memory --consolidate
```

## Requirements

- Python 3.10+
- Ollama (optional, for vector search)
- macOS or Linux

## Files

```
~/.claudia/
├── config.json          # Configuration
├── daemon.log          # Daemon logs
├── memory/
│   └── claudia.db      # SQLite database
└── daemon/
    ├── venv/           # Python virtual environment
    └── claudia_memory/ # Installed package
```

## License

Apache 2.0
