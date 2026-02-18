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

The visualizer has two parts, both in `~/.claudia/visualizer/`:
- **API server** (`server.js`) — Express on port 3849, reads SQLite directly
- **Frontend** (`src/`) — Three.js + Vite dev server on port 5173

The API server must be started with `--project-dir` pointing to the current Claudia installation to access the correct per-project database.

---

## Launch

### Step 1: Identify the current project directory

```bash
PROJECT_DIR="$(pwd)"
echo "PROJECT_DIR:$PROJECT_DIR"
```

### Step 2: Check what is already running

```bash
# Check API server
if curl -s http://localhost:3849/health > /dev/null 2>&1; then
  echo "API_RUNNING"
else
  echo "API_NOT_RUNNING"
fi

# Check Vite dev server
if curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "FRONTEND_RUNNING:5173"
elif curl -s http://localhost:5174 > /dev/null 2>&1; then
  echo "FRONTEND_RUNNING:5174"
else
  echo "FRONTEND_NOT_RUNNING"
fi
```

### Step 3: Find the visualizer directory

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

### Step 4: Start API server if not running

If **API_NOT_RUNNING** and **VISUALIZER_FOUND**:

```bash
cd "$VISUALIZER_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --production 2>&1
fi

# Start API server with project directory for database isolation
nohup node server.js --project-dir "$PROJECT_DIR" > /tmp/claudia-brain-api.log 2>&1 &
sleep 2

# Verify it started
if curl -s http://localhost:3849/health > /dev/null 2>&1; then
  echo "API_STARTED"
else
  echo "API_FAILED"
  tail -10 /tmp/claudia-brain-api.log
fi
```

### Step 5: Start Vite dev server if not running

If **FRONTEND_NOT_RUNNING** and **VISUALIZER_FOUND**:

```bash
cd "$VISUALIZER_DIR"

# Install dev deps if needed (vite)
if [ ! -d "node_modules/.bin/vite" ] && [ ! -d "node_modules/vite" ]; then
  echo "Installing dev dependencies..."
  npm install 2>&1
fi

# Start Vite in background
nohup npm run dev > /tmp/claudia-brain.log 2>&1 &
sleep 3

# Check which port Vite claimed
if curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "FRONTEND_STARTED:5173"
elif curl -s http://localhost:5174 > /dev/null 2>&1; then
  echo "FRONTEND_STARTED:5174"
else
  echo "FRONTEND_FAILED"
  tail -20 /tmp/claudia-brain.log
fi
```

### Step 6: Open in browser

```bash
PORT="${FRONTEND_PORT:-5173}"
open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null || echo "OPEN_MANUALLY:http://localhost:$PORT"
```

---

## Report to User

**If already running:**
```
Your brain is live at http://localhost:[PORT]
```

**If started successfully:**
```
**Brain Visualizer**
Live at http://localhost:[PORT]

Viewing database for: [PROJECT_DIR]

What you're seeing:
- **Entities** (people, orgs, projects, concepts) as colored nodes — size scales with importance
- **Relationships** as arcing edges with traveling pulse particles
- **Patterns** as wireframe clusters
- **Starfield** background — the galaxy is just ambiance

**Controls:**
- Click any node to see details, memories, and relationships
- Search bar (top left) to find specific entities — camera flies to matches
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

**If API server failed:**
```
The API server couldn't start. Check the log:
```bash
tail -50 /tmp/claudia-brain-api.log
```

Common issues:
- Port 3849 already in use (kill the old process first)
- Database not found for this project (make sure --project-dir is correct)
- Missing node_modules (run `npm install --production` in ~/.claudia/visualizer/)
```

**If frontend failed:**
Show the log output from `/tmp/claudia-brain.log` and suggest checking for port conflicts or missing node_modules.

---

## Tone

Treat this like showing someone something cool. A little proud of it. "Want to see what your memory graph looks like?" energy.
