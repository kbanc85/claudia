# Consultant/Advisor Archetype

**Profile:** Professionals who serve multiple clients with deliverables, proposals, and ongoing engagements.

**Key Signals:**
- Mentions multiple clients
- Talks about deliverables, proposals, engagements
- References retainers or project-based work
- Uses terms like "client," "engagement," "billable"

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
│   │   ├── client-status.md        ← Archetype-specific
│   │   ├── proposal-draft.md       ← Archetype-specific
│   │   ├── pipeline-review.md      ← Archetype-specific
│   │   └── engagement-review.md    ← Archetype-specific
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
│       ├── overview.md
│       ├── meetings/
│       └── deliverables/
├── pipeline/
│   ├── active.md
│   └── prospects/
└── content/                  ← Optional, if thought leadership mentioned
    └── calendar.md
```

---

## Archetype-Specific Commands

### /client-status

```markdown
# Client Status

Provide a health check across all active client engagements.

## What to Check

For each client folder in `clients/`:

1. **Engagement Health**
   - Current phase (discovery, active, winding down)
   - Any overdue deliverables
   - Open commitments

2. **Relationship Health**
   - Last contact date
   - Sentiment indicators
   - Key stakeholder status

3. **Financial Health** (if tracked)
   - Hours/budget used
   - Invoicing status

## Output Format

```
## Client Health — [Date]

### [Client Name]
Status: 🟢 On Track / 🟡 Attention Needed / 🔴 At Risk
Phase: [Current phase]
Last Contact: [Date]
Open Items: [Count]
- [Key item 1]
- [Key item 2]

[Repeat for each client]

### Summary
- X clients on track
- Y need attention
- Z items overdue across all clients
```

## Tone
- Factual, scannable
- Lead with concerns
- Suggest actions for problems
```

### /proposal-draft

```markdown
# Proposal Draft

Help draft a client proposal or SOW.

## Discovery Questions

1. "Who is this proposal for?"
2. "What problem are we solving?"
3. "What's the rough scope?"
4. "Any constraints (budget, timeline, resources)?"
5. "What's your relationship with them so far?"

## Structure

```
# Proposal: [Project Name]
## For: [Client Name]
## Prepared by: [User Name]
## Date: [Date]

### Executive Summary
[2-3 sentences on the opportunity and proposed approach]

### The Challenge
[What problem we're solving]

### Our Approach
[How we'll address it]

### Scope of Work
[Specific deliverables and activities]

### Timeline
[Key milestones and dates]

### Investment
[Pricing tiers if applicable]

Option A: [Basic scope] — $X
Option B: [Standard scope] — $Y
Option C: [Premium scope] — $Z

### Next Steps
[Clear call to action]
```

## Notes
- Keep executive summary to 2-3 sentences
- Pricing with 3 tiers when appropriate
- End with clear next step
```

### /pipeline-review

```markdown
# Pipeline Review

Review sales pipeline and prospect status.

## What to Check

### Active Pipeline (`pipeline/active.md`)
- Current prospects
- Stage of each
- Next actions needed
- Stalled opportunities

### Prospects (`pipeline/prospects/`)
- New leads
- Research needed
- Outreach status

## Output Format

```
## Pipeline Review — [Date]

### Active Opportunities

| Prospect | Stage | Value | Next Action | Last Touch |
|----------|-------|-------|-------------|------------|
| [Name] | [Stage] | $X | [Action] | [Date] |

### Needs Attention
- [Prospect] — stalled for X days
- [Prospect] — promised follow-up not done

### New Leads
- [Lead] — source: [where from]

### Summary
- Total pipeline value: $X
- Weighted value: $Y
- X opportunities need action
```
```

### /engagement-review

```markdown
# Engagement Review

Deep dive on a specific client engagement.

## Usage
`/engagement-review [client name]`

## What to Surface

1. **Overview**
   - Engagement type and phase
   - Key stakeholders
   - Start date and expected end

2. **Deliverable Status**
   - What's been delivered
   - What's in progress
   - What's coming up

3. **Relationship Health**
   - Stakeholder sentiment
   - Communication frequency
   - Any concerns

4. **Commitments**
   - What you owe them
   - What they owe you

5. **Patterns**
   - What's working
   - What's not
   - Lessons for future

## Output Format

```
## Engagement Review: [Client Name]
### As of [Date]

**Phase:** [Current phase]
**Health:** 🟢/🟡/🔴

### Key Stakeholders
| Name | Role | Sentiment | Last Contact |
|------|------|-----------|--------------|

### Deliverable Status
**Completed:**
- [Item] — [Date]

**In Progress:**
- [Item] — due [Date]

**Upcoming:**
- [Item] — expected [Date]

### Open Loops
- [Commitment or waiting item]

### Observations
- [Pattern or insight]

### Recommendations
- [Suggested action]
```
```

---

## Client Template

`clients/_template/overview.md`:

```markdown
# [Client Name]

## Quick Stats

| Field | Value |
|-------|-------|
| Status | Active / Paused / Completed |
| Phase | Discovery / Active / Winding Down |
| Started | [Date] |
| Primary Contact | [Name] |
| Health | 🟢 / 🟡 / 🔴 |

## Engagement

**Type:** [Retainer / Project / Advisory]
**Scope:** [Brief description]
**Value:** [If tracked]

## Key Stakeholders

| Name | Role | Sentiment | Notes |
|------|------|-----------|-------|
| | | | |

## Current Focus

[What we're working on now]

## Deliverables

### Completed
- [Deliverable] — [Date]

### In Progress
- [Deliverable] — due [Date]

### Upcoming
- [Deliverable] — expected [Date]

## Commitments

### We Owe Them
- [Item] — due [Date]

### They Owe Us
- [Item] — expected [Date]

## Meeting History

| Date | Attendees | Key Outcomes |
|------|-----------|--------------|
| | | |

## Notes

[Context, background, things to remember]

---

*Created: [Date]*
*Last updated: [Date]*
```

---

## Pipeline Templates

`pipeline/active.md`:

```markdown
# Active Pipeline

Opportunities in active pursuit.

## Stages
1. **Prospect** — Initial interest, no conversation yet
2. **Discovery** — Had initial conversation
3. **Proposal** — Proposal sent
4. **Negotiation** — Discussing terms
5. **Verbal** — Verbal yes, awaiting paperwork

## Active Opportunities

| Prospect | Stage | Est. Value | Next Action | Due | Notes |
|----------|-------|------------|-------------|-----|-------|
| | | | | | |

## Stalled

Opportunities with no activity in 2+ weeks:
- [Prospect] — last action [date]

## Recently Won

| Client | Value | Won Date |
|--------|-------|----------|
| | | |

## Recently Lost

| Prospect | Reason | Date |
|----------|--------|------|
| | | |

---

*Last updated: [Date]*
```
