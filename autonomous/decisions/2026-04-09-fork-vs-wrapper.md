# Decision: Fork Hermes Agent rather than wrap it

**Date**: 2026-04-09
**Status**: accepted
**Phase**: Phase 0 — Fork, security baseline, and test harness
**Author**: Claude Opus 4.6 (executing Phase 0.1), ratifying the choice already baked into the Claudia Autonomous roadmap v3 constraints.

## Context

Claudia Autonomous needs a standalone 24/7 agent runtime with gateway adapters, a cron scheduler, skill execution, memory, and subagent delegation. Building any of this from scratch would duplicate roughly a year of upstream engineering and lose access to v0.7.0's pluggable memory provider interface (PR #4623 from NousResearch/hermes-agent), which makes Claudia's hybrid memory a drop-in plugin rather than a rewrite.

Three integration strategies were plausible:
- **Fork**: take Hermes Agent v0.7.0, strip upstream git history, make it our own product.
- **Wrap**: depend on stock Hermes as a dependency and layer Claudia's persona, skills, and memory on top via the plugin system.
- **Build from scratch**: write a new runtime in Python using pieces of Hermes as reference.

The decision here is technically pre-committed by the roadmap's constraints list ("Permanent fork, own repo (`kbanc85/claudia-autonomous`), no upstream contribution"), but it is still worth writing down so future maintainers understand *why*, not just *what*.

## Options considered

### Option A: Permanent fork, own repo (CHOSEN)

- **Pros**:
  - Full control over every file. No upstream veto on rebranding, persona injection, default behaviour changes, or skill scope.
  - Can remove unneeded subsystems immediately (`landingpage/`, `website/`, `datagen-config-examples/`, `acp_adapter/`, `acp_registry/`, `tinker-atropos/`).
  - Rebrand is a one-time find-and-replace, not a per-release rebase.
  - Ships as a single `npx get-claudia --agent` install flow with no hidden dependency on a separately-maintained upstream CLI.
  - Can diverge the prompt budget, default model, and agent loop tuning for Claudia's chief-of-staff role without upstream friction.
  - MIT license permits unlimited modification with attribution. Attribution preserved via original `LICENSE` file at repo root plus `THIRD-PARTY.md` added in Phase 1 Task 1.5.
- **Cons**:
  - Responsibility for security fixes: must watch upstream releases and cherry-pick relevant patches (tracked in Phase 8 ongoing workstream + `docs/decisions/upstream-cherry-picks.md`).
  - Any upstream feature improvement becomes a manual port.
  - Two separate codebases to keep calibrated to each other (Claudia v1 and Claudia Autonomous share identity and memory design but not runtime).

### Option B: Wrap stock Hermes as a dependency

- **Pros**:
  - Zero divergence: every Hermes bugfix and feature lands automatically on `pip install --upgrade hermes-agent`.
  - Smaller surface area to maintain; only the Claudia layer is ours.
  - Easier to contribute generic improvements back upstream.
- **Cons**:
  - Branding becomes impossible. Every boot prints "Hermes", every CLI command is `hermes ...`, every log message, error, docs link, and help output references the upstream project.
  - Default behaviour changes (e.g. prompt budget tuning, persona injection, approval gate rules) require upstream PRs or fragile monkey-patching.
  - User install flow is two-step: install Hermes, then install Claudia's overlay. Breaks the promise of `npx get-claudia --agent`.
  - Hermes could drop or rename any of the extension points Claudia depends on in any minor release.
  - Marketing and positioning problem: "Claudia runs on Hermes" does not land with the target audience, who want a Claudia product, not a Hermes flavour.

### Option C: Build from scratch, borrow ideas

- **Pros**:
  - Cleanest architecture, shaped entirely around Claudia's chief-of-staff use case.
  - Nothing to rebrand, no upstream to track.
  - Can choose language/runtime independently (Python, Rust, Go, etc.).
- **Cons**:
  - Loses roughly a year of upstream engineering: gateway adapters for six messaging platforms, cron scheduler with job storage, six terminal execution backends (local/Docker/SSH/Daytona/Singularity/Modal), credential pool rotation, Camofox anti-detection browser, 90-iteration ReAct budget, subagent delegation, trajectory compression, gateway hardening, secret exfiltration blocking, DM pairing, command allowlists, v0.7.0 memory provider interface.
  - Pushes the beta ship date out by an estimated 4-6 months.
  - Duplicates effort on problems Hermes has already solved well enough.
  - No obvious technical advantage over forking, since the Hermes code is MIT-licensed and the roadmap's v0.7.0 memory provider interface is exactly the extension point Claudia needs.

## Decision

**Fork permanently**, in our own repo at `kbanc85/claudia-autonomous`, with upstream git history stripped on initial commit.

The v0.7.0 memory provider interface is the decisive factor. It turns what used to be a wholesale rewrite of the memory subsystem into a plugin registration. Option B (wrap) loses this advantage because we can't control branding and defaults. Option C loses it because we lose everything else Hermes has built.

Forking the specific commit `abf1e98f6253f6984479fe03d1098173a9b065a7` (tagged `v2026.4.3`, released as "Hermes Agent v0.7.0" on 2026-04-03) pins our fork point to a known-good, feature-documented state that matches the roadmap's "what you're forking" file list. Later versions (v0.8.0 / `v2026.4.8`, released 2026-04-08) may be cherry-picked individually via Phase 8's upstream-monitoring workstream, not rebased as a whole.

## Consequences

### Positive
- Full naming, branding, default-behaviour, and persona control from day one.
- Ships as a single CLI install (`npx get-claudia --agent`).
- Phase 2A can implement Claudia's hybrid memory as a plugin, not a rewrite.
- MIT license obligations are preserved cleanly: original `LICENSE` file stays at repo root, Hermes attribution added to `THIRD-PARTY.md` in Phase 1 Task 1.5.

### Negative
- Phase 8 now carries an ongoing upstream-watch responsibility. Cherry-pick decisions must be tracked per-release.
- Two Claudia codebases (v1 in this repo, Autonomous in the fork) must stay calibrated on identity and memory semantics even though they share no runtime code.
- Each Hermes security fix we don't pick up is a latent risk. Mitigation: an explicit quarterly upstream review in Phase 8's "Quarterly reviews" workstream, and issue-level watching for security-labelled commits.

### Neutral / things we now have to do
- Maintain `autonomous/data/rebrand-map.csv` and the Phase 0.2 find-and-replace sweep.
- Keep the `autonomous/fork/` submodule pinned and advance it deliberately via `git submodule update`.
- Write `docs/decisions/upstream-cherry-picks.md` inside the submodule when the first cherry-pick happens in Phase 8.

## Open questions

- **Should we rebase to v0.8.0 now or stay at v0.7.0?** Deferred. The roadmap's file calibrations (line counts, method layouts, known sub-systems) are all pegged to v0.7.0. A rebase to v0.8.0 would change at least `run_agent.py`, `agent/prompt_builder.py`, and the gateway modules, potentially invalidating parts of the phase plans. Revisit after Phase 2A if there is a specific v0.8.0 fix we need.
- **What cherry-pick cadence is sustainable?** Deferred to Phase 8 first quarterly review. Candidates: monthly, quarterly, or reactive (only on security-labelled commits).
- **How do we communicate the fork to the Hermes community?** Deferred. Not in scope until Phase 7 beta release. The roadmap constraints explicitly rule out "upstream contribution", so there is no PR relationship to manage, but there may be a courtesy announcement on release.

## References

- **Roadmap source of truth**: `../roadmap/claudia-autonomous-roadmap-v3.md`, "Constraints decided" section and "Critical discovery: Hermes v0.7.0 changes the game" section.
- **Hermes v0.7.0 release**: https://github.com/NousResearch/hermes-agent/releases/tag/v2026.4.3 (tag `v2026.4.3`, commit `abf1e98`, released 2026-04-03)
- **Pluggable memory provider PR**: PR #4623 in NousResearch/hermes-agent (shipped in v0.7.0).
- **Hermes license**: MIT, copyright 2025 Nous Research. Preserved verbatim at `autonomous/fork/LICENSE` (after submodule attach).
- **Later upstream release**: Hermes Agent v0.8.0 (tag `v2026.4.8`, released 2026-04-08). Deferred to later cherry-pick consideration.
