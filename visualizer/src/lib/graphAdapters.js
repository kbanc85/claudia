import { alpha, edgeTone, getTheme, nodeAccent, nodeTone } from './theme.js';

function nodeColorOverride(node, settings) {
  if (node.kind === 'entity') {
    if (node.subtype === 'person') return settings.personColor || null;
    if (node.subtype === 'organization') return settings.organizationColor || null;
    if (node.subtype === 'project') return settings.projectColor || null;
  }
  if (node.kind === 'memory') return settings.memoryColor || null;
  if (node.kind === 'commitment') return settings.commitmentColor || null;
  return null;
}

function timestampForNode(node) {
  return node?.timestamps?.activityAt || node?.timestamps?.updatedAt || node?.timestamps?.createdAt || null;
}

function nodePassesKindFilter(node, state) {
  const { activeFilters, renderSettings } = state;

  if (node.kind === 'entity') {
    return activeFilters.entities[node.subtype] !== false;
  }

  if (node.kind === 'pattern') {
    return renderSettings.showPatterns && activeFilters.patterns[node.subtype] !== false;
  }

  if (node.kind === 'commitment') {
    return renderSettings.showCommitments && activeFilters.memories[node.subtype] !== false;
  }

  return activeFilters.memories[node.subtype] !== false;
}

function computeTimelineRange(nodes) {
  const values = nodes
    .map(timestampForNode)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return { min: null, max: null };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function nodePassesTimeline(node, state, range) {
  if (!range.min || !range.max) return true;

  const essential = node.id === state.selectedNodeId
    || state.pinnedNodeIds.includes(node.id)
    || state.traceEndpoints.from === node.id
    || state.traceEndpoints.to === node.id;
  if (essential) return true;

  if (node.kind === 'entity' || node.kind === 'pattern') return true;

  const timestamp = timestampForNode(node);
  if (!timestamp) return true;

  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return true;

  const span = range.max - range.min;
  if (span <= 0) return true;

  const ratio = Number(state.timelineWindow ?? 100) / 100;
  const cutoff = range.max - span * ratio;
  return value >= cutoff;
}

function computeNodeSize(node, settings) {
  const base = Number(node.size || 5.5);
  const multiplier = node.kind === 'entity'
    ? settings.entitySize
    : node.kind === 'pattern'
      ? settings.patternSize * 0.64
      : settings.memorySize * (node.kind === 'commitment' ? 0.68 : 0.52);
  return Math.max(2.1, base * multiplier);
}

function computeEdgeSize(edge, settings) {
  const base = edge.channel === 'relationship'
    ? 2 + Number(edge.strength || 0.4) * 1.9
    : edge.channel === 'trace'
      ? 2.4 + Number(edge.strength || 0.6) * 1.8
      : edge.channel === 'commitment'
        ? 1.4 + Number(edge.strength || 0.5) * 1.1
        : 0.7 + Number(edge.strength || 0.3) * 0.7;
  return base * Number(settings.edgeIntensity || 1) * Number(settings.lineThickness || 1);
}

function classifyEdgeFamily(edge, sourceNode, targetNode) {
  if (edge.channel === 'relationship' || edge.channel === 'trace') return 'entity';
  if (sourceNode?.kind === 'pattern' || targetNode?.kind === 'pattern') return 'pattern';
  return 'memory';
}

function computeLabelBase(node, settings) {
  const mode = settings.labelMode || 'balanced';
  if (mode === 'dense') return true;
  if (mode === 'minimal') {
    return node.kind === 'entity' && Number(node.importance || 0) >= 0.82;
  }
  if (node.kind === 'entity' && Number(node.importance || 0) >= 0.72) return true;
  if (node.kind === 'commitment' && Number(node.urgencyScore || 0) >= 0.8) return true;
  return false;
}

function groupCounts(nodes) {
  const entityTypes = {};
  const memoryTypes = {};
  const patternTypes = {};

  for (const node of nodes) {
    if (node.kind === 'entity') {
      entityTypes[node.subtype] = (entityTypes[node.subtype] || 0) + 1;
    } else if (node.kind === 'pattern') {
      patternTypes[node.subtype] = (patternTypes[node.subtype] || 0) + 1;
    } else {
      memoryTypes[node.subtype] = (memoryTypes[node.subtype] || 0) + 1;
    }
  }

  return { entityTypes, memoryTypes, patternTypes };
}

export function mergeGraphData(baseGraph, overlayGraph) {
  const nodes = new Map();
  const edges = new Map();

  for (const graph of [baseGraph, overlayGraph].filter(Boolean)) {
    for (const node of graph.nodes || []) nodes.set(node.id, node);
    for (const edge of graph.edges || []) edges.set(edge.id, edge);
  }

  return {
    meta: overlayGraph?.meta || baseGraph?.meta || {},
    nodes: [...nodes.values()],
    edges: [...edges.values()]
  };
}

export function buildVisibleGraphData(graphData, state, themeId = 'claudia') {
  const theme = getTheme(themeId);
  const range = computeTimelineRange(graphData.nodes || []);
  const visibleNodes = new Map();
  const activeNodeIds = new Set([
    state.selectedNodeId,
    state.hoveredNodeId,
    state.traceEndpoints.from,
    state.traceEndpoints.to,
    ...state.pinnedNodeIds
  ].filter(Boolean));

  for (const node of graphData.nodes || []) {
    if (!nodePassesKindFilter(node, state)) continue;
    if (!nodePassesTimeline(node, state, range)) continue;

    const overrideColor = nodeColorOverride(node, state.renderSettings);
    const color = overrideColor || nodeTone(node, themeId);
    const accent = overrideColor || nodeAccent(node, themeId);
    const size = computeNodeSize(node, state.renderSettings);
    visibleNodes.set(node.id, {
      ...node,
      size,
      color,
      accent,
      baseLabelVisible: computeLabelBase(node, state.renderSettings) || activeNodeIds.has(node.id),
      labelText: node.label,
      x: Number(node.layout?.seedX ?? node.x ?? 0),
      y: Number(node.layout?.seedY ?? node.y ?? 0),
      z: Number(node.layout?.seedZ ?? node.z ?? 0)
    });
  }

  const visibleEdges = [];
  for (const edge of graphData.edges || []) {
    if (!visibleNodes.has(edge.source) || !visibleNodes.has(edge.target)) continue;
    const sourceNode = visibleNodes.get(edge.source);
    const targetNode = visibleNodes.get(edge.target);
    const baseColor = edgeTone(edge, themeId);
    const lineFamily = classifyEdgeFamily(edge, sourceNode, targetNode);
    const faded = (state.selectedNodeId || state.hoveredNodeId || state.graphMode === 'trace')
      && edge.status !== 'trace'
      && edge.source !== state.selectedNodeId
      && edge.target !== state.selectedNodeId
      && edge.source !== state.hoveredNodeId
      && edge.target !== state.hoveredNodeId;

    visibleEdges.push({
      ...edge,
      sourceNode,
      targetNode,
      lineFamily,
      size: computeEdgeSize(edge, state.renderSettings),
      color: faded ? alpha(theme.css['--text-muted'], 0.14 * Number(state.renderSettings.edgeOpacity || 1)) : baseColor
    });
  }

  const nodes = [...visibleNodes.values()];
  const counts = {
    totalNodes: nodes.length,
    totalEdges: visibleEdges.length,
    entities: nodes.filter((node) => node.kind === 'entity').length,
    memories: nodes.filter((node) => node.kind === 'memory').length,
    commitments: nodes.filter((node) => node.kind === 'commitment').length,
    patterns: nodes.filter((node) => node.kind === 'pattern').length,
    relationships: visibleEdges.filter((edge) => edge.channel === 'relationship').length
  };

  return {
    nodes,
    edges: visibleEdges,
    nodeMap: visibleNodes,
    counts,
    breakdown: groupCounts(nodes),
    timelineRange: {
      min: range.min ? new Date(range.min).toISOString() : null,
      max: range.max ? new Date(range.max).toISOString() : null
    }
  };
}

export function buildInteractionContext(graphData, state) {
  const selectedNodeId = state.selectedNodeId;
  const hoveredNodeId = state.hoveredNodeId;
  const selectedNeighbors = new Set();
  const hoveredNeighbors = new Set();
  const traceNodes = new Set(state.tracePath || []);
  const traceEdges = new Set();

  for (const edge of graphData.edges || []) {
    if (edge.status === 'trace' || edge.channel === 'trace') {
      traceEdges.add(edge.id);
      traceNodes.add(edge.source);
      traceNodes.add(edge.target);
    }
    if (edge.source === selectedNodeId) selectedNeighbors.add(edge.target);
    if (edge.target === selectedNodeId) selectedNeighbors.add(edge.source);
    if (edge.source === hoveredNodeId) hoveredNeighbors.add(edge.target);
    if (edge.target === hoveredNodeId) hoveredNeighbors.add(edge.source);
  }

  return {
    selectedNodeId,
    hoveredNodeId,
    pinnedNodeIds: new Set(state.pinnedNodeIds),
    selectedNeighbors,
    hoveredNeighbors,
    traceNodes,
    traceEdges,
    graphMode: state.graphMode,
    traceEmphasis: state.renderSettings.traceEmphasis
  };
}
