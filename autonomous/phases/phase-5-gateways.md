# Phase 5: Autonomy, gateways, and cost controls

**Status**: [ ] Not started
**Duration estimate**: 4-6 days
**Critical path**: No (parallel track)
**Can parallelise with**: Phase 4
**Depends on**: Phase 3 complete (skills ported)

## Objective
24/7 operation across all messaging platforms with responsible resource use.

## Tasks

- [ ] **5.1 Gateway rebranding**
  - Files touched: `gateway/telegram/`, `gateway/discord/`, `gateway/slack/`, `gateway/whatsapp/`, `gateway/signal/`, `gateway/email/`
  - For each platform:
    - [ ] Bot names
    - [ ] Welcome messages
    - [ ] Command responses

- [ ] **5.2 Message format standardisation**
  - Files touched: new `gateway/claudia_message.py` (or similar), per-gateway adapters
  - Define canonical internal message format:
    ```python
    class ClaudiaMessage:
        text: str
        sender_id: str
        platform: str
        attachments: list[Attachment]
        thread_id: Optional[str]
        timestamp: datetime
    ```
  - Handle per-platform constraints:
    - [ ] Telegram: 4096 char limit → multi-message splitting
    - [ ] Discord: 2000 char limit → multi-message splitting
    - [ ] Email: threading model → thread_id mapping
    - [ ] WhatsApp: media handling differences

- [ ] **5.3 Cron integration**
  - [ ] Import Claudia's scheduled tasks from Phase 4
  - [ ] Test natural-language cron creation ("remind me every Monday at 9am")
  - [ ] Verify cron jobs deliver via the active gateway

- [ ] **5.4 Cost governance enforcement**
  - [ ] Token budget per session (configurable, warn at 80%, hard stop at 100%)
  - [ ] Model-tier routing active: tool calls → cheap, reasoning → frontier
  - [ ] Daily cost summary via cron → gateway
  - [ ] Serverless hibernation notes for Daytona/Modal deployments

- [ ] **5.5 Concurrency testing**
  - Full load test: simultaneous cron execution + gateway message arrival + interactive terminal session + subagent delegation
  - [ ] All hitting memory concurrently
  - [ ] No data corruption, no deadlocks, no stale reads

## Deliverable
Claudia runs 24/7, reachable from any platform, with cost controls active.

## Rollback
Disable non-terminal gateways. Disable cron. Terminal-only mode.

## Decisions made this phase
- _none yet_

## Session handoff
_Last updated: 2026-04-08 by scaffold setup_
- **Last completed**: nothing — Phase 5 not yet started.
- **Next up**: Task 5.1 (gateway rebranding — mechanical, start with Telegram) after Phase 3.
- **Blockers**: Phase 3 complete. Can run in parallel with Phase 4.
- **Notes**: 5.5 concurrency test is the go/no-go for beta release. Cannot skip even if time pressure builds.
