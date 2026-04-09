# Phase 1: Visual rebrand and persona injection

**Status**: [ ] Not started
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
_Last updated: 2026-04-08 by scaffold setup_
- **Last completed**: nothing — Phase 1 not yet started.
- **Next up**: Task 1.1 (replace assets) after Phase 0 boot test passes.
- **Blockers**: Phase 0 must complete first.
- **Notes**: SOUL.md consolidation in Task 1.2 is the most labour-intensive step. Budget 1-2 days for it alone.
