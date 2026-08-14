# Host adapter protocol (short form)

See full design: `docs/proposals/13-runtime-agnostic-host-adapters.md`.

## Queue file

Path: `~/.claudia/sessions_pending.jsonl`

One JSON object per line (atomic writers preferred):

```json
{
  "session_id": "grok-2026-07-09-t123",
  "transcript_path": "/Users/you/.claudia/sessions/grok-2026-07-09-t123.jsonl",
  "enqueued_at": 1720540800.0,
  "source_channel": "grok_build",
  "host": "grok"
}
```

- `session_id` (required): unique string  
- `transcript_path` (recommended): path to JSONL transcript  
- `enqueued_at` (required): unix epoch float  
- `source_channel` / `host` (optional until daemon Phase 2; safe to include now)

**Never write SQLite from a host adapter.** The daemon’s `process_sessions` job is the sole ingester.

## Transcript JSONL

One turn per line. Compatible with `_parse_transcript` in `memory-daemon/claudia_memory/daemon/scheduler.py`:

```json
{"role": "user", "content": "morning brief"}
{"role": "assistant", "content": "Here is your brief..."}
{"role": "user", "content": "remember: I only have a B&W laser printer"}
{"role": "assistant", "content": "Locked in."}
```

Rules:

- `role`: `user`, `human`, or `assistant`  
- `content`: string, or list of `{ "type": "text", "text": "..." }`  
- Codex rollout messages are accepted as `response_item` records whose payload is a user/assistant `message` with `input_text` or `output_text` blocks
- Skip or omit tool_use / tool_result lines (parser ignores them)  
- Ambient extract uses up to ~4000 characters; keep high-signal turns  

## Lifecycle

| Moment | Host responsibility |
|--------|---------------------|
| Start | Probe tools; briefing if MCP available; disclose degraded mode |
| During | Append turns; `memory_batch` / `memory_remember` for canonical facts |
| End | Finalize transcript; call shared enqueue |

## Shared helpers

- Python: `host-adapters/shared/enqueue.py`  
- Grok: `host-adapters/grok/session_log.py`, `enqueue_session.py`
- Codex: `host-adapters/codex/session-start.mjs`, `session-end.mjs`, `hooks.json`
