import { getDb } from './database.js';
import { getProjectedPositions } from './projection.js';
import {
  applyPosition,
  clamp01,
  getSchemaInfo,
  makeGraphId,
  normalizeMemoryNode,
  normalizePatternNode,
  normalizeRelationshipEdge,
  normalizeEntityNode,
  parseDate,
  round,
  safeJsonParse
} from './graph-contract.js';

function buildEntitySelect(entityColumns) {
  return [
    'id',
    'name',
    'type',
    entityColumns.has('canonical_name') ? 'canonical_name' : 'name AS canonical_name',
    'description',
    'importance',
    'created_at',
    'updated_at',
    'metadata',
    entityColumns.has('last_contact_at') ? 'last_contact_at' : 'NULL AS last_contact_at',
    entityColumns.has('contact_frequency_days') ? 'contact_frequency_days' : 'NULL AS contact_frequency_days',
    entityColumns.has('contact_trend') ? 'contact_trend' : 'NULL AS contact_trend',
    entityColumns.has('attention_tier') ? 'attention_tier' : "'standard' AS attention_tier",
    entityColumns.has('deleted_at') ? 'deleted_at' : 'NULL AS deleted_at'
  ].join(', ');
}

function buildMemorySelect(memoryColumns) {
  return [
    'id',
    'content',
    'type',
    'importance',
    'confidence',
    'source',
    memoryColumns.has('source_context') ? 'source_context' : 'NULL AS source_context',
    'created_at',
    'updated_at',
    'last_accessed_at',
    memoryColumns.has('access_count') ? 'access_count' : '0 AS access_count',
    memoryColumns.has('verification_status') ? 'verification_status' : "'pending' AS verification_status",
    memoryColumns.has('deadline_at') ? 'deadline_at' : 'NULL AS deadline_at',
    memoryColumns.has('invalidated_at') ? 'invalidated_at' : 'NULL AS invalidated_at',
    memoryColumns.has('corrected_at') ? 'corrected_at' : 'NULL AS corrected_at',
    'metadata'
  ].join(', ');
}

function buildRelationshipQuery(relationshipColumns, includeHistorical) {
  const hasTemporalRelationships = relationshipColumns.has('invalid_at');
  if (!hasTemporalRelationships) {
    return 'SELECT * FROM relationships ORDER BY strength DESC, updated_at DESC';
  }
  if (includeHistorical) {
    return 'SELECT * FROM relationships ORDER BY strength DESC, updated_at DESC';
  }
  return 'SELECT * FROM relationships WHERE invalid_at IS NULL ORDER BY strength DESC, updated_at DESC';
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function fallbackEntityPosition(entity, index, total) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const angle = index * goldenAngle + (stableHash(entity.type) % 19) * 0.04;
  const radius = 44 + Math.sqrt(index + 1) * 52 + Math.min(Number(entity.importance || 0), 1) * 28 + total * 0.08;
  const typeBias = {
    person: { x: -18, y: 8 },
    organization: { x: 14, y: -12 },
    project: { x: 6, y: 18 },
    concept: { x: -10, y: -16 },
    location: { x: 20, y: 14 }
  }[entity.type] || { x: 0, y: 0 };
  return {
    x: Math.cos(angle) * radius + typeBias.x,
    y: Math.sin(angle) * radius + typeBias.y,
    z: ((stableHash(`entity:${entity.id}`) % 240) - 120) * 0.7 + Math.min(total, 180) * 0.04
  };
}

function averagePosition(points, fallback = { x: 0, y: 0, z: 0 }) {
  if (!points.length) return fallback;
  const total = points.reduce((acc, point) => {
    acc.x += point.x;
    acc.y += point.y;
    acc.z += point.z ?? 0;
    return acc;
  }, { x: 0, y: 0, z: 0 });
  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length
  };
}

function offsetPosition(base, seed, radius = 32) {
  const angle = ((stableHash(seed) % 360) * Math.PI) / 180;
  const distance = radius + (stableHash(`${seed}:distance`) % 28);
  const depth = ((stableHash(`${seed}:z`) % 140) - 70) * 0.8;
  return {
    x: base.x + Math.cos(angle) * distance,
    y: base.y + Math.sin(angle) * distance,
    z: (base.z ?? 0) + depth
  };
}

function dedupe(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function inferCommitmentState(memory) {
  if (memory.invalidated_at) return 'inactive';
  if (/^\s*completed[:\s]/i.test(memory.content || '')) return 'completed';
  if (/^\s*sent[:\s]/i.test(memory.content || '')) return 'completed';
  if (/^\s*done[:\s]/i.test(memory.content || '')) return 'completed';
  return 'active';
}

function patternReferenceIds(pattern, relationshipById) {
  const refs = new Set();
  const metadata = safeJsonParse(pattern.metadata);
  const evidence = safeJsonParse(pattern.evidence);
  const relationshipMatch = String(pattern.name || '').match(/relationship_(\d+)/i);

  if (relationshipMatch) {
    const relationship = relationshipById.get(Number(relationshipMatch[1]));
    if (relationship) {
      refs.add(relationship.source_entity_id);
      refs.add(relationship.target_entity_id);
    }
  }

  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value).forEach(([key, nested]) => {
        if ((key === 'entityId' || key === 'entity_id') && Number.isFinite(Number(nested))) {
          refs.add(Number(nested));
        } else {
          visit(nested);
        }
      });
      return;
    }
    const text = String(value);
    const matches = text.match(/\bentity[_ -]?id[:= ]?(\d+)\b/ig) || [];
    for (const match of matches) {
      const digits = match.match(/(\d+)/);
      if (digits) refs.add(Number(digits[1]));
    }
  };

  visit(metadata);
  visit(evidence);
  return [...refs];
}

function buildEntityStats(entities, relationships, memoryEntityRows) {
  const stats = new Map();
  for (const entity of entities) {
    stats.set(entity.id, {
      relationshipCount: 0,
      memoryCount: 0,
      totalRelationshipStrength: 0,
      lastMemoryAt: null
    });
  }

  for (const relationship of relationships) {
    const strength = Number(relationship.strength ?? 0.5);
    const source = stats.get(relationship.source_entity_id);
    const target = stats.get(relationship.target_entity_id);
    if (source) {
      source.relationshipCount += 1;
      source.totalRelationshipStrength += strength;
    }
    if (target) {
      target.relationshipCount += 1;
      target.totalRelationshipStrength += strength;
    }
  }

  for (const row of memoryEntityRows) {
    const stat = stats.get(row.entity_id);
    if (!stat) continue;
    stat.memoryCount += 1;
    if (!stat.lastMemoryAt || String(row.memory_created_at) > String(stat.lastMemoryAt)) {
      stat.lastMemoryAt = row.memory_created_at;
    }
  }

  return stats;
}

function resolvePrimaryEntityId(memory, linkRows, entityById) {
  if (!linkRows.length) return null;
  const ranked = [...linkRows].sort((left, right) => {
    const leftEntity = entityById.get(left.entity_id);
    const rightEntity = entityById.get(right.entity_id);
    const relationshipBias = (value) => (value === 'about' ? 1 : value === 'mentions' ? 0.5 : 0);
    const leftScore = Number(leftEntity?.importance || 0) + relationshipBias(left.relationship);
    const rightScore = Number(rightEntity?.importance || 0) + relationshipBias(right.relationship);
    return rightScore - leftScore;
  });
  return ranked[0]?.entity_id ?? null;
}

function relateMemories(memoryEntityRows) {
  const rowsByMemory = new Map();
  const rowsByEntity = new Map();
  for (const row of memoryEntityRows) {
    if (!rowsByMemory.has(row.memory_id)) rowsByMemory.set(row.memory_id, []);
    if (!rowsByEntity.has(row.entity_id)) rowsByEntity.set(row.entity_id, []);
    rowsByMemory.get(row.memory_id).push(row);
    rowsByEntity.get(row.entity_id).push(row);
  }
  return { rowsByMemory, rowsByEntity };
}

function linkEntityAdjacency(relationships) {
  const adjacency = new Map();
  for (const relationship of relationships) {
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

function assignOverviewPatternPosition(entityRefIds, entityNodeById, pattern, index) {
  const anchorPoints = entityRefIds
    .map((entityId) => entityNodeById.get(makeGraphId('entity', entityId)))
    .filter(Boolean);

  if (anchorPoints.length) {
    return offsetPosition(averagePosition(anchorPoints), `${pattern.id}:${index}`, 42);
  }

  const angle = ((index * 43 + stableHash(pattern.name)) % 360) * (Math.PI / 180);
  const radius = 420 + (index % 7) * 28;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: -160 + (index % 9) * 28
  };
}

export function parseGraphId(graphId) {
  const match = String(graphId || '').match(/^([a-z]+)-(\d+)$/i);
  if (!match) return null;
  return {
    kind: match[1].toLowerCase(),
    dbId: Number(match[2])
  };
}

export async function loadGraphDataset({ includeHistorical = false } = {}) {
  const db = getDb();
  const schema = getSchemaInfo(db);

  const entities = db.prepare(
    `SELECT ${buildEntitySelect(schema.entityColumns)} FROM entities ORDER BY importance DESC, name ASC`
  ).all().filter((entity) => !entity.deleted_at);

  const hasInvalidatedAt = schema.memoryColumns.has('invalidated_at');
  const memories = db.prepare(
    `SELECT ${buildMemorySelect(schema.memoryColumns)} FROM memories${hasInvalidatedAt ? ' WHERE invalidated_at IS NULL' : ''} ORDER BY importance DESC, created_at DESC`
  ).all();

  const relationships = db.prepare(
    buildRelationshipQuery(schema.relationshipColumns, includeHistorical)
  ).all();

  const patterns = db.prepare(`
    SELECT id, name, description, pattern_type, occurrences, first_observed_at, last_observed_at,
           confidence, is_active, evidence, metadata
    FROM patterns
    WHERE is_active = 1
    ORDER BY confidence DESC, occurrences DESC, id ASC
  `).all();

  const memoryEntityRows = db.prepare(`
    SELECT me.memory_id, me.entity_id, me.relationship, m.created_at AS memory_created_at
    FROM memory_entities me
    JOIN memories m ON m.id = me.memory_id
  `).all();

  const positions = await getProjectedPositions().catch(() => null);
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const memoryById = new Map(memories.map((memory) => [memory.id, memory]));
  const relationshipById = new Map(relationships.map((relationship) => [relationship.id, relationship]));
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const entityStats = buildEntityStats(entities, relationships, memoryEntityRows);
  const { rowsByMemory, rowsByEntity } = relateMemories(memoryEntityRows);
  const adjacency = linkEntityAdjacency(relationships);
  const memoryIdSetsByEntity = new Map();

  for (const [entityId, rows] of rowsByEntity.entries()) {
    memoryIdSetsByEntity.set(entityId, new Set(rows.map((row) => row.memory_id)));
  }

  const entityNodes = [];
  const entityNodeById = new Map();

  entities.forEach((entity, index) => {
    const stats = entityStats.get(entity.id) || {};
    const projected = positions?.[makeGraphId('entity', entity.id)] || fallbackEntityPosition(entity, index, entities.length);
    const node = applyPosition(normalizeEntityNode(entity, {
      relationshipCount: stats.relationshipCount || 0,
      memoryCount: stats.memoryCount || 0,
      lastMemoryAt: stats.lastMemoryAt || null,
      anchorRef: makeGraphId('entity', entity.id),
      band: 'core',
      signalScore: clamp01(
        Number(entity.importance ?? 0.5) * 0.54 +
        Math.min((stats.relationshipCount || 0) / 12, 0.24) +
        Math.min((stats.memoryCount || 0) / 40, 0.18)
      )
    }), projected);
    entityNodes.push(node);
    entityNodeById.set(node.id, node);
  });

  const memoryContextById = new Map();
  for (const memory of memories) {
    const links = rowsByMemory.get(memory.id) || [];
    const entityRefs = dedupe(links.map((row) => row.entity_id));
    const primaryEntityId = resolvePrimaryEntityId(memory, links, entityById);
    const commitmentState = memory.type === 'commitment' ? inferCommitmentState(memory) : null;
    memoryContextById.set(memory.id, {
      entityRefs,
      primaryEntityId,
      completed: commitmentState === 'completed'
    });
  }

  const patternContextById = new Map();
  patterns.forEach((pattern, index) => {
    const entityRefs = patternReferenceIds(pattern, relationshipById);
    const projected = assignOverviewPatternPosition(entityRefs, entityNodeById, pattern, index);
    patternContextById.set(pattern.id, {
      entityRefs,
      position: projected
    });
  });

  return {
    db,
    schema,
    positions,
    entities,
    memories,
    relationships,
    patterns,
    entityById,
    memoryById,
    relationshipById,
    patternById,
    entityStats,
    rowsByMemory,
    rowsByEntity,
    adjacency,
    memoryIdSetsByEntity,
    entityNodes,
    entityNodeById,
    memoryContextById,
    patternContextById
  };
}

export function buildOverviewCommitmentNode(memory, context, entityNodeById, index) {
  const primaryEntityNode = context.primaryEntityId
    ? entityNodeById.get(makeGraphId('entity', context.primaryEntityId))
    : null;
  const anchor = primaryEntityNode
    ? offsetPosition({ x: primaryEntityNode.x, y: primaryEntityNode.y, z: primaryEntityNode.z }, `commitment:${memory.id}`, 58 + index * 2)
    : { x: 0, y: 0, z: 120 };
  anchor.z += 48;

  return applyPosition(normalizeMemoryNode(memory, {
    entityRefs: context.entityRefs,
    primaryEntityId: context.primaryEntityId,
    anchorRef: context.primaryEntityId ? makeGraphId('entity', context.primaryEntityId) : null,
    band: 'commitment',
    clusterKey: context.primaryEntityId ? `commitment:entity:${context.primaryEntityId}` : 'commitment:unassigned',
    status: context.completed ? 'completed' : undefined,
    size: 7.5 + clamp01(Number(memory.importance || 0.5)) * 5.5 + (context.completed ? -1.25 : 0.75),
    zIndex: 2.4
  }), anchor);
}

export function buildOverviewMemoryNode(memory, context, entityNodeById, index) {
  const primaryEntityNode = context.primaryEntityId
    ? entityNodeById.get(makeGraphId('entity', context.primaryEntityId))
    : null;
  const base = primaryEntityNode
    ? { x: primaryEntityNode.x, y: primaryEntityNode.y, z: primaryEntityNode.z }
    : { x: 0, y: 0, z: 0 };
  const radius = memory.type === 'commitment'
    ? 60 + (index % 6) * 5
    : 92 + (index % 8) * 6;
  const position = offsetPosition(base, `overview-memory:${memory.id}:${index}`, radius);
  position.z += memory.type === 'commitment' ? 44 : 16;

  return applyPosition(normalizeMemoryNode(memory, {
    entityRefs: context.entityRefs,
    primaryEntityId: context.primaryEntityId,
    anchorRef: context.primaryEntityId ? makeGraphId('entity', context.primaryEntityId) : null,
    band: memory.type === 'commitment' ? 'commitment' : 'memory',
    clusterKey: context.primaryEntityId
      ? `${memory.type === 'commitment' ? 'commitment' : 'memory'}:entity:${context.primaryEntityId}`
      : `${memory.type === 'commitment' ? 'commitment' : 'memory'}:unassigned`,
    status: context.completed ? 'completed' : undefined,
    size: memory.type === 'commitment'
      ? 6.8 + clamp01(Number(memory.importance || 0.5)) * 5.2
      : 3.2 + clamp01(Number(memory.importance || 0.4)) * 3.2,
    zIndex: memory.type === 'commitment' ? 2.35 : 2.05
  }), position);
}

export function buildNeighborhoodMemoryNode(memory, context, anchorNode, index, radius = 72) {
  const base = anchorNode
    ? { x: anchorNode.x, y: anchorNode.y, z: anchorNode.z }
    : { x: 0, y: 0, z: 0 };
  const position = offsetPosition(base, `${memory.id}:${index}`, radius);
  position.z += memory.type === 'commitment' ? 52 : 20;

  return applyPosition(normalizeMemoryNode(memory, {
    entityRefs: context.entityRefs,
    primaryEntityId: context.primaryEntityId,
    anchorRef: context.primaryEntityId ? makeGraphId('entity', context.primaryEntityId) : null,
    band: memory.type === 'commitment' ? 'commitment' : 'memory',
    clusterKey: context.primaryEntityId ? `memory:entity:${context.primaryEntityId}` : 'memory:unassigned',
    status: context.completed ? 'completed' : undefined,
    size: memory.type === 'commitment'
      ? 6.5 + clamp01(Number(memory.importance || 0.5)) * 5
      : 3.6 + clamp01(Number(memory.importance || 0.4)) * 3.8,
    zIndex: memory.type === 'commitment' ? 2.4 : 2.1
  }), position);
}

export function buildPatternNode(pattern, context, overrides = {}) {
  return applyPosition(normalizePatternNode(pattern, {
    entityRefs: context.entityRefs,
    anchorRef: context.entityRefs.length ? makeGraphId('entity', context.entityRefs[0]) : null,
    band: 'pattern',
    clusterKey: context.entityRefs.length ? `pattern:group:${context.entityRefs[0]}` : `pattern:${pattern.pattern_type}`,
    zIndex: 1.8,
    ...overrides
  }), context.position);
}

export function buildRelationshipNodeLookup(relationships) {
  const byPair = new Map();
  for (const relationship of relationships) {
    const key = [relationship.source_entity_id, relationship.target_entity_id].sort((left, right) => left - right).join(':');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(relationship);
  }
  return byPair;
}

export function commonEntityRelationshipEdges(relationships) {
  return relationships.map((relationship) => normalizeRelationshipEdge(relationship));
}

export function strongestRelationship(relationshipList) {
  if (!relationshipList?.length) return null;
  return [...relationshipList].sort((left, right) => Number(right.strength || 0) - Number(left.strength || 0))[0];
}

export function activeCommitmentMemories(memories, memoryContextById) {
  return memories.filter((memory) => {
    if (memory.type !== 'commitment') return false;
    const context = memoryContextById.get(memory.id);
    if (!context || context.completed) return false;
    return !memory.invalidated_at;
  });
}

export function normalizeCommitmentSortScore(memory) {
  const deadline = parseDate(memory.deadline_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  return (
    (memory.deadline_at ? 1 : 0) * 10000000000000 -
    deadline +
    Number(memory.importance || 0) * 1000
  );
}

export function relationshipPathCost(relationship) {
  const strength = clamp01(Number(relationship.strength ?? 0.5));
  return round(1.25 - strength * 0.9, 4);
}

function sharedMemoryCount(dataset, leftEntityId, rightEntityId) {
  const left = dataset.memoryIdSetsByEntity.get(leftEntityId) || new Set();
  const right = dataset.memoryIdSetsByEntity.get(rightEntityId) || new Set();
  let count = 0;
  for (const memoryId of left) {
    if (right.has(memoryId)) count += 1;
  }
  return count;
}

export function findHubEntityId(dataset) {
  // Hub = the entity with the most relationships (typically the database owner)
  const strongest = [...dataset.entityNodes]
    .sort((left, right) => (right.relationshipCount || 0) - (left.relationshipCount || 0))[0];
  return strongest ? Number(strongest.id.replace('entity-', '')) : null;
}

export function buildInferredRelationships(dataset, { minSharedMemories = 2, maxEdges = 48 } = {}) {
  const hubEntityId = findHubEntityId(dataset);
  const inferred = [];
  const seenPairs = new Set();

  for (const node of dataset.entityNodes) {
    const entityId = Number(node.id.replace('entity-', ''));
    if ((node.relationshipCount || 0) > 0) continue;

    const candidates = new Map();
    for (const row of dataset.rowsByEntity.get(entityId) || []) {
      for (const linked of dataset.rowsByMemory.get(row.memory_id) || []) {
        if (linked.entity_id === entityId) continue;
        const current = candidates.get(linked.entity_id) || 0;
        candidates.set(linked.entity_id, current + 1);
      }
    }

    const ranked = [...candidates.entries()]
      .filter(([, count]) => count >= minSharedMemories)
      .sort((left, right) => {
        if (hubEntityId && right[0] === hubEntityId) return 1;
        if (hubEntityId && left[0] === hubEntityId) return -1;
        return right[1] - left[1];
      });

    const best = ranked[0];
    if (!best) continue;

    const [targetEntityId, sharedCount] = best;
    const pairKey = [entityId, targetEntityId].sort((a, b) => a - b).join(':');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    inferred.push({
      id: `inferred-${entityId}-${targetEntityId}`,
      source_entity_id: entityId,
      target_entity_id: targetEntityId,
      relationship_type: 'shared_memory_context',
      direction: 'bidirectional',
      strength: round(clamp01(0.34 + Math.min(sharedCount / 8, 0.44)), 3),
      evidenceCount: sharedCount,
      inferred: true,
      created_at: null,
      updated_at: null,
      valid_at: null,
      invalid_at: null
    });

    if (inferred.length >= maxEdges) break;
  }

  return inferred;
}
