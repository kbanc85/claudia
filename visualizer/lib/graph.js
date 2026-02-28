/**
 * Graph builder -- transforms SQLite data into nodes + edges JSON for the
 * 3d-force-graph frontend.
 */

import { getDb } from './database.js';

function getTableColumns(db, table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
  } catch {
    return new Set();
  }
}

const NODE_COLORS = {
  person: '#fbbf24',
  organization: '#60a5fa',
  project: '#34d399',
  concept: '#c084fc',
  location: '#fb923c'
};

const MEMORY_COLORS = {
  fact: '#e2e8f0',
  commitment: '#f87171',
  learning: '#4ade80',
  observation: '#93c5fd',
  preference: '#fbbf24',
  pattern: '#a78bfa'
};

export function buildGraph({ includeHistorical = false } = {}) {
  const db = getDb();
  const nodes = [];
  const links = [];
  const nodeById = new Map();

  const entityColumns = getTableColumns(db, 'entities');
  const memoryColumns = getTableColumns(db, 'memories');
  const relationshipColumns = getTableColumns(db, 'relationships');

  const entitySelect = [
    'id',
    'name',
    'type',
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

  const entities = db.prepare(
    `SELECT ${entitySelect} FROM entities ORDER BY importance DESC, name ASC`
  ).all().filter((entity) => !entity.deleted_at);

  const entityStats = new Map();

  for (const entity of entities) {
    entityStats.set(entity.id, {
      relationshipCount: 0,
      relationshipStrength: 0,
      memoryCount: 0,
      lastMemoryAt: null
    });

    const metadata = safeJsonParse(entity.metadata);
    const daysSinceUpdate = daysSince(entity.updated_at);
    const node = {
      id: `entity-${entity.id}`,
      dbId: entity.id,
      nodeType: 'entity',
      entityType: entity.type,
      name: entity.name,
      description: entity.description,
      importance: numberOr(entity.importance, 0.5),
      color: NODE_COLORS[entity.type] || '#888888',
      size: Math.max(3.5, Math.sqrt(numberOr(entity.importance, 0.5)) * 7.5),
      opacity: getOpacity(numberOr(entity.importance, 0.5), daysSinceUpdate),
      createdAt: entity.created_at,
      updatedAt: entity.updated_at,
      activityAt: entity.last_contact_at || entity.updated_at || entity.created_at,
      lastContactAt: entity.last_contact_at,
      contactFrequencyDays: entity.contact_frequency_days,
      contactTrend: entity.contact_trend || 'steady',
      attentionTier: entity.attention_tier || 'standard',
      llmImproved: Boolean(metadata?.llm_improved),
      signalScore: numberOr(entity.importance, 0.5)
    };

    nodes.push(node);
    nodeById.set(node.id, node);
  }

  const memorySelect = [
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

  const memories = db.prepare(
    `SELECT ${memorySelect} FROM memories ORDER BY importance DESC, created_at DESC LIMIT 2500`
  ).all();

  const memoryStats = new Map();

  for (const memory of memories) {
    const metadata = safeJsonParse(memory.metadata);
    const activityAt = memory.last_accessed_at || memory.updated_at || memory.created_at;
    const daysSinceActivity = daysSince(activityAt);
    const overdue = Boolean(
      memory.type === 'commitment' &&
      memory.deadline_at &&
      !memory.invalidated_at &&
      parseDate(memory.deadline_at)?.getTime() < Date.now()
    );

    const node = {
      id: `memory-${memory.id}`,
      dbId: memory.id,
      nodeType: 'memory',
      memoryType: memory.type,
      name: truncate(memory.content, 84),
      content: memory.content,
      importance: numberOr(memory.importance, 0.4),
      confidence: numberOr(memory.confidence, 0.7),
      color: MEMORY_COLORS[memory.type] || '#888888',
      size: Math.max(1.3, numberOr(memory.importance, 0.35) * (overdue ? 5 : memory.type === 'commitment' ? 4.2 : 3.2)),
      opacity: getOpacity(numberOr(memory.importance, 0.35), daysSinceActivity),
      source: memory.source,
      sourceContext: memory.source_context,
      accessCount: memory.access_count,
      verificationStatus: memory.verification_status,
      createdAt: memory.created_at,
      updatedAt: memory.updated_at,
      activityAt,
      lastAccessed: memory.last_accessed_at,
      deadlineAt: memory.deadline_at,
      invalidatedAt: memory.invalidated_at,
      correctedAt: memory.corrected_at,
      llmImproved: Boolean(metadata?.llm_improved),
      overdue,
      entityIds: [],
      primaryEntityId: null,
      relatedEntityCount: 0,
      signalScore: numberOr(memory.importance, 0.35)
    };

    nodes.push(node);
    nodeById.set(node.id, node);
    memoryStats.set(memory.id, {
      entityIds: [],
      primaryEntityId: null,
      primaryImportance: -1
    });
  }

  const patterns = db.prepare(
    `
    SELECT id, name, description, pattern_type, occurrences, confidence,
           first_observed_at, last_observed_at, evidence
    FROM patterns
    WHERE is_active = 1
    ORDER BY confidence DESC, occurrences DESC
  `
  ).all();

  for (const pattern of patterns) {
    const node = {
      id: `pattern-${pattern.id}`,
      dbId: pattern.id,
      nodeType: 'pattern',
      patternType: pattern.pattern_type,
      name: pattern.name,
      description: pattern.description,
      importance: numberOr(pattern.confidence, 0.5),
      confidence: numberOr(pattern.confidence, 0.5),
      color: '#a78bfa',
      size: Math.max(4.5, numberOr(pattern.confidence, 0.5) * 12),
      opacity: Math.max(0.42, numberOr(pattern.confidence, 0.5)),
      createdAt: pattern.first_observed_at,
      updatedAt: pattern.last_observed_at,
      activityAt: pattern.last_observed_at || pattern.first_observed_at,
      occurrences: pattern.occurrences,
      evidence: safeJsonParse(pattern.evidence),
      signalScore: numberOr(pattern.confidence, 0.5)
    };

    nodes.push(node);
    nodeById.set(node.id, node);
  }

  const hasTemporalRelationships = relationshipColumns.has('invalid_at');
  const relationshipQuery = hasTemporalRelationships
    ? includeHistorical
      ? 'SELECT * FROM relationships ORDER BY strength DESC, updated_at DESC'
      : 'SELECT * FROM relationships WHERE invalid_at IS NULL ORDER BY strength DESC, updated_at DESC'
    : 'SELECT * FROM relationships ORDER BY strength DESC, updated_at DESC';

  const relationships = db.prepare(relationshipQuery).all();

  for (const relationship of relationships) {
    const sourceNode = nodeById.get(`entity-${relationship.source_entity_id}`);
    const targetNode = nodeById.get(`entity-${relationship.target_entity_id}`);
    if (!sourceNode || !targetNode) continue;

    const invalidAt = hasTemporalRelationships ? relationship.invalid_at : null;

    links.push({
      id: `rel-${relationship.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      linkType: 'relationship',
      label: relationship.relationship_type,
      strength: numberOr(relationship.strength, 0.5),
      direction: relationship.direction,
      color: invalidAt ? 'rgba(255,255,255,0.08)' : undefined,
      dashed: Boolean(invalidAt) || numberOr(relationship.strength, 0.5) < 0.28,
      width: Math.max(0.55, numberOr(relationship.strength, 0.5) * 3.2),
      validAt: hasTemporalRelationships ? relationship.valid_at : null,
      invalidAt,
      historical: Boolean(invalidAt)
    });

    const sourceStats = entityStats.get(relationship.source_entity_id);
    const targetStats = entityStats.get(relationship.target_entity_id);
    if (sourceStats) {
      sourceStats.relationshipCount += 1;
      sourceStats.relationshipStrength += numberOr(relationship.strength, 0.5);
    }
    if (targetStats) {
      targetStats.relationshipCount += 1;
      targetStats.relationshipStrength += numberOr(relationship.strength, 0.5);
    }
  }

  const memoryLinks = db.prepare(
    `
    SELECT me.memory_id, me.entity_id, me.relationship, e.importance AS entity_importance
    FROM memory_entities me
    JOIN memories m ON m.id = me.memory_id
    JOIN entities e ON e.id = me.entity_id
    ORDER BY m.importance DESC, e.importance DESC
    LIMIT 7000
  `
  ).all();

  for (const memoryLink of memoryLinks) {
    const memoryNode = nodeById.get(`memory-${memoryLink.memory_id}`);
    const entityNode = nodeById.get(`entity-${memoryLink.entity_id}`);
    if (!memoryNode || !entityNode) continue;

    links.push({
      id: `mem-${memoryLink.memory_id}-${memoryLink.entity_id}`,
      source: memoryNode.id,
      target: entityNode.id,
      linkType: 'memory_entity',
      label: memoryLink.relationship,
      width: 0.35,
      opacity: 0.42,
      dashed: false
    });

    const stats = entityStats.get(memoryLink.entity_id);
    if (stats) {
      stats.memoryCount += 1;
      stats.lastMemoryAt = mostRecent(stats.lastMemoryAt, memoryNode.activityAt || memoryNode.createdAt);
    }

    const memoryMetric = memoryStats.get(memoryLink.memory_id);
    if (memoryMetric) {
      memoryMetric.entityIds.push(entityNode.id);
      if (numberOr(memoryLink.entity_importance, 0) > memoryMetric.primaryImportance) {
        memoryMetric.primaryImportance = numberOr(memoryLink.entity_importance, 0);
        memoryMetric.primaryEntityId = entityNode.id;
      }
    }
  }

  const maxRelationshipCount = Math.max(...[...entityStats.values()].map((item) => item.relationshipCount), 1);
  const maxRelationshipStrength = Math.max(...[...entityStats.values()].map((item) => item.relationshipStrength), 1);
  const maxMemoryCount = Math.max(...[...entityStats.values()].map((item) => item.memoryCount), 1);

  for (const entity of entities) {
    const node = nodeById.get(`entity-${entity.id}`);
    const stats = entityStats.get(entity.id);
    if (!node || !stats) continue;

    const memoryFactor = stats.memoryCount / maxMemoryCount;
    const relationshipFactor = stats.relationshipCount / maxRelationshipCount;
    const strengthFactor = stats.relationshipStrength / maxRelationshipStrength;
    const signalScore = clamp01(
      numberOr(entity.importance, 0.5) * 0.55 +
      memoryFactor * 0.18 +
      relationshipFactor * 0.12 +
      strengthFactor * 0.15
    );

    node.memoryCount = stats.memoryCount;
    node.relationshipCount = stats.relationshipCount;
    node.relationshipStrength = roundTo(stats.relationshipStrength, 2);
    node.signalScore = roundTo(signalScore, 3);
    node.size = Math.max(3.5, Math.sqrt(numberOr(entity.importance, 0.5)) * 7.5 + stats.relationshipCount * 0.18 + stats.memoryCount * 0.08);
    node.activityAt = stats.lastMemoryAt || node.lastContactAt || node.updatedAt || node.createdAt;
    node.recentlyActive = (daysSince(node.activityAt) ?? 999) <= 10;
  }

  for (const memory of memories) {
    const node = nodeById.get(`memory-${memory.id}`);
    const stats = memoryStats.get(memory.id);
    if (!node || !stats) continue;

    node.entityIds = stats.entityIds;
    node.primaryEntityId = stats.primaryEntityId;
    node.relatedEntityCount = stats.entityIds.length;
    node.signalScore = roundTo(clamp01(numberOr(memory.importance, 0.35) * 0.7 + Math.min(stats.entityIds.length / 5, 0.3)), 3);
  }

  const meta = {
    totalEntities: entities.length,
    totalMemories: memories.length,
    totalRelationships: relationships.length,
    totalPatterns: patterns.length,
    timestamp: new Date().toISOString()
  };

  return { nodes, links, meta };
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysSince(value) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
}

function getOpacity(importance, daysSinceActivity) {
  if (importance > 0.8) return 1.0;
  if (daysSinceActivity === null) return Math.max(0.4, importance);
  if (daysSinceActivity > 120) return 0.12;
  if (daysSinceActivity > 45) return 0.28;
  if (daysSinceActivity > 21) return 0.46;
  return Math.max(0.34, importance);
}

function truncate(value, maxLength) {
  if (!value) return '';
  return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}...` : value;
}

function mostRecent(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return parseDate(a)?.getTime() >= parseDate(b)?.getTime() ? a : b;
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function roundTo(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
