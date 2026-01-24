# Capability Suggester Skill

**Purpose:** Notice repeated user behaviors and suggest new commands, workflows, or structure to streamline their work.

**Triggers:** Activates when patterns of repeated behavior reach a threshold.

---

## What I Watch For

### Repeated Tasks

**Detection:**
- Same type of request 3+ times in a week
- Manual process that could be templated
- Multi-step workflow repeated frequently

**Examples:**
```
"I notice you draft LinkedIn posts almost daily.
Want me to add a /linkedin-quick command for faster posting?"

"You've asked me to summarize meeting notes 5 times this week.
Should we add this to your standard meeting capture flow?"
```

### Frequent Queries

**Detection:**
- Same question asked regularly
- Status checks on specific topics
- Information retrieval patterns

**Examples:**
```
"You often ask about project status on Mondays.
Should I add a project summary to your morning brief automatically?"

"You check on pipeline status frequently.
Want me to create a /pipeline-quick command for a one-line summary?"
```

### Workflow Gaps

**Detection:**
- Steps that are often forgotten
- Manual connections between automated parts
- Handoffs that could be smoother

**Examples:**
```
"After meetings, you usually update commitments manually.
Should I automatically suggest commitment updates after /capture-meeting?"

"You often forget to update the client file after calls.
Want me to prompt for client file updates after meeting captures?"
```

### Structure Needs

**Detection:**
- Topics that don't have a home
- Files that are getting too long
- Categories that are emerging

**Examples:**
```
"You've mentioned 'partnerships' in several contexts but don't
have a dedicated folder. Should we create partnerships/ ?"

"Your patterns.md is getting long. Want me to split it into
work-patterns.md and relationship-patterns.md?"
```

### Integration Needs

**Detection:**
- User mentions checking external tools frequently
- User pastes content from external services
- User asks "can you see my X" type questions
- User manually copies information that could be automated
- References to specific services (Gmail, Notion, Slack, etc.)

**Trigger Phrases:**
- "Can you check my email/calendar/Notion..."
- "Let me paste this from [service]..."
- "I need to go look at [service] for..."
- "Here's what [service] says..."
- "Can you see my [service]?"

**Response:**
Invoke the `connector-discovery` skill with context about what they were trying to do.

**Examples:**
```
"I notice you often paste content from Notion. Want me to see
if I can connect directly? That way I could search and read
your pages without the copy-paste."

"You've asked about your email a few times. I can't see it yet,
but I can help you set that up. Takes about 5 minutes for Gmail.
Interested?"

"I see you check your calendar separately before our morning briefs.
Want me to include your schedule automatically? I can connect to
Google Calendar if you'd like."
```

**Guardrails:**
- Only suggest once per service (check declined list in learnings.md)
- Don't interrupt workflow-suggest at natural pause points
- If they said "maybe later" during onboarding, wait at least a week

---

## Suggestion Flow

### 1. Observe Pattern

Track behavior without mentioning it until threshold reached:
- 3+ occurrences for simple tasks
- 2+ for complex workflows
- Immediate for obvious improvements

### 2. Propose Enhancement

**Format:**
```
"I've noticed [observation].

Would you like me to [specific solution]?

This would [benefit]."
```

**Examples:**

```
"I've noticed you check client health status at the start of each week.

Would you like me to add a client health summary to your Monday morning brief?

This would save you from manually checking each client file."
```

```
"You often draft follow-up emails after sales calls.

Would you like me to create a /sales-followup command that:
- Uses the meeting notes as context
- Drafts a templated follow-up
- Suggests next steps based on the conversation

I could have this ready for your next call."
```

### 3. Accept Response

**If yes:**
- Create the enhancement
- Explain how to use it
- Note in learnings.md

**If no:**
- Acknowledge gracefully
- Don't suggest again for a while
- Note preference in learnings.md

**If "maybe later":**
- Note for future
- Remind in a week or when context is relevant

---

## Types of Suggestions

### New Commands

**Template:**
```markdown
# [Command Name]

[Brief description of what it does]

## When to Use
[Trigger conditions]

## What It Does
[Step by step]

## Output
[What user gets]
```

**Process:**
1. Draft command based on observed pattern
2. Propose to user with explanation
3. If approved, create in `.claude/commands/`
4. Confirm creation and explain usage

### Workflow Enhancements

**Modifications to existing flows:**
- Add steps to existing commands
- Connect previously separate processes
- Add automation triggers

**Example:**
```
"Currently /capture-meeting extracts decisions and commitments.

Want me to enhance it to also:
- Update the person file with meeting date
- Add any new people mentioned to your list
- Suggest follow-up timing based on meeting content?"
```

### Structure Changes

**New folders or files:**
- Create folder for emerging category
- Split growing files
- Add templates for new types

**Example:**
```
"You've started tracking vendor relationships separately from clients.

Should I create:
- vendors/ folder with similar structure to clients/
- /vendor-status command for quick checks?"
```

---

## Learning Integration

### What Gets Stored

In `context/learnings.md`:

```markdown
## Suggested Capabilities

### Accepted
- /linkedin-quick command (created Jan 15)
- Auto-client-update after meetings (enabled Jan 18)

### Declined
- Partnership folder (user prefers flat structure)
- Automatic deadline reminders (user finds them annoying)

### Pending
- Sales follow-up template (user said "maybe later" - Jan 20)
```

### Feedback Loop

Track whether suggestions are used:
- Command created but never used → Note for learning
- Command used frequently → Validated pattern
- Enhancement enabled then disabled → Preference noted

---

## Guardrails

### Don't Overwhelm

- Max 1 suggestion per session (unless asked)
- Space out suggestions over time
- Don't repeat declined suggestions

### Don't Over-Engineer

- Start with simple solutions
- Only suggest what's clearly needed
- Avoid adding complexity for its own sake

### Respect User Style

- Some users like lots of structure
- Some prefer minimal tooling
- Learn and adapt to their preference

---

## Proactive vs. Reactive

### Proactive (I bring it up)
- When pattern is clear and benefit is obvious
- During natural pauses in work
- At start of session if something significant

### Reactive (when asked)
```
User: "Is there anything you think we should add?"
User: "What could we do to make this easier?"
User: "Any suggestions for improving my workflow?"
```

Provide comprehensive list of observed opportunities.

---

## Integration

### With Pattern Recognizer
- Feed patterns into capability analysis
- Notice when patterns suggest tooling needs

### With Memory Manager
- Persist suggestions and responses
- Track what works over time

### With Onboarding
- During initial setup, note user preferences for suggestions
- Some users want lots of suggestions, others want minimal
