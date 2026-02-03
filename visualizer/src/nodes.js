/**
 * Claudia Brain — Node rendering with Babylon.js
 *
 * Entity types get distinct geometries. Memories use thin instances for
 * efficient batch rendering. Patterns use wireframe icospheres.
 */

import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Matrix,
  Vector3,
  Mesh,
  Quaternion
} from '@babylonjs/core';

// Color maps matching the original palette
export const ENTITY_COLORS = {
  person: '#fbbf24',
  organization: '#60a5fa',
  project: '#34d399',
  concept: '#c084fc',
  location: '#fb923c'
};

export const MEMORY_COLORS = {
  fact: '#e2e8f0',
  commitment: '#f87171',
  learning: '#4ade80',
  observation: '#93c5fd',
  preference: '#fbbf24',
  pattern: '#a78bfa'
};

// References to created meshes keyed by node.id
const nodeMeshes = new Map();

// Thin instance host meshes for memories (one per memory type)
const memoryHosts = new Map();
const memoryInstanceData = new Map(); // nodeId -> { index, hostType }

// Geometry templates (created once)
let geoCache = null;

function ensureGeometries(scene) {
  if (geoCache) return geoCache;

  geoCache = {
    sphere: MeshBuilder.CreateSphere('_tplSphere', { diameter: 2, segments: 16 }, scene),
    box: MeshBuilder.CreateBox('_tplBox', { size: 1.6 }, scene),
    octahedron: MeshBuilder.CreatePolyhedron('_tplOcta', { type: 1, size: 1.1 }, scene),
    icosahedron: MeshBuilder.CreatePolyhedron('_tplIco', { type: 3, size: 1.0 }, scene),
    torus: MeshBuilder.CreateTorus('_tplTorus', { diameter: 2.0, thickness: 0.5, tessellation: 32 }, scene),
    particle: MeshBuilder.CreateSphere('_tplParticle', { diameter: 0.8, segments: 8 }, scene),
    wireIco: MeshBuilder.CreatePolyhedron('_tplWireIco', { type: 3, size: 1.0 }, scene)
  };

  // Hide templates
  for (const mesh of Object.values(geoCache)) {
    mesh.isVisible = false;
    mesh.setEnabled(false);
  }

  return geoCache;
}

function hexToColor3(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Color3(r, g, b);
}

// ── Entity mesh creation ────────────────────────────────────

function getEntityGeometryType(entityType) {
  switch (entityType) {
    case 'person': return 'sphere';
    case 'organization': return 'box';
    case 'project': return 'octahedron';
    case 'concept': return 'icosahedron';
    case 'location': return 'torus';
    default: return 'sphere';
  }
}

export function createEntityMesh(node, scene) {
  const geo = ensureGeometries(scene);
  const geoType = getEntityGeometryType(node.entityType);
  const template = geo[geoType];

  const mesh = template.clone(`entity-${node.id}`);
  mesh.setEnabled(true);
  mesh.isVisible = true;

  const scale = node.size || 5;
  mesh.scaling = new Vector3(scale, scale, scale);

  const color = hexToColor3(node.color || ENTITY_COLORS[node.entityType] || '#888888');
  const mat = new StandardMaterial(`mat-entity-${node.id}`, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(0.35);
  mat.specularColor = new Color3(0.13, 0.13, 0.27);
  mat.alpha = Math.max(0.6, node.opacity || 1);
  mesh.material = mat;

  // Store metadata for picking and animation
  mesh.metadata = { node, baseScale: scale, nodeType: 'entity' };
  nodeMeshes.set(node.id, mesh);

  return mesh;
}

// ── Pattern mesh creation ───────────────────────────────────

export function createPatternMesh(node, scene) {
  const geo = ensureGeometries(scene);
  const mesh = geo.wireIco.clone(`pattern-${node.id}`);
  mesh.setEnabled(true);
  mesh.isVisible = true;

  const scale = node.size || 6;
  mesh.scaling = new Vector3(scale, scale, scale);

  const mat = new StandardMaterial(`mat-pattern-${node.id}`, scene);
  mat.diffuseColor = hexToColor3('#a78bfa');
  mat.emissiveColor = hexToColor3('#7c3aed').scale(0.5);
  mat.alpha = 0.5;
  mat.wireframe = true;
  mesh.material = mat;

  mesh.metadata = { node, baseScale: scale, nodeType: 'pattern' };
  nodeMeshes.set(node.id, mesh);

  return mesh;
}

// ── Memory thin instances ───────────────────────────────────

function ensureMemoryHost(memoryType, scene) {
  if (memoryHosts.has(memoryType)) return memoryHosts.get(memoryType);

  const geo = ensureGeometries(scene);
  const host = geo.particle.clone(`memHost-${memoryType}`);
  host.setEnabled(true);
  host.isVisible = true;

  const color = hexToColor3(MEMORY_COLORS[memoryType] || '#888888');
  const mat = new StandardMaterial(`mat-mem-${memoryType}`, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(0.2);
  mat.alpha = 0.55;
  host.material = mat;

  // The host mesh itself is at origin with scale 1; thin instances place copies
  host.scaling = new Vector3(1, 1, 1);
  host.isVisible = false; // only thin instances render

  memoryHosts.set(memoryType, host);
  return host;
}

export function addMemoryInstance(node, scene) {
  const memType = node.memoryType || 'fact';
  const host = ensureMemoryHost(memType, scene);

  const scale = node.size || 1.5;
  const pos = new Vector3(node.x || 0, node.y || 0, node.z || 0);

  const matrix = Matrix.Compose(
    new Vector3(scale, scale, scale),
    host.rotationQuaternion || new Quaternion(),
    pos
  );

  // Use addThinInstance (returns instance index)
  const idx = host.thinInstanceAdd(matrix);

  memoryInstanceData.set(node.id, { index: idx, hostType: memType, scale });
  nodeMeshes.set(node.id, { isThinInstance: true, host, index: idx, node });

  return idx;
}

export function updateMemoryInstancePosition(nodeId, x, y, z) {
  const data = memoryInstanceData.get(nodeId);
  if (!data) return;

  const host = memoryHosts.get(data.hostType);
  if (!host) return;

  const matrix = Matrix.Compose(
    new Vector3(data.scale, data.scale, data.scale),
    Quaternion.Identity(),
    new Vector3(x, y, z)
  );

  host.thinInstanceSetMatrixAt(data.index, matrix);
}

// Batch update all thin instance buffers (call once per frame after positions change)
export function flushMemoryInstances() {
  for (const host of memoryHosts.values()) {
    if (host.thinInstanceCount > 0) {
      host.thinInstanceBufferUpdated('matrix');
    }
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
  const entry = nodeMeshes.get(nodeId);
  if (!entry) return;

  if (entry.isThinInstance) {
    // Thin instances can't be individually removed easily;
    // we'd need to rebuild. For now, scale to zero.
    const data = memoryInstanceData.get(nodeId);
    if (data) {
      const host = memoryHosts.get(data.hostType);
      if (host) {
        const zeroMatrix = Matrix.Compose(
          Vector3.Zero(),
          Quaternion.Identity(),
          Vector3.Zero()
        );
        host.thinInstanceSetMatrixAt(data.index, zeroMatrix);
      }
      memoryInstanceData.delete(nodeId);
    }
  } else {
    entry.dispose();
  }
  nodeMeshes.delete(nodeId);
}

export function disposeAllNodes() {
  for (const [id, entry] of nodeMeshes) {
    if (!entry.isThinInstance && entry.dispose) {
      entry.dispose();
    }
  }
  nodeMeshes.clear();

  for (const host of memoryHosts.values()) {
    host.dispose();
  }
  memoryHosts.clear();
  memoryInstanceData.clear();

  if (geoCache) {
    for (const mesh of Object.values(geoCache)) {
      mesh.dispose();
    }
    geoCache = null;
  }
}
