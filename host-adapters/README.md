# Host adapters

Thin bridges between **host runtimes** (Claude Code, Grok Build, …) and **Claudia Core** (memory daemon + identity + skills).

The memory daemon remains the only SQLite writer. Hosts enqueue finished sessions into `~/.claudia/sessions_pending.jsonl` (same path Claude’s SessionEnd hook uses since v1.65).

```
Claude hooks  ──┐
Codex hooks   ──┼──► sessions_pending.jsonl ──► daemon process_sessions ──► SQLite
Grok adapter  ──┤
Telegram/etc  ──┘
```

## Layout

| Path | Purpose |
|------|---------|
| `PROTOCOL.md` | Queue + transcript contract |
| `shared/enqueue.py` | Atomic append to the pending queue |
| `grok/` | Grok Build session log + CLI enqueue |
| `claude/` | Pointers to existing `template-v2/.claude/hooks` (no duplication) |
| `codex/` | Native SessionStart briefing and SessionEnd transcript hooks |

## Quick test (any host)

```bash
# 1. Write a tiny transcript
mkdir -p ~/.claudia/sessions
cat > ~/.claudia/sessions/demo-host-session.jsonl <<'EOF'
{"role":"user","content":"Demo: my default printer is Brother HL-L2460DW black and white laser."}
{"role":"assistant","content":"Noted. Printables will assume B&W laser."}
EOF

# 2. Enqueue
python3 host-adapters/shared/enqueue.py \
  --session-id demo-host-session \
  --transcript ~/.claudia/sessions/demo-host-session.jsonl \
  --source-channel manual \
  --host demo

# 3. Wait for daemon process_sessions (or trigger consolidation cycle)
# Then: memory_recall "Brother HL-L2460DW" via MCP
```

## Grok operator checklist

1. During a Grok session, append turns with `session_log.py` (or your own writer of the same format).  
2. At session end: `python3 host-adapters/grok/enqueue_session.py --session-id <id>`  
3. Optional if MCP is live: also call `memory_end_session` for a richer narrative (ambient path still runs).

## Codex lifecycle

The official plugin packages `codex/hooks.json` and two cross-platform Node hooks. SessionStart injects the daemon's compact `/briefing` response as developer context. SessionEnd queues Codex's rollout JSONL with `source_channel: codex`; the daemon parser extracts only user and assistant message items.

## Status

Claude, Codex, and Grok adapters share Proposal 13's queue contract. Claude's ambient path remains unchanged.
