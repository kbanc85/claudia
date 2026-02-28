/**
 * Claudia Brain v4 -- TSL Noise functions
 *
 * Reusable noise Fn() nodes for vertex displacement, material effects,
 * and particle motion. Uses Three.js built-in MaterialX noise.
 *
 * All functions return shader nodes (not JS values) and auto-compile
 * to WGSL (WebGPU) or GLSL (WebGL) based on the active renderer.
 */

import {
  Fn, float, vec3,
  sin, cos, abs, fract, floor, dot, mix, smoothstep,
  hash, mx_noise_float, mx_noise_vec3, mx_fractal_noise_float,
  mx_cell_noise_float, mx_worley_noise_float,
  timerLocal,
} from 'three/tsl';

// ── Animated time uniform ─────────────────────────────────

/** Shared time node (seconds since start). Use in materials for animation. */
export const shaderTime = timerLocal();

// ── Simplex-like noise (via MaterialX) ────────────────────

/**
 * 3D noise value in [-1, 1] range.
 * Uses Three.js built-in mx_noise which is Perlin-based.
 */
export const noise3D = Fn(([pos]) => {
  return mx_noise_float(pos);
});

/**
 * 3D noise returning vec3 (useful for curl-like displacement).
 */
export const noise3DVec = Fn(([pos]) => {
  return mx_noise_vec3(pos);
});

// ── Fractional Brownian Motion (FBM) ──────────────────────

/**
 * FBM noise with configurable octaves, lacunarity, and diminish.
 * Returns float in approximately [-1, 1].
 *
 * @param pos - vec3 position
 * @param octaves - int number of octaves (default 4)
 * @param lacunarity - float frequency multiplier (default 2.0)
 * @param diminish - float amplitude multiplier (default 0.5)
 */
export const fbm = Fn(([pos, octaves, lacunarity, diminish]) => {
  return mx_fractal_noise_float(pos, octaves, lacunarity, diminish);
});

/**
 * Convenience: 4-octave FBM with standard parameters.
 */
export const fbm4 = Fn(([pos]) => {
  return mx_fractal_noise_float(pos, float(4), float(2.0), float(0.5));
});

// ── Cell / Worley noise ───────────────────────────────────

/**
 * Cell (Voronoi) noise. Good for organic cell patterns.
 */
export const cellNoise = Fn(([pos]) => {
  return mx_cell_noise_float(pos);
});

/**
 * Worley noise. Returns distance to nearest feature point.
 * Good for membrane / tissue-like patterns.
 */
export const worleyNoise = Fn(([pos]) => {
  return mx_worley_noise_float(pos);
});

// ── Curl noise (approximation) ────────────────────────────

/**
 * Curl noise for divergence-free flow fields.
 * Used for particle motion and organic drift.
 * Returns vec3 displacement.
 */
export const curlNoise = Fn(([pos]) => {
  const e = float(0.01);

  // Partial derivatives via finite differences
  const dx = vec3(e, float(0), float(0));
  const dy = vec3(float(0), e, float(0));
  const dz = vec3(float(0), float(0), e);

  const p = pos;

  // Sample noise at offset positions
  const nx1 = mx_noise_float(p.add(dy)).sub(mx_noise_float(p.sub(dy)));
  const nx2 = mx_noise_float(p.add(dz)).sub(mx_noise_float(p.sub(dz)));

  const ny1 = mx_noise_float(p.add(dz)).sub(mx_noise_float(p.sub(dz)));
  const ny2 = mx_noise_float(p.add(dx)).sub(mx_noise_float(p.sub(dx)));

  const nz1 = mx_noise_float(p.add(dx)).sub(mx_noise_float(p.sub(dx)));
  const nz2 = mx_noise_float(p.add(dy)).sub(mx_noise_float(p.sub(dy)));

  return vec3(
    nx1.sub(nx2),
    ny1.sub(ny2),
    nz1.sub(nz2),
  ).div(e.mul(float(2)));
});

// ── Organic undulation (compound noise) ───────────────────

/**
 * Compound noise for organic surface undulation.
 * Combines FBM with time-driven animation.
 *
 * @param pos - vec3 world position
 * @param frequency - float spatial frequency
 * @param speed - float animation speed
 * @param amplitude - float displacement strength
 */
export const organicUndulation = Fn(([pos, frequency, speed, amplitude]) => {
  const t = shaderTime.mul(speed);
  const animatedPos = pos.mul(frequency).add(vec3(t.mul(0.3), t.mul(0.2), t.mul(0.1)));
  const n = fbm4(animatedPos);
  return n.mul(amplitude);
});
