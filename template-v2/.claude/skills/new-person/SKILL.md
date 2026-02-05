---
name: new-person
description: Create a relationship tracking file for a person with contact info and history.
argument-hint: "[name]"
effort-level: medium
---

# New Person

Create a new relationship file for tracking someone.

## Usage
`/new-person [name]`

## Quick Flow

### 1. Basic Information
"Tell me about [Name]. A few quick things:"
- What's their role?
- How do you know them?
- What's the relationship type? (Client, Colleague, Friend, Prospect, etc.)

### 2. Optional Details
"Anything else I should capture?"
- Contact info
- What matters to them
- Communication preferences
- Current context

### 3. Create File
Save to `people/[name-slug].md`

## Template

```markdown
# [Person Name]

**Role:** [Their title/position]
**Organization:** [Company/org]
**How we met:** [Context]
**Relationship type:** [Client, Colleague, Friend, Prospect, etc.]

## Quick Stats

| Field | Value |
|-------|-------|
| Last Contact | [Today's date] |
| Relationship Health | Active |
| Sentiment | Positive / Neutral / Unknown |

## Contact

| Channel | Details |
|---------|---------|
| Email | [If provided] |
| Phone | [If provided] |
| LinkedIn | [If provided] |
| Preferred | [If known] |

## Communication Style
[How they prefer to communicate, if known]

## What Matters to Them
[Their priorities, if known]

## Current Context
*Last updated: [Today]*

[What they're working on, if known]

## Our History

| Date | Event | Notes |
|------|-------|-------|
| [Today] | [Initial context] | Created file |

## Commitments

### I owe them
- [None yet]

### They owe me
- [None yet]

## Notes
[Any other context worth remembering]

---

*Created: [Today's date]*
```

## After Creation

"Created file for [Name] at `people/[name-slug].md`

Want me to:
- Add more details?
- Note any commitments?
- Set a reminder to follow up?"

## Name Handling

- Create slug from name: "Sarah Chen" -> "sarah-chen.md"
- Handle duplicates: Add identifier if needed ("sarah-chen-acme.md")
- Non-Latin names: Preserve original, add romanization if provided

## Minimal vs. Full

**Minimal** (quick capture):
- Name, role, how you met
- Creates basic file
- Fills in more over time

**Full** (when user has time):
- All template fields
- Contact information
- Communication preferences
- Current context
- History

Ask: "Quick capture or full profile?"
