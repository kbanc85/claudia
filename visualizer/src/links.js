/**
 * Claudia Brain — Edge rendering with Babylon.js
 *
 * Renders links between nodes using LineSystem for efficiency.
 * Highlighted links get directional particles via GPU particle system.
 */

import {
  MeshBuilder,
  Color3,
  Color4,
  Vector3,
  Mesh,
  VertexBuffer,
  StandardMaterial
} from '@babylonjs/core';

let linesMesh = null;
let linksData = []; // Current link data for updates

// ── Create / update all links ───────────────────────────────

export function updateLinks(links, nodePositions, highlightSet, scene) {
  linksData = links;

  // Dispose old lines
  if (linesMesh) {
    linesMesh.dispose();
    linesMesh = null;
  }

  if (links.length === 0) return;

  const lines = [];
  const colors = [];

  for (const link of links) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    const sourcePos = nodePositions.get(sourceId);
    const targetPos = nodePositions.get(targetId);

    if (!sourcePos || !targetPos) continue;

    const s = new Vector3(sourcePos.x, sourcePos.y, sourcePos.z);
    const t = new Vector3(targetPos.x, targetPos.y, targetPos.z);

    lines.push([s, t]);

    // Color based on state
    let color;
    if (highlightSet.has(link)) {
      color = new Color4(0.49, 0.83, 0.99, 0.9); // #7dd3fc
    } else if (link.color) {
      color = parseColor4(link.color);
    } else if (link.linkType === 'memory_entity') {
      color = new Color4(0.47, 0.55, 1.0, 0.06);
    } else if (link.dashed) {
      color = new Color4(1, 1, 1, 0.04);
    } else {
      color = new Color4(0.55, 0.63, 1.0, 0.12);
    }

    colors.push([color, color]);
  }

  if (lines.length === 0) return;

  linesMesh = MeshBuilder.CreateLineSystem('links', {
    lines,
    colors,
    updatable: true
  }, scene);

  linesMesh.isPickable = false;
  linesMesh.renderingGroupId = 0;

  return linesMesh;
}

// ── Quick position update (called each simulation tick) ─────

export function updateLinkPositions(links, nodePositions, highlightSet, scene) {
  // For performance, recreate the line system each tick
  // Babylon LineSystem is cheap to recreate with updatable: true
  return updateLinks(links, nodePositions, highlightSet, scene);
}

// ── Helpers ─────────────────────────────────────────────────

function parseColor4(colorStr) {
  if (!colorStr) return new Color4(0.55, 0.63, 1.0, 0.12);

  // Handle rgba(r,g,b,a)
  const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
  if (rgbaMatch) {
    return new Color4(
      parseInt(rgbaMatch[1]) / 255,
      parseInt(rgbaMatch[2]) / 255,
      parseInt(rgbaMatch[3]) / 255,
      parseFloat(rgbaMatch[4] ?? '1')
    );
  }

  // Handle hex
  if (colorStr.startsWith('#')) {
    const r = parseInt(colorStr.slice(1, 3), 16) / 255;
    const g = parseInt(colorStr.slice(3, 5), 16) / 255;
    const b = parseInt(colorStr.slice(5, 7), 16) / 255;
    return new Color4(r, g, b, 0.7);
  }

  return new Color4(0.55, 0.63, 1.0, 0.12);
}

export function disposeLinks() {
  if (linesMesh) {
    linesMesh.dispose();
    linesMesh = null;
  }
}
