# daemon/

Long-running side of the memory daemon: scheduled background jobs and a local HTTP health endpoint. Only used when the daemon runs in standalone mode (`--standalone`); the MCP-server path (stdio transport, default) does not run these.

## Where to look first

| Concern | File | Notes |
|---------|------|-------|
| Scheduled background work | `scheduler.py` | APScheduler with three jobs: `daily_decay` at 02:00, `pattern_detection` every 6 hours, `full_consolidation` at 03:00. Optional `vault_sync` at 03:15 if `vault_sync_enabled` is set. |
| Health endpoint | `health.py` | HTTP server bound to `localhost:3848`. The `/health` route is what the npm installer probes during Step 5 of install. The `/status` route powers the `memory_system_health` MCP tool. |

## Conventions

- **Bind localhost only.** Never `0.0.0.0`. The health server exposes internal state and is not auth-gated.
- **New scheduled jobs go through the same path as existing ones.** Add to `scheduler.py`'s job registration. Don't spawn ad-hoc background threads from service modules.
- **Service code stays in `services/`.** The daemon module is for *scheduling and exposing* that work, not implementing it. If you find yourself writing business logic here, move it to a service.
