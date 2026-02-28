/**
 * Insights builder -- derives useful exploration signals from Claudia's DB.
 *
 * The visualizer uses this to surface real hotspots in the local memory store:
 * who is central, what is urgent, which relationships are cooling, and what
 * patterns are currently active.
 */

import { getDb } from './database.js';

function getTableColumns(db, table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
  } catch {
    return new Set();
  }
}

function dateToIso(value) {
  if (!value) return null;
  const normalized = String(value).replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function daysSince(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
}

function getPriorityBucket(item) {
  if (item.overdue) return 'Overdue';
  if (item.deadlineAt) return 'Scheduled';
  return 'Tracked';
}

export function buildInsights() {
  const db = getDb();
  const entityColumns = getTableColumns(db, 'entities');
  const memoryColumns = getTableColumns(db, 'memories');
  const relationshipColumns = getTableColumns(db, 'relationships');

  const hasTemporalRelationships = relationshipColumns.has('invalid_at');
  const hasEntityContactFields =
    entityColumns.has('last_contact_at') &&
    entityColumns.has('contact_frequency_days') &&
    entityColumns.has('contact_trend') &&
    entityColumns.has('attention_tier');
  const hasMemoryDeadline = memoryColumns.has('deadline_at');
  const hasMemoryInvalidated = memoryColumns.has('invalidated_at');
  const hasVerification = memoryColumns.has('verification_status');

  const relationshipWhere = hasTemporalRelationships ? 'WHERE invalid_at IS NULL' : '';
  const invalidatedFilter = hasMemoryInvalidated ? 'AND m.invalidated_at IS NULL' : '';

  const count = (query, fallback = 0) => {
    try {
      return db.prepare(query).get()?.c ?? fallback;
    } catch {
      return fallback;
    }
  };

  const summary = {
    entities: count('SELECT COUNT(*) AS c FROM entities'),
    memories: count('SELECT COUNT(*) AS c FROM memories'),
    relationships: count(
      hasTemporalRelationships
        ? 'SELECT COUNT(*) AS c FROM relationships WHERE invalid_at IS NULL'
        : 'SELECT COUNT(*) AS c FROM relationships'
    ),
    patterns: count('SELECT COUNT(*) AS c FROM patterns WHERE is_active = 1'),
    predictions: count('SELECT COUNT(*) AS c FROM predictions WHERE is_shown = 0'),
    commitments: count(
      `SELECT COUNT(*) AS c FROM memories m WHERE m.type = 'commitment' ${invalidatedFilter}`
    ),
    overdueCommitments: hasMemoryDeadline
      ? count(
          `SELECT COUNT(*) AS c
           FROM memories m
           WHERE m.type = 'commitment'
             ${invalidatedFilter}
             AND m.deadline_at IS NOT NULL
             AND datetime(m.deadline_at) < datetime('now')`
        )
      : 0,
    recentActivity: count(
      `SELECT COUNT(*) AS c
       FROM memories
       WHERE datetime(created_at) > datetime('now', '-24 hours')`
    )
  };

  const topEntities = db.prepare(
    `
    WITH rels AS (
      SELECT source_entity_id AS entity_id, COUNT(*) AS relationship_count, SUM(strength) AS relationship_strength
      FROM relationships
      ${relationshipWhere}
      GROUP BY source_entity_id
      UNION ALL
      SELECT target_entity_id AS entity_id, COUNT(*) AS relationship_count, SUM(strength) AS relationship_strength
      FROM relationships
      ${relationshipWhere}
      GROUP BY target_entity_id
    ),
    rel_agg AS (
      SELECT entity_id,
             SUM(relationship_count) AS relationship_count,
             SUM(relationship_strength) AS relationship_strength
      FROM rels
      GROUP BY entity_id
    ),
    mem_agg AS (
      SELECT me.entity_id,
             COUNT(*) AS memory_count,
             MAX(m.created_at) AS last_memory_at
      FROM memory_entities me
      JOIN memories m ON m.id = me.memory_id
      GROUP BY me.entity_id
    )
    SELECT e.id, e.name, e.type, e.importance,
           ${entityColumns.has('last_contact_at') ? 'e.last_contact_at' : 'NULL AS last_contact_at'},
           ${entityColumns.has('contact_frequency_days') ? 'e.contact_frequency_days' : 'NULL AS contact_frequency_days'},
           ${entityColumns.has('contact_trend') ? 'e.contact_trend' : 'NULL AS contact_trend'},
           ${entityColumns.has('attention_tier') ? 'e.attention_tier' : "'standard' AS attention_tier"},
           COALESCE(rel_agg.relationship_count, 0) AS relationship_count,
           COALESCE(rel_agg.relationship_strength, 0) AS relationship_strength,
           COALESCE(mem_agg.memory_count, 0) AS memory_count,
           mem_agg.last_memory_at
    FROM entities e
    LEFT JOIN rel_agg ON rel_agg.entity_id = e.id
    LEFT JOIN mem_agg ON mem_agg.entity_id = e.id
    ORDER BY (
      COALESCE(e.importance, 0) * 4.5 +
      COALESCE(mem_agg.memory_count, 0) * 0.08 +
      COALESCE(rel_agg.relationship_strength, 0) * 1.1 +
      COALESCE(rel_agg.relationship_count, 0) * 0.18
    ) DESC,
    e.name ASC
    LIMIT 8
  `
  ).all().map((row) => ({
    id: row.id,
    graphId: `entity-${row.id}`,
    name: row.name,
    type: row.type,
    importance: row.importance,
    memoryCount: row.memory_count,
    relationshipCount: row.relationship_count,
    relationshipStrength: row.relationship_strength,
    lastMemoryAt: dateToIso(row.last_memory_at),
    lastContactAt: dateToIso(row.last_contact_at),
    contactTrend: row.contact_trend || 'steady',
    attentionTier: row.attention_tier || 'standard',
    focusLabel: `${row.memory_count} memories, ${row.relationship_count} links`
  }));

  const urgentCommitments = db.prepare(
    `
    SELECT m.id,
           m.content,
           m.importance,
           ${hasMemoryDeadline ? 'm.deadline_at' : 'NULL AS deadline_at'},
           ${hasVerification ? 'm.verification_status' : "'pending' AS verification_status"},
           m.created_at,
           GROUP_CONCAT(DISTINCT e.name) AS entities
    FROM memories m
    LEFT JOIN memory_entities me ON me.memory_id = m.id
    LEFT JOIN entities e ON e.id = me.entity_id
    WHERE m.type = 'commitment'
      ${invalidatedFilter}
    GROUP BY m.id
    ORDER BY
      CASE
        WHEN ${hasMemoryDeadline ? "m.deadline_at IS NOT NULL AND datetime(m.deadline_at) < datetime('now')" : '0'} THEN 0
        WHEN ${hasMemoryDeadline ? 'm.deadline_at IS NOT NULL' : '0'} THEN 1
        ELSE 2
      END,
      COALESCE(m.deadline_at, m.created_at) DESC,
      m.importance DESC
    LIMIT 8
  `
  ).all().map((row) => {
    const overdue = Boolean(
      row.deadline_at && new Date(String(row.deadline_at).replace(' ', 'T')).getTime() < Date.now()
    );
    return {
      id: row.id,
      graphId: `memory-${row.id}`,
      content: row.content,
      importance: row.importance,
      deadlineAt: dateToIso(row.deadline_at),
      createdAt: dateToIso(row.created_at),
      verificationStatus: row.verification_status,
      overdue,
      priorityBucket: getPriorityBucket({ overdue, deadlineAt: row.deadline_at }),
      entityNames: row.entities ? String(row.entities).split(',') : []
    };
  });

  const activePatterns = db.prepare(
    `
    SELECT id, name, description, pattern_type, occurrences, confidence, last_observed_at
    FROM patterns
    WHERE is_active = 1
    ORDER BY confidence DESC, occurrences DESC, last_observed_at DESC
    LIMIT 6
  `
  ).all().map((row) => ({
    id: row.id,
    graphId: `pattern-${row.id}`,
    name: row.name,
    description: row.description,
    patternType: row.pattern_type,
    occurrences: row.occurrences,
    confidence: row.confidence,
    lastObservedAt: dateToIso(row.last_observed_at)
  }));

  const recentMemories = db.prepare(
    `
    SELECT m.id, m.content, m.type, m.importance, m.created_at,
           GROUP_CONCAT(DISTINCT e.name) AS entities
    FROM memories m
    LEFT JOIN memory_entities me ON me.memory_id = m.id
    LEFT JOIN entities e ON e.id = me.entity_id
    WHERE 1 = 1
      ${invalidatedFilter}
    GROUP BY m.id
    ORDER BY datetime(m.created_at) DESC, m.importance DESC
    LIMIT 8
  `
  ).all().map((row) => ({
    id: row.id,
    graphId: `memory-${row.id}`,
    content: row.content,
    type: row.type,
    importance: row.importance,
    createdAt: dateToIso(row.created_at),
    entityNames: row.entities ? String(row.entities).split(',') : []
  }));

  const coolingRelationships = hasEntityContactFields
    ? db.prepare(
        `
        SELECT id, name, type, importance, last_contact_at, contact_frequency_days, contact_trend, attention_tier
        FROM entities
        WHERE last_contact_at IS NOT NULL
        ORDER BY
          CASE WHEN contact_trend = 'cooling' THEN 0 ELSE 1 END,
          (julianday('now') - julianday(last_contact_at)) DESC,
          importance DESC
        LIMIT 8
      `
      ).all()
        .map((row) => {
          const days = daysSince(row.last_contact_at);
          const target = row.contact_frequency_days ? Math.round(row.contact_frequency_days) : null;
          const isCooling =
            row.contact_trend === 'cooling' ||
            (days !== null && target !== null && days > target * 1.2);

          return {
            id: row.id,
            graphId: `entity-${row.id}`,
            name: row.name,
            type: row.type,
            importance: row.importance,
            lastContactAt: dateToIso(row.last_contact_at),
            daysSinceContact: days,
            targetFrequencyDays: target,
            contactTrend: row.contact_trend || 'steady',
            attentionTier: row.attention_tier || 'standard',
            cooling: isCooling
          };
        })
        .filter((row) => row.cooling)
        .slice(0, 6)
    : [];

  return {
    summary,
    topEntities,
    urgentCommitments,
    activePatterns,
    recentMemories,
    coolingRelationships,
    generatedAt: new Date().toISOString()
  };
}
