# Proposal 13: Runtime-agnostic host adapters

**Status**: Phase 1+2 implemented on `feat/runtime-agnostic-host-adapters` · **Effort**: 1–2 weeks phased · **Batch**: Host layer (follows Proposal 12 ambient capture)  
**Constraint**: Keep memory daemon + SQLite + MCP as the single brain. Do not rewrite Claudia. Add hosts.

---

## Why now (grounded in latest releases)

| Release | What shipped | Why it enables multi-host |
|---------|--------------|---------------------------|
| **v1.65.0** Ambient capture | Hooks enqueue to `~/.claudia/sessions_pending.jsonl`; daemon is sole SQLite writer; AUDN ingest | **Capture path is already a file queue**, not an in-process Claude API |
| **v1.66.0** Trustworthy EA | Commitment resolver, salience briefing, degradation disclosure, daemon self-heal | Continuous memory is usable (salience + lifecycle), not a junk drawer |
| **v1.67 (PR #73)** OKF | Open Knowledge Format as authoring standard | **Vendor-neutral knowledge files** (Google OKF), same direction as multi-host identity |
| Product direction (2026-07-09) | General EA, not deeper Claude-only coupling; favor OKF / open skills | Runtime-agnostic is the product strategy, not a fork vanity project |

Proposal 12 already proved: **this is a wiring problem**. Ambient capture closed the Claude loop. This proposal closes the **every-host** loop.

---

## TL;DR

Claudia Core = identity + memory daemon + skills-as-capabilities.  
Hosts (Claude Code, Grok Build, Telegram gateway, future) are **adapters** that:

1. Start sessions (health + briefing)  
2. Record work (turns and/or artifacts)  
3. Enqueue finished sessions into the **same** `sessions_pending.jsonl`  
4. Never write SQLite directly  

Claude already does (2)–(3) via hooks. Grok (and others) need a thin adapter that speaks the same queue + transcript contract.

**Do not** rebuild Claudia from scratch for Grok.  
**Do** extract the host boundary that v1.65 accidentally almost invented.

---

## Current coupling (what to fix)

```
Claude Code hooks  ──enqueue──►  sessions_pending.jsonl  ──daemon──►  SQLite
       ▲
       └── ONLY host that can close this loop today
```

| Surface | Claude-coupled today | Should be |
|---------|----------------------|-----------|
| Session start health | `session-health-check.py` (Claude hook) | Host adapter + shared health script |
| Session end enqueue | `session-enqueue.py` (Claude stdin JSON) | Same JSONL queue, any writer |
| Transcript format | Claude Code JSONL | Documented contract; Grok writes compatible JSONL |
| `source_channel` | `claude_code`, `telegram`, `slack` | + `grok_build`, `cursor`, `cowork`, `manual` |
| Identity file | `CLAUDE.md` name | Host-neutral identity + thin shims |
| Skills | Assume Claude Task / slash | Capability metadata + host bindings |

---

## Design

### Host contract (minimal)

```text
on_session_start:
  - optional: probe daemon / self-heal (macOS LaunchAgent path shared)
  - call MCP memory_briefing (or equivalent) when tools available
  - disclose degraded mode if not

on_turn (optional mid-session):
  - append turn to host transcript (JSONL contract)
  - optional: memory_batch for canonical facts / artifacts (memory-commitment rule)

on_session_end:
  - finalize transcript path
  - append one line to ~/.claudia/sessions_pending.jsonl:
      { session_id, transcript_path, enqueued_at, source_channel?, host? }
  - optional: memory_end_session if MCP live (richer than ambient-only)

never:
  - write SQLite from the host adapter
  - invent a second memory DB per host
```

### Transcript JSONL contract (already nearly satisfied)

`_parse_transcript` in `daemon/scheduler.py` already accepts:

```json
{"role": "user"|"human"|"assistant", "content": "..." | [{ "type": "text", "text": "..." }]}
```

Skips `tool_use` / `tool_result`. Cap ~4k chars for ambient extract.

**Phase 1 Grok adapter:** write this format. No daemon change required for ingest.

### source_channel

| Channel | Meaning |
|---------|---------|
| `claude_code` | Existing default |
| `telegram` / `slack` | Gateway |
| `grok_build` | Grok Build TUI / ACP |
| `cursor` | Cursor agent |
| `cowork` | Claude Desktop Cowork |
| `manual` | User-invoked enqueue |

Phase 1: pass through on enqueue entry; wire into `remember_fact(..., source_channel=)` inside `_process_sessions` when present (small daemon patch).  
Phase 0 (no daemon patch): enqueue works; channel defaults to `claude_code` until patch lands.

### Package layout (additive)

```
host-adapters/
  PROTOCOL.md                 # this contract, short form
  README.md
  shared/
    enqueue.py                # single writer for sessions_pending.jsonl
  claude/                     # pointers to template-v2/.claude/hooks (no duplication)
  grok/
    session_log.py            # append turns → JSONL transcript
    enqueue_session.py        # CLI: end session → queue
    IDENTITY.md               # thin runtime shim (points at CLAUDE.md sections)
```

Installer later: `npx get-claudia . --host claude|grok|both`  
Not required for Phase 1 spike.

---

## What we keep / eliminate / improve

### Keep (sacred)

- Memory daemon, SQLite, embeddings, AUDN, process_sessions  
- Salience briefing + commitment resolver (v1.66)  
- Identity / principles / judgment / trust gates  
- Vault as projection; OKF authoring (v1.67)  
- Skill *workflows* (morning-brief, meditate, capture-meeting, …)

### Eliminate (as sole path)

- Claude hooks as the **only** way to enqueue sessions  
- Second memory product for Grok  
- Full greenfield rewrite  

### Improve

- Document and test the queue + transcript contract as public host API  
- Grok session adapter  
- source_channel completeness  
- Capability-based skill metadata (follow-on)  
- Daemon doctor (MCP + shell) as host-agnostic skill  

---

## Phased delivery

### Phase 1 — Spike · done

1. `docs/proposals/13-…` (this file)  
2. `host-adapters/shared/enqueue.py` — atomic append identical to `session-enqueue.py`  
3. `host-adapters/grok/` — session log + CLI enqueue producing Claude-compatible JSONL  
4. Manual smoke: enqueue + `_parse_transcript`  
5. Operator checklist in `host-adapters/README.md`

**Success:** A Grok day can land in the same queue as Claude without Claude Code.

### Phase 2 — Daemon polish · done (this PR)

1. `_resolve_source_channel()` on queue entries  
2. `episodes.source` set from channel (legacy → `claude_code`)  
3. `audn_write` / stub `remember_fact` pass `source_channel`  
4. Tests: resolve helper + grok episode source + legacy default  

### Phase 3 — Productize · ~1 week

1. Installer `--host` flag  
2. Grok identity shim (`AGENTS.md` / `GROK.md`) loading same principles  
3. Skill router capability tags  
4. Session-start checklist skill (host-neutral)  
5. Changelog + release notes (likely v1.68)

### Out of scope

- Replacing Ollama  
- Cloud memory  
- Rewriting vault  
- Grok-only fork of Claudia  
- Auto-send / external actions without approval  

---

## Decisions (proposed locks)

1. **One brain.** Single `~/.claudia/memory/claudia.db` for all hosts.  
2. **Daemon sole writer.** Hosts only append queue + transcripts (and MCP tools).  
3. **Archive-never-delete** lifecycle stays (Prop 12 D5).  
4. **Grok is an adapter, not a rewrite.**  
5. **OKF stays the authoring standard** (aligns with multi-host knowledge files).  
6. **B&W laser defaults** live in host/operator prefs, not in core memory schema.

---

## Acceptance

1. Documented queue + transcript contract with at least one non-Claude writer.  
2. Fake Grok transcript enqueued → appears as episode / extracted memories after process_sessions.  
3. Claude ambient path unchanged (regression: existing session-capture tests green).  
4. No second database. No hard-delete of commitments.  
5. Proposal status promoted from Draft → Accepted after Phase 1 manual verification.

---

## Relationship to prior work

| Proposal | Relationship |
|----------|----------------|
| 12 Ambient hardening | Queue + daemon ingest is the substrate this extends |
| 11 Autonomy / loops | Host-agnostic skills later reuse loop-checker patterns |
| 08 Smarter writes | Entity inference remains daemon-side |
| Product OKF (1.67) | Knowledge files stay portable across hosts |

---

## Open questions for Kamil

1. Phase 1 ship as docs+adapter only, or also wire `source_channel` into daemon in the same PR?  
2. Should Telegram gateway migrate to `host-adapters/shared/enqueue.py` (dedupe) in Phase 2?  
3. Rename long-term: keep `CLAUDE.md` as filename with shims, or introduce `IDENTITY.md`?

---

*Draft 2026-07-09. Aligns with v1.66.0 main and in-flight OKF work. Implement on branch `feat/runtime-agnostic-host-adapters`.*
