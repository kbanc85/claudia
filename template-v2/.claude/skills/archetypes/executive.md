# Executive/Manager Archetype

**Profile:** Leaders who manage direct reports, lead initiatives, and report to boards or senior leadership.

**Key Signals:** Direct reports, initiatives, OKRs, strategic planning, board, "1:1s," "performance," "strategy"

Includes everything from `_base-structure.md`, plus the following archetype-specific structure.

---

## Folder Structure (Archetype-Specific Additions)

### Full Business Depth

Adds to base structure:

```
├── direct-reports/
│   └── [name]/                     ← Deep per-report structure
│       ├── overview.md             ← Role, goals, development areas
│       ├── 1on1s/                  ← 1:1 meeting notes
│       └── development-plan.md     ← Growth tracking
├── initiatives/
│   └── [initiative-name]/          ← Deep per-initiative structure
│       ├── overview.md             ← Status, owner, milestones, stakeholders
│       ├── milestone-plan.md       ← Timeline and deliverables
│       ├── decision-log.md         ← Key decisions
│       └── meetings/               ← Related meeting notes
├── board/
│   ├── updates/
│   └── materials/
├── pipeline/
│   ├── active.md                   ← Current initiatives/projects
│   ├── prospecting.md              ← Planned initiatives
│   └── completed.md                ← Historical record
├── accountability/
│   ├── commitments.md              ← Leadership commitments
│   └── overdue.md                  ← Escalation visibility
├── finances/
│   ├── overview.md                 ← Budget summary (if applicable)
│   └── budget-tracking.md          ← Department/initiative budgets
├── templates/
│   ├── meeting-prep.md
│   ├── meeting-capture.md
│   ├── milestone-plan.md
│   ├── weekly-review.md
│   └── 1on1-template.md
└── insights/
    └── patterns.md                 ← Leadership patterns
```

### Starter Business Depth

Base + `direct-reports/_template/` (overview, 1on1s, development), `initiatives/_template/overview.md`, `board/`, `pipeline/active.md`, `finances/overview.md`.

### Minimal Business Depth

Base + `direct-reports/_template/` (overview, 1on1s), `initiatives/_template/overview.md`, `board/`.

---

## Archetype-Specific Commands

### /exec-brief

```markdown
# Executive Brief

Leadership-focused morning brief emphasizing strategic priorities and team health.

## What to Surface

### 1. Strategic Priorities
- Key initiatives status
- Decisions needed today
- Escalations requiring attention

### 2. Team Health
- 1:1s scheduled today
- Any team concerns flagged
- Direct report check-ins needed

### 3. Leadership Context
- Board/exec commitments due
- External meetings requiring prep
- Stakeholder updates needed

### 4. Standard Brief Items
- Overdue commitments
- Due today items
- Relationship cooling alerts

## Output Format

```
## Executive Brief — [Day, Date]

### 🎯 Strategic Focus
- [Key priority for today]
- [Decision needed]

### 👥 Team
- [1:1] [Person] at [Time]
- [Concern] [Person] — [brief context]

### 📋 Leadership
- [Board/exec commitment]
- [Stakeholder need]

### ⚠️ Needs Attention
- [Overdue or urgent item]

### Today's Meetings
- [Time] [Meeting] — [context]
```

## Tone
- Strategic, not tactical
- Prioritized ruthlessly
- Team health prominent
```

### /1on1-prep

```markdown
# 1:1 Prep

Prepare for one-on-one meeting with a direct report.

## Usage
`/1on1-prep [person name]`

## What to Gather

From `direct-reports/[person]/`:

1. **Recent Context**
   - Last 1:1 notes
   - Open action items
   - Recent wins or concerns

2. **Development**
   - Current development focus
   - Goals progress
   - Feedback to deliver

3. **Performance**
   - Key projects status
   - Blockers they've mentioned
   - Support they might need

4. **Relationship**
   - Engagement level
   - Any tension to address
   - Opportunities to connect

## Output Format

```
## 1:1 Prep: [Person Name]
### [Date and Time]

**Last 1:1:** [Date]
**Mood/Energy:** [Last observed]

### Open Items from Last Time
- [ ] [Item] — [Status]
- [ ] [Item] — [Status]

### Topics for Today

**Check-ins:**
- How's [project] going?
- Any blockers I can help with?

**Development:**
- Progress on [goal]
- [Feedback to deliver]

**Strategic:**
- [Bigger picture topic]

### Questions to Ask
- [Open-ended question based on context]
- [Question about something they mentioned]

### Notes
- [Personal context to remember]
- [Anniversary, life event, etc.]
```
```

### /board-update

```markdown
# Board Update

Draft a board update or executive summary.

## Discovery Questions

1. "What period is this covering?"
2. "Any specific topics to highlight?"
3. "Any concerns to address proactively?"

## Structure

```
# Board Update: [Period]
## [Company/Division Name]
## Date: [Date]

### Executive Summary
[3-4 bullet points on key themes]

### Performance Highlights
- [Metric] — [Value] vs [Target]
- [Achievement]
- [Win]

### Challenges & Risks
- [Challenge] — [Mitigation approach]
- [Risk] — [Status]

### Key Initiatives

| Initiative | Status | Next Milestone |
|------------|--------|----------------|
| [Name] | 🟢/🟡/🔴 | [Milestone] |

### Team Update
- [Hiring/departure news]
- [Organizational changes]

### Looking Ahead
- [Key focus for next period]
- [Decisions needed from board]

### Appendix
[Detailed metrics, if applicable]
```

## Notes
- Lead with story, not data
- Status colors for quick scanning
- Clear asks if decisions needed
```

### /initiative-status

```markdown
# Initiative Status

Status overview across all strategic initiatives.

## What to Check

From `initiatives/` folder:

1. **Each Initiative**
   - Current phase
   - Health status
   - Key milestones
   - Blockers

2. **Cross-Initiative**
   - Resource conflicts
   - Dependencies
   - Prioritization needs

## Output Format

```
## Initiative Status — [Date]

### Summary
- X initiatives on track
- Y need attention
- Z blocked

### Detail

#### [Initiative Name]
**Status:** 🟢 On Track / 🟡 Attention / 🔴 Blocked
**Phase:** [Current phase]
**Owner:** [Person]

Recent Progress:
- [Milestone achieved]

Next Up:
- [Upcoming milestone] — [Date]

Blockers:
- [If any]

---

[Repeat for each initiative]

### Cross-Cutting Issues
- [Resource conflict or dependency]

### Decisions Needed
- [Decision with context]
```
```

---

## Direct Report Templates

Every `overview.md` here is an OKF knowledge file: frontmatter first, then the
body described below. Set `timestamp` (ISO 8601) on write. A direct-report
`overview.md`:

```yaml
---
type: person
title: "[Report Name]"
description: "[One line: role and focus]"
tags: [direct-report]
timestamp: "[ISO 8601, now]"
---
```

An initiative `overview.md` uses `type: project`. See `docs/okf-conventions.md`.

### Full Business Depth: Per-Report Files

Each direct report folder (`direct-reports/[name]/`) contains:

| File | Purpose | Key Fields |
|------|---------|------------|
| `overview.md` | Report snapshot | Quick stats (role, start date, 1:1 cadence, next 1:1), current focus (projects, development), performance (strengths, growth areas, recent wins), engagement & retention (energy/engagement/flight risk with trends), communication style, commitments to them, 1:1 history, personal context |
| `development-plan.md` | Growth tracking | Career snapshot (role, aspiration, timeline), development goals (target date, priority, success criteria, action plan, support needed, progress notes), skills assessment (current/target 1-5), stretch assignments, feedback history, career conversation notes, development resources |
| `1on1s/` | Meeting notes folder | |

### Starter/Minimal

`direct-reports/_template/overview.md`: Simplified version with quick stats, current focus, performance, engagement indicators, 1:1 history table, and notes.

`direct-reports/_template/development.md` (starter only): Career direction, development goals (target/why/actions/progress), skills table (current/target), feedback delivered.

---

## Initiative Templates

### Full Business Depth: Per-Initiative Files

Each initiative folder (`initiatives/[initiative-name]/`) contains:

| File | Purpose | Key Fields |
|------|---------|------------|
| `overview.md` | Initiative snapshot | Quick stats (status 🟢/🟡/🔴, phase, owner, sponsor, dates, budget), objective, why now, success metrics (baseline/target/current), key milestones, team & stakeholders, current status, blockers (impact/owner/resolution), pending decisions, dependencies |
| `milestone-plan.md` | Phase-based tracking | Timeline overview, phases with deliverable tables (owner, due, status), exit criteria, dependencies, resource allocation, risk register (likelihood/impact/mitigation), budget tracking |
| `decision-log.md` | Decision history | Decisions (context, options considered, rationale, impact), decision summary table, pending decisions |
| `meetings/` | Meeting notes folder | |

### Starter/Minimal

`initiatives/_template/overview.md`: Simplified with quick stats, objective, success metrics, milestones table, team, current status, blockers, decisions needed, updates log.
