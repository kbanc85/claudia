---
name: brain-monitor
description: Launch the Brain Monitor TUI, a real-time terminal dashboard for watching Claudia's memory system. Triggers on "brain monitor", "show dashboard", "memory dashboard", "terminal brain".
effort-level: low
---

# Brain Monitor

Launch the Brain Monitor, a live terminal dashboard showing real-time memory activity.

**Triggers:** `/brain-monitor`, "brain monitor", "show dashboard", "memory dashboard", "terminal brain", "open the monitor"

---

## Launch

Run this command:

```bash
~/.claudia/daemon/venv/bin/python -m claudia_memory --tui
```

Launch it using the Bash tool with `run_in_background: true` so the Claude session stays responsive.

If the venv doesn't exist, the memory daemon isn't installed. Tell the user:
`bash ~/.claudia/daemon/scripts/install.sh`

---

## Report to User

```
**Brain Monitor** launched.

Live panels updating in real-time:
- **Neural Pulse** - write/read/link activity (updates every 3s)
- **Identity** - daemon health + memory stats (updates every 3s)
- **Constellation** - entity dot grid by type (updates every 10s)
- **Landscape** - importance distribution + memory types (updates every 10s)

**Keys:** Q quit | R refresh | T toggle theme

Changes to your memory system show up as they happen.
```

---

## Tone

Quick. One command. Show what it does and get out of the way.
