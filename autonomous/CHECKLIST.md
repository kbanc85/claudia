# Claudia Autonomous — master checklist

_The single view of everything. One box per phase. Click into the phase file for task-level detail._

## How to use this file

1. **Start every session here.** Read the phase you're working on, then open its detail file.
2. **End every session here.** Update the phase's status box and its `Session handoff` block.
3. **Status legend**:
   - `[ ]` — not started
   - `[~]` — in progress
   - `[x]` — done
   - `[!]` — blocked (put a reason in the phase file's Blockers line)
4. Update the top-level roll-up box only when a phase is fully complete.

## Critical path

```
   Phase 0 ──▶ Phase 1 ──▶ Phase 2A ──▶ Phase 2B ──▶ Phase 3 ──▶ Phase 6 ──▶ Phase 7
                                          │                │
                                          │                ├─▶ Phase 4  ┐
                                          │                │             ├──▶ (merge into Phase 6)
                                          │                └─▶ Phase 5  ┘
                                          │
                                          └─▶ Phase 3 analytical (3.1-3.3, parallel starter)
```

**Parallel tracks**:
- Phase 3 analytical work (3.1, 3.2, 3.3) runs during Phase 2A/2B
- Phase 4 and Phase 5 run in parallel with each other (late Phase 3 and into Phase 6)

## Phases

- [x] **Phase 0 — Fork, security baseline, and test harness** _(5 days, critical path)_
  - Objective: Clean fork with no "hermes" references, known security posture, test harness ready.
  - → [phases/phase-0-fork-security-tests.md](phases/phase-0-fork-security-tests.md)
  - All 5 tasks done. 0.5 dynamic run deferred to a real Python environment.

- [~] **Phase 1 — Visual rebrand and persona injection** _(4-5 days, critical path)_
  - Objective: 100% Claudia visuals, commands, and personality before touching logic.
  - → [phases/phase-1-rebrand-persona.md](phases/phase-1-rebrand-persona.md)
  - Tasks 1.2 (SOUL.md), 1.3 (migrate stub via C4), 1.4 (config defaults), 1.5 (README+THIRD-PARTY), 1.6 (model selector) done. 1.1 assets and 1.5 CONTRIBUTING rewrite deferred.

- [~] **Phase 2A — Memory, core hybrid search** _(7-10 days, critical path)_
  - Objective: Replace flat-file memory with Claudia's hybrid search as a pluggable v0.7.0 provider.
  - → [phases/phase-2a-memory-core.md](phases/phase-2a-memory-core.md)
  - Task 2A.1 done (design doc at docs/decisions/memory-provider-design.md). 2A.2 implementation starting.

- [ ] **Phase 2B — Memory, advanced features** _(5-7 days, critical path)_
  - Objective: Relationship graphs, commitment lifecycle, adaptive decay, cost governance, prompt budgets.
  - → [phases/phase-2b-memory-advanced.md](phases/phase-2b-memory-advanced.md)

- [~] **Phase 3 — Skills audit and porting** _(6-8 days, critical path; analytical subtasks can start during Phase 2A)_
  - Objective: Port 12 core Claudia skills, verify cross-model compatibility.
  - → [phases/phase-3-skills.md](phases/phase-3-skills.md)
  - Tasks 3.1 + 3.3 done (analytical parallel track). Skill audit at docs/decisions/skill-audit.md.

- [ ] **Phase 4 — Proactive behaviour layer** _(4-5 days, parallel with Phase 5)_
  - Objective: Pre-LLM hooks, commitment detection, cron-triggered proactive tasks.
  - → [phases/phase-4-proactive.md](phases/phase-4-proactive.md)

- [ ] **Phase 5 — Autonomy, gateways, and cost controls** _(4-6 days, parallel with Phase 4)_
  - Objective: 24/7 operation across messaging platforms with cost governance active.
  - → [phases/phase-5-gateways.md](phases/phase-5-gateways.md)

- [ ] **Phase 6 — Visualiser, installer, and polish** _(5-7 days, critical path)_
  - Objective: `/brain` visualiser, `npx get-claudia --agent`, first-run wizard, Hermes+OpenClaw migration.
  - → [phases/phase-6-visualiser-installer.md](phases/phase-6-visualiser-installer.md)

- [ ] **Phase 7 — Testing, edge cases, and release** _(5-7 days, critical path)_
  - Objective: Three test tiers, edge-case sweep, security re-audit, `v0.1.0-beta` tag.
  - → [phases/phase-7-testing-beta.md](phases/phase-7-testing-beta.md)

- [ ] **Phase 8 — Maintenance and evolution** _(ongoing)_
  - Objective: Cherry-pick upstream fixes, grow community, ship post-MVP features, quarterly reviews.
  - → [phases/phase-8-maintenance.md](phases/phase-8-maintenance.md)

## Totals

- **Timeline to beta**: 10-14 weeks (accounts for Claude Code session overhead, memory system complexity, cross-model testing)
- **Phases to beta**: 0 through 7
- **Phases post-beta**: 8 (ongoing)

## Cross-references

- Master risk register → [risks/risk-register.md](risks/risk-register.md)
- Decision log → [decisions/](decisions/)
- Session journal → [logs/session-log.md](logs/session-log.md)
- Source of truth → [roadmap/claudia-autonomous-roadmap-v3.md](roadmap/claudia-autonomous-roadmap-v3.md)
- Fork submodule placeholder → [fork/README.md](fork/README.md)
