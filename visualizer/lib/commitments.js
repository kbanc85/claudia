import {
  activeCommitmentMemories,
  buildNeighborhoodMemoryNode,
  loadGraphDataset,
  normalizeCommitmentSortScore
} from './graph-data.js';
import { makeGraphId } from './graph-contract.js';

export async function getActiveCommitments({ entityId = null, limit = 20 } = {}) {
  const dataset = await loadGraphDataset();
  const resolvedLimit = Math.max(1, Math.min(100, Number(limit || 20)));
  const parsedEntityId = entityId ? Number(String(entityId).replace(/^entity-/, '')) : null;

  const candidates = activeCommitmentMemories(dataset.memories, dataset.memoryContextById)
    .filter((memory) => {
      if (!parsedEntityId) return true;
      const context = dataset.memoryContextById.get(memory.id);
      return context?.entityRefs?.includes(parsedEntityId);
    })
    .sort((left, right) => normalizeCommitmentSortScore(right) - normalizeCommitmentSortScore(left))
    .slice(0, resolvedLimit);

  const items = candidates.map((memory, index) => {
    const context = dataset.memoryContextById.get(memory.id) || { entityRefs: [], primaryEntityId: null, completed: false };
    const anchor = context.primaryEntityId
      ? dataset.entityNodeById.get(makeGraphId('entity', context.primaryEntityId))
      : null;
    return buildNeighborhoodMemoryNode(memory, context, anchor, index, 64);
  });

  return {
    items,
    meta: {
      generatedAt: new Date().toISOString(),
      entityId: parsedEntityId ? makeGraphId('entity', parsedEntityId) : null,
      count: items.length
    }
  };
}

