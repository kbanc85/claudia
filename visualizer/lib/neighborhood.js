import {
  buildNeighborhoodMemoryNode,
  buildPatternNode,
  loadGraphDataset,
  parseGraphId
} from './graph-data.js';
import {
  makeGraphId,
  normalizeEvidenceEdge,
  normalizeRelationshipEdge
} from './graph-contract.js';

function collectEntityNeighborhood(dataset, startEntityIds, depth) {
  const seen = new Set(startEntityIds);
  const queue = startEntityIds.map((entityId) => ({ entityId, depth: 0 }));

  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= depth) continue;
    const neighbors = dataset.adjacency.get(current.entityId) || [];
    for (const neighbor of neighbors) {
      if (seen.has(neighbor.entityId)) continue;
      seen.add(neighbor.entityId);
      queue.push({ entityId: neighbor.entityId, depth: current.depth + 1 });
    }
  }

  return [...seen];
}

function resolveFocus(dataset, graphId) {
  const parsed = parseGraphId(graphId);
  if (!parsed) {
    throw new Error(`Invalid graph id: ${graphId}`);
  }

  if (parsed.kind === 'entity') {
    const entity = dataset.entityById.get(parsed.dbId);
    if (!entity) throw new Error('Entity not found');
    return { focusKind: 'entity', entityIds: [parsed.dbId], centerId: makeGraphId('entity', parsed.dbId) };
  }

  if (parsed.kind === 'memory') {
    const memory = dataset.memoryById.get(parsed.dbId);
    if (!memory) throw new Error('Memory not found');
    const context = dataset.memoryContextById.get(parsed.dbId);
    const entityIds = context?.entityRefs || [];
    if (!entityIds.length) throw new Error('Memory has no linked entities');
    return { focusKind: memory.type === 'commitment' ? 'commitment' : 'memory', entityIds, centerId: makeGraphId('memory', parsed.dbId), focusMemoryId: parsed.dbId };
  }

  if (parsed.kind === 'pattern') {
    const pattern = dataset.patternById.get(parsed.dbId);
    if (!pattern) throw new Error('Pattern not found');
    const context = dataset.patternContextById.get(parsed.dbId);
    const entityIds = context?.entityRefs || [];
    if (!entityIds.length) throw new Error('Pattern has no linked entities');
    return { focusKind: 'pattern', entityIds, centerId: makeGraphId('pattern', parsed.dbId), focusPatternId: parsed.dbId };
  }

  throw new Error(`Unsupported graph kind: ${parsed.kind}`);
}

export async function buildNeighborhoodGraph(graphId, depth = 1) {
  const resolvedDepth = Math.max(1, Math.min(2, Number(depth || 1)));
  const dataset = await loadGraphDataset();
  const focus = resolveFocus(dataset, graphId);
  const entityIds = collectEntityNeighborhood(dataset, focus.entityIds, resolvedDepth);
  const entityIdSet = new Set(entityIds);

  const nodes = dataset.entityNodes.filter((node) => entityIdSet.has(node.entityRefs[0]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const normalizedEdges = dataset.relationships
    .filter((relationship) => entityIdSet.has(relationship.source_entity_id) && entityIdSet.has(relationship.target_entity_id))
    .map((relationship) => normalizeRelationshipEdge(relationship));

  const memoryRows = new Set();
  for (const entityId of entityIds) {
    for (const row of dataset.rowsByEntity.get(entityId) || []) {
      memoryRows.add(row.memory_id);
    }
  }

  const rankedMemories = [...memoryRows]
    .map((memoryId) => dataset.memoryById.get(memoryId))
    .filter(Boolean)
    .sort((left, right) => {
      const leftBoost = left.type === 'commitment' ? 0.35 : 0;
      const rightBoost = right.type === 'commitment' ? 0.35 : 0;
      return (Number(right.importance || 0) + rightBoost) - (Number(left.importance || 0) + leftBoost);
    })
    .slice(0, 60);

  const memoryNodes = rankedMemories.map((memory, index) => {
    const context = dataset.memoryContextById.get(memory.id) || { entityRefs: [], primaryEntityId: null, completed: false };
    const anchorNode = context.primaryEntityId
      ? nodeById.get(makeGraphId('entity', context.primaryEntityId))
      : nodes[0];
    return buildNeighborhoodMemoryNode(memory, context, anchorNode, index, memory.type === 'commitment' ? 76 : 110);
  });

  for (const memoryNode of memoryNodes) {
    nodes.push(memoryNode);
    nodeById.set(memoryNode.id, memoryNode);
  }

  const evidenceEdges = [];
  for (const memory of rankedMemories) {
    const context = dataset.memoryContextById.get(memory.id);
    if (!context?.entityRefs?.length) continue;
    for (const entityId of context.entityRefs.filter((entityId) => entityIdSet.has(entityId)).slice(0, 4)) {
      evidenceEdges.push(normalizeEvidenceEdge({
        id: `neighborhood-memory-${memory.id}-${entityId}`,
        source: makeGraphId('memory', memory.id),
        target: makeGraphId('entity', entityId),
        strength: memory.type === 'commitment' ? 0.72 : 0.34,
        label: memory.type,
        evidenceCount: 1,
        status: 'active'
      }));
    }
  }

  const patternNodes = dataset.patterns
    .filter((pattern) => {
      const context = dataset.patternContextById.get(pattern.id);
      return context?.entityRefs?.some((entityId) => entityIdSet.has(entityId));
    })
    .slice(0, 18)
    .map((pattern) => buildPatternNode(pattern, dataset.patternContextById.get(pattern.id)));

  for (const patternNode of patternNodes) {
    nodes.push(patternNode);
    nodeById.set(patternNode.id, patternNode);
  }

  const patternEdges = [];
  for (const pattern of dataset.patterns) {
    const context = dataset.patternContextById.get(pattern.id);
    if (!context?.entityRefs?.some((entityId) => entityIdSet.has(entityId))) continue;
    for (const entityId of context.entityRefs.filter((entityId) => entityIdSet.has(entityId)).slice(0, 3)) {
      patternEdges.push(normalizeEvidenceEdge({
        id: `neighborhood-pattern-${pattern.id}-${entityId}`,
        source: makeGraphId('pattern', pattern.id),
        target: makeGraphId('entity', entityId),
        strength: 0.42,
        label: pattern.pattern_type,
        evidenceCount: Math.max(1, Number(pattern.occurrences || 1)),
        status: 'active'
      }));
    }
  }

  return {
    meta: {
      mode: 'neighborhood',
      generatedAt: new Date().toISOString(),
      centerId: focus.centerId,
      focusKind: focus.focusKind,
      depth: resolvedDepth,
      counts: {
        entities: entityIds.length,
        memories: memoryNodes.length,
        patterns: patternNodes.length
      }
    },
    nodes,
    edges: [...normalizedEdges, ...evidenceEdges, ...patternEdges]
  };
}
