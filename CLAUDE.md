# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Claudia is an agentic executive assistant framework that runs on Claude Code. This repository contains:
- `bin/index.js` - NPM installer CLI that bootstraps new Claudia instances
- `template-v2/` - Current template with minimal seed files (recommended)
- `template/` - Legacy template with pre-built examples
- `assets/` - Banner art and demo assets

## Architecture

### Template-Based System

Claudia is **not a traditional application**. It's a template system that generates personalized workspace structures. When users run `npx get-claudia`:

1. CLI copies `template-v2/` to target directory
2. User runs `claude` to start conversation
3. Onboarding skill detects missing `context/me.md` and initiates discovery
4. Structure generator creates personalized folders/files based on user's archetype

### Core Components

**Skills** (`.claude/skills/`)
- Proactive behaviors that activate based on context
- Examples: `onboarding.md`, `commitment-detector.md`, `pattern-recognizer.md`
- Skills invoke other skills and use commands

**Commands** (`.claude/commands/`)
- User-invocable workflows via `/command-name`
- Examples: `/morning-brief`, `/meeting-prep`, `/capture-meeting`
- Commands read/write to context files and people files

**Rules** (`.claude/rules/`)
- Global behavioral principles in `claudia-principles.md`
- Always active, guide all interactions

**Context Files** (generated in `context/`)
- `me.md` - User profile (presence indicates onboarding complete)
- `commitments.md` - Active promises being tracked
- `waiting.md` - Items waiting on others
- `patterns.md` - Observed behavioral patterns
- `learnings.md` - Claudia's memory about working with this user

**People Files** (generated in `people/`)
- Relationship-centric organization
- Template-based structure for consistency
- Tracks communication history, commitments, sentiment

### Archetype System

Claudia detects user archetypes during onboarding:
- **Consultant/Advisor** - Multiple clients, deliverables, proposals
- **Executive/Manager** - Direct reports, initiatives, leadership
- **Founder/Entrepreneur** - Investors, team, product, fundraising
- **Solo Professional** - Mix of clients and projects
- **Content Creator** - Audience, content, collaborations

Each archetype gets custom folder structures and commands (see `template-v2/.claude/skills/structure-generator.md` for specifics).

## Development Workflow

### Testing the Installer

```bash
# From repo root
cd claudia
node bin/index.js ../test-install

# Or test in current directory
node bin/index.js .
```

### Modifying Templates

**Template v2 (current):**
- Edit files in `template-v2/`
- Changes apply to new installations only
- Test by creating fresh installation

**Key template files:**
- `template-v2/CLAUDE.md` - Claudia's core identity and behavior
- `template-v2/.claude/rules/claudia-principles.md` - Global principles
- `template-v2/.claude/skills/onboarding.md` - First-run experience
- `template-v2/.claude/skills/structure-generator.md` - Archetype structures

### Testing Onboarding Flow

To trigger onboarding in a Claudia instance:
1. Delete `context/me.md` from the instance
2. Start `claude` in that directory
3. Onboarding skill activates automatically

### Adding New Skills

1. Create `[skill-name].md` in `template-v2/.claude/skills/`
2. Follow structure of existing skills:
   - **Purpose** - What it does
   - **Triggers** - When it activates
   - **Behavior** - Detailed workflow
3. Update `template-v2/.claude/skills/README.md` if needed

### Adding New Commands

1. Create `[command-name].md` in `template-v2/.claude/commands/`
2. Define clear sections:
   - What to surface/do
   - Format/structure
   - Tone guidelines
   - Edge cases
3. Add to archetype-specific command lists in `structure-generator.md` if appropriate

## Publishing

The package is published to NPM as `get-claudia`. Update version in:
- `package.json` (version field)
- `CHANGELOG.md` (add release notes)

Build tarball:
```bash
npm pack
```

Publish:
```bash
npm publish
```

## Important Design Principles

### Minimal Initial Structure
Template v2 provides only seed files. Structure grows organically based on user needs during onboarding.

### Personality Consistency
Claudia's voice is defined in `template-v2/CLAUDE.md` and `claudia-principles.md`. All skills and commands should maintain:
- Warm but professional tone
- Confidence with playfulness
- No em dashes (sign of lazy AI writing)
- Direct and clear communication

### Safety First
Every external action requires explicit user approval. This is non-negotiable and enforced in `claudia-principles.md`.

### Relationship-Centric
People files are the primary organizing unit. Projects and tasks come and go; relationships persist.

### Progressive Disclosure
Don't overwhelm users with structure upfront. Let complexity emerge from actual needs.

## File Locations Reference

```
claudia/
├── bin/index.js              ← CLI installer
├── package.json              ← NPM package config
├── CHANGELOG.md              ← Release history
├── README.md                 ← User-facing docs
├── template-v2/              ← Current template (use this)
│   ├── CLAUDE.md            ← Claudia's core identity
│   └── .claude/
│       ├── commands/         ← User-invocable workflows
│       ├── skills/           ← Proactive behaviors
│       │   ├── archetypes/  ← Archetype-specific configs
│       │   └── *.md         ← Skill definitions
│       ├── rules/            ← Global principles
│       └── hooks/            ← Event handlers (future)
└── template/                 ← Legacy template (deprecated)
```

## Common Modifications

**Changing onboarding questions:**
Edit `template-v2/.claude/skills/onboarding.md` Phase 2

**Adding new archetype:**
1. Create `template-v2/.claude/skills/archetypes/[name].md`
2. Add detection signals to `onboarding.md` Phase 3
3. Add folder structure to `structure-generator.md`
4. Define archetype-specific commands

**Modifying Claudia's personality:**
Edit `template-v2/CLAUDE.md` "How I Carry Myself" section

**Changing safety rules:**
Edit `template-v2/.claude/rules/claudia-principles.md` (requires strong justification)
