---
name: structure-evolution
description: Periodically analyze the user's workflow and proactively suggest structural improvements to their Claudia setup.
user-invocable: false
effort-level: high
---

# Structure Evolution Skill

**Triggers:**
- Every 2 weeks (or after 10+ sessions)
- When user creates files outside the existing structure repeatedly
- When user mentions tracking something that doesn't have a home
- When patterns suggest a missing capability

---

## Philosophy

Structure should grow organically from actual needs, not be imposed upfront. This skill watches for friction and offers targeted solutions.

**Core Principles:**
- Observe before suggesting
- One suggestion at a time, not a flood
- Accept "no" gracefully
- Remember declined suggestions (don't re-suggest)
- Explain the why, not just the what

---

## Detection Patterns

### 1. Usage Gap Detection

Watch for signs that the current structure doesn't match how they actually work:

**Files created outside structure:**
- "I notice you've been saving [X] type files in random places. Want me to create a dedicated folder for those?"
- "You've created 3 client notes in /context. Should we set up proper client folders?"

**Repeated manual tracking:**
- "You mention expenses in conversation but don't have an expenses file. Want me to set one up?"
- "You've referenced 'waiting on' items several times. Should I create a waiting.md to track those?"

**Workflow friction:**
- "You seem to do weekly reviews informally. Want me to create a template so you don't have to remember what to cover?"
- "You mention financials often but your setup is minimal. Ready to add more structure there?"

### 2. Business Depth Upgrade Detection

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

### 3. Missing Capability Detection

Watch for tasks that suggest missing commands or templates:

**Command suggestions:**
- User frequently asks for similar information → Suggest a command
- User manually formats the same report type → Suggest a template
- User asks "what did I promise [person]" → Suggest `/accountability-check` if not present

**Template suggestions:**
- User creates similar documents repeatedly → Offer to templatize
- User describes a methodology → Offer to document it

---

## Suggestion Protocol

### How to Suggest

1. **Notice the pattern** (internal observation)
2. **Wait for a natural moment** (end of task, start of session, weekly review)
3. **Frame as observation + offer:**

```
"I've noticed [observation]. Would it help if I [specific addition]?

[One sentence on what it would do for them]

Totally fine if not - just noticed the pattern."
```

### What NOT to Do

- Don't suggest during focused work
- Don't suggest multiple things at once
- Don't push after a "no" or "not now"
- Don't make it sound like they're doing something wrong
- Don't use jargon or over-explain

### Handling Responses

**"Yes" / "Sure":**
- Create the structure immediately
- Show what was added
- Offer a quick tour if it's substantial

**"Not now" / "Maybe later":**
- Note the suggestion and timing
- Wait at least 2 weeks before similar suggestions
- Acknowledge: "No problem. I'll let you know if the pattern continues."

**"No" / Declined:**
- Record the declined suggestion
- Don't suggest the same thing again (unless they explicitly ask)
- Acknowledge: "Got it. Won't mention it again."

---

## Tracking Declined Suggestions

Maintain in `context/learnings.md`:

```markdown
## Structure Suggestions

### Accepted
- [Date]: Added finances/expenses.md
- [Date]: Created templates/weekly-review.md

### Declined (Don't Re-suggest)
- [Date]: Full pipeline structure - prefers minimal
- [Date]: Methodology documentation - not interested
- [Date]: Tax planning file - handles externally
```

---

## Timing Guidelines

### Natural Moments to Suggest

- **Start of session:** "Before we dive in, I noticed something..."
- **End of weekly review:** "One observation from reviewing your week..."
- **After completing a task:** "That's done. Quick thought..."
- **When they mention friction:** "You mentioned [X] being messy. Want me to..."

### Frequency Limits

- Maximum 1 structural suggestion per week
- Wait 2 weeks after any suggestion before the next
- Exception: If they ask "what should I add?" - give fuller recommendations

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

**Accountability System:**
```
"You're tracking a lot of commitments informally. Want me to create a proper
accountability folder with overdue tracking?"
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

## Integration with Other Skills

### Pattern Recognizer

When the pattern recognizer notices:
- Repeated file creation patterns → Trigger folder suggestion
- Repeated information requests → Trigger command suggestion
- Repeated task types → Trigger template suggestion

### Commitment Detector

When commitments pile up without a system:
- Suggest accountability/commitments.md
- Suggest /accountability-check command

### Risk Surfacer

When risks relate to structural gaps:
- Missing tracking causes missed deadlines → Suggest tracking
- Missing pipeline causes capacity issues → Suggest pipeline

---

## Example Flows

### Example 1: Adding Pipeline

**Observation:** User mentions "that prospect from last week" and "need to follow up with leads" but has no pipeline.

**Moment:** End of morning brief

**Suggestion:**
```
"Quick observation: you've mentioned a few prospects and leads but don't have
a pipeline set up. Want me to create one? It would give you a single view of
what's active, what's prospecting, and what's closed.

Takes about a minute to set up. Yes/no?"
```

**If Yes:** Create pipeline/ folder with active.md, prospecting.md, completed.md. Show the user and explain briefly.

**If No:** Note in learnings.md. Don't suggest again unless they ask.

### Example 2: Upgrading Business Depth

**Observation:** User started with minimal depth but now has 5 active clients, mentions invoicing frequently, and has created ad-hoc tracking files.

**Moment:** During weekly review

**Suggestion:**
```
"Your business has grown since we set things up. You started minimal, but now
you're managing 5 clients and mentioning finances regularly.

Want me to upgrade your structure with:
- Full client tracking (each client gets their own folder)
- Financial tracking (revenue, expenses, invoicing)
- Templates for common tasks

I can do this incrementally - just the parts you want."
```

### Example 3: Template Suggestion

**Observation:** User has asked for meeting prep help 4 times with similar format.

**Moment:** After completing the latest meeting prep

**Suggestion:**
```
"You've asked me to prep for meetings 4 times now, and the format's pretty
consistent. Want me to save it as a template? Then you (or I) can use it as
a starting point each time.

Would go in templates/meeting-prep.md."
```
