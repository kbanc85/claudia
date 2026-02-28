import {
  buildNeighborhoodMemoryNode,
  buildInferredRelationships,
  loadGraphDataset,
  parseGraphId,
  relationshipPathCost
} from './graph-data.js';
import {
  makeGraphId,
  normalizeEvidenceEdge,
  normalizeRelationshipEdge
} from './graph-contract.js';

function toEntityGraphId(value) {
  const parsed = parseGraphId(value);
  if (!parsed || parsed.kind !== 'entity') {
    throw new Error('Trace endpoints must be entity graph ids');
  }
  return parsed.dbId;
}

function findShortestPath(dataset, startEntityId, endEntityId, maxDepth) {
  const frontier = [{
    entityId: startEntityId,
    cost: 0,
    depth: 0,
    nodePath: [startEntityId],
    edgePath: []
  }];
  const best = new Map([[startEntityId, 0]]);

  while (frontier.length) {
    frontier.sort((left, right) => left.cost - right.cost);
    const current = frontier.shift();

    if (current.entityId === endEntityId) {
      return current;
    }

    if (current.depth >= maxDepth) continue;

    const neighbors = dataset.adjacency.get(current.entityId) || [];
    for (const neighbor of neighbors) {
      const nextDepth = current.depth + 1;
      if (nextDepth > maxDepth) continue;

      const nextCost = current.cost + relationshipPathCost(neighbor.relationship);
      if ((best.get(neighbor.entityId) ?? Number.POSITIVE_INFINITY) <= nextCost) {
        continue;
      }

      best.set(neighbor.entityId, nextCost);
      frontier.push({
        entityId: neighbor.entityId,
        cost: nextCost,
        depth: nextDepth,
        nodePath: [...current.nodePath, neighbor.entityId],
        edgePath: [...current.edgePath, neighbor.relationship]
      });
    }
  }

  return null;
}

function inferredAdjacency(dataset) {
  const adjacency = new Map();
  const inferred = buildInferredRelationships(dataset);
  for (const relationship of inferred) {
    const add = (source, target) => {
      if (!adjacency.has(source)) adjacency.set(source, []);
      adjacency.get(source).push({
        entityId: target,
        relationship
      });
    };
    add(relationship.source_entity_id, relationship.target_entity_id);
    add(relationship.target_entity_id, relationship.source_entity_id);
  }
  return adjacency;
}

function sharedMemoriesForEdge(dataset, leftEntityId, rightEntityId) {
  const left = dataset.memoryIdSetsByEntity.get(leftEntityId) || new Set();
  const right = dataset.memoryIdSetsByEntity.get(rightEntityId) || new Set();
  const sharedIds = [...left].filter((memoryId) => right.has(memoryId));
  return sharedIds
    .map((memoryId) => dataset.memoryById.get(memoryId))
    .filter(Boolean)
    .sort((leftMemory, rightMemory) => Number(rightMemory.importance || 0) - Number(leftMemory.importance || 0))
    .slice(0, 2);
}

export async function buildTraceGraph({ from, to, maxDepth = 4 }) {
  const dataset = await loadGraphDataset();
  const fromEntityId = toEntityGraphId(from);
  const toEntityId = toEntityGraphId(to);
  const resolvedMaxDepth = Math.max(2, Math.min(8, Number(maxDepth || 4)));
  let result = findShortestPath(dataset, fromEntityId, toEntityId, resolvedMaxDepth);
  let usedInferred = false;

  if (!result) {
    const inferred = inferredAdjacency(dataset);
    const mergedAdjacency = new Map(dataset.adjacency);
    for (const [entityId, neighbors] of inferred.entries()) {
      mergedAdjacency.set(entityId, [...(mergedAdjacency.get(entityId) || []), ...neighbors]);
    }
    result = findShortestPath({ ...dataset, adjacency: mergedAdjacency }, fromEntityId, toEntityId, resolvedMaxDepth);
    usedInferred = Boolean(result);
  }

  if (!result) {
    return {
      meta: {
        mode: 'trace',
        generatedAt: new Date().toISOString(),
        from,
        to,
        maxDepth: resolvedMaxDepth,
        found: false,
        usedInferred: false
      },
      nodes: [],
      edges: [],
      path: [],
      evidence: []
    };
  }

  const entityIdSet = new Set(result.nodePath);
  const nodes = dataset.entityNodes.filter((node) => entityIdSet.has(node.entityRefs[0]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = result.edgePath.map((relationship) => normalizeRelationshipEdge(relationship, {
    status: 'trace',
    strength: Math.max(Number(relationship.strength || 0.5), 0.55)
  }));

  const evidence = [];
  const evidenceNodes = [];
  const addedMemoryIds = new Set();

  for (let index = 0; index < result.nodePath.length - 1; index++) {
    const leftEntityId = result.nodePath[index];
    const rightEntityId = result.nodePath[index + 1];
    const sharedMemories = sharedMemoriesForEdge(dataset, leftEntityId, rightEntityId);

    for (const memory of sharedMemories) {
      if (addedMemoryIds.has(memory.id)) continue;
      addedMemoryIds.add(memory.id);

      const context = dataset.memoryContextById.get(memory.id) || { entityRefs: [], primaryEntityId: leftEntityId, completed: false };
      const leftNode = nodeById.get(makeGraphId('entity', leftEntityId));
      const memoryNode = buildNeighborhoodMemoryNode(memory, context, leftNode, index, memory.type === 'commitment' ? 58 : 74);
      evidenceNodes.push(memoryNode);
      evidence.push({
        id: memoryNode.id,
        label: memoryNode.label,
        kind: memoryNode.kind,
        subtype: memoryNode.subtype,
        entityRefs: memoryNode.entityRefs
      });

      edges.push(normalizeEvidenceEdge({
        id: `trace-evidence-${memory.id}-${leftEntityId}`,
        source: makeGraphId('memory', memory.id),
        target: makeGraphId('entity', leftEntityId),
        strength: memory.type === 'commitment' ? 0.7 : 0.38,
        label: memory.type,
        evidenceCount: 1,
        status: 'trace'
      }));
      edges.push(normalizeEvidenceEdge({
        id: `trace-evidence-${memory.id}-${rightEntityId}`,
        source: makeGraphId('memory', memory.id),
        target: makeGraphId('entity', rightEntityId),
        strength: memory.type === 'commitment' ? 0.7 : 0.38,
        label: memory.type,
        evidenceCount: 1,
        status: 'trace'
      }));
    }
  }

  nodes.push(...evidenceNodes);

  return {
    meta: {
      mode: 'trace',
      generatedAt: new Date().toISOString(),
      from,
      to,
      maxDepth: resolvedMaxDepth,
      found: true,
      usedInferred,
      hopCount: result.edgePath.length,
      aggregateWeight: result.edgePath.reduce((total, relationship) => total + Number(relationship.strength || 0), 0)
    },
    nodes,
    edges,
    path: result.nodePath.map((entityId) => makeGraphId('entity', entityId)),
    evidence
  };
}
