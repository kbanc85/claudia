# Claudia Brain Visualizer

Real-time 3D visualization of Claudia's memory system. Entities, relationships, memories, patterns, and predictions rendered as an interactive force-directed graph with semantic clustering.

## Quick Start

```bash
cd visualizer
npm install
node server.js
# Open http://localhost:3849
```

The server auto-detects your Claudia memory database at `~/.claudia/memory/`.

### Options

```
--port 3849           Server port (default: 3849)
--project-dir /path   Use project-specific database (hashed like the daemon)
--db /path/to/db      Direct path to a .db file
```

### From a Claudia session

```
/brain
```

## What You See

### Nodes

| Type | Shape | Color |
|------|-------|-------|
| Person | Sphere | Warm gold |
| Organization | Cube | Blue |
| Project | Octahedron | Green |
| Concept | Icosahedron | Purple |
| Location | Sphere + rings | Orange |
| Memory (fact) | Particle | White |
| Memory (commitment) | Particle (pulsing) | Red |
| Memory (learning) | Particle | Green |
| Pattern | Wireframe icosahedron | Purple (breathing) |

Node size scales with `sqrt(importance)`. Opacity fades for items not accessed in 90+ days.

### Edges

- **Entity relationships:** Thickness = strength, directional particles for forward edges
- **Memory links:** Thin lines connecting memories to related entities
- **Historical relationships:** Dashed ghost edges (toggle with `?historical=true`)

### Real-Time Updates

The visualizer polls the database every 500ms via SSE. When Claudia learns something new in another session:

- New memories spawn with a flash animation
- Recalled memories pulse and brighten
- LLM-improved memories shimmer with golden aura
- New relationships draw in with growing edges
- Superseded relationships fade to dashed ghosts

### Controls

- **Click** a node to see details (memories, relationships, documents)
- **Search** entities and memories in the sidebar
- **Filter** by node type and memory type
- **Timeline** scrubber to view the graph at any point in time
- **Drag** to rotate, scroll to zoom

## Architecture

```
server.js          Express on :3849, static files + API
lib/database.js    Read-only SQLite (WAL mode), workspace hash
lib/graph.js       SQL -> graph JSON (nodes + edges)
lib/projection.js  UMAP 384-dim -> 3D (with graceful fallback)
lib/events.js      SSE stream, 500ms change detection
public/            Vanilla JS + 3d-force-graph (zero build step)
```

The visualizer opens the database in **read-only mode** and never interferes with the running memory daemon.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Server status + entity count |
| `GET /api/graph` | Full graph (nodes + edges + UMAP positions) |
| `GET /api/graph?historical=true` | Include superseded relationships |
| `GET /api/stats` | Counts for HUD overlay |
| `GET /api/entity/:id` | Entity detail with memories, relationships, documents |
| `GET /api/timeline?start=&end=` | Events for timeline scrubber |
| `GET /api/events` | SSE stream for real-time updates |

## Schema Compatibility

The visualizer detects available database columns at startup and adapts queries accordingly. It works with any schema version from v1 through v8+:

- Pre-v5: No verification_status on memories (defaults to 'pending')
- Pre-v7: No documents table (documents section hidden)
- Pre-v8: No bi-temporal relationships (no historical toggle)
