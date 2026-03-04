---
name: capture-meeting
description: Process meeting notes or transcript to extract decisions, commitments, and insights. Use when user shares transcript or says "capture this meeting", "here are my notes from the call".
effort-level: medium
---

# Capture Meeting

Process meeting notes or transcript to extract decisions, commitments, and insights.

## Trigger

- "Here's a transcript from [client/person]"
- "Process these meeting notes"
- "Here are my notes from the call with [person]"
- "Capture this meeting"
- `/capture-meeting`

## Input

User provides one of:
- Full transcript (from Otter, Granola, etc.)
- Meeting notes (manual)
- Voice memo summary
- Memory/verbal recap

## Processing Steps

### 1. File the Source Material (MANDATORY)

**Always file the raw transcript/notes FIRST.** This is not optional. Source preservation creates provenance: every extracted fact can trace back to where it came from.

Call the `memory.file` MCP tool with:
- `filename`: "YYYY-MM-DD-[person]-[topic].md"
- `source_type`: "transcript"
- `summary`: "Brief 1-line summary of the meeting"
- `about`: ["participant1", "participant2"]
- `content`: The FULL raw transcript/notes text (do not summarize)

The file is automatically routed to the right folder:
- `people/sarah-chen/transcripts/2026-02-04-kickoff.md`
- `clients/acme-corp/transcripts/2026-02-04-quarterly.md`

**Even for brief notes:** If the user shared more than a few sentences, file it. Better to have it than wish you did.

### 2. Identify Participants
- Who was in the meeting?
- Which person files to update?
- Any new people to track?

### 3. Extract Key Information (Agent-Accelerated)

**Preferred: Dispatch Document Processor for extraction.** Instead of composing memory operations manually (which takes 2+ minutes of thinking time), dispatch the Document Processor agent (Haiku) with the transcript content and `extraction_type: "memory_operations"`. The agent returns ready-to-store operations in ~10-20 seconds.

**Agent pipeline workflow:**
```
1. Dispatch Document Processor (Haiku) with:
   - The full transcript text
   - extraction_type: "memory_operations"
   - Context: participant names, meeting topic, date

2. Agent returns memory_operations[] array with:
   - Facts, preferences, observations
   - Commitments with deadlines
   - Entity definitions
   - Relationship links

3. Review agent output (judgment layer):
   - Verify commitment wording is accurate
   - Check importance scores are reasonable
   - Confirm entity names match existing entities
   - Adjust or remove any questionable extractions

4. Call the `memory.batch` MCP tool with the reviewed operations array
```

**Fallback: Manual extraction** (use when agent is unavailable or for very short notes)

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

### 4. Link Provenance

After extracting memories (facts, commitments) via the `memory.batch` or `memory.remember` MCP tools:

Call the `memory.file` MCP tool with the `memory_ids` parameter set to the IDs of the memories you extracted. This links the stored transcript to the memories extracted from it, creating the provenance chain: memory -> document -> file on disk.

Now the user can ask "where did you learn that Sarah prefers async communication?" and you can point to the exact transcript.

### 5. Downstream Updates

After extracting information, propagate changes to the files that depend on it. These updates ensure that summaries stay in sync with source material.

#### 5a. Update person files

For each participant in the meeting:

1. Check if `people/[name-slug].md` exists
2. If it exists:
   - Update "Last Contact" date to today
   - Add this meeting to "Our History" or interaction log
   - Update "Current Context" if new information was shared
   - Add any new commitments to the person's section
3. If it does not exist and this person seems important (mentioned multiple times, has commitments, or has a working relationship):
   - Offer to create a new person file: "I'd like to create a file for [person]. They [reason]. Should I?"

#### 5b. Update commitment and waiting files

- Add new commitments to `context/commitments.md` (ask for confirmation on wording and deadline)
- Add new waiting items to `context/waiting.md`
- If memory MCP tools are available, also store via the `memory.remember` MCP tool

#### 5c. Update workspace files (if applicable)

Check if this meeting belongs to an active workspace:

1. Does the meeting topic match a workspace in `workspaces/`?
2. Is a meeting participant associated with a workspace project?

If yes:
- File the meeting notes in `workspaces/[slug]/meetings/`
- Update `workspaces/[slug]/Dashboard.md` if the meeting changed project status or phase
- If the meeting created new deliverables or items, add them to the relevant workspace subdirectory

If no workspace match, file in the standard location per the document store routing.

### 6. Synthesize

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

### 📂 Updates Made

**Person files:**
- Updated [person]'s last contact and history
- Added [commitment] to [person]'s commitments section
- ? Create file for [new person]? They [reason]. (Your call.)

**Commitments added:**
- "[Commitment]" — due [date] (added to tracking)
- Waiting on "[item]" from [person] (added to waiting)

**Workspace:** [if applicable]
- Meeting filed in workspaces/[slug]/meetings/
- Dashboard updated: [what changed]

*Anything I should adjust?*

*Meeting notes saved to: [location]*

---
```

## Judgment Points

Proceed automatically with:
- Updating last contact dates in person files (factual, low-risk)
- Adding meeting to history tables in person files (factual, low-risk)
- Filing meeting notes in workspace directories (organizational, low-risk)

Ask for confirmation on:
- Adding commitments (user must own promises)
- Adding waiting items (setting expectations)
- Creating NEW person files (new entity in the system)
- Updating sentiment in person files (subjective)
- Changing project phase/status in workspace Dashboard (consequential)
- Flagging concerns (interpretation required)
- File location (if ambiguous)

## Quality Checklist

- [ ] **Raw transcript/notes filed** (`memory.file` MCP tool called with full content)
- [ ] Memories linked to source document (provenance chain complete)
- [ ] Every action item has an owner
- [ ] Every commitment has a deadline (even approximate)
- [ ] Sentiment signals noted but not over-interpreted
- [ ] Summary is actionable, not just descriptive
- [ ] Related person files flagged for update
- [ ] No unexplained jargon or unclear references
- [ ] All markdown tables render correctly (header, separator, and data rows on separate lines)
- [ ] Person files updated for all participants with existing files
- [ ] Workspace files updated if meeting belongs to an active project
- [ ] No stale counts left in any summary file that was updated

## Tone

- Efficient — respect user's time
- Accurate — don't add or assume
- Helpful — surface the useful parts
- Action-oriented — what needs to happen next
