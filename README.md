# create-claudia

Set up [Claudia](https://github.com/kamilbanc/claudia), your AI chief of staff, with a single command.

## Quick Start

```bash
npx create-claudia
cd claudia
claude
```

## What It Does

This package creates a `claudia/` directory with everything you need to run Claudia as your AI chief of staff:

- `CLAUDE.md` — Claudia's personality and capabilities
- `.claude/commands/` — Built-in slash commands
- `people/` — Relationship context files
- `context/` — Commitments, patterns, and tracking
- `projects/` — Project-specific context
- `tasks/` — Task blueprints for recurring work
- `content/` — Content planning
- `expansions/` — Optional capability extensions

## Usage

```bash
# Create in current directory as ./claudia
npx create-claudia

# Create with custom directory name
npx create-claudia my-assistant
```

## Requirements

- Node.js 14+
- [Claude Code](https://claude.ai/code) installed (`claude` CLI)

## What is Claudia?

Claudia is a terminal-based AI chief of staff that runs locally via Claude Code. She maintains context about your relationships, tracks your commitments, and helps you think strategically.

**Core features:**
- Relationship tracking with `people/` files
- Commitment and deadline management
- Meeting prep and follow-up
- Email/communication drafting
- Pattern recognition across conversations

**Learn more:** [github.com/kamilbanc/claudia](https://github.com/kamilbanc/claudia)

## License

Apache 2.0
