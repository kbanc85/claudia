/**
 * Graph builder — transforms SQLite data into nodes + edges JSON
 * for the 3d-force-graph frontend.
 */

import { getDb } from './database.js';

/** Detect which columns exist on a table. */
function getTableColumns(db, table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  } catch { return new Set(); }
}

function hasColumn(db, table, column) {
  return getTableColumns(db, table).has(column);
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

/**
 * Build the full graph from the database.
 * Returns { nodes: [...], links: [...], meta: {...} }
 */
export function buildGraph({ includeHistorical = false } = {}) {
  const db = getDb();
  const nodes = [];
  const links = [];

  // ── Entities → nodes ──────────────────────────────────────
  const entities = db.prepare(`
    SELECT id, name, type, description, importance, created_at, updated_at, metadata
    FROM entities
    ORDER BY importance DESC
  `).all();

  for (const e of entities) {
    const meta = safeJsonParse(e.metadata);
    const daysSinceUpdate = daysSince(e.updated_at);

    nodes.push({
      id: `entity-${e.id}`,
      dbId: e.id,
      nodeType: 'entity',
      entityType: e.type,
      name: e.name,
      description: e.description,
      importance: e.importance,
      color: NODE_COLORS[e.type] || '#888',
      size: Math.max(3, Math.sqrt(e.importance) * 8),
      opacity: getOpacity(e.importance, daysSinceUpdate),
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      llmImproved: meta?.llm_improved || false
    });
  }

  // ── Memories → nodes ──────────────────────────────────────
  const memCols = getTableColumns(db, 'memories');
  const hasVerification = memCols.has('verification_status');
  const hasSourceContext = memCols.has('source_context');
  const hasAccessCount = memCols.has('access_count');

  const memorySelect = [
    'id', 'content', 'type', 'importance', 'confidence', 'source',
    hasSourceContext ? 'source_context' : "NULL as source_context",
    'created_at', 'updated_at', 'last_accessed_at',
    hasAccessCount ? 'access_count' : '0 as access_count',
    hasVerification ? 'verification_status' : "'pending' as verification_status",
    'metadata'
  ].join(', ');

  const memories = db.prepare(`
    SELECT ${memorySelect}
    FROM memories
    ORDER BY importance DESC
    LIMIT 2000
  `).all();

  for (const m of memories) {
    const meta = safeJsonParse(m.metadata);
    const daysSinceAccess = daysSince(m.last_accessed_at || m.updated_at);

    nodes.push({
      id: `memory-${m.id}`,
      dbId: m.id,
      nodeType: 'memory',
      memoryType: m.type,
      name: truncate(m.content, 60),
      content: m.content,
      importance: m.importance,
      confidence: m.confidence,
      color: MEMORY_COLORS[m.type] || '#888',
      size: Math.max(1.5, m.importance * (m.type === 'commitment' ? 4 : 3)),
      opacity: getOpacity(m.importance, daysSinceAccess),
      source: m.source,
      sourceContext: m.source_context,
      accessCount: m.access_count,
      verificationStatus: m.verification_status,
      createdAt: m.created_at,
      lastAccessed: m.last_accessed_at,
      llmImproved: meta?.llm_improved || false
    });
  }

  // ── Patterns → nodes ──────────────────────────────────────
  const patterns = db.prepare(`
    SELECT id, name, description, pattern_type, occurrences, confidence,
           first_observed_at, last_observed_at, evidence
    FROM patterns
    WHERE is_active = 1
  `).all();

  for (const p of patterns) {
    nodes.push({
      id: `pattern-${p.id}`,
      dbId: p.id,
      nodeType: 'pattern',
      patternType: p.pattern_type,
      name: p.name,
      description: p.description,
      importance: p.confidence,
      confidence: p.confidence,
      color: '#a78bfa',
      size: Math.max(4, p.confidence * 10),
      opacity: Math.max(0.4, p.confidence),
      occurrences: p.occurrences,
      createdAt: p.first_observed_at,
      evidence: safeJsonParse(p.evidence)
    });
  }

  // ── Entity ↔ Entity relationships → links ────────────────
  const hasTemporal = hasColumn(db, 'relationships', 'invalid_at');
  let relQuery;
  if (hasTemporal) {
    relQuery = includeHistorical
      ? 'SELECT * FROM relationships ORDER BY strength DESC'
      : 'SELECT * FROM relationships WHERE invalid_at IS NULL ORDER BY strength DESC';
  } else {
    relQuery = 'SELECT * FROM relationships ORDER BY strength DESC';
  }

  const relationships = db.prepare(relQuery).all();

  for (const r of relationships) {
    const invalidAt = hasTemporal ? r.invalid_at : null;
    links.push({
      id: `rel-${r.id}`,
      source: `entity-${r.source_entity_id}`,
      target: `entity-${r.target_entity_id}`,
      linkType: 'relationship',
      label: r.relationship_type,
      strength: r.strength,
      direction: r.direction,
      color: invalidAt ? 'rgba(255,255,255,0.08)' : undefined,
      dashed: invalidAt !== null || r.strength < 0.3,
      width: Math.max(0.5, r.strength * 3),
      validAt: hasTemporal ? r.valid_at : null,
      invalidAt,
      historical: invalidAt !== null
    });
  }

  // ── Memory ↔ Entity links ────────────────────────────────
  const memoryLinks = db.prepare(`
    SELECT me.memory_id, me.entity_id, me.relationship
    FROM memory_entities me
    JOIN memories m ON m.id = me.memory_id
    ORDER BY m.importance DESC
    LIMIT 5000
  `).all();

  for (const ml of memoryLinks) {
    links.push({
      source: `memory-${ml.memory_id}`,
      target: `entity-${ml.entity_id}`,
      linkType: 'memory_entity',
      label: ml.relationship,
      width: 0.3,
      opacity: 0.4,
      dashed: false
    });
  }

  // ── Meta ──────────────────────────────────────────────────
  const meta = {
    totalEntities: entities.length,
    totalMemories: memories.length,
    totalRelationships: relationships.length,
    totalPatterns: patterns.length,
    timestamp: new Date().toISOString()
  };

  return { nodes, links, meta };
}

// ── Helpers ─────────────────────────────────────────────────

function safeJsonParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  const d = new Date(dateStr.replace(' ', 'T'));
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
}

function getOpacity(importance, daysSinceActivity) {
  if (importance > 0.7) return 1.0;
  if (daysSinceActivity > 90) return 0.15;
  if (daysSinceActivity > 30) return 0.4;
  return Math.max(0.3, importance);
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}
