import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Edge rendering for the brain visualizer.
 *
 * Relationship edges (entity-to-entity) are rendered as arcing tubes with
 * animated pulse particles that travel along the curve. The tube color blends
 * the two endpoint colors; opacity scales with relationship strength.
 *
 * Memory link edges (memory-to-entity) are simple lines, hidden by default
 * until the camera zooms close enough (LOD sync with memory nodes).
 *
 * Tubes are NOT rebuilt every frame. A position delta check triggers rebuild
 * only when endpoints move significantly (> threshold distance).
 */

/**
 * @typedef {object} RelationshipEdge
 * @property {THREE.Group} group
 * @property {THREE.Mesh} tubeMesh
 * @property {THREE.Mesh[]} particles
 * @property {THREE.CatmullRomCurve3} curve
 * @property {number[]} pulseProgress
 * @property {'relationship'} linkType
 * @property {number} strength
 * @property {string} sourceId
 * @property {string} targetId
 * @property {THREE.Vector3} lastSourcePos - Cached source position for delta check
 * @property {THREE.Vector3} lastTargetPos - Cached target position for delta check
 */

/**
 * @typedef {object} MemoryLinkEdge
 * @property {THREE.Group} group
 * @property {THREE.Line} line
 * @property {THREE.BufferGeometry} lineGeo
 * @property {'memory_link'} linkType
 * @property {string} sourceId
 * @property {string} targetId
 */

/** @type {(RelationshipEdge|MemoryLinkEdge)[]} */
let _edgeObjects = [];

/** Distance threshold before a tube is rebuilt (avoids per-frame geometry creation) */
const REBUILD_THRESHOLD = 5;

/** Number of pulse particles per relationship edge */
const PULSE_COUNT = 4;

/**
 * Build a CatmullRom curve between two points with an arcing midpoint.
 * The arc height is proportional to the distance between endpoints,
 * giving longer edges a more pronounced curve.
 */
function buildArcCurve(sp, tp) {
  const mid = sp.clone().add(tp).multiplyScalar(0.5);
  const dist = sp.distanceTo(tp);
  mid.y += dist * 0.15;
  return new THREE.CatmullRomCurve3([sp.clone(), mid, tp.clone()]);
}

/**
 * Get the quality-appropriate number of tube segments.
 * Falls back to MEDIUM preset if no quality level is active.
 */
function getTubeSegments() {
  // Default to MEDIUM quality tube segments
  return CONFIG.QUALITY.MEDIUM.tubeSegments;
}

/**
 * Build all edge objects from graph data and add to the scene.
 *
 * @param {THREE.Scene} scene
 * @param {object} graphData - Graph data with links array
 * @param {Map} nodeMap - Node map from buildNodes()
 * @returns {Array} The edge objects array
 */
export function buildEdges(scene, graphData, nodeMap) {
  // Remove previous edges and free GPU resources
  clearEdges(scene);

  const tubeSegments = getTubeSegments();

  for (const link of graphData.links) {
    const sourceEntry = nodeMap.get(link.source);
    const targetEntry = nodeMap.get(link.target);
    if (!sourceEntry || !targetEntry) continue;

    const group = new THREE.Group();

    if (link.linkType === 'relationship') {
      const sp = sourceEntry.mesh.position.clone();
      const tp = targetEntry.mesh.position.clone();

      // Build arcing tube
      const curve = buildArcCurve(sp, tp);
      const strength = link.strength || 0.5;
      // Tube radius scales with relationship strength — thick enough to read as a solid pipe
      const tubeRadius = 0.4 + strength * 1.2;
      const tubeGeo = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 8, false);

      // Blend endpoint colors for the tube
      const sc = new THREE.Color(sourceEntry.node.color || '#94a3b8');
      const tc = new THREE.Color(targetEntry.node.color || '#94a3b8');
      const midColor = sc.clone().lerp(tc, 0.5);

      // Semi-transparent sheath with emissive glow — the tube carries the signal
      const tubeMat = new THREE.MeshStandardMaterial({
        color: midColor,
        emissive: midColor,
        emissiveIntensity: 0.45,
        transparent: true,
        opacity: 0.15 + strength * 0.25,
        depthWrite: false,
        roughness: 0.4,
        metalness: 0.0,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      group.add(tubeMesh);

      // Pulse particles — the signal traveling along the fiber
      const pulseColor = midColor.clone().lerp(new THREE.Color(1, 1, 1), 0.55);
      const particles = [];
      const pulseProgress = [];
      for (let i = 0; i < PULSE_COUNT; i++) {
        const pGeo = new THREE.SphereGeometry(tubeRadius * 1.4, 8, 8);
        const pMat = new THREE.MeshBasicMaterial({
          color: pulseColor,
          transparent: true,
          opacity: 0.95,
        });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        group.add(pMesh);
        particles.push(pMesh);
        pulseProgress.push(i / PULSE_COUNT);
      }

      scene.add(group);
      _edgeObjects.push({
        group,
        tubeMesh,
        particles,
        curve,
        pulseProgress,
        linkType: 'relationship',
        strength,
        sourceId: link.source,
        targetId: link.target,
        lastSourcePos: sp.clone(),
        lastTargetPos: tp.clone(),
      });
    } else if (link.linkType === 'memory_link') {
      // Simple line for memory-entity connections
      const sp = sourceEntry.mesh.position.clone();
      const tp = targetEntry.mesh.position.clone();
      const lineGeo = new THREE.BufferGeometry().setFromPoints([sp, tp]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x4b5563,
        transparent: true,
        opacity: 0.25,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      group.add(line);
      scene.add(group);

      _edgeObjects.push({
        group,
        line,
        lineGeo,
        linkType: 'memory_link',
        sourceId: link.source,
        targetId: link.target,
      });
    }
  }

  return _edgeObjects;
}

/**
 * Remove all edge objects from the scene and dispose GPU resources.
 */
export function clearEdges(scene) {
  for (const obj of _edgeObjects) {
    scene.remove(obj.group);

    if (obj.linkType === 'relationship') {
      obj.tubeMesh.geometry.dispose();
      obj.tubeMesh.material.dispose();
      for (const p of obj.particles) {
        p.geometry.dispose();
        p.material.dispose();
      }
    } else if (obj.linkType === 'memory_link') {
      obj.lineGeo.dispose();
      obj.line.material.dispose();
    }
  }
  _edgeObjects = [];
}

/**
 * Update edge animations and positions each frame.
 *
 * - Relationship edges: advance pulse particles along their curves,
 *   fade particles near curve endpoints, and rebuild the tube geometry
 *   only when source/target positions have moved beyond REBUILD_THRESHOLD.
 * - Memory link edges: update line endpoint positions and sync visibility
 *   with the memory instanced mesh.
 *
 * @param {Map} nodeMap - Current node map for position lookups
 * @param {number} time - Elapsed time (seconds), unused but available for effects
 * @param {number} deltaTime - Frame delta in seconds
 */
export function updateEdges(nodeMap, time, deltaTime) {
  const dt = deltaTime || 0.016;
  const tubeSegments = getTubeSegments();

  for (const edge of _edgeObjects) {
    const sourceEntry = nodeMap.get(edge.sourceId);
    const targetEntry = nodeMap.get(edge.targetId);
    if (!sourceEntry || !targetEntry) continue;

    if (edge.linkType === 'relationship') {
      // Animate pulse particles along the curve
      const speed = 0.15 + (edge.strength || 0.5) * 0.25;
      for (let i = 0; i < edge.particles.length; i++) {
        edge.pulseProgress[i] += speed * dt;
        if (edge.pulseProgress[i] > 1) edge.pulseProgress[i] -= 1;

        const pos = edge.curve.getPoint(edge.pulseProgress[i]);
        edge.particles[i].position.copy(pos);

        // Fade near curve endpoints for smooth appearance/disappearance
        const t = edge.pulseProgress[i];
        const fade = Math.min(t * 5, 1) * Math.min((1 - t) * 5, 1);
        edge.particles[i].material.opacity = 0.9 * fade;
      }

      // Rebuild tube only when endpoints have moved significantly
      const sp = sourceEntry.mesh.position;
      const tp = targetEntry.mesh.position;
      const sourceDelta = sp.distanceTo(edge.lastSourcePos);
      const targetDelta = tp.distanceTo(edge.lastTargetPos);

      if (sourceDelta > REBUILD_THRESHOLD || targetDelta > REBUILD_THRESHOLD) {
        const curve = buildArcCurve(sp, tp);
        edge.curve = curve;

        const tubeRadius = 0.4 + (edge.strength || 0.5) * 1.2;
        const newGeo = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 8, false);
        edge.tubeMesh.geometry.dispose();
        edge.tubeMesh.geometry = newGeo;

        edge.lastSourcePos.copy(sp);
        edge.lastTargetPos.copy(tp);
      }
    } else if (edge.linkType === 'memory_link') {
      // Update line endpoint positions directly in the buffer
      const sp = sourceEntry.mesh.position;
      const tp = targetEntry.mesh.position;
      const positions = edge.lineGeo.attributes.position.array;
      positions[0] = sp.x;
      positions[1] = sp.y;
      positions[2] = sp.z;
      positions[3] = tp.x;
      positions[4] = tp.y;
      positions[5] = tp.z;
      edge.lineGeo.attributes.position.needsUpdate = true;

      // Sync visibility: memory links hidden when memory nodes are hidden
      if (sourceEntry.mesh && sourceEntry.mesh.visible !== undefined) {
        edge.group.visible = sourceEntry.mesh.visible !== false;
      }
    }
  }
}

/**
 * Get the edge objects array for external inspection.
 */
export function getEdgeObjects() {
  return _edgeObjects;
}

/**
 * Set memory edge visibility explicitly (for LOD sync from the main loop).
 *
 * @param {boolean} visible
 */
export function setMemoryEdgeVisibility(visible) {
  for (const edge of _edgeObjects) {
    if (edge.linkType === 'memory_link') {
      edge.group.visible = visible;
    }
  }
}
