import * as THREE from 'three';
import { CONFIG } from './config.js';
import { setHovered, setNodeVisibility, getNodeMap } from './nodes.js';
import { openDetailPanel, closeDetailPanel, showTooltip, hideTooltip, toggleHUD } from './ui.js';

const BACKEND_URL = CONFIG.BACKEND_URL;

let _camera = null;
let _renderer = null;
let _controls = null;
let _entityMeshes = [];
let _graphData = null;
let _raycaster = null;
let _mouse = null;
let _hoveredNodeId = null;
let _isIsolated = false;

// Camera lerp state
const _lerpTarget = new THREE.Vector3();
const _lerpStart = new THREE.Vector3();
let _lerpProgress = 0;
let _lerpActive = false;
const LERP_DURATION = 1.5; // seconds

export function initInteraction(camera, renderer, controls, entityMeshes, graphData) {
  _camera = camera;
  _renderer = renderer;
  _controls = controls;
  _entityMeshes = entityMeshes;
  _graphData = graphData;
  _raycaster = new THREE.Raycaster();
  _mouse = new THREE.Vector2();

  const canvas = renderer.domElement;

  // ─── Mouse move: hover + tooltip ────────────────────────────────
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, _camera);
    const hits = _raycaster.intersectObjects(_entityMeshes, false);

    if (hits.length > 0) {
      const mesh = hits[0].object;
      const nodeId = mesh.userData?.nodeId;
      if (nodeId !== _hoveredNodeId) {
        setHovered(nodeId);
        _hoveredNodeId = nodeId;
      }
      const name = mesh.userData?.node?.name || '';
      const type = mesh.userData?.node?.type || '';
      showTooltip(`${name}${type ? ' · ' + type : ''}`, e.clientX, e.clientY);
      canvas.style.cursor = 'pointer';
    } else {
      if (_hoveredNodeId) {
        setHovered(null);
        _hoveredNodeId = null;
      }
      hideTooltip();
      canvas.style.cursor = 'default';
    }
  });

  // ─── Click: open detail panel ────────────────────────────────────
  let _mouseDownPos = { x: 0, y: 0 };
  canvas.addEventListener('mousedown', (e) => {
    _mouseDownPos = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('click', async (e) => {
    const dx = Math.abs(e.clientX - _mouseDownPos.x);
    const dy = Math.abs(e.clientY - _mouseDownPos.y);
    if (dx > 5 || dy > 5) return; // was a drag, not a click

    if (_hoveredNodeId) {
      const entry = getNodeMap().get(_hoveredNodeId);
      if (entry && entry.node) {
        const entityId = entry.node.entityId; // numeric DB id
        if (entityId != null) {
          await _fetchAndShowDetail(entityId);
        }
      }
    } else {
      closeDetailPanel();
    }
  });

  // ─── Double-click: reset camera ───────────────────────────────────
  canvas.addEventListener('dblclick', () => {
    flyToPosition(new THREE.Vector3(0, 0, 300));
  });

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.key.toLowerCase()) {
      case 'h':
        toggleHUD();
        break;
      case 'r':
        flyToPosition(new THREE.Vector3(0, 0, 300));
        break;
      case 'f':
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen();
        }
        break;
      case 'escape':
        closeDetailPanel();
        if (_isIsolated) resetIsolation();
        break;
    }
  });

  return {
    isolateNode,
    resetIsolation,
    updateEntityMeshes: (meshes) => { _entityMeshes = meshes; },
    updateGraphData: (data) => { _graphData = data; },
    updateCameraLerp,
  };
}

// ─── Fetch entity from backend and show detail panel ───────────────────────
async function _fetchAndShowDetail(entityId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/entity/${entityId}`);
    if (!res.ok) return;
    const data = await res.json();

    // Find connected node IDs for isolation
    const nodeId = `entity_${entityId}`;
    openDetailPanel(
      data,
      () => isolateNode(nodeId),
      () => resetIsolation(),
    );
  } catch (e) {
    console.warn('Could not fetch entity details:', e);
  }
}

// ─── Search query handler ─────────────────────────────────────────────────
export function onSearchQuery(query) {
  const nodeMap = getNodeMap();
  if (!nodeMap || nodeMap.size === 0) return;

  if (!query) {
    // Reset all opacities
    for (const [, entry] of nodeMap) {
      if (entry.type === 'entity') {
        entry.mesh.material.opacity = 1.0;
        entry.mesh.material.transparent = false;
      }
    }
    setHovered(null);
    return;
  }

  const q = query.toLowerCase();
  let firstMatchPos = null;

  for (const [, entry] of nodeMap) {
    if (entry.type !== 'entity') continue;
    const name = (entry.node?.name || '').toLowerCase();
    const matches = name.includes(q);
    entry.mesh.material.transparent = true;
    entry.mesh.material.opacity = matches ? 1.0 : 0.08;
    if (matches && !firstMatchPos) {
      firstMatchPos = entry.mesh.position.clone();
    }
  }

  // Fly camera toward first match
  if (firstMatchPos) {
    const target = firstMatchPos.clone().add(new THREE.Vector3(0, 0, 80));
    flyToPosition(target);
  }
}

// ─── Isolation ────────────────────────────────────────────────────────────
export function isolateNode(nodeId) {
  const nodeMap = getNodeMap();
  if (!nodeMap) return;

  // Build set of connected node IDs from graph links
  const connected = new Set([nodeId]);
  if (_graphData?.links) {
    for (const link of _graphData.links) {
      if (link.linkType !== 'relationship') continue;
      if (link.source === nodeId || link.target === nodeId) {
        connected.add(link.source);
        connected.add(link.target);
      }
    }
  }

  for (const [id, entry] of nodeMap) {
    if (entry.type === 'entity') {
      const visible = connected.has(id);
      entry.mesh.material.transparent = true;
      entry.mesh.material.opacity = visible ? 1.0 : 0.04;
    }
  }
  _isIsolated = true;
}

export function resetIsolation() {
  const nodeMap = getNodeMap();
  if (!nodeMap) return;
  for (const [, entry] of nodeMap) {
    if (entry.type === 'entity') {
      entry.mesh.material.opacity = 1.0;
      entry.mesh.material.transparent = false;
    }
  }
  _isIsolated = false;
}

// ─── Camera lerp (smooth fly-to) ──────────────────────────────────────────
export function flyToPosition(targetPos) {
  _lerpStart.copy(_camera.position);
  _lerpTarget.copy(targetPos);
  _lerpProgress = 0;
  _lerpActive = true;
}

// Call every animation frame with deltaTime in seconds
export function updateCameraLerp(deltaTime) {
  if (!_lerpActive) return;

  _lerpProgress += deltaTime / LERP_DURATION;
  if (_lerpProgress >= 1) {
    _lerpProgress = 1;
    _lerpActive = false;
  }

  // Smooth ease-in-out cubic
  const t = _lerpProgress < 0.5
    ? 4 * _lerpProgress ** 3
    : 1 - (-2 * _lerpProgress + 2) ** 3 / 2;

  _camera.position.lerpVectors(_lerpStart, _lerpTarget, t);
}
