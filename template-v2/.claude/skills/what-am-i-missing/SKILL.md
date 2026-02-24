---
name: what-am-i-missing
description: Surface risks, blind spots, overlooked items, and accountability across commitments and relationships. Triggers on "what am I overlooking?", "blind spots", "what's falling through the cracks", "what do I owe?", "am I overdue?", "check my commitments".
argument-hint: "[person name or 'overdue']"
effort-level: high
---

# What Am I Missing

Surface risks, blind spots, overlooked items, and accountability across all areas.

## What to Check

### 1. Commitment Risks
From `context/commitments.md`:
- Overdue items
- Items at risk (due soon, no progress)
- Patterns of slippage
- Cascading delays

### 2. Relationship Risks
From `people/` files:
- Cooling relationships (60+ days)
- Unfulfilled promises to key people
- Sentiment shifts detected
- Key relationships not nurtured

### 3. Waiting Risks
From `context/waiting.md`:
- Overdue items from others
- Critical dependencies at risk
- Patterns (chronic late deliverers)

### 4. Pattern Risks
From `context/patterns.md`:
- Recurring issues not addressed
- Blind spots observed
- Capacity concerns
- Self-limiting patterns

### 5. Strategic Risks
Looking at the bigger picture:
- Important-but-not-urgent items being neglected
- Opportunities cooling
- Decisions being avoided

## Output Format

```
## What You Might Be Missing - [Date]

### Commitment Risks

**Overdue:**
- [Item] was due [date] - [impact]

**At Risk:**
- [Item] due [date] - [concern]

### Relationship Risks

**Cooling:**
- [Person] - last contact [X] days ago
  -> Was: [relationship context]
  -> Risk: [what could happen]

**Open Loops:**
- Promised [thing] to [person] - [status]

### Waiting Risks

**Overdue from Others:**
- [Item] from [person] - expected [date]
  -> Impact: [why this matters]
  -> Suggested action: [what to do]

### Pattern Risks

- [Pattern] - seen [X] times recently
  -> Concern: [why it matters]
  -> Suggestion: [what to consider]

### Strategic Blind Spots

- [Thing being neglected]
  -> Why it matters: [impact]
  -> Suggestion: [action]

### By Relationship

#### [Person/Client Name]
**I Owe:**
- [Item] - due [Date]

**They Owe:**
- [Item] - since [Date]

[Repeat for key relationships with open items]

**Recovery Actions:**
- [Overdue item]: [What to do now]

### Summary

Critical: [X items need immediate attention]
Watch: [Y items to keep an eye on]
Consider: [Z strategic things to think about]
```

## Tone

- Matter-of-fact, not alarmist
- Specific, not vague
- Actionable suggestions
- Prioritized by importance
- Respectful of user's judgment

## When to Use

- When feeling overwhelmed and wanting perspective
- Before important planning sessions
- When something feels "off" but unclear what
- As a regular check-in (weekly or biweekly)

## Usage Variations

**Full analysis:**
Comprehensive review across all risk categories and relationships.

**For specific person:**
`/what-am-i-missing [person name]`
Filters to only show commitments and risks involving that person.

**Quick overdue only:**
`/what-am-i-missing overdue`
Shows only overdue items and immediate recovery actions.

**Quick check:**
Major risks only, no deep analysis.
