/**
 * Claudia Brain v4 -- Synapse particle material
 *
 * Additive blending, glowing particles for link directional particles.
 * Phase 4 will add GPU compute shader particles alongside these.
 * For now this provides the material for 3d-force-graph's built-in particles.
 */

import { MeshStandardMaterial, Color, AdditiveBlending } from 'three';

/**
 * Create a synapse particle material.
 * Uses additive blending for glow-through effect.
 *
 * @param {Object} opts
 * @param {string} opts.color - Particle color
 * @param {number} opts.intensity - Glow intensity
 */
export function createSynapseMaterial(opts) {
  const { color = '#06b6d4', intensity = 0.8 } = opts;

  return new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    transparent: true,
    opacity: 0.9,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}
