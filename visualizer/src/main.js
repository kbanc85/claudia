/**
 * Claudia Brain Visualizer -- Main entry point (3d-force-graph)
 *
 * Initializes ForceGraph3D, configures node/link rendering,
 * connects SSE for live updates, and wires the UI overlays.
 * Theme, settings, and camera modules provide live switching.
 */

import ForceGraph3D from '3d-force-graph';

import {
  setGraphInstance,
  getGraphInstance,
  setGraphData,
  getGraphData,
  addNode,
  addLink,
  setSelectedNode,
  highlightNeighborhood,
  clearSelection,
  filterNodes,
  resetFilter,
  focusNode
} from './graph.js';

import { createNodeObject, ENTITY_COLORS, MEMORY_COLORS } from './nodes.js';
import { configureLinks, fireSynapse, fireSynapseBurst, fireNodeSynapses } from './links.js';
import { initEffects, animateNodes, updateFps } from './effects.js';
import { getActiveTheme, setActiveTheme } from './themes.js';
import { loadSettings, getSetting } from './settings.js';
import { tickCamera, setCameraMode, getCameraMode, getCameraModes, pauseCamera } from './camera.js';

import {
  initUI,
  updateStats,
  showDetail,
  updateTimeline
} from './ui.js';

let eventSource = null;
let startTime = performance.now();

// ── Bootstrap ───────────────────────────────────────────

async function init() {
  const container = document.getElementById('graph-container');

  // Load persisted settings + apply saved theme
  const settings = loadSettings();
  setActiveTheme(settings.theme || 'deep-space');
  setCameraMode(settings.cameraMode || 'slowOrbit');

  const theme = getActiveTheme();

  try {
    // Fetch graph data
    const res = await fetch('/api/graph');
    const data = await res.json();
    console.log(`Loaded ${data.nodes.length} nodes, ${data.links.length} links`);
    console.log(`UMAP: ${data.meta?.umapEnabled ? 'enabled' : 'disabled (force layout)'}`);

    // Store data
    setGraphData(data);

    // Apply UMAP positions as initial coordinates
    for (const node of data.nodes) {
      if (node.fx !== undefined) {
        node.x = node.fx * 50;
        node.y = node.fy * 50;
        node.z = node.fz * 50;
        delete node.fx;
        delete node.fy;
        delete node.fz;
      }
    }

    // Read antialias setting
    const antialias = getSetting('performance.antialias') !== false;

    // Create 3d-force-graph instance (prefer high-performance GPU)
    const Graph = ForceGraph3D({
      rendererConfig: {
        powerPreference: 'high-performance',
        antialias,
        alpha: false
      }
    })(container)
      .graphData(data)
      .backgroundColor(theme.background)

      // Force simulation tuning
      .d3AlphaDecay(getSetting('simulation.alphaDecay') ?? 0.008)
      .d3VelocityDecay(getSetting('simulation.velocityDecay') ?? 0.4)

      // Node rendering
      .nodeThreeObject(node => createNodeObject(node))
      .nodeThreeObjectExtend(false)

      // Interaction
      .onNodeClick(node => handleNodeClick(node))
      .onBackgroundClick(() => clearSelection())
      .onNodeHover(node => {
        container.style.cursor = node ? 'pointer' : 'default';
      })

      // Engine tick (animations + FPS + camera)
      .onEngineTick(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        const delta = 1 / 60;

        animateNodes(Graph, elapsed, delta);
        updateFps();
        tickCamera(Graph, elapsed);
      });

    // Store graph instance
    setGraphInstance(Graph);

    // Configure force strengths (must be done after graph creation)
    const chargeStrength = getSetting('simulation.chargeStrength') ?? -180;
    Graph.d3Force('charge')
      .strength(node => {
        if (node.nodeType === 'entity') return chargeStrength;
        if (node.nodeType === 'pattern') return chargeStrength * 0.55;
        return chargeStrength * 0.08;
      })
      .distanceMax(300);

    const linkDist = getSetting('simulation.linkDistance') ?? 80;
    const linkStr = getSetting('simulation.linkStrength') ?? 0.3;
    Graph.d3Force('link')
      .distance(link => {
        if (link.linkType === 'relationship') return linkDist + (1 - (link.strength || 0.5)) * 40;
        return linkDist * 0.22;
      })
      .strength(link => {
        if (link.linkType === 'relationship') return (link.strength || 0.5) * linkStr;
        return linkStr * 1.33;
      });

    // Configure link appearance (curves, particles, colors)
    configureLinks(Graph);

    // Add bloom post-processing
    initEffects(Graph);

    // Engine info display
    const engineInfo = document.getElementById('engine-info');
    if (engineInfo) {
      engineInfo.textContent = 'Three.js';
      engineInfo.style.fontSize = '10px';
      engineInfo.style.color = '#34d399';
    }

    // Initialize UI (pass graph getter for simulation controls)
    initUI(data, {
      focusNode: handleFocusNode,
      filterNodes: filterNodes,
      resetFilter: resetFilter,
      getGraph: () => Graph
    });

    // Setup camera pause on interaction
    setupInteractionPause(container);

    // Warm up: let simulation settle, then kick off camera rotation
    Graph.d3Force('center', null);
    setTimeout(() => {
      Graph.zoomToFit(1000, 50);
      // Ensure autoRotate starts after camera settles
      setTimeout(() => {
        const controls = Graph.controls();
        const mode = getCameraMode();
        const modes = getCameraModes();
        if (controls && mode !== 'static' && modes[mode]) {
          controls.autoRotate = true;
          controls.autoRotateSpeed = modes[mode].autoRotateSpeed;
        }
      }, 1200);
    }, 2000);

    // Fetch stats and timeline
    refreshStats();
    refreshTimeline();

    // Connect SSE
    connectSSE();

  } catch (err) {
    console.error('Failed to initialize:', err);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color:#ef4444;padding:40px;font-size:16px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:200;';
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

// ── Node click handling ─────────────────────────────────

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

  pauseCamera();
}

// ── Camera focus ────────────────────────────────────────

function handleFocusNode(node, duration) {
  if (!node) return;
  focusNode(node);
}

// ── Interaction pause (replaces old auto-orbit) ─────────

function setupInteractionPause(container) {
  container.addEventListener('pointerdown', pauseCamera);
  container.addEventListener('wheel', pauseCamera);
}

// ── Stats refresh ───────────────────────────────────────

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

// ── SSE connection ──────────────────────────────────────

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

// ── Event handlers ──────────────────────────────────────

function handleEvent(event) {
  // Pulse activity indicator
  const pulse = document.getElementById('activity-pulse');
  if (pulse) {
    pulse.style.background = '#6366f1';
    setTimeout(() => { pulse.style.background = '#10b981'; }, 1000);
  }

  switch (event.type) {
    case 'memory_created':            handleMemoryCreated(event.data); break;
    case 'memory_accessed':           handleMemoryAccessed(event.data); break;
    case 'memory_improved':           handleMemoryImproved(event.data); break;
    case 'entity_created':            handleEntityCreated(event.data); break;
    case 'relationship_created':      handleRelationshipCreated(event.data); break;
    case 'relationship_superseded':   handleRelationshipSuperseded(event.data); break;
    case 'pattern_detected':          handlePatternDetected(event.data); break;
    case 'prediction_created':        handlePredictionCreated(event.data); break;
    case 'importance_decay':          handleImportanceDecay(event.data); break;
  }

  refreshStats();
}

function handleMemoryCreated(data) {
  const theme = getActiveTheme();
  const node = {
    id: `memory-${data.id}`,
    dbId: data.id,
    nodeType: 'memory',
    memoryType: data.type,
    name: data.content?.slice(0, 60) || '',
    content: data.content,
    importance: data.importance,
    color: theme.memories[data.type] || '#888',
    size: Math.max(1.5, data.importance * 3),
    opacity: 1,
    createdAt: data.created_at,
    __spawn: true
  };

  addNode(node);

  setTimeout(() => {
    fireNodeSynapses(node.id, getGraphData());
    handleFocusNode(node);
  }, 500);
}

function handleMemoryAccessed(data) {
  const gd = getGraphData();
  const node = gd.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.__pulse = true;
    node.importance = data.importance;
    fireNodeSynapses(node.id, gd);
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
  const theme = getActiveTheme();
  const node = {
    id: `entity-${data.id}`,
    dbId: data.id,
    nodeType: 'entity',
    entityType: data.type,
    name: data.name,
    importance: data.importance,
    color: theme.entities[data.type] || '#888',
    size: Math.max(3, Math.sqrt(data.importance) * 8),
    opacity: 1,
    __spawn: true
  };

  addNode(node);
  setTimeout(() => handleFocusNode(node), 500);
}

function handleRelationshipCreated(data) {
  const link = {
    id: `rel-${data.id}`,
    source: `entity-${data.source_entity_id}`,
    target: `entity-${data.target_entity_id}`,
    linkType: 'relationship',
    label: data.relationship_type,
    strength: data.strength,
    width: Math.max(0.5, data.strength * 3)
  };

  addLink(link);

  setTimeout(() => {
    const gd = getGraphData();
    const createdLink = gd.links.find(l => l.id === link.id);
    if (createdLink) fireSynapseBurst(createdLink);
  }, 300);
}

function handleRelationshipSuperseded(data) {
  const gd = getGraphData();
  const link = gd.links.find(l => l.id === `rel-${data.id}`);
  if (link) {
    link.dashed = true;
    link.historical = true;
    link.color = getActiveTheme().links.historical;
    link.invalidAt = data.invalid_at;
    const Graph = getGraphInstance();
    if (Graph) Graph.linkColor(Graph.linkColor());
  }
}

function handlePatternDetected(data) {
  const theme = getActiveTheme();
  const node = {
    id: `pattern-${data.id}`,
    dbId: data.id,
    nodeType: 'pattern',
    patternType: data.pattern_type,
    name: data.name,
    confidence: data.confidence,
    color: theme.pattern.color,
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
  }
}

// ── Start ───────────────────────────────────────────────

init();
