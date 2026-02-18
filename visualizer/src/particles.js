import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Create a soft radial gradient texture for star points.
 * Using a canvas-based texture makes stars render as smooth
 * round glows instead of hard square pixels.
 */
function createStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

export function initParticles(scene) {
  const starTexture = createStarTexture();

  // Starfield: static points scattered in a spherical shell (400–1000 radius)
  const starGeo = new THREE.BufferGeometry();
  const starCount = CONFIG.PARTICLES.starCount;
  const starPositions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const r = 400 + Math.random() * 600;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

  const starMat = new THREE.PointsMaterial({
    size: 2.5,
    map: starTexture,
    alphaMap: starTexture,
    alphaTest: 0.01,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    color: 0xd0d8e8,
  });
  const starfield = new THREE.Points(starGeo, starMat);
  scene.add(starfield);

  // No nebula — colored motes add noise and compete with node colors.
  // The starfield alone provides depth without visual clutter.

  return {
    starfield,
    tick: () => {}, // no animated particles
  };
}
