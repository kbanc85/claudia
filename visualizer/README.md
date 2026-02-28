# Claudia Brain Visualizer

Claudia's primary `/brain` experience: a relationship-first 3D knowledge graph for exploring the local memory database.

This implementation is intended to replace the older experimental visualizer runtime paths while keeping the rest of Claudia's installer, template, and memory-daemon architecture intact.

## What This Ships

- React + `react-three-fiber` scene with custom node, edge, label, camera, and effects layers
- Entity-first overview graph with optional memory overlay
- Neighborhood expansion and relationship trace mode
- Live database switching across local Claudia databases
- Tunable scene controls for labels, line weight, particles, grid, fog, and post-processing
- Side panels for search, metrics, evidence, commitments, and live tuning

## Non-Goals

- No schema rewrites for Claudia core memory storage
- No installer or template behavior changes outside the `/brain` surface
- No destructive removal of core Claudia functionality

Legacy visualizer assets are deprecated and should not be used as the active `/brain` runtime path once this version lands.

## Quick Start

```bash
cd visualizer
npm install
node server.js
# Open http://localhost:3849
```

The server auto-detects the Claudia memory database at `~/.claudia/memory/`.

### Options

```text
--port 3849           Server port (default: 3849)
--project-dir /path   Use project-specific database (hashed like the daemon)
--db /path/to/db      Direct path to a .db file
```

### From a Claudia session

```text
/brain
```

## Architecture

```text
server.js                 Express server + normalized graph APIs
lib/graph-data.js         Shared dataset loading and graph normalization
lib/overview.js           Entity-first overview graph
lib/neighborhood.js       Local entity/memory neighborhood expansion
lib/trace.js              Relationship path tracing with evidence
src/app/                  Shell layout
src/components/           HUD, sidebars, settings, timeline, inspector
src/engine/               R3F scene, layout worker, labels, camera, edges
src/store/                Zustand app state
```

### Frontend stack

- `react`
- `zustand`
- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/postprocessing`
- `d3-force-3d`

## Current Behavior

### Overview mode

- Entities stay primary
- Patterns remain visible by default
- Commitments stay visible by default
- Full memory overlay is optional
- `fact` memories start hidden by default to avoid overloading weaker systems

### Interaction model

- Click to select and inspect
- Double-click to expand deeper evidence
- Shift-click two entities to trace a path
- Hide left, right, or bottom panels independently
- Save, export, and import visual settings

## Settings

The right inspector's `Tune` mode exposes live controls for:

- Entity, memory, and pattern scale
- Label size and label density
- Line thickness, selected thickness, curvature, and opacity
- Camera speed and orbit behavior
- Bloom, chromatic aberration, particles
- Fog and grid density/opacity
- Entity, memory, and commitment colors
- Theme switching

## Themes

Built-in themes include:

- Claudia Core
- Infrared Ops
- Polar Signal
- Matrix Construct
- Lightcycle Grid
- Offworld Noir

## Testing

```bash
npm run build
npm run test:smoke
```

`npm run test:smoke` is only a shell-level check. In headless Chromium, WebGL context creation may fail, so final visual verification still needs a normal desktop browser session.
