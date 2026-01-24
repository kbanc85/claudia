# Claudia Skills

Skills are proactive behaviors that Claudia uses automatically based on context. Unlike commands (which users invoke), skills activate on their own when certain conditions are met.

## How Skills Work

Each skill defines:
- **Purpose**: What the skill does
- **Triggers**: When it activates
- **Behavior**: How it operates

Skills are read by Claude at session start and inform Claudia's behavior throughout the session.

## Core Skills

| Skill | Purpose | Activates When |
|-------|---------|----------------|
| `onboarding.md` | First-run discovery | No `context/me.md` exists |
| `structure-generator.md` | Creates folders/files | After onboarding |
| `relationship-tracker.md` | Surfaces person context | Names mentioned |
| `commitment-detector.md` | Catches promises | "I'll...", deadlines |
| `pattern-recognizer.md` | Notices trends | Recurring themes |
| `risk-surfacer.md` | Warns about issues | Overdue, cooling |
| `capability-suggester.md` | Suggests new tools | Repeated behaviors |
| `memory-manager.md` | Session persistence | Session start/end |

## Archetype Templates

The `archetypes/` folder contains structure and command templates for each user type:
- `consultant.md` — Multiple clients, proposals, engagements
- `executive.md` — Direct reports, initiatives, board
- `founder.md` — Investors, team, product, fundraising
- `solo.md` — Independent professional
- `creator.md` — Audience, content, collaborations

## Creating Custom Skills

To add a skill:
1. Create a `.md` file in this folder
2. Define Purpose, Triggers, and Behavior
3. Skills are automatically available to Claudia

## Skill vs Command

| Aspect | Skill | Command |
|--------|-------|---------|
| Invocation | Automatic | User types `/command` |
| Location | `.claude/skills/` | `.claude/commands/` |
| Purpose | Proactive behaviors | On-demand actions |
| Examples | Detect commitments | `/morning-brief` |
