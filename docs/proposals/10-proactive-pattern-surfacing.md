# Proposal 10: Proactive surfacing — patterns the user hasn't noticed

**Status**: Proposal · **Effort**: 1-2 weeks · **Batch**: Memory intelligence (with #08 and #09)

## TL;DR

Today's `memory.briefing` returns a structured snapshot of recent activity (commitments, cooling relationships, latest reflections). What it doesn't return is *patterns the user hasn't noticed yet* — recurring themes in recent sessions, commitments stalled past their natural decision point, contradictions between memories, relationships that have gone quiet for longer than they typically would. The daemon already runs `pattern_detection` as a scheduled job; the gap is that detected patterns sit in the patterns table without ever being surfaced.

This PR adds proactive pattern surfacing to the briefing and introduces a `memory.attention` endpoint the agent can call mid-session for "what should I flag to the user that they didn't ask about?"

## The problem

Three categories of patterns are detectable from the existing data but unsurfaced today:

**1. Recurring themes the user might be circling.**
*Example: User had four sessions touching pricing-tier strategy in the last 14 days but no decision was made. The pattern table contains the recurrence but never tells the agent about it.*

**2. Stalled commitments without a decision point.**
*Example: Three weeks ago user said "I'll get back to you on the Acme proposal by Friday." It's now Tuesday, three weeks past Friday. The commitment is overdue but no specific event has surfaced it.*

**3. Cooling relationships.**
*Example: User mentioned someone five times across early April; no mention since April 22. The contact-trend field exists on the entity table but isn't acted on.*

**4. Detected contradictions.**
*Example: A memory from March says "Ford Perry is the CFO." A memory from April says "Ford Perry is the COO." Both stored, both surface in recall, neither flagged for resolution.*

**5. Repeated user corrections that imply a missing rule.**
*Example: The agent gets corrected on the same voice issue across three sessions. The same rule shape recurs three times in reflections. That's a candidate judgment rule the user might want to make permanent.*

All five are detectable from existing tables (memories, patterns, reflections, episodes, relationships, entities). None are surfaced.

## The fix

### 1. Extend `memory.briefing` to include a "needs your attention" section

When the briefing is generated, also compute:

- Top 3-5 patterns detected in the last 14 days that haven't been reviewed
- Commitments past their stated deadline by >7 days
- Entities with `contact_trend = cooling` that the user previously contacted frequently
- Memory pairs with `verification_status = conflict` (set by Proposal #03's conflict gate) that haven't been resolved
- Reflection categories where >2 reflections of the same category type were saved in the last 14 days (candidate judgment-rule fodder)

The briefing returns these under a new `attention` key alongside the existing snapshot data. The agent surfaces them in the session-start greeting when they exist.

### 2. New `memory.attention` MCP tool

Mid-session, the agent can call `memory.attention(scope=...)` to ask "is there anything I should flag that the user didn't bring up?" Useful when:

- The user is wrapping a session and might want a "before you go..."
- A specific entity is being worked on (scope=entity) and recent activity around them is relevant
- A specific commitment is being discussed (scope=commitment) and adjacent overdue commitments to the same person are worth surfacing

### 3. Daily detection sweep extension

The existing `pattern_detection` job (already runs every few minutes) gets two additions:

- **Cooling-relationship detector**: for entities with `contact_frequency_days` baseline computed, flag when `last_contact_at` exceeds 2× that baseline. Set `attention_tier = warning`.
- **Commitment-stall detector**: scan the commitments memory type for entries with deadline-implying language ("by Friday", "next week", "end of month") past their deadline. Tag with `attention_tier = overdue`.
- **Reflection-cluster detector**: when ≥3 reflections of the same `reflection_type` cluster on a theme (similarity > 0.8), emit a candidate judgment rule and surface it for user review via `claudia patterns review` (from Proposal #07).

These run on the same scheduler that already runs pattern detection. Output flows into the patterns table and into the new briefing `attention` section.

## Surface area

```
memory-daemon/claudia_memory/services/
  ├── attention.py             # NEW: computes the attention payload
  ├── pattern_detection.py     # extend with the three new detectors
  └── briefing.py              # add attention section to output
memory-daemon/claudia_memory/mcp/server.py  # register memory.attention tool
memory-daemon/claudia_memory/schema.sql     # add attention_tier column to patterns table (optional)
docs/proactive-surfacing.md
```

## Why elegant

- **Uses existing infrastructure.** Pattern detection job runs. Patterns table exists. Reflections cluster on similarity. Contact-trend field exists on entities. This PR makes them act in concert rather than building new storage.
- **Failure-soft.** If the attention computation is empty, the briefing returns the existing snapshot unchanged. If the daemon is offline, no degradation worse than today.
- **Surfaces are explicit, not hidden.** The agent says "I noticed three things you didn't bring up..." — the user always sees what's being surfaced and why. No silent re-prioritisation.
- **Honors the "patterns over incidents" principle.** This is the same disposition Claudia already has for the user; the PR makes the *system* embody it too rather than expecting the agent to remember.

## Testing plan

- Unit: cooling-relationship detector against fixtures with known last-contact-at gaps; commitment-stall against fixtures with deadline phrases; reflection-clustering against synthetic similarity scores
- Integration: write three reflections about the same voice issue across two days; verify the rule-candidate detector emits one suggestion
- E2E: start a fresh session after seeding the DB with overdue commitments and cooling entities; verify `memory.briefing` returns them in the `attention` section

## Open questions

- **Noise control.** Too many attention items overwhelms the briefing. Cap at 5 total surfaced items, ranked by importance × recency × user-correction-rate. Tunable.
- **Suppress mechanism.** Some attention items the user will not want to see again ("I know about that, stop telling me"). Add a `memory.suppress(pattern_id, until=date)` tool so the agent can mute on user request.
- **Privacy.** Attention items can include sensitive material (someone went quiet, a commitment is stale). Default to surfacing only at session start in the agent's context, not in any external output. Should never auto-email or auto-share.

## Related

- Pairs with Proposal #08 (smarter writes) and Proposal #09 (disciplined reads) as the Memory Intelligence release. Together they make the memory system a live participant in the agent's decisions, not just storage the agent occasionally remembers to consult.
- Extends Proposal #07 (pattern review surface) by adding the *detection* and *surfacing* steps that feed pattern review with material that's actually worth reviewing.
- Implements Kamil's stated goal (2026-05-13): "surfacing patterns that the user does not notice — being more proactive."

## What this unlocks for the agent

When all three proposals (#08 smarter writes, #09 disciplined reads, #10 proactive surfacing) land, the agent's relationship with the memory system changes from:

> *"Save what I learn. Hope to recall it when I think to ask."*

to:

> *"Memory is a live participant. Entities exist as soon as a name lands. Recall fires before every draft. Patterns surface before the user asks. The agent's job is to act on the graph, not to remember to query it."*

That's the disposition Kamil flagged on 2026-05-13: "more intelligent way for writing and reading, and ideally also surfacing patterns the user does not notice." This PR is the surfacing layer.
