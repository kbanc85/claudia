/**
 * Claudia Brain Visualizer — Main entry point (Babylon.js 8)
 *
 * Initializes the Babylon engine (WebGPU with WebGL 2 fallback),
 * creates the scene, connects SSE for live updates, and orchestrates
 * the graph, effects, and UI modules.
 */

import {
  WebGPUEngine,
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  PointLight,
  Vector3,
  Color3,
  Color4
} from '@babylonjs/core';

import {
  initGraph,
  tickSimulation,
  syncPositions,
  addNode,
  addLink,
  updateNodeData,
  getGraphData,
  setSelectedNode,
  highlightNeighborhood,
  clearSelection,
  filterNodes,
  resetFilter,
  getNodePositions
} from './graph.js';

import { getAllNodeMeshes } from './nodes.js';

import {
  initEffectsSync,
  updateAmbientParticles,
  updateNebula,
  updateFps,
  animateNodes
} from './effects.js';

import {
  initUI,
  updateStats,
  showDetail,
  updateTimeline,
  setGraphData
} from './ui.js';

import { ENTITY_COLORS, MEMORY_COLORS } from './nodes.js';

let engine = null;
let scene = null;
let camera = null;
let canvas = null;
let graphData = null;
let eventSource = null;
let startTime = performance.now();

// Auto-orbit
let autoRotate = true;
let idleTimer = null;

// ── Bootstrap ───────────────────────────────────────────────

async function init() {
  canvas = document.getElementById('renderCanvas');

  try {
    // Try WebGPU first, fall back to WebGL 2
    engine = await createEngine(canvas);

    scene = new Scene(engine);
    scene.clearColor = new Color4(0.02, 0.02, 0.06, 1); // #050510

    // Camera
    camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2.5, 350, Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 30;
    camera.upperRadiusLimit = 1500;
    camera.wheelDeltaPercentage = 0.02;
    camera.inertia = 0.92;
    camera.panningSensibility = 30;

    // Position camera for panoramic initial view
    camera.setPosition(new Vector3(0, 80, 350));

    // Lighting
    const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.6;
    hemiLight.diffuse = new Color3(0.1, 0.1, 0.25);

    const keyLight = new PointLight('key', new Vector3(150, 250, 150), scene);
    keyLight.intensity = 1.0;
    keyLight.diffuse = new Color3(0.39, 0.40, 0.95); // #6366f1

    const fillLight = new PointLight('fill', new Vector3(-200, -150, 200), scene);
    fillLight.intensity = 0.5;
    fillLight.diffuse = new Color3(0.05, 0.65, 0.91); // #0ea5e9

    const accentLight = new PointLight('accent', new Vector3(0, 100, -200), scene);
    accentLight.intensity = 0.3;
    accentLight.diffuse = new Color3(0.96, 0.62, 0.04); // #f59e0b

    // Display engine info
    const engineInfo = document.getElementById('engine-info');
    if (engineInfo) {
      const isWebGPU = engine.constructor.name.includes('WebGPU') || engine.isWebGPU;
      engineInfo.textContent = isWebGPU ? 'WebGPU' : 'WebGL 2';
      engineInfo.style.fontSize = '10px';
      engineInfo.style.color = isWebGPU ? '#34d399' : '#fbbf24';
    }

    // Initialize effects (bloom, glow, particles, fog)
    initEffectsSync(scene, camera, engine);

    // Fetch graph data
    const res = await fetch('/api/graph');
    graphData = await res.json();
    console.log(`Loaded ${graphData.nodes.length} nodes, ${graphData.links.length} links`);
    console.log(`UMAP: ${graphData.meta?.umapEnabled ? 'enabled' : 'disabled (force layout)'}`);

    // Initialize force graph
    initGraph(graphData, scene);

    // Initialize UI
    initUI(graphData, {
      focusNode: handleFocusNode,
      filterNodes: filterNodes,
      resetFilter: resetFilter
    });

    // Node picking
    setupPicking();

    // Auto-orbit
    setupAutoOrbit();

    // Render loop
    engine.runRenderLoop(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      const delta = engine.getDeltaTime() / 1000;

      // Tick force simulation
      tickSimulation();

      // Animate node meshes (breathing, spawn, pulse, shimmer)
      const meshMap = getAllNodeMeshes();
      animateNodes(meshMap, elapsed, delta);

      // Ambient effects
      updateAmbientParticles(elapsed);
      updateNebula(elapsed);

      // Auto-orbit rotation
      if (autoRotate) {
        camera.alpha += 0.0005;
      }

      // FPS
      updateFps();

      scene.render();
    });

    // Handle resize
    window.addEventListener('resize', () => engine.resize());

    // Fetch stats and timeline
    refreshStats();
    refreshTimeline();

    // Connect SSE
    connectSSE();

  } catch (err) {
    console.error('Failed to initialize:', err);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color:#ef4444;padding:40px;font-size:16px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);';
    const msg = document.createElement('span');
    msg.textContent = 'Failed to connect to Claudia Brain. ';
    const detail = document.createElement('small');
    detail.style.color = '#808098';
    detail.textContent = err.message;
    errorDiv.appendChild(msg);
    errorDiv.appendChild(detail);
    document.body.appendChild(errorDiv);
  }
}

// ── Engine creation (WebGPU with fallback) ──────────────────

async function createEngine(canvas) {
  // Try WebGPU
  if (navigator.gpu) {
    try {
      const webgpuEngine = new WebGPUEngine(canvas, {
        antialias: true,
        adaptToDeviceRatio: true
      });
      await webgpuEngine.initAsync();
      console.log('Babylon.js 8 — WebGPU engine initialized');
      return webgpuEngine;
    } catch (err) {
      console.warn('WebGPU init failed, falling back to WebGL:', err.message);
    }
  }

  // Fallback to WebGL 2
  const glEngine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
  });
  console.log('Babylon.js 8 — WebGL 2 engine initialized');
  return glEngine;
}

// ── Picking (click/hover) ───────────────────────────────────

function setupPicking() {
  scene.onPointerDown = (evt, pickResult) => {
    if (evt.button !== 0) return; // left click only

    if (pickResult.hit && pickResult.pickedMesh?.metadata?.node) {
      const node = pickResult.pickedMesh.metadata.node;
      handleNodeClick(node);
    } else {
      // Background click
      clearSelection();
    }
  };

  scene.onPointerMove = (evt, pickResult) => {
    if (pickResult.hit && pickResult.pickedMesh?.metadata?.node) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'default';
    }
  };
}

function handleNodeClick(node) {
  setSelectedNode(node);
  highlightNeighborhood(node);
  handleFocusNode(node);

  if (node.nodeType === 'entity') {
    fetch(`/api/entity/${node.dbId}`)
      .then(r => r.json())
      .then(detail => showDetail(node, detail))
      .catch(() => {});
  } else {
    showDetail(node, null);
  }

  // Pause auto-orbit temporarily
  pauseOrbit();
}

// ── Camera focus ────────────────────────────────────────────

function handleFocusNode(node, duration) {
  if (!node || !camera) return;

  const pos = getNodePositions().get(node.id);
  if (!pos) return;

  const target = new Vector3(pos.x, pos.y, pos.z);
  const distance = 120;

  // Animate camera to focus on node
  const currentTarget = camera.target.clone();
  const currentRadius = camera.radius;

  // Simple animation using scene's beforeRender
  const startTime = performance.now();
  const dur = duration || 1200;

  const animFn = () => {
    const t = Math.min(1, (performance.now() - startTime) / dur);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

    camera.target = Vector3.Lerp(currentTarget, target, ease);
    camera.radius = currentRadius + (distance - currentRadius) * ease;

    if (t >= 1) {
      scene.unregisterBeforeRender(animFn);
    }
  };

  scene.registerBeforeRender(animFn);
}

// ── Auto-orbit ──────────────────────────────────────────────

function setupAutoOrbit() {
  canvas.addEventListener('pointerdown', pauseOrbit);
  canvas.addEventListener('wheel', pauseOrbit);
}

function pauseOrbit() {
  autoRotate = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { autoRotate = true; }, 8000);
}

// ── Stats refresh ───────────────────────────────────────────

async function refreshStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    updateStats(stats);
  } catch {}
}

async function refreshTimeline() {
  try {
    const res = await fetch('/api/timeline');
    const events = await res.json();
    updateTimeline(events);
  } catch {}
}

// ── SSE connection ──────────────────────────────────────────

function connectSSE() {
  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleEvent(data);
    } catch {}
  };

  eventSource.onerror = () => {
    console.warn('SSE connection lost, reconnecting...');
  };
}

// ── Event handlers ──────────────────────────────────────────

function handleEvent(event) {
  // Pulse activity indicator
  const pulse = document.getElementById('activity-pulse');
  if (pulse) {
    pulse.style.background = '#6366f1';
    setTimeout(() => { pulse.style.background = '#10b981'; }, 1000);
  }

  switch (event.type) {
    case 'memory_created': handleMemoryCreated(event.data); break;
    case 'memory_accessed': handleMemoryAccessed(event.data); break;
    case 'memory_improved': handleMemoryImproved(event.data); break;
    case 'entity_created': handleEntityCreated(event.data); break;
    case 'relationship_created': handleRelationshipCreated(event.data); break;
    case 'relationship_superseded': handleRelationshipSuperseded(event.data); break;
    case 'pattern_detected': handlePatternDetected(event.data); break;
    case 'prediction_created': handlePredictionCreated(event.data); break;
    case 'importance_decay': handleImportanceDecay(event.data); break;
  }

  refreshStats();
}

function handleMemoryCreated(data) {
  const node = {
    id: `memory-${data.id}`,
    dbId: data.id,
    nodeType: 'memory',
    memoryType: data.type,
    name: data.content?.slice(0, 60) || '',
    content: data.content,
    importance: data.importance,
    color: MEMORY_COLORS[data.type] || '#888',
    size: Math.max(1.5, data.importance * 3),
    opacity: 1,
    createdAt: data.created_at,
    __spawn: true
  };

  addNode(node);
  setTimeout(() => handleFocusNode(node, 1500), 200);
}

function handleMemoryAccessed(data) {
  const gd = getGraphData();
  const node = gd.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.__pulse = true;
    node.importance = data.importance;
    setTimeout(() => { node.__pulse = false; }, 2000);
  }
}

function handleMemoryImproved(data) {
  const gd = getGraphData();
  const node = gd.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.__shimmer = true;
    node.llmImproved = true;
    node.content = data.content;
    setTimeout(() => { node.__shimmer = false; }, 3000);
  }
}

function handleEntityCreated(data) {
  const node = {
    id: `entity-${data.id}`,
    dbId: data.id,
    nodeType: 'entity',
    entityType: data.type,
    name: data.name,
    importance: data.importance,
    color: ENTITY_COLORS[data.type] || '#888',
    size: Math.max(3, Math.sqrt(data.importance) * 8),
    opacity: 1,
    __spawn: true
  };

  addNode(node);
  setTimeout(() => handleFocusNode(node, 2000), 200);
}

function handleRelationshipCreated(data) {
  const link = {
    id: `rel-${data.id}`,
    source: `entity-${data.source_entity_id}`,
    target: `entity-${data.target_entity_id}`,
    linkType: 'relationship',
    label: data.relationship_type,
    strength: data.strength,
    width: Math.max(0.5, data.strength * 3),
    __grow: true
  };

  addLink(link);
}

function handleRelationshipSuperseded(data) {
  const gd = getGraphData();
  const link = gd.links.find(l => l.id === `rel-${data.id}`);
  if (link) {
    link.dashed = true;
    link.historical = true;
    link.color = 'rgba(255,255,255,0.08)';
    link.invalidAt = data.invalid_at;
    syncPositions();
  }
}

function handlePatternDetected(data) {
  const node = {
    id: `pattern-${data.id}`,
    dbId: data.id,
    nodeType: 'pattern',
    patternType: data.pattern_type,
    name: data.name,
    confidence: data.confidence,
    color: '#a78bfa',
    size: Math.max(4, data.confidence * 10),
    opacity: Math.max(0.4, data.confidence),
    __spawn: true
  };

  addNode(node);
}

function handlePredictionCreated(data) {
  const statEl = document.getElementById('stat-patterns');
  if (statEl) {
    statEl.style.color = '#38bdf8';
    setTimeout(() => { statEl.style.color = ''; }, 2000);
  }
}

function handleImportanceDecay(data) {
  const gd = getGraphData();
  const node = gd.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.importance = data.importance;
    node.size = Math.max(1.5, data.importance * 3);
    node.opacity = Math.max(0.15, data.importance);

    updateNodeData(node.id, {
      importance: data.importance,
      size: node.size,
      opacity: node.opacity
    });
  }
}

// ── Start ───────────────────────────────────────────────────

init();
