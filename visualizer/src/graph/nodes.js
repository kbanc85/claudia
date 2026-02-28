/**
 * Claudia Brain v4 -- Node rendering (Performance-optimized)
 *
 * Creates Three.js objects for 3d-force-graph's nodeThreeObject callback.
 * Key optimizations:
 * - Geometry cache: only 13 unique geometries, created once and shared
 * - Material cache: materials keyed by type+color, shared across same-type nodes
 * - Label LOD: labels only visible within a distance threshold
 * - Reduced polygon counts for memory nodes (they're small)
 */

import {
  Mesh, Group, Sprite, SpriteMaterial, CanvasTexture,
  SphereGeometry, BoxGeometry, OctahedronGeometry,
  IcosahedronGeometry, TorusGeometry, ConeGeometry,
  TetrahedronGeometry, CylinderGeometry,
  MeshStandardMaterial,
} from 'three';
import { getActiveTheme, getActiveThemeId, onThemeChange } from '../themes.js';
import { getSetting } from '../settings.js';
import { getGraphInstance } from '../data/store.js';
import { createEntityMaterial } from '../materials/entity.js';
import { createMemoryMaterial } from '../materials/memory.js';

// ── Geometry cache (created lazily, reused across all nodes) ──

const geometryCache = new Map();

function getCachedGeometry(key, factory) {
  if (!geometryCache.has(key)) {
    geometryCache.set(key, factory());
  }
  return geometryCache.get(key);
}

function entityGeometry(type) {
  return getCachedGeometry(`entity_${type}`, () => {
    switch (type) {
      case 'person':       return new SphereGeometry(1, 16, 12);    // was 24,18
      case 'organization': return new BoxGeometry(1.6, 1.6, 1.6);
      case 'project':      return new OctahedronGeometry(1.2);
      case 'concept':      return new IcosahedronGeometry(1.1);
      case 'location':     return new TorusGeometry(1.0, 0.3, 12, 20); // was 16,32
      default:             return new SphereGeometry(1, 12, 8);     // was 16,12
    }
  });
}

function memoryGeometry(memoryType) {
  return getCachedGeometry(`memory_${memoryType}`, () => {
    switch (memoryType) {
      case 'commitment':   return new OctahedronGeometry(0.9);
      case 'fact':         return new SphereGeometry(0.8, 6, 4);    // was 10,8
      case 'learning':     return new TetrahedronGeometry(0.9);
      case 'observation':  return new CylinderGeometry(0.6, 0.6, 0.5, 6); // was 8
      case 'preference':   return new ConeGeometry(0.6, 1.0, 6);   // was 8
      case 'pattern':      return new IcosahedronGeometry(0.8);
      default:             return new SphereGeometry(0.8, 6, 4);    // was 8,6
    }
  });
}

function patternGeometry() {
  return getCachedGeometry('pattern', () => new IcosahedronGeometry(1.0));
}

// ── Material cache (keyed by type+color+params) ──

const materialCache = new Map();

function getCachedEntityMaterial(color, emissiveIntensity, importance) {
  // Quantize importance to reduce unique materials (0.0, 0.25, 0.5, 0.75, 1.0)
  const qi = Math.round(importance * 4) / 4;
  const key = `entity_${color}_${qi}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, createEntityMaterial({
      color,
      emissiveIntensity,
      importance: qi,
    }));
  }
  return materialCache.get(key);
}

function getCachedMemoryMaterial(color, emissiveIntensity, importance, memoryType) {
  const qi = Math.round(importance * 4) / 4;
  const key = `memory_${color}_${memoryType}_${qi}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, createMemoryMaterial({
      color,
      emissiveIntensity,
      importance: qi,
      opacity: Math.max(0.3, 0.55),
      memoryType,
    }));
  }
  return materialCache.get(key);
}

function getCachedPatternMaterial(patColor, patEmissive, emissiveIntensity) {
  const key = `pattern_${patColor}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new MeshStandardMaterial({
      color: patColor,
      emissive: patEmissive,
      emissiveIntensity,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    }));
  }
  return materialCache.get(key);
}

// Mutable color maps (updated on theme change)
export let ENTITY_COLORS = { ...getActiveTheme().entities };
export let MEMORY_COLORS = { ...getActiveTheme().memories };

// Invalidate material cache on theme change
let lastThemeId = null;
onThemeChange((theme) => {
  const currentId = getActiveThemeId();
  if (currentId === lastThemeId) return;
  lastThemeId = currentId;

  Object.assign(ENTITY_COLORS, theme.entities);
  Object.assign(MEMORY_COLORS, theme.memories);

  // Clear material cache so new theme colors take effect
  materialCache.clear();

  const Graph = getGraphInstance();
  if (!Graph) return;
  const gd = Graph.graphData();
  if (!gd?.nodes) return;

  for (const node of gd.nodes) {
    const obj = node.__threeObj;
    if (!obj) continue;
    const mesh = (obj.userData || obj).coreMesh || obj;
    if (!mesh?.material) continue;

    const ud = obj.userData || {};
    if (ud.nodeType === 'entity') {
      const c = theme.entities[node.entityType] || '#888';
      mesh.material.color.set(c);
      mesh.material.emissive.set(c);
      mesh.material.emissiveIntensity = theme.emissive.entity;
    } else if (ud.nodeType === 'pattern') {
      mesh.material.color.set(theme.pattern.color);
      mesh.material.emissive.set(theme.pattern.emissive);
      mesh.material.emissiveIntensity = theme.emissive.pattern;
    } else if (ud.nodeType === 'memory') {
      const c = theme.memories[node.memoryType] || '#888';
      mesh.material.color.set(c);
      mesh.material.emissive.set(c);
      mesh.material.emissiveIntensity = theme.emissive.memory;
    }
  }
});

// ── Label sprite cache ──────────────────────────────────

const labelCache = new Map();

function makeLabel(text, color) {
  if (!text) return new Group();

  // Cache labels by text to avoid redundant canvas renders
  const cacheKey = text;
  if (labelCache.has(cacheKey)) {
    // Clone the sprite (shares texture)
    const cached = labelCache.get(cacheKey);
    const sprite = new Sprite(cached.material);
    sprite.scale.copy(cached.scale);
    return sprite;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 36; // was 48 -- smaller = less texture memory
  const padding = 12;

  ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width + padding * 2;
  const textHeight = fontSize * 1.4;

  canvas.width = Math.min(256, Math.pow(2, Math.ceil(Math.log2(textWidth)))); // was 512
  canvas.height = Math.pow(2, Math.ceil(Math.log2(textHeight)));

  ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new CanvasTexture(canvas);
  const spriteMat = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new Sprite(spriteMat);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(aspect * 3, 3, 1);

  labelCache.set(cacheKey, sprite);
  return sprite;
}

// ── Node factory (called by nodeThreeObject) ─────────────

export function createNodeObject(node) {
  if (node.nodeType === 'entity')  return createEntity(node);
  if (node.nodeType === 'pattern') return createPattern(node);
  // Memory nodes are rendered by the particle system (memoryParticles.js)
  // Return a tiny invisible Group so 3d-force-graph still tracks the node
  // but doesn't create a visible Mesh (saves 901 draw calls)
  return createMemoryStub(node);
}

function getNodeScale() {
  return getSetting('visuals.nodeScale') ?? 1.0;
}

function createEntity(node) {
  const theme = getActiveTheme();
  const group = new Group();
  const color = theme.entities[node.entityType] || node.color || '#888';
  const baseSize = node.size || Math.max(3, Math.sqrt(node.importance || 0.5) * 8);
  const size = baseSize * getNodeScale();

  const mat = getCachedEntityMaterial(color, theme.emissive.entity, node.importance || 0.5);
  const mesh = new Mesh(entityGeometry(node.entityType), mat);
  mesh.scale.setScalar(size);
  group.add(mesh);

  // Labels: only for entities with importance > 0.3, and limited total
  if (getSetting('performance.nodeLabels') !== false && (node.importance || 0.5) > 0.3) {
    const label = makeLabel(node.name || '', color);
    label.position.y = size + 3;
    group.add(label);
  }

  group.userData = {
    node, baseScale: size, nodeType: 'entity',
    phase: Math.random() * Math.PI * 2,
    coreMesh: mesh,
    spawnTime: node.__spawn ? Date.now() : null,
  };

  return group;
}

function createPattern(node) {
  const theme = getActiveTheme();
  const baseSize = node.size || Math.max(4, (node.confidence || 0.5) * 10);
  const size = baseSize * getNodeScale();

  const mat = getCachedPatternMaterial(
    theme.pattern.color,
    theme.pattern.emissive,
    theme.emissive.pattern,
  );
  const mesh = new Mesh(patternGeometry(), mat);
  mesh.scale.setScalar(size);

  mesh.userData = {
    node, baseScale: size, nodeType: 'pattern',
    phase: Math.random() * Math.PI * 2,
    coreMesh: mesh,
    spawnTime: node.__spawn ? Date.now() : null,
  };

  return mesh;
}

/**
 * Lightweight stub for memory nodes.
 * The actual rendering is done by the GPU particle system (memoryParticles.js).
 * This stub is invisible but lets 3d-force-graph track the node's position
 * in the force simulation. One particle system draw call replaces 901 meshes.
 */
function createMemoryStub(node) {
  const g = new Group();
  g.visible = false; // Invisible -- particle system renders this node
  g.userData = {
    node,
    nodeType: 'memory',
    memoryType: node.memoryType,
    hidden: true,
  };
  return g;
}

/**
 * Clear all caches. Call when quality preset changes or on major rebuild.
 */
export function clearNodeCaches() {
  // Don't dispose geometries -- they're shared and may still be in use
  materialCache.clear();
  labelCache.clear();
}
