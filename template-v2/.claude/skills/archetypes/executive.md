# Executive/Manager Archetype

**Profile:** Leaders who manage direct reports, lead initiatives, and report to boards or senior leadership.

**Key Signals:**
- Mentions direct reports or team members
- Talks about initiatives, OKRs, or strategic planning
- References board, leadership team, or executives
- Uses terms like "1:1s," "performance," "strategy"

---

## Folder Structure

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
│   │   ├── summarize-doc.md
│   │   ├── exec-brief.md           ← Archetype-specific
│   │   ├── 1on1-prep.md            ← Archetype-specific
│   │   ├── board-update.md         ← Archetype-specific
│   │   └── initiative-status.md    ← Archetype-specific
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

## Direct Report Template

`direct-reports/_template/overview.md`:

```markdown
# [Person Name]

## Quick Stats

| Field | Value |
|-------|-------|
| Role | [Title] |
| Started | [Date] |
| Reports To | [You] |
| 1:1 Cadence | [Weekly/Biweekly] |

## Current Focus

**Primary Projects:**
- [Project 1]
- [Project 2]

**Development Focus:**
- [Skill or goal they're working on]

## Performance

**Strengths:**
- [Strength 1]
- [Strength 2]

**Growth Areas:**
- [Area 1]
- [Area 2]

## Engagement

| Indicator | Status |
|-----------|--------|
| Energy | High / Medium / Low |
| Engagement | Engaged / Coasting / Concerned |
| Flight Risk | Low / Medium / High |

## 1:1 History

See `1on1s/` folder for detailed notes.

| Date | Key Topics | Follow-ups |
|------|------------|------------|
| | | |

## Notes

[Personal context, communication preferences, etc.]

---

*Last updated: [Date]*
```

`direct-reports/_template/development.md`:

```markdown
# Development Plan: [Person Name]

## Current Role
[Their current title and responsibilities]

## Career Direction
[Where they want to go]

## Development Goals

### Goal 1: [Goal Name]
**Target Date:** [Date]
**Why:** [Reason]
**Actions:**
- [ ] [Action step]
- [ ] [Action step]
**Progress:** [Notes]

### Goal 2: [Goal Name]
[Same structure]

## Skills Development

| Skill | Current | Target | Progress |
|-------|---------|--------|----------|
| [Skill] | 1-5 | 1-5 | [Notes] |

## Feedback Delivered

| Date | Topic | Type |
|------|-------|------|
| | | Positive / Constructive |

## Notes

[Development observations, coaching notes]

---

*Last updated: [Date]*
```

---

## Initiative Template

`initiatives/_template/overview.md`:

```markdown
# [Initiative Name]

## Quick Stats

| Field | Value |
|-------|-------|
| Status | 🟢 / 🟡 / 🔴 |
| Phase | [Current phase] |
| Owner | [Person] |
| Started | [Date] |
| Target Completion | [Date] |

## Objective

[What this initiative is trying to achieve]

## Success Metrics

- [Metric 1]: [Target]
- [Metric 2]: [Target]

## Key Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| [Milestone] | [Date] | Done / In Progress / Not Started |

## Team

| Role | Person |
|------|--------|
| Owner | |
| Key Contributors | |

## Current Status

[What's happening now]

## Blockers

- [Blocker and mitigation]

## Decisions Needed

- [Decision with context]

## Updates

| Date | Update |
|------|--------|
| | |

---

*Created: [Date]*
*Last updated: [Date]*
```
