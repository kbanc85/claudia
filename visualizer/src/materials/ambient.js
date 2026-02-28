/**
 * Claudia Brain v4 -- Ambient floating particle material (Performance-optimized)
 *
 * Key optimizations:
 * - Quality-dependent particle count (200-800 instead of fixed 600-1200)
 * - GPU-animated via custom ShaderMaterial (no per-frame CPU position updates)
 * - Single draw call for all particles
 */

import {
  BufferGeometry, Float32BufferAttribute, Points,
  ShaderMaterial, AdditiveBlending, Color,
} from 'three';
import { getSetting } from '../settings.js';

let ambientPoints = null;

// Custom vertex shader that animates particles on GPU
const ambientVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  attribute float aPhase;

  void main() {
    vec3 pos = position;

    // Gentle sine-driven drift (GPU-computed, zero CPU cost)
    float p = aPhase;
    pos.x += sin(uTime * uSpeed + p) * 2.0;
    pos.y += cos(uTime * uSpeed * 0.7 + p * 1.3) * 1.5;
    pos.z += sin(uTime * uSpeed * 0.5 + p * 0.7) * 1.8;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 1.5 * (300.0 / -mvPosition.z); // size attenuation
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const ambientFragmentShader = /* glsl */ `
  uniform vec3 uColor;

  void main() {
    // Soft circle falloff
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = 0.3 * (1.0 - dist * 2.0);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/**
 * Create ambient floating particles.
 *
 * @param {Object} scene - Three.js scene to add particles to
 * @param {Object} atmosphere - Theme atmosphere config
 * @returns {Points} The particle system (for cleanup)
 */
export function createAmbientParticles(scene, atmosphere) {
  if (ambientPoints) {
    scene.remove(ambientPoints);
    ambientPoints.geometry.dispose();
    ambientPoints.material.dispose();
    ambientPoints = null;
  }

  // Quality-dependent count
  const quality = getSetting('performance.quality') || 'high';
  const baseCount = atmosphere.ambientCount || 600;
  const qualityScale = { low: 0, medium: 0.3, high: 0.5, ultra: 1.0 }[quality] ?? 0.5;
  const count = Math.floor(baseCount * qualityScale);

  if (count === 0) return null;

  const spread = 800;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    phases[i] = Math.random() * Math.PI * 20;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));

  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(atmosphere.ambientColor || '#06b6d4') },
      uTime: { value: 0 },
      uSpeed: { value: atmosphere.ambientSpeed || 0.08 },
    },
    vertexShader: ambientVertexShader,
    fragmentShader: ambientFragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  ambientPoints = new Points(geometry, material);
  ambientPoints.userData.isAmbient = true;
  ambientPoints.renderOrder = -1;

  scene.add(ambientPoints);

  return ambientPoints;
}

/**
 * Animate ambient particles. Called per frame.
 * Now just updates a single uniform (GPU does all position math).
 */
export function animateAmbientParticles(elapsed) {
  if (!ambientPoints) return;
  ambientPoints.material.uniforms.uTime.value = elapsed;
}

/**
 * Update ambient particle appearance for a new theme.
 */
export function updateAmbientTheme(scene, atmosphere) {
  if (ambientPoints) {
    ambientPoints.material.uniforms.uColor.value.set(atmosphere.ambientColor || '#06b6d4');
    ambientPoints.material.uniforms.uSpeed.value = atmosphere.ambientSpeed || 0.08;
  }
}

/**
 * Remove ambient particles from scene.
 */
export function removeAmbientParticles(scene) {
  if (ambientPoints) {
    scene.remove(ambientPoints);
    ambientPoints.geometry.dispose();
    ambientPoints.material.dispose();
    ambientPoints = null;
  }
}
