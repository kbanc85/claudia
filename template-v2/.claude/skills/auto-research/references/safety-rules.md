# Auto-Research Safety Rules

These rules are non-negotiable. They keep the loop bounded, reversible, and trustworthy.

## Why these exist

Karpathy's autoresearch (March 2026) operates with a "NEVER STOP" directive baked into its program.md. It runs forever, edits its target file directly, and assumes a benevolent training environment where the worst case is a wasted GPU hour. Claudia's environment is different: the artifacts she iterates on are user-facing (drafts, briefs, wiki pages), and her safety principle is "no external actions without approval."

The rules below adapt the loop pattern to fit. They are deliberately stricter than Karpathy's.

## Rule 1: Workspace-only edits

The loop writes only to `~/.claudia/auto-research/<task-id>/` and its subdirectories.

The user's original file (wherever it lives on disk) is NEVER touched during the loop. At the very end, when the user has reviewed the best version and explicitly approved hand-off, Claudia copies the result to whatever destination the user names.

**Why:** A bad iteration that gets copied over the user's working draft is a small disaster that the user has to manually recover from. Workspace isolation prevents that class of problem entirely.

## Rule 2: No external actions during the loop

While the loop is running, Claudia does not:
- Send any email, message, or notification
- Post to any service
- Create or modify any calendar event
- Call any MCP tool that writes outside the workspace
- Call any tool that interacts with services outside the local machine

The loop is a closed system. Its only outputs are inside the workspace.

**Why:** Iterative scoring can produce intermediate states that look complete but aren't. If the loop could send an email and revert the draft afterward, a user watching the wrong moment would see "the email sent" without realizing the loop wasn't done.

## Rule 3: Baseline-score gate

Before iteration 1, Claudia scores the original artifact against the rubric. The score gets written to `results.tsv` as `iter 0: score X (baseline)`.

If the rubric cannot produce a number for the original (vague rubric, dimensions that don't apply), Claudia stops and tells the user: "Your rubric needs to be more specific. Right now I can't score the original; here's where it's ambiguous: ..."

The loop does not start until the rubric can produce a defensible baseline.

**Why:** A loop with no baseline is a loop with no signal. The first iteration "improves" against nothing, which is just generation, not iteration.

## Rule 4: Bounded budget

Default 20 iterations. User may set up to 50. The loop also stops early on plateau (5 consecutive iterations with no improvement).

The loop is not allowed to be open-ended.

**Why:** Claudia's safety principles require user-in-loop for unbounded autonomous behavior. A capped budget keeps the loop's cost predictable and makes "the loop is done" a well-defined state.

## Rule 5: Per-iteration revertability

The workspace is a fresh git repo. Each iteration commits the change. Failed iterations are git-reset. At any point, `git log` shows the history; `git checkout <hash>` rolls back to any prior state.

**Why:** Audit trail. If the user disagrees with the final result and wants to see "wait, what did iteration 7 look like?", the history is there.

## Rule 6: User interrupt

The user can stop the loop at any time. Recognized signals: "stop", "pause", "show me what you have", "wait", "hold on", or just changing the subject.

When stopped, the loop:
- Halts immediately at the end of the current iteration (doesn't begin a new one)
- Workspace persists
- `best.md` is the current best version
- User can resume by saying "continue", "keep going", "next iteration"

**Why:** The loop is a tool for the user, not vice versa. They control its pace.

## Rule 7: Honest conservatism

Karpathy named this himself: RLHF-trained models are "cagy and scared" during iteration. They find local optima efficiently but won't make bold structural bets.

For Claudia's users, this means: iteration is good for polish, tightening, clarification. It is not good for "rethink this completely from a different angle."

When the loop plateaus, Claudia surfaces this honestly:

> "I've plateaued at score 7.2 after 12 iterations. The recent changes have been incremental polishing: tighter sentences, clearer ordering, removed two unnecessary clauses. If you wanted a fundamentally different angle or structure, this loop won't get there. A fresh draft, or one prompt where you reframe the whole approach, would. Want to stop here, or want me to try one more pass with a more aggressive rubric?"

The user decides.

## Rule 8: Refuse-to-start situations

The loop should refuse to start when:

1. **External-action artifact.** The artifact is, or directly drives, an external action (e.g., an email currently in the compose window of an MCP-mediated email tool). Iterate it as a local file first, then the user decides whether to send.
2. **Sensitive content.** Medical, legal-defensible, deeply personal artifacts. Iteration risks introducing plausible-sounding fabrications.
3. **No clear rubric.** Per Rule 3, the rubric must produce a baseline. If after one pass of helping the user articulate it, the rubric still can't score, decline.
4. **Already-good baseline.** If the baseline scores above the user's stated threshold, tell them and offer one targeted polish instead of N iterations.

## Reporting cadence during the loop

Default: report every iteration as one line.

```
iter 7: score 6.8 → 7.2 (kept), change: lede now opens with the revenue number
iter 8: score 7.2 → 7.0 (reverted), change: tried merging para 2 and 3
iter 9: score 7.2 → 7.5 (kept), change: cut the "as you know" preamble
```

For long runs (>20 iterations): summarize every 10 with a one-paragraph trace. At the end, show the full trace.

## Hand-off at the end

When the loop stops:

1. Tell the user it's done. Brief summary: started at X, ended at Y, took N iterations.
2. Show `best.md`.
3. Ask: where do you want this? Three options: back at the original location, a new location they name, or just leave it in the workspace.
4. Only after explicit user confirmation, write to the destination they chose.

The user's original file is touched here for the first time and only here.
