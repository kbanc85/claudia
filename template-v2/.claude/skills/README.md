# Claudia Skills

Skills are behaviors and workflows that extend Claudia's capabilities. They follow the [Agent Skills](https://agentskills.io) open standard and are compatible with Claude Code's skill system.

## Skill Types

### By Invocation Mode

| Type | User Invokes | Claude Invokes | Example |
|------|--------------|----------------|---------|
| **Contextual** (default) | Yes (`/skill`) | Yes (auto) | `capture-meeting` - responds to "capture this meeting" or `/capture-meeting` |
| **Explicit only** | Yes (`/skill`) | No | `morning-brief` - only runs when user types `/morning-brief` |
| **Proactive only** | No | Yes (auto) | `commitment-detector` - activates on promise language |

### Controlling Invocation

Use YAML frontmatter to control how a skill can be invoked:

```yaml
---
name: my-skill
description: What this skill does and when to use it.
disable-model-invocation: true  # Only explicit /my-skill
---
```

Or for purely proactive behaviors:

```yaml
---
name: commitment-detector
description: Detects promises in conversation.
user-invocable: false  # Claude invokes automatically, no /command
---
```

## Skill Format

### Directory Structure

Skills live in `.claude/skills/` and can be either:

**Simple skill** (single file):
```
.claude/skills/
└── commitment-detector.md
```

**Rich skill** (directory with supporting files):
```
.claude/skills/
└── ingest-sources/
    ├── SKILL.md          # Main skill file (required)
    ├── templates/        # Optional supporting files
    └── examples/         # Optional examples
```

### SKILL.md Format

```yaml
---
name: skill-name
description: Brief description for Claude's contextual matching.
disable-model-invocation: true   # Optional: explicit invocation only
user-invocable: false            # Optional: proactive only
argument-hint: [arg]             # Optional: show in /skill [arg] help
---

# Skill Title

[Skill content: triggers, behavior, output format, etc.]
```

## Core Skills

### Proactive (Auto-Activate)

| Skill | Purpose | Activates When |
|-------|---------|----------------|
| `onboarding.md` | First-run discovery | No `context/me.md` exists |
| `structure-generator.md` | Creates folders/files | After onboarding |
| `relationship-tracker.md` | Surfaces person context | Names mentioned |
| `commitment-detector.md` | Catches promises | "I'll...", deadlines |
| `pattern-recognizer.md` | Notices trends | Recurring themes |
| `risk-surfacer.md` | Warns about issues | Overdue, cooling |
| `capability-suggester.md` | Suggests new skills | Repeated behaviors |
| `memory-manager.md` | Session persistence | Session start/end |

### Contextual (Natural Language + `/skill-name`)

| Skill | Purpose | Triggers |
|-------|---------|----------|
| `capture-meeting/` | Process meeting notes | "capture this meeting" |
| `meeting-prep/` | Pre-call briefing | "prep me for my call with..." |
| `summarize-doc/` | Executive summary | "summarize this", "main points" |
| `research/` | Deep research with sources | "research this", "look into" |
| `what-am-i-missing/` | Surface risks and blind spots | "what am I overlooking?" |
| `accountability-check/` | Commitments and overdue items | "what do I owe?", "am I overdue?" |
| `client-health/` | Client engagement health | "how are my clients?" |
| `pipeline-review/` | Pipeline and capacity | "pipeline status" |
| `financial-snapshot/` | Revenue and cash flow | "cash position" |
| `growth-check/` | Development reflection | "am I growing?" |
| `memory-audit/` | Show what I know | "what do you know?" |
| `databases/` | Memory database management | "which database?" |
| `map-connections/` | Extract relationships | "who knows who?" |
| `brain/` | 3D memory visualizer | "show your brain" |
| `meditate/` | End-of-session reflection | "let's wrap up", "end the session" |

### Explicit Only (`/skill-name`)

| Skill | Purpose |
|-------|---------|
| `morning-brief/` | Daily digest |
| `weekly-review/` | Weekly reflection |
| `ingest-sources/` | Multi-source processing |
| `draft-reply/` | Email response drafts |
| `follow-up-draft/` | Post-meeting thank-you |
| `file-document/` | Save documents with provenance |
| `new-person/` | Create relationship file |
| `gateway/` | Manage Gateway service |
| `diagnose/` | Check memory daemon health |

## Creating Custom Skills

### 1. Choose Invocation Mode

- **Contextual** (default): Claude can suggest it, user can invoke it
- **Explicit only**: User must type `/skill-name`
- **Proactive only**: Claude activates automatically

### 2. Create the Skill File

For simple skills, create `skill-name.md` directly in `.claude/skills/`.

For skills with supporting files, create a directory:
```
.claude/skills/skill-name/
├── SKILL.md
└── [supporting files]
```

### 3. Add YAML Frontmatter

```yaml
---
name: skill-name
description: Clear description of what it does and when to use it.
---
```

The description is critical for contextual skills. Claude uses it to decide when to suggest the skill.

### 4. Define the Skill Content

Include:
- **Triggers** - When it activates (for proactive) or keywords (for contextual)
- **Behavior** - What it does step by step
- **Output Format** - Expected output structure
- **Judgment Points** - Where to ask for confirmation

## Archetype Templates

The `archetypes/` folder contains structure and command templates for each user type:
- `consultant.md` - Multiple clients, proposals, engagements
- `executive.md` - Direct reports, initiatives, board
- `founder.md` - Investors, team, product, fundraising
- `solo.md` - Independent professional
- `creator.md` - Audience, content, collaborations

## Migration from Commands

All commands have been migrated to skills. The `.claude/commands/` directory is no longer used.

Skills follow this structure:
- Simple skill: `skills/skill-name.md`
- Rich skill: `skills/skill-name/SKILL.md` (with optional supporting files)

YAML frontmatter controls invocation:
- `disable-model-invocation: true` - Explicit only (`/skill-name`)
- `user-invocable: false` - Proactive only (Claude auto-invokes)
- Default (neither set) - Contextual (natural language + `/skill-name`)

All `/skill-name` invocations work the same as the old `/command-name`.
