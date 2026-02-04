---
name: brain
description: Launch the Brain Visualizer, a real-time 3D view of memory and relationships. Triggers on "show your brain", "visualize memory", "open the brain", "memory graph".
---

# Brain

Launch the Claudia Brain Visualizer, a real-time 3D visualization of my memory system showing entities, relationships, memories, patterns, and predictions as an interactive force-directed graph.

**Triggers:** `/brain`, "show me your brain", "visualize memory", "open the brain", "memory graph"

---

## Prerequisites

The visualizer requires:
1. **Memory daemon** running on port 3848 (handles embeddings)
2. **API server** running on port 3849 (serves graph data from database)
3. **Vite dev server** running on port 5173/5174 (Three.js frontend)

The API server must be started with `--project-dir` pointing to the current Claudia installation to access the correct per-project database.

---

## Launch

### Step 1: Identify the current project directory

The project directory is the Claudia installation root (where `context/me.md` lives). This is needed for database isolation.

```bash
# The Claudia installation directory (where this command is being run from)
PROJECT_DIR="$(pwd)"
echo "PROJECT_DIR:$PROJECT_DIR"
```

### Step 2: Check if visualizer frontend is already running

```bash
if curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "FRONTEND_RUNNING:5173"
elif curl -s http://localhost:5174 > /dev/null 2>&1; then
  echo "FRONTEND_RUNNING:5174"
else
  echo "FRONTEND_NOT_RUNNING"
fi
```

### Step 3: Check if API server is running

```bash
if curl -s http://localhost:3849/health > /dev/null 2>&1; then
  echo "API_RUNNING"
else
  echo "API_NOT_RUNNING"
fi
```

### Step 4: Check if memory daemon is running

```bash
if curl -s http://localhost:3848/health > /dev/null 2>&1; then
  echo "DAEMON_RUNNING"
else
  echo "DAEMON_NOT_RUNNING"
fi
```

### Step 5: Find the visualizer directories

```bash
VISUALIZER_DIR=""
BACKEND_DIR=""

# Find Three.js frontend
for dir in \
  "$HOME/.claudia/visualizer-threejs" \
  "$(dirname "$(which get-claudia 2>/dev/null)")/../lib/node_modules/get-claudia/visualizer-threejs" \
  "$(npm root -g 2>/dev/null)/get-claudia/visualizer-threejs"; do
  if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
    VISUALIZER_DIR="$dir"
    break
  fi
done

# Find API backend (in visualizer/ sibling directory)
for dir in \
  "$HOME/.claudia/visualizer" \
  "$(dirname "$(which get-claudia 2>/dev/null)")/../lib/node_modules/get-claudia/visualizer" \
  "$(npm root -g 2>/dev/null)/get-claudia/visualizer"; do
  if [ -d "$dir" ] && [ -f "$dir/server.js" ]; then
    BACKEND_DIR="$dir"
    break
  fi
done

if [ -z "$VISUALIZER_DIR" ]; then
  echo "VISUALIZER_NOT_FOUND"
else
  echo "VISUALIZER_FOUND:$VISUALIZER_DIR"
fi

if [ -z "$BACKEND_DIR" ]; then
  echo "BACKEND_NOT_FOUND"
else
  echo "BACKEND_FOUND:$BACKEND_DIR"
fi
```

### Step 6: Start API backend if not running

If **API_NOT_RUNNING** and **BACKEND_FOUND**:

```bash
cd "$BACKEND_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing backend dependencies..."
  npm install 2>&1
fi

# Start API server with project directory for database isolation
nohup node server.js --project-dir "$PROJECT_DIR" > /tmp/claudia-brain-api.log 2>&1 &
API_PID=$!
sleep 2

# Check if started successfully
if curl -s http://localhost:3849/health > /dev/null 2>&1; then
  echo "API_STARTED"
else
  echo "API_FAILED"
  tail -10 /tmp/claudia-brain-api.log
fi
```

### Step 7: Start frontend if not running

If **FRONTEND_NOT_RUNNING** and **VISUALIZER_FOUND**:

```bash
cd "$VISUALIZER_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install 2>&1
fi

# Start Vite dev server in background
nohup npm run dev > /tmp/claudia-brain.log 2>&1 &
BRAIN_PID=$!
sleep 3

# Check if started successfully
if curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "FRONTEND_STARTED:5173"
elif curl -s http://localhost:5174 > /dev/null 2>&1; then
  echo "FRONTEND_STARTED:5174"
else
  echo "FRONTEND_FAILED"
  tail -20 /tmp/claudia-brain.log
fi
```

### Step 8: Open in browser

```bash
PORT="${PORT:-5173}"
open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null || echo "OPEN_MANUALLY:$PORT"
```

---

## Report to User

**If already running:**
```
Your brain is already live at http://localhost:[PORT]
```

**If started successfully:**
```
**Brain Visualizer**
Launched at http://localhost:[PORT]

Viewing database for: [PROJECT_DIR]

What you're seeing:
- **Entities** (people, orgs, projects, concepts) as colored nodes
- **Memories** as smaller particles orbiting connected entities
- **Relationships** as curved edges between entities
- **Patterns** as wireframe clusters

**Controls:**
- Click any node for details
- Press **H** to open the design panel (tweak colors, bloom, animations)
- Use the search bar to find specific entities
- The graph updates in real-time as I learn
```

**If daemon not running:**
```
The memory daemon isn't running. Start it first:

```bash
cd ~/.claudia && python -m claudia_memory
```

Then try `/brain` again.
```

**If API server failed:**
```
The API server couldn't start. Check the log:
```bash
tail -50 /tmp/claudia-brain-api.log
```

Common issues:
- Port 3849 already in use
- Database not found for this project
- Missing node_modules (run `npm install` in the visualizer directory)
```

**If visualizer not found:**
```
The Brain Visualizer isn't installed. It ships with the visualizer and visualizer-threejs directories in the Claudia package.

To install manually:
1. Copy visualizer/ to ~/.claudia/visualizer
2. Copy visualizer-threejs/ to ~/.claudia/visualizer-threejs
3. Run `npm install` in both directories
4. Try `/brain` again
```

**If frontend failed:**
Show the log output and suggest checking `/tmp/claudia-brain.log`.

---

## Tone

Treat this like showing someone a cool feature. Be a little proud of it. "Want to see what your memory graph looks like?" energy.
