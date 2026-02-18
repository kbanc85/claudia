import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js';

const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.0006 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec4 cr = texture2D(tDiffuse, uv + vec2(offset, 0.0));
      vec4 cg = texture2D(tDiffuse, uv);
      vec4 cb = texture2D(tDiffuse, uv - vec2(offset, 0.0));
      gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
    }
  `,
};

let autoOrbiting = true;
let autoOrbitResumeTimer = null;

/**
 * Initialize the Three.js scene with renderer, camera, lights,
 * post-processing pipeline, and orbit controls.
 */
export function initScene(container) {
  // Support passing an existing canvas element directly
  const isCanvas = container instanceof HTMLCanvasElement;
  const canvas = isCanvas ? container : null;
  const parent = isCanvas ? container.parentElement : container;

  // Renderer - use existing canvas if provided
  const rendererOpts = { antialias: true, alpha: false };
  if (canvas) rendererOpts.canvas = canvas;
  const renderer = new THREE.WebGLRenderer(rendererOpts);
  const width = isCanvas ? canvas.clientWidth || window.innerWidth : container.clientWidth;
  const height = isCanvas ? canvas.clientHeight || window.innerHeight : container.clientHeight;
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  if (!isCanvas) container.appendChild(renderer.domElement);

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.SCENE.background);

  // Camera
  const camera = new THREE.PerspectiveCamera(
    CONFIG.SCENE.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.SCENE.near,
    CONFIG.SCENE.far,
  );
  camera.position.set(0, 0, 300);

  // Lights
  const ambient = new THREE.AmbientLight(
    CONFIG.LIGHTS.ambient.color,
    CONFIG.LIGHTS.ambient.intensity,
  );
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(
    CONFIG.LIGHTS.key.color,
    CONFIG.LIGHTS.key.intensity,
  );
  keyLight.position.set(...CONFIG.LIGHTS.key.position);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(
    CONFIG.LIGHTS.fill.color,
    CONFIG.LIGHTS.fill.intensity,
  );
  fillLight.position.set(...CONFIG.LIGHTS.fill.position);
  scene.add(fillLight);

  if (CONFIG.LIGHTS.accent) {
    const accentLight = new THREE.PointLight(
      CONFIG.LIGHTS.accent.color,
      CONFIG.LIGHTS.accent.intensity,
    );
    accentLight.position.set(...CONFIG.LIGHTS.accent.position);
    scene.add(accentLight);
  }

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = CONFIG.CONTROLS.dampingFactor;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;
  controls.minDistance = 50;
  controls.maxDistance = 2000;

  // Auto-orbit: pause on user interaction, resume after 3s idle
  controls.addEventListener('start', () => {
    autoOrbiting = false;
    controls.autoRotate = false;
    if (autoOrbitResumeTimer) {
      clearTimeout(autoOrbitResumeTimer);
      autoOrbitResumeTimer = null;
    }
  });

  controls.addEventListener('end', () => {
    if (autoOrbitResumeTimer) {
      clearTimeout(autoOrbitResumeTimer);
    }
    autoOrbitResumeTimer = setTimeout(() => {
      autoOrbiting = true;
      controls.autoRotate = true;
      autoOrbitResumeTimer = null;
    }, 3000);
  });

  // Post-processing pipeline
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    CONFIG.BLOOM.strength,
    CONFIG.BLOOM.radius,
    CONFIG.BLOOM.threshold,
  );
  composer.addPass(bloomPass);

  const chromaticPass = new ShaderPass(ChromaticAberrationShader);
  composer.addPass(chromaticPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // Handle window resize
  const onResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    bloomPass.resolution.set(width, height);
  };
  window.addEventListener('resize', onResize);

  return { scene, camera, renderer, composer, controls, chromaticPass };
}

/**
 * Adjust bloom strength based on quality level.
 * Accepts 'LOW', 'MEDIUM', 'HIGH', or 'ULTRA'.
 */
export function updateQuality(composer, level) {
  const preset = CONFIG.QUALITY[level];
  if (!preset) return;

  // The bloom pass is the second pass in the composer (index 1)
  const bloomPass = composer.passes.find((p) => p instanceof UnrealBloomPass);
  if (bloomPass) {
    bloomPass.strength = preset.bloomStrength;
  }
}

/**
 * Called every animation frame to update controls and render the scene.
 */
export function renderFrame(composer, controls) {
  controls.update();
  composer.render();
}
