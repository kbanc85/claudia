# program.md template

Copy this when starting an auto-research run. Fill the placeholders. Show it to the user for confirmation before starting the loop.

```markdown
# Program for: <one-line description of the task>

## Goal

(1-3 sentences. What is the end state Claudia is iterating toward? Be specific. "Make this board update better" is not specific. "Make this board update fit in 250 words while preserving the three big asks" is specific.)

## Artifact

- Original location: `<path to user's file, if applicable>`
- Working copy: `~/.claudia/auto-research/<task-id>/artifact.md`
- Size: <word count of original>

## Evaluator (rubric)

Each iteration is scored 0-10 on each dimension. Total score = sum. Higher is better.

| Dimension | Weight | What scores high (10) | What scores low (0) |
|-----------|--------|----------------------|---------------------|
| (dim 1) | (e.g., 0.4) | (concrete description) | (concrete description) |
| (dim 2) | (e.g., 0.3) | ... | ... |
| (dim 3) | (e.g., 0.3) | ... | ... |

(Weights sum to 1.0. Total possible: 10. Round to one decimal.)

## Hard constraints (do NOT violate)

These are non-negotiable. If an iteration violates any of these, it is automatically reverted regardless of score.

- Length cap: stay under N words.
- Must contain: <specific phrase, fact, or section that has to survive>
- Must NOT contain: <forbidden phrasings, names, claims, em dashes>
- Tone: <specific tone constraint, e.g., "matches user's prior emails to <recipient> in references/sample-emails.md">
- (etc.)

## Budget

- Max iterations: 20 (default; user may override up to 50)
- Plateau stop: 5 consecutive iterations with no improvement
- Wall clock: <none in v1; future versions support time-based budget>

## Out of scope

(What Claudia might be tempted to do that isn't the goal. Examples:)
- Don't change the underlying message; only the phrasing.
- Don't add new facts; work with what's already there.
- Don't reframe the whole structure; iterate within the current outline.

## Notes from the user

(Anything else the user wants Claudia to know. Examples: "I tried three versions yesterday and they all felt stiff," "the recipient is a board member with a finance background," "I want this to feel like me, not like AI.")

## Reference materials

(Files in `references/` of the workspace that Claudia should consult during iteration. Examples:)
- `sample-emails.md` — three prior emails to this recipient, for tone calibration
- `style-guide.md` — house style notes
```

## How Claudia uses this

1. After being invoked for auto-research, Claudia reads the user's artifact and what they said about it.
2. Drafts an initial program.md based on the user's words, filling in best guesses for the rubric.
3. **Shows the draft to the user.** Asks: "Does this rubric capture what 'better' means? Anything to add to hard constraints?"
4. Adjusts based on feedback. Iterates on the program if needed (sometimes the rubric itself needs refinement before the loop starts).
5. **Only after the user explicitly says the program is right**, kicks off iteration 1.

The program.md is the human's one leverage point on the loop. Claudia respects it strictly.
