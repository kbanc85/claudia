/**
 * Claudia Brain v4 -- Memory Particle System
 *
 * Renders ALL memory nodes as a single GPU Points draw call instead of
 * 901 individual Mesh objects. This is the key performance optimization:
 * one draw call for all memories vs. 901 separate draw calls.
 *
 * Each memory is a colored point with size based on importance.
 * Commitments get larger size and brighter color.
 */

import {
  BufferGeometry, Float32BufferAttribute,
  Points, ShaderMaterial, AdditiveBlending, Color,
} from 'three';
import { getActiveTheme, onThemeChange } from '../themes.js';
import { getSetting } from '../settings.js';
import { setMemoryDimCallback } from '../data/store.js';

let memoryPoints = null;
let memoryNodeMap = []; // Ordered array of memory nodes matching buffer indices
let positionAttr = null;
let colorAttr = null;
let sizeAttr = null;

// Memory type → color index for GPU lookup
const MEMORY_TYPE_COLORS = {};

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPulse;
  varying vec3 vColor;
  varying float vPulse;

  void main() {
    vColor = aColor;
    vPulse = aPulse;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Size attenuation: larger when closer
    gl_PointSize = aSize * (200.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 32.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uGlobalDim;
  varying vec3 vColor;
  varying float vPulse;

  void main() {
    // Soft circle with glow
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;

    // Core brightness + soft edge falloff
    float core = smoothstep(0.5, 0.15, dist);
    float glow = smoothstep(0.5, 0.0, dist) * 0.4;
    float alpha = core + glow;

    // Pulse brightens the memory
    float brightness = 1.0 + vPulse * 0.5;
    vec3 color = vColor * brightness;

    // Apply global dim (for node selection contrast)
    // Slight emissive-like output (above bloom threshold for important ones)
    gl_FragColor = vec4(color, alpha * 0.7 * uGlobalDim);
  }
`;

/**
 * Create the memory particle system and add it to the scene.
 * Call once during boot, after graph data is loaded.
 *
 * @param {Object} scene - Three.js scene
 * @param {Array} memoryNodes - Array of memory node data
 */
export function createMemoryParticles(scene, memoryNodes) {
  if (memoryPoints) {
    scene.remove(memoryPoints);
    memoryPoints.geometry.dispose();
    memoryPoints.material.dispose();
    memoryPoints = null;
  }

  if (!memoryNodes || memoryNodes.length === 0) return;

  const theme = getActiveTheme();
  const count = memoryNodes.length;
  memoryNodeMap = memoryNodes;

  // Build buffers
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const pulses = new Float32Array(count); // For pulse animation

  const nodeScale = getSetting('visuals.nodeScale') ?? 1.0;

  for (let i = 0; i < count; i++) {
    const node = memoryNodes[i];

    // Position (will be updated per frame from node positions)
    positions[i * 3] = node.x || 0;
    positions[i * 3 + 1] = node.y || 0;
    positions[i * 3 + 2] = node.z || 0;

    // Color from theme
    const colorHex = theme.memories[node.memoryType] || '#888';
    const c = new Color(colorHex);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    // Size: importance-driven, commitments get 1.4x boost
    const importance = node.importance || 0.3;
    const baseSize = Math.max(2, importance * 5);
    const boost = node.memoryType === 'commitment' ? 1.8 : 1.0;
    sizes[i] = baseSize * boost * nodeScale;

    pulses[i] = 0;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aPulse', new Float32BufferAttribute(pulses, 1));

  positionAttr = geometry.attributes.position;
  colorAttr = geometry.attributes.aColor;
  sizeAttr = geometry.attributes.aSize;

  const material = new ShaderMaterial({
    uniforms: {
      uGlobalDim: { value: 1.0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  memoryPoints = new Points(geometry, material);
  memoryPoints.renderOrder = 1; // Render after other objects
  scene.add(memoryPoints);

  // Register dim callback with store so node selection can dim memory particles
  setMemoryDimCallback(setMemoryParticleDim);

  console.log(`[MemoryParticles] Created particle system for ${count} memories (1 draw call)`);
}

/**
 * Update memory particle positions from force-simulation node positions.
 * Called every frame from the render loop.
 */
export function updateMemoryParticles() {
  if (!memoryPoints || !positionAttr) return;

  const nodes = memoryNodeMap;
  const positions = positionAttr.array;
  const pulses = memoryPoints.geometry.attributes.aPulse;
  let needsPulseUpdate = false;

  for (let i = 0, len = nodes.length; i < len; i++) {
    const node = nodes[i];
    const i3 = i * 3;

    // Sync position from force sim
    positions[i3] = node.x || 0;
    positions[i3 + 1] = node.y || 0;
    positions[i3 + 2] = node.z || 0;

    // Handle pulse animation
    if (node.__pulse) {
      pulses.array[i] = 1.0;
      needsPulseUpdate = true;
    } else if (pulses.array[i] > 0) {
      pulses.array[i] *= 0.9; // Fade out
      if (pulses.array[i] < 0.01) pulses.array[i] = 0;
      needsPulseUpdate = true;
    }
  }

  positionAttr.needsUpdate = true;
  if (needsPulseUpdate) pulses.needsUpdate = true;
}

/**
 * Update memory particle colors for a new theme.
 */
export function updateMemoryParticleTheme() {
  if (!memoryPoints || !colorAttr) return;

  const theme = getActiveTheme();
  const colors = colorAttr.array;

  for (let i = 0; i < memoryNodeMap.length; i++) {
    const node = memoryNodeMap[i];
    const colorHex = theme.memories[node.memoryType] || '#888';
    const c = new Color(colorHex);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  colorAttr.needsUpdate = true;
}

/**
 * Add a new memory node to the particle system.
 */
export function addMemoryParticle(node) {
  // For dynamic adds, we rebuild the particle system (infrequent)
  // The scene will be available from the stored reference
  if (memoryPoints) {
    memoryNodeMap.push(node);
    // Mark for rebuild on next frame
    memoryPoints.userData.needsRebuild = true;
  }
}

/**
 * Set global dim for memory particles (for node selection contrast).
 * @param {number} dim - 0.0 (invisible) to 1.0 (full brightness)
 */
export function setMemoryParticleDim(dim) {
  if (memoryPoints?.material?.uniforms?.uGlobalDim) {
    memoryPoints.material.uniforms.uGlobalDim.value = dim;
  }
}

/**
 * Remove memory particles from scene.
 */
export function removeMemoryParticles(scene) {
  if (memoryPoints) {
    scene.remove(memoryPoints);
    memoryPoints.geometry.dispose();
    memoryPoints.material.dispose();
    memoryPoints = null;
    memoryNodeMap = [];
    positionAttr = null;
    colorAttr = null;
    sizeAttr = null;
  }
}

// React to theme changes
onThemeChange(() => {
  updateMemoryParticleTheme();
});
