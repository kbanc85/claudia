import { loadGraphDataset } from './graph-data.js';
import { makeGraphId, truncate } from './graph-contract.js';

function scoreText(text, query) {
  const normalizedText = String(text || '').toLowerCase();
  const normalizedQuery = String(query || '').toLowerCase();
  if (!normalizedText || !normalizedQuery) return 0;
  if (normalizedText === normalizedQuery) return 1;
  if (normalizedText.startsWith(normalizedQuery)) return 0.88;
  if (normalizedText.includes(normalizedQuery)) return 0.68;
  return 0;
}

function resultRow(base, extra = {}) {
  return {
    ...base,
    ...extra
  };
}

function priorityFor(row) {
  if (row.kind === 'entity') {
    if (row.subtype === 'person') return 4;
    if (row.subtype === 'organization') return 3;
    if (row.subtype === 'project') return 2;
    return 1;
  }
  if (row.kind === 'pattern') return 0;
  if (row.kind === 'commitment') return -1;
  if (row.kind === 'memory') return -2;
  return -3;
}

export async function searchGraph(query, limit = 20) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const resolvedLimit = Math.max(1, Math.min(50, Number(limit || 20)));
  if (!normalizedQuery) {
    return {
      query: '',
      results: []
    };
  }

  const dataset = await loadGraphDataset();
  const rows = [];

  for (const entity of dataset.entities) {
    const nameScore = scoreText(entity.name, normalizedQuery);
    const descriptionScore = scoreText(entity.description, normalizedQuery) * 0.55;
    const score = Math.max(nameScore, descriptionScore) + Number(entity.importance || 0) * 0.18;
    if (score <= 0) continue;
    rows.push(resultRow({
      id: makeGraphId('entity', entity.id),
      kind: 'entity',
      subtype: entity.type,
      label: entity.name,
      description: truncate(entity.description || '', 140),
      score
    }));
  }

  for (const memory of dataset.memories) {
    const contentScore = scoreText(memory.content, normalizedQuery);
    const sourceScore = scoreText(memory.source_context, normalizedQuery) * 0.35;
    const score = Math.max(contentScore, sourceScore) + Number(memory.importance || 0) * 0.15;
    if (score <= 0) continue;
    const context = dataset.memoryContextById.get(memory.id);
    rows.push(resultRow({
      id: makeGraphId('memory', memory.id),
      kind: memory.type === 'commitment' ? 'commitment' : 'memory',
      subtype: memory.type,
      label: truncate(memory.content || '', 120),
      description: truncate(memory.source_context || memory.source || '', 140),
      score
    }, {
      entityRefs: context?.entityRefs || []
    }));
  }

  for (const pattern of dataset.patterns) {
    const nameScore = scoreText(pattern.name, normalizedQuery);
    const descriptionScore = scoreText(pattern.description, normalizedQuery) * 0.6;
    const score = Math.max(nameScore, descriptionScore) + Number(pattern.confidence || 0) * 0.14;
    if (score <= 0) continue;
    rows.push(resultRow({
      id: makeGraphId('pattern', pattern.id),
      kind: 'pattern',
      subtype: pattern.pattern_type,
      label: pattern.name,
      description: truncate(pattern.description || '', 140),
      score
    }, {
      entityRefs: dataset.patternContextById.get(pattern.id)?.entityRefs || []
    }));
  }

  rows.sort((left, right) => {
    const priorityDelta = priorityFor(right) - priorityFor(left);
    if (priorityDelta !== 0) return priorityDelta;
    return right.score - left.score;
  });

  return {
    query,
    results: rows.slice(0, resolvedLimit).map((row) => ({
      ...row,
      score: Number(row.score.toFixed(3))
    }))
  };
}
