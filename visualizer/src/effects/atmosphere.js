/**
 * Claudia Brain v4 -- Atmosphere effects
 *
 * Distance fog for depth perception and radial gradient background.
 * Each theme defines fog color, near/far planes, and density.
 * Ambient particles are managed here too.
 */

import { FogExp2, Color } from 'three';
import { getActiveTheme, onThemeChange } from '../themes.js';
import { getSetting } from '../settings.js';
import { createAmbientParticles, updateAmbientTheme, removeAmbientParticles } from '../materials/ambient.js';

let currentFog = null;

/**
 * Initialize atmosphere effects on the scene.
 *
 * @param {Object} Graph - ForceGraph3D instance
 */
export function initAtmosphere(Graph) {
  const scene = Graph.scene();
  if (!scene) return;

  const theme = getActiveTheme();
  applyFog(scene, theme);
  applyAmbientParticles(scene, theme);

  // React to theme changes
  onThemeChange((newTheme) => {
    applyFog(scene, newTheme);
    updateAmbientTheme(scene, newTheme.atmosphere);
  });
}

/**
 * Apply exponential fog to scene.
 */
function applyFog(scene, theme) {
  const atmo = theme.atmosphere;
  if (!atmo) return;

  const density = getSetting('visuals.fogDensity') ?? atmo.fogDensity ?? 0.0008;

  if (density <= 0) {
    scene.fog = null;
    currentFog = null;
    return;
  }

  const fog = new FogExp2(new Color(atmo.fogColor), density);
  scene.fog = fog;
  currentFog = fog;
}

/**
 * Create ambient floating particles if enabled.
 */
function applyAmbientParticles(scene, theme) {
  const enabled = getSetting('visuals.ambientParticles') !== false;

  if (!enabled) {
    removeAmbientParticles(scene);
    return;
  }

  createAmbientParticles(scene, theme.atmosphere);
}

/**
 * Get the current fog instance (for external manipulation).
 */
export function getFog() { return currentFog; }
