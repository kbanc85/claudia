import { CONFIG } from './config.js';
import { initScene, renderFrame, updateQuality } from './scene.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { initParticles } from './particles.js';
import { buildNodes, clearNodes, updateNodes, getEntityMeshes, getNodeMap } from './nodes.js';
import { buildEdges, clearEdges, updateEdges } from './edges.js';
import { initPhysics, tick as physicsTick, getSimNodes } from './physics.js';
import { initUI, onSearch, initStatsPoller, hideLoading } from './ui.js';
import { initInteraction, onSearchQuery } from './interaction.js';

const BACKEND_URL = CONFIG.BACKEND_URL;

// ─── State ────────────────────────────────────────────────────────────────────

let _scene = null;
let _camera = null;
let _renderer = null;
let _composer = null;
let _controls = null;
let _chromaticPass = null;
let _particles = null;
let _graphData = null;
let _interactionHandlers = null;

// FPS tracking
let _lastTime = 0;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function main() {
  // Initialize UI references first (DOM is ready)
  initUI();

  // Initialize Three.js scene using the existing canvas
  const canvas = document.getElementById('cosmos-canvas');
  ({ scene: _scene, camera: _camera, renderer: _renderer, composer: _composer, controls: _controls, chromaticPass: _chromaticPass } =
    initScene(canvas));

  // Starfield + nebula background
  _particles = initParticles(_scene);

  // Start stats polling (updates HUD every 5s)
  initStatsPoller(BACKEND_URL);

  // Quality dropdown → bloom adjustment
  window.addEventListener('quality-change', (e) => {
    updateQuality(_composer, e.detail.level);
  });

  // Bloom strength control
  window.addEventListener('bloom-change', (e) => {
    const bloomPass = _composer.passes.find((p) => p instanceof UnrealBloomPass);
    if (bloomPass) bloomPass.strength = e.detail.strength;
  });

  // Chromatic aberration control
  window.addEventListener('aberr-change', (e) => {
    if (_chromaticPass) _chromaticPass.uniforms.offset.value = e.detail.offset;
  });

  // Auto-rotation control
  window.addEventListener('rotation-change', (e) => {
    if (_controls) _controls.autoRotate = e.detail.active;
  });

  // Fetch graph data from backend
  let graphData;
  try {
    const res = await fetch(`${BACKEND_URL}/api/graph`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    graphData = await res.json();
  } catch (err) {
    console.warn('Could not fetch graph data:', err);
    graphData = { nodes: [], links: [] };
  }

  _graphData = graphData;

  // Build scene objects from graph data
  buildNodes(_scene, graphData);
  buildEdges(_scene, graphData, getNodeMap());

  // Initialize physics simulation (async: may run UMAP layout)
  await initPhysics(graphData);

  // Set up interaction (raycasting, click, keyboard)
  _interactionHandlers = initInteraction(
    _camera,
    _renderer,
    _controls,
    getEntityMeshes(),
    graphData,
  );

  // Wire up search bar
  onSearch((query) => {
    onSearchQuery(query);
  });

  // Hide loading overlay
  hideLoading();

  // Subscribe to live SSE updates
  _connectSSE();

  // Start animation loop
  requestAnimationFrame(_loop);
}

// ─── Animation Loop ───────────────────────────────────────────────────────────

function _loop(timestamp) {
  requestAnimationFrame(_loop);

  const deltaTime = Math.min((timestamp - _lastTime) / 1000, 0.1); // cap at 100ms
  _lastTime = timestamp;

  // Advance physics + sync mesh positions
  physicsTick(timestamp);
  updateNodes(getSimNodes(), _camera);

  // Advance edge pulse particles
  updateEdges(getNodeMap(), timestamp, deltaTime);

  // Drift nebula motes
  _particles.tick(timestamp);

  // Smooth camera fly-to
  if (_interactionHandlers) {
    _interactionHandlers.updateCameraLerp(deltaTime);
  }

  // Render
  renderFrame(_composer, _controls);
}

// ─── SSE Live Updates ─────────────────────────────────────────────────────────

function _connectSSE() {
  let source;
  let reconnectDelay = 2000;

  function connect() {
    source = new EventSource(`${BACKEND_URL}/api/events`);

    source.addEventListener('graph-update', async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/graph`);
        if (!res.ok) return;
        const newData = await res.json();
        _applyGraphUpdate(newData);
      } catch {
        // Backend temporarily unavailable
      }
    });

    source.addEventListener('open', () => {
      reconnectDelay = 2000; // reset backoff on successful connection
    });

    source.addEventListener('error', () => {
      source.close();
      // Exponential backoff reconnect (max 30s)
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
        connect();
      }, reconnectDelay);
    });
  }

  connect();
}

// ─── Incremental Graph Update ─────────────────────────────────────────────────

function _applyGraphUpdate(newData) {
  // Full rebuild on graph-update events.
  // A future optimization could diff nodes/links and add/remove incrementally.
  _graphData = newData;

  clearNodes(_scene);
  clearEdges(_scene);
  buildNodes(_scene, newData);
  buildEdges(_scene, newData, getNodeMap());

  // Update interaction with new meshes and graph
  if (_interactionHandlers) {
    _interactionHandlers.updateEntityMeshes(getEntityMeshes());
    _interactionHandlers.updateGraphData(newData);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('Visualizer init failed:', err);
  hideLoading();
});
