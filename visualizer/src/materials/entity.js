/**
 * Claudia Brain v4 -- Entity TSL Material
 *
 * MeshPhysicalNodeMaterial with:
 * - Vertex: noise-displaced positions (organic undulation)
 * - Fragment: subsurface glow (Fresnel rim + emissive)
 * - Importance-driven emissive intensity
 *
 * Falls back to MeshStandardMaterial if NodeMaterial unavailable.
 */

import { MeshStandardMaterial, Color } from 'three';

// TSL NodeMaterials require a true WebGPU renderer.
// Currently disabled: EffectComposer (bloom) is WebGL-only,
// so 3d-force-graph uses WebGL even when useWebGPU is set.
// Phase 7 will enable TSL with TSL PostProcessing class.
let tslAvailable = false;

/**
 * Create an entity material.
 * Currently always uses the enhanced MeshStandardMaterial.
 * TSL NodeMaterial (organic displacement + Fresnel) reserved for Phase 7.
 *
 * @param {Object} opts
 * @param {string} opts.color - Hex color string
 * @param {number} opts.emissiveIntensity - Base emissive intensity (0-1)
 * @param {number} opts.importance - Node importance (0-1), drives glow
 * @param {Object} opts.noise - { vertexDisplacement, vertexFrequency, vertexSpeed }
 */
export function createEntityMaterial(opts) {
  const { color, emissiveIntensity = 0.38, importance = 0.5 } = opts;
  return createFallbackMaterial(color, emissiveIntensity, importance);
}

/**
 * Check if TSL materials are available.
 */
export function waitForTSL() {
  return Promise.resolve(tslAvailable);
}

// ── TSL Material ──────────────────────────────────────────

function createTSLMaterial(color, emissiveIntensity, importance, noise) {
  const {
    Fn, positionLocal, normalLocal, normalView, positionWorld,
    cameraPosition, uniform, float, vec3,
    sin, cos, dot, mix, pow, normalize, clamp,
    mx_noise_float, mx_fractal_noise_float,
  } = tslModules;

  const { MeshPhysicalNodeMaterial } = tslModules;

  // Uniforms for animation control
  const uTime = uniform(0.0);
  const uDisplacement = uniform(noise.vertexDisplacement || 0.06);
  const uFrequency = uniform(noise.vertexFrequency || 2.0);
  const uSpeed = uniform(noise.vertexSpeed || 0.3);
  const uImportance = uniform(importance);
  const uRimPower = uniform(3.0);
  const uRimStrength = uniform(0.4);

  const mat = new MeshPhysicalNodeMaterial({
    color: new Color(color),
    emissive: new Color(color),
    emissiveIntensity,
    metalness: 0.05,
    roughness: 0.55,
    transparent: true,
    opacity: Math.max(0.7, 0.5 + importance * 0.5),
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
  });

  // ── Vertex displacement: organic surface undulation ──

  mat.positionNode = Fn(() => {
    const t = uTime.mul(uSpeed);
    const pos = positionLocal.toVar();
    const nrm = normalLocal.toVar();

    // Animated noise sampling position
    const noisePos = pos.mul(uFrequency).add(
      vec3(t.mul(0.3), t.mul(0.2), t.mul(0.15))
    );

    // Multi-octave FBM for organic variation
    const n = mx_fractal_noise_float(noisePos, float(3), float(2.0), float(0.5));

    // Displace along normal
    const displaced = pos.add(nrm.mul(n.mul(uDisplacement)));

    return displaced;
  })();

  // ── Emissive: Fresnel rim glow + importance-driven base ──

  mat.emissiveNode = Fn(() => {
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const facing = dot(viewDir, normalView).clamp(0, 1);

    // Fresnel: bright at grazing angles (rim glow)
    const fresnel = facing.oneMinus().pow(uRimPower).mul(uRimStrength);

    // Base emissive from importance
    const baseGlow = float(emissiveIntensity).mul(
      float(0.7).add(uImportance.mul(0.6))
    );

    // Combine: base glow + rim highlight
    const totalGlow = baseGlow.add(fresnel);
    const emissiveColor = vec3(new Color(color));

    return emissiveColor.mul(totalGlow);
  })();

  // Attach uniforms for external animation
  mat.userData = {
    uTime,
    uDisplacement,
    uFrequency,
    uSpeed,
    uImportance,
    uRimPower,
    uRimStrength,
    isTSL: true,
  };

  return mat;
}

// ── Fallback Material ─────────────────────────────────────

function createFallbackMaterial(color, emissiveIntensity, importance) {
  return new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: emissiveIntensity * (0.7 + importance * 0.6),
    metalness: 0.1,
    roughness: 0.6,
    transparent: true,
    opacity: Math.max(0.6, 0.5 + importance * 0.5),
  });
}

/**
 * Update time uniform for all TSL entity materials.
 * Call from the render loop.
 */
export function updateEntityMaterialTime(material, elapsed) {
  if (material?.userData?.uTime) {
    material.userData.uTime.value = elapsed;
  }
}
