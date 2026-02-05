---
name: client-health
description: Health check across active client engagements showing status, deliverables, and concerns. Triggers on "how are my clients?", "client status", "client health check".
argument-hint: "[client name or 'summary']"
effort-level: low
---

# Client Health

Health check across all active client engagements. Available for Consultant and Solo Professional archetypes.

## What to Check

For each client folder in `clients/`:

### 1. Engagement Health
- Current status and phase
- Milestone progress (if milestone-plan.md exists)
- Any overdue deliverables
- Contract/engagement end dates approaching

### 2. Relationship Health
- Last contact date
- Communication frequency
- Stakeholder sentiment (if stakeholders.md exists)
- Any concerns or red flags

### 3. Commitment Status
- Open commitments from overview.md
- Overdue items
- Items waiting on client
- Upcoming deliverables

### 4. Financial Health (if tracked)
- Outstanding invoices
- Payment status
- Upcoming billing

### 5. Blockers (if blockers.md exists)
- Active blockers
- Resolution progress
- Impact on deliverables

## Output Format

```
## Client Health - [Date]

### Summary

| Status | Count | Details |
|--------|-------|---------|
| On Track | X | [Names] |
| Attention Needed | X | [Names] |
| At Risk | X | [Names] |

- **Total active clients:** X
- **Open commitments:** X
- **Overdue items:** X
- **Outstanding invoices:** $X

---

### On Track

#### [Client Name]
**Phase:** [Current phase]
**Last Contact:** [Date]
**Health:** All good

**Active Work:**
- [Deliverable] - on track for [Date]

**Open Items:** X (none overdue)

---

### Attention Needed

#### [Client Name]
**Phase:** [Current phase]
**Last Contact:** [Date] - X days ago
**Health:** Needs attention

**Concerns:**
- [Issue 1]
- [Issue 2]

**Open Items:**
- [Overdue or at-risk item]

**Suggested Action:**
- [What to do]

---

### At Risk

#### [Client Name]
**Phase:** [Current phase]
**Issues:**
- [Critical issue]
- [Critical issue]

**Immediate Actions:**
1. [Urgent action]
2. [Follow-up action]

---

### Cross-Client View

#### Deliverables Due This Week

| Client | Deliverable | Due | Status |
|--------|-------------|-----|--------|
| | | | On Track / At Risk / Overdue |

#### Outstanding Invoices

| Client | Amount | Sent | Due | Status |
|--------|--------|------|-----|--------|
| | $X | [Date] | [Date] | Outstanding / Overdue |

#### Relationships Needing Touch

| Client | Last Contact | Days | Suggested Action |
|--------|--------------|------|------------------|
| | [Date] | X | [Action] |

---

### Patterns

- [Cross-client observation]
- [Recurring issue across clients]

### Capacity Check

- **Current active clients:** X
- **Total active engagements:** X
- **Hours committed this week:** X
- **Available bandwidth:** [Assessment]
- **Upcoming endings:** [Client] ends [Date]
- **Pipeline:** X prospects (see /pipeline-review)
```

## Health Scoring

### On Track
- Recent contact (within expected cadence)
- No overdue deliverables
- Positive or neutral stakeholder sentiment
- No active blockers
- Invoices paid or not yet due

### Attention Needed
- Contact overdue by 1 week+
- Deliverable at risk (due soon, not complete)
- Stakeholder concerns raised
- Minor blocker active
- Invoice overdue by less than 2 weeks

### At Risk
- Contact overdue by 2+ weeks
- Deliverable overdue
- Stakeholder actively unhappy
- Major blocker preventing progress
- Invoice overdue by 2+ weeks
- Engagement ending without renewal discussion

## Tone

- Factual, scannable
- Lead with concerns (don't bury bad news)
- Specific action suggestions
- Don't sugarcoat problems
- Acknowledge what's going well

## When to Run

- Weekly (Monday or Friday)
- Before client meetings (filtered to that client)
- When feeling uncertain about client status
- During weekly review

## Usage Variations

**All clients:**
```
/client-health
```

**Specific client:**
```
/client-health [client name]
```
Deep dive on single client with full history.

**Quick overview:**
```
/client-health summary
```
Just the summary stats and any red/yellow flags.
