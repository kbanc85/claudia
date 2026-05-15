---
name: auto-research
description: Iteratively improve a local artifact (draft, document, page) by running a hill-climbing loop. The user names the artifact, the evaluator, and the budget. Claudia edits the artifact, scores it, keeps it if better or reverts if worse, repeats. Use when user says "iterate on this", "loop on this until it's better", "run experiments on this draft", "auto-research this", "make this better and don't stop until it's good". Workspace-scoped, never touches live files, no external actions during the loop.
effort-level: high
invocation: contextual
---

# Auto-Research

A hill-climber for any local artifact with a rubric. Inspired by [Karpathy's autoresearch pattern](https://github.com/karpathy/autoresearch), adapted to Claudia's safety principles.

## Mental model

Three primitives, one governance file:

1. **The artifact** — what gets iterated on (a draft email, a brief, a wiki page, a one-pager). Lives in the workspace, never touches the user's original file during the loop.
2. **The evaluator** — a scalar rubric Claudia scores against. Plain English. Must produce a number for the original artifact before the loop starts.
3. **The budget** — iteration count (default 20). Loop stops when budget is exhausted or score plateaus.
4. **The program** (governance file) — what the user wants, what's off-limits, what counts as "better." Claudia helps the user write this if they don't volunteer it.

Loop: read program + artifact + results history → propose one specific change → implement → score → if better, ratchet (commit); if worse, revert (git reset). Report each iteration as a one-line update. Repeat until budget is hit.

## When to invoke this skill

User explicitly asks:
- "Iterate on this until it's [adjective]"
- "Loop on this draft"
- "Run experiments on this"
- "Auto-research this"
- "Hill-climb this against [criterion]"
- "Make this better, don't stop until it's good"

User implicitly invokes when:
- They've shared an artifact and a quality bar in the same message
- They've tried 2-3 manual revisions of the same draft in the same session and are still unsatisfied

## When NOT to invoke

Refuse to start the loop if:

1. **External-action artifact.** The artifact is, or directly drives, an external action (an email about to be sent, a Slack message in the compose window, a calendar invite). Auto-research on these is too easy to misuse. Hand-iterate with the user instead.
2. **No clear evaluator.** The user can't articulate what "better" means even after one pass of helping. Without an evaluator, the loop hill-climbs the wrong hill.
3. **Sensitive content.** Medical, deeply personal, legal-defensible artifacts. Iteration risks introducing fabricated detail that looks plausible. Decline and explain.
4. **The artifact is already good.** If you score the baseline and it's above the user's stated threshold, tell them and offer one quick polish instead of N iterations.
5. **Bold structural change is the actual need.** Karpathy's own limitation: RLHF-trained iteration is "cagy and scared." Iterations tend toward safe edits, not bold reframings. If the user wants a fundamentally different angle, iteration will not get them there. Suggest a fresh draft instead.

## Workspace layout

Each run gets its own workspace at `~/.claudia/auto-research/<task-id>/`:

```
~/.claudia/auto-research/<task-id>/
├── program.md           the brief (user-authored with Claudia's help)
├── artifact.md          (or .txt, the working copy that gets edited)
├── original.md          immutable copy of the input, for reference and diff
├── results.tsv          one row per iteration: timestamp, score, kept/reverted, change-summary
├── best.md              symlink (or copy on Windows) to the highest-scoring version
└── iterations/
    ├── 01/artifact.md
    ├── 02/artifact.md
    └── ...
```

The task-id is the slugified user phrase plus a short timestamp: `iterate-board-update-20260515-1430`.

**Critical:** The loop edits `artifact.md` inside the workspace. The user's original file (wherever it lives in their file system) is **NEVER** modified during the loop. At the end, Claudia asks the user where to put `best.md`; the user decides.

## program.md template

```markdown
# Program for: <one-line description of the task>

## Goal

(1-3 sentences. What is the end state Claudia is iterating toward?)

## Evaluator (rubric)

Each iteration is scored 0-10 on each dimension. Total score = sum. Higher is better.

| Dimension | What scores high | What scores low |
|-----------|------------------|-----------------|
| (dimension 1) | (what makes a 10) | (what makes a 0) |
| (dimension 2) | ... | ... |
| (dimension 3) | ... | ... |

## Hard constraints (do NOT violate)

- Length cap: stay under N words.
- Must contain: specific phrase or fact.
- Must NOT contain: forbidden phrasings, names, claims.
- Tone: must match the user's prior emails to <recipient> (paste examples in references/).
- (etc.)

## Budget

- Max iterations: 20 (default)
- OR stop when score plateaus (no improvement for 5 iterations in a row)

## Out of scope

- (anything Claudia might be tempted to do that isn't the goal)
```

Claudia's first action when invoked: read the artifact, draft a program.md based on what the user said, present it for confirmation, then start the loop.

## The loop (Claudia's internal workflow)

For each iteration N:

1. **Read the state.** Read `program.md`, `artifact.md`, last 3 rows of `results.tsv`.
2. **Propose one change.** One specific edit, justified in one sentence. Not a rewrite. Not a refactor. One change.
3. **Implement.** Apply the edit to `artifact.md`. Save.
4. **Score.** Score the new `artifact.md` against the rubric in `program.md`. Sum the dimensions. Round to one decimal.
5. **Decide.** If new score > best score so far: ratchet. Copy `artifact.md` to `iterations/NN/`, update `best.md` to point at the new winner, append a row to `results.tsv` marked `kept`. If new score <= best: revert. Copy `iterations/(best_iter)/artifact.md` back to `artifact.md`, append a row marked `reverted`.
6. **Report.** One line to the user: `iter N: score 7.4 (kept), change: tightened lede to one sentence`.
7. **Check stop conditions.** If budget exhausted: stop. If score plateaued (no improvement for 5 iterations): stop. Otherwise: next iteration.

## Safety rules (mandatory, follow without exception)

1. **Workspace-only edits.** The loop never writes to a file outside `~/.claudia/auto-research/<task-id>/`. The user's original file at `/Users/.../wherever.md` is untouched until the user explicitly approves the final hand-off.
2. **No external actions during the loop.** No sending, no posting, no scheduling, no calling tools that affect the outside world. The loop is a closed system.
3. **Baseline-score gate.** Before iteration 1, score the original artifact and write it to `results.tsv` as `iter 0: score X (baseline)`. If the rubric cannot produce a number for the original, the loop does not start; Claudia tells the user the rubric needs to be more specific.
4. **Bounded budget.** Default 20 iterations. User can set higher (50 max) or lower. Plateau detection (no improvement for 5 in a row) stops early. The loop is not allowed to be "open-ended" the way Karpathy's autoresearch is; Claudia's safety principles require an end.
5. **Per-iteration revertability.** Each iteration is a git commit inside the workspace. Workspace is a fresh git repo (`git init` on start, `git commit -am` per iteration). At any point: `git log` shows the history, `git checkout` rolls back to any prior iteration.
6. **User interrupt at any time.** If the user says "stop", "pause", "show me what you have", or otherwise interrupts: stop the loop immediately. The workspace persists. The best version so far is in `best.md`. The user can resume by saying "continue" (loop picks up from the current best).
7. **Honest about the conservatism ceiling.** Karpathy named this: RLHF-trained iteration tends toward safe, local-optimum edits. If the loop plateaus and the user clearly wanted bold reframing, say so: "I've plateaued at score 7.2. The iterations have been incremental polishing. If you wanted a fundamentally different angle, this loop won't get there; a fresh draft might."

## Hand-off at the end of the loop

When the loop stops (budget, plateau, or user interrupt):

1. Read `best.md`.
2. Read `results.tsv` and summarize: started at score X, ended at score Y, took N iterations, here are the three biggest jumps (which iterations and what they changed).
3. Show `best.md` content to the user.
4. Ask: "Want me to put this back at the original location (`<path>`), save it to a new location, or just leave it in the workspace?"
5. **Only after explicit user confirmation**, copy `best.md` to the destination they name. The user's original file is touched here for the first time and only here.
6. Optionally save the run as a memory: "auto-research run for <task>, ratcheted from X to Y, key changes: ...". Useful if the user wants to learn from past runs.

## What this skill is NOT

- **Not a draft generator.** It improves an artifact that already exists. If the user wants a draft from scratch, use `draft-reply`, `follow-up-draft`, `summarize-doc`, or just write it conversationally first.
- **Not for bold reframing.** It's a hill-climber. It finds local optima. For "completely rethink this from a different angle", iteration is the wrong tool.
- **Not autonomous in the Karpathy "NEVER STOP" sense.** Claudia's safety principles require bounded loops and user-in-loop hand-off. The loop runs without per-iteration approval, but it stops, and external actions stay with the user.

## Examples of good rubrics

For "iterate on this board update":

| Dimension | 10 | 0 |
|-----------|----|----|
| Lede strength | Opens with the one number or decision that matters | Opens with throat-clearing or backstory |
| Brevity | Reads in under 90 seconds | Goes over 5 minutes |
| Ask clarity | The ask, if any, is one sentence | Asks are buried or multi-step |
| Tone | Matches my prior board updates (samples in references/) | Sounds AI-generated |

For "iterate on this proposal":

| Dimension | 10 | 0 |
|-----------|----|----|
| Problem framing | Names the client's actual pain in their words | Generic problem framing |
| Differentiation | One sentence on why I'm the right fit | No clear differentiator |
| Scope clarity | Phases are explicit, no scope creep | Vague deliverables |
| Price anchoring | Price appears after value, not before | Price leads or is hidden |

Specific. Numerical. Tied to the user's actual standards.

## Examples of bad rubrics

"Make it better" — no signal.
"More professional" — directionally OK but no scoring criteria.
"Like Bezos would write" — aspirational but Claudia can't score "Bezos-ness" reliably.

When the user gives a bad rubric, help them turn it into a good one before starting the loop.

## See also

- `wiki` for iterating wiki pages specifically (compress, sharpen, restructure)
- `draft-reply`, `follow-up-draft` for one-shot draft generation
- `summarize-doc` for one-pass summarization

## Open questions for future versions

- Shell-command evaluators (run `node test.js my-draft.md`, take the number it prints) are deferred. Today, Claudia scores against the rubric in `program.md` directly.
- Token-spend budget and wall-clock budget are deferred. Today, only iteration count is supported.
- Parallel branches (try 3 different changes in parallel, keep the winner) are deferred. Today, sequential only.
- Wiki-page iteration as a first-class use case (apply auto-research to a wiki page until it's < N words while citing all sources) is deferred. The skill supports this in principle today, but a worked example doesn't ship until the wiki has earned its keep.
