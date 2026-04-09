# Phase 0: Fork, security baseline, and test harness

**Status**: [~] In progress (Tasks 0.1 and 0.2 done, 0.3-0.5 remain)
**Duration estimate**: 5 days
**Critical path**: Yes
**Can parallelise with**: Nothing (everything else depends on this)
**Depends on**: Nothing — this is the starting point

## Objective
Clean fork with no user-facing "hermes" references, known security baseline, and test infrastructure ready for all subsequent phases.

## Tasks

- [x] **0.1 Clone and create repo** _(completed 2026-04-09)_
  - Files touched: `.git/`, `.gitmodules`, `landingpage/`, `website/`, `datagen-config-examples/`, `acp_adapter/`, `acp_registry/`, `tinker-atropos/`
  - Steps:
    - [x] Created empty private repo `kbanc85/claudia-autonomous` via `gh repo create`.
    - [x] Cloned `NousResearch/hermes-agent` at tag `v2026.4.3` (commit `abf1e98f6253f6984479fe03d1098173a9b065a7`) into a temp directory.
    - [x] `rm -rf .git && git init -b main`
    - [x] Removed submodule dirs and `.gitmodules` (`mini-swe-agent/` was not present at v0.7.0 — only `tinker-atropos/` existed as a submodule entry).
    - [x] Removed unneeded dirs: `landingpage/`, `website/`, `datagen-config-examples/`, `acp_adapter/`, `acp_registry/`.
    - [x] `git remote add origin git@github.com:kbanc85/claudia-autonomous.git`
    - [x] Initial commit `ceaa495` with full MIT attribution note.
    - [x] `git push -u origin main` (1166 files).
    - [x] Attached `autonomous/fork/` as submodule in this claudia repo.
  - Success criteria: ✅ Clean directory, git initialised, no submodules. Fork repo now has 1166 tracked files on `main`, pinned commit `ceaa495`.
  - **Discrepancies from roadmap noted for Phase 0.2**:
    - `mini-swe-agent/` submodule does not exist at v0.7.0 (only `mini_swe_runner.py` file remains — decide in 0.2 whether to delete).
    - Release notes `RELEASE_v0.4.0.md`, `RELEASE_v0.5.0.md`, `RELEASE_v0.6.0.md`, `RELEASE_v0.7.0.md` also exist beyond the v0.2/v0.3 files listed in the rebrand map. Add them to the remove list in Phase 0.2.

- [x] **0.2 Build curated rebrand map and apply** _(completed 2026-04-09, submodule commits `f5cd89f` through `7bede11`)_
  - Files touched: 638+ files across the fork in 6 checkpoints
  - Executed as 6 rollback-point checkpoints (C1-C6) in the outer tracking hub:
    - **C1 (submodule `f5cd89f`)** — scope deletions: 6 RELEASE files + mini_swe_runner.py + entire `environments/` dir (Atropos RL) + Atropos skill + 5 dependent tests = 59 files. Match count: 9482 → 7987.
    - **C2 (submodule `ee2d6ef`)** — 8 structural renames + import fixes (hermes_cli, hermes_constants, hermes_state, hermes_time, hermes script, setup-hermes.sh, tests/hermes_cli/, test_hermes_state.py). 321 sed touches. Match count: 7987 → 6498.
    - **C3 (submodule `4fadb16`)** — config dir + env vars + lowercase compounds: `hermes_agent` → `claudia_autonomous`, then broad `hermes_` → `claudia_`, then `HERMES_` → `CLAUDIA_`, then `.hermes` → `.claudia`. 355 files. Match count: 6498 → 3235.
    - **C4 (submodule `de4c048`)** — package/display/CLI/file renames: `hermes-agent` → `claudia-autonomous`, `Hermes Agent` → `Claudia`, 7 CLI command refs, `Hermes`/`hermes`/`HERMES` broad sweeps, 4 more file renames (scripts/hermes-gateway, packaging/homebrew/hermes-agent.rb, skills/autonomous-ai-agents/hermes-agent/, openclaw_to_hermes.py). 453 files. Match count: **3235 → 0**. Success criterion met at this checkpoint.
    - **C5 (submodule `7bede11`)** — Nous attribution cleanup: `NousResearch/` → `kbanc85/` (GitHub URLs), `nousresearch.com` → `example.com` (placeholder), `Nous Research` → `Kamil Banc` (excluding LICENSE + sanitizer). 70 files.
    - **C6 (this tracking hub update)** — final verification + mark Task 0.2 complete.
  - **Discrepancies resolved**: All RELEASE files removed including v0.4-v0.7 not in original roadmap. `mini_swe_runner.py` deleted. `environments/` directory correctly identified as Atropos RL infrastructure (not execution backends — those live at `tools/environments/`) and deleted wholesale.
  - **Scope decisions made (documented in C1 commit and rebrand-map.notes.md)**:
    - Deleted `environments/` entirely (Atropos RL, not execution backends)
    - Deleted `optional-skills/mlops/hermes-atropos-environments/` (skill that documented the deleted directory)
    - Kept `tools/environments/` (actual execution backends: local, docker, modal, ssh, daytona, singularity)
    - Honcho plugin default workspace renamed `"hermes"` → `"claudia"` (semantic change; Phase 6 migration needs to offer import of legacy workspace)
  - **Deliberate Nous Research residuals (5 matches, all legitimate)**:
    - `LICENSE` — MIT copyright attribution (required by license terms)
    - `agent/anthropic_adapter.py:1266` — sanitizer code (Phase 1.2 persona work will decide its fate)
    - `.github/ISSUE_TEMPLATE/config.yml`, `setup_help.yml`, `CONTRIBUTING.md` — Discord link labels matching `discord.gg/NousResearch` URLs (Phase 1.5 docs rewrite will decide to keep or replace)
  - **Verification**:
    ```bash
    grep -ri "hermes" --include="*.py" --include="*.yaml" --include="*.md" --include="*.sh"   # zero results
    find . -iname "*hermes*"                                                                    # zero files
    git ls-files | xargs grep -ic "hermes"                                                      # zero matches
    ```
  - **Reference**: See `../data/rebrand-map.csv`, `../data/rebrand-map.notes.md`, and session log entries 2026-04-09 C1-C6 for full detail.

- [ ] **0.3 Security baseline audit**
  - Files touched: `docs/decisions/security-baseline.md` (new)
  - Audit unmodified fork (before changing any logic):
    - [ ] Review `docs/user-guide/security` content
    - [ ] Test command allowlists in `tools/approval.py`
    - [ ] Verify DM pairing in gateway
    - [ ] Check container isolation in Docker backend
    - [ ] Test cron path guards (path-traversal fix from 2026-04-05)
    - [ ] Review secret exfiltration blocking (new in v0.7.0)
  - Success criteria: Written security baseline document covering each attack surface.

- [ ] **0.4 Define test harness**
  - Files touched: `tests/`, `.github/workflows/test.yml`
  - Create three test tiers:
    - [ ] **Unit**: Memory operations, tool registry, config loading. Use pytest with markers.
    - [ ] **Integration**: Skill execution across 3+ models (use `@pytest.mark.frontier`, `@pytest.mark.local`).
    - [ ] **E2E**: cron → gateway → memory pipeline against local Ollama.
    - [ ] Port applicable tests from Claudia's 756-test suite (memory ops, entity CRUD, hybrid search).
  - Success criteria: `pytest tests/ -q` passes. CI workflow runs on push.

- [ ] **0.5 Boot test**
  - Files touched: None (verification only)
  - Steps:
    - [ ] `./setup-claudia.sh`
    - [ ] `claudia --help` shows "Claudia" branding
    - [ ] `/model` command works
    - [ ] First-run wizard references Claudia
  - Success criteria: Agent boots, displays Claudia branding, accepts a basic conversation.

## Deliverable
Clean fork that boots with Claudia branding, security baseline documented, test harness ready.

## Rollback
Re-clone original Hermes. Phase 0 is idempotent — every artefact can be regenerated from the source repo.

## Decisions made this phase
- **Fork vs wrapper** — see [`../decisions/2026-04-09-fork-vs-wrapper.md`](../decisions/2026-04-09-fork-vs-wrapper.md). Accepted 2026-04-09. Fork `NousResearch/hermes-agent` at `abf1e98` (v0.7.0) into `kbanc85/claudia-autonomous`, strip upstream history, attach as submodule at `autonomous/fork/`. The outcome was already baked into roadmap constraints; the ADR records the reasoning, the alternatives that were ruled out (wrap, build-from-scratch), and the deferred question of whether to rebase to v0.8.0.

## Session handoff
_Last updated: 2026-04-09 by Phase 0.2 C6 final checkpoint_
- **Last completed**: **Tasks 0.1 and 0.2 both done.**
  - 0.1: Fork repo created, stripped, cleaned, pushed. Submodule attached at `autonomous/fork/`.
  - 0.2: Full 6-checkpoint rebrand sweep. Submodule pointer: `ceaa495` → `7bede11` across 6 intermediate commits. Match count 9482 → 0 hermes refs. Success criterion `grep -ri "hermes"` returns zero. Zero files with hermes in path.
  - First ADR written: `../decisions/2026-04-09-fork-vs-wrapper.md`.
  - Scope decisions documented in C1 commit and rebrand-map.notes.md.
- **Next up**:
  1. **Task 0.3** — security baseline audit against the modified fork. Write `docs/decisions/security-baseline.md` inside the submodule. Attack surfaces to audit: command allowlists in `tools/approval.py`, DM pairing in gateway, Docker backend container isolation, cron path guards, secret exfiltration blocking. Note: the roadmap said audit the UNMODIFIED fork, but we've already rebranded. The rebrand is mechanical string substitution — security posture is unchanged. Document accordingly.
  2. **Task 0.4** — test harness (unit/integration/E2E tiers + CI workflow). Note: the 5 Atropos-dependent tests were deleted in C1, so the remaining test suite is what Task 0.4 should target.
  3. **Task 0.5** — boot test with the renamed CLI.
- **Blockers**: None. 0.3-0.5 can begin immediately.
- **Known follow-ups from Phase 0.2** (for later phases to handle):
  - `agent/anthropic_adapter.py:1266` sanitizer still replaces `"Nous Research"` → `"Anthropic"`. This is Hermes-specific legacy that Phase 1.2 (SOUL.md persona injection) should decide on.
  - `scripts/release.py:101` has a dead committer mapping entry (`"claudia@example.com": "NousResearch"`). Phase 1.5 release-script rewrite will clean up.
  - Discord URLs still point at `discord.gg/NousResearch`. Phase 1.5 docs rewrite will decide whether to keep, replace, or remove.
  - Honcho plugin defaults changed from `"hermes"` → `"claudia"`. Phase 6 migration should offer to import legacy `"hermes"` Honcho workspace for existing Hermes users.
  - v0.8.0 rebase decision still deferred (see Fork vs Wrapper ADR open questions).
- **Notes**:
  - The submodule is pinned to `ceaa495`. Any changes to the fork during Phase 0.2+ require committing inside `autonomous/fork/`, pushing to origin, then running `git add autonomous/fork && git commit` in the outer claudia repo to advance the pointer.
  - Hermes v0.8.0 (tag `v2026.4.8`) released 2026-04-08. Deliberately not rebased — see the "Open questions" section of the Fork vs Wrapper ADR.
