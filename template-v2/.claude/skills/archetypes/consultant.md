# Consultant/Advisor Archetype

**Profile:** Professionals who serve multiple clients with deliverables, proposals, and ongoing engagements.

**Key Signals:**
- Mentions multiple clients
- Talks about deliverables, proposals, engagements
- References retainers or project-based work
- Uses terms like "client," "engagement," "billable"

---

## Folder Structure

Structure adapts based on `business_depth` setting from onboarding.

### Full Business Depth

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
│   │   ├── pipeline-review.md      ← Business command
│   │   ├── financial-snapshot.md   ← Business command
│   │   └── accountability-check.md ← Business command
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

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/                  ← Base + archetype commands
│   │   └── pipeline-review.md     ← Only business command
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
│       ├── overview.md            ← Simplified overview
│       ├── meetings/
│       └── deliverables/
├── pipeline/
│   └── active.md
├── finances/
│   └── overview.md
└── templates/
    └── meeting-capture.md
```

### Minimal Business Depth

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/                  ← Base + archetype commands only
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
└── clients/
    └── _template/
        ├── overview.md
        └── meetings/
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

## Client Templates (Full Business Depth)

The full business depth creates a comprehensive client operating system with multiple specialized files per client.

### clients/[client-name]/overview.md

```markdown
# [Client Name]

## Snapshot

| Field | Value |
|-------|-------|
| Status | Active / Paused / Completed |
| Phase | Discovery / Active / Delivery / Winding Down |
| Started | [Date] |
| Health | 🟢 On Track / 🟡 Attention Needed / 🔴 At Risk |
| Engagement Type | Retainer / Project / Advisory |
| Value | $X |
| Primary Contact | [Name] |

## The Situation

[What's really going on - context, not just facts. What problem are we solving? What's at stake for them?]

## What Success Looks Like

[Their version, translated to measurable outcomes]
-
-

## Current Focus

1.
2.
3.

## Key Relationships

| Name | Role | Stance | Notes |
|------|------|--------|-------|
| | | Champion/Supporter/Neutral/Skeptic | |

See `stakeholders.md` for full relationship map.

## Open Loops

- [ ]
- [ ]

## My Commitments

| What | Due | Status |
|------|-----|--------|
| | | Pending/In Progress/Done |

## Their Commitments

| What | From | Due | Status |
|------|------|-----|--------|
| | | | |

## Quick Links

- Milestone Plan: `./milestone-plan.md`
- Stakeholders: `./stakeholders.md`
- Blockers: `./blockers.md`
- Decision Log: `./decision-log.md`
- Wins: `./wins.md`

---

*Created: [Date]*
*Last updated: [Date]*
```

### clients/[client-name]/milestone-plan.md

```markdown
# Milestone Plan: [Client Name]

## Engagement Overview

**Type:** [Retainer / Project / Advisory]
**Start:** [Date]
**Target End:** [Date or Ongoing]
**Value:** $X

## Success Criteria

What does "done well" look like?
-
-

## Current Phase: [Phase Name]

**Status:** 🟢 / 🟡 / 🔴
**Target Completion:** [Date]

| Deliverable | Owner | Due | Status | Notes |
|-------------|-------|-----|--------|-------|
| | | | Not Started/In Progress/Complete/Blocked | |

---

## All Phases

### Phase 1: [Name] (e.g., Discovery)
**Target:** [Date]
**Status:** Complete / In Progress / Not Started

| Deliverable | Due | Status |
|-------------|-----|--------|
| | | |

**Lessons/Notes:**


---

### Phase 2: [Name] (e.g., Strategy)
**Target:** [Date]
**Status:** Complete / In Progress / Not Started

| Deliverable | Due | Status |
|-------------|-----|--------|
| | | |

---

### Phase 3: [Name] (e.g., Implementation)
[Same structure]

---

## Check-in Schedule

| Date | Type | Focus | Notes |
|------|------|-------|-------|
| | Weekly / Milestone / Ad-hoc | | |

## Budget/Hours

| Phase | Estimated | Actual | Variance |
|-------|-----------|--------|----------|
| | | | |

**Total:** X / Y hours (Z%)

---

*Last updated: [Date]*
```

### clients/[client-name]/stakeholders.md

```markdown
# Stakeholders: [Client Name]

## Decision Makers

| Name | Role | Stance | Influence | Communication Style | Notes |
|------|------|--------|-----------|---------------------|-------|
| | | Champion/Supporter/Neutral/Skeptic/Blocker | High/Medium/Low | | |

## Influencers

| Name | Role | Stance | Influence | Notes |
|------|------|--------|-----------|-------|
| | | | | |

## Day-to-Day Contacts

| Name | Role | Working Relationship | Preferred Channel | Notes |
|------|------|---------------------|-------------------|-------|
| | | Excellent/Good/Developing | Email/Slack/Phone | |

## Political Landscape

**Power dynamics:**


**Alliances to leverage:**


**Tensions to navigate:**


## Strategy by Stakeholder

| Stakeholder | Current Stance | Target Stance | Approach |
|-------------|----------------|---------------|----------|
| | Skeptic | Supporter | |

## Relationship Actions

| Person | Action Needed | By When | Status |
|--------|---------------|---------|--------|
| | | | |

---

*Last updated: [Date]*
```

### clients/[client-name]/blockers.md

```markdown
# Blockers: [Client Name]

## Active Blockers

### Blocker 1: [Title]

| Field | Value |
|-------|-------|
| Status | Active / Being Addressed / Escalated |
| Impact | High / Medium / Low |
| Blocking | [What deliverable or milestone] |
| Owner | [Who's resolving] |
| Since | [Date identified] |

**Description:**
[What's the blocker]

**Root Cause:**
[Why is this happening]

**Resolution Plan:**
-

**Dependencies:**
[What/who is needed to resolve]

**Updates:**
| Date | Update |
|------|--------|
| | |

---

### Blocker 2: [Title]
[Same structure]

---

## Resolved Blockers

| Blocker | Resolved | Days Blocked | Lesson |
|---------|----------|--------------|--------|
| | [Date] | X | |

## Escalation Path

If a blocker persists:
1. Day 3: [Action]
2. Day 7: [Action]
3. Day 14: [Escalation]

---

*Last updated: [Date]*
```

### clients/[client-name]/decision-log.md

```markdown
# Decision Log: [Client Name]

## Recent Decisions

### [Date]: [Decision Title]

**Decision:** [What was decided]

**Context:** [Why this decision was needed]

**Options Considered:**
1. [Option A] - [Pros/Cons]
2. [Option B] - [Pros/Cons]
3. [Option C] - [Pros/Cons]

**Decided By:** [Who made the call]

**Rationale:** [Why this option]

**Impact:** [What changed as a result]

---

### [Date]: [Decision Title]
[Same structure]

---

## Decision History

| Date | Decision | Made By | Outcome |
|------|----------|---------|---------|
| | | | Positive/Neutral/Revisit |

## Decisions Pending

| Decision | Due | Owner | Blocker? |
|----------|-----|-------|----------|
| | | | Yes/No |

---

*Last updated: [Date]*
```

### clients/[client-name]/wins.md

```markdown
# Wins: [Client Name]

Document successes to reference in reviews, testimonials, and case studies.

## Major Wins

### [Date]: [Win Title]

**What happened:**
[Description of the achievement]

**Impact:**
- [Quantifiable result if possible]
- [Qualitative impact]

**Who contributed:**
[Your role, client team involvement]

**Client reaction:**
[Quote or observation about their response]

**Reusable for:**
- [ ] Case study
- [ ] Testimonial request
- [ ] Proposal reference

---

### [Date]: [Win Title]
[Same structure]

---

## Quick Wins Log

| Date | Win | Impact |
|------|-----|--------|
| | | |

## Testimonial Opportunities

| Win | Potential Quote | Asked? | Status |
|-----|-----------------|--------|--------|
| | | Yes/No | |

---

*Last updated: [Date]*
```

---

## Client Template (Starter/Minimal)

For starter and minimal business depth, use a simplified client overview.

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
