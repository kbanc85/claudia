# Phase 6: Visualiser, installer, and polish

**Status**: [ ] Not started
**Duration estimate**: 5-7 days
**Critical path**: Yes
**Can parallelise with**: Nothing
**Depends on**: Phases 4 and 5 complete (need gateways + proactive behaviour for full first-run experience)

## Objective
Seamless user experience from install to daily operation.

## Tasks

- [ ] **6.1 `/brain` visualiser**
  - Files touched: `~/.claudia/skills/brain/` or similar, local webserver for the view
  - Port Claudia's 3D brain visualiser as a skill that serves a local web page:
    - [ ] Entities as nodes, relationships as edges
    - [ ] Colour-code by relationship health
    - [ ] (Future, not MVP) overlay cron job activity and autonomous task execution

- [ ] **6.2 Installer update**
  - Files touched: `bin/index.js` (from the npm installer package)
  - Update for `npx get-claudia --agent`:
    - [ ] Detect `--agent` flag
    - [ ] Clone/download Claudia Autonomous
    - [ ] Run `setup-claudia.sh`
    - [ ] First-run wizard (model selection, gateway setup, API key entry)
    - [ ] Docker and Nix options

- [ ] **6.3 First-run experience**
  - The setup wizard flow:
    1. [ ] Detect existing installations (`~/.hermes/` and `~/.openclaw/`) and offer migration (see 6.6)
    2. [ ] Ask for OpenRouter API key (or offer local Ollama)
    3. [ ] Select a model
    4. [ ] Optionally configure a messaging gateway
    5. [ ] Create `~/.claudia/` with default SOUL.md
    6. [ ] Boot into a conversation where Claudia introduces herself

- [ ] **6.4 Meeting intelligence tutorial**
  - Files touched: `docs/guides/meeting-intelligence.md` (new)
  - Contents:
    - [ ] Step-by-step setup for Otter, Granola, Fathom, Fireflies
    - [ ] How to configure transcript ingestion
    - [ ] How Claudia processes transcripts via `capture-meeting` skill

- [ ] **6.5 Feedback and bug reporting**
  - Files touched: `claudia_cli/commands/feedback.py`, `claudia_cli/commands/bug.py`
  - Behaviour:
    - [ ] Collect context (model, platform, session excerpt with user approval)
    - [ ] Submit to GitHub issue template or webhook

- [ ] **6.6 Migration from Hermes and OpenClaw**
  - Files touched: `claudia_cli/commands/migrate.py` (expand from Phase 1 stub)
  - **Detection order**: on first run, check `~/.hermes/` first (larger community), then `~/.openclaw/`. Also available anytime via `claudia migrate`.
  - **From `~/.hermes/`, import**:
    - [ ] API keys + provider config (OpenRouter key, model prefs from `cli-config.yaml`)
    - [ ] User-created skills (`~/.hermes/skills/`) → `~/.claudia/skills/hermes-imports/`
    - [ ] SOUL.md persona → offer to merge with Claudia's or archive as reference
    - [ ] MEMORY.md and USER.md → ingest as seed data (convert flat text entries → structured memory records with default importance)
    - [ ] Gateway configs (Telegram tokens, Discord tokens, pairings, allowed users)
    - [ ] Cron jobs → convert to Claudia cron format
    - [ ] Command allowlists
    - [ ] TTS assets
  - **From `~/.openclaw/`, import**:
    - [ ] Same scope as what Hermes already imports from OpenClaw (persona, memories, skills, API keys, messaging, allowlists, TTS, workspace instructions)
  - **CLI interface**:
    ```bash
    claudia migrate                          # Interactive, auto-detects
    claudia migrate --from hermes
    claudia migrate --from openclaw
    claudia migrate --dry-run
    claudia migrate --preset user-data       # No secrets
    claudia migrate --preset full            # Everything including API keys
    claudia migrate --overwrite
    ```
  - **Nuances**:
    - [ ] Hermes skills in agentskills.io format → import directly
    - [ ] OpenClaw skills may need format conversion
    - [ ] Memory ingestion: parse each entry, default importance 0.5, generate embeddings, store in SQLite, flag as "imported" in provenance
    - [ ] Never delete source directory — copy only
    - [ ] If both exist → offer sequential import

## Deliverable
Polished install experience, working visualiser, Hermes/OpenClaw migration path, documentation for meeting intelligence.

## Rollback
Installer falls back to manual setup. Visualiser disabled. `claudia migrate` returns to the Phase 1 stub state.

## Decisions made this phase
- _none yet_

## Session handoff
_Last updated: 2026-04-08 by scaffold setup_
- **Last completed**: nothing — Phase 6 not yet started.
- **Next up**: Task 6.6 (migration) is the largest single item. Start with Hermes → Claudia first (larger user pool).
- **Blockers**: Phases 4 and 5 complete.
- **Notes**: Migration is a user-acquisition lever, not just convenience. Every existing Hermes user who can't switch in <5 minutes is lost.
