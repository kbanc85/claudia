# Self-repair brief (Proposal 11, E3)

When a Maker-Checker loop keeps failing, the problem may not be the artifact: it
may be the harness (the rubric, the Maker brief, or the Checker brief). The
self-repair sub-loop diagnoses that, proposes a fix, and proves the fix on the
exact input that failed before adopting it. It is itself bounded, and it never
auto-edits shipped briefs or the user's live files.

This brief is shared. `auto-research` uses it today; future loops reuse it.

## B1: When self-repair triggers

Enter the self-repair sub-loop when any of these holds during a loop:

- The Checker returns `verified: false` for **3 iterations in a row**.
- The Checker's `score` **regresses** across 3 consecutive iterations (each lower
  than the last).
- An iteration raises an **exception** the loop cannot attribute to the artifact
  (for example, the Checker returns malformed output twice).

These are signals that hill-climbing has stalled for a structural reason, not
that one more edit will help.

## B2: The repair sub-loop

Self-repair is itself a small Maker-Checker loop, run on the harness instead of
the artifact:

1. **Diagnose (Maker).** Read the last few status rows and the Checker's `issues`.
   State, in one or two sentences, the single most likely harness cause: an
   ambiguous rubric dimension, a Maker brief that permits bundled changes, a
   Checker brief that scores the wrong thing, a missing hard constraint.
2. **Propose one fix (Maker).** One concrete edit to exactly one harness piece
   (the rubric in `program.md`, `maker.md`, or `checker.md`). Not a rewrite. One
   lever.
3. **Validate on the exact failing input (Checker).** Re-run the failing
   iteration's input through the loop **with the proposed fix applied in a scratch
   copy**, and dispatch the `loop-checker`. The fix is adopted only if that exact
   previously-failing case now reaches `verified: true` (or scores materially
   higher) and no previously-passing regression fixture breaks.
4. **Adopt or discard.** If it passes, apply the fix (see B4 for where).
   If it does not, discard it and either try one more diagnosis (within the B4
   bound) or stop and hand the loop back to the user with the diagnosis.

The non-negotiable rule is step 3: a fix is never adopted on a hunch. It must be
proven on the input that exposed the problem.

## B3: Regression capture

Every confirmed repair leaves a regression behind so the same failure cannot
silently return:

- Save the failing input plus the verdict it should now produce as a fixture
  under `~/.claudia/loops/regressions/<loop-id>/<short-slug>.md` (a status file in
  the standard schema, with the expected `verified`/`score`).
- On future runs of that loop, replay the loop-id's regression fixtures through
  the Checker first. If any regression breaks, the loop refuses to start and
  reports which fix regressed.

Shipped-skill regressions (ones that should travel with the template, not just
the user's machine) are proposed to the user for inclusion as in-repo test
fixtures instead.

## B4: Bound and safety

Self-repair obeys the same bounded-autonomy rules as every loop:

- **Bounded.** At most **2 repair attempts** per loop run. After that, stop and
  hand back to the user with the diagnosis. Self-repair never loops forever.
- **Workspace-only for artifacts.** The repair sub-loop validates in a scratch
  copy and never touches the user's original file.
- **Never auto-edit shipped briefs.** A fix to `maker.md` or `checker.md` (files
  that ship in the template) is **proposed as a diff for the user to approve**,
  never written silently. A fix to a run-local `program.md` rubric may be applied
  within the run, since that rubric is the user's own per-run governance file.
- **Logged.** Each repair attempt appends to the loop's status file: what was
  diagnosed, what was changed, and whether the exact failing input passed after
  the change.

## What self-repair is not

- It is not a license to rewrite the harness whenever a loop is hard. It triggers
  only on the B1 signals, and it changes one thing at a time.
- It is not autonomous prompt-editing of shipped files. Those changes always end
  at a human approval gate.
