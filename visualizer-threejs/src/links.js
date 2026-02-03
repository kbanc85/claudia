/**
 * Claudia Brain — Edge rendering with curved links and directional particles
 *
 * The "connected" feel comes from:
 * 1. Curved links using QuadraticBezierCurve3 (relationship links)
 * 2. Straight thin lines for memory-entity links (many, subtle)
 * 3. Directional particles flowing along highlighted/strong links
 *
 * Performance strategy:
 * - Only update geometry while simulation is hot (alpha > alphaMin)
 * - Once cooled, links are static (zero per-frame cost)
 * - Single shared Points mesh for ALL particles (not per-link systems)
 */

import * as THREE from 'three';
import { config } from './config.js';

// Link meshes
let relationshipMeshes = []; // TubeGeometry for curved links
let memoryLineMesh = null;   // LineSegments for memory-entity links

// Particle system
let particleSystem = null;
let particleData = [];
let linkCurves = new Map(); // linkId -> curve for particle interpolation

// Cached state
let lastAlpha = 1;

// ── Create / update all links ───────────────────────────────

export function updateLinks(links, nodePositions, highlightSet, scene) {
  // Dispose old meshes
  disposeLinks(scene);

  if (links.length === 0) return;

  const memoryLines = [];
  const memoryColors = [];
  relationshipMeshes = [];
  linkCurves.clear();
  particleData = [];

  for (const link of links) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    const sourcePos = nodePositions.get(sourceId);
    const targetPos = nodePositions.get(targetId);

    if (!sourcePos || !targetPos) continue;

    const s = new THREE.Vector3(sourcePos.x, sourcePos.y, sourcePos.z);
    const t = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);

    if (link.linkType === 'memory_entity') {
      // Memory links: simple straight lines (many, subtle)
      // Color based on memory type if source is a memory node
      const sourceNode = typeof link.source === 'object' ? link.source : null;
      const memoryType = sourceNode?.memoryType || 'fact';
      const typeColorHex = config.linkColors.memoryEntityByType?.[memoryType]
        || config.linkColors.memoryEntity;
      const typeColor = parseColor(typeColorHex);

      memoryLines.push(s.x, s.y, s.z, t.x, t.y, t.z);
      const alpha = config.links.memoryLineAlpha;
      memoryColors.push(typeColor.r, typeColor.g, typeColor.b, alpha, typeColor.r, typeColor.g, typeColor.b, alpha);
    } else {
      // Relationship links: curved tubes
      const isHighlighted = highlightSet.has(link);
      const curveMesh = createCurvedLink(link, s, t, isHighlighted);
      scene.add(curveMesh);
      relationshipMeshes.push(curveMesh);

      // Store curve for particle interpolation
      const curve = curveMesh.userData.curve;
      linkCurves.set(link.id, curve);

      // Add particles for this link
      const particleCount = getParticleCount(link, isHighlighted);
      for (let i = 0; i < particleCount; i++) {
        particleData.push({
          linkId: link.id,
          t: Math.random(), // position along curve (0-1)
          speed: config.particles.speed + Math.random() * config.particles.speedVariance,
          color: isHighlighted
            ? new THREE.Color(config.linkColors.particleHighlight)
            : new THREE.Color(config.linkColors.particle)
        });
      }
    }
  }

  // Create memory lines mesh
  if (memoryLines.length > 0) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(memoryLines, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(memoryColors, 4));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    memoryLineMesh = new THREE.LineSegments(geometry, material);
    memoryLineMesh.renderOrder = -1; // Render behind nodes
    scene.add(memoryLineMesh);
  }

  // Create particle system
  if (particleData.length > 0) {
    createParticleSystem(scene);
  }
}

// ── Curved link creation ────────────────────────────────────

function createCurvedLink(link, start, end, isHighlighted) {
  const { links: linkCfg, linkColors } = config;

  // Calculate perpendicular offset for curve control point
  const midpoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();

  // Perpendicular vector (cross with up, or use another axis if parallel)
  let perp = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
  if (perp.length() < 0.001) {
    perp = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(1, 0, 0));
  }
  perp.normalize();

  // Curvature based on link strength
  const curvature = linkCfg.curvature + (link.strength || 0.5) * linkCfg.curvatureStrength;
  const offset = perp.multiplyScalar(length * curvature);

  // Control point
  const control = midpoint.clone().add(offset);

  // Create curve
  const curve = new THREE.QuadraticBezierCurve3(start, control, end);

  // Create tube geometry
  const radius = isHighlighted
    ? (link.width || 0.5) * linkCfg.highlightRadius
    : Math.max(linkCfg.tubeRadius, (link.width || 0.4) * 0.5);

  const geometry = new THREE.TubeGeometry(
    curve,
    linkCfg.tubularSegments,
    radius,
    linkCfg.radialSegments,
    false
  );

  // Color
  let color;
  if (isHighlighted) {
    color = new THREE.Color(linkColors.highlighted);
  } else if (link.color) {
    color = parseColor(link.color);
  } else if (link.dashed) {
    color = new THREE.Color(linkColors.historical);
  } else {
    color = new THREE.Color(linkColors.relationship);
  }

  const opacity = isHighlighted
    ? linkCfg.highlightOpacity
    : (link.dashed ? linkCfg.historicalOpacity : linkCfg.opacity);

  const material = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 0;
  mesh.userData = { link, curve };

  return mesh;
}

// ── Particle count by link type ─────────────────────────────

function getParticleCount(link, isHighlighted) {
  const { particles: pCfg } = config;
  if (isHighlighted) return pCfg.highlightCount;
  if (link.direction === 'forward') return pCfg.forwardCount;
  if ((link.strength || 0) > pCfg.strongThreshold) return pCfg.strongCount;
  return 0;
}

// ── Particle system creation ────────────────────────────────

function createParticleSystem(scene) {
  const { particles: pCfg } = config;
  const positions = new Float32Array(particleData.length * 3);
  const colors = new Float32Array(particleData.length * 3);
  const sizes = new Float32Array(particleData.length);

  for (let i = 0; i < particleData.length; i++) {
    const p = particleData[i];
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    colors[i * 3] = p.color.r;
    colors[i * 3 + 1] = p.color.g;
    colors[i * 3 + 2] = p.color.b;
    sizes[i] = pCfg.size;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    size: pCfg.size,
    vertexColors: true,
    transparent: true,
    opacity: pCfg.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  particleSystem = new THREE.Points(geometry, material);
  particleSystem.renderOrder = 2;
  scene.add(particleSystem);
}

// ── Update particle positions (called from render loop) ─────

export function updateParticles(elapsed) {
  if (!particleSystem || particleData.length === 0) return;

  const positions = particleSystem.geometry.attributes.position.array;

  for (let i = 0; i < particleData.length; i++) {
    const p = particleData[i];
    const curve = linkCurves.get(p.linkId);

    if (!curve) continue;

    // Move along curve
    p.t += p.speed;
    if (p.t > 1) p.t -= 1;

    // Get position on curve
    const point = curve.getPointAt(p.t);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
  }

  particleSystem.geometry.attributes.position.needsUpdate = true;
}

// ── Quick position update (only when simulation is active) ──

export function updateLinkPositions(links, nodePositions, highlightSet, scene, alpha) {
  // Only rebuild links while simulation is still cooling
  if (alpha > 0.001) {
    updateLinks(links, nodePositions, highlightSet, scene);
  }
  lastAlpha = alpha;
}

// ── Helper to parse color strings ───────────────────────────

function parseColor(colorStr) {
  if (!colorStr) return new THREE.Color(0x8ca0ff);

  // Handle rgba(r,g,b,a)
  const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    return new THREE.Color(
      parseInt(rgbaMatch[1]) / 255,
      parseInt(rgbaMatch[2]) / 255,
      parseInt(rgbaMatch[3]) / 255
    );
  }

  // Handle hex
  if (colorStr.startsWith('#')) {
    return new THREE.Color(colorStr);
  }

  return new THREE.Color(0x8ca0ff);
}

// ── Dispose ─────────────────────────────────────────────────

export function disposeLinks(scene) {
  // Dispose relationship meshes
  for (const mesh of relationshipMeshes) {
    scene?.remove(mesh);
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }
  relationshipMeshes = [];

  // Dispose memory line mesh
  if (memoryLineMesh) {
    scene?.remove(memoryLineMesh);
    memoryLineMesh.geometry?.dispose();
    memoryLineMesh.material?.dispose();
    memoryLineMesh = null;
  }

  // Dispose particle system
  if (particleSystem) {
    scene?.remove(particleSystem);
    particleSystem.geometry?.dispose();
    particleSystem.material?.dispose();
    particleSystem = null;
  }

  linkCurves.clear();
  particleData = [];
}

/**
 * Refresh link colors based on current config
 * Call this when themes change to update existing links
 */
export function refreshLinkColors() {
  const { linkColors } = config;

  // Update relationship meshes
  for (const mesh of relationshipMeshes) {
    const link = mesh.userData?.link;
    if (!link || !mesh.material) continue;

    // Only update non-custom colored links
    if (!link.color) {
      if (link.dashed) {
        mesh.material.color.set(linkColors.historical);
      } else {
        mesh.material.color.set(linkColors.relationship);
      }
    }
  }

  // Update particle system colors
  if (particleSystem && particleSystem.material) {
    particleSystem.material.color.set(linkColors.particle);
  }

  // Update memory line colors
  if (memoryLineMesh && memoryLineMesh.material) {
    memoryLineMesh.material.color.set(linkColors.memoryEntity);
    memoryLineMesh.material.opacity = linkColors.memoryEntityAlpha;
  }
}
