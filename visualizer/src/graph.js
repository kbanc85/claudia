/**
 * Claudia Brain -- Graph data management (3d-force-graph)
 *
 * Thin data layer wrapping 3d-force-graph's built-in force simulation.
 * No manual forceSimulation, syncPositions, or tickSimulation needed --
 * the library handles all of that internally.
 */

let Graph = null;
let graphData = { nodes: [], links: [] };
let fullData = null; // Stashed for filter/reset
let highlightNodes = new Set();
let highlightLinks = new Set();
let selectedNode = null;

// ── Graph instance ─────────────────────────────────────────

export function setGraphInstance(instance) {
  Graph = instance;
}

export function getGraphInstance() {
  return Graph;
}

// ── Data access ────────────────────────────────────────────

export function getGraphData() { return graphData; }
export function getSelectedNode() { return selectedNode; }
export function getHighlightNodes() { return highlightNodes; }
export function getHighlightLinks() { return highlightLinks; }

export function setGraphData(data) {
  graphData = data;
}

export function setSelectedNode(node) {
  selectedNode = node;
}

// ── Data mutations ─────────────────────────────────────────

export function addNode(node) {
  graphData.nodes.push(node);
  pushData();
}

export function addLink(link) {
  graphData.links.push(link);
  pushData();
}

export function updateNodeData(nodeId, updates) {
  const node = graphData.nodes.find(n => n.id === nodeId);
  if (node) {
    Object.assign(node, updates);
    // Force re-render of the affected node
    if (Graph) Graph.nodeThreeObject(Graph.nodeThreeObject());
  }
}

// ── Selection + highlighting ──────────────────────────────

export function highlightNeighborhood(node) {
  highlightNodes.clear();
  highlightLinks.clear();

  if (!node) {
    triggerRefresh();
    return;
  }

  highlightNodes.add(node.id);

  for (const link of graphData.links) {
    // Only highlight entity-to-entity relationship links
    if (link.linkType !== 'relationship') continue;

    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    if (sourceId === node.id || targetId === node.id) {
      highlightLinks.add(link);
      const otherId = sourceId === node.id ? targetId : sourceId;
      highlightNodes.add(otherId);
    }
  }

  triggerRefresh();
}

export function clearSelection() {
  selectedNode = null;
  highlightNodes.clear();
  highlightLinks.clear();
  triggerRefresh();
  document.getElementById('detail-panel')?.classList.add('hidden');
}

// ── Filtering ─────────────────────────────────────────────

export function filterNodes(filterFn) {
  if (!fullData) {
    fullData = { nodes: [...graphData.nodes], links: [...graphData.links] };
  }

  const filteredNodes = fullData.nodes.filter(filterFn);
  const nodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredLinks = fullData.links.filter(l => {
    const sid = typeof l.source === 'object' ? l.source.id : l.source;
    const tid = typeof l.target === 'object' ? l.target.id : l.target;
    return nodeIds.has(sid) && nodeIds.has(tid);
  });

  graphData = { nodes: filteredNodes, links: filteredLinks };
  pushData();
}

export function resetFilter() {
  if (!fullData) return;
  graphData = { nodes: fullData.nodes, links: fullData.links };
  fullData = null;
  pushData();
}

// ── Helpers ───────────────────────────────────────────────

function pushData() {
  if (!Graph) return;
  Graph.graphData({ nodes: graphData.nodes, links: graphData.links });
}

function triggerRefresh() {
  if (!Graph) return;
  // Trigger visual refresh without rebuilding the graph
  Graph.nodeColor(Graph.nodeColor());
  Graph.linkColor(Graph.linkColor());
  Graph.linkWidth(Graph.linkWidth());
}

// ── Focus camera on a node ───────────────────────────────

export function focusNode(node) {
  if (!Graph || !node) return;
  const distance = 120;
  const pos = node;
  Graph.cameraPosition(
    { x: pos.x + distance, y: pos.y + distance * 0.3, z: pos.z + distance },
    { x: pos.x, y: pos.y, z: pos.z },
    1200
  );
}
