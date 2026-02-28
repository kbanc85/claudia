/**
 * Claudia Brain v4 -- Graph state management
 *
 * Central store for nodes, links, selection, highlights, and filters.
 * Emits events on data changes for reactive UI updates.
 *
 * v4.1: Dramatic highlighting (dim non-selected), link visibility filters,
 *       memory particle dimming via callback.
 */

import { Color } from 'three';

// ── State ────────────────────────────────────────────────

let Graph = null;
let graphData = { nodes: [], links: [] };
let fullData = null; // stashed for filter/reset
let highlightNodes = new Set();
let highlightLinks = new Set();
let selectedNode = null;

// Saved material state for restoring after clearSelection
let savedMaterials = new Map();
let savedLinkColors = new Map();
let dimmedNodes = new Map(); // nodes dimmed during selection

// Link visibility filter for connection view presets
let linkVisibilityFilter = null;

// External callback for memory particle dimming
let memoryDimCallback = null;

// Event listeners
const changeListeners = new Set();

// ── Graph instance ───────────────────────────────────────

export function setGraphInstance(instance) { Graph = instance; }
export function getGraphInstance() { return Graph; }

// ── Data access ──────────────────────────────────────────

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

// ── Link visibility filter (for connection view presets) ──

export function setLinkVisibilityFilter(filterFn) {
  linkVisibilityFilter = filterFn;
  // Trigger link re-evaluation
  if (Graph) {
    Graph.linkVisibility(Graph.linkVisibility());
  }
  emitChange('link_filter_changed');
}

export function clearLinkVisibilityFilter() {
  linkVisibilityFilter = null;
  if (Graph) {
    Graph.linkVisibility(Graph.linkVisibility());
  }
  emitChange('link_filter_changed');
}

export function getLinkVisibilityFilter() {
  return linkVisibilityFilter;
}

// ── Memory particle dim callback ─────────────────────────

export function setMemoryDimCallback(cb) {
  memoryDimCallback = cb;
}

// ── Data mutations ───────────────────────────────────────

export function addNode(node) {
  graphData.nodes.push(node);
  pushData();
  emitChange('node_added', node);
}

export function addLink(link) {
  graphData.links.push(link);
  pushData();
  emitChange('link_added', link);
}

export function updateNode(nodeId, updates) {
  const node = graphData.nodes.find(n => n.id === nodeId);
  if (node) {
    Object.assign(node, updates);
    emitChange('node_updated', node);
  }
  return node;
}

export function findNode(id) {
  return graphData.nodes.find(n => n.id === id);
}

export function findNodesByType(nodeType) {
  return graphData.nodes.filter(n => n.nodeType === nodeType);
}

// ── Selection + highlighting ─────────────────────────────

export function highlightNeighborhood(node, getTheme) {
  restoreSavedMaterials();
  highlightNodes.clear();
  highlightLinks.clear();

  if (!node) return;
  highlightNodes.add(node.id);

  for (const link of graphData.links) {
    if (link.linkType !== 'relationship') continue;
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    if (sourceId === node.id || targetId === node.id) {
      highlightLinks.add(link);
      highlightNodes.add(sourceId === node.id ? targetId : sourceId);
    }
  }

  applyHighlightMaterials(getTheme);
}

export function clearSelection() {
  selectedNode = null;
  restoreSavedMaterials();
  highlightNodes.clear();
  highlightLinks.clear();

  // Restore memory particles to full brightness
  if (memoryDimCallback) memoryDimCallback(1.0);

  emitChange('selection_cleared');
}

// ── Filtering ────────────────────────────────────────────

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
  emitChange('filtered');
}

export function resetFilter() {
  if (!fullData) return;
  graphData = { nodes: fullData.nodes, links: fullData.links };
  fullData = null;
  pushData();
  emitChange('filter_reset');
}

// ── Focus camera ─────────────────────────────────────────

export function focusNode(node) {
  if (!Graph || !node) return;
  const distance = 120;
  Graph.cameraPosition(
    { x: node.x + distance, y: node.y + distance * 0.3, z: node.z + distance },
    { x: node.x, y: node.y, z: node.z },
    1200
  );
}

// ── Change listeners ─────────────────────────────────────

export function onChange(callback) {
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

function emitChange(type, data) {
  for (const cb of changeListeners) {
    try { cb(type, data); } catch {}
  }
}

// ── Internal helpers ─────────────────────────────────────

function pushData() {
  if (!Graph) return;
  Graph.graphData({ nodes: graphData.nodes, links: graphData.links });
}

function applyHighlightMaterials(getTheme) {
  if (!Graph) return;

  // 1. Boost highlighted nodes to high emissive
  for (const nodeId of highlightNodes) {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node?.__threeObj) continue;

    const ud = node.__threeObj.userData;
    const mesh = ud?.coreMesh;
    if (!mesh?.material) continue;

    savedMaterials.set(nodeId, {
      emissiveIntensity: mesh.material.emissiveIntensity,
      emissive: mesh.material.emissive?.getHex?.() ?? 0,
      opacity: mesh.material.opacity,
      transparent: mesh.material.transparent,
    });

    // Strong fixed emissive for selected neighborhood
    mesh.material.emissiveIntensity = 1.5;
    mesh.material.opacity = 1.0;
  }

  // 2. Dim ALL non-highlighted entity nodes for dramatic contrast
  for (const node of graphData.nodes) {
    if (node.nodeType !== 'entity') continue;
    if (highlightNodes.has(node.id)) continue; // skip highlighted
    if (!node.__threeObj) continue;

    const ud = node.__threeObj.userData;
    const mesh = ud?.coreMesh;
    if (!mesh?.material) continue;

    dimmedNodes.set(node.id, {
      emissiveIntensity: mesh.material.emissiveIntensity,
      opacity: mesh.material.opacity,
      transparent: mesh.material.transparent,
    });

    mesh.material.emissiveIntensity = 0.12;
    mesh.material.opacity = 0.35;
    mesh.material.transparent = true;

    // Also dim the label sprite if present
    const label = ud?.labelSprite;
    if (label?.material) {
      dimmedNodes.get(node.id).labelOpacity = label.material.opacity;
      label.material.opacity = 0.25;
    }
  }

  // 3. Style highlighted links
  for (const link of highlightLinks) {
    const linkObj = link.__lineObj;
    if (linkObj?.material) {
      savedLinkColors.set(link, {
        color: linkObj.material.color?.getHex?.() ?? 0,
      });
      const theme = getTheme?.();
      if (theme) linkObj.material.color.set(theme.links.highlight);
    }
  }

  // 4. Dim memory particles
  if (memoryDimCallback) memoryDimCallback(0.35);

  emitChange('selection_applied');
}

function restoreSavedMaterials() {
  // Restore highlighted nodes
  for (const [nodeId, saved] of savedMaterials) {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node?.__threeObj) continue;
    const mesh = node.__threeObj.userData?.coreMesh;
    if (!mesh?.material) continue;
    mesh.material.emissiveIntensity = saved.emissiveIntensity;
    mesh.material.opacity = saved.opacity;
    mesh.material.transparent = saved.transparent;
    if (mesh.material.emissive) mesh.material.emissive.setHex(saved.emissive);
  }
  savedMaterials.clear();

  // Restore dimmed nodes
  for (const [nodeId, saved] of dimmedNodes) {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node?.__threeObj) continue;
    const ud = node.__threeObj.userData;
    const mesh = ud?.coreMesh;
    if (!mesh?.material) continue;
    mesh.material.emissiveIntensity = saved.emissiveIntensity;
    mesh.material.opacity = saved.opacity;
    mesh.material.transparent = saved.transparent;

    // Restore label
    const label = ud?.labelSprite;
    if (label?.material && saved.labelOpacity != null) {
      label.material.opacity = saved.labelOpacity;
    }
  }
  dimmedNodes.clear();

  // Restore link colors
  for (const [link, saved] of savedLinkColors) {
    const linkObj = link.__lineObj;
    if (linkObj?.material?.color) linkObj.material.color.setHex(saved.color);
  }
  savedLinkColors.clear();
}
