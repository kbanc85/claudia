/**
 * Claudia Brain — Force layout + Three.js scene
 *
 * Manages the d3-force-3d simulation and synchronizes node positions
 * with Three.js meshes. Handles the graph data lifecycle.
 *
 * Ported from the Babylon version with key smoothness optimizations:
 * - Conditional ticking (only when alpha > alphaMin)
 * - Cached mesh Map for O(1) lookups
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter
} from 'd3-force-3d';

import {
  createEntityMesh,
  createPatternMesh,
  createMemoryMesh,
  getNodeMesh,
  getAllNodeMeshes,
  removeNodeMesh,
  addLabel,
  updateLabelPosition
} from './nodes.js';

import {
  updateLinks,
  disposeLinks
} from './links.js';

let simulation = null;
let graphData = { nodes: [], links: [] };
let fullData = null; // For filter/reset
let scene = null;
let highlightNodes = new Set();
let highlightLinks = new Set();
let selectedNode = null;

// Track node positions for link rendering
const nodePositions = new Map();

// ── Init simulation ─────────────────────────────────────────

export function initGraph(data, threeScene) {
  graphData = data;
  scene = threeScene;

  // Create meshes for all nodes
  buildSceneObjects(data.nodes);

  // Initialize force simulation (3D)
  simulation = forceSimulation(data.nodes, 3)
    .force('charge', forceManyBody()
      .strength(node => {
        if (node.nodeType === 'entity') return -180;
        if (node.nodeType === 'pattern') return -100;
        return -15; // memories stay close
      })
      .distanceMax(300)
    )
    .force('link', forceLink(data.links)
      .id(d => d.id)
      .distance(link => {
        if (link.linkType === 'relationship') return 80 + (1 - (link.strength || 0.5)) * 40;
        return 18; // memories tightly orbit entities
      })
      .strength(link => {
        if (link.linkType === 'relationship') return (link.strength || 0.5) * 0.3;
        return 0.4; // strong pull for memory-entity
      })
    )
    .force('center', forceCenter(0, 0, 0))
    .alphaDecay(0.008)
    .velocityDecay(0.4);

  // Use UMAP positions as initial positions if available (fx/fy/fz)
  for (const node of data.nodes) {
    if (node.fx !== undefined) {
      node.x = node.fx * 50; // Scale UMAP coords
      node.y = node.fy * 50;
      node.z = node.fz * 50;
      // Clear fixed positions so force sim can adjust
      delete node.fx;
      delete node.fy;
      delete node.fz;
    }
  }

  // Warm up simulation (80 ticks)
  simulation.alpha(1);
  for (let i = 0; i < 80; i++) {
    simulation.tick();
  }

  // Initial position sync
  syncPositions();

  return simulation;
}

// ── Build Three.js scene objects ────────────────────────────

function buildSceneObjects(nodes) {
  for (const node of nodes) {
    if (node.nodeType === 'entity') {
      createEntityMesh(node, scene);
    } else if (node.nodeType === 'pattern') {
      createPatternMesh(node, scene);
    } else if (node.nodeType === 'memory') {
      createMemoryMesh(node, scene);
    }
  }
}

// ── Sync positions from simulation to Three.js ──────────────

export function syncPositions() {
  const meshMap = getAllNodeMeshes();

  for (const node of graphData.nodes) {
    const x = node.x || 0;
    const y = node.y || 0;
    const z = node.z || 0;

    nodePositions.set(node.id, { x, y, z });

    const group = meshMap.get(node.id);
    if (group) {
      group.position.set(x, y, z);
      // Update label position
      updateLabelPosition(node.id, y);
    }
  }

  // Update links
  updateLinks(graphData.links, nodePositions, highlightLinks, scene);
}

// ── Tick (called from render loop) ──────────────────────────

export function tickSimulation() {
  if (!simulation) return;

  // Only tick if still cooling (the key to smooth performance)
  if (simulation.alpha() > simulation.alphaMin()) {
    simulation.tick();
    syncPositions();
  }
}

// ── Graph data management ───────────────────────────────────

export function getGraphData() { return graphData; }
export function getSelectedNode() { return selectedNode; }
export function getHighlightNodes() { return highlightNodes; }
export function getHighlightLinks() { return highlightLinks; }
export function getNodePositions() { return nodePositions; }

export function setSelectedNode(node) {
  selectedNode = node;
}

export function addNode(node) {
  graphData.nodes.push(node);

  if (node.nodeType === 'entity') {
    createEntityMesh(node, scene);
  } else if (node.nodeType === 'pattern') {
    createPatternMesh(node, scene);
  } else if (node.nodeType === 'memory') {
    createMemoryMesh(node, scene);
  }

  // Restart simulation
  simulation.nodes(graphData.nodes);
  simulation.alpha(0.3).restart();
}

export function addLink(link) {
  graphData.links.push(link);

  const linkForce = simulation.force('link');
  if (linkForce) {
    linkForce.links(graphData.links);
  }

  simulation.alpha(0.3).restart();
}

export function updateNodeData(nodeId, updates) {
  const node = graphData.nodes.find(n => n.id === nodeId);
  if (node) {
    Object.assign(node, updates);

    // Update mesh if needed
    const group = getAllNodeMeshes().get(nodeId);
    if (group && group.userData) {
      if (updates.size !== undefined) {
        group.userData.baseScale = updates.size;
      }
    }
  }
}

// ── Selection ───────────────────────────────────────────────

export function highlightNeighborhood(node) {
  highlightNodes.clear();
  highlightLinks.clear();

  if (!node) return;
  highlightNodes.add(node);

  for (const link of graphData.links) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    if (sourceId === node.id || targetId === node.id) {
      highlightLinks.add(link);
      const other = graphData.nodes.find(n =>
        n.id === (sourceId === node.id ? targetId : sourceId)
      );
      if (other) highlightNodes.add(other);
    }
  }

  // Rebuild links to reflect highlight state
  syncPositions();
}

export function clearSelection() {
  selectedNode = null;
  highlightNodes.clear();
  highlightLinks.clear();
  syncPositions();

  document.getElementById('detail-panel')?.classList.add('hidden');
}

// ── Filtering ───────────────────────────────────────────────

export function filterNodes(filterFn) {
  if (!fullData) {
    fullData = { nodes: [...graphData.nodes], links: [...graphData.links] };
  }

  const filteredNodes = fullData.nodes.filter(filterFn);
  const nodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredLinks = fullData.links.filter(l => {
    const sid = typeof l.source === 'object' ? l.source.id : l.source;
    const tid = typeof l.target === 'object' ? l.target.id : l.target;
    return nodeIds.has(sid) && nodeIds.has(tid);
  });

  // Hide/show meshes based on filter
  const meshMap = getAllNodeMeshes();
  for (const [id, group] of meshMap) {
    group.visible = nodeIds.has(id);
  }

  graphData = { nodes: filteredNodes, links: filteredLinks };
  simulation.nodes(filteredNodes);
  const linkForce = simulation.force('link');
  if (linkForce) linkForce.links(filteredLinks);
  simulation.alpha(0.1).restart();

  syncPositions();
}

export function resetFilter() {
  if (!fullData) return;
  graphData = { nodes: fullData.nodes, links: fullData.links };
  fullData = null;

  // Show all meshes
  const meshMap = getAllNodeMeshes();
  for (const [id, group] of meshMap) {
    group.visible = true;
  }

  simulation.nodes(graphData.nodes);
  const linkForce = simulation.force('link');
  if (linkForce) linkForce.links(graphData.links);
  simulation.alpha(0.1).restart();

  syncPositions();
}

// ── Dispose ─────────────────────────────────────────────────

export function disposeGraph() {
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
  disposeLinks();
}
