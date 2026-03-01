import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  forceZ
} from 'd3-force-3d';

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function orbitOffset(seed, radius) {
  const angle = ((stableHash(`${seed}:a`) % 360) * Math.PI) / 180;
  const pitch = (((stableHash(`${seed}:p`) % 120) - 60) * Math.PI) / 180;
  const spread = radius + (stableHash(`${seed}:r`) % 24);
  return {
    x: Math.cos(angle) * Math.cos(pitch) * spread,
    y: Math.sin(pitch) * spread * 0.72,
    z: Math.sin(angle) * Math.cos(pitch) * spread
  };
}

function homeFor(node, nodeMap) {
  const seed = {
    x: Number(node.layout?.seedX ?? 0),
    y: Number(node.layout?.seedY ?? 0),
    z: Number(node.layout?.seedZ ?? 0)
  };
  const anchor = node.anchorRef ? nodeMap.get(node.anchorRef) : null;

  if (node.kind === 'entity') return seed;
  if (!anchor) return seed;

  if (node.kind === 'commitment') {
    const offset = orbitOffset(node.id, 34);
    return { x: anchor.x + offset.x * 0.6, y: anchor.y + 48 + offset.y, z: anchor.z + 30 + offset.z * 0.45 };
  }

  if (node.kind === 'pattern') {
    const offset = orbitOffset(node.id, 72);
    return { x: anchor.x + offset.x, y: anchor.y + offset.y * 0.7, z: anchor.z - 56 + offset.z };
  }

  const offset = orbitOffset(node.id, 46);
  return { x: anchor.x + offset.x * 0.75, y: anchor.y + 18 + offset.y, z: anchor.z + offset.z * 0.75 };
}

function chargeFor(node) {
  if (node.kind === 'entity') return -180 - Number(node.importance || 0) * 90;
  if (node.kind === 'pattern') return -70;
  if (node.kind === 'commitment') return -55;
  return -26;
}

function collisionFor(node) {
  return Math.max(16, Number(node.size || 5) * (node.kind === 'entity' ? 3.2 : 2.4));
}

function linkDistance(edge) {
  if (edge.channel === 'trace') return 54;
  if (edge.channel === 'relationship') return 84 - Math.min(Number(edge.strength || 0) * 22, 22);
  if (edge.channel === 'commitment') return 40;
  return 34;
}

function linkStrength(edge) {
  if (edge.channel === 'trace') return 0.4;
  if (edge.channel === 'relationship') return 0.12 + Number(edge.strength || 0) * 0.16;
  if (edge.channel === 'commitment') return 0.22;
  return 0.16;
}

function toSnapshot(nodes) {
  const positions = {};
  const velocities = {};
  for (const node of nodes) {
    positions[node.id] = { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
    velocities[node.id] = { x: node.vx || 0, y: node.vy || 0, z: node.vz || 0 };
  }
  return { positions, velocities };
}

self.onmessage = (event) => {
  const { type, jobId, nodes = [], edges = [], previousPositions = {}, motionLevel = 'full' } = event.data || {};
  if (type !== 'layout') return;

  const nodeMap = new Map(nodes.map((node) => [node.id, {
    ...node,
    x: Number(previousPositions?.[node.id]?.x ?? node.layout?.seedX ?? 0),
    y: Number(previousPositions?.[node.id]?.y ?? node.layout?.seedY ?? 0),
    z: Number(previousPositions?.[node.id]?.z ?? node.layout?.seedZ ?? 0)
  }]));

  const simNodes = [...nodeMap.values()];
  const simEdges = edges
    .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
    .map((edge) => ({ ...edge }));

  const reusedNodes = nodes.filter((node) => previousPositions?.[node.id]).length;
  const reuseRatio = nodes.length ? reusedNodes / nodes.length : 0;
  const baseIterations = reuseRatio > 0.7
    ? (motionLevel === 'reduced' ? 18 : motionLevel === 'restrained' ? 24 : 30)
    : (motionLevel === 'reduced' ? 90 : motionLevel === 'restrained' ? 120 : 160);
  const densityFactor = nodes.length > 900 ? 0.48 : nodes.length > 500 ? 0.62 : nodes.length > 260 ? 0.82 : 1;
  const iterations = Math.max(16, Math.round(baseIterations * densityFactor));
  const positionalStrength = reuseRatio > 0.7
    ? 0.018
    : motionLevel === 'reduced'
      ? 0.09
      : 0.05;

  const simulation = forceSimulation(simNodes, 3)
    .alpha(reuseRatio > 0.7 ? 0.22 : 1)
    .alphaDecay(reuseRatio > 0.7 ? 0.14 : motionLevel === 'full' ? 0.038 : 0.05)
    .velocityDecay(motionLevel === 'full' ? 0.22 : 0.3)
    .force('charge', forceManyBody().strength(chargeFor).distanceMax(520))
    .force('collide', forceCollide().radius(collisionFor).strength(0.85))
    .force('link', forceLink(simEdges).id((node) => node.id).distance(linkDistance).strength(linkStrength))
    .force('homeX', forceX((node) => homeFor(node, nodeMap).x).strength(positionalStrength))
    .force('homeY', forceY((node) => homeFor(node, nodeMap).y).strength(positionalStrength))
    .force('homeZ', forceZ((node) => homeFor(node, nodeMap).z).strength(positionalStrength));

  for (let tick = 0; tick < iterations; tick += 1) {
    simulation.tick();
    if (tick === 0 || tick % 10 === 0 || tick === iterations - 1) {
      const snapshot = toSnapshot(simNodes);
      self.postMessage({
        type: 'snapshot',
        jobId,
        positions: snapshot.positions,
        velocities: snapshot.velocities,
        done: tick === iterations - 1
      });
    }
  }

  simulation.stop();
};
