# _loop: shared loop-engineering resources

This directory is **not a skill**. It has no `SKILL.md` and is not listed in
`skill-index.json`, so the skill router never loads it directly. It holds the
versioned Maker and Checker prompt templates that skill-level loops reuse, so the
Maker-Checker pattern is defined once and shared.

Consumers today:

- `auto-research` (Proposal 11, E2) uses `checker.md` to score each iteration
  independently of the Maker.
- `build-team` (Proposal 11, E6, not yet built) will reuse both templates.

The underscore prefix marks this as an internal resource, not a user-facing
capability. See `docs/loop-status-schema.md` for the status-file contract these
loops write, and `docs/proposals/11-autonomy-personalization-layer.md` for the
design.

## Files

| File | Role |
|------|------|
| `maker.md` | The producer prompt: makes one bounded change per iteration. |
| `checker.md` | The independent verifier prompt: scores adversarially, returns a structured verdict. |

## Why Maker and Checker are separate

A single agent grading its own work has a self-justification bias: it tends to
rate what it just produced as good. Splitting the roles, and giving the Checker
an adversarial brief (find faults, do not confirm), makes a passing verdict
actually mean something. The Checker runs on a cheaper model tier (Haiku) so the
verification pass is fast and inexpensive.
