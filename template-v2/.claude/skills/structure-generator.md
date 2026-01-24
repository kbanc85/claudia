# Structure Generator Skill

**Purpose:** Create personalized folder structures and files based on user archetype and preferences.

**Triggers:** Invoked by the onboarding skill after archetype detection, or when user requests structure changes.

---

## Archetype Structures

### Consultant/Advisor

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/           ← Generated commands for consulting
│   ├── skills/
│   ├── hooks/
│   └── rules/
├── context/
│   ├── me.md              ← User profile
│   ├── commitments.md     ← Active promises
│   ├── waiting.md         ← Waiting on others
│   ├── patterns.md        ← Observed patterns
│   └── learnings.md       ← Memory across sessions
├── people/
│   └── _template.md
├── clients/
│   └── _template/
│       ├── overview.md
│       ├── meetings/
│       └── deliverables/
├── pipeline/
│   ├── active.md
│   └── prospects/
└── content/               ← If thought leadership interest mentioned
    └── calendar.md
```

**Generated Commands:**
- `/client-status` — Health check all engagements
- `/proposal-draft` — Draft new proposals
- `/pipeline-review` — What's in your funnel
- `/engagement-review [client]` — Deep dive on specific client

---

### Executive/Manager

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/
│   ├── skills/
│   ├── hooks/
│   └── rules/
├── context/
│   ├── me.md
│   ├── commitments.md
│   ├── waiting.md
│   ├── patterns.md
│   └── learnings.md
├── people/
│   └── _template.md
├── direct-reports/
│   └── _template/
│       ├── overview.md
│       ├── 1on1s/
│       └── development.md
├── initiatives/
│   └── _template/
│       └── overview.md
└── board/
    ├── updates/
    └── materials/
```

**Generated Commands:**
- `/exec-brief` — Leadership-focused morning brief
- `/1on1-prep [person]` — Prepare for 1:1 meeting
- `/board-update` — Draft board update
- `/initiative-status` — Status across initiatives

---

### Founder/Entrepreneur

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/
│   ├── skills/
│   ├── hooks/
│   └── rules/
├── context/
│   ├── me.md
│   ├── commitments.md
│   ├── waiting.md
│   ├── patterns.md
│   └── learnings.md
├── people/
│   └── _template.md
├── investors/
│   ├── relationships/
│   ├── updates/
│   └── materials/
├── team/
│   └── _template/
│       └── overview.md
├── product/
│   ├── roadmap.md
│   └── decisions/
└── fundraising/
    └── overview.md
```

**Generated Commands:**
- `/investor-update` — Draft investor update
- `/pitch-prep` — Prepare for investor meeting
- `/team-standup` — Prepare standup notes
- `/runway-check` — Financial runway summary

---

### Solo Professional

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/
│   ├── skills/
│   ├── hooks/
│   └── rules/
├── context/
│   ├── me.md
│   ├── commitments.md
│   ├── waiting.md
│   ├── patterns.md
│   └── learnings.md
├── people/
│   └── _template.md
├── clients/
│   └── _template/
│       └── overview.md
├── projects/
│   └── _template/
│       └── overview.md
└── finances/
    ├── invoices/
    └── tracking.md
```

**Generated Commands:**
- `/week-review` — Solo-focused weekly review
- `/invoice-draft [client]` — Draft invoice
- `/project-status` — Status across projects
- `/client-review [client]` — Deep dive on client

---

### Content Creator

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/
│   ├── skills/
│   ├── hooks/
│   └── rules/
├── context/
│   ├── me.md
│   ├── commitments.md
│   ├── waiting.md
│   ├── patterns.md
│   └── learnings.md
├── people/
│   └── _template.md
├── content/
│   ├── calendar.md
│   ├── ideas/
│   ├── drafts/
│   └── published/
├── audience/
│   ├── insights.md
│   └── feedback/
└── collaborations/
    └── _template/
        └── overview.md
```

**Generated Commands:**
- `/content-calendar` — View/update content calendar
- `/draft-post [platform]` — Quick social draft
- `/audience-insights` — Review audience patterns
- `/collab-outreach [person]` — Draft collaboration outreach

---

## Core Files (All Archetypes)

### context/me.md Template
```markdown
# [Name]

## Profile
- **Role:** [Their role]
- **Industry:** [Their industry]
- **Archetype:** [Detected archetype]
- **Created:** [Date]

## Work Style
[What they described about how they work]

## Priorities
1. [Priority 1]
2. [Priority 2]
3. [Priority 3]

## Key Relationships
- [Key relationship types they mentioned]

## Tools
- [Tools they use]

## Notes
[Any additional context from onboarding]
```

### context/commitments.md Template
```markdown
# Commitments

Active promises I'm tracking for you.

## Due Soon

| Commitment | To | Due | Status |
|------------|-----|-----|--------|
| | | | |

## Upcoming

| Commitment | To | Due | Status |
|------------|-----|-----|--------|
| | | | |

## Completed (Last 30 Days)

| Commitment | To | Completed |
|------------|-----|-----------|
| | | |
```

### context/waiting.md Template
```markdown
# Waiting On

Things you're waiting for from others.

## Overdue

| Item | From | Expected | Days Late |
|------|------|----------|-----------|
| | | | |

## Active

| Item | From | Expected | Notes |
|------|------|----------|-------|
| | | | |

## Received (Last 30 Days)

| Item | From | Received |
|------|------|----------|
| | | |
```

### context/patterns.md Template
```markdown
# Patterns

Observations across our work together.

## Work Patterns
<!-- Tendencies in how you work -->

## Relationship Patterns
<!-- Patterns in your relationships -->

## Timing Patterns
<!-- When you're most productive, common scheduling issues -->

## Areas to Watch
<!-- Potential blind spots or recurring challenges -->

---

*Last updated: [date]*
```

### context/learnings.md Template
```markdown
# Claudia's Learnings

What I've learned about working with you.

## Preferences
<!-- Communication style, level of detail, timing -->

## What Works Well
<!-- Approaches that have been effective -->

## What to Avoid
<!-- Approaches that don't work as well -->

## Successful Patterns
<!-- Things that have worked in specific contexts -->

---

*Last updated: [date]*
```

### people/_template.md
```markdown
# [Person Name]

**Role:** [Their title/position]
**Organization:** [Company/org]
**How we met:** [Context]
**Relationship type:** [Client, Colleague, Friend, etc.]

## Quick Stats

| Field | Value |
|-------|-------|
| Last Contact | *date* |
| Relationship Health | Active / Cooling / Needs attention |
| Sentiment | Positive / Neutral / Cautious |

## Contact

| Channel | Details |
|---------|---------|
| Email | |
| Phone | |
| LinkedIn | |
| Preferred | |

## Communication Style
<!-- How they prefer to communicate -->

## What Matters to Them
<!-- Their priorities, motivations -->

## Current Context
<!-- What they're working on now -->

## Our History

| Date | Event | Notes |
|------|-------|-------|
| | | |

## Commitments

### I owe them
-

### They owe me
-

## Notes
<!-- Personal details, sensitivities, conversation starters -->

---

*Created: [date]*
```

---

## Generation Process

When generating a structure:

1. **Create base folders** for the archetype
2. **Copy templates** to appropriate locations
3. **Generate archetype-specific commands** (see archetype sections)
4. **Create context/me.md** with user's profile data
5. **Initialize empty context files** (commitments, waiting, patterns, learnings)
6. **Report what was created**

---

## Handling Customization

If user requests modifications:
- Add requested folders
- Remove unwanted folders
- Rename as needed
- Always preserve core context/ structure
