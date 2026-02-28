import { getDb } from './database.js';

const ENTITY_COLORS = {
  person: '#76c7ff',
  organization: '#9ab3ff',
  project: '#64f1b4',
  concept: '#d4a6ff',
  location: '#ffc36f'
};

const MEMORY_COLORS = {
  fact: '#86a8c8',
  commitment: '#ff6f7d',
  learning: '#54f2b6',
  observation: '#7fd8ff',
  preference: '#ffd166',
  pattern: '#c89bff'
};

export function getTableColumns(db, table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
  } catch {
    return new Set();
  }
}

export function getSchemaInfo(db = getDb()) {
  return {
    db,
    entityColumns: getTableColumns(db, 'entities'),
    memoryColumns: getTableColumns(db, 'memories'),
    relationshipColumns: getTableColumns(db, 'relationships'),
    patternColumns: getTableColumns(db, 'patterns')
  };
}

export function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toIso(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : null;
}

export function daysSince(value) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return (Date.now() - parsed.getTime()) / 86400000;
}

export function daysUntil(value) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return (parsed.getTime() - Date.now()) / 86400000;
}

export function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function freshnessScore(value) {
  const age = daysSince(value);
  if (age === null) return 0.25;
  if (age <= 1) return 1;
  if (age <= 7) return 0.88;
  if (age <= 14) return 0.74;
  if (age <= 30) return 0.58;
  if (age <= 90) return 0.34;
  return 0.14;
}

export function urgencyScore({ deadlineAt, importance = 0, overdue = false, type = null }) {
  if (overdue) return 1;
  if (!deadlineAt) {
    if (type === 'commitment') return clamp01(importance * 0.65);
    return 0;
  }

  const until = daysUntil(deadlineAt);
  if (until === null) return clamp01(importance * 0.5);
  if (until <= 0) return 1;
  if (until <= 1) return 0.95;
  if (until <= 3) return 0.82;
  if (until <= 7) return 0.67;
  if (until <= 14) return 0.48;
  return clamp01(importance * 0.4);
}

export function entityStatus(entity) {
  const age = daysSince(entity.last_contact_at || entity.updated_at || entity.created_at);
  if (entity.contact_trend === 'cooling') return 'cooling';
  if (age !== null && age > 45) return 'stale';
  return 'active';
}

export function memoryStatus(memory, overdue) {
  if (memory.invalidated_at) return 'inactive';
  if (overdue) return 'overdue';
  if (memory.type === 'commitment' && memory.deadline_at) return 'scheduled';
  if (memory.verification_status === 'verified') return 'verified';
  return 'active';
}

export function patternStatus(pattern) {
  return pattern.is_active === 0 ? 'inactive' : 'active';
}

export function makeGraphId(kind, dbId) {
  return `${kind}-${dbId}`;
}

export function entityTone(subtype) {
  return ENTITY_COLORS[subtype] || '#8ba2c3';
}

export function memoryTone(subtype) {
  return MEMORY_COLORS[subtype] || '#8ba2c3';
}

export function normalizeEntityNode(entity, extras = {}) {
  const importance = Number(entity.importance ?? 0.5);
  const activityAt = entity.last_contact_at || extras.lastMemoryAt || entity.updated_at || entity.created_at;
  const freshness = freshnessScore(activityAt);
  const graphId = makeGraphId('entity', entity.id);
  const signal = clamp01(
    extras.signalScore ??
    importance * 0.6 +
    Math.min((extras.memoryCount || 0) / 30, 0.18) +
    Math.min((extras.relationshipCount || 0) / 20, 0.22)
  );

  return {
    id: graphId,
    kind: 'entity',
    subtype: entity.type,
    label: entity.name,
    importance: round(importance),
    signalScore: round(signal),
    freshnessScore: round(freshness),
    urgencyScore: 0,
    clusterKey: extras.clusterKey || `entity:${entity.type}`,
    status: entityStatus(entity),
    entityRefs: [entity.id],
    timestamps: {
      createdAt: toIso(entity.created_at),
      updatedAt: toIso(entity.updated_at),
      activityAt: toIso(activityAt),
      lastContactAt: toIso(entity.last_contact_at)
    },
    description: entity.description || '',
    relationshipCount: extras.relationshipCount || 0,
    memoryCount: extras.memoryCount || 0,
    anchorRef: extras.anchorRef || graphId,
    layout: {
      band: extras.band || 'core',
      seedX: round(extras.seedX ?? extras.x ?? 0, 2),
      seedY: round(extras.seedY ?? extras.y ?? 0, 2),
      seedZ: round(extras.seedZ ?? extras.z ?? 0, 2)
    },
    color: entityTone(entity.type),
    size: round(extras.size ?? (7 + signal * 11 + freshness * 2), 2),
    x: extras.x ?? 0,
    y: extras.y ?? 0,
    z: extras.z ?? 0,
    zIndex: extras.zIndex ?? 1
  };
}

export function normalizeMemoryNode(memory, extras = {}) {
  const importance = Number(memory.importance ?? 0.4);
  const overdue = Boolean(
    extras.overdue ??
    (memory.type === 'commitment' && memory.deadline_at && !memory.invalidated_at && parseDate(memory.deadline_at)?.getTime() < Date.now())
  );
  const urgency = urgencyScore({
    deadlineAt: memory.deadline_at,
    importance,
    overdue,
    type: memory.type
  });
  const freshness = freshnessScore(memory.last_accessed_at || memory.updated_at || memory.created_at);

  return {
    id: makeGraphId('memory', memory.id),
    kind: memory.type === 'commitment' ? 'commitment' : 'memory',
    subtype: memory.type,
    label: extras.label || truncate(memory.content || '', 96),
    importance: round(importance),
    signalScore: round(clamp01(extras.signalScore ?? importance * 0.7 + freshness * 0.2 + urgency * 0.1)),
    freshnessScore: round(freshness),
    urgencyScore: round(urgency),
    clusterKey: extras.clusterKey || `${memory.type === 'commitment' ? 'commitment' : 'memory'}:${memory.type}`,
    status: extras.status || memoryStatus(memory, overdue),
    entityRefs: extras.entityRefs || [],
    timestamps: {
      createdAt: toIso(memory.created_at),
      updatedAt: toIso(memory.updated_at),
      activityAt: toIso(memory.last_accessed_at || memory.updated_at || memory.created_at),
      deadlineAt: toIso(memory.deadline_at)
    },
    description: memory.content || '',
    verificationStatus: memory.verification_status || 'pending',
    accessCount: memory.access_count || 0,
    anchorRef: extras.anchorRef || (extras.primaryEntityId ? makeGraphId('entity', extras.primaryEntityId) : null),
    layout: {
      band: extras.band || (memory.type === 'commitment' ? 'commitment' : 'memory'),
      seedX: round(extras.seedX ?? extras.x ?? 0, 2),
      seedY: round(extras.seedY ?? extras.y ?? 0, 2),
      seedZ: round(extras.seedZ ?? extras.z ?? 0, 2)
    },
    color: memoryTone(memory.type),
    size: round(extras.size ?? (memory.type === 'commitment' ? 5.5 + urgency * 6 : 3.2 + importance * 4.2), 2),
    x: extras.x ?? 0,
    y: extras.y ?? 0,
    z: extras.z ?? 0,
    zIndex: extras.zIndex ?? 2
  };
}

export function normalizePatternNode(pattern, extras = {}) {
  const importance = Number(pattern.confidence ?? 0.5);
  const freshness = freshnessScore(pattern.last_observed_at || pattern.first_observed_at);
  const signal = clamp01(extras.signalScore ?? importance * 0.68 + freshness * 0.14 + Math.min((pattern.occurrences || 0) / 12, 0.18));

  return {
    id: makeGraphId('pattern', pattern.id),
    kind: 'pattern',
    subtype: pattern.pattern_type,
    label: pattern.name,
    importance: round(importance),
    signalScore: round(signal),
    freshnessScore: round(freshness),
    urgencyScore: 0,
    clusterKey: extras.clusterKey || `pattern:${pattern.pattern_type}`,
    status: patternStatus(pattern),
    entityRefs: extras.entityRefs || [],
    timestamps: {
      createdAt: toIso(pattern.first_observed_at),
      updatedAt: toIso(pattern.last_observed_at),
      activityAt: toIso(pattern.last_observed_at || pattern.first_observed_at)
    },
    description: pattern.description || '',
    occurrences: pattern.occurrences || 0,
    anchorRef: extras.anchorRef || (extras.entityRefs?.[0] ? makeGraphId('entity', extras.entityRefs[0]) : null),
    layout: {
      band: extras.band || 'pattern',
      seedX: round(extras.seedX ?? extras.x ?? 0, 2),
      seedY: round(extras.seedY ?? extras.y ?? 0, 2),
      seedZ: round(extras.seedZ ?? extras.z ?? 0, 2)
    },
    color: '#b593ff',
    size: round(extras.size ?? (6 + importance * 6), 2),
    x: extras.x ?? 0,
    y: extras.y ?? 0,
    z: extras.z ?? 0,
    zIndex: extras.zIndex ?? 1.5
  };
}

export function normalizeRelationshipEdge(relationship, extras = {}) {
  return {
    id: extras.id || makeGraphId('relationship', relationship.id),
    source: extras.source || makeGraphId('entity', relationship.source_entity_id),
    target: extras.target || makeGraphId('entity', relationship.target_entity_id),
    kind: extras.kind || 'relationship',
    channel: extras.channel || (extras.status === 'trace' ? 'trace' : 'relationship'),
    strength: round(Number(relationship.strength ?? extras.strength ?? 0.5)),
    direction: relationship.direction || extras.direction || 'bidirectional',
    evidenceCount: extras.evidenceCount || 0,
    status: extras.status || (relationship.invalid_at ? 'historical' : 'active'),
    label: relationship.relationship_type || extras.label || '',
    timestamps: {
      createdAt: toIso(relationship.created_at),
      updatedAt: toIso(relationship.updated_at),
      validAt: toIso(relationship.valid_at),
      invalidAt: toIso(relationship.invalid_at)
    }
  };
}

export function normalizeEvidenceEdge({
  id,
  source,
  target,
  strength = 0.4,
  label = '',
  evidenceCount = 1,
  status = 'active',
  channel = null
}) {
  return {
    id,
    source,
    target,
    kind: 'evidence',
    channel: channel || (status === 'trace' ? 'trace' : label === 'commitment' ? 'commitment' : 'evidence'),
    strength: round(strength),
    direction: 'undirected',
    evidenceCount,
    status,
    label,
    timestamps: {}
  };
}

export function placeholders(ids) {
  return ids.map(() => '?').join(', ');
}

export function truncate(value, maxLength) {
  if (!value) return '';
  return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}...` : value;
}

export function applyPosition(node, position) {
  if (!position) return node;
  return {
    ...node,
    x: round(position.x, 2),
    y: round(position.y, 2),
    z: round(position.z ?? node.z ?? 0, 2),
    layout: {
      ...(node.layout || {}),
      seedX: round(position.x, 2),
      seedY: round(position.y, 2),
      seedZ: round(position.z ?? node.z ?? 0, 2)
    }
  };
}
