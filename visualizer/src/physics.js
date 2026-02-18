import { forceSimulation, forceManyBody, forceLink, forceCenter } from 'd3-force-3d';

let _simulation = null;
let _simNodes = [];
let _simLinks = [];
let _initialized = false;

// Initialize physics simulation from graph data
export async function initPhysics(graphData) {
  const nodes = graphData.nodes;
  const links = graphData.links;

  // Create simulation node copies with initial positions
  _simNodes = nodes.map((n, i) => ({
    id: n.id,
    nodeType: n.nodeType,
    importance: n.importance || 0.5,
    embedding: n.embedding,
    x: (Math.random() - 0.5) * 400,
    y: (Math.random() - 0.5) * 400,
    z: (Math.random() - 0.5) * 400,
    vx: 0, vy: 0, vz: 0,
    _phase: i * 0.7,
    _noiseOffset: i * 137.508,
    _index: i,
  }));

  // Try UMAP for semantic initial layout
  try {
    const entityNodes = _simNodes.filter(n => n.nodeType === 'entity' && n.embedding && n.embedding.length > 0);
    if (entityNodes.length >= 5) {
      // Lazy import umap-js
      const umapModule = await import('umap-js');
      const UMAPClass = umapModule.UMAP;
      const umap = new UMAPClass({ nComponents: 3, nNeighbors: Math.min(15, entityNodes.length - 1), minDist: 0.1 });
      const embeddings = entityNodes.map(n => n.embedding);
      const result = umap.fit(embeddings);

      // Scale to ±150 range
      const maxVal = Math.max(...result.flat().map(Math.abs)) || 1;
      const scale = 150 / maxVal;

      entityNodes.forEach((simNode, i) => {
        simNode.x = result[i][0] * scale;
        simNode.y = result[i][1] * scale;
        simNode.z = result[i][2] * scale;
      });
    }
  } catch {
    // UMAP not available or failed - use random positions (already set)
  }

  // Create sim links (only relationship links)
  const nodeIds = new Set(_simNodes.map(n => n.id));
  _simLinks = links
    .filter(l => l.linkType === 'relationship' && nodeIds.has(l.source) && nodeIds.has(l.target))
    .map(l => ({
      source: l.source,
      target: l.target,
      strength: l.strength || 0.5,
      distance: 100,
    }));

  // Create d3-force-3d simulation
  _simulation = forceSimulation(_simNodes, 3) // 3 = 3D
    .force('charge', forceManyBody().strength(-200))
    .force('link', forceLink(_simLinks).id(d => d.id).distance(100).strength(d => d.strength * 0.3))
    .force('center', forceCenter(0, 0, 0))
    .alphaDecay(0.01)
    .alphaMin(0.001)
    .stop(); // we'll tick manually

  // Fast-forward 300 ticks to settle initial layout
  for (let i = 0; i < 300; i++) {
    _simulation.tick();
  }

  // After fast-forward, soften charge to allow swirl to dominate
  _simulation.force('charge', forceManyBody().strength(-120));

  _initialized = true;
  return _simNodes;
}

// Called every animation frame
export function tick(time) {
  if (!_initialized || !_simulation) return _simNodes;

  // Advance d3 simulation if still hot
  if (_simulation.alpha() > _simulation.alphaMin()) {
    _simulation.tick();
  }

  // Apply organic swirl + drift to all nodes
  for (const node of _simNodes) {
    // 1. Galaxy swirl: tangential rotation around Y axis
    const angle = Math.atan2(node.z, node.x);
    const dist2d = Math.sqrt(node.x * node.x + node.z * node.z);
    const swirlSpeed = 0.0005 * (1 + dist2d * 0.003);
    node.x += Math.cos(angle + Math.PI / 2) * swirlSpeed * 15;
    node.z += Math.sin(angle + Math.PI / 2) * swirlSpeed * 15;

    // 2. Sinusoidal vertical oscillation (breathing effect)
    node.y += Math.sin(time * 0.0003 + node._phase) * 0.02;

    // 3. Cheap Simplex-like drift (combine sin/cos at different frequencies)
    const n = node._noiseOffset;
    const drift = (
      Math.sin(time * 0.0001 + n) * Math.cos(time * 0.00007 + n * 0.5)
    ) * 0.12;
    node.x += drift;
    node.z += Math.cos(time * 0.00008 + n) * Math.sin(time * 0.00012 + n * 0.3) * 0.12;

    // 4. Soft boundary: gentle pull-back if too far from origin
    const dist = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z);
    if (dist > 380) {
      const factor = 375 / dist;
      node.x *= factor;
      node.y *= factor;
      node.z *= factor;
    }
  }

  return _simNodes;
}

export function getSimNodes() {
  return _simNodes;
}

export function findSimNode(id) {
  return _simNodes.find(n => n.id === id);
}

export function getNodePosition(simNode) {
  return { x: simNode.x || 0, y: simNode.y || 0, z: simNode.z || 0 };
}

export function isInitialized() {
  return _initialized;
}
