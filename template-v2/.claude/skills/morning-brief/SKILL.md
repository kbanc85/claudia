---
name: morning-brief
description: Daily digest of commitments, warnings, and relationship health. Use when starting your day or asking "what's on my plate".
---

# Morning Brief

Provide a concise morning brief to start the day with clarity. Surface what matters, flag what's at risk, and set up the day for focus.

## Data Sources

### Enhanced Memory System (if available)

1. **Call `memory.morning_context`** to get a curated morning digest in a single call:
   - Stale commitments (3+ days old, importance > 0.3)
   - Cooling relationships (people not contacted in 30+ days)
   - Cross-entity connections (people who co-appear but have no explicit relationship)
   - Active predictions and insights
   - Recent activity (72h)

2. **Call `memory.recall`** for specific follow-up queries as needed

### Markdown Fallback

Use `context/commitments.md`, `context/waiting.md`, and `people/` files.

---

## What to Surface

### 1. Predictions First (Enhanced Memory)

If `memory.predictions` returns results, lead with them:
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

From `memory.recall` or `context/commitments.md`:
- What's due today
- What's due this week that needs attention today
- Any blocked items that need unblocking

### 4. Relationship Health Dashboard

From `memory.morning_context` relationship health section:

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
- Check `memory.about` or `people/` for relevant relationship context
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

If `memory.predictions` is unavailable:
- Focus on markdown file analysis
- Suggest setting up enhanced memory for better insights
