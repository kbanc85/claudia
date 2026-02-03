/**
 * Claudia Brain — Node rendering with Three.js
 *
 * Combines the visual quality from the legacy 3d-force-graph version
 * (glow sprites, SpriteText labels, MeshPhongMaterial with emissive)
 * with the performance approach from Babylon (cached mesh Map, no scene.traverse).
 */

import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { config } from './config.js';

// Color maps (exported for backwards compatibility, but config is the source of truth)
export const ENTITY_COLORS = config.entityColors;
export const MEMORY_COLORS = config.memoryColors;

// References to created meshes keyed by node.id
const nodeMeshes = new Map();

// Label references for position updates
const labelMeshes = new Map();

// Geometry cache (created once, reused)
const geometries = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  box: new THREE.BoxGeometry(1.4, 1.4, 1.4),
  octahedron: new THREE.OctahedronGeometry(1.1, 1),
  icosahedron: new THREE.IcosahedronGeometry(1, 1),
  torus: new THREE.TorusGeometry(1.0, 0.25, 12, 32),
  particle: new THREE.SphereGeometry(0.4, 8, 6)
};

// ── Entity mesh creation ────────────────────────────────────

function getEntityGeometry(entityType) {
  switch (entityType) {
    case 'person': return geometries.sphere;
    case 'organization': return geometries.box;
    case 'project': return geometries.octahedron;
    case 'concept': return geometries.icosahedron;
    case 'location': return geometries.torus;
    default: return geometries.sphere;
  }
}

export function createEntityMesh(node, scene) {
  const group = new THREE.Group();
  const { nodes: nodeCfg } = config;

  // Main mesh
  const geometry = getEntityGeometry(node.entityType);
  const color = new THREE.Color(node.color || config.entityColors[node.entityType] || '#888888');

  // Rich material with emissive glow (from legacy)
  const material = new THREE.MeshPhongMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: nodeCfg.emissiveIntensity,
    transparent: true,
    opacity: Math.max(nodeCfg.minOpacity, node.opacity || 1),
    shininess: nodeCfg.shininess,
    specular: new THREE.Color(nodeCfg.specularColor)
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(node.size || 5);
  group.add(mesh);

  // Glow aura (larger, softer) - from legacy
  const glowSize = (node.size || 5) * nodeCfg.glowSize;
  const glow = createGlowSprite(node.color || config.entityColors[node.entityType], glowSize, nodeCfg.glowIntensity);
  glow.userData.isGlow = true;
  glow.userData.baseNodeSize = node.size || 5;
  group.add(glow);

  // Second, tighter inner glow
  const innerGlowSize = (node.size || 5) * nodeCfg.innerGlowSize;
  const innerGlow = createGlowSprite(node.color || config.entityColors[node.entityType], innerGlowSize, nodeCfg.innerGlowIntensity);
  innerGlow.userData.isInnerGlow = true;
  innerGlow.userData.baseNodeSize = node.size || 5;
  group.add(innerGlow);

  // Floating label (SpriteText from legacy)
  const label = new SpriteText(node.name, nodeCfg.labelSize, nodeCfg.labelColor);
  label.fontWeight = '400';
  label.fontFace = 'Inter, system-ui, sans-serif';
  label.material.depthWrite = false;
  label.material.transparent = true;
  label.position.y = (node.size || 5) + nodeCfg.labelOffset;
  group.add(label);
  labelMeshes.set(node.id, { label, offset: (node.size || 5) + nodeCfg.labelOffset });

  // LLM-improved badge
  if (node.llmImproved) {
    const badge = createGlowSprite('#fbbf24', 4, 0.5);
    badge.position.set((node.size || 5) + 2, (node.size || 5) + 2, 0);
    group.add(badge);
  }

  // Store metadata for picking and animation
  group.userData = { node, mesh, baseScale: node.size || 5, nodeType: 'entity' };
  scene.add(group);
  nodeMeshes.set(node.id, group);

  return group;
}

// ── Memory mesh creation ────────────────────────────────────

export function createMemoryMesh(node, scene) {
  const group = new THREE.Group();
  const { nodes: nodeCfg } = config;

  const color = new THREE.Color(node.color || config.memoryColors[node.memoryType] || '#888888');

  const material = new THREE.MeshPhongMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: nodeCfg.memoryEmissive,
    transparent: true,
    opacity: Math.min(node.opacity || 0.5, nodeCfg.memoryMaxOpacity)
  });

  const mesh = new THREE.Mesh(geometries.particle, material);
  mesh.scale.setScalar(node.size || 1.5);
  group.add(mesh);

  group.userData = { node, mesh, baseScale: node.size || 1.5, nodeType: 'memory' };
  scene.add(group);
  nodeMeshes.set(node.id, group);

  return group;
}

// ── Pattern mesh creation ───────────────────────────────────

export function createPatternMesh(node, scene) {
  const group = new THREE.Group();
  const { nodes: nodeCfg } = config;

  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(nodeCfg.patternColor),
    emissive: new THREE.Color(nodeCfg.patternEmissive),
    emissiveIntensity: nodeCfg.patternEmissiveIntensity,
    transparent: true,
    opacity: nodeCfg.patternOpacity,
    wireframe: true
  });

  const mesh = new THREE.Mesh(geometries.icosahedron, material);
  mesh.scale.setScalar(node.size || 6);
  group.add(mesh);

  group.userData = { node, mesh, baseScale: node.size || 6, nodeType: 'pattern' };
  scene.add(group);
  nodeMeshes.set(node.id, group);

  return group;
}

// ── Glow sprite (from legacy) ───────────────────────────────

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

// ── Label management ────────────────────────────────────────

export function addLabel(node, parentGroup) {
  // Labels are added during mesh creation for entities
}

export function updateLabelPosition(nodeId, y) {
  const labelData = labelMeshes.get(nodeId);
  if (labelData) {
    labelData.label.position.y = labelData.offset;
  }
}

// ── Accessors ───────────────────────────────────────────────

export function getNodeMesh(nodeId) {
  return nodeMeshes.get(nodeId);
}

export function getAllNodeMeshes() {
  return nodeMeshes;
}

export function removeNodeMesh(nodeId, scene) {
  const group = nodeMeshes.get(nodeId);
  if (group) {
    scene.remove(group);
    // Dispose of geometries and materials
    group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    nodeMeshes.delete(nodeId);
    labelMeshes.delete(nodeId);
  }
}

export function disposeAllNodes(scene) {
  for (const [id, group] of nodeMeshes) {
    scene.remove(group);
    group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
  nodeMeshes.clear();
  labelMeshes.clear();
}

/**
 * Refresh node material colors based on current config
 * Call this when themes change to update existing nodes
 */
export function refreshNodeColors() {
  for (const [nodeId, group] of nodeMeshes) {
    const node = group.userData?.node;
    const mesh = group.userData?.mesh;

    if (!node || !mesh || !mesh.material) continue;

    let newColor = null;

    if (node.nodeType === 'entity' && node.entityType) {
      newColor = config.entityColors[node.entityType];
    } else if (node.nodeType === 'memory' && node.memoryType) {
      newColor = config.memoryColors[node.memoryType];
    } else if (node.nodeType === 'pattern') {
      newColor = config.nodes.patternColor;
      // Also update emissive for patterns
      if (mesh.material.emissive) {
        mesh.material.emissive.set(config.nodes.patternEmissive);
      }
    }

    if (newColor && mesh.material.color) {
      mesh.material.color.set(newColor);
      if (mesh.material.emissive && node.nodeType !== 'pattern') {
        mesh.material.emissive.set(newColor);
      }
    }
  }
}

/**
 * Refresh glow sprite sizes and intensities based on current config
 * Call this when glow size or intensity settings change to update existing nodes
 */
export function refreshNodeGlows() {
  const { nodes: nodeCfg } = config;

  for (const [nodeId, group] of nodeMeshes) {
    const node = group.userData?.node;
    if (!node || node.nodeType !== 'entity') continue;

    // Traverse the group to find glow sprites
    group.traverse(child => {
      if (child.isSprite) {
        const baseSize = child.userData?.baseNodeSize || node.size || 5;

        if (child.userData?.isGlow) {
          child.scale.setScalar(baseSize * nodeCfg.glowSize);
          // Adjust opacity as a proxy for intensity
          if (child.material) {
            child.material.opacity = nodeCfg.glowIntensity;
          }
        } else if (child.userData?.isInnerGlow) {
          child.scale.setScalar(baseSize * nodeCfg.innerGlowSize);
          // Adjust opacity as a proxy for intensity
          if (child.material) {
            child.material.opacity = nodeCfg.innerGlowIntensity;
          }
        }
      }
    });
  }
}

/**
 * Refresh node emissive intensity based on current config
 * Call this when emissive settings change
 */
export function refreshNodeEmissive() {
  const { nodes: nodeCfg } = config;

  for (const [nodeId, group] of nodeMeshes) {
    const node = group.userData?.node;
    const mesh = group.userData?.mesh;

    if (!node || !mesh || !mesh.material) continue;

    if (node.nodeType === 'entity' && mesh.material.emissiveIntensity !== undefined) {
      mesh.material.emissiveIntensity = nodeCfg.emissiveIntensity;
    } else if (node.nodeType === 'memory' && mesh.material.emissiveIntensity !== undefined) {
      mesh.material.emissiveIntensity = nodeCfg.memoryEmissive;
    } else if (node.nodeType === 'pattern' && mesh.material.emissiveIntensity !== undefined) {
      mesh.material.emissiveIntensity = nodeCfg.patternEmissiveIntensity;
    }
  }
}
