---
name: meeting-prep
description: One-page briefing before a call or meeting. Use when user says "prep me for my call with [person]" or "meeting prep for [person]".
argument-hint: [person or meeting name]
effort-level: medium
---

# Meeting Prep

One-page briefing before a call or meeting.

## Usage
`/meeting-prep [person or meeting name]`

Or naturally:
- "Prep me for my call with Sarah"
- "Meeting prep for the Acme quarterly"
- "What should I know before talking to Jim?"

## What to Gather

### 1. Person Context
From `people/[person].md`:
- Role and organization
- Relationship history
- Last contact and topics
- Communication style
- What matters to them

### 2. Open Items
- Commitments to them
- Commitments from them
- Waiting items

### 3. Recent Context

Query for documents linked to this person:
```
Call memory.document with operation="search", entity=[person name]
```
This returns recent transcripts, emails, and files involving the person. Include the most relevant (up to 3) in the briefing with their summaries.

Also check:
- Last meeting notes (if any)
- Recent email threads (if available)
- Any project/client context

### 4. Strategic Context
- What's the purpose of this meeting?
- What outcome would be good?
- Any concerns to be aware of?

## Output Format

```
## Meeting Prep: [Person/Meeting Name]
### [Day, Date] at [Time]

---

**Who:** [Name, Role, Organization]
**Last Contact:** [Date] — [Context]
**Relationship:** [Current state/health]

---

### Context
[Brief summary of relationship and recent history]

### Open Items

**You Owe Them:**
- [Item] — due [date]

**They Owe You:**
- [Item] — expected [date]

### Key Points from Last Interaction
- [Point 1]
- [Point 2]

### What Matters to Them
- [Priority 1]
- [Priority 2]

### Suggested Topics
1. [Topic based on context]
2. [Topic based on open items]
3. [Topic based on their priorities]

### Watch For
- [Concern or sensitivity]
- [Opportunity]

### Outcome to Aim For
[What would make this meeting successful?]

---

*Anything else to prepare?*
```

## Tone

- Concise — one page max
- Actionable — clear talking points
- Contextual — relevant history surfaced
- Strategic — not just facts but suggested approach

## Without Prior Context

If no file exists for this person:
"I don't have context on [Person] yet. Would you like to:
1. Tell me about them now (quick capture)
2. Create a full person file
3. Proceed with what you know"

## Group Meetings

For meetings with multiple people:
- Brief context on key attendees
- Focus on meeting purpose
- Common threads across attendees
