/**
 * Claudia Brain — Visual effects with Three.js
 *
 * Bloom, glow, ambient particles, fog, starfield, nebula, node animations.
 * Uses EffectComposer for post-processing (integrated into owned render loop).
 *
 * Key difference from legacy: bloom is integrated into render loop, not
 * monkey-patched onto renderer.render().
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { config } from './config.js';
import { updateParticles } from './links.js';

let bloomComposer = null;
let bloomPass = null;
let ambientParticles = null;
let nebulaMesh = null;
let starfieldMesh = null;

// FPS tracking
let fpsFrames = 0;
let fpsLastTime = performance.now();
let currentFps = 0;

// Quality presets are now in config.quality.presets
let currentQuality = 'high';
let bloomEnabled = true;

// Animation phase map (per-node unique phase)
const phaseMap = new WeakMap();
function getPhase(node) {
  if (!phaseMap.has(node)) {
    phaseMap.set(node, Math.random() * Math.PI * 2);
  }
  return phaseMap.get(node);
}

// Export for cache refresh (called by main.js on config update)
export function refreshAnimationCache() {
  // Animation config is read directly from config object for simplicity
  // Object property access is fast enough in modern JS engines
}

// ── Public API ──────────────────────────────────────────────

export function getFps() { return currentFps; }
export function getQuality() { return currentQuality; }

export function setQuality(preset) {
  const presets = config.quality.presets;
  if (!presets[preset]) return;
  currentQuality = preset;
  config.quality.current = preset;
  const presetConfig = presets[preset];

  bloomEnabled = presetConfig.bloom;

  if (bloomPass) {
    bloomPass.strength = presetConfig.bloom ? presetConfig.bloomStrength : 0;
  }

  if (ambientParticles) ambientParticles.visible = presetConfig.particles;
  if (starfieldMesh) starfieldMesh.visible = presetConfig.starfield;
  if (nebulaMesh) nebulaMesh.visible = presetConfig.nebula;

  try { localStorage.setItem('claudia-brain-quality', preset); } catch {}
  console.log(`Quality: ${preset}`);
}

export function loadSavedQuality() {
  try {
    const saved = localStorage.getItem('claudia-brain-quality');
    if (saved && config.quality.presets[saved]) {
      setQuality(saved);
      return saved;
    }
  } catch {}
  return config.quality.current || 'high';
}

// ── Init ────────────────────────────────────────────────────

export async function initEffects(scene, camera, renderer) {
  // ── Bloom via EffectComposer ────────────────────────────
  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();

  const renderPass = new RenderPass(scene, camera);
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x * pixelRatio, size.y * pixelRatio),
    config.bloom.strength,
    config.bloom.radius,
    config.bloom.threshold
  );

  bloomComposer = new EffectComposer(renderer);
  bloomComposer.setSize(size.x, size.y);
  bloomComposer.setPixelRatio(Math.min(pixelRatio, 1.5)); // Cap for performance
  bloomComposer.addPass(renderPass);
  bloomComposer.addPass(bloomPass);

  // Handle resize
  window.addEventListener('resize', () => {
    const newSize = renderer.getSize(new THREE.Vector2());
    bloomComposer.setSize(newSize.x, newSize.y);
  });

  console.log('Bloom enabled (EffectComposer, pr:', Math.min(pixelRatio, 1.5), ')');

  // ── Ambient particles (neural dust) ────────────────────
  addAmbientParticles(scene);

  // ── Starfield ──────────────────────────────────────────
  addStarfield(scene);

  // ── Nebula backdrop ────────────────────────────────────
  addNebula(scene);

  // Load saved quality
  loadSavedQuality();

  return bloomComposer;
}

// ── FPS tracking ────────────────────────────────────────────

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

// ── Ambient particles ───────────────────────────────────────

function addAmbientParticles(scene) {
  const { ambientParticles: cfg } = config;
  const count = cfg.count;
  const spread = cfg.spread;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * spread;
    positions[i3 + 1] = (Math.random() - 0.5) * spread;
    positions[i3 + 2] = (Math.random() - 0.5) * spread;

    velocities[i3] = (Math.random() - 0.5) * cfg.velocityX;
    velocities[i3 + 1] = (Math.random() - 0.5) * cfg.velocityY;
    velocities[i3 + 2] = (Math.random() - 0.5) * cfg.velocityZ;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(cfg.color),
    size: cfg.size,
    transparent: true,
    opacity: cfg.baseOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  ambientParticles = new THREE.Points(geometry, material);
  ambientParticles.__velocities = velocities;
  scene.add(ambientParticles);
}

export function refreshAmbientCache() {
  // Ambient config is read directly from config object for simplicity
}

export function updateAmbientParticles(elapsed) {
  if (!ambientParticles || !ambientParticles.visible) return;

  const cfg = config.ambientParticles;
  const positions = ambientParticles.geometry.attributes.position.array;
  const velocities = ambientParticles.__velocities;
  const count = positions.length / 3;
  const wrapDist = cfg.wrapDistance;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    // Drift with sine wobble
    positions[i3] += velocities[i3] + Math.sin(elapsed * cfg.wobbleSpeedX + i) * cfg.wobbleX;
    positions[i3 + 1] += velocities[i3 + 1] + Math.cos(elapsed * cfg.wobbleSpeedY + i * 0.5) * cfg.wobbleY;
    positions[i3 + 2] += velocities[i3 + 2] + Math.sin(elapsed * cfg.wobbleSpeedZ + i * 0.7) * cfg.wobbleZ;

    // Wrap around
    for (let j = 0; j < 3; j++) {
      if (positions[i3 + j] > wrapDist) positions[i3 + j] = -wrapDist;
      if (positions[i3 + j] < -wrapDist) positions[i3 + j] = wrapDist;
    }
  }

  ambientParticles.geometry.attributes.position.needsUpdate = true;

  // Pulsing opacity
  ambientParticles.material.opacity = cfg.baseOpacity + Math.sin(elapsed * cfg.opacityPulseSpeed) * cfg.opacityPulse;
}

// ── Starfield ───────────────────────────────────────────────

function addStarfield(scene) {
  const { starfield: cfg } = config;
  const starCount = cfg.count;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = cfg.minRadius + Math.random() * (cfg.maxRadius - cfg.minRadius);

    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);

    // Cool blue-white stars
    const brightness = cfg.brightnessMin + Math.random() * (cfg.brightnessMax - cfg.brightnessMin);
    colors[i3] = brightness * 0.85;
    colors[i3 + 1] = brightness * 0.9;
    colors[i3 + 2] = brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: cfg.size,
    vertexColors: true,
    transparent: true,
    opacity: cfg.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  starfieldMesh = new THREE.Points(geometry, material);
  scene.add(starfieldMesh);
}

// ── Nebula ──────────────────────────────────────────────────

function addNebula(scene) {
  const { nebula: cfg } = config;

  // Skip if nebula is disabled by theme
  if (cfg.enabled === false) {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark nebula with subtle color
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, cfg.colors.core);
  gradient.addColorStop(0.3, cfg.colors.mid1);
  gradient.addColorStop(0.6, cfg.colors.mid2);
  gradient.addColorStop(1, cfg.colors.edge);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Color splashes
  for (const spot of cfg.spots) {
    const g = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, spot.r);
    g.addColorStop(0, `rgba(${spot.color}, ${spot.alpha})`);
    g.addColorStop(1, `rgba(${spot.color}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false
  });

  nebulaMesh = new THREE.Sprite(material);
  nebulaMesh.scale.setScalar(cfg.size);
  nebulaMesh.position.set(0, 0, cfg.positionZ);
  scene.add(nebulaMesh);
}

export function updateNebula(elapsed) {
  if (nebulaMesh && nebulaMesh.visible) {
    nebulaMesh.material.rotation = elapsed * config.nebula.rotationSpeed;
  }
}

// ── Link particles (delegated to links.js) ──────────────────

export function updateLinkParticles(elapsed) {
  updateParticles(elapsed);
}

// ── Node animations ─────────────────────────────────────────

export function animateNodes(meshMap, elapsed, delta) {
  const anim = config.animations;

  for (const [nodeId, group] of meshMap) {
    if (!group.userData?.node || !group.userData?.mesh) continue;

    const node = group.userData.node;
    const mesh = group.userData.mesh;
    const baseScale = group.userData.baseScale || 1;
    const phase = getPhase(node);

    // ── Breathing ────────────────────────────────────────
    let breathRate, breathDepth;

    if (node.nodeType === 'entity') {
      breathRate = anim.breathing.entityRate + (node.importance || 0.5) * anim.breathing.entityImportanceRateBonus;
      breathDepth = anim.breathing.entityDepth + (node.importance || 0.5) * anim.breathing.entityImportanceDepthBonus;
    } else if (node.nodeType === 'pattern') {
      breathRate = anim.breathing.patternRate;
      breathDepth = anim.breathing.patternDepth;
    } else if (node.memoryType === 'commitment') {
      breathRate = anim.breathing.commitmentRate;
      breathDepth = anim.breathing.commitmentDepth;
    } else {
      breathRate = anim.breathing.memoryRate + Math.sin(phase) * anim.breathing.memoryRateVariance;
      breathDepth = anim.breathing.memoryDepth;
    }

    const breathScale = 1 + Math.sin(elapsed * breathRate + phase) * breathDepth;

    // ── Entity-specific motion ───────────────────────────
    if (node.nodeType === 'entity') {
      mesh.scale.setScalar(baseScale * breathScale);

      // Slow rotation
      if (node.entityType === 'organization') {
        mesh.rotation.y += delta * anim.rotation.orgSpeed;
        mesh.rotation.x = Math.sin(elapsed * 0.3 + phase) * anim.rotation.orgTilt;
      } else if (node.entityType === 'project') {
        mesh.rotation.y += delta * anim.rotation.projectSpeed;
        mesh.rotation.z = Math.sin(elapsed * 0.4 + phase) * anim.rotation.projectTilt;
      } else if (node.entityType === 'concept') {
        mesh.rotation.x += delta * anim.rotation.conceptSpeedX;
        mesh.rotation.y += delta * anim.rotation.conceptSpeedY;
      } else if (node.entityType === 'location') {
        mesh.rotation.x = Math.PI / 2; // torus lies flat
        mesh.rotation.z += delta * 0.1;
      }

      // Emissive pulsing
      if (mesh.material?.emissiveIntensity !== undefined) {
        const emPulse = anim.emissive.entityPulseBase +
          Math.sin(elapsed * breathRate * anim.emissive.entityPulseMultiplier + phase) * anim.emissive.entityPulseDepth;
        mesh.material.emissiveIntensity = emPulse;
      }
    }

    // ── Pattern rotation ─────────────────────────────────
    if (node.nodeType === 'pattern') {
      mesh.scale.setScalar(baseScale * breathScale);
      mesh.rotation.y += delta * anim.rotation.patternSpeedY;
      mesh.rotation.x += delta * anim.rotation.patternSpeedX;
      mesh.rotation.z = Math.sin(elapsed * 0.5 + phase) * anim.rotation.patternTilt;
    }

    // ── Memory breathing ─────────────────────────────────
    if (node.nodeType === 'memory') {
      mesh.scale.setScalar(baseScale * breathScale);

      if (mesh.material?.emissiveIntensity !== undefined) {
        mesh.material.emissiveIntensity = anim.emissive.memoryPulseBase +
          Math.sin(elapsed * breathRate + phase) * anim.emissive.memoryPulseDepth;
      }
    }

    // ── Spawn animation ──────────────────────────────────
    if (node.__spawn) {
      const age = (Date.now() - (node.__spawnTime || (node.__spawnTime = Date.now()))) / 1000;
      if (age < anim.spawn.duration) {
        const t = age / anim.spawn.duration;
        // Elastic ease-out
        const elastic = 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 3);
        mesh.scale.setScalar(baseScale * elastic);
        if (mesh.material) {
          mesh.material.emissiveIntensity = (1 - t) * anim.spawn.emissiveBoost;
          mesh.material.opacity = Math.min(1, t * 2);
        }
      } else {
        node.__spawn = false;
      }
    }

    // ── Pulse animation (recall event) ───────────────────
    if (node.__pulse) {
      const age = (Date.now() - (node.__pulseTime || (node.__pulseTime = Date.now()))) / 1000;
      if (age < anim.pulse.duration) {
        const t = age / anim.pulse.duration;
        const pulseWave = Math.sin(t * Math.PI * 2) * (1 - t);
        mesh.scale.setScalar(baseScale * (1 + pulseWave * anim.pulse.scaleBoost));
        if (mesh.material) {
          mesh.material.emissiveIntensity = anim.pulse.emissiveBase + (1 - t) * anim.pulse.emissiveBoost;
        }
      } else {
        node.__pulse = false;
        node.__pulseTime = null;
      }
    }

    // ── Shimmer animation (LLM improvement) ──────────────
    if (node.__shimmer) {
      const age = (Date.now() - (node.__shimmerTime || (node.__shimmerTime = Date.now()))) / 1000;
      if (age < anim.shimmer.duration) {
        const t = age / anim.shimmer.duration;
        if (mesh.material) {
          mesh.material.emissiveIntensity = anim.shimmer.emissiveBase +
            Math.sin(age * anim.shimmer.frequency) * anim.shimmer.emissiveDepth * (1 - t);
        }
      } else {
        node.__shimmer = false;
        node.__shimmerTime = null;
      }
    }
  }
}

// ── Config update helpers ────────────────────────────────────

export function getBloomPass() {
  return bloomPass;
}

export function updateBloom() {
  if (bloomPass) {
    bloomPass.strength = config.bloom.strength;
    bloomPass.radius = config.bloom.radius;
    bloomPass.threshold = config.bloom.threshold;
  }
}

export function updateFog(scene) {
  if (scene?.fog) {
    scene.fog.color.set(config.fog.color);
    scene.fog.density = config.fog.density;
  }
}

export function updateAmbientParticlesConfig() {
  if (ambientParticles) {
    const { ambientParticles: cfg } = config;
    ambientParticles.material.color.set(cfg.color);
    ambientParticles.material.size = cfg.size;
  }
}

export function updateStarfieldConfig() {
  if (starfieldMesh) {
    const { starfield: cfg } = config;
    starfieldMesh.material.size = cfg.size;
    starfieldMesh.material.opacity = cfg.opacity;
  }
}

export function updateNebulaConfig() {
  if (nebulaMesh) {
    nebulaMesh.visible = config.nebula.enabled !== false;
    nebulaMesh.scale.setScalar(config.nebula.size);
    nebulaMesh.position.z = config.nebula.positionZ;
  }
}

// ── Dispose ─────────────────────────────────────────────────

export function disposeEffects() {
  if (bloomComposer) {
    bloomComposer.dispose();
    bloomComposer = null;
  }
  if (ambientParticles) {
    ambientParticles.geometry?.dispose();
    ambientParticles.material?.dispose();
    ambientParticles = null;
  }
  if (starfieldMesh) {
    starfieldMesh.geometry?.dispose();
    starfieldMesh.material?.dispose();
    starfieldMesh = null;
  }
  if (nebulaMesh) {
    nebulaMesh.material?.dispose();
    nebulaMesh = null;
  }
}
