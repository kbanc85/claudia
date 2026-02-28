/**
 * Claudia Brain v4 -- Node animations (Performance-optimized)
 *
 * Key optimizations:
 * - Only animates entities and patterns (memories skip unless spawning/pulsing)
 * - Frame-skips entity rotation (every 2nd frame)
 * - Uses cheaper Math approximations where possible
 * - Tracks animated node count for diagnostics
 */

// FPS tracking
let frameCount = 0;
let lastFpsTime = performance.now();
let currentFps = 0;
let frameNumber = 0;

/**
 * Animate all visible nodes. Called from onEngineTick.
 * Skips idle memory nodes for performance.
 */
export function animateNodes(Graph, elapsed, delta) {
  if (!Graph) return;
  const gd = Graph.graphData();
  if (!gd?.nodes) return;

  frameNumber++;
  const isEvenFrame = (frameNumber & 1) === 0;

  const nodes = gd.nodes;
  const len = nodes.length;

  for (let idx = 0; idx < len; idx++) {
    const node = nodes[idx];
    const obj = node.__threeObj;
    if (!obj) continue;
    const ud = obj.userData || {};
    const mesh = ud.coreMesh || obj;
    if (!mesh) continue;

    // Skip idle memories (75% of nodes are memories, most are static)
    if (ud.nodeType === 'memory' && !ud.spawnTime && !node.__pulse && !node.__shimmer) continue;

    const base = ud.baseScale || 1;
    const phase = ud.phase || 0;

    // Entity breathing: sine-wave with noise-like variation
    if (ud.nodeType === 'entity') {
      const importance = node.importance || 0.5;
      const freq = 0.8 + importance * 0.3;
      const depth = 0.04 + importance * 0.03;
      const scale = base * (1 + Math.sin(elapsed * freq + phase) * depth);
      mesh.scale.setScalar(scale);

      // Rotation only every other frame (cheap savings)
      if (isEvenFrame) {
        mesh.rotation.y = elapsed * 0.15 + phase;
        mesh.rotation.x = Math.sin(elapsed * 0.08 + phase) * 0.1;
      }
    }

    // Pattern: wireframe breathing (less frequent)
    if (ud.nodeType === 'pattern') {
      if (isEvenFrame) {
        const scale = base * (1 + Math.sin(elapsed * 0.5 + phase) * 0.04);
        mesh.scale.setScalar(scale);
        mesh.rotation.y = elapsed * 0.1 + phase;
      }
    }

    // Spawn flash: elastic ease-in from zero
    if (ud.spawnTime) {
      const age = (Date.now() - ud.spawnTime) / 1000;
      if (age < 1.5) {
        const t = Math.min(1, age / 1.0);
        const elastic = 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 4);
        mesh.scale.setScalar(base * elastic);
        if (mesh.material && !mesh.material.__shared) {
          mesh.material.emissiveIntensity = 0.8 * (1 - t) + (mesh.material.emissiveIntensity || 0.35) * t;
        }
      } else {
        ud.spawnTime = null;
      }
    }

    // Pulse on access: brief scale boost
    if (node.__pulse) {
      mesh.scale.setScalar(base * 1.15);
    }

    // Shimmer on LLM improvement: golden glow
    if (node.__shimmer && mesh.material && !mesh.material.__shared) {
      mesh.material.emissiveIntensity = 0.6 + Math.sin(elapsed * 3) * 0.2;
    }
  }
}

/**
 * Track FPS.
 */
export function updateFps() {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    lastFpsTime = now;
  }
}

export function getFps() { return currentFps; }
