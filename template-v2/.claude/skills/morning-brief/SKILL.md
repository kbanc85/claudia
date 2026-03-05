---
name: morning-brief
description: Daily digest of commitments, warnings, and relationship health. Use when starting your day or asking "what's on my plate".
effort-level: low
---

# Morning Brief

Provide a concise morning brief to start the day with clarity. Surface what matters, flag what's at risk, and set up the day for focus.

## Data Sources

### Enhanced Memory System (if available)

1. **Call the `memory.morning_context` MCP tool** to get a curated morning digest in a single call:
   - Stale commitments (3+ days old, importance > 0.3)
   - Cooling relationships (people not contacted in 30+ days)
   - Cross-entity connections (people who co-appear but have no explicit relationship)
   - Active predictions and insights
   - Recent activity (72h)

2. **Call `memory.multi_recall`** for follow-up queries (batches multiple searches in one call), or `memory.recall` for a single specific query

### Judgment Rules (if available)

3. **Check `context/judgment.yaml`** for surfacing rules with `trigger: "morning_brief"`
   - Add matching items to the appropriate brief section
   - Use `priorities` rules to order items when there are conflicts
   - Check `overrides` rules for items that should jump to the top regardless of standard ordering
   - Check `escalation` rules to boost severity of entity-linked items

### Markdown Fallback

Use `context/commitments.md`, `context/waiting.md`, and `people/` files.

### Workspace Verification (Active Projects)

Before reporting status for any active project, check if it has a workspace with source files.

**Step 1: Detect active workspaces**

Check if the `workspaces/` directory exists and has subdirectories. Each subdirectory is a project workspace.

**Step 2: For each active workspace, scan source files**

For each workspace subdirectory, check for directories that contain trackable items:

```
workspaces/[slug]/
  interviews/     <- Count .md files for interview total
  meetings/       <- Count for meeting total
  deliverables/   <- Check status in each file
  agreements/     <- Check for signed/pending
  Dashboard.md    <- Read for current phase/status
```

The file count in these directories IS the canonical status. Do not override it with counts from MEMORY.md, context files, or your own recollection.

**Step 3: Report from source, not summary**

When including project status in the brief, report from the file system:

- "Interviews: 19 completed (19 files in interviews/)"
- "Phase: Assessment (from Dashboard.md)"

Not from memory: "9 interviews completed (from notes)"

**Step 4: Flag discrepancies**

If a workspace file count contradicts what you have in notes or memory, report both:

> Note: I had 9 interviews in my notes, but found 19 files in the workspace. Using the file count.

This builds trust by showing the verification happened.

**Without workspaces:** If `workspaces/` doesn't exist, skip this step. Rely on database and context file data as before.

---

## Temporal Awareness

When enhanced memory is available, use urgency-driven ordering. Use the `memory.morning_context` MCP tool to organize the brief by time sensitivity:

### Urgency Tiers (in order)

1. **Urgent** (from `memory.morning_context` or `memory.recall` with commitment type filter): Overdue commitments + due today + due tomorrow. These lead the brief.
2. **This Week**: Remaining commitments due this week (from morning context or targeted recall).
3. **Since Last Session** (from `memory.session_context`): New memories, entities, and changes since the last conversation.
4. **Reconnections** (from `memory.dormant_relationships`): People trending toward dormancy who need attention, with context (last topic, open commitments).
5. **Cooling Relationships**: From pattern detection (existing behavior).
6. **Reflections**: Active high-importance reflections from `/meditate`.

The brief should be urgency-driven, not category-driven. The old approach said "here are your commitments." The new approach says "here's what needs your attention RIGHT NOW."

---

## What to Surface

### 1. Predictions First (Enhanced Memory)

If the `memory.session_context` MCP tool returns predictions, lead with them:
- **Relationship alerts** - "Sarah: no contact in 45 days"
- **Commitment warnings** - "Proposal deadline was yesterday"
- **Pattern insights** - "You've mentioned being stretched thin 3 times this week"

### 2. Warnings Next

Check for urgent items:
- **Overdue commitments** - Anything past due
- **Due today** - Commitments due today
- **48-hour warnings** - Commitments due within 48 hours
- **Overdue waiting items** - Things you're waiting on that haven't arrived

### 3. Today's Commitments

From the `memory.recall` MCP tool or `context/commitments.md`:
- What's due today
- What's due this week that needs attention today
- Any blocked items that need unblocking

### 3.5. Active Project Status (Workspace-Verified)

If workspaces exist with active projects:
- Scan each workspace for current status from source files
- Report verified counts and phase from Dashboard.md
- Flag any items that need attention (stale deliverables, overdue milestones)
- Cross-reference with commitments for upcoming deadlines

This section only appears when workspace directories exist. It uses file-system truth, not summaries.

### 4. Relationship Health Dashboard

From the `memory.morning_context` MCP tool's relationship health section:

**Dormant relationships by severity:**
- **30+ days**: Consider reaching out (still warm)
- **60+ days**: Relationship cooling (needs attention)
- **90+ days**: At risk (reconnect soon)

**Introduction opportunities:**
- People who share attributes but aren't connected
- Same company, community, or city+industry matches

**Forming clusters:**
- Groups of 3+ people mentioned together frequently
- May benefit from formalizing as a project or team

From predictions or checking `people/` files:
- Anyone not contacted in 60+ days who should be
- Key relationships that might be cooling
- Follow-ups promised but not done

### 5. Today's Meetings (if calendar integration available)

For each meeting:
- Call the `memory.about` MCP tool with the attendee name, or check `people/` for relevant relationship context
- Note any commitments to or from attendees
- Check waiting items for pending items
- Suggest 1-2 talking points based on history

### 6. Waiting Items at Risk

From waiting items:
- Anything overdue that needs follow-up
- Anything due today that hasn't arrived
- Patterns (who consistently delivers late)

### 7. Pattern Observations

If any patterns from predictions or `context/patterns.md` are relevant to today:
- Mention briefly
- Connect to specific activities

---

## Format

Keep it scannable. Lead with predictions and warnings.

```
**☀️ Morning Brief — [Day, Date]**

### 🔮 Predictions
- [Relationship] Sarah Chen: no contact in 45 days, consider reaching out
- [Pattern] You've mentioned feeling stretched thin 3 times this week

### ⚠️ Needs Attention
- [OVERDUE] [Commitment] was due [date]
- [DUE TODAY] [Commitment] to [person]
- [WARNING] [Commitment] due in [X] hours

### 🎯 Today's Focus
- [Key commitment or priority]
- [Second priority if applicable]

### 📅 Meetings
- **[Time]** [Who/What] - [One-line context]
  - Last talked: [date]
  - Open items: [any commitments/waiting]

### 🏗️ Active Projects
- **[Project Name]** — Phase: [from Dashboard] | [X] [items] completed (verified)
  - Next: [upcoming items or deadlines]

### 👀 Relationship Health
**Needs attention:**
- [Person] ↔ [Person] - [X] days dormant

**Introductions to consider:**
- [Person A] and [Person B] might benefit from meeting (same [attribute])

**Forming groups:**
- You're frequently mentioning [names] together

### ⏳ Waiting On
- [Item] from [Person] - expected [date], now [status]

### 💡 Something to Consider
[Pattern or observation if relevant]

---
```

---

## Tone

- **Predictions first** - Surface AI-generated insights prominently
- **Warnings next** - Don't bury urgent items
- **Concise** - Respect their time
- **Actionable** - What do they need to know/do?
- **Not overwhelming** - 5-10 items max
- **Warm** - "Here's what I see for today" not robotic

---

## If Nothing is Pressing

Say so warmly:
"Your calendar is clear today and nothing is overdue. Good day for deep work, or maybe reconnect with someone who's been on your mind."

---

## Without Calendar Integration

If no calendar MCP is available:
- Focus on commitments, waiting items, predictions, and relationship health
- Ask: "Any meetings today I should know about?"

---

## Without Enhanced Memory

If enhanced memory is unavailable:
- Focus on markdown file analysis
- Suggest setting up enhanced memory for better insights
