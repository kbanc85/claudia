import {
  activeCommitmentMemories,
  buildOverviewMemoryNode,
  buildOverviewCommitmentNode,
  buildInferredRelationships,
  buildPatternNode,
  commonEntityRelationshipEdges,
  loadGraphDataset,
  normalizeCommitmentSortScore
} from './graph-data.js';
import { normalizeEvidenceEdge, makeGraphId } from './graph-contract.js';

export async function buildOverviewGraph({ includeMemories = false } = {}) {
  const dataset = await loadGraphDataset();
  const entityNodes = dataset.entityNodes;
  const entityEdges = commonEntityRelationshipEdges(dataset.relationships);
  const inferredEdges = buildInferredRelationships(dataset).map((relationship) =>
    normalizeEvidenceEdge({
      id: relationship.id,
      source: makeGraphId('entity', relationship.source_entity_id),
      target: makeGraphId('entity', relationship.target_entity_id),
      strength: relationship.strength,
      label: 'inferred',
      evidenceCount: relationship.evidenceCount,
      status: 'active',
      channel: 'relationship'
    })
  );

  const patternNodes = dataset.patterns.map((pattern) =>
    buildPatternNode(pattern, dataset.patternContextById.get(pattern.id) || { entityRefs: [], position: { x: 0, y: 0 } })
  );

  const patternEdges = [];
  for (const pattern of dataset.patterns) {
    const context = dataset.patternContextById.get(pattern.id);
    if (!context?.entityRefs?.length) continue;
    for (const entityId of context.entityRefs.slice(0, 3)) {
      patternEdges.push(normalizeEvidenceEdge({
        id: `pattern-link-${pattern.id}-${entityId}`,
        source: makeGraphId('pattern', pattern.id),
        target: makeGraphId('entity', entityId),
        strength: 0.46 + Number(pattern.confidence || 0) * 0.28,
        label: pattern.pattern_type,
        evidenceCount: Math.max(1, Number(pattern.occurrences || 1)),
        status: 'active'
      }));
    }
  }

  const urgentCommitments = activeCommitmentMemories(dataset.memories, dataset.memoryContextById)
    .filter((memory) => memory.deadline_at || Number(memory.importance || 0) >= 0.58)
    .sort((left, right) => normalizeCommitmentSortScore(right) - normalizeCommitmentSortScore(left))
    .slice(0, 18);
  const overviewMemories = includeMemories
    ? dataset.memories
      .filter((memory) => {
        if (memory.type === 'commitment') {
          const context = dataset.memoryContextById.get(memory.id);
          return !memory.invalidated_at && !context?.completed;
        }
        return !memory.invalidated_at;
      })
      .sort((left, right) => Number(right.importance || 0) - Number(left.importance || 0))
    : urgentCommitments;

  const overviewMemoryNodes = overviewMemories.map((memory, index) => {
    const context = dataset.memoryContextById.get(memory.id) || { entityRefs: [], primaryEntityId: null, completed: false };
    if (includeMemories) {
      return buildOverviewMemoryNode(memory, context, dataset.entityNodeById, index);
    }
    return buildOverviewCommitmentNode(memory, context, dataset.entityNodeById, index);
  });

  const overviewMemoryEdges = [];
  for (const memory of overviewMemories) {
    const context = dataset.memoryContextById.get(memory.id);
    if (!context?.entityRefs?.length) continue;
    const anchorEntityId = context.primaryEntityId || context.entityRefs[0];
    overviewMemoryEdges.push(normalizeEvidenceEdge({
      id: `overview-memory-${memory.id}-${anchorEntityId}`,
      source: makeGraphId('memory', memory.id),
      target: makeGraphId('entity', anchorEntityId),
      strength: memory.type === 'commitment' ? 0.58 : 0.34,
      label: memory.type,
      evidenceCount: context.entityRefs.length,
      status: 'active'
    }));
  }

  return {
    meta: {
      mode: 'overview',
      generatedAt: new Date().toISOString(),
      counts: {
        entities: entityNodes.length,
        patterns: patternNodes.length,
        memories: overviewMemoryNodes.filter((node) => node.kind === 'memory').length,
        commitments: overviewMemoryNodes.filter((node) => node.kind === 'commitment').length,
        relationships: entityEdges.length + inferredEdges.length,
        inferredRelationships: inferredEdges.length,
        memoryOverlayEnabled: includeMemories
      }
    },
    nodes: [...entityNodes, ...patternNodes, ...overviewMemoryNodes],
    edges: [...entityEdges, ...inferredEdges, ...patternEdges, ...overviewMemoryEdges]
  };
}
