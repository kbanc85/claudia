/**
 * Claudia Brain — Visual effects with Babylon.js 8
 *
 * Bloom, glow, ambient particles, fog, starfield, nebula.
 * Uses Babylon's built-in DefaultRenderingPipeline for post-processing
 * (no manual EffectComposer setup needed).
 */

import {
  DefaultRenderingPipeline,
  GlowLayer,
  Color3,
  Color4,
  Vector3,
  Texture,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  VertexData,
  VertexBuffer
} from '@babylonjs/core';

let pipeline = null;
let glowLayer = null;
let ambientPCS = null; // particle cloud system
let ambientParticleData = null;
let starfieldMesh = null;
let nebulaMesh = null;

// FPS tracking
let fpsFrames = 0;
let fpsLastTime = performance.now();
let currentFps = 0;

// Quality presets
const QUALITY_PRESETS = {
  low:    { bloom: false, bloomWeight: 0,   glowIntensity: 0,   particles: false, starfield: false, nebula: false, fog: false },
  medium: { bloom: true,  bloomWeight: 0.25, glowIntensity: 0.4, particles: true,  starfield: true,  nebula: true,  fog: true  },
  high:   { bloom: true,  bloomWeight: 0.35, glowIntensity: 0.5, particles: true,  starfield: true,  nebula: true,  fog: true  },
  ultra:  { bloom: true,  bloomWeight: 0.5,  glowIntensity: 0.7, particles: true,  starfield: true,  nebula: true,  fog: true  }
};
let currentQuality = 'high';

export function getFps() { return currentFps; }
export function getQuality() { return currentQuality; }

// ── Init ────────────────────────────────────────────────────

// Async version (not currently used, kept for reference)
export async function initEffects(scene, camera, engine) {
  initEffectsSync(scene, camera, engine);
}

// Non-async version that doesn't use dynamic import
export function initEffectsSync(scene, camera, engine) {
  // ── Fog ────────────────────────────────────────────────
  scene.fogMode = 2; // FOGMODE_EXP2
  scene.fogDensity = 0.0008;
  scene.fogColor = new Color3(0.02, 0.02, 0.06);

  // ── DefaultRenderingPipeline (bloom + more) ────────────
  pipeline = new DefaultRenderingPipeline('default', true, scene, [camera]);
  pipeline.bloomEnabled = true;
  pipeline.bloomWeight = 0.35;
  pipeline.bloomThreshold = 0.4;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.5;

  // ── GlowLayer (independent from bloom) ─────────────────
  glowLayer = new GlowLayer('glow', scene, {
    mainTextureFixedSize: 512,
    blurKernelSize: 32
  });
  glowLayer.intensity = 0.5;

  // ── Ambient particles ──────────────────────────────────
  addAmbientParticles(scene);

  // ── Starfield ──────────────────────────────────────────
  addStarfield(scene);

  // ── Nebula ─────────────────────────────────────────────
  addNebula(scene);

  // Load saved quality
  loadSavedQuality();
}

// ── Quality control ─────────────────────────────────────────

export function setQuality(preset) {
  if (!QUALITY_PRESETS[preset]) return;
  currentQuality = preset;
  const config = QUALITY_PRESETS[preset];

  if (pipeline) {
    pipeline.bloomEnabled = config.bloom;
    pipeline.bloomWeight = config.bloomWeight;
  }

  if (glowLayer) {
    glowLayer.intensity = config.glowIntensity;
  }

  if (ambientPCS) ambientPCS.isVisible = config.particles;
  if (starfieldMesh) starfieldMesh.isVisible = config.starfield;
  if (nebulaMesh) nebulaMesh.isVisible = config.nebula;

  try { localStorage.setItem('claudia-brain-quality', preset); } catch {}
  console.log(`Quality: ${preset}`);
}

export function loadSavedQuality() {
  try {
    const saved = localStorage.getItem('claudia-brain-quality');
    if (saved && QUALITY_PRESETS[saved]) {
      setQuality(saved);
      return saved;
    }
  } catch {}
  return 'high';
}

// ── Glow layer helpers ──────────────────────────────────────

export function addToGlow(mesh, intensity) {
  if (glowLayer) {
    glowLayer.addIncludedOnlyMesh(mesh);
    if (intensity !== undefined) {
      glowLayer.customEmissiveColorSelector = function(m, subMesh, material, result) {
        if (m === mesh && material.emissiveColor) {
          result.set(
            material.emissiveColor.r * intensity,
            material.emissiveColor.g * intensity,
            material.emissiveColor.b * intensity,
            1
          );
        }
      };
    }
  }
}

export function getGlowLayer() {
  return glowLayer;
}

// ── Ambient particles ───────────────────────────────────────

function addAmbientParticles(scene) {
  const count = 800;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 600;
    positions[i3 + 1] = (Math.random() - 0.5) * 600;
    positions[i3 + 2] = (Math.random() - 0.5) * 600;

    velocities[i3] = (Math.random() - 0.5) * 0.05;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.03;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.05;
  }

  // Custom mesh with raw position buffer rendered as points cloud
  const customMesh = new Mesh('ambientDust', scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;

  // Create indices for points
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;
  vertexData.indices = indices;
  vertexData.applyToMesh(customMesh, true);

  const mat = new StandardMaterial('ambientDustMat', scene);
  mat.diffuseColor = new Color3(0.39, 0.40, 0.95); // #6366f1
  mat.emissiveColor = new Color3(0.39, 0.40, 0.95);
  mat.alpha = 0.15;
  mat.disableLighting = true;
  mat.pointsCloud = true;
  mat.pointSize = 2;
  customMesh.material = mat;

  ambientPCS = customMesh;
  ambientParticleData = { positions, velocities, count };
}

export function updateAmbientParticles(elapsed) {
  if (!ambientPCS || !ambientPCS.isVisible || !ambientParticleData) return;

  const { positions, velocities, count } = ambientParticleData;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] += velocities[i3] + Math.sin(elapsed * 0.3 + i) * 0.01;
    positions[i3 + 1] += velocities[i3 + 1] + Math.cos(elapsed * 0.2 + i * 0.5) * 0.01;
    positions[i3 + 2] += velocities[i3 + 2] + Math.sin(elapsed * 0.25 + i * 0.7) * 0.01;

    for (let j = 0; j < 3; j++) {
      if (positions[i3 + j] > 300) positions[i3 + j] = -300;
      if (positions[i3 + j] < -300) positions[i3 + j] = 300;
    }
  }

  ambientPCS.updateVerticesData(VertexBuffer.PositionKind, positions);

  // Pulsing opacity
  if (ambientPCS.material) {
    ambientPCS.material.alpha = 0.12 + Math.sin(elapsed * 0.5) * 0.04;
  }
}

// ── Starfield ───────────────────────────────────────────────

function addStarfield(scene) {
  const starCount = 1500;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 4);

  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    const i4 = i * 4;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 600 + Math.random() * 400;

    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);

    const brightness = 0.3 + Math.random() * 0.5;
    colors[i4] = brightness * 0.85;
    colors[i4 + 1] = brightness * 0.9;
    colors[i4 + 2] = brightness;
    colors[i4 + 3] = 0.5;
  }

  const mesh = new Mesh('starfield', scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.colors = colors;

  const indices = new Uint32Array(starCount);
  for (let i = 0; i < starCount; i++) indices[i] = i;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh);

  const mat = new StandardMaterial('starfieldMat', scene);
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.disableLighting = true;
  mat.pointsCloud = true;
  mat.pointSize = 1.5;
  mat.alpha = 0.5;
  mesh.material = mat;
  mesh.isPickable = false;

  starfieldMesh = mesh;
}

// ── Nebula ──────────────────────────────────────────────────

function addNebula(scene) {
  // Create a large background plane with a nebula-like material
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark nebula with subtle color
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, 'rgba(30, 20, 60, 0.4)');
  gradient.addColorStop(0.3, 'rgba(15, 12, 40, 0.2)');
  gradient.addColorStop(0.6, 'rgba(8, 8, 25, 0.1)');
  gradient.addColorStop(1, 'rgba(5, 5, 16, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Color splashes
  const spots = [
    { x: 150, y: 200, r: 80, color: '60, 50, 140' },
    { x: 350, y: 300, r: 60, color: '20, 80, 120' },
    { x: 250, y: 150, r: 50, color: '100, 40, 80' }
  ];
  for (const spot of spots) {
    const g = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, spot.r);
    g.addColorStop(0, `rgba(${spot.color}, 0.15)`);
    g.addColorStop(1, `rgba(${spot.color}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }

  const texture = new Texture(canvas.toDataURL(), scene);

  const plane = MeshBuilder.CreatePlane('nebula', { size: 1500 }, scene);
  plane.position = new Vector3(0, 0, -500);
  plane.isPickable = false;
  plane.renderingGroupId = 0;

  const mat = new StandardMaterial('nebulaMat', scene);
  mat.diffuseTexture = texture;
  mat.emissiveTexture = texture;
  mat.disableLighting = true;
  mat.alpha = 0.6;
  mat.backFaceCulling = false;
  plane.material = mat;

  nebulaMesh = plane;
}

// ── FPS ─────────────────────────────────────────────────────

export function updateFps() {
  fpsFrames++;
  const now = performance.now();
  if (now - fpsLastTime >= 1000) {
    currentFps = Math.round(fpsFrames * 1000 / (now - fpsLastTime));
    fpsFrames = 0;
    fpsLastTime = now;
    const el = document.getElementById('fps-counter');
    if (el) el.textContent = `${currentFps} FPS`;
  }
}

// ── Node animations (breathing, spawn, pulse, shimmer) ──────

const phaseMap = new WeakMap();
function getPhase(node) {
  if (!phaseMap.has(node)) {
    phaseMap.set(node, Math.random() * Math.PI * 2);
  }
  return phaseMap.get(node);
}

export function animateNodes(meshMap, elapsed, delta) {
  for (const [nodeId, entry] of meshMap) {
    // Skip thin instances (handled separately)
    if (entry.isThinInstance) continue;

    const mesh = entry;
    if (!mesh.metadata?.node) continue;

    const node = mesh.metadata.node;
    const baseScale = mesh.metadata.baseScale || 1;
    const phase = getPhase(node);

    // ── Breathing ────────────────────────────────────────
    let breathRate, breathDepth;
    if (node.nodeType === 'entity') {
      breathRate = 0.8 + (node.importance || 0.5) * 0.3;
      breathDepth = 0.04 + (node.importance || 0.5) * 0.03;
    } else if (node.nodeType === 'pattern') {
      breathRate = 1.2;
      breathDepth = 0.08;
    } else {
      continue; // memories are thin instances
    }

    const breathScale = 1 + Math.sin(elapsed * breathRate + phase) * breathDepth;

    // ── Entity-specific motion ───────────────────────────
    if (node.nodeType === 'entity') {
      const s = baseScale * breathScale;
      mesh.scaling.set(s, s, s);

      if (node.entityType === 'organization') {
        mesh.rotation.y += delta * 0.15;
        mesh.rotation.x = Math.sin(elapsed * 0.3 + phase) * 0.1;
      } else if (node.entityType === 'project') {
        mesh.rotation.y += delta * 0.2;
        mesh.rotation.z = Math.sin(elapsed * 0.4 + phase) * 0.15;
      } else if (node.entityType === 'concept') {
        mesh.rotation.x += delta * 0.1;
        mesh.rotation.y += delta * 0.15;
      } else if (node.entityType === 'location') {
        mesh.rotation.x = Math.PI / 2;
        mesh.rotation.z += delta * 0.1;
      }

      // Emissive pulsing
      if (mesh.material?.emissiveColor) {
        const emPulse = 0.25 + Math.sin(elapsed * breathRate * 0.7 + phase) * 0.12;
        const baseColor = mesh.material.__baseEmissive;
        if (!baseColor) {
          mesh.material.__baseEmissive = mesh.material.emissiveColor.clone();
        }
        const base = mesh.material.__baseEmissive || mesh.material.emissiveColor;
        mesh.material.emissiveColor = base.scale(emPulse / 0.35);
      }
    }

    // ── Pattern rotation ─────────────────────────────────
    if (node.nodeType === 'pattern') {
      const s = baseScale * breathScale;
      mesh.scaling.set(s, s, s);
      mesh.rotation.y += delta * 0.3;
      mesh.rotation.x += delta * 0.1;
      mesh.rotation.z = Math.sin(elapsed * 0.5 + phase) * 0.2;
    }

    // ── Spawn animation ──────────────────────────────────
    if (node.__spawn) {
      const age = (Date.now() - (node.__spawnTime || (node.__spawnTime = Date.now()))) / 1000;
      if (age < 1.5) {
        const t = age / 1.5;
        const elastic = 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 3);
        const s = baseScale * elastic;
        mesh.scaling.set(s, s, s);
        if (mesh.material) {
          mesh.material.alpha = Math.min(1, t * 2);
        }
      } else {
        node.__spawn = false;
      }
    }

    // ── Pulse animation ──────────────────────────────────
    if (node.__pulse) {
      const age = (Date.now() - (node.__pulseTime || (node.__pulseTime = Date.now()))) / 1000;
      if (age < 2.5) {
        const t = age / 2.5;
        const pulseWave = Math.sin(t * Math.PI * 2) * (1 - t);
        const s = baseScale * (1 + pulseWave * 0.4);
        mesh.scaling.set(s, s, s);
      } else {
        node.__pulse = false;
        node.__pulseTime = null;
      }
    }

    // ── Shimmer animation ────────────────────────────────
    if (node.__shimmer) {
      const age = (Date.now() - (node.__shimmerTime || (node.__shimmerTime = Date.now()))) / 1000;
      if (age < 3) {
        const t = age / 3;
        if (mesh.material?.__baseEmissive) {
          const flicker = 0.3 + Math.sin(age * 10) * 0.3 * (1 - t);
          mesh.material.emissiveColor = mesh.material.__baseEmissive.scale(flicker / 0.35);
        }
      } else {
        node.__shimmer = false;
        node.__shimmerTime = null;
      }
    }
  }
}

// ── Nebula rotation ─────────────────────────────────────────

export function updateNebula(elapsed) {
  if (nebulaMesh && nebulaMesh.isVisible) {
    nebulaMesh.rotation.z = elapsed * 0.01;
  }
}

// ── Dispose ─────────────────────────────────────────────────

export function disposeEffects() {
  if (pipeline) { pipeline.dispose(); pipeline = null; }
  if (glowLayer) { glowLayer.dispose(); glowLayer = null; }
  if (ambientPCS) { ambientPCS.dispose(); ambientPCS = null; }
  if (starfieldMesh) { starfieldMesh.dispose(); starfieldMesh = null; }
  if (nebulaMesh) { nebulaMesh.dispose(); nebulaMesh = null; }
}
