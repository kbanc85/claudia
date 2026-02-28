/**
 * Claudia Brain v4 -- Bloom + Chromatic Aberration post-processing
 *
 * Uses EffectComposer + UnrealBloomPass + RGBShift (chromatic aberration).
 * Resolution is properly set from the renderer's drawing buffer size.
 */

import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { getActiveTheme, onThemeChange } from '../themes.js';
import { getSetting, setSetting } from '../settings.js';

let bloomPass = null;
let rgbShiftPass = null;
let currentBloomScale = 0.5;

// Chromatic aberration shader — subtle RGB channel offset
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.003 },
    angle: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float angle;
    varying vec2 vUv;
    void main() {
      vec4 center = texture2D(tDiffuse, vUv);
      // Luminance-gated: bright pixels (glowing nodes) get full CA,
      // dark pixels (text labels, background) stay sharp
      float lum = dot(center.rgb, vec3(0.299, 0.587, 0.114));
      vec2 offset = amount * vec2(cos(angle), sin(angle));
      vec2 scaledOffset = offset * smoothstep(0.15, 0.5, lum);
      float r = texture2D(tDiffuse, vUv + scaledOffset).r;
      float g = center.g;
      float b = texture2D(tDiffuse, vUv - scaledOffset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

export function initBloom(Graph) {
  const theme = getActiveTheme();
  const quality = getSetting('performance.quality') || 'high';

  // Always create passes so runtime quality switching works.
  // For LOW quality: passes are created but disabled.

  const renderer = Graph.renderer();
  if (!renderer) {
    console.warn('[Bloom] No renderer available, skipping post-processing');
    return;
  }

  // Get actual renderer resolution, then scale down for performance
  // Bloom at half-res looks nearly identical but processes 4x fewer pixels
  const size = renderer.getSize(new Vector2());
  currentBloomScale = quality === 'ultra' ? 0.75 : 0.5;
  const bloomScale = currentBloomScale;
  const resolution = new Vector2(
    Math.floor(size.x * bloomScale),
    Math.floor(size.y * bloomScale)
  );

  const strength = getSetting('visuals.bloomStrength') ?? theme.bloom.strength;
  const radius = getSetting('visuals.bloomRadius') ?? theme.bloom.radius;
  const threshold = getSetting('visuals.bloomThreshold') ?? theme.bloom.threshold;

  bloomPass = new UnrealBloomPass(resolution, strength, radius, threshold);

  try {
    const composer = Graph.postProcessingComposer();
    composer.addPass(bloomPass);

    // Always create CA pass so it can be enabled at runtime via quality switching
    rgbShiftPass = new ShaderPass(ChromaticAberrationShader);
    const caAmount = quality === 'ultra' ? 0.0015 : quality === 'medium' ? 0.0004 : 0.0008;
    rgbShiftPass.uniforms.amount.value = getSetting('visuals.chromaticAberration') ?? caAmount;
    composer.addPass(rgbShiftPass);

    // Apply the current quality level (may disable passes for low/medium)
    applyQualityPreset(quality, theme);

    console.log(`[Bloom] Initialized — strength: ${strength}, radius: ${radius}, threshold: ${threshold}, bloomRes: ${resolution.x}x${resolution.y} (${Math.round(bloomScale * 100)}%)`);
  } catch (e) {
    console.warn('[Bloom] EffectComposer not available, skipping bloom:', e.message);
    bloomPass = null;
    rgbShiftPass = null;
  }

  // Update bloom on theme change
  onThemeChange((newTheme) => {
    if (!bloomPass) return;
    bloomPass.strength = getSetting('visuals.bloomStrength') ?? newTheme.bloom.strength;
    bloomPass.radius = getSetting('visuals.bloomRadius') ?? newTheme.bloom.radius;
    bloomPass.threshold = getSetting('visuals.bloomThreshold') ?? newTheme.bloom.threshold;
  });

  // Handle resize
  window.addEventListener('resize', () => {
    if (!bloomPass || !renderer) return;
    const newSize = renderer.getSize(new Vector2());
    bloomPass.resolution.set(
      Math.floor(newSize.x * currentBloomScale),
      Math.floor(newSize.y * currentBloomScale)
    );
  });
}

export function getBloomPass() { return bloomPass; }
export function getRGBShiftPass() { return rgbShiftPass; }

/**
 * Enable or disable bloom at runtime (for quality preset switching).
 */
export function setBloomEnabled(enabled) {
  if (bloomPass) bloomPass.enabled = enabled;
}

/**
 * Enable or disable chromatic aberration at runtime.
 */
export function setChromaticEnabled(enabled) {
  if (rgbShiftPass) rgbShiftPass.enabled = enabled;
}

/**
 * Apply quality preset to post-processing.
 */
export function applyQualityPreset(quality, theme) {
  if (!bloomPass) return;

  switch (quality) {
    case 'low':
      // Light bloom for a warm feel, no chromatic aberration
      bloomPass.enabled = true;
      bloomPass.strength = (theme?.bloom.strength ?? 1.4) * 0.35;
      bloomPass.radius = (theme?.bloom.radius ?? 0.75) * 0.8;
      bloomPass.threshold = (theme?.bloom.threshold ?? 0.10) + 0.15;
      if (rgbShiftPass) rgbShiftPass.enabled = false;
      break;
    case 'medium':
      // Good bloom with subtle CA
      bloomPass.enabled = true;
      bloomPass.strength = (theme?.bloom.strength ?? 1.4) * 0.75;
      bloomPass.radius = theme?.bloom.radius ?? 0.75;
      bloomPass.threshold = (theme?.bloom.threshold ?? 0.10) + 0.05;
      if (rgbShiftPass) {
        rgbShiftPass.enabled = true;
        rgbShiftPass.uniforms.amount.value = 0.0004;
      }
      break;
    case 'high':
      bloomPass.enabled = true;
      bloomPass.strength = theme?.bloom.strength ?? 1.4;
      bloomPass.radius = theme?.bloom.radius ?? 0.75;
      bloomPass.threshold = theme?.bloom.threshold ?? 0.10;
      if (rgbShiftPass) {
        rgbShiftPass.enabled = true;
        rgbShiftPass.uniforms.amount.value = 0.0008;
      }
      break;
    case 'ultra':
      bloomPass.enabled = true;
      bloomPass.strength = (theme?.bloom.strength ?? 1.4) * 1.15;
      bloomPass.radius = (theme?.bloom.radius ?? 0.75) * 1.1;
      bloomPass.threshold = Math.max(0.05, (theme?.bloom.threshold ?? 0.10) - 0.02);
      if (rgbShiftPass) {
        rgbShiftPass.enabled = true;
        rgbShiftPass.uniforms.amount.value = 0.0015;
      }
      break;
  }
}
