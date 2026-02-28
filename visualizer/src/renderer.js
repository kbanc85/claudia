/**
 * Claudia Brain v4 -- Renderer initialization (Performance-optimized)
 *
 * Key optimizations:
 * - pixelRatio capped at 1.5 (Retina renders 2.25x pixels vs 4x)
 * - powerPreference: 'high-performance' for discrete GPU selection
 * - Exposes renderer for bloom resolution control
 */

import ForceGraph3D from '3d-force-graph';
import { getSetting } from './settings.js';
import { onThemeChange } from './themes.js';

let Graph = null;
let supportsWebGPU = false;

export function detectWebGPU() {
  // Disable WebGPU renderer — bloom/postprocessing
  // uses EffectComposer which is WebGL-only.
  supportsWebGPU = false;
  return supportsWebGPU;
}

export function createGraph(container, theme) {
  detectWebGPU();

  const quality = getSetting('performance.quality') || 'high';
  const antialias = quality !== 'low' && getSetting('performance.antialias') !== false;

  Graph = ForceGraph3D({
    rendererConfig: {
      powerPreference: 'high-performance',
      antialias,
      alpha: false,
    },
  })(container);

  Graph.backgroundColor(theme.background);

  // Cap pixel ratio for performance
  // Full Retina (2x) = 4x pixels. Capping at 1.5 = 2.25x (good enough, much faster)
  const renderer = Graph.renderer();
  if (renderer) {
    const maxDPR = quality === 'ultra' ? 2 : quality === 'high' ? 1.5 : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDPR));
  }

  // Configure force simulation cooldown
  // After settling, reduce CPU usage from d3-force
  Graph.cooldownTicks(200);      // Stop after 200 ticks (was infinite)
  Graph.cooldownTime(15000);     // Or after 15 seconds
  Graph.warmupTicks(0);          // Don't pre-warm (causes frame freeze)

  // Update background when theme changes
  onThemeChange((newTheme) => {
    Graph.backgroundColor(newTheme.background);
  });

  return Graph;
}

export function getGraph() { return Graph; }
export function getRenderer() { return Graph?.renderer(); }
export function getScene() { return Graph?.scene(); }
export function getCamera() { return Graph?.camera(); }
export function isWebGPU() { return supportsWebGPU; }
