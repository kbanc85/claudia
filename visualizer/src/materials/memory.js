/**
 * Claudia Brain v4 -- Memory Material
 *
 * Subdued, below-bloom-threshold material for memory nodes.
 * Pulse via direct emissiveIntensity manipulation.
 * TSL NodeMaterial reserved for Phase 7 (requires WebGPU renderer).
 */

import { MeshStandardMaterial } from 'three';

/**
 * Create a memory material.
 *
 * @param {Object} opts
 * @param {string} opts.color - Hex color
 * @param {number} opts.emissiveIntensity - Base emissive (below bloom threshold)
 * @param {number} opts.importance - 0-1
 * @param {number} opts.opacity - 0-1
 */
export function createMemoryMaterial(opts) {
  const { color, emissiveIntensity = 0.04, importance = 0.3, opacity = 0.55, memoryType } = opts;

  // Commitments get stronger emissive so they stand out from facts
  const emBoost = memoryType === 'commitment' ? 3.0 : 1.0;

  return new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: emissiveIntensity * emBoost,
    transparent: true,
    opacity: Math.max(0.3, opacity),
    metalness: memoryType === 'commitment' ? 0.15 : 0.0,
    roughness: memoryType === 'commitment' ? 0.4 : 0.8,
  });
}

/**
 * Trigger a pulse on a memory material. Call when memory is accessed.
 */
export function pulseMemoryMaterial(material) {
  if (!material) return;
  const orig = material.emissiveIntensity;
  material.emissiveIntensity = Math.min(0.5, orig * 4);
  setTimeout(() => { material.emissiveIntensity = orig; }, 600);
}

/**
 * Update memory material time (no-op until TSL is enabled).
 */
export function updateMemoryMaterialTime(material, elapsed) {
  // No-op: TSL uniforms not active. Phase 7 will enable.
}
