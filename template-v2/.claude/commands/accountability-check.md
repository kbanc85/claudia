# Accountability Check

Surface all commitments, overdue items, and things you're waiting on from others.

## What to Check

### 1. My Commitments
From `context/commitments.md` and `accountability/commitments.md`:
- What I've promised
- To whom
- When it's due
- Current status

### 2. Overdue Items
From `accountability/overdue.md` and scanning commitment dates:
- Anything past due
- Days overdue
- Impact level

### 3. Waiting On Others
From `context/waiting.md`:
- What I'm waiting for
- From whom
- How long I've been waiting
- Last follow-up

### 4. Per-Client/Project Commitments
Scan relevant folders for:
- Client-specific commitments
- Project deliverables
- Meeting follow-ups

## Output Format

```
## Accountability Check — [Date]

### Summary
- My commitments: X total (Y due this week)
- Overdue items: X (oldest: Y days)
- Waiting on others: X items

### 🔴 Overdue (Needs Immediate Attention)

| What | To | Was Due | Days Late | Impact |
|------|-----|---------|-----------|--------|
| [Item] | [Person] | [Date] | X | High/Med/Low |

**Recovery Actions:**
- [Item]: [What to do now]

### 🟡 Due This Week

| What | To | Due | Status | Notes |
|------|-----|-----|--------|-------|
| [Item] | [Person] | [Date] | On Track / At Risk | |

### 🟢 Due Later

| What | To | Due | Notes |
|------|-----|-----|-------|
| [Item] | [Person] | [Date] | |

### Waiting On Others

| What | From | Since | Days Waiting | Last Follow-up |
|------|------|-------|--------------|----------------|
| [Item] | [Person] | [Date] | X | [Date or "None"] |

**Follow-up Needed:**
- [Item from Person]: [Suggested action]

### By Relationship

#### [Person/Client Name]
**I Owe:**
- [Item] — due [Date]

**They Owe:**
- [Item] — since [Date]

[Repeat for key relationships with open items]

### Patterns Noticed

- [Any patterns: always late on X, person Y is slow to respond, etc.]

### Recommended Actions

1. **Today:** [Most urgent action]
2. **This Week:** [Important but not urgent]
3. **Follow-up:** [People to nudge]
```

## Checking Process

1. Read `context/commitments.md` and `accountability/commitments.md`
2. Read `context/waiting.md`
3. Scan client/project folders for commitments sections
4. Check meeting notes from past 2 weeks for promises made
5. Cross-reference dates against today

## Red Flags to Surface

- Any item 3+ days overdue
- Any commitment with no clear due date
- Any "waiting on" item with no follow-up scheduled
- Same item appearing overdue multiple times (recurring problem)
- Important relationships with imbalanced commitments

## Tone

- Direct, not judgmental
- Focus on recovery, not blame
- Prioritize by relationship importance and impact
- Suggest specific actions

## When to Run

- Start of each day (abbreviated version)
- Start of week (full version)
- Before meeting with someone (filter to that person)
- When feeling overwhelmed about what's owed

## Usage Variations

**Full check:**
```
/accountability-check
```

**For specific person:**
```
/accountability-check [person name]
```
Filters to only show commitments involving that person.

**Quick overdue only:**
```
/accountability-check overdue
```
Shows only overdue items and immediate recovery actions.
