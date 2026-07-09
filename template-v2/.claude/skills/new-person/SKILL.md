---
name: new-person
description: Create a relationship tracking file for a person with contact info, history, and communication preferences. Use when user says "new person", "add [name]", "create a file for [name]", "track this person", or mentions someone important who doesn't have a file yet. See also: `relationship-tracker` for ongoing health; `meeting-prep` when you have a call coming up.
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

Use the **canonical person template** defined in `structure-generator.md` (the
`people/_template.md` block). Do not keep a separate variant here. It ships OKF
frontmatter and the full section set.

Fill the OKF frontmatter, setting `timestamp` to the current time in ISO 8601:

```yaml
---
type: person
title: "[Person Name]"
description: "[One line: who they are]"
tags: [person]
timestamp: "[ISO 8601, now]"
---
```

Then follow the canonical body (Role/Organization header, Quick Stats, Contact,
Communication Style, What Matters, Current Context, Our History, Commitments,
Notes). See `docs/okf-conventions.md` for the authoring standard.

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
