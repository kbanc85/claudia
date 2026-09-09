# Proposal 01: Cross-platform daemon service installer

**Status**: Proposal · **Effort**: 2-3 days · **Batch**: Operations (ship with #06)

## TL;DR

Add `claudia daemon install / status / restart / uninstall / logs` subcommands to the `get-claudia` npm CLI that handle OS-level supervision of the `claudia-memory` Python daemon. macOS → LaunchAgent, Linux → systemd user unit, Windows → Task Scheduler. Removes the entire class of "daemon is dead and nobody knows" failure modes.

## The problem

Today, `claudia-memory` runs as a foreground Python process. If it crashes mid-day, the MCP tools silently vanish from Claude Code; the user only notices on the next session start. If the user restarts their laptop, the daemon doesn't come back until something invokes it. There is no supervision, no auto-restart, no boot-time start.

The `memory-availability` rule in this repo already acknowledges this — it instructs Claude to disclose to the user when the daemon is unreachable. That's the right safety net, but it's a band-aid for an OS-level supervision gap.

## The fix

Add to the Node CLI (`bin/claudia.js` or wherever the subcommand router lives):

```
claudia daemon install     # write OS supervisor config, start daemon
claudia daemon status      # pid, uptime, last backup, schedule
claudia daemon restart     # graceful stop + restart
claudia daemon uninstall   # remove supervisor config, stop daemon
claudia daemon logs        # tail recent stderr
```

OS-detection:

| OS | Mechanism | Path |
|---|---|---|
| macOS | LaunchAgent | `~/Library/LaunchAgents/club.aiadopters.claudia.plist` |
| Linux | systemd user unit | `~/.config/systemd/user/claudia.service` |
| Windows | Task Scheduler (`schtasks`) or NSSM | scheduled task `Claudia` |

Each template lives at `bin/templates/supervisor/<os>.template` with `$HOME`, `$DAEMON_PATH`, and log-dir placeholders substituted at install time.

Restart-on-crash semantics:
- macOS: `KeepAlive { Crashed: true }` + `ThrottleInterval: 10`
- Linux: `Restart=on-failure` + `RestartSec=10`
- Windows: scheduled task with retry policy

Logs:
- All OSes: stdout → `~/.claudia/logs/daemon.log`, stderr → `~/.claudia/logs/daemon.err`
- `claudia daemon logs` does the tail with the appropriate command per OS.

## Surface area

```
claudia/bin/claudia.js                            # add daemon subcommand router
claudia/bin/commands/daemon-install.js
claudia/bin/commands/daemon-status.js
claudia/bin/commands/daemon-restart.js
claudia/bin/commands/daemon-uninstall.js
claudia/bin/commands/daemon-logs.js
claudia/bin/templates/supervisor/
  ├── macos.plist.template
  ├── linux.service.template
  └── windows.xml.template
claudia/lib/os-detect.js                          # platform detection helper
docs/daemon-supervision.md                        # user-facing docs
```

## Why elegant

- One command, three OSes. Users don't write plists or systemd units.
- The daemon itself stays unchanged — supervision is fully external.
- Discoverable through the existing `claudia` CLI that users already have in their PATH after `npx get-claudia`.
- Reversible: `claudia daemon uninstall` cleans up perfectly.
- Status command is the first place users look when something feels off.

## Testing plan

- macOS: install + reboot + verify daemon is back; `kill -9` the pid + verify auto-restart within ~10s
- Linux (Ubuntu, Debian, Fedora): same drill via systemd
- Windows: `schtasks /Run` after install
- Sanity: status output is parseable JSON when `--json` flag is passed

## Open questions

- Should we offer an opt-out for users who already run their own process supervisor (supervisord, PM2, runit)?
- Default log retention — `~/.claudia/logs/` could grow unbounded. Suggest a `logrotate` snippet for Linux/macOS in the docs.
- Should the installer also schedule the existing `daily_backup` job's pre-conditions (e.g., warn if the daemon's version doesn't match the installed npm package)?

## Related

- Pairs naturally with Proposal #06 (off-site backup). Ship together as the Operations release.
- Resolves the "stale daemon" failure mode where multiple daemon versions coexist on a user's machine, which is non-obvious to diagnose today.
