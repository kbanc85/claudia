# Capture Meeting

Process meeting notes or transcript to extract decisions, commitments, and insights.

## Trigger

- "Here's a transcript from [client/person]"
- "Process these meeting notes"
- "Here are my notes from the call with [person]"
- `/capture-meeting`

## Input

User provides one of:
- Full transcript (from Otter, Granola, etc.)
- Meeting notes (manual)
- Voice memo summary
- Memory/verbal recap

## Processing Steps

### 1. Identify Participants
- Who was in the meeting?
- Which person files to update?
- Any new people to track?

### 2. Extract Key Information

**Decisions Made:**
- What was decided?
- Who made the decision?
- Any conditions or context?

**Commitments Created:**
- What did you promise? (→ `context/commitments.md`)
- What did they promise? (→ `context/waiting.md`)
- Deadlines (explicit or implied)

**Blockers Surfaced:**
- What's in the way?
- Who can unblock?

**Sentiment Signals:**
- Enthusiasm, concern, resistance
- Energy level
- Relationship health indicators

**Key Topics:**
- Main themes discussed
- Important context shared

### 3. Store Transcript & Link Provenance

If the user provided a full transcript or substantial meeting notes:

```
Call memory.file with:
├── content: The raw transcript/notes text
├── filename: YYYY-MM-DD-[person]-[topic].md
├── source_type: "transcript"
├── summary: Brief 1-line summary of the meeting
├── about: [list of participant entity names]
```

After extracting memories (facts, commitments) via memory.batch or memory.remember:
```
Call memory.file again with memory_ids=[...] to link the stored transcript
to the memories extracted from it. This creates the provenance chain:
memory -> document -> file on disk.
```

### 4. Organize

- Save notes to appropriate location
- Update person files with new context
- Link commitments and waiting items

### 5. Synthesize

Create a summary that captures:
- What happened (brief)
- What was decided
- What's next (actions)
- How it went (sentiment)

## Output Format

```
**📋 Meeting Capture: [Meeting Name/Person]**
### [Date]

**Attendees:** [Names]
**Duration:** [Approximate]
**Context:** [Brief — what was this meeting about?]

### 📝 Summary
[2-3 sentence overview of what happened]

### 🔨 Decisions Made
- [Decision] — decided by [who]
- [Decision]

### ✅ Action Items

**You:**
- [ ] [Action] — by [date]
- [ ] [Action] — by [date]

**Them:**
- [ ] [Action] — by [date]

### 💬 Key Discussion Points
- [Point 1]
- [Point 2]
- [Point 3]

### 🌡️ Sentiment
[Brief read on how the meeting went, relationship health]

### 📂 File Updates

Shall I:
- [ ] Add commitments to tracking? [List them]
- [ ] Add waiting items? [List them]
- [ ] Update [person]'s file with new context?
- [ ] Create files for new people mentioned?

*Meeting notes saved to: [location]*

---
```

## Judgment Points

Ask for confirmation on:
- Adding commitments (user must own promises)
- Adding waiting items (setting expectations)
- Updating sentiment in person files (subjective)
- Flagging concerns (interpretation required)
- File location (if ambiguous)

## Quality Checklist

- [ ] Every action item has an owner
- [ ] Every commitment has a deadline (even approximate)
- [ ] Sentiment signals noted but not over-interpreted
- [ ] Summary is actionable, not just descriptive
- [ ] Related person files flagged for update
- [ ] No unexplained jargon or unclear references

## Tone

- Efficient — respect user's time
- Accurate — don't add or assume
- Helpful — surface the useful parts
- Action-oriented — what needs to happen next
