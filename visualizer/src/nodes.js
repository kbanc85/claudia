/**
 * Claudia Brain -- Node rendering with Three.js
 *
 * Returns Three.js Object3D instances for 3d-force-graph's nodeThreeObject callback.
 * Entity types get distinct geometries. Memories are tiny spheres.
 * Patterns use wireframe icosahedra.
 *
 * Colors and emissive intensities are read from the active theme.
 * Theme changes update materials in-place (no geometry recreation).
 */

import {
  Mesh,
  SphereGeometry,
  BoxGeometry,
  OctahedronGeometry,
  IcosahedronGeometry,
  TorusGeometry,
  MeshStandardMaterial,
  Group,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Color
} from 'three';
import { getActiveTheme, getActiveThemeId, onThemeChange } from './themes.js';
import { getSetting } from './settings.js';
import { getGraphInstance } from './graph.js';

// ── Mutable color maps (updated on theme change) ─────────

export let ENTITY_COLORS = { ...getActiveTheme().entities };
export let MEMORY_COLORS = { ...getActiveTheme().memories };

// Direct material color update instead of rebuilding all Three.js objects
let lastNodeThemeId = null;
onThemeChange((theme) => {
  const currentId = getActiveThemeId();
  if (currentId === lastNodeThemeId) return;
  lastNodeThemeId = currentId;

  Object.assign(ENTITY_COLORS, theme.entities);
  Object.assign(MEMORY_COLORS, theme.memories);

  // Update existing node materials in-place (no geometry recreation)
  const Graph = getGraphInstance();
  if (!Graph) return;
  const graphData = Graph.graphData();
  if (!graphData?.nodes) return;

  for (const node of graphData.nodes) {
    const obj = node.__threeObj;
    if (!obj) continue;

    const ud = obj.userData;
    const mesh = ud?.coreMesh;
    if (!mesh?.material) continue;

    if (ud.nodeType === 'entity') {
      const color = theme.entities[node.entityType] || node.color || '#888888';
      mesh.material.color.set(color);
      mesh.material.emissive.set(color);
      mesh.material.emissiveIntensity = theme.emissive.entity;
    } else if (ud.nodeType === 'pattern') {
      mesh.material.color.set(theme.pattern.color);
      mesh.material.emissive.set(theme.pattern.emissive);
      mesh.material.emissiveIntensity = theme.emissive.pattern;
    } else if (ud.nodeType === 'memory') {
      const color = theme.memories[node.memoryType] || node.color || '#888888';
      mesh.material.color.set(color);
      mesh.material.emissive.set(color);
      mesh.material.emissiveIntensity = theme.emissive.memory;
    }
  }
});

// ── Geometry factories (one per entity type) ─────────────

function entityGeometry(entityType) {
  switch (entityType) {
    case 'person':       return new SphereGeometry(1, 24, 18);
    case 'organization': return new BoxGeometry(1.6, 1.6, 1.6);
    case 'project':      return new OctahedronGeometry(1.2);
    case 'concept':      return new IcosahedronGeometry(1.1);
    case 'location':     return new TorusGeometry(1.0, 0.3, 16, 32);
    default:             return new SphereGeometry(1, 16, 12);
  }
}

// ── Node Three.js object factory ─────────────────────────

export function createNodeObject(node) {
  if (node.nodeType === 'entity')  return createEntityObject(node);
  if (node.nodeType === 'pattern') return createPatternObject(node);
  if (node.nodeType === 'memory')  return createMemoryObject(node);
  return createMemoryObject(node); // fallback
}

// ── Entity (neuron -- glowing polyhedra) ─────────────────

function createEntityObject(node) {
  const theme = getActiveTheme();
  const group = new Group();

  const color = theme.entities[node.entityType] || node.color || '#888888';
  const size = node.size || Math.max(3, Math.sqrt(node.importance || 0.5) * 8);

  const geo = entityGeometry(node.entityType);
  const mat = new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: theme.emissive.entity,
    metalness: 0.1,
    roughness: 0.6,
    transparent: true,
    opacity: Math.max(0.6, node.opacity || 1)
  });

  const mesh = new Mesh(geo, mat);
  mesh.scale.setScalar(size);
  group.add(mesh);

  // Text label as sprite (respect nodeLabels setting)
  if (getSetting('performance.nodeLabels') !== false) {
    const label = makeLabel(node.name || '', color);
    label.position.y = size + 3;
    group.add(label);
  }

  // Store metadata for animations
  group.userData = {
    node,
    baseScale: size,
    nodeType: 'entity',
    phase: Math.random() * Math.PI * 2,
    coreMesh: mesh,
    spawnTime: node.__spawn ? Date.now() : null
  };

  return group;
}

// ── Pattern (wireframe icosahedron) ─────────────────────

function createPatternObject(node) {
  const theme = getActiveTheme();
  const size = node.size || Math.max(4, (node.confidence || 0.5) * 10);

  const geo = new IcosahedronGeometry(1.0);
  const mat = new MeshStandardMaterial({
    color: theme.pattern.color,
    emissive: theme.pattern.emissive,
    emissiveIntensity: theme.emissive.pattern,
    wireframe: true,
    transparent: true,
    opacity: 0.5
  });

  const mesh = new Mesh(geo, mat);
  mesh.scale.setScalar(size);

  mesh.userData = {
    node,
    baseScale: size,
    nodeType: 'pattern',
    phase: Math.random() * Math.PI * 2,
    coreMesh: mesh,
    spawnTime: node.__spawn ? Date.now() : null
  };

  return mesh;
}

// ── Memory (tiny glowing particle) ──────────────────────

function createMemoryObject(node) {
  // Respect memoriesVisible setting
  if (getSetting('performance.memoriesVisible') === false) {
    const placeholder = new Group();
    placeholder.userData = { node, nodeType: 'memory', hidden: true };
    return placeholder;
  }

  const theme = getActiveTheme();
  const size = node.size || Math.max(1.5, (node.importance || 0.3) * 3);
  const color = theme.memories[node.memoryType] || node.color || '#888888';

  const geo = new SphereGeometry(0.8, 8, 6);
  const mat = new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: theme.emissive.memory,
    transparent: true,
    opacity: Math.max(0.3, node.opacity || 0.55)
  });

  const mesh = new Mesh(geo, mat);
  mesh.scale.setScalar(size);

  mesh.userData = {
    node,
    baseScale: size,
    nodeType: 'memory',
    phase: Math.random() * Math.PI * 2,
    coreMesh: mesh,
    spawnTime: node.__spawn ? Date.now() : null
  };

  return mesh;
}

// ── Label sprite ────────────────────────────────────────

function makeLabel(text, color) {
  if (!text) return new Group(); // empty placeholder

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 48;
  const padding = 16;

  ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width + padding * 2;
  const textHeight = fontSize * 1.4;

  canvas.width = Math.min(512, Math.pow(2, Math.ceil(Math.log2(textWidth))));
  canvas.height = Math.pow(2, Math.ceil(Math.log2(textHeight)));

  ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255, 255, 255, 0.7)`;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  const spriteMat = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });

  const sprite = new Sprite(spriteMat);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(aspect * 3, 3, 1);

  return sprite;
}
