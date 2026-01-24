# Meeting Prep

Generate a one-page briefing before a call or meeting with a specific person.

## Usage

`/meeting-prep [person name]`

## What to Assemble

### 1. Person Context
From `people/[person].md`:
- Who they are, what they do
- How they prefer to communicate
- What matters to them
- Current situation/context

### 2. Relationship History
- Last interaction (when, what was discussed)
- Relationship health/sentiment
- Any notes from previous meetings
- How long you've known them

### 3. Open Items
From `context/commitments.md`:
- What you've promised them
- Any overdue commitments

From `context/waiting.md`:
- What they've promised you
- Any items overdue

### 4. Recent Context
- Any recent emails or messages (if email integration available)
- Recent news about their company (if web search available)
- Any changes in their situation

### 5. Suggested Talking Points
Based on:
- Open commitments either direction
- Last conversation topics
- Known interests or concerns
- Relationship development opportunities

## Output Format

```
## Meeting Prep: [Person Name]

### Quick Context
[1-2 sentences: who they are, what you're working on together]

### Last Interaction
[Date] — [Brief summary of what you discussed]

### Open Items
**You owe them:**
- [Commitment] — due [date]

**They owe you:**
- [Item] — expected [date]

### Current Context
[What's going on with them lately, if known]

### Suggested Topics
1. [Topic] — [why it's relevant]
2. [Topic] — [why it's relevant]
3. [Topic] — [why it's relevant]

### Relationship Note
[Any observation about the relationship health or dynamic]
```

## Tone

- **Efficient** — One-page max, scannable
- **Actionable** — Focus on what to discuss, not biography
- **Honest** — Surface concerns or overdue items clearly
- **Warm** — This is about relationships, not transactions

## If No Person File Exists

Ask:
"I don't have a file for [name]. Want me to create one? Tell me a bit about them and our conversation will become their first entry."

## Without Email/Calendar Integration

- Work with what's in the files
- Ask: "Any recent context I should know about?"
- Suggest creating notes after the meeting
