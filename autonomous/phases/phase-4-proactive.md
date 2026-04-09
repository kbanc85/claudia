# Phase 4: Proactive behaviour layer

**Status**: [ ] Not started
**Duration estimate**: 4-5 days
**Critical path**: No (parallel track)
**Can parallelise with**: Phase 5 (if two Claude Code sessions available)
**Depends on**: Phase 3 complete (skills ported) — but can start late in Phase 3

## Objective
Claudia doesn't just respond, she anticipates. Wire proactive intelligence into the agent loop and cron system.

## Tasks

- [ ] **4.1 Pre-LLM hooks**
  - Files touched: `agent/prompt_builder.py`
  - Always inject before each LLM call:
    - [ ] Current Claudia persona context
    - [ ] Active judgment rules
    - [ ] Relevant relationship context for entities mentioned in the current message
    - [ ] Any pending commitments approaching deadline

- [ ] **4.2 Post-LLM hooks (commitment detection)**
  - Files touched: `plugins/claudia_proactive.py` (new)
  - Hook: `post_llm_call`
  - Behaviour:
    - [ ] Scan agent output for commitment language ("I'll", "by Friday", "next week", etc.)
    - [ ] Extract and store commitments in memory
    - [ ] Surface newly detected commitments to user for confirmation

- [ ] **4.3 Cron-triggered proactive tasks**
  - Files touched: `cron/` job definitions
  - Wire:
    - [ ] Morning brief — daily 7 AM (user-configurable), deliver via active gateway
    - [ ] Commitment check — daily 9 AM, surface approaching/overdue
    - [ ] Relationship health — weekly Monday, flag cooling contacts
    - [ ] Memory consolidation — daily 2 AM (already wired in Phase 2B.4, just verify here)

- [ ] **4.4 Model-agnostic prompt testing**
  - Test all proactive prompts on:
    - Frontier:
      - [ ] Claude Sonnet (via OpenRouter)
      - [ ] GPT-4.1 (via OpenRouter)
    - Local:
      - [ ] Llama 3.3 70B (via Ollama)
      - [ ] Gemma 4 (via Ollama)
  - Verify:
    - [ ] Commitment detection works
    - [ ] Relationship awareness works
    - [ ] Judgment application works

## Deliverable
Claudia proactively detects commitments, monitors relationships, and delivers scheduled intelligence.

## Rollback
Revert hooks. Disable cron jobs. Agent reverts to reactive-only mode. All data stays in memory, just not surfaced proactively.

## Decisions made this phase
- _none yet_

## Session handoff
_Last updated: 2026-04-08 by scaffold setup_
- **Last completed**: nothing — Phase 4 not yet started.
- **Next up**: Task 4.1 (pre-LLM hooks) after Phase 3 skills are ported and tested.
- **Blockers**: Phase 3 complete. Can run in parallel with Phase 5 if a second Claude Code session is available.
- **Notes**: Post-LLM commitment detection is where Claudia stops feeling like a tool and starts feeling like a chief of staff. Worth extra test iterations.
