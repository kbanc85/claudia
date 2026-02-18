import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Node mesh management for the brain visualizer.
 *
 * Entity nodes get unique geometries per type (person=sphere, org=box, etc.).
 * Memory nodes use a single InstancedMesh for performance (can be thousands).
 * Pattern nodes render as translucent wireframes.
 */

/** @type {Map<string, {mesh: THREE.Mesh|THREE.InstancedMesh, node: object, type: string, instanceIndex?: number}>} */
let _nodeMap = new Map();
/** @type {THREE.Mesh[]} Entity meshes exposed for raycasting */
let _entityMeshes = [];
/** @type {THREE.InstancedMesh|null} Single instanced mesh for all memory nodes */
let _memoryMesh = null;
/** @type {object[]} Raw memory node data (parallel to instance indices) */
let _memoryNodes = [];
/** @type {string|null} Currently hovered node id */
let _hoveredId = null;

// Reusable dummy object for instanced mesh matrix updates
const _dummy = new THREE.Object3D();

/**
 * Create geometry for an entity node based on its semantic type.
 * Each type gets a distinct silhouette so users can identify
 * node categories at a glance even without color.
 */
function createEntityGeometry(type) {
  switch (type) {
    case 'person':
      return new THREE.SphereGeometry(1, 32, 32);
    case 'organization':
      return new THREE.BoxGeometry(1.6, 1.6, 1.6);
    case 'project':
      return new THREE.OctahedronGeometry(1.2, 1);
    case 'concept':
      return new THREE.IcosahedronGeometry(1.0, 1);
    case 'location':
      return new THREE.TorusGeometry(0.8, 0.3, 16, 32);
    default:
      return new THREE.SphereGeometry(1, 32, 32);
  }
}

/**
 * Compute the visual scale of an entity node from its importance and memory count.
 * Importance provides the base size (sqrt scaling keeps low-importance nodes visible).
 * Memory count adds a log-scaled bonus so entities Claude knows more about appear larger.
 *   0 memories → +0, 5 → +4.5, 20 → +7.6, 50 → +9.8
 */
function entityScale(importance, memoryCount = 0) {
  const base = Math.sqrt(Math.max(0.1, importance)) * 8 + 3;
  const bonus = Math.log1p(memoryCount) * 2.5;
  return base + bonus;
}

/**
 * Scatter a position randomly within a sphere of given radius.
 * Used for initial node placement before the physics simulation
 * takes over and arranges them by force-directed layout.
 */
function randomPosition(range) {
  return new THREE.Vector3(
    (Math.random() - 0.5) * range,
    (Math.random() - 0.5) * range,
    (Math.random() - 0.5) * range,
  );
}

/**
 * Build all node meshes from graph data and add them to the scene.
 *
 * @param {THREE.Scene} scene - The Three.js scene
 * @param {object} graphData - Graph data with nodes array
 * @returns {Map} The node map (id -> {mesh, node, type, instanceIndex?})
 */
export function buildNodes(scene, graphData) {
  // Clear previous state
  clearNodes(scene);

  const entityNodes = graphData.nodes.filter((n) => n.nodeType === 'entity');
  const memoryNodes = graphData.nodes.filter((n) => n.nodeType === 'memory');
  const patternNodes = graphData.nodes.filter((n) => n.nodeType === 'pattern');

  // --- Entity nodes: individual meshes with type-specific geometry ---
  for (const node of entityNodes) {
    const geo = createEntityGeometry(node.type);
    const color = new THREE.Color(node.color || CONFIG.NODE_COLORS[node.type] || '#94a3b8');
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const scale = entityScale(node.importance, node.memoryCount);
    mesh.scale.setScalar(scale);
    mesh.position.copy(randomPosition(200));
    mesh.userData = { nodeId: node.id, node, nodeType: 'entity' };
    scene.add(mesh);
    _nodeMap.set(node.id, { mesh, node, type: 'entity' });
    _entityMeshes.push(mesh);
  }

  // --- Memory nodes: single InstancedMesh for GPU efficiency ---
  if (memoryNodes.length > 0) {
    const geo = new THREE.SphereGeometry(0.4, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.5,
      metalness: 0.1,
    });
    _memoryMesh = new THREE.InstancedMesh(geo, mat, memoryNodes.length);
    _memoryMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _memoryMesh.userData = { nodeType: 'memory_instanced' };

    for (let i = 0; i < memoryNodes.length; i++) {
      const node = memoryNodes[i];
      const pos = randomPosition(200);
      _dummy.position.copy(pos);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      _memoryMesh.setMatrixAt(i, _dummy.matrix);

      const memColor = node.color || CONFIG.MEMORY_COLORS[node.type] || '#e2e8f0';
      _memoryMesh.setColorAt(i, new THREE.Color(memColor));

      _nodeMap.set(node.id, { mesh: _memoryMesh, node, type: 'memory', instanceIndex: i });
    }

    _memoryMesh.instanceMatrix.needsUpdate = true;
    if (_memoryMesh.instanceColor) _memoryMesh.instanceColor.needsUpdate = true;

    // LOD: memory nodes hidden until camera is close enough
    _memoryMesh.visible = false;
    scene.add(_memoryMesh);
    _memoryNodes = memoryNodes;
  }

  // --- Pattern nodes: wireframe icosahedrons ---
  for (const node of patternNodes) {
    const geo = new THREE.IcosahedronGeometry(2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa78bfa,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(randomPosition(200));
    mesh.userData = { nodeId: node.id, node, nodeType: 'pattern' };
    scene.add(mesh);
    _nodeMap.set(node.id, { mesh, node, type: 'pattern' });
  }

  return _nodeMap;
}

/**
 * Remove all node meshes from the scene and reset internal state.
 * Disposes geometries and materials to prevent GPU memory leaks.
 */
export function clearNodes(scene) {
  for (const [, entry] of _nodeMap) {
    if (entry.type === 'entity' || entry.type === 'pattern') {
      scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
    }
  }
  if (_memoryMesh) {
    scene.remove(_memoryMesh);
    _memoryMesh.geometry.dispose();
    _memoryMesh.material.dispose();
    _memoryMesh.dispose();
    _memoryMesh = null;
  }
  _nodeMap.clear();
  _entityMeshes = [];
  _memoryNodes = [];
  _hoveredId = null;
}

/**
 * Update mesh positions from physics simulation output.
 * Entity and pattern nodes set position directly on their mesh.
 * Memory nodes update the instanced mesh matrix at their index.
 *
 * @param {Array<{id: string, x: number, y: number, z: number}>} simNodes
 * @param {THREE.Camera} camera - Used for LOD distance check
 */
export function updateNodes(simNodes, camera) {
  if (!simNodes) return;

  let memoryUpdated = false;

  for (const simNode of simNodes) {
    const entry = _nodeMap.get(simNode.id);
    if (!entry) continue;

    const x = simNode.x || 0;
    const y = simNode.y || 0;
    const z = simNode.z || 0;

    if (entry.type === 'entity' || entry.type === 'pattern') {
      entry.mesh.position.set(x, y, z);
    } else if (entry.type === 'memory' && _memoryMesh) {
      _dummy.position.set(x, y, z);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      _memoryMesh.setMatrixAt(entry.instanceIndex, _dummy.matrix);
      memoryUpdated = true;
    }
  }

  if (_memoryMesh && memoryUpdated) {
    _memoryMesh.instanceMatrix.needsUpdate = true;
  }

  // LOD: toggle memory node visibility based on camera distance
  if (_memoryMesh && camera) {
    const camDist = camera.position.length();
    _memoryMesh.visible = camDist < CONFIG.LOD.memoryVisibleDistance;
  }
}

/**
 * Set the hovered node, applying visual highlight (brighter emissive, scale bump).
 * Resets the previously hovered node to its default appearance.
 *
 * @param {string|null} nodeId - The node to highlight, or null to clear
 */
export function setHovered(nodeId) {
  // Reset previous hover
  if (_hoveredId && _hoveredId !== nodeId) {
    const prev = _nodeMap.get(_hoveredId);
    if (prev && prev.type === 'entity') {
      prev.mesh.material.emissiveIntensity = 0.3;
      prev.mesh.scale.setScalar(entityScale(prev.node.importance, prev.node.memoryCount));
    }
  }

  // Apply new hover
  if (nodeId) {
    const entry = _nodeMap.get(nodeId);
    if (entry && entry.type === 'entity') {
      entry.mesh.material.emissiveIntensity = 0.7;
      entry.mesh.scale.setScalar(entityScale(entry.node.importance, entry.node.memoryCount) * 1.3);
    }
  }

  _hoveredId = nodeId;
}

/**
 * Clear any active hover highlight.
 */
export function clearHovered() {
  setHovered(null);
}

/**
 * Get entity meshes for raycasting (click/hover detection).
 * Only returns entity-type meshes since memory nodes use instancing
 * and patterns are wireframe (not typically interactive).
 */
export function getEntityMeshes() {
  return _entityMeshes;
}

/**
 * Get the full node map for cross-module lookups (e.g., edges need positions).
 */
export function getNodeMap() {
  return _nodeMap;
}

/**
 * Get the memory instanced mesh (for LOD sync with edges).
 */
export function getMemoryMesh() {
  return _memoryMesh;
}

/**
 * Set visibility for specific nodes (used by the isolation/focus feature).
 * Pass null to show all nodes, or a Set of visible node IDs to filter.
 *
 * @param {Set<string>|null} visibleIds - Node IDs to show, or null for all
 */
export function setNodeVisibility(visibleIds) {
  for (const [id, entry] of _nodeMap) {
    if (entry.type === 'entity' || entry.type === 'pattern') {
      entry.mesh.visible = visibleIds === null || visibleIds.has(id);
    }
  }
  // For memory nodes, toggle the entire instanced mesh
  // (fine-grained per-instance visibility would require alpha manipulation)
  if (_memoryMesh && visibleIds !== null) {
    _memoryMesh.visible = false;
  }
}
