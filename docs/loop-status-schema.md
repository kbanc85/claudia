# Loop status-file schema (Proposal 11, E1/B1 + E1/B4)

Every Maker-Checker loop in Claudia, whether it runs in-session (a skill) or
headless (a daemon job), writes one status file as its human-readable,
machine-parseable control plane. This document defines that file's shape and the
exit-condition standard every loop must declare up front.

The Python helper `claudia_memory.loops.status` (`write_status` / `read_status`)
writes and reads this format atomically. Skill-level loops write the same format
with the Write tool, using a temp-then-rename discipline.

## Format

A status file is Markdown with a YAML frontmatter block. Frontmatter carries the
structured control fields; the body carries the human narrative.

```markdown
---
loop_id: iterate-board-update-20260613
iteration: 4
verified: false
score: 7.2
budget_remaining: 16
last_input: draft v3 (board update for Q2)
maker_proposal: tightened the lede to a single sentence
checker_verdict: lede is stronger, but the ask is still buried in paragraph 3
next_action: surface the ask in the opening line, then re-score
updated_at: 2026-06-13T14:32:00Z
---

# Loop status: iterate-board-update

Iteration 4 was reverted: the Checker scored it 7.2, below the running best of
7.6. The Maker's self-score (8.1) and the Checker's score (7.2) diverged past
threshold, so this iteration is logged as contested and the Checker's verdict
governs.
```

## Frontmatter fields

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `loop_id` | string | yes | Stable identifier for this loop run. |
| `iteration` | int | yes | Current iteration number (0 = baseline). |
| `verified` | bool | yes | Did the Checker pass this iteration's output? |
| `score` | float \| null | when scored | The Checker's score for the current best. |
| `budget_remaining` | int \| null | yes | Iterations (or units) left before the loop must stop. |
| `last_input` | string | yes | What the loop is operating on right now. |
| `maker_proposal` | string | yes | The one change the Maker proposed this iteration. |
| `checker_verdict` | string | yes | The Checker's independent verdict, in one or two sentences. |
| `next_action` | string | yes | What happens next, or `none` if the loop is done. |
| `updated_at` | string (ISO 8601) | yes | When this status was last written. |

Daemon jobs reuse the same fields. For a deterministic job (no LLM Checker),
`checker_verdict` records which invariants were asserted and `verified` is the
conjunction of those invariants. See Proposal 11 Decision D2.

## Body

Free-form Markdown. One short narrative paragraph is enough: what happened this
iteration and why. The body is for a human skimming the file; the frontmatter is
for code reading it. Never put control state only in the body.

## Exit-condition standard (E1/B4)

Every loop must declare all four bounds before it starts. A loop with no exit is
not allowed (see `claudia-principles.md`: bounded autonomy).

| Bound | What it caps | Example |
|-------|-------------|---------|
| Success criterion | When "done" is reached early | Checker score >= target for 1 iteration |
| Max iterations | Hard ceiling on loop count | 20 (default for `auto-research`) |
| Budget | Token or wall-clock spend | stop at N model calls |
| Plateau | No improvement for K iterations | no gain for 5 in a row |

`auto-research` already implements all four (max iterations, plateau, user
interrupt, and a baseline-score gate). New loops adopt the same set. A loop
records its remaining headroom in `budget_remaining` each iteration so a reader
can see how close it is to stopping.

## Where status files live

| Loop kind | Path |
|-----------|------|
| `auto-research` run | `~/.claudia/auto-research/<task-id>/research_status.md` |
| `build-team` proposal | `<workspace>/team_status.md` |
| Daemon job | `~/.claudia/loops/<job>_status.md` |

## Atomicity

Writes must be crash-safe: an interrupted write never leaves a partially-written
file at the canonical path. The Python helper guarantees this with a same-dir
temp file plus `os.replace`. Skill-level writers achieve the same by writing to
a sibling temp path and renaming, never editing the canonical file in place.
