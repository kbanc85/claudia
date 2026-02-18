/**
 * Claudia Brain — 3D Force Graph: organic, living visualization
 *
 * Design philosophy: the graph should feel like peering into a living organism.
 * Every node breathes. Edges flow like synapses. The whole structure drifts
 * with a gentle, biological rhythm.
 */

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import ForceGraph3D from '3d-force-graph';
import SpriteText from 'three-spritetext';

let graph = null;
let selectedNode = null;
let highlightNodes = new Set();
let highlightLinks = new Set();

// Each node gets a unique phase offset so they don't breathe in sync
const nodePhases = new WeakMap();
function getPhase(node) {
  if (!nodePhases.has(node)) {
    nodePhases.set(node, Math.random() * Math.PI * 2);
  }
  return nodePhases.get(node);
}

// Geometry cache
const geometries = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  cube: new THREE.BoxGeometry(1.4, 1.4, 1.4),
  octahedron: new THREE.OctahedronGeometry(1.1, 1),
  icosahedron: new THREE.IcosahedronGeometry(1, 1),
  particle: new THREE.SphereGeometry(0.4, 8, 6),
  torus: new THREE.TorusGeometry(1.0, 0.25, 12, 32)
};

export async function initGraph(data, container) {
  // WebGPU: pass WebGPURenderer so three-render-objects uses Metal directly
  const graphOpts = { controlType: 'orbit' };
  if (navigator.gpu) {
    graphOpts.rendererConfig = { WebGPURenderer };
    console.log('WebGPU available — using Metal backend');
  } else {
    console.warn('WebGPU not available — falling back to WebGL');
  }

  graph = ForceGraph3D(graphOpts)(container)
    .graphData(data)
    .backgroundColor('#050510')
    .showNavInfo(false)

    // ── Node rendering ────────────────────────────────────
    .nodeThreeObject(node => createNodeObject(node))
    .nodeThreeObjectExtend(false)

    // ── Link rendering ────────────────────────────────────
    .linkWidth(link => {
      if (highlightLinks.has(link)) return (link.width || 0.5) * 2.5;
      if (link.linkType === 'memory_entity') return 0.15;
      return link.width || 0.4;
    })
    .linkColor(link => {
      if (highlightLinks.has(link)) return '#7dd3fc';
      if (link.color) return link.color;
      if (link.linkType === 'memory_entity') return 'rgba(120,140,255,0.06)';
      if (link.dashed) return 'rgba(255,255,255,0.04)';
      return 'rgba(140,160,255,0.12)';
    })
    .linkOpacity(0.7)
    .linkCurvature(link => {
      // Curved links feel more organic than straight lines
      if (link.linkType === 'relationship') return 0.15 + (link.strength || 0) * 0.1;
      return 0.2;
    })
    .linkDirectionalParticles(link => {
      if (highlightLinks.has(link)) return 6;
      if (link.linkType === 'relationship' && link.direction === 'forward') return 2;
      if (link.linkType === 'relationship' && (link.strength || 0) > 0.6) return 1;
      return 0;
    })
    .linkDirectionalParticleWidth(link => highlightLinks.has(link) ? 2.5 : 1.2)
    .linkDirectionalParticleSpeed(0.003)
    .linkDirectionalParticleColor(link => {
      if (highlightLinks.has(link)) return '#7dd3fc';
      return 'rgba(180,180,255,0.6)';
    })

    // ── Force configuration ───────────────────────────────
    // Slow, organic settling
    .d3AlphaDecay(0.008)
    .d3VelocityDecay(0.4)
    .warmupTicks(80)
    .cooldownTime(15000)

    // ── Interaction ───────────────────────────────────────
    .onNodeClick(handleNodeClick)
    .onNodeHover(handleNodeHover)
    .onBackgroundClick(() => {
      clearSelection();
    });

  // Customize forces for organic spacing
  const chargeForce = graph.d3Force('charge');
  if (chargeForce) {
    chargeForce.strength(node => {
      if (node.nodeType === 'entity') return -180;
      if (node.nodeType === 'pattern') return -100;
      return -15; // memories stay close to their entities
    }).distanceMax(300);
  }

  const linkForce = graph.d3Force('link');
  if (linkForce) {
    linkForce.distance(link => {
      if (link.linkType === 'relationship') return 80 + (1 - (link.strength || 0.5)) * 40;
      return 18; // memories tightly orbit entities
    }).strength(link => {
      if (link.linkType === 'relationship') return (link.strength || 0.5) * 0.3;
      return 0.4; // strong pull for memory-entity
    });
  }

  // Slow auto-orbit
  const controls = graph.controls();
  if (controls) {
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // Resume auto-rotate after 8s idle
    let idleTimer;
    const el = graph.renderer().domElement;
    const pauseOrbit = () => {
      controls.autoRotate = false;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { controls.autoRotate = true; }, 8000);
    };
    el.addEventListener('pointerdown', pauseOrbit);
    el.addEventListener('wheel', pauseOrbit);
  }

  // Set initial camera further back for panoramic view
  graph.cameraPosition({ x: 0, y: 80, z: 350 });

  return graph;
}

// ── Node object creation ────────────────────────────────────

function createNodeObject(node) {
  const group = new THREE.Group();
  let mesh;

  if (node.nodeType === 'entity') {
    mesh = createEntityMesh(node);
  } else if (node.nodeType === 'pattern') {
    mesh = createPatternMesh(node);
  } else {
    mesh = createMemoryMesh(node);
  }

  group.add(mesh);

  // Glow aura for all entities (larger, softer)
  if (node.nodeType === 'entity') {
    const glowSize = node.size * 4.5;
    const glow = createGlowSprite(node.color, glowSize, 0.25);
    group.add(glow);

    // Second, tighter inner glow
    const innerGlow = createGlowSprite(node.color, node.size * 2, 0.4);
    group.add(innerGlow);
  }

  // Floating label for entities
  if (node.nodeType === 'entity') {
    const label = new SpriteText(node.name, 2.2, 'rgba(255,255,255,0.7)');
    label.fontWeight = '400';
    label.fontFace = 'Inter, system-ui, sans-serif';
    label.material.depthWrite = false;
    label.material.transparent = true;
    label.position.y = node.size + 5;
    group.add(label);
  }

  // LLM-improved subtle badge
  if (node.llmImproved) {
    const badge = createGlowSprite('#fbbf24', 4, 0.5);
    badge.position.set(node.size + 2, node.size + 2, 0);
    group.add(badge);
  }

  group.userData = { node, mesh };

  return group;
}

function createEntityMesh(node) {
  let geometry;
  switch (node.entityType) {
    case 'person': geometry = geometries.sphere; break;
    case 'organization': geometry = geometries.cube; break;
    case 'project': geometry = geometries.octahedron; break;
    case 'concept': geometry = geometries.icosahedron; break;
    case 'location': geometry = geometries.torus; break;
    default: geometry = geometries.sphere;
  }

  const color = new THREE.Color(node.color);
  const hsl = {};
  color.getHSL(hsl);

  // Rich, slightly desaturated materials with strong emissive glow
  const material = new THREE.MeshPhongMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: Math.max(0.6, node.opacity || 1),
    shininess: 40,
    specular: new THREE.Color(0x222244)
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(node.size);

  return mesh;
}

function createMemoryMesh(node) {
  const color = new THREE.Color(node.color);

  const material = new THREE.MeshPhongMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: Math.min(node.opacity || 0.5, 0.65)
  });

  const mesh = new THREE.Mesh(geometries.particle, material);
  mesh.scale.setScalar(node.size);

  return mesh;
}

function createPatternMesh(node) {
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color('#a78bfa'),
    emissive: new THREE.Color('#7c3aed'),
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.5,
    wireframe: true
  });

  const mesh = new THREE.Mesh(geometries.icosahedron, material);
  mesh.scale.setScalar(node.size);
  return mesh;
}

function createGlowSprite(hexColor, size, intensity) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Parse hex to rgb
  const c = new THREE.Color(hexColor);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const a = intensity || 0.3;

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, `rgba(${r},${g},${b},${a})`);
  gradient.addColorStop(0.3, `rgba(${r},${g},${b},${a * 0.5})`);
  gradient.addColorStop(0.7, `rgba(${r},${g},${b},${a * 0.1})`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(size);
  return sprite;
}

// ── Interaction handlers ────────────────────────────────────

function handleNodeClick(node) {
  if (!node) return;

  selectedNode = node;
  highlightNeighborhood(node);

  // Smooth camera focus
  focusNode(node, 1200);

  // Fetch and show detail panel
  if (node.nodeType === 'entity') {
    fetch(`/api/entity/${node.dbId}`)
      .then(r => r.json())
      .then(detail => {
        const { showDetail } = window.__brainUI || {};
        if (showDetail) showDetail(node, detail);
      })
      .catch(() => {});
  } else {
    const { showDetail } = window.__brainUI || {};
    if (showDetail) showDetail(node, null);
  }

  // Pause auto-orbit temporarily
  const controls = graph.controls();
  if (controls) {
    controls.autoRotate = false;
  }
}

function handleNodeHover(node) {
  document.body.style.cursor = node ? 'pointer' : 'default';
}

function highlightNeighborhood(node) {
  highlightNodes.clear();
  highlightLinks.clear();

  if (!node) return;

  highlightNodes.add(node);

  const graphData = graph.graphData();
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
}

function clearSelection() {
  selectedNode = null;
  highlightNodes.clear();
  highlightLinks.clear();
  const panel = document.getElementById('detail-panel');
  if (panel) panel.classList.add('hidden');
}

// ── Camera ──────────────────────────────────────────────────

export function focusNode(node, duration = 1200) {
  if (!graph || !node) return;
  const distance = 120;
  const nodePos = { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
  const dist = Math.hypot(nodePos.x, nodePos.y, nodePos.z) || 1;
  const distRatio = 1 + distance / dist;

  graph.cameraPosition(
    {
      x: nodePos.x * distRatio,
      y: nodePos.y * distRatio + 20,
      z: nodePos.z * distRatio
    },
    nodePos,
    duration
  );
}

// ── Graph update ────────────────────────────────────────────

export function updateGraph(data) {
  if (!graph) return;
  graph.graphData(data);
}

export function getGraph() {
  return graph;
}

export function getHighlightNodes() {
  return highlightNodes;
}

// ── Filtering ───────────────────────────────────────────────

export function filterNodes(filterFn) {
  if (!graph) return;
  const data = graph.graphData();

  if (!graph.__fullData) {
    graph.__fullData = { nodes: [...data.nodes], links: [...data.links] };
  }

  const full = graph.__fullData;
  const filteredNodes = full.nodes.filter(filterFn);
  const nodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredLinks = full.links.filter(l => {
    const sid = typeof l.source === 'object' ? l.source.id : l.source;
    const tid = typeof l.target === 'object' ? l.target.id : l.target;
    return nodeIds.has(sid) && nodeIds.has(tid);
  });

  graph.graphData({ nodes: filteredNodes, links: filteredLinks });
}

export function resetFilter() {
  if (!graph || !graph.__fullData) return;
  graph.graphData(graph.__fullData);
  graph.__fullData = null;
}
