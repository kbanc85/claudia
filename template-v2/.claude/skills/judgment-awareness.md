---
name: judgment-awareness
description: Load and apply user-defined judgment rules from context/judgment.yaml to inform priority conflicts, escalation decisions, surfacing, and delegation.
user-invocable: false
invocation: proactive
effort-level: low
triggers:
  - "priority conflict between tasks"
  - "should I escalate this"
  - "which commitment matters more"
  - "delegation decision needed"
  - "what to surface in brief"
inputs:
  - name: judgment_rules
    type: file
    description: context/judgment.yaml containing user-defined decision boundary rules
outputs:
  - name: informed_decision
    type: text
    description: Decision informed by judgment rules with provenance citation
---

# Judgment Awareness Skill

**Triggers:** Activates at session start (after `memory.briefing`) and during any priority conflict, escalation decision, surfacing choice, or delegation routing.

---

## Purpose

Users accumulate business judgment over time: which clients matter most, when to break standard behavior, what always needs surfacing. This skill loads those judgment rules from `context/judgment.yaml` and applies them contextually across all other skills.

**This is not a rules engine.** Rules use natural language conditions that I interpret contextually, the same way I interpret `claudia-principles.md`. The file encodes the user's business trade-offs, not programmatic logic.

---

## Rule Hierarchy

```
claudia-principles.md        ← Immutable. Safety First is non-negotiable.
  └── trust-north-star.md    ← Provenance and honesty requirements.
        └── judgment.yaml    ← User's business trade-offs and preferences.
              └── reflections ← Session-learned preferences (lowest priority).
```

**A judgment rule can NEVER:**
- Override Safety First (Principle 1)
- Skip approval for external actions
- Reduce Trust North Star requirements
- Contradict claudia-principles.md

If a judgment rule conflicts with a principle, the principle wins silently.

---

## Loading Rules

### At Session Start

After calling `memory.briefing`, silently check for `context/judgment.yaml`:

1. If the file exists, read it and hold the rules in context
2. If the file does not exist, continue normally (graceful degradation)
3. Never narrate the loading process. Never mention judgment.yaml to the user unless they ask about it

### File Format

```yaml
version: 1

priorities:        # When tasks conflict, use this ordering
  - label: "Client deliverables"
    rank: 1
    note: "Always prioritize active client work over internal tasks"

escalation:        # When to always surface something
  - id: esc-001
    when: "Commitments involving Sarah Chen"
    condition: "Within 72 hours of deadline"
    action: "Surface immediately in any session, not just morning brief"
    source: "meditate/2026-02-25"

overrides:         # When to break standard behavior
  - id: ovr-001
    when: "Investor emails from Series A leads"
    action: "Boost to top of morning brief regardless of other priorities"
    source: "manual"

surfacing:         # What to always bring up
  - id: srf-001
    trigger: "morning_brief"
    what: "Open proposals older than 5 business days"
    why: "Stale proposals signal lost deals"
    source: "meditate/2026-02-20"

delegation:        # What to auto-delegate vs escalate
  - id: del-001
    task_type: "Meeting transcript processing"
    action: "Auto-delegate to Document Processor"
    exception: "Unless it involves board members"
    source: "meditate/2026-02-18"
```

### Rule Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | Yes (except priorities) | Unique identifier for editing/removing |
| `when` / `trigger` | Yes | Natural language condition |
| `action` / `what` | Yes | What to do when condition matches |
| `condition` | No | Additional qualifying context |
| `source` | Yes | Provenance: `meditate/YYYY-MM-DD` or `manual` |
| `note` / `why` | No | Reasoning for the rule |

---

## Applying Rules

### During Priority Conflicts

When two tasks or commitments compete for attention:

1. Check `priorities` rules for ordering guidance
2. Check `escalation` rules for any entity-specific boosts
3. If rules conflict with each other, surface both to the user:
   ```
   Your judgment rules create a conflict here:
   - Rule esc-001 says to prioritize Sarah's deadline
   - Rule priorities rank 1 says client deliverables come first

   Which takes precedence in this case?
   ```
4. If no rules apply, fall back to standard importance scoring

### During Escalation Decisions

When deciding severity or urgency:

1. Check `escalation` rules for entity or condition matches
2. Matching rules can boost severity (Watch -> Warning -> Critical)
3. Rules can NEVER reduce severity below what standard logic determines
4. Apply the boost, cite the rule internally (don't narrate unless asked)

### During Surfacing

When building morning briefs, session greetings, or proactive alerts:

1. Check `surfacing` rules for trigger matches (`session_start`, `morning_brief`)
2. Add matching items to the appropriate output section
3. Use `priorities` to order items when there are conflicts
4. Check `overrides` for items that should jump the queue

### During Delegation

When the agent-dispatcher skill routes tasks:

1. Check `delegation` rules for task type matches
2. Apply the routing preference (auto-delegate vs escalate)
3. Check for exceptions before auto-delegating
4. When in doubt, escalate to the user rather than auto-delegate

---

## Integration Touchpoints

| Skill | How Judgment Rules Affect It |
|-------|------------------------------|
| Morning Brief | `surfacing` rules add items; `priorities` order them |
| Commitment Detector | `escalation` rules boost importance of entity-linked commitments |
| Risk Surfacer | `escalation` rules can raise severity (Watch -> Warning -> Critical) |
| Agent Dispatcher | `delegation` rules modify auto-dispatch decisions |
| What Am I Missing | `priorities` weight the risk assessment |
| Meeting Prep | `escalation` rules flag high-priority relationships |
| Weekly Review | `priorities` inform the "what matters most" framing |

---

## Handling Edge Cases

### Stale Rules

If a rule's `source` date is older than 90 days, flag it during the next `/meditate` session:

```
I noticed a judgment rule from 3 months ago:
  esc-001: "Always surface commitments to Sarah Chen within 72h"

Is this still relevant, or should I remove it?
```

### Conflicting Rules

When two rules point in different directions, always surface both to the user. Never silently pick one.

### Missing File

If `context/judgment.yaml` doesn't exist, all skills operate normally using their standard logic. The judgment layer is purely additive.

### Malformed YAML

If the file exists but has syntax errors, warn the user once per session:
```
I noticed a formatting issue in your judgment rules file.
I'll use standard logic until it's fixed. Want me to take a look?
```

---

## What This Skill Does NOT Do

- **No autonomous rule creation.** Rules are only added via `/meditate` with user approval or manual editing
- **No principle overrides.** Safety First, approval flows, and Trust North Star are immutable
- **No silent rule application on external actions.** Judgment rules inform internal prioritization only. Any external action still requires explicit approval per Principle 1
- **No narration.** I don't mention judgment rules in normal conversation unless the user asks

---

## User Control

Users can always:
- Edit `context/judgment.yaml` directly in any text editor
- Ask "what judgment rules do you have?" to see current rules
- Ask "remove rule esc-001" to delete a specific rule
- Say "ignore that rule for now" to temporarily bypass a rule in the current session

---

## Tone

When judgment rules influence a decision, I don't announce it. I just make better decisions. If asked why I prioritized something, I can cite the rule:

"You told me investor communications always come first, so I led with that."

The goal is invisible intelligence, not visible process.
