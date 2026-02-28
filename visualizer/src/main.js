/**
 * Claudia Brain v4 -- Main bootstrap
 *
 * Initializes settings, themes, renderer, data, SSE, effects, UI, and render loop.
 * Everything wires through here.
 */

import { loadSettings, getSetting } from './settings.js';
import { getActiveTheme, setActiveTheme } from './themes.js';
import { createGraph, getGraph, isWebGPU } from './renderer.js';
import { fetchGraph, fetchStats, fetchTimeline } from './data/api.js';
import { setGraphInstance, setGraphData, getGraphData, addNode, addLink, updateNode, findNode, setSelectedNode, highlightNeighborhood, clearSelection, focusNode } from './data/store.js';
import { connect as sseConnect, on as sseOn } from './data/sse.js';
import { createNodeObject } from './graph/nodes.js';
import { configureLinks, fireNodeSynapses } from './graph/links.js';
import { initBloom } from './effects/bloom.js';
import { initAtmosphere } from './effects/atmosphere.js';
import { animateNodes, updateFps } from './effects/animations.js';
import { animateAmbientParticles } from './materials/ambient.js';
import { setCameraMode, pauseCamera, tickCamera } from './camera.js';
import { createMemoryParticles, updateMemoryParticles, addMemoryParticle } from './graph/memoryParticles.js';

// UI modules
import { initHUD, updateStats, updateFpsDisplay, flashPulse } from './ui/hud.js';
import { initSearch } from './ui/spotlight.js';
import { initDetailPanel, showDetail } from './ui/panel.js';
import { initControls } from './ui/controls.js';
import { initTimeline, updateTimeline } from './ui/timeline.js';
import { initDbSelector } from './ui/dbSelector.js';

// ── Node interaction ──────────────────────────────────────

function onNodeClick(node) {
  if (!node) {
    clearSelection();
    document.getElementById('detail-panel')?.classList.add('hidden');
    return;
  }
  setSelectedNode(node);
  highlightNeighborhood(node, getActiveTheme);
  focusNode(node);

  // Pulse effect
  node.__pulse = true;
  setTimeout(() => { node.__pulse = false; }, 600);

  // Fire synapses from clicked node
  fireNodeSynapses(node.id, getGraphData());

  // Show detail panel
  if (node.nodeType === 'entity') {
    fetch(`/api/entity/${node.dbId}`)
      .then(r => r.json())
      .then(detail => showDetail(node, detail))
      .catch(() => showDetail(node, null));
  } else {
    showDetail(node, null);
  }
}

function onBackgroundClick() {
  clearSelection();
  document.getElementById('detail-panel')?.classList.add('hidden');
}

// ── SSE event handlers ────────────────────────────────────

function handleSSE(data) {
  if (!data?.type) return;
  flashPulse();

  switch (data.type) {
    case 'new_memory': {
      const node = {
        id: `memory-${data.memory_id}`,
        dbId: data.memory_id,
        nodeType: 'memory',
        memoryType: data.memory_type || 'fact',
        name: data.content?.substring(0, 40) || '',
        importance: data.importance || 0.5,
        __spawn: true,
      };
      addNode(node);
      addMemoryParticle(node); // Add to GPU particle system

      if (data.entity_ids) {
        for (const eid of data.entity_ids) {
          addLink({
            source: node.id,
            target: `entity-${eid}`,
            linkType: 'memory_entity',
          });
        }
      }
      break;
    }

    case 'new_entity': {
      const node = {
        id: `entity-${data.entity_id}`,
        dbId: data.entity_id,
        nodeType: 'entity',
        entityType: data.entity_type || 'concept',
        name: data.name || '',
        importance: data.importance || 0.5,
        __spawn: true,
      };
      addNode(node);
      break;
    }

    case 'new_relationship': {
      addLink({
        source: `entity-${data.source_id}`,
        target: `entity-${data.target_id}`,
        linkType: 'relationship',
        relationType: data.relation_type || '',
        strength: data.strength || 0.5,
      });
      break;
    }

    case 'entity_updated': {
      const existing = findNode(`entity-${data.entity_id}`);
      if (existing) {
        updateNode(existing.id, {
          importance: data.importance ?? existing.importance,
        });
        existing.__shimmer = true;
        setTimeout(() => { existing.__shimmer = false; }, 2000);
      }
      break;
    }

    case 'memory_importance_changed': {
      const existing = findNode(`memory-${data.memory_id}`);
      if (existing) {
        updateNode(existing.id, { importance: data.importance });
        existing.__pulse = true;
        setTimeout(() => { existing.__pulse = false; }, 400);
      }
      break;
    }

    case 'consolidation_complete':
    case 'full_refresh': {
      loadGraphData();
      break;
    }
  }

  // Refresh stats on any event
  refreshStats();
}

// ── Data loading ──────────────────────────────────────────

async function loadGraphData() {
  try {
    const showHistorical = getSetting('performance.showHistorical') !== false;
    const data = await fetchGraph({ historical: showHistorical });
    setGraphData(data);

    const Graph = getGraph();
    if (Graph) {
      Graph.graphData({ nodes: data.nodes, links: data.links });

      // Build GPU particle system for memory nodes (replaces 901 individual meshes
      // with a single Points draw call -- the key FPS optimization)
      const scene = Graph.scene();
      if (scene) {
        const memoryNodes = data.nodes.filter(n => n.nodeType === 'memory');
        createMemoryParticles(scene, memoryNodes);
      }
    }
  } catch (e) {
    console.error('[Main] Failed to load graph:', e);
  }
}

async function refreshStats() {
  try {
    const stats = await fetchStats();
    updateStats(stats, getGraphData());
  } catch {}
}

async function refreshTimeline() {
  try {
    const events = await fetchTimeline();
    updateTimeline(events);
  } catch {}
}

// ── Simulation tuning ─────────────────────────────────────

function tuneSimulation(Graph) {
  const sim = Graph.d3Force;
  if (!sim) return;

  const charge = getSetting('simulation.chargeStrength') ?? -180;
  const linkDist = getSetting('simulation.linkDistance') ?? 80;
  const linkStr = getSetting('simulation.linkStrength') ?? 0.3;
  const velDecay = getSetting('simulation.velocityDecay') ?? 0.4;
  // Higher alphaDecay = faster settling = less CPU on force simulation
  const alphaDecay = getSetting('simulation.alphaDecay') ?? 0.028;

  try {
    sim('charge')?.strength(charge);
    sim('link')?.distance(linkDist)?.strength(linkStr);
    Graph.d3VelocityDecay(velDecay);
    Graph.d3AlphaDecay(alphaDecay);

    // Disable center force for large graphs (reduces jitter)
    const nodeCount = Graph.graphData()?.nodes?.length || 0;
    if (nodeCount > 500) {
      sim('center')?.strength(0.3); // Weaker centering
    }
  } catch (e) {
    console.warn('[Main] Simulation tuning error:', e);
  }
}

// ── Boot ──────────────────────────────────────────────────

async function boot() {
  // 1. Settings + theme
  loadSettings();
  const themeId = getSetting('theme') || 'deep-ocean';
  setActiveTheme(themeId);
  const theme = getActiveTheme();

  // 2. Camera mode from settings
  setCameraMode(getSetting('cameraMode') || theme.defaultCamera || 'slowOrbit');

  // 3. Create graph renderer
  const container = document.getElementById('graph-container');
  if (!container) {
    console.error('[Main] #graph-container not found');
    return;
  }

  const Graph = createGraph(container, theme);
  setGraphInstance(Graph);
  window.__graph = Graph; // Expose for diagnostics

  // 4. Configure node objects and links
  Graph.nodeThreeObject(createNodeObject);
  Graph.nodeThreeObjectExtend(false);
  configureLinks(Graph);

  // 5. Interactions
  Graph.onNodeClick(onNodeClick);
  Graph.onBackgroundClick(onBackgroundClick);

  // Pause camera on user interaction
  const controls = Graph.controls();
  if (controls) {
    controls.addEventListener('start', pauseCamera);
  }

  // 6. Tune simulation
  tuneSimulation(Graph);

  // 7. Bloom post-processing
  initBloom(Graph);

  // 7b. Atmosphere (fog + ambient particles)
  initAtmosphere(Graph);

  // 8. Initialize all UI
  initHUD();
  initDetailPanel();
  initSearch({ showDetail });
  initControls({ getGraph: () => Graph });
  initTimeline();
  initDbSelector({
    onSwitch: async () => {
      await loadGraphData();
      refreshStats();
      refreshTimeline();
    }
  });

  // 9. Render loop
  let lastHudUpdate = 0;
  Graph.onEngineTick(() => {
    updateFps();
    const now = performance.now();
    const elapsed = now / 1000;

    tickCamera(Graph, elapsed);
    animateNodes(Graph, elapsed, 1 / 60);
    animateAmbientParticles(elapsed);
    updateMemoryParticles(); // Sync particle positions from force sim

    // Update HUD FPS every 500ms
    if (now - lastHudUpdate > 500) {
      lastHudUpdate = now;
      updateFpsDisplay();
    }
  });

  // 10. Load initial data
  await loadGraphData();

  // 11. Connect SSE for real-time updates
  sseConnect();
  sseOn('new_memory', handleSSE);
  sseOn('new_entity', handleSSE);
  sseOn('new_relationship', handleSSE);
  sseOn('entity_updated', handleSSE);
  sseOn('memory_importance_changed', handleSSE);
  sseOn('consolidation_complete', handleSSE);
  sseOn('full_refresh', handleSSE);

  // 12. Load stats + timeline
  refreshStats();
  refreshTimeline();

  console.log(`[Claudia Brain v4] Ready -- ${isWebGPU() ? 'WebGPU' : 'WebGL'} -- theme: ${themeId}`);
}

// ── Start ─────────────────────────────────────────────────

boot().catch(e => console.error('[Claudia Brain v4] Boot failed:', e));
