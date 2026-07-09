# Proposal 12: Ambient Memory Hardening

**Status**: P1, P2, P3 COMPLETE. P1 shipped in v1.65.0; P2 and P3 built on the `feat/v1.66-trustworthy-ea` branch (unreleased) · **Constraint**: strictly local-first (SQLite + Python daemon + Claude Code hooks); harden what exists, do not re-architect · **Batch**: Memory intelligence (follows Proposals 08/09/10)

## Implementation status

| Phase | Sub-tranche | Status | Notes |
|-------|-------------|--------|-------|
| P1 | Deterministic conversation to memory capture | **Shipped v1.65.0** | `SessionStart` disk-scan + `SessionEnd` fast-path enqueue; daemon `process_sessions` job; `services/audn.py` (AUDN write); `template-v2/.claude/hooks/session-enqueue.py`. Daemon is the sole writer; hooks never touch SQLite. |
| P2 | Lifecycle transitions | **Shipped v1.65.0 (uncredited)** | `run_lifecycle_transitions()` (active to cooling to archived) runs as Phase 1b of `run_full_consolidation`. Shipped inside v1.65.0's consolidation but not listed in that changelog entry; credited retroactively in the Unreleased changelog. |
| P2 | Commitment resolver | **Complete** | `resolve_commitments()` archives `expired` (deadline past the grace window, unaccessed) and `stale` (no deadline, old, unreferenced, low importance) commitments. Archive-never-delete (D5); `metadata.resolution`/`resolved_at` provenance; sacred and invalidated rows untouched. Config knobs `commitment_grace_days`/`commitment_stale_days`/`commitment_stale_importance_ceiling`/`commitment_resolver_enabled`. Commits `3d10343` (resolver + tests), `a6d4bc1` (nightly wiring). |
| P3 | #67 class fix | **Complete** | Briefing commitment count previously excluded only invalidated rows, so resolver-archived commitments still inflated it. Fixed via the shared `_top_commitments` helper (excludes archived and invalidated). Commit `2e9d95e`. |
| P3 | Salience-ranked surfacing | **Complete** | Briefing shows a ranked top-3 (soonest deadline, then importance) with due dates, plus one demoted summary line disclosing the auto-archive batch with a restore hint (D6 + locked decision 4). Top prediction gated by importance (`prediction_surface_threshold=0.6`). Commit `752da54`. |
| P3 | Honest degradation disclosure | **Complete** | When Ollama is unreachable the briefing's first line says memory intelligence is degraded (recall works; extraction and ambient capture paused). Warm, timeout-free, fail-open. Commit `e433761`. |

**Out of scope for this slice** (deferred): LLM-based fulfillment detection of commitments. The deterministic `expired`/`stale` paths plus P1's AUDN-driven invalidation already cover the conversational "this is done" case.

## TL;DR

Three research streams (a read of Claudia's actual code, the Claude Code hooks docs, and a survey of 2024-2026 agent-memory methods) converged on one conclusion: **this is a wiring problem, not an architecture problem.** Claudia already had roughly 70% of the machinery. The conversation that produces memories never reached the database on its own, lifecycle state never advanced, and the session brief counted raw instead of ranking. This proposal fixed those three, in order of leverage:

1. **Close the conversation to memory loop** (P1, keystone, shipped v1.65.0).
2. **Lifecycle transitions + commitment resolution** (P2). Decay already worked on importance; nothing ever moved a commitment out of `active` or a memory into `archived`. That is why the brief showed ~198 commitments.
3. **Salience-ranked surfacing** (P3). The brief is injected at session start; make it show the 3 to 5 things that matter, and be honest when the model behind it is down.

## The core finding: what exists vs what was net-new

The tables and engines already existed; the deterministic trigger that fills them, the transitions that age them out, and the ranking that surfaces them did not. P2 and P3 added exactly those, reusing the existing `metadata` JSON column and `lifecycle_tier`/`archived_at`/`invalidated_at` fields. No schema migration.

## Decisions (locked 2026-06-15, honored by this build)

- **D5. Lifecycle and commitment resolution archive, never hard-delete.** Archived rows stay queryable; they just leave the active set. The resolver sets `lifecycle_tier='archived'` and never issues a DELETE.
- **D6. Surfacing ranks and filters, never dumps counts.** The brief returns a top-N, not "N active."
- **Locked decision 3. Gentle thresholds, tunable via config.** No LUFY-style percentage purge. Defaults: 14-day grace, 60-day stale age, 0.5 importance ceiling.
- **Locked decision 4. Commitment resolution is auto-archive (reversible), never auto-delete; surface the batch at session start as "I archived these N, correct me."** Implemented as the briefing's demoted summary line with a `restore` hint.

## Acceptance (met)

1. A seeded expired commitment leaves the active set automatically; the row survives, queryable, with `resolution` provenance.
2. The briefing shows at most 3 ranked commitments plus honest summary/disclosure lines; never a bare "N active" lead.
3. Invalidated or archived commitments can never reappear in a briefing (#67 class killed by test).
4. With Ollama stopped, the briefing says so explicitly.
5. Full daemon suite green (851 passed); no schema migration; no template or hook changes; live DB untouched.

## Notes on the build

- The commitment resolver counts rows with `SELECT changes()` (the idiom used by `_surge_approaching_deadlines`) rather than reading a cursor's `rowcount`: this codebase's `db.execute()` returns `None` when not fetching, so the `rowcount` idiom would always report 0.
- Salience/#67 logic lives in pure helpers (`_top_commitments`, `_render_commitment_lines`, `_top_prediction`) that take an explicit `db` handle, so they are tested in full isolation against a temp database. `_build_briefing` itself is not exercised end-to-end in tests because it reaches other subsystems' module-level database handles, matching the existing `test_briefing.py` convention.

*P1 design and data-flow detail live in the maintainer's plan doc (`docs/plans/2026-06-15-ambient-memory-hardening.md`) and the v1.65.0 changelog entry.*
