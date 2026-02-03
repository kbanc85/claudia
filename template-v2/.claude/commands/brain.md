# Brain

Launch the Claudia Brain Visualizer, a real-time 3D visualization of my memory system showing entities, relationships, memories, patterns, and predictions as an interactive force-directed graph.

**Triggers:** `/brain`, "show me your brain", "visualize memory", "open the brain", "memory graph"

---

## Prerequisites

The visualizer requires:
1. **Memory daemon** running (provides the graph API)
2. **Vite dev server** running (serves the Three.js app)

---

## Launch

### Step 1: Check if visualizer is already running

```bash
if curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "VISUALIZER_RUNNING:5173"
elif curl -s http://localhost:5174 > /dev/null 2>&1; then
  echo "VISUALIZER_RUNNING:5174"
else
  echo "VISUALIZER_NOT_RUNNING"
fi
```

### Step 2: Check if memory daemon is running

```bash
if curl -s http://localhost:3848/health > /dev/null 2>&1; then
  echo "DAEMON_RUNNING"
else
  echo "DAEMON_NOT_RUNNING"
fi
```

### Step 3: Find the visualizer directory

```bash
VISUALIZER_DIR=""
for dir in \
  "$HOME/.claudia/visualizer-threejs" \
  "$(dirname "$(which get-claudia 2>/dev/null)")/../lib/node_modules/get-claudia/visualizer-threejs" \
  "$(npm root -g 2>/dev/null)/get-claudia/visualizer-threejs"; do
  if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
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

### Step 4: Start visualizer if not running

If **VISUALIZER_NOT_RUNNING** and **VISUALIZER_FOUND**:

```bash
cd "$VISUALIZER_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install 2>&1
fi

# Start Vite dev server in background
nohup npm run dev > /tmp/claudia-brain.log 2>&1 &
BRAIN_PID=$!
sleep 3

# Check if started successfully
if curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "STARTED:5173"
elif curl -s http://localhost:5174 > /dev/null 2>&1; then
  echo "STARTED:5174"
else
  echo "FAILED"
  tail -20 /tmp/claudia-brain.log
fi
```

### Step 5: Open in browser

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

**If visualizer not found:**
```
The Brain Visualizer isn't installed. It ships with the visualizer-threejs directory in the Claudia package.

To install manually:
1. Copy visualizer-threejs/ to ~/.claudia/visualizer-threejs
2. Run `npm install` in that directory
3. Try `/brain` again
```

**If failed:**
Show the log output and suggest checking `/tmp/claudia-brain.log`.

---

## Tone

Treat this like showing someone a cool feature. Be a little proud of it. "Want to see what your memory graph looks like?" energy.
