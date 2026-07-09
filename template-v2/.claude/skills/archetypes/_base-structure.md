# Base Structure (All Archetypes)

This file defines the shared skeleton that ALL archetypes include. Each archetype file adds its own unique folders, commands, and templates on top of this base.

---

## Base Directory Structure

Every archetype includes these directories and files at all depth levels:

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/
│   │   ├── morning-brief.md
│   │   ├── meeting-prep.md
│   │   ├── capture-meeting.md
│   │   ├── what-am-i-missing.md
│   │   ├── weekly-review.md
│   │   ├── new-person.md
│   │   ├── follow-up-draft.md
│   │   ├── draft-reply.md
│   │   └── summarize-doc.md
│   ├── skills/
│   ├── hooks/
│   └── rules/
├── context/
│   ├── me.md
│   ├── commitments.md
│   ├── waiting.md
│   ├── patterns.md
│   └── learnings.md
└── people/
    └── _template.md
```

## Business Depth Variants

Structure scales with `business_depth` from onboarding:

### Full Business Depth
- All archetype-specific folders with deep per-entity structure
- All business commands added: `/pipeline-review`, `/financial-snapshot`, `/client-health`
- Full template set: meeting-prep, meeting-capture, milestone-plan, weekly-review, plus archetype-specific templates
- Common business folders: `pipeline/` (active, prospecting, completed), `accountability/` (commitments, overdue), `finances/` (overview + archetype extras), `templates/`, `insights/patterns.md`

### Starter Business Depth
- Archetype-specific folders with simplified `_template/` structure
- One business command: `/pipeline-review`
- `pipeline/active.md`, `finances/overview.md`, `templates/meeting-capture.md`

### Minimal Business Depth
- Archetype-specific folders with minimal templates only
- No additional business commands
- Context and people directories only

## Common Templates

Both shared templates are defined once, canonically, in `structure-generator.md`.
This file does not restate them (they carried divergent variants before v1.67).
They ship OKF frontmatter per `docs/okf-conventions.md`.

### people/_template.md

Canonical: the `people/_template.md` block in `structure-generator.md`
(`type: person`, full section set). Use it as-is.

### Pipeline Template (shared across archetypes)

Canonical: the `pipeline/active.md` block in `structure-generator.md`
(`type: context`, the 7-stage pipeline: Prospecting, Discovery, Proposal,
Negotiation, Verbal, Active, Closing). Use it as-is; do not reintroduce the
older 5-stage variant.
