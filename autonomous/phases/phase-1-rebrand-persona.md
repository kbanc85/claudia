# Phase 1: Visual rebrand and persona injection

**Status**: [~] In progress (1.2, 1.5, 1.6 substantially done; 1.1 assets deferred, 1.3 file rename deferred to Phase 6)
**Duration estimate**: 4-5 days
**Critical path**: Yes
**Can parallelise with**: Nothing
**Depends on**: Phase 0 complete (clean fork, boot test passing)

## Objective
100% Claudia visuals, commands, and personality before touching logic.

## Tasks

- [ ] **1.1 Replace assets**
  - Files touched: `assets/` (all), `claudia_cli/` (ASCII art, branding strings)
  - Steps:
    - [ ] Replace banner, logos, TUI colours with Claudia equivalents
    - [ ] Update any ASCII art or terminal branding strings in `claudia_cli/`
  - Source assets: claudia repo `assets/` (banner GIF, logos)

- [ ] **1.2 Inject Claudia persona into SOUL.md**
  - Files touched: `~/.claudia/SOUL.md` (new), `agent/prompt_builder.py` (modify `DEFAULT_AGENT_IDENTITY`), loader `load_soul_md()`
  - Source content: consolidate `template-v2/` identity, rules, and behavioural files
  - SOUL.md must include:
    - [ ] Chief-of-staff identity and personality
    - [ ] Approval gates (no external actions without user confirmation)
    - [ ] Source attribution requirements
    - [ ] Proactive behaviour directives (commitment detection, risk surfacing, relationship awareness)
    - [ ] Judgment application rules
    - [ ] Communication style (direct, strategic, shows her work)
  - Also: modify `DEFAULT_AGENT_IDENTITY` in `agent/prompt_builder.py` for the SOUL.md-absent fallback.

- [ ] **1.3 Stub migration command**
  - Files touched: `claudia_cli/commands/migrate.py` (renamed from claw), setup wizard detection logic
  - Steps:
    - [ ] Rename `hermes claw migrate` to `claudia migrate`
    - [ ] Keep command structure, stub implementation (full build in Phase 6)
    - [ ] Setup wizard's `~/.openclaw/` detection stays intact (extended in Phase 6 for `~/.hermes/`)

- [ ] **1.4 Update config defaults**
  - Files touched: `cli-config.yaml.example`
  - Changes:
    - [ ] Default model: frontier model via OpenRouter
    - [ ] Default persona: Claudia
    - [ ] Branding strings

- [ ] **1.5 Update all docs**
  - Files touched: `README.md`, `CONTRIBUTING.md`, `docs/` (all), `THIRD-PARTY.md` (new)
  - Steps:
    - [ ] Rewrite `README.md` to reference Claudia only
    - [ ] Rewrite `CONTRIBUTING.md`
    - [ ] Rewrite `docs/` contents
    - [ ] Add `THIRD-PARTY.md` with MIT attribution to Hermes Agent

- [ ] **1.6 Preserve model selector**
  - Files touched: `claudia_cli/commands/model.py`, provider adapters
  - Verify `/model` works across:
    - [ ] OpenRouter
    - [ ] Anthropic direct
    - [ ] OpenAI
    - [ ] Ollama
    - [ ] Custom endpoints
  - **Critical**: This is the escape from Claude Code lock-in. Must not regress.

## Deliverable
Bootable agent branded 100% as Claudia, model switching works, still uses default Hermes memory/skills (memory gets replaced in Phase 2A).

## Rollback
Revert branding PR. Personality reverts to default. Safe because no logic has been touched yet.

## Decisions made this phase
- _none yet_

## Session handoff
_Last updated: 2026-04-09 by Phase 1 partial execution (submodule commit 98578fc)_
- **Last completed**:
  - **Task 1.2 (DONE)**: `claudia_cli/default_soul.py` expanded from 10-line generic template to full ~1500-token chief-of-staff persona adapted from Claudia v1's template-v2/CLAUDE.md + claudia-principles.md + trust-north-star.md. `agent/prompt_builder.py` `DEFAULT_AGENT_IDENTITY` expanded from 10-line generic to condensed ~500-token fallback identity covering safety, communication, trust, autonomy, proactive behaviour.
  - **Task 1.3 (EFFECTIVELY DONE)**: CLI string `hermes claw` → `claudia migrate` already applied by Phase 0.2 C4. File-level rename `claw.py` → `migrate.py` deferred to Phase 6.
  - **Task 1.4 (VERIFIED)**: `cli-config.yaml.example` already has `anthropic/claude-opus-4.6` as default model, full provider list intact, Claudia-branded header. No changes needed.
  - **Task 1.5 (PARTIAL)**: `README.md` completely rewritten for chief-of-staff positioning (removed Hermes self-improving AI framing, Atropos research row, broken badge URLs). `THIRD-PARTY.md` created with full MIT attribution to Hermes Agent v0.7.0 + list of inherited components + permanent fork / cherry-pick policy + dependency sources.
  - **Task 1.6 (VERIFIED in Phase 0.5)**: `cmd_model` defined, registered, works across all providers.
- **Still to do**:
  - **Task 1.1 assets (deferred)**: Cannot generate binary PNG/GIF/ICO files from inside the agent runtime. Flagged as a human follow-up. `assets/banner.png` is still the Hermes banner; `claudia_cli/banner.py` ASCII output is already Claudia-branded via Phase 0.2.
  - **Task 1.5 remainder**: Full `CONTRIBUTING.md` rewrite (660 lines). The mechanical Phase 0.2 rebrand caught the obvious strings but the content structure still reflects Hermes's contribution model. A targeted fix for the top of the file would be highest-leverage. Deferred to a follow-up session.
- **Blockers**: None for continued Phase 1 progress.
- **Next session should**: Either finish CONTRIBUTING.md rewrite, or begin Phase 2A.1 (study v0.7.0 memory provider interface) which unblocks Phase 2A.2 implementation work.
