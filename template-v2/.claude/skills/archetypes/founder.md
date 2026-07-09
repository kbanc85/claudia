# Founder/Entrepreneur Archetype

**Profile:** Startup founders and entrepreneurs building companies, raising capital, and leading teams.

**Key Signals:** Investors, fundraising, raising capital, building team, hiring, product roadmap, "runway," "burn rate," "traction"

Includes everything from `_base-structure.md`, plus the following archetype-specific structure.

---

## Folder Structure (Archetype-Specific Additions)

### Full Business Depth

Adds to base structure:

```
├── investors/
│   └── [investor-name]/            ← Deep per-investor structure
│       ├── overview.md             ← Relationship status, investment details
│       ├── updates/                ← Investor update drafts sent to them
│       └── meetings/               ← Meeting notes
├── team/
│   └── [name]/
│       ├── overview.md
│       └── 1on1s/
├── product/
│   ├── roadmap.md                  ← Product roadmap
│   ├── decision-log.md             ← Product decisions
│   └── metrics.md                  ← Key metrics tracking
├── fundraising/
│   ├── overview.md                 ← Current round status
│   └── materials/                  ← Pitch deck, data room docs
├── pipeline/
│   ├── active.md                   ← Current investor conversations
│   ├── prospecting.md              ← Target investors
│   └── completed.md                ← Historical rounds
├── accountability/
│   ├── commitments.md              ← Founder commitments
│   └── overdue.md                  ← Escalation visibility
├── finances/
│   ├── overview.md                 ← Cash position, runway
│   ├── burn-tracking.md            ← Monthly burn analysis
│   └── projections.md              ← Financial projections
├── templates/
│   ├── investor-update.md          ← Monthly update template
│   ├── meeting-prep.md
│   ├── meeting-capture.md
│   └── weekly-review.md
└── insights/
    └── patterns.md                 ← Business patterns
```

### Starter Business Depth

Base + `investors/` (relationships, updates, materials), `team/_template/overview.md`, `product/` (roadmap, decisions), `fundraising/overview.md`, `pipeline/active.md`, `finances/overview.md`.

### Minimal Business Depth

Base + `investors/` (relationships, updates), `team/_template/overview.md`, `product/roadmap.md`, `fundraising/overview.md`.

---

## Archetype-Specific Commands

### /investor-update

```markdown
# Investor Update

Draft a monthly investor update.

## Discovery Questions

1. "What month/period is this covering?"
2. "Any specific wins to highlight?"
3. "Any challenges to be transparent about?"
4. "Any asks of investors this month?"

## Structure

```
# Investor Update: [Month Year]
## [Company Name]

### TL;DR
[3-4 bullet executive summary]

### Metrics
| Metric | This Month | Last Month | Change |
|--------|------------|------------|--------|

### Highlights
- 🎉 [Win 1]

### Challenges
- ⚠️ [Challenge 1] — [What we're doing about it]

### Product / Team / Runway / Asks / Looking Ahead
[Key updates per section]
```

## Notes
- Be honest about challenges
- Specific asks get better responses
- Keep it scannable
```

### /pitch-prep

```markdown
# Pitch Prep

Prepare for an investor meeting or pitch.

## Usage
`/pitch-prep [investor/firm name]`

## What to Gather

1. **Investor Context** — Prior relationship, portfolio, thesis, recent investments
2. **Your Narrative** — Key metrics, story, anticipated questions
3. **The Ask** — Amount, use of funds, timeline

## Output Format

```
## Pitch Prep: [Investor/Firm Name]
### [Date and Time]

**Meeting Type:** [First meeting / Follow-up / Partner meeting]
**With:** [Person names and roles]

### About Them
- **Focus:** [Investment thesis]
- **Relevant Investments:** [Portfolio companies]
- **Check Size:** [Typical size]

### Our Relationship / Key Points to Hit / Metrics to Share
### Anticipated Questions / The Ask / Questions for Them / Next Steps
```
```

### /team-standup

```markdown
# Team Standup

Prepare notes for team standup or all-hands.

## What to Include

1. **Company Updates** — Wins, announcements, metrics
2. **Team Focus** — Priorities, dependencies, blockers
3. **Culture Moments** — Shoutouts, events, team health

## Output Format

```
## Team Standup — [Date]

### 🎉 Wins / 📊 Metrics Check / 🎯 This Week's Focus
### 🔗 Dependencies / 🚧 Blockers / 👏 Shoutouts / 📅 Upcoming
```

## Tone
- Energizing but honest
- Celebrate wins
- Clear on priorities
```

### /runway-check

```markdown
# Runway Check

Financial runway and burn rate summary.

## What to Calculate

1. **Current Position** — Cash, monthly burn, runway months
2. **Projections** — Next 3 months burn, upcoming expenses, revenue trajectory
3. **Milestones** — What needs to happen before next raise, timeline

## Output Format

```
## Runway Check — [Date]

### Current Position
- **Cash:** $X | **Monthly Burn:** $X | **Runway:** X months

### Burn Breakdown
| Category | Monthly | Notes |
|----------|---------|-------|

### Upcoming Changes / Path to Next Raise / Recommendations / Key Dates
```

## Notes
- Update weekly or biweekly
- Be conservative on projections
- Flag concerns early
```

---

## Investor Templates

Every `overview.md` here is an OKF knowledge file: frontmatter first, then the
body described below. Set `timestamp` (ISO 8601) on write. An investor
`overview.md`:

```yaml
---
type: organization
title: "[Investor / Firm Name]"
description: "[One line: stage, check size, status]"
tags: [investor]
timestamp: "[ISO 8601, now]"
---
```

Product `roadmap.md` uses `type: project`; `fundraising/overview.md` uses
`type: context`. See `docs/okf-conventions.md`.

### Full Business Depth

`investors/[investor-name]/overview.md`: Quick stats (firm, role, stage focus, check size, relationship status, investment amount), about them (thesis, sweet spot, relevant portfolio, known preferences, decision process), relationship (intro source, first contact, strength, interaction history), their view of us (likes, concerns, feedback), investment status (amount, instrument, board seat), communication preferences, value-add (how they help, help requested), next steps, personal notes.

### Starter/Minimal

`investors/relationships/_template.md`: Simplified with quick stats, thesis, relevant portfolio, preferences, interaction history, feedback, current status, next step, notes.

---

## Product Templates

### Full Business Depth

| File | Purpose | Key Fields |
|------|---------|------------|
| `product/roadmap.md` | Product roadmap | Vision, current focus, key metrics, roadmap (now/next/later/backlog with owner/status/priority), recently shipped, key decisions, technical debt |
| `product/decision-log.md` | Product decisions | Decisions (context, options, rationale, impact, revisit date), summary table, decisions to revisit |
| `product/metrics.md` | Metrics tracking | North star metric, health metrics dashboard, growth metrics (users/signups/activation/retention), engagement (DAU/WAU/MAU), revenue metrics (MRR/ARR/ARPU/churn), cohort analysis, experiments |

### Starter/Minimal

`product/roadmap.md`: Simplified with vision, current focus, roadmap (now/next/later/backlog as checklists), recently shipped, key decisions reference.

---

## Fundraising Template

`fundraising/overview.md`: Current round (target, terms, status, close date), progress (committed/in process/pipeline), investor pipeline table with 8 stages (prospecting through committed), materials checklist, key dates, strategy notes.
