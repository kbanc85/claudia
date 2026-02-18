---
name: brain
description: Launch the Brain Visualizer, a real-time 3D view of memory and relationships. Triggers on "show your brain", "visualize memory", "open the brain", "memory graph".
effort-level: medium
---

# Brain

Launch the Claudia Brain Visualizer, a real-time 3D cosmos visualization of my memory system showing entities, relationships, memories, and patterns as a swirling interactive force-directed graph.

**Triggers:** `/brain`, "show me your brain", "visualize memory", "open the brain", "memory graph"

---

## Overview

The visualizer is a single Express server (`server.js`) in `~/.claudia/visualizer/` that serves both the API (reads SQLite directly) and the pre-built 3D frontend from `dist/`. One process, one port (3849).

---

## Launch

### Step 1: Check if already running

```bash
if curl -s http://localhost:3849/health > /dev/null 2>&1; then
  echo "ALREADY_RUNNING"
else
  echo "NOT_RUNNING"
fi
```

### Step 2: Find the visualizer directory

```bash
VISUALIZER_DIR=""
for dir in \
  "$HOME/.claudia/visualizer" \
  "$(npm root -g 2>/dev/null)/get-claudia/visualizer"; do
  if [ -d "$dir" ] && [ -f "$dir/server.js" ]; then
    VISUALIZER_DIR="$dir"
    break
  fi
done

if [ -z "$VISUALIZER_DIR" ]; then
  echo "VISUALIZER_NOT_FOUND"
else
  echo "VISUALIZER_FOUND:$VISUALIZER_DIR"
fi
```

### Step 3: Start the server (if NOT_RUNNING and VISUALIZER_FOUND)

```bash
PROJECT_DIR="$(pwd)"
cd "$VISUALIZER_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --production 2>&1
fi

# Start server with --open to auto-launch browser
nohup node server.js --project-dir "$PROJECT_DIR" --open > /tmp/claudia-brain.log 2>&1 &
sleep 2

# Verify it started
if curl -s http://localhost:3849/health > /dev/null 2>&1; then
  echo "STARTED"
else
  echo "FAILED"
  tail -10 /tmp/claudia-brain.log
fi
```

### Step 4: Open browser (if ALREADY_RUNNING)

If the server was already running, just open the browser:

```bash
open "http://localhost:3849" 2>/dev/null || xdg-open "http://localhost:3849" 2>/dev/null || echo "OPEN_MANUALLY:http://localhost:3849"
```

---

## Report to User

**If already running:**
```
Your brain is live at http://localhost:3849
```

**If started successfully:**
```
**Brain Visualizer**
Live at http://localhost:3849

Viewing database for: [PROJECT_DIR]

What you're seeing:
- **Entities** (people, orgs, projects, concepts) as colored nodes, size scales with importance
- **Relationships** as arcing edges with traveling pulse particles
- **Patterns** as wireframe clusters
- **Starfield** background, the galaxy is just ambiance

**Controls:**
- Click any node to see details, memories, and relationships
- Search bar (top left) to find specific entities, camera flies to matches
- H = toggle HUD, R = reset camera, F = fullscreen, Esc = close panel
- The graph updates live as I learn new things
```

**If visualizer not found:**
```
The Brain Visualizer isn't installed at ~/.claudia/visualizer/.

To install: run `npx get-claudia` again, or manually copy the visualizer directory:
1. Copy `visualizer/` from the get-claudia package to `~/.claudia/visualizer/`
2. Run `npm install --production` there
3. Try `/brain` again
```

**If server failed to start:**
```
The server couldn't start. Check the log:
```bash
tail -50 /tmp/claudia-brain.log
```

Common issues:
- Port 3849 already in use (kill the old process first)
- Database not found for this project (make sure --project-dir is correct)
- Missing node_modules (run `npm install --production` in ~/.claudia/visualizer/)
```

---

## Tone

Treat this like showing someone something cool. A little proud of it. "Want to see what your memory graph looks like?" energy.
