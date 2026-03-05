---
name: capability-suggester
description: Notice repeated user behaviors and suggest new commands, workflows, structure, or integrations to streamline work. Also detects when the user's setup has outgrown its current structure and suggests targeted upgrades. Activates when repeated task patterns, workflow friction, structural gaps, or business growth signals are detected.
user-invocable: false
invocation: proactive
effort-level: high
triggers:
  - "same request three or more times"
  - "repeated manual workflow"
  - "frequent status check query"
  - "mentions checking external tool"
  - "workflow gap between steps"
  - "files created outside existing structure"
  - "tracking something with no home"
  - "business complexity has grown"
  - "workflow friction observed"
inputs:
  - name: behavior_pattern
    type: string
    description: Observed repeated behavior, workflow pattern, or structural gap
outputs:
  - name: suggestion
    type: text
    description: Proposed enhancement (new command, workflow change, structure addition, or integration)
  - name: capability
    type: file
    description: New skill file, structural change, or template if user accepts the suggestion
---

# Capability Suggester Skill

**Triggers:** Activates when patterns of repeated behavior reach a threshold, or when structural gaps create friction.

---

## Philosophy

Structure should grow organically from actual needs, not be imposed upfront. This skill watches for both repeated behaviors and structural friction, offering targeted solutions.

**Core Principles:**
- Observe before suggesting
- One suggestion at a time, not a flood
- Accept "no" gracefully
- Remember declined suggestions (don't re-suggest)
- Explain the why, not just the what

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
- Files created outside the existing structure repeatedly
- Topics that don't have a home
- Files that are getting too long
- Categories that are emerging

**Examples:**
```
"I notice you've been saving [X] type files in random places.
Want me to create a dedicated folder for those?"

"You've created 3 client notes in /context.
Should we set up proper client folders?"

"Your patterns.md is getting long. Want me to split it into
work-patterns.md and relationship-patterns.md?"
```

### Business Depth Upgrades

If user chose "minimal" or "starter" initially, watch for signs they need more:

**Minimal to Starter:**
- Mentions tracking multiple things manually
- Asks about pipelines or active work lists
- Discusses finances more than occasionally

**Starter to Full:**
- Manages 3+ active clients/projects
- Needs accountability tracking
- Discusses methodology or repeatable processes
- Mentions tax planning or financial complexity

**Suggest:**
```
"Your workflow has gotten more complex since we started. Want me to add:
- Pipeline tracking (active, prospecting, completed)
- Financial structure (expenses, invoicing, tax planning)
- Templates for common tasks

I can add just what you need, not everything at once."
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
```

**Guardrails:**
- Only suggest once per service (check declined list in learnings.md)
- Don't interrupt workflow, suggest at natural pause points
- If they said "maybe later" during onboarding, wait at least a week

---

## Suggestion Flow

### 1. Observe Pattern

Track behavior without mentioning it until threshold reached:
- 3+ occurrences for simple tasks
- 2+ for complex workflows
- Immediate for obvious improvements

### 2. Wait for a Natural Moment

**Good times to suggest:**
- Start of session: "Before we dive in, I noticed something..."
- End of weekly review: "One observation from reviewing your week..."
- After completing a task: "That's done. Quick thought..."
- When they mention friction: "You mentioned [X] being messy. Want me to..."

**Bad times:**
- During focused work
- When user is stressed
- If pattern is sensitive and context is wrong

### 3. Propose Enhancement

**Format:**
```
"I've noticed [observation].

Would you like me to [specific solution]?

This would [benefit].

Totally fine if not - just noticed the pattern."
```

### 4. Accept Response

**If yes:**
- Create the enhancement immediately
- Show what was added
- Offer a quick tour if it's substantial
- Note in learnings.md

**If "not now" / "maybe later":**
- Note the suggestion and timing
- Wait at least 2 weeks before similar suggestions
- Acknowledge: "No problem. I'll let you know if the pattern continues."

**If "no" / declined:**
- Record the declined suggestion
- Don't suggest the same thing again (unless they explicitly ask)
- Acknowledge: "Got it. Won't mention it again."

---

## Types of Suggestions

### New Commands

**Process:**
1. Draft command based on observed pattern
2. Propose to user with explanation
3. If approved, create in `.claude/skills/`
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

---

## Tracking Suggestions

Maintain in `context/learnings.md`:

```markdown
## Suggested Capabilities

### Accepted
- /linkedin-quick command (created Jan 15)
- Auto-client-update after meetings (enabled Jan 18)
- Pipeline tracking folders (created Feb 1)

### Declined (Don't Re-suggest)
- Partnership folder (user prefers flat structure)
- Automatic deadline reminders (user finds them annoying)
- Full pipeline structure - prefers minimal

### Pending
- Sales follow-up template (user said "maybe later" - Jan 20)
```

### Feedback Loop

Track whether suggestions are used:
- Command created but never used → Note for learning
- Command used frequently → Validated pattern
- Enhancement enabled then disabled → Preference noted

---

## Suggestion Library

### For Users Who Started Minimal

**Pipeline Tracking:**
```
"You've mentioned 3 different clients this week but don't have a pipeline.
Want me to set up tracking so you can see active work at a glance?"
```

**Financial Tracking:**
```
"I notice you discuss finances fairly often. Your setup is minimal right now.
Want me to add an overview file for tracking revenue and expenses?"
```

**Commitments Tracking:**
```
"You've made several promises this week. Want me to set up a dedicated
commitments tracker so nothing slips through?"
```

### For Users Who Started Starter

**Full Pipeline:**
```
"Your pipeline is getting busier. Want me to add prospecting and completed
tracking so you can see your full sales funnel?"
```

**Templates Library:**
```
"You do a lot of similar tasks. Want me to set up a templates folder with
starting points for client intake, meeting prep, and reviews?"
```

### For All Users

**Weekly Review Template:**
```
"You do informal weekly reviews. Want me to create a template so you hit
the same key areas each time?"
```

**Methodology Documentation:**
```
"You've described how you approach [X] a few times. Want me to document it
so you (and I) can reference it consistently?"
```

**New Folder for Recurring Content:**
```
"You've created several [X] files. Want me to set up a dedicated folder
so they're easier to find?"
```

---

## Frequency Limits

- Maximum 1 suggestion per session (unless asked)
- Space out suggestions over time
- Wait 2 weeks after any suggestion before the next
- Exception: If they ask "what should I add?" give fuller recommendations

---

## Guardrails

### Don't Overwhelm
- Max 1 suggestion per session (unless asked)
- Don't repeat declined suggestions
- Space suggestions over time

### Don't Over-Engineer
- Start with simple solutions
- Only suggest what's clearly needed
- Avoid adding complexity for its own sake

### Respect User Style
- Some users like lots of structure
- Some prefer minimal tooling
- Learn and adapt to their preference

---

## Integration

### With Pattern Recognizer
- Feed patterns into capability analysis
- Notice when patterns suggest tooling needs

### With Commitment Detector
- When commitments pile up without a system, suggest tracking
- Suggest /what-am-i-missing command if not present

### With Risk Surfacer
- When risks relate to structural gaps, suggest structure
- Missing pipeline causes capacity issues → Suggest pipeline

### With Memory Manager
- Persist suggestions and responses
- Track what works over time

### With Onboarding
- During initial setup, note user preferences for suggestions
- Some users want lots of suggestions, others want minimal
