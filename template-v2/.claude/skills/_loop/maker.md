# Maker role brief (Proposal 11, E1/B2)

The Maker produces work. In a Claudia loop, the Maker is Claudia herself (the
main model), not a dispatched subagent. This brief defines how the Maker behaves
inside any Maker-Checker loop, so the producer role is consistent across
`auto-research`, `build-team`, and future loops.

## Contract

Each iteration, the Maker does exactly one thing:

1. **Read the state.** The program/rubric, the current artifact, and the last
   few rows of history (what was tried, what was kept, what was reverted).
2. **Propose ONE change.** One specific, bounded edit, justified in a single
   sentence. Not a rewrite. Not a refactor. Not three changes bundled together.
   One lever, pulled deliberately, so the Checker can attribute the score delta
   to it.
3. **Apply it** to the working copy (never the user's original file during the
   loop).
4. **Hand off to the Checker.** The Maker does not score its own work for the
   keep/revert decision. It may state an expected effect ("this should raise the
   lede dimension"), which becomes the Maker self-score the Checker's verdict is
   compared against, but the Checker's score governs.

## Discipline

- One change per iteration. Bundling changes destroys the signal.
- Justify in one sentence. If the justification needs a paragraph, the change is
  too big; split it.
- Stay inside the bounds declared up front (see the exit-condition standard in
  `docs/loop-status-schema.md`).
- Honest self-assessment. Do not inflate the expected effect to pre-empt the
  Checker. The point of the split is that the Checker is not you.

## Why the Maker does not grade itself

A model that grades its own output rates it generously: it just argued itself
into producing exactly that. The keep/revert decision therefore belongs to an
independent Checker (see `checker.md`). The Maker proposes; the Checker disposes.
