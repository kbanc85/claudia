/**
 * Claudia Brain — Force layout + Babylon.js scene
 *
 * Manages the d3-force-3d simulation and synchronizes node positions
 * with Babylon.js meshes. Handles the graph data lifecycle.
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter
} from 'd3-force-3d';

import {
  Vector3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  DynamicTexture
} from '@babylonjs/core';

import {
  createEntityMesh,
  createPatternMesh,
  getNodeMesh,
  getAllNodeMeshes,
  removeNodeMesh,
  ENTITY_COLORS,
  MEMORY_COLORS
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

// Label meshes
const labelMeshes = new Map();

// ── Init simulation ─────────────────────────────────────────

export function initGraph(data, babylonScene) {
  graphData = data;
  scene = babylonScene;

  // Create meshes for all nodes
  buildSceneObjects(data.nodes);

  // Initialize force simulation
  simulation = forceSimulation(data.nodes, 3)
    .force('charge', forceManyBody()
      .strength(node => {
        if (node.nodeType === 'entity') return -180;
        if (node.nodeType === 'pattern') return -100;
        return -15;
      })
      .distanceMax(300)
    )
    .force('link', forceLink(data.links)
      .id(d => d.id)
      .distance(link => {
        if (link.linkType === 'relationship') return 80 + (1 - (link.strength || 0.5)) * 40;
        return 18;
      })
      .strength(link => {
        if (link.linkType === 'relationship') return (link.strength || 0.5) * 0.3;
        return 0.4;
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

  // Warm up simulation
  simulation.alpha(1);
  for (let i = 0; i < 80; i++) {
    simulation.tick();
  }

  // Initial position sync
  syncPositions();

  return simulation;
}

// ── Build Babylon scene objects ─────────────────────────────

function buildSceneObjects(nodes) {
  for (const node of nodes) {
    if (node.nodeType === 'entity') {
      const mesh = createEntityMesh(node, scene);
      addLabel(node, mesh);
    } else if (node.nodeType === 'pattern') {
      createPatternMesh(node, scene);
    }
    // Memories are handled as thin instances later if needed,
    // but for now create as individual small meshes for simplicity
    // (thin instances require all matrices be known upfront)
    else if (node.nodeType === 'memory') {
      createMemoryMesh(node);
    }
  }
}

function createMemoryMesh(node) {
  // Simple small sphere for each memory (instead of thin instances
  // which are harder to individually position per-frame)
  const mesh = MeshBuilder.CreateSphere(`mem-${node.id}`, { diameter: 0.8, segments: 6 }, scene);
  const scale = node.size || 1.5;
  mesh.scaling = new Vector3(scale, scale, scale);

  const hex = node.color || MEMORY_COLORS[node.memoryType] || '#888888';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const mat = new StandardMaterial(`mat-mem-${node.id}`, scene);
  mat.diffuseColor = new Color3(r, g, b);
  mat.emissiveColor = new Color3(r * 0.2, g * 0.2, b * 0.2);
  mat.alpha = Math.min(node.opacity || 0.5, 0.65);
  mesh.material = mat;

  mesh.metadata = { node, baseScale: scale, nodeType: 'memory' };
  getAllNodeMeshes().set(node.id, mesh);

  return mesh;
}

// ── Labels ──────────────────────────────────────────────────

function addLabel(node, parentMesh) {
  // Use Babylon's dynamic texture for text labels
  const MB = MeshBuilder;
  const planeHeight = 1.2;
  const text = node.name || '';
  const fontSize = 48;
  const charWidth = fontSize * 0.55;
  const textWidth = text.length * charWidth + 20;
  const texWidth = Math.min(512, Math.max(128, Math.pow(2, Math.ceil(Math.log2(textWidth)))));
  const texHeight = 64;

  const texture = new DynamicTexture(`labelTex-${node.id}`, { width: texWidth, height: texHeight }, scene, false);
  texture.hasAlpha = true;

  const ctx = texture.getContext();
  ctx.clearRect(0, 0, texWidth, texHeight);
  ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, texWidth / 2, texHeight / 2);
  texture.update();

  const planeWidth = planeHeight * (texWidth / texHeight);
  const plane = MB.CreatePlane(`label-${node.id}`, { width: planeWidth, height: planeHeight }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

  const mat = new StandardMaterial(`labelMat-${node.id}`, scene);
  mat.diffuseTexture = texture;
  mat.emissiveTexture = texture;
  mat.opacityTexture = texture;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  plane.material = mat;
  plane.isPickable = false;

  labelMeshes.set(node.id, { plane, offset: (node.size || 5) + 3 });
}

// ── Sync positions from simulation to Babylon ───────────────

export function syncPositions() {
  const meshMap = getAllNodeMeshes();

  for (const node of graphData.nodes) {
    const x = node.x || 0;
    const y = node.y || 0;
    const z = node.z || 0;

    nodePositions.set(node.id, { x, y, z });

    const mesh = meshMap.get(node.id);
    if (mesh && !mesh.isThinInstance) {
      mesh.position.set(x, y, z);
    }

    // Update label position
    const labelData = labelMeshes.get(node.id);
    if (labelData) {
      labelData.plane.position.set(x, y + labelData.offset, z);
    }
  }

  // Update links
  updateLinks(graphData.links, nodePositions, highlightLinks, scene);
}

// ── Tick (called from render loop) ──────────────────────────

export function tickSimulation() {
  if (!simulation) return;

  // Only tick if still cooling
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
    const mesh = createEntityMesh(node, scene);
    addLabel(node, mesh);
  } else if (node.nodeType === 'pattern') {
    createPatternMesh(node, scene);
  } else if (node.nodeType === 'memory') {
    createMemoryMesh(node);
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
    const mesh = getAllNodeMeshes().get(nodeId);
    if (mesh && !mesh.isThinInstance && mesh.metadata) {
      if (updates.size !== undefined) {
        mesh.metadata.baseScale = updates.size;
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
  for (const [id, mesh] of meshMap) {
    if (mesh.isThinInstance) continue;
    mesh.setEnabled(nodeIds.has(id));
    const labelData = labelMeshes.get(id);
    if (labelData) labelData.plane.setEnabled(nodeIds.has(id));
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
  for (const [id, mesh] of meshMap) {
    if (mesh.isThinInstance) continue;
    mesh.setEnabled(true);
    const labelData = labelMeshes.get(id);
    if (labelData) labelData.plane.setEnabled(true);
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
  for (const { plane } of labelMeshes.values()) {
    plane.dispose();
  }
  labelMeshes.clear();
}
