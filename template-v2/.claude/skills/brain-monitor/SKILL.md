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
claudia system-health --project-dir "$PWD" --pretty
```

This shows a comprehensive system health report. For continuous monitoring, use the Brain Visualizer instead (see `/brain` skill).

If the `claudia` CLI is not found, it's not installed. Tell the user:
`npm install -g get-claudia && claudia setup`

---

## Report to User

```
**Brain Monitor** launched.

Showing:
- **System Health** - CLI status, database stats, embedding model
- **Memory Stats** - total memories, entities, relationships
- **Recent Activity** - latest memory operations

For the full 3D interactive brain visualization, use `/brain`.
```

---

## Tone

Quick. One command. Show what it does and get out of the way.
