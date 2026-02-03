/**
 * Claudia Brain — Living organism effects
 *
 * Every node breathes at its own rhythm. The whole scene has an
 * organic pulse. Ambient particles drift like neural dust.
 * Lighting shifts subtly like bioluminescence.
 *
 * Performance notes:
 * - Single render per frame: force-graph's renderer.render() is intercepted
 *   and redirected through TSL PostProcessing (bloom). No double rendering.
 * - WebGPU renderer uses Metal directly on macOS (no ANGLE/OpenGL translation).
 * - Animated node references are cached; scene.traverse() only runs on
 *   graph data changes, not every frame.
 */

import * as THREE from 'three';

import { getGraph, getHighlightNodes } from './graph.js';

// Bloom pipeline — set at init based on renderer type
let postProcessing = null; // TSL PostProcessing (WebGPU path)
let bloomPass = null;      // TSL BloomNode (WebGPU path)
let bloomComposer = null;  // EffectComposer (WebGL path)
let isWebGPURenderer = false;
const clock = new THREE.Clock();

// Ambient particle system
let ambientParticles = null;
let nebulaMesh = null;
let starfieldMesh = null;

// Cached animated node references (rebuilt only when graph changes)
let animatedNodes = [];
let nodesCacheDirty = true;

// FPS tracking
let fpsFrames = 0;
let fpsLastTime = performance.now();
let currentFps = 0;

// Quality state
const QUALITY_PRESETS = {
  low:    { bloom: false, bloomStrength: 0,   bloomPixelRatio: 1,    particles: false, starfield: false, nebula: false },
  medium: { bloom: true,  bloomStrength: 1.0, bloomPixelRatio: 1,    particles: true,  starfield: true,  nebula: true  },
  high:   { bloom: true,  bloomStrength: 1.5, bloomPixelRatio: 1,    particles: true,  starfield: true,  nebula: true  },
  ultra:  { bloom: true,  bloomStrength: 1.8, bloomPixelRatio: null,  particles: true,  starfield: true,  nebula: true  }
};
let currentQuality = 'high';
let bloomEnabled = true;
let originalRender = null;

// ── Public API ─────────────────────────────────────────────────

export function getFps() { return currentFps; }
export function getQuality() { return currentQuality; }

/** Signal that the scene graph changed (new nodes added/removed). */
export function markNodesDirty() {
  nodesCacheDirty = true;
}

export function setQuality(preset) {
  if (!QUALITY_PRESETS[preset]) return;
  currentQuality = preset;
  const config = QUALITY_PRESETS[preset];

  bloomEnabled = config.bloom;

  // Update bloom parameters based on renderer path
  if (isWebGPURenderer && bloomPass && config.bloom) {
    bloomPass.strength.value = config.bloomStrength;
  } else if (!isWebGPURenderer && bloomComposer) {
    const graph = getGraph();
    if (graph) {
      const renderer = graph.renderer();
      const nativePr = renderer.getPixelRatio();
      bloomComposer.setPixelRatio(config.bloomPixelRatio ?? nativePr);
    }
  }

  // Toggle visual elements
  if (ambientParticles) ambientParticles.visible = config.particles;
  if (starfieldMesh) starfieldMesh.visible = config.starfield;
  if (nebulaMesh) nebulaMesh.visible = config.nebula;

  // Persist
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

// ── Init ───────────────────────────────────────────────────────

export async function initEffects() {
  const graph = getGraph();
  if (!graph) return;

  const renderer = graph.renderer();
  const scene = graph.scene();
  const camera = graph.camera();

  // ── Fog (depth atmosphere) ────────────────────────────────
  scene.fog = new THREE.FogExp2(0x050510, 0.0008);

  // ── Lighting (bioluminescent feel) ────────────────────────
  const ambient = new THREE.AmbientLight(0x1a1a3e, 0.8);
  scene.add(ambient);

  // Warm key light (upper right)
  const key = new THREE.PointLight(0x6366f1, 1.0, 800);
  key.position.set(150, 250, 150);
  scene.add(key);

  // Cool fill (lower left)
  const fill = new THREE.PointLight(0x0ea5e9, 0.5, 600);
  fill.position.set(-200, -150, 200);
  scene.add(fill);

  // Warm accent (behind camera)
  const accent = new THREE.PointLight(0xf59e0b, 0.3, 500);
  accent.position.set(0, 100, -200);
  scene.add(accent);

  // ── Bloom ─────────────────────────────────────────────────
  // Two paths: TSL PostProcessing for WebGPU, EffectComposer for WebGL.
  // TSL PostProcessing only works with WebGPURenderer; trying to use it
  // with WebGLRenderer causes shader crashes.
  isWebGPURenderer = renderer.constructor.name === 'WebGPURenderer' || !!renderer.isWebGPURenderer;

  if (isWebGPURenderer) {
    try {
      const { PostProcessing } = await import('three/webgpu');
      const { pass } = await import('three/tsl');
      const { bloom } = await import('three/addons/tsl/display/BloomNode.js');

      postProcessing = new PostProcessing(renderer);
      const scenePass = pass(scene, camera);
      const scenePassColor = scenePass.getTextureNode('output');
      bloomPass = bloom(scenePassColor, 1.5, 0.8, 0.3);
      postProcessing.outputNode = scenePassColor.add(bloomPass);

      // Intercept force-graph's render call → redirect through PostProcessing
      let insideBloomRender = false;
      originalRender = renderer.render.bind(renderer);

      renderer.render = function(s, c, ...args) {
        if (insideBloomRender) {
          return originalRender(s, c, ...args);
        }
        updateEffects(s, c);
        updateFps();
        if (!bloomEnabled) {
          return originalRender(s, c, ...args);
        }
        insideBloomRender = true;
        try { postProcessing.render(); } finally { insideBloomRender = false; }
      };

      console.log('Bloom enabled (TSL PostProcessing, WebGPU/Metal)');
    } catch (err) {
      console.warn('WebGPU bloom setup failed, using fallback:', err.message);
      setupFallbackRender(renderer, scene, camera);
    }
  } else {
    // WebGL path — use EffectComposer + UnrealBloomPass
    try {
      const [ecMod, rpMod, ubpMod] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js')
      ]);

      const size = renderer.getSize(new THREE.Vector2());
      const pixelRatio = renderer.getPixelRatio();

      const renderPass = new rpMod.RenderPass(scene, camera);
      const bloomPassGL = new ubpMod.UnrealBloomPass(
        new THREE.Vector2(size.x * pixelRatio, size.y * pixelRatio),
        1.5, 0.8, 0.3
      );

      bloomComposer = new ecMod.EffectComposer(renderer);
      bloomComposer.setSize(size.x, size.y);
      bloomComposer.setPixelRatio(Math.min(pixelRatio, 1));
      bloomComposer.addPass(renderPass);
      bloomComposer.addPass(bloomPassGL);

      let insideBloomRender = false;
      originalRender = renderer.render.bind(renderer);

      renderer.render = function(s, c, ...args) {
        if (insideBloomRender) {
          return originalRender(s, c, ...args);
        }
        updateEffects(s, c);
        updateFps();
        if (!bloomEnabled) {
          return originalRender(s, c, ...args);
        }
        insideBloomRender = true;
        try { bloomComposer.render(); } finally { insideBloomRender = false; }
      };

      // Handle resize
      window.addEventListener('resize', () => {
        const g = getGraph();
        if (bloomComposer && g) {
          const r = g.renderer();
          const s = r.getSize(new THREE.Vector2());
          const nativePr = r.getPixelRatio();
          bloomComposer.setSize(s.x, s.y);
          const config = QUALITY_PRESETS[currentQuality];
          bloomComposer.setPixelRatio(config.bloomPixelRatio ?? nativePr);
        }
      });

      console.log('Bloom enabled (EffectComposer, WebGL, pr:', Math.min(pixelRatio, 1), ')');
    } catch (err) {
      console.warn('WebGL bloom setup failed, using fallback:', err.message);
      setupFallbackRender(renderer, scene, camera);
    }
  }

  // ── Ambient floating particles (neural dust) ──────────────
  addAmbientParticles(scene);

  // ── Deep space nebula backdrop ────────────────────────────
  addNebula(scene);

  // ── Starfield ─────────────────────────────────────────────
  addStarfield(scene);

  // Load saved quality preference (applies after everything is created)
  loadSavedQuality();
}

// ── FPS tracking ───────────────────────────────────────────────

function updateFps() {
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

// ── Fallback (no bloom) ──────────────────────────────────────

function setupFallbackRender(renderer, scene, camera) {
  // Patch force-graph's render to include our effects + FPS tracking
  originalRender = renderer.render.bind(renderer);
  renderer.render = function(s, c, ...args) {
    updateEffects(s, c);
    updateFps();
    return originalRender(s, c, ...args);
  };
}

// ── Ambient particles (drift like cellular debris) ──────────

function addAmbientParticles(scene) {
  const count = 800;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 600;
    positions[i3 + 1] = (Math.random() - 0.5) * 600;
    positions[i3 + 2] = (Math.random() - 0.5) * 600;

    // Slow drift velocities
    velocities[i3] = (Math.random() - 0.5) * 0.05;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.03;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.05;

    sizes[i] = 0.5 + Math.random() * 1.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    color: 0x6366f1,
    size: 1.0,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  ambientParticles = new THREE.Points(geometry, material);
  ambientParticles.__velocities = velocities;
  scene.add(ambientParticles);
}

function updateAmbientParticles(elapsed) {
  if (!ambientParticles || !ambientParticles.visible) return;

  const positions = ambientParticles.geometry.attributes.position.array;
  const velocities = ambientParticles.__velocities;
  const count = positions.length / 3;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    // Drift with slight sine wobble
    positions[i3] += velocities[i3] + Math.sin(elapsed * 0.3 + i) * 0.01;
    positions[i3 + 1] += velocities[i3 + 1] + Math.cos(elapsed * 0.2 + i * 0.5) * 0.01;
    positions[i3 + 2] += velocities[i3 + 2] + Math.sin(elapsed * 0.25 + i * 0.7) * 0.01;

    // Wrap around (keep particles in view)
    for (let j = 0; j < 3; j++) {
      if (positions[i3 + j] > 300) positions[i3 + j] = -300;
      if (positions[i3 + j] < -300) positions[i3 + j] = 300;
    }
  }

  ambientParticles.geometry.attributes.position.needsUpdate = true;

  // Pulsing opacity on the whole particle system
  ambientParticles.material.opacity = 0.12 + Math.sin(elapsed * 0.5) * 0.04;
}

// ── Nebula backdrop ─────────────────────────────────────────

function addNebula(scene) {
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

  // Add subtle color splashes
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

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false
  });

  nebulaMesh = new THREE.Sprite(material);
  nebulaMesh.scale.setScalar(1500);
  nebulaMesh.position.set(0, 0, -400);
  scene.add(nebulaMesh);
}

// ── Starfield ───────────────────────────────────────────────

function addStarfield(scene) {
  const starCount = 1500;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 600 + Math.random() * 400;

    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);

    // Cool blue-white stars
    const brightness = 0.3 + Math.random() * 0.5;
    colors[i3] = brightness * 0.85;
    colors[i3 + 1] = brightness * 0.9;
    colors[i3 + 2] = brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  starfieldMesh = new THREE.Points(geometry, material);
  scene.add(starfieldMesh);
}

// ── Node cache management ───────────────────────────────────

function ensureNodeCache(scene) {
  if (!nodesCacheDirty && animatedNodes.length > 0) return;
  animatedNodes = [];
  scene.traverse(obj => {
    if (obj.userData?.node && obj.userData?.mesh) {
      animatedNodes.push({ node: obj.userData.node, mesh: obj.userData.mesh });
    }
  });
  nodesCacheDirty = false;
}

// ── Per-frame effects ───────────────────────────────────────

function updateEffects(scene, camera) {
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Animate ambient particles
  updateAmbientParticles(elapsed);

  // Gentle nebula rotation
  if (nebulaMesh && nebulaMesh.visible) {
    nebulaMesh.material.rotation = elapsed * 0.01;
  }

  // Rebuild node cache if graph changed; otherwise use cached references
  ensureNodeCache(scene);

  // Animate all cached nodes
  for (const { node, mesh } of animatedNodes) {
    const phase = getPhase(node);

    // ── Universal breathing ─────────────────────────────
    // Every node breathes at its own rate. Entities breathe slow and deep,
    // memories breathe fast and shallow. Creates an organic rhythm.
    let breathRate, breathDepth;

    if (node.nodeType === 'entity') {
      breathRate = 0.8 + (node.importance || 0.5) * 0.3;
      breathDepth = 0.04 + (node.importance || 0.5) * 0.03;
    } else if (node.nodeType === 'pattern') {
      breathRate = 1.2;
      breathDepth = 0.08;
    } else if (node.memoryType === 'commitment') {
      breathRate = 2.0;
      breathDepth = 0.06;
    } else {
      breathRate = 1.5 + Math.sin(phase) * 0.3;
      breathDepth = 0.02;
    }

    const breathScale = 1 + Math.sin(elapsed * breathRate + phase) * breathDepth;
    const baseScale = node.size || 1;

    // ── Entity-specific motion ──────────────────────────
    if (node.nodeType === 'entity') {
      mesh.scale.setScalar(baseScale * breathScale);

      // Slow rotation (each type rotates differently)
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
        mesh.rotation.x = Math.PI / 2; // torus lies flat
        mesh.rotation.z += delta * 0.1;
      }

      // Emissive pulsing (bioluminescent heartbeat)
      if (mesh.material && mesh.material.emissiveIntensity !== undefined) {
        const emPulse = 0.25 + Math.sin(elapsed * breathRate * 0.7 + phase) * 0.12;
        mesh.material.emissiveIntensity = emPulse;
      }
    }

    // ── Pattern nodes: ethereal rotation ────────────────
    if (node.nodeType === 'pattern') {
      mesh.scale.setScalar(baseScale * breathScale);
      mesh.rotation.y += delta * 0.3;
      mesh.rotation.x += delta * 0.1;
      mesh.rotation.z = Math.sin(elapsed * 0.5 + phase) * 0.2;
    }

    // ── Memory particles: gentle drift ──────────────────
    if (node.nodeType === 'memory') {
      mesh.scale.setScalar(baseScale * breathScale);

      if (mesh.material && mesh.material.emissiveIntensity !== undefined) {
        mesh.material.emissiveIntensity = 0.15 + Math.sin(elapsed * breathRate + phase) * 0.1;
      }
    }

    // ── Spawn animation (new nodes bloom into existence) ──
    if (node.__spawn) {
      const age = (Date.now() - (node.__spawnTime || (node.__spawnTime = Date.now()))) / 1000;
      if (age < 1.5) {
        const t = age / 1.5;
        // Elastic ease-out
        const elastic = 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 3);
        mesh.scale.setScalar(baseScale * elastic);
        if (mesh.material) {
          mesh.material.emissiveIntensity = (1 - t) * 1.2;
          mesh.material.opacity = Math.min(1, t * 2);
        }
      } else {
        node.__spawn = false;
      }
    }

    // ── Pulse animation (recall event) ──────────────────
    if (node.__pulse) {
      const age = (Date.now() - (node.__pulseTime || (node.__pulseTime = Date.now()))) / 1000;
      if (age < 2.5) {
        const t = age / 2.5;
        const pulseWave = Math.sin(t * Math.PI * 2) * (1 - t);
        mesh.scale.setScalar(baseScale * (1 + pulseWave * 0.4));
        if (mesh.material) {
          mesh.material.emissiveIntensity = 0.3 + (1 - t) * 0.8;
        }
      } else {
        node.__pulse = false;
        node.__pulseTime = null;
      }
    }

    // ── Shimmer animation (LLM improvement) ─────────────
    if (node.__shimmer) {
      const age = (Date.now() - (node.__shimmerTime || (node.__shimmerTime = Date.now()))) / 1000;
      if (age < 3) {
        const t = age / 3;
        if (mesh.material) {
          mesh.material.emissiveIntensity = 0.3 + Math.sin(age * 10) * 0.3 * (1 - t);
        }
      } else {
        node.__shimmer = false;
        node.__shimmerTime = null;
      }
    }
  }
}

// ── Phase helper ────────────────────────────────────────────

const phaseMap = new WeakMap();
function getPhase(node) {
  if (!phaseMap.has(node)) {
    phaseMap.set(node, Math.random() * Math.PI * 2);
  }
  return phaseMap.get(node);
}

export function disposeEffects() {
  // Restore original render if we patched it
  if (originalRender) {
    const graph = getGraph();
    if (graph) {
      graph.renderer().render = originalRender;
    }
    originalRender = null;
  }
}
