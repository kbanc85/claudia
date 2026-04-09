# Phase 0: Fork, security baseline, and test harness

**Status**: [~] In progress (Task 0.1 done, 0.2-0.5 remain)
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

- [ ] **0.2 Build curated rebrand map**
  - Files touched: `rebrand-map.csv` (and downstream every file with a "hermes" string)
  - Source: `../data/rebrand-map.csv` already has the known rows pre-seeded from the roadmap.
  - Steps:
    - [ ] Run `grep -rn "hermes" --include="*.py" --include="*.yaml" --include="*.md" --include="*.sh" --include="*.toml" --include="*.json" --include="*.nix" --include="*.txt" .` to build the complete list
    - [ ] Apply with targeted `sed` per file, not global
    - [ ] Review each change
    - [ ] Do not rebrand: `hermetic`, local `hermes` variables inside functions, binary files, lock files (regenerate instead)
  - Success criteria: `grep -ri "hermes" --include="*.py" --include="*.yaml" --include="*.md" --include="*.sh"` returns zero results in user-facing files. Internal comments may retain historical references with a `# Originally from Hermes Agent (MIT)` note.
  - Budget: Full day.

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
_Last updated: 2026-04-09 by Phase 0.1 execution session_
- **Last completed**: **Task 0.1 done.** `kbanc85/claudia-autonomous` exists with `main` branch at commit `ceaa495` (1166 files, forked from Hermes v0.7.0 at `abf1e98`, MIT). Submodule attached at `autonomous/fork/` in this claudia repo. First ADR written: `../decisions/2026-04-09-fork-vs-wrapper.md`.
- **Next up**:
  1. **Task 0.2** — build the curated rebrand map. The seed CSV at `../data/rebrand-map.csv` already has the known rows; now run the full `grep -rn "hermes" ...` sweep inside `autonomous/fork/` and add anything new. Also add `RELEASE_v0.4.0.md` through `v0.7.0.md` to the remove list (discovered during 0.1 clone). Decide whether to delete `mini_swe_runner.py` (the orphaned file remaining after the missing `mini-swe-agent/` submodule). Apply targeted `sed` per file, review every change, do not use global substitution.
  2. **Task 0.3** — security baseline audit against the unmodified fork. Write `docs/decisions/security-baseline.md` inside the submodule covering each attack surface.
  3. **Task 0.4** — test harness (unit/integration/E2E tiers + CI workflow).
  4. **Task 0.5** — boot test with renamed CLI.
- **Blockers**: None. All of 0.2-0.5 can begin immediately.
- **Notes**:
  - The submodule is pinned to `ceaa495`. Any changes to the fork during Phase 0.2+ require committing inside `autonomous/fork/`, pushing to origin, then running `git add autonomous/fork && git commit` in the outer claudia repo to advance the pointer.
  - Hermes v0.8.0 (tag `v2026.4.8`) released 2026-04-08. Deliberately not rebased — see the "Open questions" section of the Fork vs Wrapper ADR.
