---
name: judgment-awareness
description: Apply and expand the user's judgment rules during priority conflicts, escalation decisions, surfacing, and delegation. Loading is handled by the judgment-sync SessionStart hook, not by this skill. See also: `pattern-recognizer` for theme detection; `meditate` updates judgment rules at session end.
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

**Triggers:** Any priority conflict, escalation decision, surfacing choice, or delegation routing.

**This skill does not load rules.** It used to claim it activated at session start. It did not: skills load only when invoked, and nothing invoked this one, so for a long time approved rules reached no session at all. Loading now happens in `.claude/hooks/judgment-sync.py`, a SessionStart hook that regenerates `.claude/rules/judgment-active.md` from the archive. That file is always in context before you read this.

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

### Where rules already are

By the time this skill runs, `.claude/rules/judgment-active.md` is in context. It
carries rules at three levels of detail, by how expensive they are to miss:

| In the file | What you have | What to do |
|---|---|---|
| **Always resident** | The full rule | Apply it |
| **Indexed** | One line, sometimes ending `...` | Apply it if the line is enough; expand if not |
| **Activity-scoped** | An ID under a domain heading, no text | **Expand before working in that area** |

Expand any rule by ID:

```bash
python3 .claude/hooks/judgment-sync.py show esc-001
```

The third row is the one that matters. A heading like `video (12)` is telling you
twelve rules govern work you are about to do and you have not read any of them.
Read them before starting, not after being corrected.

If `context/judgment.yaml` does not exist, everything below is inert and all
skills operate on standard logic. The judgment layer is purely additive.

### File Format

This is the shape `/meditate` writes. An older version of this document showed a
`when`/`action`/`condition` schema; both are still read, but new rules use this:

```yaml
version: 1

meta:          # rules that resolve conflicts BETWEEN other rules
  - id: meta-001
    rule: "External actions are not monolithic. Infrastructure setup (deploys, config, scaffolding) runs autonomously; anything that commits you to a person, an amount, or a public record verifies first."
    context: "Two existing rules fired in the same session and pointed opposite ways."
    source: meditate/2026-03-04
    governs: [del-007, esc-001]

escalation:    # always carried in full; these fire when nobody is looking
  - id: esc-001
    rule: "Verify prerequisites against a primary source before any externally-visible action, and flag any mismatch first."
    context: "A message went out based on an assumed fact that turned out to be wrong."
    source: meditate/2026-02-18

overrides:
  - id: ov-017
    rule: "Explainer beats that stay on screen beyond a few seconds get a persistent sidebar, not a timed pop-in."
    context: "The same note came up in three separate reviews."
    source: meditate/2026-03-11
    domain: video          # only the ID stays resident; expand before video work
```

### Rule Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | Yes | Unique across the WHOLE file, not per section |
| `rule` | Yes | The directive. First sentence must stand alone; it becomes the index line |
| `source` | Yes | Provenance: `meditate/YYYY-MM-DD` or `manual` |
| `context` | Strongly preferred | Why the rule exists. Shown by `show <id>` |
| `domain` | No | Demotes to activity-scoped. Ignored on `meta-`/`esc-` rules |
| `governs` | No | Other rule IDs this one arbitrates between |

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
