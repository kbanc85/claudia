/**
 * Claudia Brain -- Visual effects (Three.js post-processing)
 *
 * UnrealBloomPass for neural glow, quality presets, node animations.
 * Uses 3d-force-graph's postProcessingComposer() to inject passes.
 *
 * Bloom parameters and emissive intensities are read from the active theme.
 * Theme changes update bloom pass and background color live.
 */

import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Vector2 } from 'three';

import { getActiveTheme, onThemeChange } from './themes.js';
import { getSetting } from './settings.js';

let bloomPass = null;
let graphRef = null;

// Quality presets (override theme bloom when quality != 'high')
const QUALITY_PRESETS = {
  low:    { bloom: false, bloomStrength: 0,   bloomRadius: 0,   bloomThreshold: 0   },
  medium: { bloom: true,  bloomStrength: 1.0, bloomRadius: 0.8, bloomThreshold: 0.2 },
  high:   null, // use theme defaults
  ultra:  { bloom: true,  bloomStrength: 3.0, bloomRadius: 1.2, bloomThreshold: 0.05 }
};

// FPS tracking
let fpsFrames = 0;
let fpsLastTime = performance.now();
let currentFps = 0;

export function getFps() { return currentFps; }
export function getBloomPass() { return bloomPass; }

// ── Init bloom post-processing ─────────────────────────

export function initEffects(Graph) {
  graphRef = Graph;
  const theme = getActiveTheme();
  const resolution = new Vector2(window.innerWidth, window.innerHeight);

  // Read visual overrides (null = use theme)
  const str = getSetting('visuals.bloomStrength') ?? theme.bloom.strength;
  const rad = getSetting('visuals.bloomRadius') ?? theme.bloom.radius;
  const thr = getSetting('visuals.bloomThreshold') ?? theme.bloom.threshold;

  bloomPass = new UnrealBloomPass(resolution, str, rad, thr);
  Graph.postProcessingComposer().addPass(bloomPass);

  // Background color from theme
  Graph.backgroundColor(theme.background);

  // Apply quality preset if not 'high' (high = theme defaults)
  const quality = getSetting('performance.quality') || 'high';
  if (quality !== 'high') applyQuality(quality);

  return bloomPass;
}

// ── Theme change listener ──────────────────────────────

onThemeChange((theme) => {
  if (!bloomPass || !graphRef) return;

  // Update bloom only if visual overrides are null (user hasn't manually adjusted)
  const str = getSetting('visuals.bloomStrength');
  const rad = getSetting('visuals.bloomRadius');
  const thr = getSetting('visuals.bloomThreshold');

  const quality = getSetting('performance.quality') || 'high';
  if (quality === 'high' || quality === undefined) {
    bloomPass.strength = str ?? theme.bloom.strength;
    bloomPass.radius = rad ?? theme.bloom.radius;
    bloomPass.threshold = thr ?? theme.bloom.threshold;
  }

  graphRef.backgroundColor(theme.background);
});

// ── Quality control ────────────────────────────────────

export function applyQuality(preset) {
  const config = QUALITY_PRESETS[preset];
  if (!bloomPass) return;

  if (config === null) {
    // 'high' = use theme defaults (or visual overrides)
    const theme = getActiveTheme();
    const str = getSetting('visuals.bloomStrength');
    const rad = getSetting('visuals.bloomRadius');
    const thr = getSetting('visuals.bloomThreshold');
    bloomPass.strength = str ?? theme.bloom.strength;
    bloomPass.radius = rad ?? theme.bloom.radius;
    bloomPass.threshold = thr ?? theme.bloom.threshold;
    return;
  }

  if (config) {
    if (config.bloom) {
      bloomPass.strength = config.bloomStrength;
      bloomPass.radius = config.bloomRadius;
      bloomPass.threshold = config.bloomThreshold;
    } else {
      bloomPass.strength = 0;
    }
  }
}

// ── FPS counter ────────────────────────────────────────

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

// ── Node animations (called from onEngineTick) ─────────

export function animateNodes(Graph, elapsed, delta) {
  const graphData = Graph.graphData();
  if (!graphData?.nodes) return;

  const theme = getActiveTheme();

  for (const node of graphData.nodes) {
    const obj = node.__threeObj;
    if (!obj) continue;

    const ud = obj.userData;
    if (!ud || ud.hidden) continue;

    const baseScale = ud.baseScale || 1;
    const phase = ud.phase || 0;
    const coreMesh = ud.coreMesh;

    // ── Entity breathing + rotation ───────────────
    if (ud.nodeType === 'entity' && coreMesh) {
      const imp = node.importance || 0.5;
      const breathRate = 0.8 + imp * 0.3;
      const breathDepth = 0.04 + imp * 0.03;
      const breathScale = 1 + Math.sin(elapsed * breathRate + phase) * breathDepth;
      const s = baseScale * breathScale;
      coreMesh.scale.setScalar(s);

      // Type-specific rotation
      if (node.entityType === 'organization') {
        coreMesh.rotation.y += delta * 0.15;
        coreMesh.rotation.x = Math.sin(elapsed * 0.3 + phase) * 0.1;
      } else if (node.entityType === 'project') {
        coreMesh.rotation.y += delta * 0.2;
        coreMesh.rotation.z = Math.sin(elapsed * 0.4 + phase) * 0.15;
      } else if (node.entityType === 'concept') {
        coreMesh.rotation.x += delta * 0.1;
        coreMesh.rotation.y += delta * 0.15;
      } else if (node.entityType === 'location') {
        coreMesh.rotation.x = Math.PI / 2;
        coreMesh.rotation.z += delta * 0.1;
      }

      // Emissive pulsing -- never dip below threshold so entities always bloom
      if (coreMesh.material) {
        const baseEmissive = theme.emissive.entity;
        const emPulse = baseEmissive - 0.05 + Math.sin(elapsed * breathRate * 0.7 + phase) * 0.08;
        coreMesh.material.emissiveIntensity = Math.max(baseEmissive * 0.7, emPulse);
      }
    }

    // ── Pattern rotation ──────────────────────────
    if (ud.nodeType === 'pattern' && coreMesh) {
      const breathScale = 1 + Math.sin(elapsed * 1.2 + phase) * 0.08;
      coreMesh.scale.setScalar(baseScale * breathScale);
      coreMesh.rotation.y += delta * 0.3;
      coreMesh.rotation.x += delta * 0.1;
      coreMesh.rotation.z = Math.sin(elapsed * 0.5 + phase) * 0.2;
    }

    // ── Spawn animation (elastic easing) ──────────
    if (node.__spawn && ud.spawnTime) {
      const age = (Date.now() - ud.spawnTime) / 1000;
      if (age < 1.5) {
        const t = age / 1.5;
        const elastic = 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 3);
        const s = baseScale * elastic;
        if (coreMesh) coreMesh.scale.setScalar(s);
        if (coreMesh?.material) {
          coreMesh.material.opacity = Math.min(1, t * 2);
        }
      } else {
        node.__spawn = false;
        ud.spawnTime = null;
      }
    }

    // ── Pulse animation (memory accessed) ─────────
    if (node.__pulse) {
      if (!node.__pulseTime) node.__pulseTime = Date.now();
      const age = (Date.now() - node.__pulseTime) / 1000;
      if (age < 2.5) {
        const t = age / 2.5;
        const pulseWave = Math.sin(t * Math.PI * 2) * (1 - t);
        const s = baseScale * (1 + pulseWave * 0.4);
        if (coreMesh) coreMesh.scale.setScalar(s);
      } else {
        node.__pulse = false;
        node.__pulseTime = null;
      }
    }

    // ── Shimmer animation (memory improved) ───────
    if (node.__shimmer) {
      if (!node.__shimmerTime) node.__shimmerTime = Date.now();
      const age = (Date.now() - node.__shimmerTime) / 1000;
      if (age < 3) {
        const t = age / 3;
        if (coreMesh?.material) {
          const flicker = 0.3 + Math.sin(age * 10) * 0.3 * (1 - t);
          coreMesh.material.emissiveIntensity = flicker;
        }
      } else {
        node.__shimmer = false;
        node.__shimmerTime = null;
      }
    }
  }
}
