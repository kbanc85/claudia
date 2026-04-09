# Phase 2A: Memory, core hybrid search

**Status**: [ ] Not started
**Duration estimate**: 7-10 days (do not compress this — previous estimates at 4-7 days were wrong)
**Critical path**: Yes
**Can parallelise with**: Phase 3 analytical work (tasks 3.1, 3.2, 3.3)
**Depends on**: Phase 1 complete (persona in place, model selector working)

## Objective
Replace Hermes's flat-file memory (MEMORY.md/USER.md) with Claudia's hybrid search as a **pluggable memory provider**, using the v0.7.0 provider ABC interface from PR #4623.

## Why this timeline
The hybrid scoring algorithm alone contains six sub-components (2A.2a–2A.2f) that each need implementation and testing. 7-10 days is realistic for one Claude Code session per sub-component plus integration testing.

## Tasks

- [ ] **2A.1 Study the v0.7.0 memory provider interface**
  - Files to read (no code yet):
    - [ ] `tools/memory_tool.py` (current memory implementation)
    - [ ] `plugins/` directory (hindsight plugin shows how providers register)
    - [ ] PR #4623 (pluggable memory provider ABC)
    - [ ] `claudia_state.py` (SessionDB with FTS5 — stays, handles conversation sessions)
  - Output: Note in this file describing the provider ABC contract (methods required, registration flow, system-prompt injection).

- [ ] **2A.2 Implement Claudia memory provider** — `plugins/claudia_memory/`
  - [ ] **2A.2a SQLite schema**
    - [ ] Entities table (people, orgs, projects) with importance, access_count, timestamps
    - [ ] Memories table with provenance reference
    - [ ] Relationships table with type + health score
    - [ ] Commitments table with lifecycle status
    - [ ] Enable WAL mode by default (mandatory for concurrency)
  - [ ] **2A.2b Embedding pipeline**
    - [ ] Ollama integration for `all-minilm:l6-v2`
    - [ ] Embedding generation for new memories
    - [ ] Offline fallback (Ollama unavailable → skip vector scoring, use FTS only)
  - [ ] **2A.2c Hybrid search algorithm**
    - [ ] 50% vector similarity (cosine distance)
    - [ ] 25% importance score
    - [ ] 10% recency (time-decay)
    - [ ] 15% FTS score (SQLite FTS5)
    - [ ] Rehearsal boost: access increments access_count, feeds back into ranking
  - [ ] **2A.2d Entity CRUD**
    - [ ] Create/read/update/delete for people, orgs, projects
    - [ ] Profile isolation (keep Hermes's existing strength)
  - [ ] **2A.2e Offline degradation path**
    - [ ] Ollama up, embeddings available → full hybrid search
    - [ ] Ollama down, no embeddings → FTS + importance + recency (reweight remaining to 100%)
    - [ ] No internet, no Ollama → pure FTS + local SQLite only
  - [ ] **2A.2f Register as provider**
    - [ ] Wire into v0.7.0 provider system
    - [ ] Claudia memory provider becomes the default

- [ ] **2A.3 Concurrency design**
  - Required for: cron jobs + gateway messages + interactive sessions + subagents
  - Steps:
    - [ ] WAL mode (mandatory)
    - [ ] Connection pooling for readers
    - [ ] Write serialisation (dedicated write queue OR SQLite built-in locking)
    - [ ] Synthetic load test: 3 concurrent writers simulating cron + gateway + interactive

- [ ] **2A.4 Unit tests**
  - Port from Claudia's 756-test suite:
    - [ ] Hybrid search ranking accuracy
    - [ ] Entity CRUD operations
    - [ ] Rehearsal effect (access boosts ranking)
    - [ ] Offline fallback (FTS-only mode)
    - [ ] Concurrency under load

## Deliverable
Memory that recalls with Claudia's hybrid scoring, handles concurrent access, and degrades gracefully offline.

## Rollback
Fall back to Hermes's default built-in memory provider (MEMORY.md/USER.md). The provider ABC makes this a **config change**, not a code revert. Keep the plugin file on disk but flip the default in config.

## Decisions made this phase
- _none yet_ — expected: **Memory provider strategy** ADR (which methods of the ABC we extend vs implement vs register alongside).

## Session handoff
_Last updated: 2026-04-08 by scaffold setup_
- **Last completed**: nothing — Phase 2A not yet started.
- **Next up**: Task 2A.1 (study the v0.7.0 interface) after Phase 1 ships.
- **Blockers**: Phase 1 must complete. Phase 3 analytical work (3.1-3.3) can run in parallel in a second session.
- **Notes**: Six sub-tasks in 2A.2 = six Claude Code sessions + an integration session. Do not try to do multiple sub-tasks in one session.
