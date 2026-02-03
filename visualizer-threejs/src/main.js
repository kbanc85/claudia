/**
 * Claudia Brain Visualizer — Main entry point (Three.js)
 *
 * Owns the render loop directly (not delegated to a library like 3d-force-graph).
 * This is the key to smooth performance: we control exactly what happens each frame.
 *
 * Architecture:
 * - Three.js WebGLRenderer + EffectComposer for bloom
 * - d3-force-3d simulation (via graph.js)
 * - Cached mesh Map for O(1) lookups (no scene.traverse)
 * - SSE for live updates
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { config } from './config.js';
import { initDesignPanel } from './design-panel.js';

import {
  initGraph,
  tickSimulation,
  syncPositions,
  addNode,
  addLink,
  updateNodeData,
  getGraphData,
  setSelectedNode,
  highlightNeighborhood,
  clearSelection,
  filterNodes,
  resetFilter,
  getNodePositions,
  disposeGraph
} from './graph.js';

import { getAllNodeMeshes, ENTITY_COLORS, MEMORY_COLORS } from './nodes.js';

import {
  initEffects,
  updateAmbientParticles,
  updateNebula,
  updateFps,
  animateNodes,
  updateLinkParticles,
  updateBloom,
  updateFog,
  updateAmbientParticlesConfig,
  getBloomPass,
  refreshAnimationCache,
  refreshAmbientCache
} from './effects.js';

import {
  initUI,
  updateStats,
  showDetail,
  updateTimeline,
  setGraphData
} from './ui.js';

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let container = null;
let graphData = null;
let eventSource = null;
let clock = null;
let bloomComposer = null;

// Auto-orbit
let autoRotate = true;
let idleTimer = null;

// ── Bootstrap ───────────────────────────────────────────────

async function init() {
  container = document.getElementById('graph-container');

  try {
    // Create renderer
    const bgColor = new THREE.Color(config.background);
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(bgColor, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // Create scene
    scene = new THREE.Scene();
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(new THREE.Color(config.fog.color), config.fog.density);

    // Create camera
    camera = new THREE.PerspectiveCamera(
      config.camera.fov,
      window.innerWidth / window.innerHeight,
      config.camera.near,
      config.camera.far
    );
    camera.position.set(...config.camera.initialPosition);

    // Create controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = config.camera.dampingFactor;
    controls.minDistance = config.camera.minDistance;
    controls.maxDistance = config.camera.maxDistance;
    controls.autoRotate = true;
    controls.autoRotateSpeed = config.camera.autoRotateSpeed;

    // Lighting
    setupLighting(scene);

    // Initialize effects (bloom, particles, starfield, nebula)
    bloomComposer = await initEffects(scene, camera, renderer);

    // Clock for delta time
    clock = new THREE.Clock();

    // Fetch graph data
    const res = await fetch('/api/graph');
    graphData = await res.json();
    console.log(`Loaded ${graphData.nodes.length} nodes, ${graphData.links.length} links`);
    console.log(`UMAP: ${graphData.meta?.umapEnabled ? 'enabled' : 'disabled (force layout)'}`);

    // Initialize force graph
    initGraph(graphData, scene);

    // Initialize UI
    initUI(graphData, {
      focusNode: handleFocusNode,
      filterNodes: filterNodes,
      resetFilter: resetFilter,
      databaseSwitch: handleDatabaseSwitch
    });

    // Node picking
    setupPicking();

    // Auto-orbit pause on interaction
    setupAutoOrbit();

    // Start render loop (owned, not library-controlled)
    animate();

    // Handle resize
    window.addEventListener('resize', handleResize);

    // Fetch stats and timeline
    refreshStats();
    refreshTimeline();

    // Connect SSE
    connectSSE();

    // Initialize design panel (no need for separate onConfigUpdate since panel calls it)
    initDesignPanel(handleConfigUpdate);

  } catch (err) {
    console.error('Failed to initialize:', err);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color:#ef4444;padding:40px;font-size:16px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);';
    const msg = document.createElement('span');
    msg.textContent = 'Failed to connect to Claudia Brain. ';
    const detail = document.createElement('small');
    detail.style.color = '#808098';
    detail.textContent = err.message;
    errorDiv.appendChild(msg);
    errorDiv.appendChild(detail);
    document.body.appendChild(errorDiv);
  }
}

// ── Lighting ────────────────────────────────────────────────

function setupLighting(scene) {
  const { lighting } = config;

  // Ambient
  const ambient = new THREE.AmbientLight(
    new THREE.Color(lighting.ambient.color),
    lighting.ambient.intensity
  );
  scene.add(ambient);

  // Key light (indigo, upper right)
  const keyLight = new THREE.PointLight(
    new THREE.Color(lighting.key.color),
    lighting.key.intensity,
    800
  );
  keyLight.position.set(...lighting.key.position);
  scene.add(keyLight);

  // Fill light (cyan, lower left)
  const fillLight = new THREE.PointLight(
    new THREE.Color(lighting.fill.color),
    lighting.fill.intensity,
    600
  );
  fillLight.position.set(...lighting.fill.position);
  scene.add(fillLight);

  // Accent light (amber, behind)
  const accentLight = new THREE.PointLight(
    new THREE.Color(lighting.accent.color),
    lighting.accent.intensity,
    500
  );
  accentLight.position.set(...lighting.accent.position);
  scene.add(accentLight);
}

// ── Render loop (the key to smooth performance) ─────────────

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // 1. Tick force simulation (conditional: only when alpha > alphaMin)
  tickSimulation();

  // 2. Animate node meshes (breathing, spawn, pulse, shimmer)
  const meshMap = getAllNodeMeshes();
  animateNodes(meshMap, elapsed, delta);

  // 3. Ambient effects
  updateAmbientParticles(elapsed);
  updateNebula(elapsed);
  updateLinkParticles(elapsed);

  // 4. Auto-orbit rotation
  if (autoRotate) {
    controls.autoRotate = true;
  } else {
    controls.autoRotate = false;
  }
  controls.update();

  // 5. FPS tracking
  updateFps();

  // 6. Render (through bloom composer if available)
  if (bloomComposer) {
    bloomComposer.render();
  } else {
    renderer.render(scene, camera);
  }
}

// ── Picking (raycaster) ─────────────────────────────────────

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function setupPicking() {
  renderer.domElement.addEventListener('click', onPointerClick);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
}

function onPointerClick(event) {
  // Calculate mouse position in normalized device coordinates
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Get all node meshes
  const meshMap = getAllNodeMeshes();
  const meshes = [];
  for (const [nodeId, group] of meshMap) {
    if (group.userData?.mesh) {
      meshes.push(group.userData.mesh);
    }
  }

  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    // Find the parent group to get the node
    let parent = hit.parent;
    while (parent && !parent.userData?.node) {
      parent = parent.parent;
    }
    if (parent?.userData?.node) {
      handleNodeClick(parent.userData.node);
    }
  } else {
    // Background click
    clearSelection();
  }
}

function onPointerMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const meshMap = getAllNodeMeshes();
  const meshes = [];
  for (const [nodeId, group] of meshMap) {
    if (group.userData?.mesh) {
      meshes.push(group.userData.mesh);
    }
  }

  const intersects = raycaster.intersectObjects(meshes, false);
  renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
}

function handleNodeClick(node) {
  setSelectedNode(node);
  highlightNeighborhood(node);
  handleFocusNode(node);

  if (node.nodeType === 'entity') {
    fetch(`/api/entity/${node.dbId}`)
      .then(r => r.json())
      .then(detail => showDetail(node, detail))
      .catch(() => {});
  } else {
    showDetail(node, null);
  }

  // Pause auto-orbit temporarily
  pauseOrbit();
}

// ── Database switch ──────────────────────────────────────────

async function handleDatabaseSwitch() {
  console.log('Database switched, reloading graph...');

  try {
    // Dispose existing graph (meshes, simulation, links)
    disposeGraph();

    // Fetch new graph data
    const response = await fetch('/api/graph');
    graphData = await response.json();

    console.log(`Reloaded ${graphData.nodes.length} nodes, ${graphData.links.length} links`);

    // Re-initialize graph with new data
    initGraph(graphData, scene);

    // Update UI with new data
    setGraphData(graphData);

    // Refresh stats and timeline
    refreshStats();
    refreshTimeline();

  } catch (err) {
    console.error('Failed to reload graph after database switch:', err);
    alert('Failed to reload graph: ' + err.message);
  }
}

// ── Camera focus ────────────────────────────────────────────

function handleFocusNode(node, duration) {
  if (!node || !camera) return;

  const pos = getNodePositions().get(node.id);
  if (!pos) return;

  const target = new THREE.Vector3(pos.x, pos.y, pos.z);
  const distance = config.camera.focusDistance;

  // Calculate camera position
  const direction = camera.position.clone().sub(controls.target).normalize();
  const newCamPos = target.clone().add(direction.multiplyScalar(distance));

  // Animate camera
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();
  const dur = duration || config.camera.focusDuration;

  function animateCamera() {
    const t = Math.min(1, (performance.now() - startTime) / dur);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

    camera.position.lerpVectors(startPos, newCamPos, ease);
    controls.target.lerpVectors(startTarget, target, ease);

    if (t < 1) {
      requestAnimationFrame(animateCamera);
    }
  }

  animateCamera();
}

// ── Auto-orbit ──────────────────────────────────────────────

function setupAutoOrbit() {
  renderer.domElement.addEventListener('pointerdown', pauseOrbit);
  renderer.domElement.addEventListener('wheel', pauseOrbit);
}

function pauseOrbit() {
  autoRotate = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { autoRotate = true; }, config.camera.idleTimeout);
}

// ── Config update handler ────────────────────────────────────

function handleConfigUpdate(changedPath) {
  if (!scene || !renderer) return;

  // Background color
  if (changedPath === 'background' || changedPath === '*') {
    const bgColor = new THREE.Color(config.background);
    renderer.setClearColor(bgColor, 1);
    scene.background = bgColor;
  }

  // Fog
  if (changedPath.startsWith('fog') || changedPath === '*') {
    scene.fog.color.set(config.fog.color);
    scene.fog.density = config.fog.density;
  }

  // Bloom
  if (changedPath.startsWith('bloom') || changedPath === '*') {
    const bloomPass = getBloomPass();
    if (bloomPass) {
      bloomPass.strength = config.bloom.strength;
      bloomPass.radius = config.bloom.radius;
      bloomPass.threshold = config.bloom.threshold;
    }
  }

  // Camera
  if (changedPath.startsWith('camera') || changedPath === '*') {
    if (camera) {
      camera.fov = config.camera.fov;
      camera.updateProjectionMatrix();
    }
    if (controls) {
      controls.autoRotateSpeed = config.camera.autoRotateSpeed;
    }
  }

  // Ambient effects
  if (changedPath.startsWith('ambientParticles') || changedPath === '*') {
    refreshAmbientCache();
    updateAmbientParticlesConfig();
  }

  // Animation config
  if (changedPath.startsWith('animations') || changedPath === '*') {
    refreshAnimationCache();
  }
}

// ── Resize handler ──────────────────────────────────────────

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (bloomComposer) {
    bloomComposer.setSize(window.innerWidth, window.innerHeight);
  }
}

// ── Stats refresh ───────────────────────────────────────────

async function refreshStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    updateStats(stats);
  } catch {}
}

async function refreshTimeline() {
  try {
    const res = await fetch('/api/timeline');
    const events = await res.json();
    updateTimeline(events);
  } catch {}
}

// ── SSE connection ──────────────────────────────────────────

function connectSSE() {
  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleEvent(data);
    } catch {}
  };

  eventSource.onerror = () => {
    console.warn('SSE connection lost, reconnecting...');
  };
}

// ── Event handlers ──────────────────────────────────────────

function handleEvent(event) {
  // Pulse activity indicator
  const pulse = document.getElementById('activity-pulse');
  if (pulse) {
    pulse.style.background = '#6366f1';
    setTimeout(() => { pulse.style.background = '#10b981'; }, 1000);
  }

  switch (event.type) {
    case 'memory_created': handleMemoryCreated(event.data); break;
    case 'memory_accessed': handleMemoryAccessed(event.data); break;
    case 'memory_improved': handleMemoryImproved(event.data); break;
    case 'entity_created': handleEntityCreated(event.data); break;
    case 'relationship_created': handleRelationshipCreated(event.data); break;
    case 'relationship_superseded': handleRelationshipSuperseded(event.data); break;
    case 'pattern_detected': handlePatternDetected(event.data); break;
    case 'prediction_created': handlePredictionCreated(event.data); break;
    case 'importance_decay': handleImportanceDecay(event.data); break;
  }

  refreshStats();
}

function handleMemoryCreated(data) {
  const node = {
    id: `memory-${data.id}`,
    dbId: data.id,
    nodeType: 'memory',
    memoryType: data.type,
    name: data.content?.slice(0, 60) || '',
    content: data.content,
    importance: data.importance,
    color: MEMORY_COLORS[data.type] || '#888',
    size: Math.max(1.5, data.importance * 3),
    opacity: 1,
    createdAt: data.created_at,
    __spawn: true
  };

  addNode(node);
  setTimeout(() => handleFocusNode(node, 1500), 200);
}

function handleMemoryAccessed(data) {
  const gd = getGraphData();
  const node = gd.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.__pulse = true;
    node.importance = data.importance;
    setTimeout(() => { node.__pulse = false; }, 2000);
  }
}

function handleMemoryImproved(data) {
  const gd = getGraphData();
  const node = gd.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.__shimmer = true;
    node.llmImproved = true;
    node.content = data.content;
    setTimeout(() => { node.__shimmer = false; }, 3000);
  }
}

function handleEntityCreated(data) {
  const node = {
    id: `entity-${data.id}`,
    dbId: data.id,
    nodeType: 'entity',
    entityType: data.type,
    name: data.name,
    importance: data.importance,
    color: ENTITY_COLORS[data.type] || '#888',
    size: Math.max(3, Math.sqrt(data.importance) * 8),
    opacity: 1,
    __spawn: true
  };

  addNode(node);
  setTimeout(() => handleFocusNode(node, 2000), 200);
}

function handleRelationshipCreated(data) {
  const link = {
    id: `rel-${data.id}`,
    source: `entity-${data.source_entity_id}`,
    target: `entity-${data.target_entity_id}`,
    linkType: 'relationship',
    label: data.relationship_type,
    strength: data.strength,
    width: Math.max(0.5, data.strength * 3),
    __grow: true
  };

  addLink(link);
}

function handleRelationshipSuperseded(data) {
  const gd = getGraphData();
  const link = gd.links.find(l => l.id === `rel-${data.id}`);
  if (link) {
    link.dashed = true;
    link.historical = true;
    link.color = 'rgba(255,255,255,0.08)';
    link.invalidAt = data.invalid_at;
    syncPositions();
  }
}

function handlePatternDetected(data) {
  const node = {
    id: `pattern-${data.id}`,
    dbId: data.id,
    nodeType: 'pattern',
    patternType: data.pattern_type,
    name: data.name,
    confidence: data.confidence,
    color: '#a78bfa',
    size: Math.max(4, data.confidence * 10),
    opacity: Math.max(0.4, data.confidence),
    __spawn: true
  };

  addNode(node);
}

function handlePredictionCreated(data) {
  const statEl = document.getElementById('stat-patterns');
  if (statEl) {
    statEl.style.color = '#38bdf8';
    setTimeout(() => { statEl.style.color = ''; }, 2000);
  }
}

function handleImportanceDecay(data) {
  const gd = getGraphData();
  const node = gd.nodes.find(n => n.id === `memory-${data.id}`);
  if (node) {
    node.importance = data.importance;
    node.size = Math.max(1.5, data.importance * 3);
    node.opacity = Math.max(0.15, data.importance);

    updateNodeData(node.id, {
      importance: data.importance,
      size: node.size,
      opacity: node.opacity
    });
  }
}

// ── Export for UI ───────────────────────────────────────────

export { handleFocusNode, scene, camera, renderer };

// ── Start ───────────────────────────────────────────────────

init();
