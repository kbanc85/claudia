# Solo Professional Archetype

**Profile:** Independent professionals who manage their own clients and projects without a team.

**Key Signals:** Works independently, freelancer/contractor, mix of clients and projects, handles own business operations, "freelance," "independent," "solo"

Includes everything from `_base-structure.md`, plus the following archetype-specific structure.

---

## Folder Structure (Archetype-Specific Additions)

### Full Business Depth

Adds to base structure:

```
├── clients/
│   └── [client-name]/              ← Per-client structure
│       ├── overview.md             ← Status, scope, rate, deliverables
│       ├── meetings/               ← Meeting notes
│       └── deliverables/           ← Work product
├── projects/
│   └── [project-name]/
│       └── overview.md
├── pipeline/
│   ├── active.md                   ← Current work
│   ├── prospecting.md              ← Leads and opportunities
│   └── completed.md                ← Historical record
├── accountability/
│   ├── commitments.md              ← What I owe, what they owe me
│   └── overdue.md                  ← Escalation visibility
├── finances/
│   ├── overview.md                 ← Revenue summary, capacity
│   ├── invoices/                   ← Invoice files
│   ├── tracking.md                 ← Detailed tracking
│   ├── expenses.md                 ← Expense tracking
│   └── tax-planning.md             ← Quarterly tax notes
├── templates/
│   ├── new-client-intake.md        ← Client onboarding checklist
│   ├── meeting-capture.md          ← Post-meeting documentation
│   ├── invoice.md                  ← Invoice template
│   └── weekly-review.md            ← Guided review template
└── insights/
    └── patterns.md                 ← Business patterns
```

### Starter Business Depth

Base + `clients/_template/overview.md`, `projects/_template/overview.md`, `pipeline/active.md`, `finances/` (overview, invoices, tracking).

### Minimal Business Depth

Base + `clients/_template/overview.md`, `projects/_template/overview.md`, `finances/` (invoices, tracking).

---

## Archetype-Specific Commands

### /week-review

```markdown
# Week Review

Solo-focused weekly review for independent professionals.

## What to Cover

1. **Work Delivered** — What shipped, client satisfaction, quality
2. **Business Health** — Revenue, pipeline, outstanding invoices
3. **Client Relationships** — Who needs attention, renewals, new opportunities
4. **Personal Sustainability** — Workload, energy, boundaries
5. **Next Week** — Deliverables, touchpoints, business development

## Output Format

```
## Week Review — [Week of Date]

### 📦 Delivered / 💰 Business / 👥 Clients
### 🔋 Energy Check / 📅 Next Week (Must/Should/Could)
### 🤔 Reflection
```
```

### /invoice-draft

```markdown
# Invoice Draft

Draft an invoice for a client.

## Usage
`/invoice-draft [client name]`

## Discovery Questions

1. "What work are we billing for?"
2. "What period does this cover?"
3. "Hourly or fixed fee?"
4. "Any expenses to include?"

## Output Format

```
# INVOICE
**Invoice #:** [INV-XXXX] | **Date:** [Date] | **Due:** [Net 15/30]

**From:** [Your details] | **To:** [Client details]

## Services Rendered
| Description | Quantity | Rate | Amount |
|-------------|----------|------|--------|

**Subtotal:** $X | **Expenses:** $X | **Total Due:** $X

**Payment Methods:** [Details]
```

## Notes
- Save to `finances/invoices/[date]-[client].md`
- Update `finances/tracking.md` with invoice details
```

### /project-status

```markdown
# Project Status

Status overview across all active projects.

## What to Check

1. **Each Project** — Phase, deadline status, blockers
2. **Workload** — Total hours committed, capacity, conflicts

## Output Format

```
## Project Status — [Date]

### Active Projects
| Project | Client | Status | Deadline | Hours Left |
|---------|--------|--------|----------|------------|

### This Week's Focus (Must complete / In progress)
### Blocked / Upcoming Deadlines / Capacity
```
```

### /client-review

```markdown
# Client Review

Deep dive on a specific client relationship.

## Usage
`/client-review [client name]`

## What to Surface

1. **Relationship Health** — Duration, satisfaction, communication quality
2. **Work History** — Projects completed/current, total revenue
3. **Financial** — Revenue, outstanding invoices, rate history
4. **Opportunities** — Upsell, referral potential, expansion areas

## Output Format

```
## Client Review: [Client Name] — As of [Date]

**Health:** 🟢/🟡/🔴 | **Since:** [Date] | **Total Revenue:** $X

### Recent Work / Financial / Relationship Notes
### Opportunities / Recommendations
```
```

### /client-health

```markdown
# Client Health

Health check across all active clients at once.

## What to Check

1. **Engagement Health** — Status, overdue deliverables, last contact
2. **Financial Health** — Outstanding invoices, payment status, rate alignment
3. **Relationship Signals** — Communication frequency, satisfaction, red flags

## Output Format

```
## Client Health — [Date]

### Summary
- X active 🟢 / Y attention 🟡 / Z at risk 🔴
- Outstanding invoices: $X / Overdue deliverables: Y

### By Client (status, last contact, concerns, actions)
### Financial Summary / Capacity
```

## Tone
- Practical, scannable
- Focus on actionable items
- Financial health prominent
```

---

## Client Templates

Every `overview.md` here is an OKF knowledge file: frontmatter first, then the
body described below. Set `timestamp` (ISO 8601) on write. A client
`overview.md`:

```yaml
---
type: organization
title: "[Client Name]"
description: "[One line: the engagement]"
tags: [client]
timestamp: "[ISO 8601, now]"
---
```

A project `overview.md` uses `type: project`. See `docs/okf-conventions.md`.

### Full Business Depth

`clients/[client-name]/overview.md`: Quick stats (status, since, contact, health, last contact), engagement (type, rate, scope, contract end), contact channels, active work (project/status/deadline/value), deliverables due, commitments (mine + theirs), history (projects/dates/value, total revenue, average project), financial (last invoice, outstanding, payment terms, payment history), what they value, how to work with them (communication, feedback, decisions, quirks), opportunities, notes.

### Starter/Minimal

`clients/_template/overview.md`: Simplified with quick stats, engagement, contact, active work, history, financial, what they value, notes.

---

## Project Template

`projects/_template/overview.md`: Quick stats (client, status, started, deadline, value), scope, deliverables checklist, timeline/milestones, time tracking (date/hours/description, totals), blockers, notes.

---

## Finance Template

`finances/tracking.md`: Monthly revenue table (client/project/amount/status), outstanding invoices, expenses, year-to-date summary (monthly revenue/expenses/net), targets (monthly/annual goals, run rate).
