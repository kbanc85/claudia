# Phase 2B: Memory, advanced features

**Status**: [ ] Not started
**Duration estimate**: 5-7 days
**Critical path**: Yes
**Can parallelise with**: Phase 3 analytical work continues
**Depends on**: Phase 2A complete (hybrid search + entity CRUD working)

## Objective
Add relationship graphs, commitment tracking, adaptive decay, and cost governance on top of Phase 2A's core memory.

## Tasks

- [ ] **2B.1 Relationship graphs**
  - [ ] Store relationships between entities with type (colleague, client, investor, friend, etc.)
  - [ ] Health score attached to each relationship
  - [ ] Health decays based on time since last interaction
  - [ ] Surface warnings: "Haven't spoken to Marcus in 18 days, usually weekly"

- [ ] **2B.2 Commitment lifecycle**
  - [ ] Detect commitments in conversation ("I'll send that by Friday")
  - [ ] Store with: who, what, deadline, status (open/completed/overdue)
  - [ ] Surface overdue commitments in morning briefs and proactive alerts

- [ ] **2B.3 Provenance chains**
  - [ ] Every memory traces back to its source (conversation session, meeting transcript, email)
  - [ ] "How do you know that?" returns the source chain

- [ ] **2B.4 Adaptive decay and consolidation**
  - [ ] Nightly job at 2 AM: memories that haven't been accessed decay in importance
  - [ ] Consolidation: merge duplicate memories, detect cross-session patterns
  - [ ] Wire as a Hermes cron job

- [ ] **2B.5 Cost governance hooks**
  - [ ] Add token logging to every LLM call (extend existing Hermes usage tracking)
  - [ ] Model-tier routing: cheap model (Haiku-class) for routine tool calls, expensive model (Sonnet-class) for reasoning
  - [ ] Cost alerts when approaching budget thresholds
  - [ ] Wire budget enforcement in `run_agent.py`'s conversation loop (check before each LLM call)

- [ ] **2B.6 Prompt budget accounting**
  - Define token budgets per system prompt component. Measure actual counts:
    - [ ] Core agent instructions: ~2,000 tokens (fixed)
    - [ ] Claudia persona + rules: ~1,500 tokens (fixed)
    - [ ] Memory snapshot: ~1,500 tokens max (truncate oldest first)
    - [ ] Relationship context: ~800 tokens max (only for mentioned entities)
    - [ ] Skills index (Level 0): ~3,000 tokens (progressive disclosure)
    - [ ] Judgment rules: ~500 tokens (fixed)
    - [ ] **Total baseline: ~9,300 tokens**
  - [ ] Test on smallest target model context window
  - [ ] If total exceeds 25% of context: implement aggressive truncation for memory + relationship components

## Deliverable
Production-grade Claudia memory with relationship intelligence, commitment tracking, cost governance, and defined prompt budgets.

## Rollback
Disable advanced features via config flag. Keep Phase 2A core memory operational. Relationship/commitment tables remain but are not queried.

## Decisions made this phase
- _none yet_ — expected: **Cost governance enforcement point** ADR (per-request vs per-session vs per-day enforcement).

## Session handoff
_Last updated: 2026-04-08 by scaffold setup_
- **Last completed**: nothing — Phase 2B not yet started.
- **Next up**: Task 2B.1 (relationship graphs) after Phase 2A passes concurrency tests.
- **Blockers**: Phase 2A complete and stable.
- **Notes**: Task 2B.5 (cost governance) is the highest-leverage item for server deployments. Do not defer it to Phase 5.
