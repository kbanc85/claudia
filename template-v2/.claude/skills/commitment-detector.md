---
name: commitment-detector
description: Automatically detect promises and commitments in conversation and offer to track them.
user-invocable: false
effort-level: high
---

# Commitment Detector Skill

**Triggers:** Activates when language patterns suggest a commitment has been made.

---

## Detection Patterns

### Explicit Promises

**High confidence patterns:**
- "I'll [action] by [time]"
- "I'll send you [thing] by [day/date]"
- "I promised to [action]"
- "I committed to [action]"
- "I need to [action] by [deadline]"
- "I told them I would [action]"

**Examples:**
- "I'll send the proposal by Friday" → Track: proposal, Friday
- "I promised Sarah I'd review her doc" → Track: review doc, for Sarah, needs deadline
- "I told the team I'd have feedback by EOD" → Track: feedback, EOD today

### Implicit Obligations

**Medium confidence patterns:**
- "Let me get back to you on that"
- "I should follow up on [thing]"
- "I need to [action]" (without deadline)
- "I'll think about [topic] and respond"

**Response:** Ask for clarification
```
"Sounds like a commitment. When should this be done?"
```

### What NOT to Track

**Vague intentions (skip):**
- "We should explore that someday"
- "That might be worth looking into"
- "Maybe I'll try that"
- "I've been meaning to..."

**These don't have accountability attached.**

---

## Tracking Flow

### When I Detect a Commitment

1. **Surface what I heard:**
   ```
   "I heard a commitment: Send proposal to Sarah by Friday.
   Should I track this?"
   ```

2. **If confirmed, capture:**
   - What: The specific deliverable
   - To: Who it's for (if anyone)
   - Due: Deadline
   - Context: Any relevant notes

3. **Persist to memory immediately** - Call `memory.remember` with:
   - `content`: The commitment text (e.g., "Send proposal to Sarah by Friday")
   - `type`: "commitment"
   - `about`: [person name if applicable]
   - `importance`: 0.9
   - `source`: "conversation"

   This ensures the commitment survives context compaction and can be recalled semantically. Do not skip this step.

4. **Add to context/commitments.md**

5. **Link to person file if relevant**

### If Deadline is Unclear

```
"I'll track: Review Sarah's document.
When should this be done?"
```

Options:
- Specific date/time → Use that
- "Soon" or "ASAP" → Ask for actual date
- "No rush" → Don't track (vague intention)

---

## Commitment Types

### You Owe Others
Stored in `context/commitments.md`

```markdown
## Due Soon

| Commitment | To | Due | Status |
|------------|-----|-----|--------|
| Send proposal draft | Sarah | Fri Jan 24 | On track |
| Review contract | Legal team | Mon Jan 27 | Needs attention |
```

### Others Owe You
Stored in `context/waiting.md`

**Detection patterns:**
- "They said they'd [action] by [time]"
- "[Person] owes me [thing]"
- "Waiting on [person] for [thing]"
- "They promised to [action]"

```
"I heard: Waiting on Sarah's feedback by Thursday.
Should I track this in your waiting list?"
```

---

## Warning System

### 48-Hour Warning
Two days before deadline, surface in morning brief:

```
### ⚠️ Due Soon
- [WARNING] Proposal to Sarah due in 48 hours (Friday)
```

### Day-Of Reminder
On due date:

```
### ⚠️ Due Today
- [DUE TODAY] Proposal to Sarah
```

### Overdue Escalation
When past due:

```
### ⚠️ OVERDUE
- [OVERDUE] Proposal to Sarah was due Friday (2 days ago)
  → Suggested action: Send what you have, or communicate delay
```

---

## Recovery Suggestions

When something is overdue, offer recovery options:

```
The proposal for Sarah is 2 days overdue. Options:

1. Send it now (if ready)
2. Send partial progress + timeline for rest
3. Communicate delay with new ETA
4. Acknowledge and ask for extension

What would you like to do?
```

---

## Commitment Lifecycle

```
Detected → Confirmed → Tracked → Warning → Due → Completed/Overdue
                                    ↓
                              Recovery (if overdue)
```

### Marking Complete

When user mentions completing something:
- "I sent that proposal to Sarah"
- "Done with the contract review"

```
"Got it. Marking the proposal to Sarah as complete.
Anything to note about how it went?"
```

Move from active to completed section with date.

---

## Integration

### With Relationship Tracker
- Link commitments to people files
- Show open commitments when person is mentioned

### With Morning Brief
- Surface warnings and due-todays
- Highlight overdue items

### With Pattern Recognizer
- Notice if certain commitments consistently slip
- Track estimation accuracy over time

---

## Settings

Can be configured in `context/me.md`:

```yaml
commitment_tracking:
  warning_days: 2              # Days before deadline to warn
  auto_detect: true            # Automatically detect or only when asked
  track_waiting: true          # Also track what others owe
  completion_notes: optional   # Ask for notes on completion
```
