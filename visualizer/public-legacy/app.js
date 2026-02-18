/**
 * Claudia Brain Visualizer — Main orchestrator
 * Fetches graph data, initializes 3D visualization, subscribes to SSE.
 */

import { initGraph, updateGraph, focusNode, getGraph } from './graph.js';
import { initEffects, markNodesDirty } from './effects.js';
import { initUI, updateStats, showDetail, addSearchResults, updateTimeline } from './ui.js';

let graphData = null;
let eventSource = null;

// ── Bootstrap ───────────────────────────────────────────────

async function init() {
  try {
    // Fetch initial graph data
    const res = await fetch('/api/graph');
    graphData = await res.json();

    console.log(`Loaded ${graphData.nodes.length} nodes, ${graphData.links.length} links`);
    console.log(`UMAP: ${graphData.meta.umapEnabled ? 'enabled' : 'disabled (force layout)'}`);

    // Initialize 3D graph (async for WebGPU renderer init)
    await initGraph(graphData, document.getElementById('graph-container'));

    // Initialize post-processing effects (async — loads bloom via ES modules)
    await initEffects();

    // Initialize UI (search, filters, detail panel, timeline)
    initUI(graphData);

    // Fetch stats for HUD
    refreshStats();

    // Connect SSE for real-time updates
    connectSSE();

    // Fetch timeline data
    refreshTimeline();

  } catch (err) {
    console.error('Failed to initialize:', err);
    const container = document.getElementById('graph-container');
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color:#ef4444;padding:40px;font-size:16px;';
    const msg = document.createElement('span');
    msg.textContent = 'Failed to connect to Claudia Brain. ';
    const detail = document.createElement('small');
    detail.style.color = '#808098';
    detail.textContent = err.message;
    errorDiv.appendChild(msg);
    errorDiv.appendChild(detail);
    container.appendChild(errorDiv);
  }
}

// ── Stats refresh ───────────────────────────────────────────

async function refreshStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    updateStats(stats);
  } catch {
    // Silently retry
  }
}

// ── Timeline refresh ────────────────────────────────────────

async function refreshTimeline() {
  try {
    const res = await fetch('/api/timeline');
    const events = await res.json();
    updateTimeline(events);
  } catch {
    // Timeline is optional
  }
}

// ── SSE connection ──────────────────────────────────────────

function connectSSE() {
  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleEvent(data);
    } catch {
      // Ignore parse errors
    }
  };

  eventSource.onerror = () => {
    // EventSource auto-reconnects
    console.warn('SSE connection lost, reconnecting...');
  };
}

// ── Event handlers ──────────────────────────────────────────

function handleEvent(event) {
  const graph = getGraph();
  if (!graph) return;

  // Pulse the activity indicator
  const pulse = document.getElementById('activity-pulse');
  pulse.style.background = '#6366f1';
  setTimeout(() => { pulse.style.background = '#10b981'; }, 1000);

  switch (event.type) {
    case 'memory_created':
      handleMemoryCreated(event.data);
      break;
    case 'memory_accessed':
      handleMemoryAccessed(event.data);
      break;
    case 'memory_improved':
      handleMemoryImproved(event.data);
      break;
    case 'entity_created':
      handleEntityCreated(event.data);
      break;
    case 'relationship_created':
      handleRelationshipCreated(event.data);
      break;
    case 'relationship_superseded':
      handleRelationshipSuperseded(event.data);
      break;
    case 'pattern_detected':
      handlePatternDetected(event.data);
      break;
    case 'prediction_created':
      handlePredictionCreated(event.data);
      break;
    case 'importance_decay':
      handleImportanceDecay(event.data);
      break;
  }

  // Refresh stats on any event
  refreshStats();
}

function handleMemoryCreated(data) {
  const MEMORY_COLORS = {
    fact: '#e2e8f0', commitment: '#f87171', learning: '#4ade80',
    observation: '#93c5fd', preference: '#fbbf24', pattern: '#a78bfa'
  };

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
    __spawn: true // flag for spawn animation
  };

  graphData.nodes.push(node);
  updateGraph(graphData);
  markNodesDirty();

  // Brief focus on new node
  setTimeout(() => focusNode(node, 1500), 200);
}

function handleMemoryAccessed(data) {
  const node = graphData.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.__pulse = true;
    node.importance = data.importance;
    updateGraph(graphData);
    markNodesDirty();
    setTimeout(() => { node.__pulse = false; }, 2000);
  }
}

function handleMemoryImproved(data) {
  const node = graphData.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.__shimmer = true;
    node.llmImproved = true;
    node.content = data.content;
    updateGraph(graphData);
    markNodesDirty();
    setTimeout(() => { node.__shimmer = false; }, 3000);
  }
}

function handleEntityCreated(data) {
  const NODE_COLORS = {
    person: '#fbbf24', organization: '#60a5fa',
    project: '#34d399', concept: '#c084fc', location: '#fb923c'
  };

  const node = {
    id: `entity-${data.id}`,
    dbId: data.id,
    nodeType: 'entity',
    entityType: data.type,
    name: data.name,
    importance: data.importance,
    color: NODE_COLORS[data.type] || '#888',
    size: Math.max(3, Math.sqrt(data.importance) * 8),
    opacity: 1,
    __spawn: true
  };

  graphData.nodes.push(node);
  updateGraph(graphData);
  markNodesDirty();
  setTimeout(() => focusNode(node, 2000), 200);
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

  graphData.links.push(link);
  updateGraph(graphData);
  markNodesDirty();
}

function handleRelationshipSuperseded(data) {
  const link = graphData.links.find(l => l.id === `rel-${data.id}`);
  if (link) {
    link.dashed = true;
    link.historical = true;
    link.color = 'rgba(255,255,255,0.08)';
    link.invalidAt = data.invalid_at;
    updateGraph(graphData);
    markNodesDirty();
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

  graphData.nodes.push(node);
  updateGraph(graphData);
  markNodesDirty();
}

function handlePredictionCreated(data) {
  // Predictions aren't nodes, but flash the HUD
  const statEl = document.getElementById('stat-patterns');
  if (statEl) {
    statEl.style.color = '#38bdf8';
    setTimeout(() => { statEl.style.color = ''; }, 2000);
  }
}

function handleImportanceDecay(data) {
  const node = graphData.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.importance = data.importance;
    node.size = Math.max(1.5, data.importance * 3);
    node.opacity = Math.max(0.15, data.importance);
  }
}

// ── Start ───────────────────────────────────────────────────

init();
