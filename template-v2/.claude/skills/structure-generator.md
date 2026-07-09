---
name: structure-generator
description: Create personalized folder structures and files based on user archetype, business depth preferences, and workflow needs.
user-invocable: false
invocation: proactive
effort-level: medium
---

# Structure Generator Skill

**Triggers:** Invoked by the onboarding skill after archetype detection, or when user requests structure changes.

---

## Business Depth Levels

The structure generator supports three levels of business complexity, chosen during onboarding:

### Full System
Everything an organized professional needs for running their business:
- Pipeline tracking (active, prospecting, completed)
- Financial management (overview, expenses, invoicing, tax planning)
- Accountability tracking (commitments, overdue items)
- Templates library (client intake, meeting prep, milestone planning, etc.)
- Insights/patterns tracking
- Methodology documentation (if user has one)

### Starter System
Core tracking without overwhelming structure:
- Pipeline (active only)
- Finances (overview only)
- Basic templates (meeting capture)

### Minimal System
Just context and relationships, let structure grow organically:
- Context files (me, commitments, waiting, patterns, learnings)
- People folder

---

## Universal Business Modules

These modules are available to ALL archetypes based on `business_depth` setting:

### Full System Adds:

```
pipeline/
  active.md              ← Current engagements/deals
  prospecting.md         ← Sales funnel
  completed.md           ← Historical record

accountability/
  commitments.md         ← What I owe, what they owe me
  overdue.md             ← Escalation visibility

finances/
  overview.md            ← Revenue summary, capacity
  expenses.md            ← Expense tracking
  invoicing.md           ← Invoice log
  tax-planning.md        ← Quarterly tax notes

templates/
  new-client-intake.md   ← Comprehensive intake questionnaire
  meeting-prep.md        ← Pre-meeting brief template
  meeting-capture.md     ← Post-meeting documentation
  milestone-plan.md      ← Engagement/project milestone tracker
  stakeholder-map.md     ← Relationship intelligence template
  weekly-review.md       ← Guided review template

insights/
  patterns.md            ← Cross-client/project patterns
  methodology.md         ← User's approach (if provided)
```

### Starter System Adds:

```
pipeline/
  active.md
finances/
  overview.md
templates/
  meeting-capture.md
```

### Minimal System:
Just the standard `context/` and `people/` folders (no business modules).

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

**Built-in Commands** (templates defined in archetype config, not separate files)**:**
- `/client-status` - Health check all engagements
- `/proposal-draft` - Draft new proposals
- `/pipeline-review` - What's in your funnel
- `/engagement-review [client]` - Deep dive on specific client

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

**Built-in Commands** (templates defined in archetype config, not separate files)**:**
- `/exec-brief` - Leadership-focused morning brief
- `/1on1-prep [person]` - Prepare for 1:1 meeting
- `/board-update` - Draft board update
- `/initiative-status` - Status across initiatives

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

**Built-in Commands** (templates defined in archetype config, not separate files)**:**
- `/investor-update` - Draft investor update
- `/pitch-prep` - Prepare for investor meeting
- `/team-standup` - Prepare standup notes
- `/runway-check` - Financial runway summary

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

**Built-in Commands** (templates defined in archetype config, not separate files)**:**
- `/week-review` - Solo-focused weekly review
- `/invoice-draft [client]` - Draft invoice
- `/project-status` - Status across projects
- `/client-review [client]` - Deep dive on client

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

**Built-in Commands** (templates defined in archetype config, not separate files)**:**
- `/content-calendar` - View/update content calendar
- `/draft-post [platform]` - Quick social draft
- `/audience-insights` - Review audience patterns
- `/collab-outreach [person]` - Draft collaboration outreach

---

## Core Files (All Archetypes)

### context/me.md Template
```markdown
---
type: context
title: "[Name]"
description: "User profile and working context."
tags: [context, profile]
---

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
---
type: commitment-ledger
title: "Commitments"
description: "Active promises being tracked."
tags: [context, commitments]
---

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
---
type: commitment-ledger
title: "Waiting On"
description: "Things awaited from others."
tags: [context, waiting]
---

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
---
type: context
title: "Patterns"
description: "Observations across our work together."
tags: [context, patterns]
---

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
---
type: context
title: "Claudia's Learnings"
description: "What Claudia has learned about working with you."
tags: [context, learnings]
---

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

---

## Universal Business Module Templates

These templates are used when `business_depth` is "full" or "starter".

### pipeline/active.md Template
```markdown
---
type: context
title: "Active Pipeline"
description: "Current engagements and opportunities in progress."
tags: [pipeline]
---

# Active Pipeline

Current engagements and opportunities in progress.

## Active Engagements

| Client/Opportunity | Type | Stage | Value | Health | Next Action | Due |
|-------------------|------|-------|-------|--------|-------------|-----|
| | | | | 🟢/🟡/🔴 | | |

## Stages
1. **Prospecting** - Initial interest, no conversation yet
2. **Discovery** - Had initial conversation
3. **Proposal** - Proposal sent
4. **Negotiation** - Discussing terms
5. **Verbal** - Verbal yes, awaiting paperwork
6. **Active** - Engagement in progress
7. **Closing** - Wrapping up, final deliverables

## Capacity Check

- **Current utilization:** X%
- **Available hours/slots:**
- **Next available for new work:** [Date]

## Stalled (No Activity 2+ Weeks)

| Opportunity | Last Touch | Notes |
|-------------|------------|-------|
| | | |

---

*Last updated: [Date]*
```

### pipeline/prospecting.md Template (Full System Only)
```markdown
---
type: context
title: "Prospecting Pipeline"
description: "Leads and outreach in progress."
tags: [pipeline]
---

# Prospecting Pipeline

Potential opportunities being cultivated.

## Warm Leads

| Prospect | Source | Interest Level | Last Contact | Next Step |
|----------|--------|----------------|--------------|-----------|
| | Referral/Inbound/Outreach | Hot/Warm/Cool | | |

## Outreach in Progress

| Target | Approach | Status | Notes |
|--------|----------|--------|-------|
| | | Researching/Drafted/Sent/Follow-up | |

## Referral Sources

| Source | Relationship | Last Referral | Notes |
|--------|--------------|---------------|-------|
| | | | |

## Lead Sources (What's Working)

- [ ] Referrals
- [ ] Content/Thought leadership
- [ ] LinkedIn
- [ ] Speaking/Events
- [ ] Other:

---

*Last updated: [Date]*
```

### pipeline/completed.md Template (Full System Only)
```markdown
---
type: context
title: "Completed Engagements"
description: "Closed and delivered engagements."
tags: [pipeline]
---

# Completed Engagements

Historical record of past work.

## [Year]

| Client | Engagement | Duration | Value | Outcome | Referrable? |
|--------|------------|----------|-------|---------|-------------|
| | | | | | Yes/No |

## Totals

- **Total engagements:** X
- **Total revenue:** $X
- **Average engagement:** $X
- **Repeat clients:** X%

## Lessons Learned

### What Worked
-

### What to Do Differently
-

### Best Clients (For Future Reference)
-

---

*Last updated: [Date]*
```

### accountability/commitments.md Template (Full System Only)
```markdown
---
type: commitment-ledger
title: "Commitments"
description: "Commitments tracked for accountability."
tags: [accountability, commitments]
---

# Commitments

Active promises and obligations being tracked.

## Due This Week

| What | To | Due | Status | Notes |
|------|-----|-----|--------|-------|
| | | | Pending/In Progress/At Risk | |

## Due Later

| What | To | Due | Status |
|------|-----|-----|--------|
| | | | |

## Waiting On Others

| What | From | Since | Last Follow-up | Days Waiting |
|------|------|-------|----------------|--------------|
| | | | | |

## Recently Completed (Last 30 Days)

| What | To | Completed | On Time? |
|------|-----|-----------|----------|
| | | | Yes/No |

---

*Last updated: [Date]*
```

### accountability/overdue.md Template (Full System Only)
```markdown
---
type: commitment-ledger
title: "Overdue Items"
description: "Commitments past their due date."
tags: [accountability, overdue]
---

# Overdue Items

Things that need immediate attention.

## My Overdue Commitments

| What | To | Was Due | Days Late | Recovery Plan |
|------|-----|---------|-----------|---------------|
| | | | | |

## Overdue From Others

| What | From | Was Due | Days Late | Follow-up Status |
|------|------|---------|-----------|------------------|
| | | | | |

## Escalation Notes

<!-- Items requiring difficult conversations or special handling -->

---

*Last updated: [Date]*
```

### finances/overview.md Template
```markdown
---
type: context
title: "Financial Overview"
description: "Monthly financial snapshot."
tags: [finances]
---

# Financial Overview

Revenue, capacity, and financial health at a glance.

## This Month: [Month Year]

| Metric | Amount | vs Target |
|--------|--------|-----------|
| Revenue | $X | X% |
| Expenses | $X | |
| Net | $X | |

## Active Revenue Streams

| Client/Source | Type | Monthly/Project | Status |
|--------------|------|-----------------|--------|
| | Retainer/Project/Hourly | $X | Active/Ending Soon |

## Capacity

- **Current utilization:** X%
- **Available for:** [type of work]
- **Target utilization:** X%

## Cash Position

- **Outstanding invoices:** $X
- **Expected this month:** $X
- **Next invoice to send:** [Client] - $X

## Upcoming

- **Invoices to send:**
- **Payments expected:**
- **Tax set-aside needed:** $X

---

*Last updated: [Date]*
```

### finances/expenses.md Template (Full System Only)
```markdown
---
type: context
title: "Expenses"
description: "Expense tracking by category."
tags: [finances]
---

# Expenses

Business expense tracking.

## This Month: [Month Year]

| Date | Category | Vendor | Amount | Notes |
|------|----------|--------|--------|-------|
| | Software/Travel/Marketing/Professional/Other | | $X | |

**Monthly Total:** $X

## By Category (Monthly)

| Category | Amount | Budget | Variance |
|----------|--------|--------|----------|
| Software & Tools | $X | $X | |
| Professional Services | $X | $X | |
| Marketing | $X | $X | |
| Travel | $X | $X | |
| Office/Equipment | $X | $X | |
| Other | $X | $X | |

**Total:** $X

## Recurring Expenses

| Item | Vendor | Frequency | Amount | Renewal Date |
|------|--------|-----------|--------|--------------|
| | | Monthly/Annual | $X | |

## Year to Date

| Month | Total Expenses |
|-------|----------------|
| Jan | $X |
| Feb | $X |
...

---

*Last updated: [Date]*
```

### finances/invoicing.md Template (Full System Only)
```markdown
---
type: context
title: "Invoicing Log"
description: "Outstanding and paid invoices."
tags: [finances]
---

# Invoicing Log

Track all invoices sent and payments received.

## Outstanding Invoices

| Invoice # | Client | Amount | Sent | Due | Days Out |
|-----------|--------|--------|------|-----|----------|
| | | $X | | | |

**Total Outstanding:** $X

## This Month

| Invoice # | Client | Amount | Sent | Paid | Days to Pay |
|-----------|--------|--------|------|------|-------------|
| | | $X | | | |

**Monthly Total:** $X

## Payment Terms by Client

| Client | Terms | Notes |
|--------|-------|-------|
| | Net 15/30/45 | |

## Invoice History

### [Year]

| Month | # Invoices | Total Billed | Collected | Outstanding |
|-------|------------|--------------|-----------|-------------|
| Jan | | $X | $X | $X |
...

---

*Last updated: [Date]*
```

### finances/tax-planning.md Template (Full System Only)
```markdown
---
type: context
title: "Tax Planning"
description: "Quarterly estimates and set-aside tracking."
tags: [finances]
---

# Tax Planning

Quarterly tax notes and planning.

## Current Year: [Year]

### Quarterly Estimates

| Quarter | Due Date | Estimated Tax | Paid | Status |
|---------|----------|---------------|------|--------|
| Q1 | Apr 15 | $X | | |
| Q2 | Jun 15 | $X | | |
| Q3 | Sep 15 | $X | | |
| Q4 | Jan 15 | $X | | |

### Set-Aside Calculation

- **YTD Revenue:** $X
- **YTD Expenses:** $X
- **Estimated Net:** $X
- **Tax Rate (estimated):** X%
- **Should have set aside:** $X
- **Actually set aside:** $X

### Deductible Expenses to Track

- [ ] Home office
- [ ] Software subscriptions
- [ ] Professional development
- [ ] Travel
- [ ] Meals (business)
- [ ] Professional services
- [ ] Equipment

### Notes for Tax Time

<!-- Important items, unusual situations, questions for accountant -->

---

*Last updated: [Date]*
```

### templates/new-client-intake.md Template (Full System Only)
```markdown
---
type: organization
title: "[Client Name]"
description: "New client intake."
tags: [template, client]
---

# New Client Intake

Use this template when onboarding a new client.

## Basic Information

| Field | Response |
|-------|----------|
| Client Name | |
| Primary Contact | |
| Email | |
| Phone | |
| Website | |

## The Engagement

| Field | Response |
|-------|----------|
| Engagement Type | Retainer / Project / Advisory / Hourly |
| Scope (brief) | |
| Start Date | |
| Expected Duration | |
| Value | $X |
| Billing | Hourly @ $X / Monthly retainer / Project fixed |

## Understanding Their Situation

**What problem are we solving?**


**What does success look like for them?**


**What have they tried before?**


**Why now?**


## Key Stakeholders

| Name | Role | Decision Maker? | Notes |
|------|------|-----------------|-------|
| | | Yes/No/Influencer | |

## Working Style

- **Preferred communication:**
- **Meeting cadence:**
- **Timezone:**
- **Quirks/preferences:**

## Red Flags or Concerns

<!-- Anything to watch for -->

## First 30 Days

- [ ] Kickoff meeting
- [ ] Access/credentials obtained
- [ ] [First deliverable]
- [ ] Check-in scheduled

---

*Created: [Date]*
```

### templates/meeting-prep.md Template (Full System Only)
```markdown
---
type: meeting
title: "[Meeting Title]"
description: "Preparation notes for a meeting."
tags: [template, meeting]
---

# Meeting Prep Template

## Meeting: [Title]
**Date/Time:**
**With:**
**Purpose:**

## Context

**Relationship status:**
- Last contact:
- Current sentiment:
- Open items between us:

**Their current situation:**


## Objectives

What I want from this meeting:
1.
2.
3.

## Agenda

1. [Topic] - X min
2. [Topic] - X min
3. [Topic] - X min

## Key Points to Make

-
-
-

## Questions to Ask

-
-
-

## Potential Concerns

What they might raise, and my response:
- [Concern]: [Response]

## Materials Needed

- [ ]
- [ ]

## Follow-up Planned

What I expect to do after:
-

---

*Prepared: [Date]*
```

### templates/meeting-capture.md Template
```markdown
---
type: meeting
title: "[Meeting Title]"
description: "Notes captured from a meeting."
tags: [template, meeting]
---

# Meeting Notes

## Meeting: [Title]
**Date:**
**Attendees:**
**Duration:**

## Summary

[2-3 sentence summary of what happened]

## Key Discussion Points

### [Topic 1]
-
-

### [Topic 2]
-
-

## Decisions Made

| Decision | Owner | Notes |
|----------|-------|-------|
| | | |

## Action Items

### My Commitments
| What | Due | Notes |
|------|-----|-------|
| | | |

### Their Commitments
| What | Who | Due | Notes |
|------|-----|-----|-------|
| | | | |

## Follow-up Needed

- [ ]

## Open Questions

-

## Notes / Observations

<!-- Tone, body language, things said off-record, concerns -->

---

*Captured: [Date]*
```

### templates/milestone-plan.md Template (Full System Only)
```markdown
---
type: project
title: "[Client/Project Name]"
description: "Milestone plan for an engagement."
tags: [template, project]
---

# Milestone Plan

## Engagement: [Client/Project Name]
**Start:**
**Target End:**
**Type:**

## Success Criteria

What does "done well" look like?
-
-

## Milestones

### Phase 1: [Name]
**Target:** [Date]
**Status:** Not Started / In Progress / Complete

| Deliverable | Owner | Due | Status |
|-------------|-------|-----|--------|
| | | | |

**Dependencies:**
-

**Risks:**
-

---

### Phase 2: [Name]
**Target:** [Date]
**Status:** Not Started / In Progress / Complete

| Deliverable | Owner | Due | Status |
|-------------|-------|-----|--------|
| | | | |

---

### Phase 3: [Name]
[Same structure]

---

## Check-in Schedule

| Date | Type | Focus |
|------|------|-------|
| | Weekly/Milestone | |

## Budget/Hours Tracking

| Phase | Estimated | Actual | Variance |
|-------|-----------|--------|----------|
| | | | |

---

*Created: [Date]*
*Last updated: [Date]*
```

### templates/stakeholder-map.md Template (Full System Only)
```markdown
---
type: project
title: "[Client/Project Name]"
description: "Stakeholder map for an engagement."
tags: [template, project]
---

# Stakeholder Map

## Client/Project: [Name]

## Key Players

### Decision Makers

| Name | Role | Stance | Influence | Notes |
|------|------|--------|-----------|-------|
| | | Champion/Supporter/Neutral/Skeptic/Blocker | High/Medium/Low | |

### Influencers

| Name | Role | Stance | Influence | Notes |
|------|------|--------|-----------|-------|
| | | | | |

### Day-to-Day Contacts

| Name | Role | Working Relationship | Notes |
|------|------|---------------------|-------|
| | | Excellent/Good/Developing/Difficult | |

## Political Landscape

**Power dynamics:**


**Alliances to leverage:**


**Tensions to navigate:**


## Strategy by Stakeholder

| Stakeholder | Current Stance | Target Stance | Approach |
|-------------|----------------|---------------|----------|
| | | | |

## Relationship Health

| Stakeholder | Last Touch | Next Touch | Notes |
|-------------|------------|------------|-------|
| | | | |

---

*Created: [Date]*
*Last updated: [Date]*
```

### templates/weekly-review.md Template (Full System Only)
```markdown
---
type: context
title: "Weekly Review"
description: "Weekly review of wins, progress, and next steps."
tags: [template, review]
---

# Weekly Review

## Week of: [Date]

## Wins

What went well this week:
-
-

## Progress on Priorities

| Priority | Progress | Notes |
|----------|----------|-------|
| | On track/Behind/Complete | |

## Deliverables

**Completed:**
-

**In Progress:**
-

**Blocked:**
-

## Relationships

| Person/Client | Status | Notes/Action Needed |
|---------------|--------|---------------------|
| | | |

## Financial

- Revenue this week: $X
- Invoices sent:
- Payments received:
- Outstanding: $X

## Commitments Status

**Kept:**
-

**Missed/At Risk:**
-

**New commitments made:**
-

## Next Week

**Must happen:**
1.
2.

**Should happen:**
1.
2.

## Energy/Capacity

How was this week? What affected it?


## Reflection

What would I do differently?


---

*Completed: [Date]*
```

### insights/patterns.md Template (Full System Only)
```markdown
---
type: context
title: "Patterns"
description: "Cross-engagement patterns and insights."
tags: [insights]
---

# Patterns

Observations and insights across all work.

## Client/Engagement Patterns

### What Works Well
-

### Watch For
-

### Pricing Insights
-

## Work Patterns

### Most Productive Times/Conditions
-

### Energy Drains
-

### Scope Creep Triggers
-

## Relationship Patterns

### Best Client Characteristics
-

### Red Flags in New Opportunities
-

### Communication Preferences That Work
-

## Business Patterns

### Revenue Trends
-

### Seasonal Patterns
-

### Pipeline Insights
-

## Cross-Engagement Insights

Things that apply broadly:
-

---

*Last updated: [Date]*
```

### insights/methodology.md Template (Full System Only)
```markdown
---
type: context
title: "My Methodology"
description: "Personal methodology and process."
tags: [insights]
---

# My Methodology

How I approach my work.

## Philosophy

Core beliefs about how I work:
-
-

## Framework / Process

### Phase 1: [Name]
**Purpose:**
**Key Activities:**
-
**Outputs:**
-

### Phase 2: [Name]
[Same structure]

### Phase 3: [Name]
[Same structure]

## Principles

Non-negotiables in how I work:
1.
2.
3.

## Tools & Techniques

| Situation | Approach |
|-----------|----------|
| | |

## What I Don't Do

Boundaries and scope limitations:
-
-

## Pricing Philosophy

How I think about value and pricing:
-

## Evolution Notes

How this methodology has changed over time:
-

---

*Last updated: [Date]*
```

---

### context/integrations.md Template (if user expressed interest)

Only create this file if user showed interest in integrations during onboarding Phase 3.5.

```markdown
---
type: context
title: "Integrations"
description: "Connected and desired integrations."
tags: [context, integrations]
---

# Integrations

External tools and services connected to Claudia.

## Active

| Integration | Type | Status | Added |
|-------------|------|--------|-------|
| | | | |

## Interests

Services you want to connect:
-

## Declined

| Integration | Reason | Date |
|-------------|--------|------|
| | | |

## Wish List

Services without easy solutions yet:
-

---

## Setup Notes

### How Integrations Work

- **CLI tools** (gh, rclone) - Built-in, usually already installed
- **MCP servers** - Added to `.mcp.json`, restart Claude Code to activate
- **Browser assist** - I navigate web apps with you when no better option exists

### Adding New Integrations

Ask me about connecting any tool. I'll:
1. Search for the best available option
2. Explain what access it provides
3. Walk you through setup if you want it

---

*Last updated: [date]*
```

### people/_template.md

This is the **canonical person template**. The `new-person` skill and
`archetypes/_base-structure.md` both reference this block instead of keeping
their own variants. When you instantiate it, fill the OKF frontmatter (set
`timestamp` to the current time in ISO 8601) and slug the filename (`Sarah
Chen` -> `people/sarah-chen.md`).

```markdown
---
type: person
title: "[Person Name]"
description: "Relationship profile."
tags: [person]
timestamp: "[ISO 8601, set on creation]"
---

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

## OKF Authoring Standard

Every knowledge file generated here ships an OKF frontmatter block (see
`docs/okf-conventions.md`). The templates above already carry it. Two rules
when you instantiate them:

- **Set `timestamp`** to the current time in ISO 8601 on every file you write
  (templates omit it; you fill it). `type` and `title` come from the template.
- **Write an `index.md` per knowledge directory.** Any generated directory that
  holds knowledge files (`people/`, `projects/`, `context/`, and per archetype
  `clients/`, `pipeline/`, `finances/`, `accountability/`, `insights/`) gets an
  `index.md` listing its files. Per OKF §6 an `index.md` has **no frontmatter**;
  its body is one bullet per file: `* [Title](file.md) - one-line description`,
  grouped under a `#` heading per type when the directory mixes types. Generation
  ends by writing these index files.

## Generation Process

When generating a structure:

1. **Create base folders** for the archetype
2. **Apply business depth modules** based on `business_depth` setting:
   - **Full:** Add pipeline/, accountability/, finances/, templates/, insights/ with all files
   - **Starter:** Add pipeline/active.md, finances/overview.md, templates/meeting-capture.md
   - **Minimal:** Skip business modules, just context/ and people/
3. **Copy templates** to appropriate locations
4. **Generate archetype-specific commands** (see archetype sections)
5. **Generate business commands** based on `business_depth`:
   - **Full:** Add `/pipeline-review`, `/financial-snapshot`, `/client-health`
   - **Starter:** Add `/pipeline-review`
   - **Minimal:** No additional business commands
6. **Create context/me.md** with user's profile data, including business preferences:
   ```markdown
   ## Business Setup
   - **Depth:** [full/starter/minimal]
   - **Tracks finances:** [yes/no]
   - **Billing model:** [if captured]
   - **Has methodology:** [yes/no]
   ```
7. **Initialize empty context files** (commitments, waiting, patterns, learnings)
8. **If has_methodology is true and business_depth is full:**
   - Create `insights/methodology.md` with user's notes as starting point
9. **If user expressed interest in integrations during Phase 3.5:**
   - Create `context/integrations.md`
   - Add integrations section to `context/me.md`
   - Note any specific integration interests for later
10. **Write an `index.md` in every knowledge directory** created (per the OKF
    Authoring Standard above): `people/`, `context/`, and any business modules
    present (`pipeline/`, `finances/`, `accountability/`, `insights/`, plus
    archetype equivalents like `clients/`). No frontmatter; one bullet per file.
11. **Report what was created**, grouped by category:
    - Core files (context, people)
    - Business modules (if applicable)
    - Archetype-specific structure
    - Commands generated

---

## Optional Judgment Rule Templates

During onboarding or later sessions, if the user wants help setting up initial judgment rules, offer archetype-specific starter priorities. These are created in `context/judgment.yaml` only when explicitly requested.

**When to offer:** After structure setup is complete, if the user asks about priorities, or if during `/meditate` the user wants a starting framework. Never create this file automatically.

### Consultant/Advisor Starter Rules

```yaml
version: 1

priorities:
  - label: "Client deliverables"
    rank: 1
    note: "Active client work always comes first"
  - label: "Prospect follow-ups"
    rank: 2
    note: "Pipeline health depends on timely responses"
  - label: "Internal operations"
    rank: 3
    note: "Invoicing, admin, process improvement"
  - label: "Business development content"
    rank: 4
    note: "Thought leadership, networking, speaking"

escalation: []
overrides: []
surfacing: []
delegation: []
```

### Founder/Entrepreneur Starter Rules

```yaml
version: 1

priorities:
  - label: "Investor communications"
    rank: 1
    note: "Speed and responsiveness signal competence to investors"
  - label: "Product-blocking decisions"
    rank: 2
    note: "Unblock the team before anything else"
  - label: "Team management"
    rank: 3
    note: "1:1s, hiring, culture"
  - label: "Operational tasks"
    rank: 4
    note: "Admin, legal, finance"

escalation: []
overrides: []
surfacing: []
delegation: []
```

### Executive/Manager Starter Rules

```yaml
version: 1

priorities:
  - label: "Board and leadership commitments"
    rank: 1
    note: "Upward obligations have the least flexibility"
  - label: "Direct report 1:1s and development"
    rank: 2
    note: "People management is the multiplier"
  - label: "Cross-functional initiatives"
    rank: 3
    note: "Strategic projects and collaboration"
  - label: "Administrative tasks"
    rank: 4
    note: "Expense reports, scheduling, documentation"

escalation: []
overrides: []
surfacing: []
delegation: []
```

### Solo Professional Starter Rules

```yaml
version: 1

priorities:
  - label: "Client deliverables"
    rank: 1
    note: "Reputation is everything when you're solo"
  - label: "Overdue invoices"
    rank: 2
    note: "Cash flow is survival"
  - label: "New client onboarding"
    rank: 3
    note: "First impressions set the relationship"
  - label: "Professional development"
    rank: 4
    note: "Skills keep you competitive"

escalation: []
overrides: []
surfacing: []
delegation: []
```

### Content Creator Starter Rules

```yaml
version: 1

priorities:
  - label: "Sponsored content deadlines"
    rank: 1
    note: "Paid commitments with contractual obligations"
  - label: "Content calendar"
    rank: 2
    note: "Consistency builds audience trust"
  - label: "Collaboration responses"
    rank: 3
    note: "Relationships with other creators open doors"
  - label: "Audience engagement"
    rank: 4
    note: "Comments, DMs, community management"

escalation: []
overrides: []
surfacing: []
delegation: []
```

---

## Handling Customization

If user requests modifications:
- Add requested folders
- Remove unwanted folders
- Rename as needed
- Always preserve core context/ structure
