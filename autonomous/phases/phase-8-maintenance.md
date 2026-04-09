# Phase 8: Maintenance and evolution

**Status**: [ ] Not started (ongoing phase, begins after beta ships)
**Duration estimate**: Ongoing
**Critical path**: No (post-launch)
**Can parallelise with**: Post-MVP feature work
**Depends on**: Phase 7 beta release

## Objective
Keep Claudia Autonomous alive, aligned with upstream Hermes security fixes, and evolving toward the post-MVP feature set.

## Ongoing workstreams

### Upstream monitoring
- [ ] Watch Hermes releases for security patches and infrastructure improvements
- [ ] Cherry-pick specific fixes (security, gateway stability, new execution backends)
- [ ] **Never full rebase** — always targeted cherry-picks
- [ ] Track every cherry-pick in `docs/decisions/upstream-cherry-picks.md`

### Community
- [ ] Contribution guidelines: new skills must pass Claudia's judgment filter
- [ ] Skill submission process via PR
- [ ] Bug reports via GitHub issues

### Post-MVP roadmap
- [ ] Meeting intelligence integrations (Otter API, Granola, Fathom)
- [ ] Obsidian PARA vault sync
- [ ] `/brain` visualiser with real-time cron/task monitoring
- [ ] Claudia Lite mode definition (explicit feature set for local models)
- [ ] Voice interaction via gateway TTS/STT

### Quarterly reviews
- [ ] Review fork vs upstream divergence
- [ ] Decide what to cherry-pick
- [ ] Skill usage telemetry (opt-in) to inform pruning

## Deliverable
A living fork that stays secure, grows new capabilities, and maintains a clean delta from upstream Hermes.

## Rollback
N/A — maintenance is continuous. Individual changes are reverted as standard PRs.

## Decisions made this phase
- _none yet_ — this phase will accumulate ADRs over time, particularly around cherry-picks, telemetry opt-in design, and Claudia Lite feature boundaries.

## Session handoff
_Last updated: 2026-04-08 by scaffold setup_
- **Last completed**: nothing — Phase 8 begins after Phase 7 beta ships.
- **Next up**: Set up upstream watch (GitHub webhook or cron-pulled release feed) before the first quarterly review window opens.
- **Blockers**: Phase 7 beta released.
- **Notes**: Phase 8 is where Claudia earns its "autonomous" name. Once she's running 24/7 in front of real users, the work shifts from building to listening.
