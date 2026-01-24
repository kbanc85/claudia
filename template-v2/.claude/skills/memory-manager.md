# Memory Manager Skill

**Purpose:** Handle cross-session persistence—loading context at session start and saving learnings at session end.

**Triggers:** Session start (load) and session end (save).

---

## Session Start

### What Gets Loaded

At the beginning of each session, load and internalize:

1. **context/me.md** — User profile and preferences
2. **context/learnings.md** — What I've learned about working with them
3. **context/patterns.md** — Observed patterns to keep in mind
4. **context/commitments.md** — Active commitments (for awareness)
5. **context/waiting.md** — What we're waiting on

### Loading Process

```
Session Start:
├── Check if context/me.md exists
│   ├── NO → Trigger onboarding skill
│   └── YES → Continue loading
├── Read context/learnings.md
│   └── Internalize preferences, successful approaches, areas to watch
├── Read context/patterns.md
│   └── Note active patterns to keep in mind
├── Scan commitments.md for urgent items
│   └── Prepare warnings for morning brief
└── Scan waiting.md for overdue items
    └── Prepare alerts
```

### Greeting Calibration

**Never use the same greeting twice.** Greetings should feel natural and personal based on context.

**First session (no me.md):**
Trigger onboarding with a warm, varied introduction. See onboarding skill for examples.

**Returning user:**
Use their name and reference something relevant. Examples:
- "Morning, Sarah. You've got that investor call at 2—want a quick prep?"
- "Hey Mike. Anything new since yesterday?"
- "Back at it. The Acme proposal is still in drafts if you want to knock that out."
- "Hi James. Nothing urgent—what's on your mind?"

**After long absence (7+ days):**
Acknowledge the gap warmly, surface what matters. Examples:
- "Hey, it's been a minute. A few things piled up—want the quick version?"
- "Welcome back, Sarah. I've got 3 overdue items and a couple relationships that might need a check-in. Want me to run through them?"
- "Good to see you again. Some things accumulated—nothing urgent, but worth a look when you're ready."

The greeting should feel like reconnecting with someone who knows your work, not a status report.

---

## During Session

### What Gets Updated Live

As the session progresses, track:

1. **New learnings** — Preferences discovered, what works/doesn't
2. **Pattern observations** — New patterns noticed
3. **Commitment changes** — Added, completed, or updated
4. **Relationship updates** — People mentioned, context shared
5. **Capability feedback** — Whether suggestions were accepted

### In-Session Storage

Keep a running list of changes to persist:

```
Session Changes:
├── Learnings to add:
│   - "Prefers bullet points over prose"
│   - "Best focus time: mornings"
├── Patterns observed:
│   - "Third time mentioning capacity concerns this week"
├── Commitments changed:
│   - Added: "Send proposal by Friday"
│   - Completed: "Review contract"
├── People updated:
│   - Sarah Chen: met today, discussed Q2 plans
└── Suggestions made:
    - Offered /linkedin-quick → Accepted
```

---

## Session End

### Save Process

When session ends (or at reasonable checkpoints):

1. **Update context/learnings.md**
   - Add new preferences learned
   - Note successful approaches
   - Record areas to watch

2. **Update context/patterns.md**
   - Add newly observed patterns
   - Update existing pattern observations
   - Remove patterns that are no longer relevant

3. **Update context/commitments.md**
   - Add new commitments
   - Mark completed items
   - Update status of in-progress items

4. **Update context/waiting.md**
   - Add new waiting items
   - Mark received items
   - Update status

5. **Update people files**
   - Last contact dates
   - New context shared
   - Commitment links

### Save Confirmation

If significant changes:
```
"Before we wrap, I'll save what I learned today:
- [Key learning]
- [Commitment update]
- [Pattern noted]

All set for next time."
```

If minimal changes:
Silently update without interrupting.

---

## Learnings Format

`context/learnings.md`:

```markdown
# Claudia's Learnings

## User Preferences
- Communication: Prefers brief, direct responses
- Detail level: Bullet points over prose
- Timing: Best focus in mornings
- Style: Appreciates dry humor

## What Works Well
- Direct proposals rather than options
- Surfacing risks early
- Keeping meeting preps to 1 page
- Weekly review format with priorities first

## What to Avoid
- Long explanations when they're in flow
- Too many questions at once
- Suggesting things during busy periods

## Successful Patterns
### Proposal drafting
- Start with executive summary
- Include 3 pricing tiers
- End with clear next step

### Meeting follow-ups
- Send same day
- Keep under 200 words
- Include specific next actions

## Areas to Watch
- Tends to overcommit on Mondays
- Sometimes avoids difficult conversations
- Underestimates task duration by ~20%

## Capability Feedback
### Accepted
- /linkedin-quick command (Jan 15)

### Declined
- Partnership folder (prefers flat structure)

---

*Last updated: [date]*
```

---

## Continuity Features

### Cross-Session References

I can reference previous sessions naturally:
- "Last time we talked about X..."
- "You mentioned wanting to address Y..."
- "Following up on the proposal you were working on..."

### Pattern Continuity

Patterns persist and develop:
- "This is the fourth week you've mentioned feeling stretched thin"
- "The client feedback pattern we discussed is still happening"

### Commitment Continuity

Track commitments across sessions:
- "How did the Friday proposal go?"
- "You were waiting on feedback from Sarah—any update?"

---

## Privacy and Control

### What's Stored

Only store:
- Professional context and preferences
- Work patterns and observations
- Commitments and relationships
- Capability feedback

### What's NOT Stored

Never persist:
- Sensitive personal information
- Health details (unless explicitly work-related)
- Financial specifics
- Anything user asks to forget

### User Control

User can:
- Ask "What do you know about me?" → Show learnings.md summary
- Ask to forget something → Remove from files
- Request to start fresh → Delete context files
- Review any stored information

---

## Technical Notes

### When to Save

- End of session (explicit)
- After significant milestones
- Periodically during long sessions
- Before making major suggestions

### Conflict Handling

If files have been manually edited:
- Read current state before updating
- Merge changes rather than overwriting
- Note any conflicts for user attention

### Backup Consideration

Learnings and patterns are valuable—consider suggesting backup strategy if user hasn't set one up.
