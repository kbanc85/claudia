# Decision: [title]

**Date**: YYYY-MM-DD
**Status**: proposed | accepted | superseded by YYYY-MM-DD-xxx.md | withdrawn
**Phase**: [Phase number and name, e.g. "Phase 2A — Memory core"]
**Author**: [name or session id]

## Context

What prompted this decision? What problem are we solving? What constraints apply?

## Options considered

List each option with pros and cons. Minimum two options; if you can only think of one, you haven't explored the space enough.

### Option A: [name]
- **Pros**:
  - 
- **Cons**:
  - 

### Option B: [name]
- **Pros**:
  - 
- **Cons**:
  - 

### Option C: [name]
- **Pros**:
  - 
- **Cons**:
  - 

## Decision

What was chosen and why. Be specific about the reasoning. This is the section future-you will care about most when something breaks.

## Consequences

What changes as a result of this decision?
- **Positive**:
  - 
- **Negative**:
  - 
- **Neutral / things we now have to do**:
  - 

## Open questions

Anything we deferred or didn't resolve:
- 

## References

- Related ADRs:
- Relevant roadmap sections:
- External documentation / PRs / issues:

---

## Pre-identified starter decisions (remove this section when using the template for a real decision)

The roadmap lists four decisions that must be made during execution. Write each as its own ADR when the phase reaches it:

1. **Fork vs wrapper** _(Phase 0)_ — outcome already known (permanent fork, own repo). Write this first; it's the warm-up ADR.
2. **Memory provider strategy** _(Phase 2A)_ — which v0.7.0 provider ABC methods do we implement, extend, or register alongside?
3. **Subagent personality inheritance** _(Phase 3)_ — how much persona do subagents inherit? Roadmap recommends abbreviated ~500-token version.
4. **Cost governance enforcement point** _(Phase 2B)_ — per-request, per-session, or per-day budget checks?
