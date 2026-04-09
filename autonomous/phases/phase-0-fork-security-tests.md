# Phase 0: Fork, security baseline, and test harness

**Status**: [ ] Not started
**Duration estimate**: 5 days
**Critical path**: Yes
**Can parallelise with**: Nothing (everything else depends on this)
**Depends on**: Nothing — this is the starting point

## Objective
Clean fork with no user-facing "hermes" references, known security baseline, and test infrastructure ready for all subsequent phases.

## Tasks

- [ ] **0.1 Clone and create repo**
  - Files touched: `.git/`, `.gitmodules`, `landingpage/`, `website/`, `datagen-config-examples/`, `acp_adapter/`, `acp_registry/`, `mini-swe-agent/`, `tinker-atropos/`
  - Steps:
    - [ ] `git clone https://github.com/NousResearch/hermes-agent.git claudia-autonomous`
    - [ ] `cd claudia-autonomous && rm -rf .git && git init`
    - [ ] `git remote add origin https://github.com/kbanc85/claudia-autonomous.git`
    - [ ] Remove submodules: `rm -rf mini-swe-agent/ tinker-atropos/ .gitmodules`
    - [ ] Remove unneeded dirs: `rm -rf landingpage/ website/ datagen-config-examples/ acp_adapter/ acp_registry/`
  - Success criteria: Clean directory, git initialised, no submodules.
  - Prerequisite: `kbanc85/claudia-autonomous` GitHub repo must exist (create empty before running).

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
- _none yet_ — see `../decisions/` for ADRs. Expected early decision: **Fork vs wrapper** (outcome already baked into roadmap constraints: permanent fork, own repo).

## Session handoff
_Last updated: 2026-04-09 by repo-creation session_
- **Last completed**: `kbanc85/claudia-autonomous` GitHub repo created (private, empty). URL: https://github.com/kbanc85/claudia-autonomous. Tracking hub scaffold in place from 2026-04-08.
- **Next up**:
  1. Convert `autonomous/fork/` placeholder → real submodule using the commands in `../fork/README.md`.
  2. Begin Task 0.1 inside the submodule: clone Hermes, strip history, `git init`, set remote to `kbanc85/claudia-autonomous`, remove submodules and unneeded directories, initial push.
- **Blockers**: None. Phase 0.1 is unblocked and ready to execute.
- **Notes**: When `fork/` becomes a submodule, an entry gets added to `.gitmodules` in this claudia repo automatically. See `../fork/README.md` for the exact commands.
