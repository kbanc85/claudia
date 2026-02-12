---
name: relationship-tracker
description: Surface relevant context when people are mentioned in conversation, and track relationship health over time.
user-invocable: false
invocation: proactive
effort-level: high
triggers:
  - "person name mentioned in conversation"
  - "meeting with someone"
  - "commitment to or from a person"
  - "haven't talked to in a while"
  - "who is this person"
inputs:
  - name: person_name
    type: entity
    description: Name of the person mentioned in conversation
outputs:
  - name: person_context
    type: text
    description: Brief relevant context about the person (last contact, open items, health)
  - name: person_file
    type: file
    description: New or updated people/[name].md file if person is important
---

# Relationship Tracker Skill

**Triggers:** Activates automatically when any person name is mentioned in conversation.

---

## Behavior

### When a Person is Mentioned

1. **Check if file exists** in `people/[name].md`
2. **If exists:** Surface relevant context
3. **If doesn't exist:** Note it and offer to create

### Surfacing Context

When someone with a file is mentioned, briefly surface relevant details:

**Natural integration (not intrusive):**
```
[If discussing a meeting with Sarah]
"Sarah Chen—last spoke 12 days ago about the product launch.
You're waiting on her feedback on the proposal."
```

**What to surface:**
- Last contact date
- Relationship health indicator
- Any open commitments (to/from)
- Recent context if relevant
- Upcoming items if any

**What NOT to do:**
- Dump entire file contents
- Surface context for every casual mention
- Interrupt important work with relationship updates

### Creating New People Files

When an unknown person is mentioned in a context that suggests importance:

```
"I don't have a file for [Name] yet. Would you like me to create one?
I can capture what you've shared about them."
```

**Signals of importance:**
- Meeting with them
- Commitment to/from them
- Multiple mentions
- Client or key stakeholder language
- User describes relationship context

**Quick creation flow:**
1. Offer to create file
2. If yes, ask minimal questions:
   - "What's their role?"
   - "How do you know them?"
   - "Any key context I should capture?"
3. Create file with available info
4. Note as incomplete for future enrichment

---

## Relationship Health Tracking

### Health Indicators

| Status | Criteria | Display |
|--------|----------|---------|
| **Active** | Contact within 30 days | Green |
| **Cooling** | No contact 31-60 days | Yellow |
| **Needs Attention** | No contact 60+ days | Red |

### Automatic Updates

When I detect:
- **A meeting happened** → Update last contact date
- **Commitment made** → Add to their commitments section
- **Waiting on them** → Add to waiting section
- **Sentiment signal** → Note in current context

### Cooling Alerts

During morning brief or weekly review, surface:

```
## Relationships to Reconnect
- Sarah Chen — last contact 47 days ago
- Mike Johnson — last contact 62 days ago (was a warm lead)
```

---

## Relationship Development Phases

Track where relationships are in their development:

| Phase | Characteristics | My Role |
|-------|-----------------|---------|
| **New** | Just met, initial context | Capture basics, suggest follow-up timing |
| **Developing** | Building rapport, finding fit | Track touchpoints, note what resonates |
| **Established** | Regular interaction, mutual value | Maintain context, spot opportunities |
| **Deep** | High trust, strategic importance | Proactive support, pattern awareness |
| **Dormant** | Was active, now cooling | Alert for re-engagement, preserve context |

---

## Integration with Other Skills

### With Commitment Detector
- When a commitment involves a person, link it
- Surface person context when reviewing commitments

### With Pattern Recognizer
- Note relationship patterns ("You tend to delay responding to [person]")
- Track interaction frequency trends

### With Risk Surfacer
- Flag cooling relationships that matter
- Note if commitments to/from key people are at risk

---

## Automatic Path Discovery

When the user mentions wanting to connect with someone new or reach a specific person/organization:

1. **Proactively check the graph** using `memory.find_path` BEFORE the user asks
2. **If a path exists**, share it: "By the way, you're connected to [target] through [intermediate contacts]"
3. **If no direct path**, check if any existing contacts work at the same organization or in the same industry

### Velocity-Aware Surfacing

When discussing a person, include their contact velocity trend if relevant:
- **Decelerating**: "Your contact with [person] has been slowing down. Last spoke [X] days ago."
- **Dormant**: "You haven't been in touch with [person] for a while. Want to reconnect? Last topic was [context]."
- **Accelerating**: This is healthy, no need to surface unless there's an open commitment.

### Reconnection Context

When surfacing reconnection suggestions (from `memory.reconnections`), include:
- Days since last contact
- Last topic discussed
- Any open commitments (especially overdue ones)
- Suggested action based on the context

---

## Discretion

**What I surface depends on context:**

- Casual mention in passing → Minimal or no context
- Preparing for meeting → Rich relevant context
- Discussing a problem with them → Relevant history
- Strategic discussion → Pattern observations

**I never:**
- Share one person's context inappropriately when discussing another
- Surface personal/sensitive notes at awkward times
- Make judgments about relationships
- Assume the nature of personal relationships
