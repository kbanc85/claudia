# Phase 7: Testing, edge cases, and release

**Status**: [ ] Not started
**Duration estimate**: 5-7 days
**Critical path**: Yes
**Can parallelise with**: Nothing
**Depends on**: Phase 6 complete (installer + visualiser + migration ready)

## Objective
Production readiness.

## Tasks

- [ ] **7.1 Run all three test tiers**
  - [ ] **Unit**: all memory operations, tool registration, config loading
  - [ ] **Integration**: 12 core skills across 3+ models
  - [ ] **E2E**: cron → gateway → memory → response pipeline

- [ ] **7.2 Edge case testing**
  - [ ] Offline operation (no internet, local Ollama only)
  - [ ] Context window exhaustion (what happens at 85% context on a 32K model?)
  - [ ] Concurrent subagents all writing memory
  - [ ] Gateway reconnection after network interruption
  - [ ] Malformed user input via each gateway platform
  - [ ] Migration from Hermes (`~/.hermes/` with populated data: skills, memories, gateway configs, cron jobs)
  - [ ] Migration from OpenClaw (`~/.openclaw/` with populated data)
  - [ ] Migration when both `~/.hermes/` and `~/.openclaw/` exist simultaneously
  - [ ] Migration `--dry-run` produces accurate preview without side effects

- [ ] **7.3 Security re-audit**
  - [ ] Re-run Phase 0 security checks against modified codebase
  - [ ] Verify no "hermes" references leaked through
  - [ ] Check that Claudia persona doesn't override safety guards

- [ ] **7.4 Beta release**
  - [ ] Tag `v0.1.0-beta`
  - [ ] Release to small group of AI Adopters Club subscribers
  - [ ] Collect feedback for 1-2 weeks

- [ ] **7.5 Documentation review**
  - [ ] All docs reference Claudia only
  - [ ] README accurately describes capabilities
  - [ ] Installation guide tested on clean macOS and Ubuntu machines

## Deliverable
Tagged beta release, tested across platforms, documentation complete.

## Rollback
Hold the tag. Do not publish to npm. Beta testers get the previous stable commit. Fixes go into `v0.1.0-beta.1` etc.

## Decisions made this phase
- _none yet_ — expected: any escalation decisions from beta feedback get logged here as ADRs.

## Session handoff
_Last updated: 2026-04-08 by scaffold setup_
- **Last completed**: nothing — Phase 7 not yet started.
- **Next up**: Task 7.1 after Phase 6 ships.
- **Blockers**: Phase 6 complete.
- **Notes**: Beta group selection happens in parallel with 7.1-7.3. Prepare the beta invite + intake form before 7.4 starts.
