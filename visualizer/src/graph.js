/**
 * Claudia Brain -- Graph data management (3d-force-graph)
 *
 * Thin data layer wrapping 3d-force-graph's built-in force simulation.
 * No manual forceSimulation, syncPositions, or tickSimulation needed --
 * the library handles all of that internally.
 */

import { Color } from 'three';
import { getActiveTheme } from './themes.js';

let Graph = null;
let graphData = { nodes: [], links: [] };
let fullData = null; // Stashed for filter/reset
let highlightNodes = new Set();
let highlightLinks = new Set();
let selectedNode = null;

// Saved material state for restoring after clearSelection()
let savedMaterials = new Map(); // nodeId -> { color, emissiveIntensity }
let savedLinkColors = new Map(); // link -> { color, width }

// ── Graph instance ─────────────────────────────────────────

export function setGraphInstance(instance) {
  Graph = instance;
}

export function getGraphInstance() {
  return Graph;
}

// ── Data access ────────────────────────────────────────────

export function getGraphData() { return graphData; }
export function getSelectedNode() { return selectedNode; }
export function getHighlightNodes() { return highlightNodes; }
export function getHighlightLinks() { return highlightLinks; }

export function setGraphData(data) {
  graphData = data;
}

export function setSelectedNode(node) {
  selectedNode = node;
}

// ── Data mutations ─────────────────────────────────────────

export function addNode(node) {
  graphData.nodes.push(node);
  pushData();
}

export function addLink(link) {
  graphData.links.push(link);
  pushData();
}

export function updateNodeData(nodeId, updates) {
  const node = graphData.nodes.find(n => n.id === nodeId);
  if (node) {
    Object.assign(node, updates);
    // Force re-render of the affected node
    if (Graph) Graph.nodeThreeObject(Graph.nodeThreeObject());
  }
}

// ── Selection + highlighting ──────────────────────────────

export function highlightNeighborhood(node) {
  // Restore previous highlight before applying new one
  restoreSavedMaterials();

  highlightNodes.clear();
  highlightLinks.clear();

  if (!node) return;

  highlightNodes.add(node.id);

  for (const link of graphData.links) {
    // Only highlight entity-to-entity relationship links
    if (link.linkType !== 'relationship') continue;

    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    if (sourceId === node.id || targetId === node.id) {
      highlightLinks.add(link);
      const otherId = sourceId === node.id ? targetId : sourceId;
      highlightNodes.add(otherId);
    }
  }

  applyHighlightMaterials();
}

export function clearSelection() {
  selectedNode = null;
  restoreSavedMaterials();
  highlightNodes.clear();
  highlightLinks.clear();
  document.getElementById('detail-panel')?.classList.add('hidden');
}

// ── Filtering ─────────────────────────────────────────────

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

  graphData = { nodes: filteredNodes, links: filteredLinks };
  pushData();
}

export function resetFilter() {
  if (!fullData) return;
  graphData = { nodes: fullData.nodes, links: fullData.links };
  fullData = null;
  pushData();
}

// ── Helpers ───────────────────────────────────────────────

function pushData() {
  if (!Graph) return;
  Graph.graphData({ nodes: graphData.nodes, links: graphData.links });
}

/**
 * Apply highlight visuals directly on Three.js materials for the
 * selected neighborhood. O(k) where k = neighborhood size, not O(N).
 */
function applyHighlightMaterials() {
  if (!Graph) return;
  const theme = getActiveTheme();
  const highlightColor = new Color(0x7dd3fc); // bright cyan highlight

  // Highlight nodes: boost emissive intensity
  for (const nodeId of highlightNodes) {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node?.__threeObj) continue;

    const ud = node.__threeObj.userData;
    const mesh = ud?.coreMesh;
    if (!mesh?.material) continue;

    // Save original state
    savedMaterials.set(nodeId, {
      emissiveIntensity: mesh.material.emissiveIntensity,
      emissive: mesh.material.emissive.getHex()
    });

    // Boost: brighter emissive
    mesh.material.emissiveIntensity = Math.min(1.0, mesh.material.emissiveIntensity * 2.5);
  }

  // Highlight links: change color and width
  for (const link of highlightLinks) {
    const linkObj = link.__lineObj;
    if (linkObj?.material) {
      savedLinkColors.set(link, {
        color: linkObj.material.color.getHex(),
        linewidth: linkObj.material.linewidth
      });
      linkObj.material.color.set(theme.links.highlight);
    }
  }
}

/**
 * Restore materials saved before highlighting.
 */
function restoreSavedMaterials() {
  // Restore node materials
  for (const [nodeId, saved] of savedMaterials) {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node?.__threeObj) continue;
    const mesh = node.__threeObj.userData?.coreMesh;
    if (!mesh?.material) continue;

    mesh.material.emissiveIntensity = saved.emissiveIntensity;
    mesh.material.emissive.setHex(saved.emissive);
  }
  savedMaterials.clear();

  // Restore link materials
  for (const [link, saved] of savedLinkColors) {
    const linkObj = link.__lineObj;
    if (linkObj?.material) {
      linkObj.material.color.setHex(saved.color);
    }
  }
  savedLinkColors.clear();
}

// ── Focus camera on a node ───────────────────────────────

export function focusNode(node) {
  if (!Graph || !node) return;
  const distance = 120;
  const pos = node;
  Graph.cameraPosition(
    { x: pos.x + distance, y: pos.y + distance * 0.3, z: pos.z + distance },
    { x: pos.x, y: pos.y, z: pos.z },
    1200
  );
}
