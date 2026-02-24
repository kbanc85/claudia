# Consultant/Advisor Archetype

**Profile:** Professionals who serve multiple clients with deliverables, proposals, and ongoing engagements.

**Key Signals:** Multiple clients, deliverables, proposals, retainers, "client," "engagement," "billable"

Includes everything from `_base-structure.md`, plus the following archetype-specific structure.

---

## Folder Structure (Archetype-Specific Additions)

### Full Business Depth

Adds to base structure:

```
├── clients/
│   └── [client-name]/             ← Deep per-client structure
│       ├── overview.md            ← Engagement snapshot, health, relationships
│       ├── milestone-plan.md      ← Phase-based milestone tracking
│       ├── stakeholders.md        ← Relationship map with stance tracking
│       ├── blockers.md            ← Active blockers, resolution tracking
│       ├── decision-log.md        ← Historical decisions
│       ├── wins.md                ← Successes documented
│       ├── meetings/              ← Meeting notes folder
│       ├── deliverables/          ← Work product folder
│       └── documents/             ← Ingested client docs
├── pipeline/
│   ├── active.md                  ← Current engagements/deals
│   ├── prospecting.md             ← Sales funnel
│   └── completed.md               ← Historical record
├── accountability/
│   ├── commitments.md             ← What I owe, what they owe me
│   └── overdue.md                 ← Escalation visibility
├── finances/
│   ├── overview.md                ← Revenue summary, capacity
│   ├── expenses.md                ← Expense tracking
│   ├── invoicing.md               ← Invoice log
│   └── tax-planning.md            ← Quarterly tax notes
├── templates/
│   ├── new-client-intake.md       ← Comprehensive intake questionnaire
│   ├── meeting-prep.md            ← Pre-meeting brief template
│   ├── meeting-capture.md         ← Post-meeting documentation
│   ├── milestone-plan.md          ← Engagement/project milestone tracker
│   ├── stakeholder-map.md         ← Relationship intelligence template
│   └── weekly-review.md           ← Guided review template
├── insights/
│   ├── patterns.md                ← Cross-client patterns
│   └── methodology.md             ← Your approach (if provided)
└── content/                       ← Optional, if thought leadership mentioned
    └── calendar.md
```

### Starter Business Depth

Base + `clients/_template/` (overview, meetings, deliverables), `pipeline/active.md`, `finances/overview.md`.

### Minimal Business Depth

Base + `clients/_template/` (overview, meetings).

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

### /client-health

```markdown
# Client Health

Health check across all active client engagements at once.

## What to Check

For each client folder in `clients/`:

1. **Engagement Health**
   - Current phase (discovery, active, winding down)
   - Milestone progress (from milestone-plan.md if exists)
   - Any overdue deliverables

2. **Relationship Health**
   - Last contact date
   - Stakeholder sentiment (from stakeholders.md if exists)
   - Any blockers (from blockers.md if exists)

3. **Commitment Status**
   - Open commitments from overview.md
   - Overdue items
   - Items waiting on client

4. **Financial Health** (if finances tracked)
   - Outstanding invoices
   - Upcoming billing

## Output Format

```
## Client Health — [Date]

### Summary
- X clients on track 🟢
- Y need attention 🟡
- Z at risk 🔴
- Total open commitments: X
- Total overdue: Y

### By Client

#### [Client Name] — 🟢 On Track
**Phase:** [Current phase]
**Last Contact:** [Date]
**Open Items:** [Count]
- [Key item 1]
- [Key item 2]

#### [Client Name] — 🟡 Attention Needed
**Phase:** [Current phase]
**Last Contact:** [Date] (X days ago)
**Concerns:**
- [Issue 1]
- [Issue 2]
**Suggested Action:** [What to do]

#### [Client Name] — 🔴 At Risk
**Phase:** [Current phase]
**Issues:**
- [Critical issue]
**Immediate Action:** [What to do now]

### Cross-Client Patterns
- [Pattern noticed across clients]

### Capacity Check
- Current active clients: X
- Available bandwidth:
- Upcoming endings:
```

## Tone
- Factual, scannable
- Lead with concerns
- Specific action suggestions
- Don't sugarcoat problems
```

---

## Client Templates

### Full Business Depth: Per-Client Files

Each client folder (`clients/[client-name]/`) contains:

| File | Purpose | Key Fields |
|------|---------|------------|
| `overview.md` | Engagement snapshot | Status, phase, health (🟢/🟡/🔴), engagement type, value, primary contact, situation, success criteria, current focus, key relationships, commitments (ours + theirs) |
| `milestone-plan.md` | Phase-based milestone tracking | Phases with deliverable tables (deliverable, owner, due, status), check-in schedule, budget/hours |
| `stakeholders.md` | Relationship intelligence | Decision makers, influencers, day-to-day contacts with stance (Champion/Supporter/Neutral/Skeptic/Blocker), political landscape, strategy per stakeholder |
| `blockers.md` | Active blockers with resolution tracking | Status, impact, owner, root cause, resolution plan, escalation path (Day 3/7/14) |
| `decision-log.md` | Historical decisions | Decision, context, options considered, rationale, impact, pending decisions |
| `wins.md` | Successes for reviews/testimonials | What happened, impact, reusable for (case study, testimonial, proposal reference) |
| `meetings/` | Meeting notes folder | |
| `deliverables/` | Work product folder | |
| `documents/` | Ingested client docs | |

### Starter/Minimal: Simplified Client Overview

`clients/_template/overview.md`: Status, phase, health, engagement type, key stakeholders, current focus, deliverables (completed/in progress/upcoming), commitments (ours + theirs), meeting history.
