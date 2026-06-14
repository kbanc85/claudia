# Proposal 11: Autonomy & Personalization Layer (Loop Engineering + Team Builder)

**Status**: COMPLETE. E1-E4 shipped in v1.62.0; E6-E7 in v1.63.0; E5 shipped status-only (unreleased) 2026-06-13 · **Effort**: delivered across v1.62.0, v1.63.0, and one unreleased branch · **Batch**: Autonomy & Personalization (batch master; all epics landed)

## Implementation status

| Epic | Sub-tranche | Status | Notes |
|------|-------------|--------|-------|
| E1 | B1 status-file schema | **Shipped** | `docs/loop-status-schema.md` (commit `eed7a79`). |
| E1 | B2 Maker/Checker templates | **Shipped** | `template-v2/.claude/skills/_loop/{maker,checker,README}.md` (`eed7a79`). |
| E1 | B3 atomic status helper | **Shipped** | `memory-daemon/claudia_memory/loops/status.py` + 6 tests (commit `b1d2d02`). |
| E1 | B4 exit-condition standard | **Shipped** | Section in `docs/loop-status-schema.md` (`eed7a79`). |
| E2 | B1 Checker subagent role | **Shipped** | `template-v2/.claude/agents/loop-checker.md`; `auto-research/SKILL.md` loop steps 4-5 (`eed7a79`). |
| E2 | B2 emit status file | **Shipped** | `auto-research` writes `research_status.md` each iteration (`eed7a79`). |
| E2 | B3 disagreement handling | **Shipped** | `contested` flag on Maker/Checker score divergence (`eed7a79`). |
| E2 | B4 docs + worked example | **Partial** | `SKILL.md` updated; the worked dry-run transcript is deferred to the E2 split (proposal 12). |
| E3 | B1-B4 self-repair sub-loop | **Shipped** | `template-v2/.claude/skills/_loop/repair.md` + `auto-research` stall trigger (commit `bd3b9e5`). Trigger, repair-and-validate-on-original-input, regression capture, 2-attempt cap, human gate for shipped-brief edits. |
| E4 | B1-B2 meditate harness review | **Shipped** | `meditate/SKILL.md` reads loop status (Step 1), reviews harness performance (Step 2b), routes harness proposals through the Checker before writing (Step 5). Commit `bd3b9e5`. |
| E6 | B1-B4 `/build-team` skill | **Shipped** | `template-v2/.claude/skills/build-team/SKILL.md` (commit `56f10d7`). Profile read + Maker proposal, loop-checker validation (bounded 2 revisions, 5-role hard cap), `team_status.md`, approval gate, apply with `.bak` rollback. |
| E7 | B1-B2 proactive team review | **Shipped** | `hire-agent.md` "Proactive team review" section (commit `077d0e6`). Detects team drift (archetype shift, new task class, roster drift) and routes to `/build-team` for the validated, reversible change. |
| E5 | B1-B4 daemon wrap (status-only) | **Shipped** | Go/no-go resolved 2026-06-13: status-only. `claudia_memory/loops/job_wrapper.py` wraps all 7 scheduled jobs to write `~/.claudia/loops/<job>_status.md` + deterministic invariants (backups assert file exists and is non-empty); flags failures but never halts. B4: `health.py` surfaces last verdicts. B3: existing misfire/coalesce bounds unchanged. 14 new tests; 803 daemon tests pass. (commit `f53d3e9`) |

## What this is

A backlog, not a design doc. It takes the "Autonomy & Personalization Layer" PRD (Loop Engineering Foundation + Dynamic Agent Team Builder) and turns it into deduped, sized, sequenced epics. Each epic carries a sub-tranche table whose Notes column is the acceptance criteria. Phase 1 (E1 + E2) is now built; the rest is proposed. Read the Decisions and Dedup map first: they are where the PRD's hand-waving gets resolved against what already ships.

## TL;DR

The PRD bundles two initiatives. About 60% of the "foundation" already exists in some form, and three of the personalization building blocks already ship as proactive skills. The genuine net-new work is small and well-scoped:

1. An **independent Checker** for skill-level loops (today the `auto-research` maker grades its own work).
2. A **standardized status file** (Markdown body + YAML frontmatter) plus an atomic-write helper, so every loop has one human-readable, machine-parseable control plane.
3. A **self-repair** sub-loop that validates fixes on the exact failing input and captures a regression.
4. A user-invoked **`/build-team`** skill that proposes a whole tailored team at once, sitting on top of the existing `hire-agent`, `capability-suggester`, and `structure-generator` skills.

Everything else in the PRD is either already present (and just needs documenting as a standard) or is a thin extension of an existing surface.

## Decisions (resolving the PRD's open questions)

These are driven defaults. Overrule any of them on review.

**D1. Status file format: Markdown body + YAML frontmatter.** The frontmatter carries the structured control fields (`loop_id`, `last_input`, `maker_proposal`, `checker_verdict`, `verified`, `next_action`, `iteration`, `score`, `budget_remaining`, `updated_at`). The body carries the human narrative. This satisfies the PRD's "human-readable control plane" requirement and the daemon's need to parse verdicts, and it matches the repo's existing skill format (YAML frontmatter + Markdown). Resolves PRD open question "Markdown vs JSON" with "both, in one file."

**D2. Loops split by surface, and so do their Checkers.** This is the load-bearing decision.

| Surface | Examples | Maker | Checker | New runtime? |
|---------|----------|-------|---------|--------------|
| Skill-level (in-session) | `auto-research`, `build-team`, `meditate` | Claude | Haiku subagent via the Task tool, separate adversarial prompt | None. Markdown convention only. |
| Daemon-level (headless) | the 7 APScheduler jobs | Python job fn | Deterministic invariant checks (rule-based), not an LLM | Small Python helper module `loops/` |

The PRD assumes an independent LLM Checker everywhere. A scheduled daemon job has no agent context and no token budget, so its "cheaper checker" is a set of deterministic invariants (for example: consolidation must not drop entity count by more than X%; no NULL embeddings written; backup file exists and is non-empty). When a daemon invariant fails, the job flags the run and surfaces it at the next interactive session (morning-brief), rather than calling an LLM inline.

**D3. Checker = always a different prompt; model is a cheaper tier, not a different vendor.** Skill-level Checkers run on Haiku (the existing Tier-1), with an adversarial prompt instructed to find faults, not confirm. Resolves PRD open question "different model or just different prompt" with "different prompt always, cheaper tier for the model."

**D4. `/build-team` suggests, then applies on approval, with rollback.** Mirrors `structure-generator` (writes only after approval) and the Safety First principle. Rollback = `.bak` siblings written on apply (same mechanism the installer upgrade flow already uses). Resolves PRD open question 1.

**D5. Minimal seed team per archetype, then dynamic growth.** `/build-team` proposes a small archetype-appropriate default, not a sprawling org. Growth comes later from proactive suggestion (E7), which reuses `capability-suggester` / `hire-agent` detection. Resolves PRD open question "minimal vs fully dynamic."

**D6. Role vocabulary expands conservatively.** Start from the 6 agents that ship today (`document-archivist`, `document-processor`, `schedule-analyst`, `research-scout`, `canvas-generator`, plus the dispatcher). Add a new role only when a repeated task pattern justifies it (`hire-agent` already detects this). No speculative role catalog. Resolves PRD open question 3.

## Dedup map (what exists vs what is net-new)

| PRD wants | Already ships | Net-new work |
|-----------|---------------|--------------|
| Maker-Checker pattern | `auto-research` is a maker that self-scores, with keep/revert and plateau detection | Independent Checker subagent + adversarial Checker prompt (E1/B2, E2/B1) |
| Explicit status files | `auto-research`: `results.tsv` + `program.md`; daemon: `health.py` `build_status_report` and `/status` | Standardized `*_status.md` schema + atomic-write helper (E1/B1, E1/B3) |
| Clear exit conditions | `auto-research`: budget + plateau + user interrupt + baseline gate | Document as a reusable standard; add bounds to daemon jobs that lack them (E1/B4, E5/B3) |
| Self-repair loop | nothing | Entire epic E3 |
| Wrapped daemon jobs | `scheduler.py` runs 7 jobs with no verification layer | Job wrapper + per-job invariants + health surfacing (E5) |
| `/build-team` | `hire-agent` (suggest agents from patterns), `capability-suggester` (suggest commands/workflows), `structure-generator` (scaffold per archetype), `agent-dispatcher` (routing), 6 agent defs | User-invoked whole-team proposal with Maker-Checker + approval/rollback (E6) |
| Proactive team updates | `capability-suggester` and `hire-agent` are already proactive | Profile-change trigger + team-diff suggestion (E7) |
| `/meditate` feeding self-improvement | `meditate` already extracts judgment rules to `judgment.yaml` | Feed loop outcomes back through the Checker before writing (E4) |
| Observability of maker->checker cycles | daemon `/status`, `memory.system_health` | The per-loop status files are the observability; optional structured loop log (folded into E1/E5) |
| Two-tier integration | Tier-1 Haiku agents, Tier-2 Sonnet `research-scout` | Checker is a Tier-1 role; `build-team` uses both tiers (E2, E6) |

## Backlog & sequencing

| Epic | Title | Phase | Depends on | Size | Status |
|------|-------|-------|-----------|------|--------|
| E1 | Loop harness foundation | 1 | none | M (3-5d) | **Shipped** |
| E2 | Maker-Checker on `auto-research` | 1 | E1 | S-M (2-3d) | **Shipped** |
| E3 | Self-repair loop | 2 | E1, E2 | M (3-5d) | **Shipped** |
| E4 | `/meditate` -> self-improvement feed | 2 | E1 | S (1-2d) | **Shipped** |
| E5 | Wrap daemon scheduled jobs | 3 | E1 | L (1-2w) | **Shipped (status-only)** |
| E6 | `/build-team` skill | 4 | E1 | M-L (1w) | **Shipped** |
| E7 | Proactive team-update suggestions | 4 | E6 | S-M (2-4d) | **Shipped** |

Phase 1 proves the whole pattern end-to-end on a surface that already exists (`auto-research`), so it ships value with the least blast radius. Phase 3 (daemon) is deliberately late: it is the most invasive and least reversible, and nothing else depends on it.

---

## E1: Loop harness foundation

The shared substrate every other epic builds on. Half convention, half one small Python helper.

| Sub-tranche | Acceptance criteria | Dedup note |
|-------------|--------------------|------------|
| B1: Status-file schema spec | `docs/loop-status-schema.md` exists and defines the required frontmatter fields (D1), the body sections, and one worked example. Referenced by E2/E5/E6. | New. Generalizes `auto-research`'s ad-hoc `results.tsv`. |
| B2: Maker & Checker prompt templates | Versioned templates under `template-v2/.claude/skills/_loop/` (`maker.md`, `checker.md`). The Checker prompt is adversarial (find faults, do not confirm), reasons independently of the Maker, and returns a structured verdict `{verified: bool, issues: [], score}`. | New. This is the core unlock. |
| B3: Atomic status helper (Python) | `memory-daemon/claudia_memory/loops/status.py` with `write_status(path, dict)` (temp file + `os.replace`, crash-safe, Windows-safe) and `read_status(path)` (parses frontmatter). Unit test proves a partial write is never visible. | New. Daemon side only; skills use the Write tool with the same temp-then-rename discipline. |
| B4: Exit-condition standard | A section in `docs/loop-status-schema.md` documenting the four bounds every loop must declare up front: success criterion, max iterations, token/wall budget, plateau. | `auto-research` already implements all four; this documents them as the standard others adopt. |

## E2: Maker-Checker on auto-research

Add the independent Checker to the loop that already exists. Markdown only, no daemon change.

| Sub-tranche | Acceptance criteria | Dedup note |
|-------------|--------------------|------------|
| B1: Checker subagent role | New agent def `template-v2/.claude/agents/loop-checker.md` (Haiku). The `auto-research` skill dispatches it each iteration to score the artifact against `program.md` independently of the Maker's self-score. The keep/revert decision uses the Checker's score. | Extends `auto-research/SKILL.md`; reuses the Tier-1 Task-tool dispatch already described in `CLAUDE.md`. |
| B2: Emit standard status file | Each run writes `research_status.md` (E1/B1 schema) into the workspace, updated atomically per iteration, carrying `last_input`, `maker_proposal`, `checker_verdict`, `verified`, `next_action`. | Replaces the role of `results.tsv` for control state; `results.tsv` may remain as the raw score log. |
| B3: Disagreement handling | When the Maker self-score and the Checker score diverge beyond a threshold, the iteration is logged `contested`, the Checker's verdict governs, and the divergence appears in the end-of-run summary. | New. Prevents "checker theater" by making disagreement visible. |
| B4: Docs + worked example | `auto-research/SKILL.md` updated; a dry-run transcript in this proposal's eventual split (proposal 12). Note explicitly: no daemon change, no new dependency. | Doc. |

## E3: Self-repair loop

Triggered on failure or low confidence. Itself bounded. Never auto-edits shipped templates.

| Sub-tranche | Acceptance criteria | Dedup note |
|-------------|--------------------|------------|
| B1: Failure trigger | Defined triggers: Checker returns `verified:false` N times in a row, score regresses across M iterations, or an exception is raised. | New. |
| B2: Repair sub-loop | On trigger: Maker diagnoses, proposes a harness/prompt fix, Checker validates the fix on the exact failing input, fix is adopted only if it passes. | New. The "validate on the exact failing input" rule is non-negotiable. |
| B3: Regression capture | The failing input plus its expected verdict is saved as a regression fixture (location: `~/.claudia/loops/regressions/`), and replayed on future runs of that loop. | New. |
| B4: Bound + safety | Self-repair has its own max-attempt cap, never writes outside the workspace, and proposes edits to shipped prompts/skills for human approval rather than applying them. | Honors Safety First; mirrors `auto-research`'s workspace-only rule. |

## E4: /meditate -> self-improvement feed

Small. Closes the loop from session reflection back into harness quality.

| Sub-tranche | Acceptance criteria | Dedup note |
|-------------|--------------------|------------|
| B1: Capture loop outcomes | `meditate` reads recent `*_status.md` files plus any `contested`/failed iterations and summarizes harness performance for the session. | Extends `meditate/SKILL.md`. |
| B2: Validate proposed improvements | Proposed judgment-rule or prompt refinements pass through the Checker before being written to `judgment.yaml`. Nothing auto-applied to shipped prompts without approval. | Reuses the existing `meditate` -> `judgment.yaml` path; adds a Checker gate. |

## E5: Wrap daemon scheduled jobs

The reliability layer. Highest blast radius, so it is sequenced last and is status-only before it is behavioral.

| Sub-tranche | Acceptance criteria | Dedup note |
|-------------|--------------------|------------|
| B1: Job-wrapper convention | A decorator/util in `loops/` wraps a job fn: run, validate invariants, write `~/.claudia/loops/<job>_status.md` atomically (E1/B3), and on invariant failure mark `verified:false` and flag (never a silent bad state). | New. Wraps, does not rewrite, the 7 jobs in `daemon/scheduler.py`. |
| B2: Per-job invariant checkers | Each job (`daily_decay`, `pattern_detection`, `full_consolidation`, `daily_backup`, `weekly_backup`, `vault_sync`, `observation_ingest`) gets explicit deterministic invariants. Checker is deterministic, not an LLM (D2). | New. Honest constraint: no independent LLM checker in the daemon. |
| B3: Exit/budget bounds | Any job that could run unbounded gets an explicit cap. Document the `misfire_grace_time` / `coalesce` settings already present. | `scheduler.py` already sets misfire/coalesce; this adds per-job caps where missing. |
| B4: Surface in health | `memory.system_health` and `/status` read the loop status files so the user sees last-run verdicts. Tests. | Extends `health.py` `build_status_report`. |

## E6: /build-team skill

The headline personalization capability. User-invoked, Maker-Checker, approval-gated, reversible.

| Sub-tranche | Acceptance criteria | Dedup note |
|-------------|--------------------|------------|
| B1: Profile read + Maker proposal | New user-invocable skill `template-v2/.claude/skills/build-team/SKILL.md`. Reads `context/me.md` + `judgment.yaml` + recent task patterns, and the Maker proposes a tailored team (roles from the existing 6 + any justified new role) with rationale. | Builds on `structure-generator` (archetype logic) and `hire-agent` (pattern detection). |
| B2: Checker validation | The Checker validates the proposal against the user's stated goals/judgment rules and the "progressive, not overwhelming" principle (flags over-large teams), returning verdict + issues. | Reuses E1/B2 Checker template. |
| B3: Status file + approval gate | Writes `team_status.md` (E1 schema), presents the proposal, and writes nothing to `agents/` or `skills/` without explicit approval. | Honors Safety First. |
| B4: Apply + rollback | On approval, scaffolds agent/skill files (reuse `structure-generator`), writes `.bak` siblings for rollback, and reports what was created. Does not duplicate `agent-dispatcher` routing. | Reuses installer-style `.bak` mechanism. |

## E7: Proactive team-update suggestions

P2. Background detection that the current team has drifted from the user's evolving work.

| Sub-tranche | Acceptance criteria | Dedup note |
|-------------|--------------------|------------|
| B1: Profile-change trigger | `capability-suggester` / `hire-agent` extended to detect a material profile change (archetype shift, new recurring task class) and suggest a team diff. Proactive, low effort-level. | Extends existing proactive skills; no new trigger engine. |
| B2: Diff + approval | Suggests add/remove/modify roles as a diff, with the same approval + rollback flow as E6. | Reuses E6/B3 and E6/B4. |

---

## Testing plan

- **E1**: unit tests for the atomic helper (partial-write invisibility, Windows `os.replace`); a schema-validation test that a written status file round-trips through `read_status`.
- **E2**: an integration scenario where the Maker self-score is inflated and the Checker correctly reverts; assert the `contested` path fires on divergence.
- **E3**: a seeded failing input; assert the repair sub-loop validates on that exact input and a regression fixture is written.
- **E5**: per-job invariant tests (for example, a consolidation that drops entity count beyond threshold is flagged `verified:false`); health surfacing test.
- **E6**: a profile fixture produces a minimal archetype team; the approval gate blocks writes until confirmation; `.bak` siblings exist after apply.

Node installer tests (`node --test test/`) and daemon pytest (`memory-daemon/`) both stay green. New daemon code lands under `loops/` with its own tests.

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Daemon wrap blast radius (E5) | Status-only first, behavioral gating second; feature-flag the wrapper; sequenced last. |
| Token cost of skill-level Checkers | Haiku Tier-1 only; bounded iterations inherited from `auto-research`. |
| Checker theater (rubber-stamp verdicts) | Adversarial Checker prompt; log `contested` divergences; self-repair (E3) maintains the prompt over time. |
| Over-eager team proposals (E6) | Minimal seed default (D5); approval gate; "progressive, not overwhelming" is a Checker criterion. |
| Honesty gap: PRD implies LLM checker everywhere | D2 documents the skill-vs-daemon split; daemon checkers are deterministic and flag for later review. |
| Scope creep back to "build it all at once" | This proposal is a backlog; epics ship independently behind their dependencies. |

## Open questions

- Should a flagged daemon-job run (E5) escalate to an LLM review at the next interactive session (surfaced in morning-brief), or just sit as a flag the user reads? Recommend escalate via morning-brief, no inline LLM.
- Regression fixtures (E3/B3): live under `~/.claudia/loops/regressions/` (per-user, runtime) or as in-repo test fixtures (shared, versioned)? Recommend runtime for user loops, in-repo for shipped-skill regressions.
- Is E5 worth its blast radius at all in v1, or is status-only emission (no behavioral gating) enough to earn the trust the PRD wants? Worth an explicit go/no-go before Phase 3.

## Related

- Builds directly on `auto-research`, `meditate`, `hire-agent`, `capability-suggester`, `structure-generator`, `agent-dispatcher`, and the 6 agent defs in `template-v2/.claude/agents/`.
- Pattern lineage: Karpathy's autoresearch (already cited in `auto-research/SKILL.md`) plus the Maker-Checker framing from the source PRD.
- Each epic E2-E7 can graduate into its own numbered proposal (12-17) at pickup time, keeping this file as the batch master and dedup reference.
