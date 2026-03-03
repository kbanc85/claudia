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

```
claudia memory document store /path/to/transcript.txt \
  --source-type "transcript" \
  --summary "Brief 1-line summary of the meeting" \
  --project-dir "$PWD"
```
The first argument is the file path (positional, not a flag). Save the transcript to disk first, then pass the path.

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
   - Context: participant names with pronouns (e.g., "Alex Gregory (he/him), EVP Sales"),
     meeting topic, date
   - IMPORTANT: Always include pronouns and titles in the dispatch prompt.
     Haiku can misgender or mis-title participants without this context.

2. Agent returns memory_operations[] array with:
   - Facts, preferences, observations
   - Commitments with deadlines
   - Entity definitions
   - Relationship links

3. Review agent output (judgment layer):
   - Verify pronouns and titles are correct
   - Verify commitment wording is accurate
   - Check importance scores are reasonable
   - Confirm entity names match existing entities
   - Adjust or remove any questionable extractions

4. Call `claudia memory batch --project-dir "$PWD"` with the reviewed operations (via stdin JSON)
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

After extracting memories (facts, commitments) via `claudia memory batch` or `claudia memory save`:
```
Run claudia memory document store --memory-ids "id1,id2,..." --project-dir "$PWD"
to link the stored transcript to the memories extracted from it. This creates
the provenance chain: memory -> document -> file on disk.
```

Now the user can ask "where did you learn that Sarah prefers async communication?" and you can point to the exact transcript.

### 5. Organize

**Before writing any files, verify current state (never trust in-session counts):**

For project/interview trackers:
- Count completed items fresh: `grep -rl "status: completed" <project-folder>/ | wc -l`
- Count outstanding items: `grep -rl "status: scheduled\|status: pending" <project-folder>/ | wc -l`
- Read the dashboard/README file fresh: don't rely on counts from earlier in the session
- **If the tracker count doesn't match the grep count, the grep count is authoritative**

For people files:
- Read the person file fresh before updating (don't rely on earlier context)
- Check `claudia memory about "person name" --project-dir "$PWD"` for latest memory DB state

For commitments:
- Read `context/commitments.md` fresh before adding new items
- Check for duplicates by searching for the person's name + topic

Then update:
- Person files with new context
- Commitment and waiting items
- Dashboard or tracker files with **verified counts from grep, not from memory**
- Create files for new people if needed

### 5b. Reconcile Status Sources (MANDATORY after any status change)

When you've changed an entity's status (interview completed, deliverable finished, etc.):

1. **Update the primary source** (vault file YAML frontmatter or entity file)
2. **Update the memory DB** (`claudia memory save` or `claudia memory correct`)
3. **Verify dashboard/tracker counts:**
   - Grep actual file status values (see Step 5 above)
   - Compare to dashboard/README stated count
   - If mismatch: update dashboard with the grep-verified count
4. **Never use in-session counts.** Always grep/query fresh at write time. Previous context (even from minutes ago in the same session) can be stale if files were modified.

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

## Error Recovery

If a batch of parallel commands fails:
- Re-run each failed command individually (parallel failures cascade, individual runs often succeed)
- Never assume all commands failed just because one did
- Check error messages: if it says "sibling tool call errored," the other commands weren't actually attempted
- When a grep or count command fails, retry with a simpler approach before reporting stale data

## Quality Checklist

- [ ] **Raw transcript/notes filed** (`claudia memory document store` called with full content)
- [ ] Memories linked to source document (provenance chain complete)
- [ ] Every action item has an owner
- [ ] Every commitment has a deadline (even approximate)
- [ ] Sentiment signals noted but not over-interpreted
- [ ] Summary is actionable, not just descriptive
- [ ] Related person files flagged for update
- [ ] No unexplained jargon or unclear references
- [ ] All markdown tables render correctly (header, separator, and data rows on separate lines)
- [ ] **Status sources reconciled** (file YAML, memory DB, and dashboard/tracker all agree)
- [ ] **Dashboard counts verified** via fresh grep, not in-session memory

## Tone

- Efficient — respect user's time
- Accurate — don't add or assume
- Helpful — surface the useful parts
- Action-oriented — what needs to happen next
