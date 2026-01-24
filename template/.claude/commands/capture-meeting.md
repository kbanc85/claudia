# Capture Meeting

Process notes from a meeting to extract decisions, commitments, blockers, and sentiment. This command uses the `tasks/process-meeting.md` blueprint.

## Inputs

The user might provide:
- Raw meeting notes
- A transcript (from Granola, Otter, Zoom, etc.)
- A quick verbal summary
- A document or email summarizing the meeting

## Extraction Process

### 1. Identify the Meeting
- Who was there?
- What was the meeting about?
- When did it happen?
- What was the purpose/goal?

### 2. Extract Decisions
Look for:
- "We decided to..."
- "The plan is..."
- "We agreed that..."
- Anything that settles an open question
- Changes in direction or approach

### 3. Extract Commitments
**By the user:**
- "I'll send..."
- "Let me get back to you..."
- "I'll take care of..."
- Any implicit promises

→ Add to `context/commitments.md` with deadline

**By others:**
- "They said they'd..."
- "[Name] will..."
- "They promised..."

→ Add to `context/waiting.md`

### 4. Extract Blockers
Look for:
- "We're stuck on..."
- "Can't proceed until..."
- "Waiting for approval on..."
- Dependencies mentioned
- Concerns raised without resolution

### 5. Read Sentiment
Notice:
- Energy level (excited, tired, frustrated)
- Engagement (active participation vs. checked out)
- Resistance signals (hesitation, deflection, skepticism)
- Enthusiasm signals (questions, follow-ups, ideas)
- Relationship health indicators

### 6. Update Relationship Context
For each person in the meeting:
- Check if `people/[name].md` exists
- Update context with new information
- Note changes in situation, priorities, or attitude
- Update sentiment if warranted

### 7. Capture Patterns
Notice:
- Recurring themes across meetings
- Shifts in tone or priority
- Things that came up before and again
- Red flags or opportunities

## Output Format

```
## Meeting Captured: [Brief description]

**Date:** [date]
**Attendees:** [names]
**Duration:** [if known]

### Decisions Made
- [Decision 1]
- [Decision 2]

### Commitments
To `commitments.md`:
- [ ] [What] | [To whom] | [By when]

To `waiting.md`:
- [ ] [What] | [From whom] | [Expected when]

### Blockers Identified
- [Blocker 1] — [who owns it]

### Sentiment
[1-2 sentences on how the meeting felt, energy, any concerns]

### Context Updates
- Updated `people/[name].md` with [what changed]

### Patterns Noticed
- [Any observations worth noting]

### Follow-up Suggested
- [Any recommended next actions]
```

## Judgment Points

Before updating files, ask for confirmation:

1. **Commitments**: "I found these commitments. Add them?"
2. **Waiting items**: "Track these items you're waiting on?"
3. **Sentiment updates**: "I noticed [X]. Update [person]'s file?"
4. **Blockers**: "Flag this as a blocker?"

Wait for explicit approval before writing to files.

## Tone

- Extract facts, not interpretations
- Note sentiment but don't over-interpret
- Ask about ambiguous commitments ("I'll get back to you" — when?)
- Be thorough but not exhaustive
