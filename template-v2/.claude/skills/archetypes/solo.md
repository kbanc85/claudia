# Solo Professional Archetype

**Profile:** Independent professionals who manage their own clients and projects without a team.

**Key Signals:**
- Works independently or as a freelancer/contractor
- Mix of clients and projects
- Handles their own business operations
- Uses terms like "freelance," "independent," "solo"

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
│   │   ├── week-review.md          ← Archetype-specific
│   │   ├── invoice-draft.md        ← Archetype-specific
│   │   ├── project-status.md       ← Archetype-specific
│   │   └── client-review.md        ← Archetype-specific
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

---

## Archetype-Specific Commands

### /week-review

```markdown
# Week Review

Solo-focused weekly review for independent professionals.

## What to Cover

### 1. Work Delivered
- What shipped this week
- Client satisfaction signals
- Quality of work

### 2. Business Health
- Revenue this week/month
- Pipeline status
- Invoices outstanding

### 3. Client Relationships
- Who needs attention
- Upcoming renewals or endings
- New opportunities

### 4. Personal Sustainability
- How was workload?
- What drained vs. energized?
- Boundaries respected?

### 5. Next Week
- Key deliverables
- Client touchpoints
- Business development

## Output Format

```
## Week Review — [Week of Date]

### 📦 Delivered
- [Deliverable] for [Client]
- [Deliverable] for [Client]

### 💰 Business
- Revenue this week: $X
- Month to date: $X / $Y target
- Outstanding invoices: $X

### 👥 Clients
- [Client] — [status/note]
- [Client] — [status/note]

### 🔋 Energy Check
- Workload: Manageable / Heavy / Unsustainable
- Energy: High / Medium / Low
- Note: [What affected this]

### 📅 Next Week
**Must happen:**
- [Critical item]

**Should happen:**
- [Important item]

**Could happen:**
- [Nice to have]

### 🤔 Reflection
- [What worked this week]
- [What to adjust]
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

**Invoice #:** [INV-XXXX]
**Date:** [Date]
**Due:** [Date — typically Net 15 or Net 30]

---

**From:**
[Your Name]
[Your Address]
[Your Email]

**To:**
[Client Name]
[Client Address]
[Client Email]

---

## Services Rendered

| Description | Quantity | Rate | Amount |
|-------------|----------|------|--------|
| [Service description] | [Hours or 1] | $X | $X |
| [Service description] | [Hours or 1] | $X | $X |

**Subtotal:** $X

**Expenses:** $X
- [Expense 1]
- [Expense 2]

---

## Total Due: $X

---

**Payment Methods:**
[Your payment details]

**Terms:**
Payment due within [X] days of invoice date.

---

Thank you for your business!
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

From `projects/` folder:

1. **Each Project**
   - Current phase
   - Deadline status
   - Blockers

2. **Workload**
   - Total hours committed
   - Capacity remaining
   - Conflicts

## Output Format

```
## Project Status — [Date]

### Active Projects

| Project | Client | Status | Deadline | Hours Left |
|---------|--------|--------|----------|------------|
| [Name] | [Client] | 🟢/🟡/🔴 | [Date] | [Hours] |

### This Week's Focus

**Must complete:**
- [Project] — [Deliverable]

**In progress:**
- [Project] — [Deliverable]

### Blocked

- [Project]: [Blocker] — waiting on [what]

### Upcoming Deadlines

- [Date]: [Project] — [Deliverable]
- [Date]: [Project] — [Deliverable]

### Capacity

- Committed this week: X hours
- Available: Y hours
- Utilization: Z%
```
```

### /client-review

```markdown
# Client Review

Deep dive on a specific client relationship.

## Usage
`/client-review [client name]`

## What to Surface

1. **Relationship Health**
   - How long working together
   - Satisfaction signals
   - Communication quality

2. **Work History**
   - Projects completed
   - Current projects
   - Total revenue

3. **Financial**
   - Revenue from this client
   - Outstanding invoices
   - Rate history

4. **Opportunities**
   - Upsell possibilities
   - Referral potential
   - Expansion areas

## Output Format

```
## Client Review: [Client Name]
### As of [Date]

**Relationship Health:** 🟢/🟡/🔴
**Since:** [Start date]
**Total Revenue:** $X

### Recent Work
| Project | Status | Value |
|---------|--------|-------|
| | | |

### Financial

- Last invoice: [Date] — $X
- Outstanding: $X
- Average project value: $X

### Relationship Notes

**What works:**
- [What they value about working with you]

**Watch for:**
- [Any concerns or patterns]

**Communication:**
- [Their preferred style]

### Opportunities

- [Upsell idea]
- [Expansion area]
- [Referral potential]

### Recommendations

- [Action to strengthen relationship]
```
```

---

## Client Template (Solo)

`clients/_template/overview.md`:

```markdown
# [Client Name]

## Quick Stats

| Field | Value |
|-------|-------|
| Status | Active / Paused / Completed |
| Since | [Start date] |
| Contact | [Primary contact name] |
| Health | 🟢 / 🟡 / 🔴 |

## Engagement

**Type:** [Retainer / Project-based / Hourly]
**Rate:** $X / [hour / project / month]
**Typical Scope:** [What you usually do for them]

## Contact

| Channel | Details |
|---------|---------|
| Email | |
| Phone | |
| Preferred | |

## Active Work

| Project | Status | Deadline |
|---------|--------|----------|
| | | |

## History

| Project | Dates | Value | Notes |
|---------|-------|-------|-------|
| | | | |

**Total Revenue:** $X

## Financial

- **Last Invoice:** [Date] — $X
- **Outstanding:** $X
- **Payment Terms:** Net [X]

## What They Value

[What keeps them coming back]

## Notes

[Preferences, quirks, important context]

---

*Created: [Date]*
*Last updated: [Date]*
```

---

## Project Template

`projects/_template/overview.md`:

```markdown
# [Project Name]

## Quick Stats

| Field | Value |
|-------|-------|
| Client | [Client name] |
| Status | 🟢 / 🟡 / 🔴 |
| Started | [Date] |
| Deadline | [Date] |
| Value | $X |

## Scope

[What this project includes]

## Deliverables

- [ ] [Deliverable 1]
- [ ] [Deliverable 2]
- [ ] [Deliverable 3]

## Timeline

| Milestone | Date | Status |
|-----------|------|--------|
| | | |

## Time Tracking

| Date | Hours | Description |
|------|-------|-------------|
| | | |

**Total Hours:** X
**Remaining Estimate:** X hours

## Blockers

- [Blocker] — waiting on [what]

## Notes

[Project-specific context]

---

*Created: [Date]*
*Last updated: [Date]*
```

---

## Finance Template

`finances/tracking.md`:

```markdown
# Financial Tracking

## This Month: [Month Year]

### Revenue

| Client | Project | Amount | Status |
|--------|---------|--------|--------|
| | | | Invoiced / Paid |

**Total Invoiced:** $X
**Total Paid:** $X

### Outstanding

| Invoice # | Client | Amount | Due | Days |
|-----------|--------|--------|-----|------|
| | | | | |

**Total Outstanding:** $X

### Expenses

| Date | Category | Amount | Notes |
|------|----------|--------|-------|
| | | | |

**Total Expenses:** $X

---

## Year to Date: [Year]

| Month | Revenue | Expenses | Net |
|-------|---------|----------|-----|
| Jan | | | |
| Feb | | | |
...

**YTD Revenue:** $X
**YTD Expenses:** $X
**YTD Net:** $X

---

## Targets

- Monthly revenue goal: $X
- Annual revenue goal: $X
- Current run rate: $X/month

---

*Last updated: [Date]*
```
