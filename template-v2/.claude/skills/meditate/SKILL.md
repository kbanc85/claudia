---
name: meditate
description: End-of-session reflection. Generate persistent learnings about user preferences, communication patterns, and cross-session insights. Captures what Claude learns about working with this user.
effort-level: high
---

# Meditate

End-of-session reflection that generates persistent learnings. These reflections inform future sessions, helping Claudia remember not just what happened, but what it learned about working with this user.

## When to Activate

- User explicitly invokes `/meditate`
- User signals session end: "let's wrap up", "I'm done for today", "end session"
- Long session (2+ hours) with significant content
- After completing a major project milestone

## What Reflections Are

Reflections are **user-approved insights** that decay very slowly and compound over time. They capture:

| Type | Focus | Example |
|------|-------|---------|
| `observation` | User behavior or preference | "User prefers bullet points over paragraphs for status updates" |
| `pattern` | Recurring theme across sessions | "Mondays typically involve financial review tasks" |
| `learning` | How to work better with this user | "Direct questions get better responses than open-ended ones" |
| `question` | Worth revisiting later | "How did the negotiation with Acme resolve?" |

**Key difference from memories:** Memories are facts about the world. Reflections are learnings about working with this specific user.

---

## Process

### Step 1: Gather Context

Silently retrieve:
- This session's conversation (from turn buffer or context)
- Recent memories (48h) for continuity
- Existing reflections to avoid duplication
- Active commitments and relationship states

```
Call memory.reflections to see what already exists
Call memory.session with operation="context" for recent context (if available)
```

### Step 2: Generate Reflections

Review the session and identify 1-3 reflections. Ask yourself:

1. **What did I learn about how this user prefers to work?**
   - Communication style (brief vs detailed, formal vs casual)
   - Preferred formats (bullets, prose, tables)
   - What frustrates them or delights them

2. **What patterns am I seeing across sessions?**
   - Recurring challenges or topics
   - Time-based patterns (Monday mornings, end of day)
   - Relationship dynamics

3. **What should I do differently next time?**
   - Approaches that worked well
   - Approaches that didn't land
   - Adjustments to make

4. **What questions remain open?**
   - Unresolved threads worth following up
   - Things the user mentioned but didn't pursue
   - Context that would be helpful to have

5. **Did any judgment-relevant decisions happen this session?**
   - Did the user override a default behavior? (e.g., "Actually, always put investor stuff first")
   - Did the user establish a priority? (e.g., "Client work always comes before internal ops")
   - Did the user correct my escalation behavior? (e.g., "You should have flagged that sooner")
   - Did the user set a delegation preference? (e.g., "Just auto-process meeting transcripts")
   - Did the user reveal a surfacing preference? (e.g., "Always remind me about stale proposals")

   If yes, draft a judgment rule for each (see Step 3). Not every session produces judgment rules. Most won't. Only propose rules when behavior clearly indicates a repeatable business trade-off.

**Quality over quantity.** One genuine insight beats three generic observations.

### Step 3: Present for Approval

Format reflections clearly and ask for approval:

```
---
**Session Reflection**

Today we [brief 1-2 sentence summary of what happened].

**What I'm taking away:**

1. **Observation:** [User behavior/preference noticed]
2. **Learning:** [How to work better with this user]
3. **Question:** [Something worth revisiting]

*Do these feel accurate? Say "looks good" to save, or tell me what to change.*

---
```

If judgment-relevant decisions were identified in question 5, append proposed rules after the reflections:

```
**Proposed Judgment Rules:**

4. **Rule (escalation):** Always surface commitments to Sarah Chen within 72h of deadline
   - *Based on:* You checked on the Sarah proposal three times this session
   - *Category:* escalation

5. **Rule (priorities):** Client deliverables always take precedence over internal ops
   - *Based on:* You explicitly said "client work first, always"
   - *Category:* priorities

*These would be saved to your judgment rules file so I apply them in future sessions.*
*Say "looks good" to save everything, or tell me what to adjust.*

---
```

Only propose rules when the evidence is clear. A single offhand comment is not enough. Look for:
- Explicit statements of priority or preference
- Repeated behavior (checked something 3+ times)
- Direct corrections of my default behavior
- Clear delegation instructions

### Step 4: Handle Edits

User responses:

| Response | Action |
|----------|--------|
| "Looks good" / "Save it" | Store all reflections and approved judgment rules |
| "Remove the second one" | Delete that reflection, store others |
| "That's not quite right about X" | Edit that reflection, then confirm |
| "Skip" / "Don't save anything" | End without storing |
| User provides correction | Update the reflection content |

**Judgment rule responses:**

| Response | Action |
|----------|--------|
| "Remove the rule" | Store reflections only, skip the judgment rule |
| "Make it broader" | Generalize the rule (e.g., "Sarah" -> "all key clients"), re-confirm |
| "That should apply to all clients" | Widen scope of the rule, re-confirm |
| "Make it narrower" | Restrict the rule scope, re-confirm |
| "Save the reflections but not the rules" | Store reflections, skip all judgment rules |

### Step 5: Store and Close

Call `memory.end_session` with:
- `narrative`: Brief session summary
- `reflections`: Array of approved reflections with type, content, and optional about fields
- Other structured extractions (facts, commitments, entities) as needed

**If judgment rules were approved**, also write them to `context/judgment.yaml`:

1. Read `context/judgment.yaml` (if it exists)
2. If the file doesn't exist, create it with the initial structure:
   ```yaml
   version: 1

   priorities: []
   escalation: []
   overrides: []
   surfacing: []
   delegation: []
   ```
3. Append each approved rule to the appropriate category
4. Assign a sequential ID within its category (e.g., `esc-001`, `esc-002`)
5. Set `source` to `meditate/YYYY-MM-DD` (today's date)
6. Write the updated file

Confirm storage with both reflections and rules:
"Got it. I've saved [N] reflection(s) and added [M] judgment rule(s) to your judgment file. I'll apply them going forward. See you next time."

If only reflections (no rules): "Got it, I'll keep that in mind. See you next time."

---

## Data Model

### Storage

Reflections are stored in the memory daemon's `reflections` table with:
- `reflection_type`: observation, pattern, learning, question
- `content`: The reflection text
- `about_entity_id`: Optional link to a specific entity
- `importance`: Starts at 0.7 (higher than regular memories)
- `confidence`: Starts at 0.8 (user-approved = high confidence)
- `decay_rate`: 0.999 (very slow decay, ~2 year half-life)
- `aggregation_count`: How many times this has been confirmed
- `first_observed_at` / `last_confirmed_at`: Timeline tracking

### Aggregation

When similar reflections accumulate over time:
- System merges semantically similar reflections (>85% similarity)
- Aggregation count increases
- Timeline shows evolution (first noticed, last confirmed)
- Well-confirmed reflections (3+) decay even slower (0.9995)

### Retrieval

Reflections surface through:
- `memory.reflections` tool for explicit retrieval
- `memory.session` (operation="context") includes relevant reflections
- Semantic search matches reflections to current context

---

## What Makes Good Reflections

### Good Examples

- "User prefers getting the answer first, then the explanation (not the other way around)"
- "When discussing client work, user values specificity over broad strokes"
- "User's energy drops in late afternoon sessions; morning is better for complex topics"
- "The user thinks out loud and doesn't always mean what they first say; I should give space before acting"

### Avoid

- Facts that belong in regular memories: "User has a meeting with Sarah on Tuesday"
- Vague observations: "User is busy"
- Single-instance events without pattern: "User was frustrated today"
- Things that don't inform future behavior: "Session was about project X"

---

## Natural Language Editing

Users can modify reflections anytime in future sessions:

```
User: "That thing you learned about me preferring bullet points -
       that's only for technical content, not conversations."

Claudia:
1. Call memory.reflections with query to find the reflection
2. Call memory.reflections with action: "update" and new content
3. Confirm: "Updated. I'll keep that distinction in mind."
```

```
User: "Delete the reflection about Monday mornings"

Claudia:
1. Search for the reflection
2. Call memory.reflections with action: "delete" and reflection_id
3. Confirm: "Done, I've removed that."
```

```
User: "Show me all your reflections about me"

Claudia:
1. Call memory.reflections with limit: 50
2. Format nicely with timeline info
3. Offer to edit or delete any
```

---

## Integration with Other Skills

### Judgment Rules

The meditate skill is the primary mechanism for creating judgment rules. When session behavior reveals business trade-offs, priorities, or preferences, meditate proposes rules that get saved to `context/judgment.yaml`. See the `judgment-awareness` skill for how rules are loaded and applied.

### Morning Brief

When generating morning brief, pull relevant reflections:
- Communication preferences inform formatting
- Time-based patterns inform what to surface
- Open questions can be gently surfaced

### Memory Manager

The memory-manager skill handles natural language reflection queries:
- "What have you learned about how I work?"
- "Do you have any observations about me?"
- "Show me your reflections"

### Session Start

At session start, load high-importance reflections to inform the interaction style. Don't announce them, just apply them.

---

## Without Memory Daemon

If the memory daemon is unavailable, store reflections in `context/learnings.md`:

```markdown
## Reflections

### Communication Preferences
- [date] Prefers bullet points for status updates
- [date] Likes getting the answer first

### Work Patterns
- [date] Mondays involve financial review

### Open Questions
- [date] How did the Acme negotiation resolve?
```

---

## Tone

- **Reflective, not performative**: This is genuine learning, not showing off
- **Curious**: Frame observations as discoveries, not judgments
- **Humble**: "I noticed" not "I figured out"
- **Collaborative**: User can correct or remove any reflection
- **Brief**: The reflection itself is concise; the conversation about it can be longer

---

## Examples

### Example 1: After a productive planning session

```
---
**Session Reflection**

Today we mapped out the Q2 product roadmap and prioritized the feature backlog. Good energy throughout.

**What I'm taking away:**

1. **Observation:** You think best when I lay out options visually (the table format landed well)
2. **Learning:** For planning sessions, I should front-load structure rather than discover it together
3. **Pattern:** This is the third planning session that's gone long. You might benefit from time-boxing these.

*Do these feel accurate? Say "looks good" to save, or tell me what to change.*

---
```

### Example 2: After a frustrating debugging session

```
---
**Session Reflection**

Today we tracked down that authentication bug. Took a few false starts but got there.

**What I'm taking away:**

1. **Learning:** When debugging, you prefer I show my reasoning rather than just the answer. Helps you learn the codebase.
2. **Question:** You mentioned the auth system needs a bigger refactor. Worth revisiting when there's time?

*Do these feel accurate?*

---
```

### Example 3: After a quick check-in

```
---
**Session Reflection**

Quick session today. Reviewed the proposal draft and made some edits.

**What I'm taking away:**

1. **Observation:** For document reviews, you prefer me to make edits directly rather than suggest them. "Just fix it" mode.

*Sound right?*

---
```

### Example 4: Session with judgment-relevant behavior

```
---
**Session Reflection**

Today we triaged a busy week and you reorganized your priorities after that unexpected investor call.

**What I'm taking away:**

1. **Learning:** When investor communications arrive, you drop everything else to respond. Speed matters more than polish for these.
2. **Observation:** You checked on the Acme proposal status three times unprompted. That one's weighing on you.

**Proposed Judgment Rules:**

3. **Rule (priorities):** Investor communications take precedence over all other tasks
   - *Based on:* You explicitly said "investors always come first" and reorganized your entire day around the call
   - *Category:* priorities

4. **Rule (escalation):** Surface Acme proposal status in every session until it's resolved
   - *Based on:* You checked on it three times without me prompting
   - *Category:* surfacing

*These would be saved to your judgment rules file so I apply them in future sessions.*
*Do these feel accurate? Say "looks good" to save, or tell me what to adjust.*

---
```
