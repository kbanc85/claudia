/**
 * Recall service for Claudia CLI.
 * Port of memory-daemon/claudia_memory/services/recall.py.
 *
 * Handles semantic search and retrieval of memories, entities, and relationships.
 * Uses vector similarity (sqlite-vec) combined with FTS5, importance, and recency scoring.
 *
 * Functions that need embeddings are async; pure SQL queries are sync.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonicalName } from './extraction.js';
import { embed } from '../core/embeddings.js';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let _vec0Warned = false;

// ---------------------------------------------------------------------------
// Helper: safe row field access
// ---------------------------------------------------------------------------

/** Get a value from a row, returning fallback if key doesn't exist. */
function rowGet(row, key, fallback = null) {
  return row[key] !== undefined ? row[key] : fallback;
}

// ---------------------------------------------------------------------------
// Helper: scoring math
// ---------------------------------------------------------------------------

/** Compute recency score using exponential half-life decay. */
function recencyScore(createdAt, now, halfLifeDays) {
  const created = new Date(createdAt);
  const daysOld = (now - created) / (1000 * 60 * 60 * 24);
  const decay = Math.log(2) / halfLifeDays;
  return Math.exp(-decay * daysOld);
}

// ---------------------------------------------------------------------------
// Helper: format result objects
// ---------------------------------------------------------------------------

/** Convert a memory row + scores into a recall result with combined scoring. */
function rowToResult(row, vectorScore, ftsScore, now, config) {
  const importanceScore = row.importance;

  // Recency score (configurable half-life decay)
  const created = new Date(row.created_at);
  const daysOld = (now - created) / (1000 * 60 * 60 * 24);
  const rec = Math.exp(-daysOld / config.recency_half_life_days);

  // Combined weighted score (vector + FTS + importance + recency)
  let combinedScore =
    config.vector_weight * vectorScore +
    config.fts_weight * ftsScore +
    config.importance_weight * importanceScore +
    config.recency_weight * rec;

  // Sacred memory boost: +50% importance weight component
  const lifecycleTier = rowGet(row, 'lifecycle_tier');
  if (lifecycleTier === 'sacred') {
    combinedScore += config.importance_weight * 0.5;
  }

  // Parse entity names
  const entityNamesVal = rowGet(row, 'entity_names');
  const entities = entityNamesVal
    ? entityNamesVal.split(',').map(n => n.trim())
    : [];

  // Parse metadata
  const metadataVal = rowGet(row, 'metadata');
  let metadata = null;
  if (metadataVal) {
    try { metadata = JSON.parse(metadataVal); } catch { /* ignore */ }
  }

  return {
    id: row.id,
    content: row.content,
    type: row.type,
    score: combinedScore,
    importance: row.importance,
    created_at: row.created_at,
    entities,
    metadata,
    source: rowGet(row, 'source'),
    source_id: rowGet(row, 'source_id'),
    source_context: rowGet(row, 'source_context'),
    confidence: rowGet(row, 'confidence', 1.0),
    verification_status: rowGet(row, 'verification_status', 'pending'),
    origin_type: rowGet(row, 'origin_type', 'inferred'),
    source_channel: rowGet(row, 'source_channel'),
    lifecycle_tier: lifecycleTier,
    fact_id: rowGet(row, 'fact_id'),
  };
}

/** Convert a database row to a recall result without scoring.
 *  Used by temporal recall methods. */
function rowToSimpleResult(row) {
  const entityStr = rowGet(row, 'entity_names', '');
  let metadata = null;
  const metadataVal = rowGet(row, 'metadata');
  if (metadataVal) {
    try { metadata = JSON.parse(metadataVal); } catch { /* ignore */ }
  }

  return {
    id: row.id,
    content: row.content,
    type: row.type,
    score: row.importance,
    importance: row.importance,
    created_at: row.created_at,
    entities: entityStr ? entityStr.split(',').map(s => s.trim()) : [],
    metadata,
    source: rowGet(row, 'source'),
    source_id: rowGet(row, 'source_id'),
    source_context: rowGet(row, 'source_context'),
    confidence: rowGet(row, 'confidence', 1.0),
    verification_status: rowGet(row, 'verification_status', 'pending'),
    origin_type: rowGet(row, 'origin_type', 'inferred'),
    source_channel: rowGet(row, 'source_channel'),
    lifecycle_tier: rowGet(row, 'lifecycle_tier'),
    fact_id: rowGet(row, 'fact_id'),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers (pure SQL, synchronous)
// ---------------------------------------------------------------------------

/** Apply common filters to SQL query (mutates sqlParts and params). */
function applyFilters(db, sqlParts, params, {
  memoryTypes,
  minImportance,
  dateAfter,
  dateBefore,
  aboutEntity,
  includeArchived = false,
} = {}) {
  sqlParts.push('AND m.invalidated_at IS NULL');

  if (!includeArchived) {
    sqlParts.push("AND (m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'archived')");
  }

  // View-as-of temporal filter for rollback support
  try {
    const viewRow = db.queryOne("SELECT value FROM _meta WHERE key = 'view_as_of'");
    if (viewRow && viewRow.value) {
      sqlParts.push('AND m.created_at <= ?');
      params.push(viewRow.value);
    }
  } catch {
    // _meta table may not exist on very old schemas
  }

  if (memoryTypes && memoryTypes.length > 0) {
    const placeholders = memoryTypes.map(() => '?').join(', ');
    sqlParts.push(`AND m.type IN (${placeholders})`);
    params.push(...memoryTypes);
  }

  if (minImportance != null) {
    sqlParts.push('AND m.importance >= ?');
    params.push(minImportance);
  }

  if (dateAfter) {
    sqlParts.push('AND m.created_at >= ?');
    params.push(typeof dateAfter === 'string' ? dateAfter : dateAfter.toISOString());
  }

  if (dateBefore) {
    sqlParts.push('AND m.created_at <= ?');
    params.push(typeof dateBefore === 'string' ? dateBefore : dateBefore.toISOString());
  }

  if (aboutEntity) {
    const canonical = canonicalName(aboutEntity);
    sqlParts.push('AND e.canonical_name = ?');
    params.push(canonical);
  }
}

/** FTS5 full-text search with BM25 scoring. Returns Map<memoryId, normalizedScore>. */
function ftsSearch(db, query, limit, memoryTypes, minImportance) {
  try {
    let sql = `
      SELECT m.id, fts.rank
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.rowid
      WHERE memories_fts MATCH ?
      AND m.invalidated_at IS NULL
      AND (m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'archived')
    `;
    const params = [query];

    if (memoryTypes && memoryTypes.length > 0) {
      const ph = memoryTypes.map(() => '?').join(', ');
      sql += ` AND m.type IN (${ph})`;
      params.push(...memoryTypes);
    }

    if (minImportance != null) {
      sql += ' AND m.importance >= ?';
      params.push(minImportance);
    }

    sql += ' ORDER BY fts.rank LIMIT ?';
    params.push(limit);

    const rows = db.query(sql, params);
    if (!rows || rows.length === 0) return {};

    // Normalize FTS5 rank scores to 0-1 range
    // FTS5 rank is BM25: negative float, closer to 0 = better match
    const ranks = rows.map(r => r.rank);
    const minRank = Math.min(...ranks); // best match (most negative)
    const maxRank = Math.max(...ranks); // worst match (closest to 0)

    const result = {};
    for (const row of rows) {
      if (minRank === maxRank) {
        result[row.id] = 1.0;
      } else {
        result[row.id] = (row.rank - maxRank) / (minRank - maxRank);
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Fallback keyword-based search. Tries FTS5 MATCH first, then LIKE. */
function keywordSearch(db, query, limit, memoryTypes, minImportance) {
  // Try FTS5 first
  try {
    let sql = `
      SELECT m.*, GROUP_CONCAT(e.name) as entity_names
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.rowid
      LEFT JOIN memory_entities me ON m.id = me.memory_id
      LEFT JOIN entities e ON me.entity_id = e.id
      WHERE memories_fts MATCH ?
      AND m.invalidated_at IS NULL
      AND (m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'archived')
    `;
    const params = [query];

    if (memoryTypes && memoryTypes.length > 0) {
      const ph = memoryTypes.map(() => '?').join(', ');
      sql += ` AND m.type IN (${ph})`;
      params.push(...memoryTypes);
    }

    if (minImportance != null) {
      sql += ' AND m.importance >= ?';
      params.push(minImportance);
    }

    sql += ' GROUP BY m.id ORDER BY fts.rank LIMIT ?';
    params.push(limit);

    const rows = db.query(sql, params);
    if (rows && rows.length > 0) return rows;
  } catch {
    // FTS5 not available, fall through to LIKE
  }

  // Final fallback: LIKE search
  let sql = `
    SELECT m.*, GROUP_CONCAT(e.name) as entity_names
    FROM memories m
    LEFT JOIN memory_entities me ON m.id = me.memory_id
    LEFT JOIN entities e ON me.entity_id = e.id
    WHERE m.content LIKE ?
    AND m.invalidated_at IS NULL
    AND (m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'archived')
  `;
  const params = [`%${query}%`];

  if (memoryTypes && memoryTypes.length > 0) {
    const ph = memoryTypes.map(() => '?').join(', ');
    sql += ` AND m.type IN (${ph})`;
    params.push(...memoryTypes);
  }

  if (minImportance != null) {
    sql += ' AND m.importance >= ?';
    params.push(minImportance);
  }

  sql += ' GROUP BY m.id ORDER BY m.importance DESC, m.created_at DESC LIMIT ?';
  params.push(limit);

  return db.query(sql, params) || [];
}

/** Update access counts for rehearsal effect. */
function updateAccessCounts(db, results, now) {
  const isoNow = now.toISOString();
  for (const result of results) {
    try {
      db.run(
        'UPDATE memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?',
        [isoNow, result.id],
      );
    } catch {
      // Non-fatal
    }
  }
}

/** Reciprocal Rank Fusion across multiple ranking signals. */
function rrfScore(memoryIds, signalRankings, k = 60) {
  const scores = {};
  for (const mid of memoryIds) {
    scores[mid] = 0.0;
  }
  for (const rankedIds of Object.values(signalRankings)) {
    for (let rank = 0; rank < rankedIds.length; rank++) {
      const mid = rankedIds[rank];
      if (mid in scores) {
        scores[mid] += 1.0 / (k + rank + 1);
      }
    }
  }
  return scores;
}

/** Resolve entity IDs from text by matching canonical names and aliases. */
function resolveEntitiesFromText(db, text) {
  if (!text || text.trim().length < 2) return [];

  const textLower = text.toLowerCase();
  const entityIds = [];

  try {
    const entities = db.query(
      'SELECT id, canonical_name FROM entities WHERE importance > 0.05',
    ) || [];

    for (const entity of entities) {
      const canonical = entity.canonical_name;
      if (canonical && canonical.length > 1) {
        const escaped = canonical.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`);
        if (re.test(textLower)) {
          entityIds.push(entity.id);
        }
      }
    }

    // Also check aliases if no matches from canonical names
    if (entityIds.length === 0) {
      try {
        const aliases = db.query(
          'SELECT entity_id, canonical_alias FROM entity_aliases',
        ) || [];
        for (const alias of aliases) {
          const aliasVal = alias.canonical_alias;
          if (aliasVal && aliasVal.length > 1) {
            const escaped = aliasVal.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`\\b${escaped}\\b`);
            if (re.test(textLower)) {
              entityIds.push(alias.entity_id);
            }
          }
        }
      } catch {
        // entity_aliases table may not exist
      }
    }
  } catch {
    // Graceful degradation
  }

  return [...new Set(entityIds)];
}

/** Traverse the relationship graph with strength-aware scoring. */
function expandGraphWeighted(db, entityId, depth = 2, limitPerHop = 15) {
  try {
    const directRows = db.query(
      `SELECT DISTINCT
        CASE WHEN r.source_entity_id = ? THEN r.target_entity_id
             ELSE r.source_entity_id END as neighbor_id,
        e.name, e.type, e.importance,
        r.strength as rel_strength,
        r.relationship_type
      FROM relationships r
      JOIN entities e ON e.id = CASE
        WHEN r.source_entity_id = ? THEN r.target_entity_id
        ELSE r.source_entity_id END
      WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
        AND r.strength > 0.1
        AND r.invalid_at IS NULL
        AND e.importance > 0.05
        AND e.id != ?
      ORDER BY r.strength DESC, e.importance DESC
      LIMIT ?`,
      [entityId, entityId, entityId, entityId, entityId, limitPerHop],
    ) || [];

    const connected = [];
    const seenIds = new Set([entityId]);

    for (const row of directRows) {
      const nid = row.neighbor_id;
      if (seenIds.has(nid)) continue;
      seenIds.add(nid);
      connected.push({
        id: nid,
        name: row.name,
        type: row.type,
        importance: row.importance,
        distance: 1,
        path_strength: row.rel_strength,
        via_relationship: row.relationship_type,
      });
    }

    // Second hop if requested
    if (depth >= 2) {
      const hop1Slice = connected.slice(0, 10); // Limit fan-out
      for (const hop1 of hop1Slice) {
        const hop2Rows = db.query(
          `SELECT DISTINCT
            CASE WHEN r.source_entity_id = ? THEN r.target_entity_id
                 ELSE r.source_entity_id END as neighbor_id,
            e.name, e.type, e.importance,
            r.strength as rel_strength,
            r.relationship_type
          FROM relationships r
          JOIN entities e ON e.id = CASE
            WHEN r.source_entity_id = ? THEN r.target_entity_id
            ELSE r.source_entity_id END
          WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
            AND r.strength > 0.1
            AND r.invalid_at IS NULL
            AND e.importance > 0.05
            AND e.id != ?
          ORDER BY r.strength DESC
          LIMIT ?`,
          [hop1.id, hop1.id, hop1.id, hop1.id, entityId, Math.floor(limitPerHop / 2)],
        ) || [];

        for (const row of hop2Rows) {
          const nid = row.neighbor_id;
          if (seenIds.has(nid)) continue;
          seenIds.add(nid);
          // Path strength is product of edge strengths
          const pathStrength = hop1.path_strength * row.rel_strength;
          connected.push({
            id: nid,
            name: row.name,
            type: row.type,
            importance: row.importance,
            distance: 2,
            path_strength: pathStrength,
            via_relationship: row.relationship_type,
          });
        }
      }
    }

    return connected;
  } catch {
    return [];
  }
}

/** Compute graph proximity scores for candidate memories. */
function computeGraphScores(db, config, query, candidateIds) {
  if (!config.graph_proximity_enabled || candidateIds.size === 0) return {};

  const queryEntityIds = resolveEntitiesFromText(db, query);
  if (queryEntityIds.length === 0) return {};

  const scores = {};

  try {
    // Build entity -> (hop_distance, path_strength) mapping
    const entityProximity = new Map();
    for (const eid of queryEntityIds) {
      entityProximity.set(eid, { distance: 0, pathStrength: 1.0 });

      const neighbors = expandGraphWeighted(db, eid, 2, 15);
      for (const neighbor of neighbors) {
        const nid = neighbor.id;
        const dist = neighbor.distance || 1;
        const pathStrength = neighbor.path_strength || 0.5;
        const existing = entityProximity.get(nid);
        if (!existing || dist < existing.distance) {
          entityProximity.set(nid, { distance: dist, pathStrength });
        } else if (dist === existing.distance && pathStrength > existing.pathStrength) {
          entityProximity.set(nid, { distance: dist, pathStrength });
        }
      }
    }

    // Score each candidate memory by its entity links
    const idArr = [...candidateIds];
    const placeholders = idArr.map(() => '?').join(', ');
    const memEntities = db.query(
      `SELECT memory_id, entity_id FROM memory_entities WHERE memory_id IN (${placeholders})`,
      idArr,
    ) || [];

    for (const row of memEntities) {
      const mid = row.memory_id;
      const eid = row.entity_id;
      const prox = entityProximity.get(eid);
      if (prox) {
        let score;
        if (prox.distance === 0) {
          score = 1.0;
        } else if (prox.distance === 1) {
          score = 0.5 + 0.3 * prox.pathStrength; // 0.5-0.8
        } else {
          score = 0.2 + 0.3 * prox.pathStrength; // 0.2-0.5
        }
        scores[mid] = Math.max(scores[mid] || 0.0, score);
      }
    }

    // Multi-entity bonus
    if (queryEntityIds.length > 1) {
      const memEntityHits = {};
      for (const row of memEntities) {
        if (entityProximity.has(row.entity_id)) {
          memEntityHits[row.memory_id] = (memEntityHits[row.memory_id] || 0) + 1;
        }
      }
      for (const [mid, hitCount] of Object.entries(memEntityHits)) {
        if (hitCount > 1 && mid in scores) {
          scores[mid] = Math.min(1.0, scores[mid] * (1.0 + 0.15 * (hitCount - 1)));
        }
      }
    }
  } catch {
    // Graceful degradation
  }

  return scores;
}

/** Expand graph using recursive CTE (simple, for recallAbout). */
function expandGraph(db, entityId, depth = 1, limitPerHop = 3) {
  try {
    const rows = db.query(
      `WITH RECURSIVE graph(entity_id, hop) AS (
        SELECT CASE
          WHEN r.source_entity_id = ? THEN r.target_entity_id
          ELSE r.source_entity_id
        END, 1
        FROM relationships r
        WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
          AND r.strength > 0.1

        UNION

        SELECT CASE
          WHEN r.source_entity_id = g.entity_id THEN r.target_entity_id
          ELSE r.source_entity_id
        END, g.hop + 1
        FROM relationships r
        JOIN graph g ON (r.source_entity_id = g.entity_id OR r.target_entity_id = g.entity_id)
        WHERE g.hop < ?
          AND r.strength > 0.1
          AND CASE
            WHEN r.source_entity_id = g.entity_id THEN r.target_entity_id
            ELSE r.source_entity_id
          END != ?
      )
      SELECT DISTINCT e.id, e.name, e.type, e.description, e.importance,
             MIN(g.hop) as distance
      FROM graph g
      JOIN entities e ON g.entity_id = e.id
      WHERE e.id != ? AND e.importance > 0.1
      GROUP BY e.id
      ORDER BY distance ASC, e.importance DESC
      LIMIT ?`,
      [entityId, entityId, entityId, depth, entityId, entityId, limitPerHop * depth],
    ) || [];

    const connected = [];
    for (const row of rows) {
      const memRows = db.query(
        `SELECT m.content, m.type, m.importance
         FROM memories m
         JOIN memory_entities me ON m.id = me.memory_id
         WHERE me.entity_id = ?
         ORDER BY m.importance DESC
         LIMIT 2`,
        [row.id],
      ) || [];

      connected.push({
        id: row.id,
        name: row.name,
        type: row.type,
        description: row.description,
        importance: row.importance,
        distance: row.distance,
        top_memories: memRows.map(m => ({ content: m.content, type: m.type })),
      });
    }

    return connected;
  } catch {
    return [];
  }
}

/** Name similarity using longest common subsequence ratio with first-letter boost. */
function nameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0.0;

  const a = name1.toLowerCase();
  const b = name2.toLowerCase();

  // Simple Levenshtein-based similarity (matches SequenceMatcher behavior reasonably)
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0 || lenB === 0) return 0.0;

  // Use LCS-based ratio (equivalent to SequenceMatcher.ratio())
  const dp = Array(lenA + 1).fill(null).map(() => Array(lenB + 1).fill(0));
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const lcsLen = dp[lenA][lenB];
  let ratio = (2.0 * lcsLen) / (lenA + lenB);

  // First letter boost
  if (a[0] === b[0]) {
    ratio = Math.min(1.0, ratio + 0.05);
  }

  return ratio;
}

/** Build a human-readable provenance chain for a memory. */
function buildProvenanceChain(memoryRow, traceResult) {
  const chain = [];

  // Step 1: Origin type
  const origin = rowGet(memoryRow, 'origin_type', 'inferred');
  const sourceChannel = rowGet(memoryRow, 'source_channel', 'claude_code');
  chain.push({
    type: 'origin',
    label: `Origin: ${origin} via ${sourceChannel || 'claude_code'}`,
    timestamp: memoryRow.created_at,
  });

  // Step 2: Source document (if linked)
  if (traceResult.documents && traceResult.documents.length > 0) {
    const doc = traceResult.documents[0];
    chain.push({
      type: 'source_document',
      label: `Source: ${doc.source_type} - ${doc.filename}`,
      timestamp: doc.created_at,
    });
  }

  // Step 3: Episode context (if from a session)
  if (traceResult.episode) {
    const ep = traceResult.episode;
    const topics = (ep.key_topics || []).slice(0, 3).join(', ') || 'general';
    chain.push({
      type: 'episode',
      label: `Session (${topics})`,
      timestamp: ep.started_at,
    });
  }

  // Step 4: Source context breadcrumb
  const sourceContext = rowGet(memoryRow, 'source_context');
  if (sourceContext) {
    chain.push({
      type: 'context',
      label: `Context: ${sourceContext}`,
    });
  }

  // Step 5: Extracted fact
  chain.push({
    type: 'memory',
    label: `Stored as ${memoryRow.type} (importance: ${memoryRow.importance.toFixed(2)}, confidence: ${memoryRow.confidence.toFixed(2)})`,
    timestamp: memoryRow.created_at,
  });

  // Step 6: Corrections (if any)
  const correctedAt = rowGet(memoryRow, 'corrected_at');
  const correctedFrom = rowGet(memoryRow, 'corrected_from');
  if (correctedAt) {
    chain.push({
      type: 'correction',
      label: correctedFrom ? `Corrected: was '${correctedFrom.slice(0, 80)}...'` : 'Corrected by user',
      timestamp: correctedAt,
    });
  }

  // Step 7: Invalidation (if any)
  const invalidatedAt = rowGet(memoryRow, 'invalidated_at');
  const invalidatedReason = rowGet(memoryRow, 'invalidated_reason');
  if (invalidatedAt) {
    chain.push({
      type: 'invalidation',
      label: `Invalidated: ${invalidatedReason || 'no reason given'}`,
      timestamp: invalidatedAt,
    });
  }

  // Step 8: Related entities
  if (traceResult.entities && traceResult.entities.length > 0) {
    const entityNames = traceResult.entities.slice(0, 5).map(e => e.name);
    chain.push({
      type: 'entities',
      label: `About: ${entityNames.join(', ')}`,
    });
  }

  return chain;
}

// ===========================================================================
// EXPORTED FUNCTIONS
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. recall() -- THE CORE METHOD (async, needs embeddings)
// ---------------------------------------------------------------------------

/**
 * Search memories using hybrid vector + FTS5 similarity and filters.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {object} config - Config object
 * @param {string} query - Search query text
 * @param {object} [options]
 * @param {number} [options.limit] - Maximum results to return
 * @param {string[]} [options.memoryTypes] - Filter by memory types
 * @param {string} [options.aboutEntity] - Filter to memories about a specific entity
 * @param {number} [options.minImportance] - Minimum importance threshold
 * @param {boolean} [options.includeLowImportance=false] - Include memories below default threshold
 * @param {string|Date} [options.dateAfter] - Only memories after this date
 * @param {string|Date} [options.dateBefore] - Only memories before this date
 * @param {boolean} [options.includeArchived=false] - Include archived memories
 * @returns {Promise<object[]>} List of recall results ordered by relevance
 */
export async function recall(db, config, query, {
  limit,
  memoryTypes,
  aboutEntity,
  minImportance,
  includeLowImportance = false,
  dateAfter,
  dateBefore,
  includeArchived = false,
} = {}) {
  if (limit == null) limit = config.max_recall_results || 50;
  if (minImportance == null && !includeLowImportance) {
    minImportance = config.min_importance_threshold || 0.1;
  }

  // Get query embedding
  const queryEmbedding = await embed(query);

  // --- Vector search ---
  const vectorScores = {};   // memoryId -> score
  const vectorRows = {};     // memoryId -> row

  if (queryEmbedding) {
    const sqlParts = [
      'SELECT m.*, GROUP_CONCAT(e.name) as entity_names, (1.0 / (1.0 + me.distance)) as vector_score',
    ];
    const params = [];
    sqlParts.push(`
      FROM memory_embeddings me
      JOIN memories m ON m.id = me.memory_id
      LEFT JOIN memory_entities me2 ON m.id = me2.memory_id
      LEFT JOIN entities e ON me2.entity_id = e.id
      WHERE me.embedding MATCH ?
    `);
    params.push(JSON.stringify(queryEmbedding));

    applyFilters(db, sqlParts, params, {
      memoryTypes, minImportance, dateAfter, dateBefore, aboutEntity, includeArchived,
    });

    sqlParts.push('GROUP BY m.id ORDER BY vector_score DESC LIMIT ?');
    params.push(limit * 2);

    try {
      const rows = db.query(sqlParts.join('\n'), params) || [];
      for (const row of rows) {
        const mid = row.id;
        vectorScores[mid] = row.vector_score || 0.0;
        vectorRows[mid] = row;
      }
    } catch (e) {
      if (!_vec0Warned) {
        process.stderr.write(`[recall] Vector search failed (will fall back silently): ${e.message}\n`);
        _vec0Warned = true;
      }
    }
  }

  // --- FTS5 search ---
  const ftsScores = ftsSearch(db, query, limit * 2, memoryTypes, minImportance);

  // --- Fallback: if neither vector nor FTS returned results, use keyword LIKE ---
  const hasVectorResults = Object.keys(vectorScores).length > 0;
  const hasFtsResults = Object.keys(ftsScores).length > 0;

  if (!hasVectorResults && !hasFtsResults) {
    const rows = keywordSearch(db, query, limit, memoryTypes, minImportance);
    const now = new Date();
    let results = rows.map(row => rowToResult(row, 0.5, 0.0, now, config));
    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, limit);
    updateAccessCounts(db, results, now);
    return results;
  }

  // --- Merge: collect all memory IDs from both sources ---
  const allIds = new Set([
    ...Object.keys(vectorScores).map(Number),
    ...Object.keys(ftsScores).map(Number),
  ]);

  // Fetch full rows for FTS-only results not already in vectorRows
  const ftsOnlyIds = [...Object.keys(ftsScores).map(Number)].filter(id => !(id in vectorRows));
  if (ftsOnlyIds.length > 0) {
    const placeholders = ftsOnlyIds.map(() => '?').join(', ');
    const ftsRows = db.query(
      `SELECT m.*, GROUP_CONCAT(e.name) as entity_names
       FROM memories m
       LEFT JOIN memory_entities me2 ON m.id = me2.memory_id
       LEFT JOIN entities e ON me2.entity_id = e.id
       WHERE m.id IN (${placeholders})
       GROUP BY m.id`,
      ftsOnlyIds,
    ) || [];
    for (const row of ftsRows) {
      vectorRows[row.id] = row;
    }
  }

  // --- Score and build results ---
  const now = new Date();
  let results;

  if (config.enable_rrf && allIds.size > 0) {
    // Build independent rankings for RRF
    const signalRankings = {};

    // Vector ranking (sorted by vector score, best first)
    if (hasVectorResults) {
      signalRankings.vector = Object.keys(vectorScores)
        .map(Number)
        .sort((a, b) => vectorScores[b] - vectorScores[a]);
    }

    // FTS ranking (sorted by FTS score, best first)
    if (hasFtsResults) {
      signalRankings.fts = Object.keys(ftsScores)
        .map(Number)
        .sort((a, b) => ftsScores[b] - ftsScores[a]);
    }

    // Importance ranking
    const importanceData = {};
    for (const mid of allIds) {
      const row = vectorRows[mid];
      if (row) importanceData[mid] = row.importance;
    }
    if (Object.keys(importanceData).length > 0) {
      signalRankings.importance = Object.keys(importanceData)
        .map(Number)
        .sort((a, b) => importanceData[b] - importanceData[a]);
    }

    // Recency ranking (sorted by created_at, newest first)
    const recencyData = {};
    for (const mid of allIds) {
      const row = vectorRows[mid];
      if (row) {
        try {
          const created = new Date(row.created_at);
          recencyData[mid] = (now - created) / 1000; // seconds old
        } catch {
          recencyData[mid] = Infinity;
        }
      }
    }
    if (Object.keys(recencyData).length > 0) {
      signalRankings.recency = Object.keys(recencyData)
        .map(Number)
        .sort((a, b) => recencyData[a] - recencyData[b]); // smallest age = most recent = best
    }

    // Graph proximity ranking
    const graphScores = computeGraphScores(db, config, query, allIds);
    if (Object.keys(graphScores).length > 0) {
      signalRankings.graph = Object.keys(graphScores)
        .map(Number)
        .sort((a, b) => graphScores[b] - graphScores[a]);
    }

    // Fuse via RRF
    const rrfScores = rrfScore(allIds, signalRankings, config.rrf_k || 60);

    results = [];
    for (const mid of allIds) {
      const row = vectorRows[mid];
      if (!row) continue;
      const result = rowToResult(row, vectorScores[mid] || 0.0, ftsScores[mid] || 0.0, now, config);
      result.score = rrfScores[mid] || 0.0;
      results.push(result);
    }
  } else {
    // Legacy weighted-sum scoring
    results = [];
    for (const mid of allIds) {
      const row = vectorRows[mid];
      if (!row) continue;
      const vs = vectorScores[mid] || 0.0;
      const fs = ftsScores[mid] || 0.0;
      results.push(rowToResult(row, vs, fs, now, config));
    }
  }

  // Sort by combined score and limit
  results.sort((a, b) => b.score - a.score);
  results = results.slice(0, limit);

  updateAccessCounts(db, results, now);
  return results;
}

// ---------------------------------------------------------------------------
// 2. recallAbout() -- All context for an entity (sync)
// ---------------------------------------------------------------------------

/**
 * Get everything known about an entity.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} entityName
 * @param {object} [options]
 * @param {number} [options.limit]
 * @param {string[]} [options.memoryTypes]
 * @param {boolean} [options.includeHistorical=false]
 * @returns {object}
 */
export function recallAbout(db, config, entityName, {
  limit,
  memoryTypes,
  includeHistorical = false,
} = {}) {
  if (limit == null) limit = config.max_recall_results || 50;

  const canonical = canonicalName(entityName);

  // Find entity
  let entity = db.queryOne('SELECT * FROM entities WHERE canonical_name = ?', [canonical]);

  if (!entity) {
    // Try alias
    try {
      const alias = db.queryOne('SELECT * FROM entity_aliases WHERE canonical_alias = ?', [canonical]);
      if (alias) {
        entity = db.queryOne('SELECT * FROM entities WHERE id = ?', [alias.entity_id]);
      }
    } catch {
      // entity_aliases may not exist
    }
  }

  if (!entity) {
    return { entity: null, memories: [], relationships: [] };
  }

  // Get memories about this entity
  let sql = `
    SELECT m.* FROM memories m
    JOIN memory_entities me ON m.id = me.memory_id
    WHERE me.entity_id = ?
    AND m.invalidated_at IS NULL
  `;
  const params = [entity.id];

  if (memoryTypes && memoryTypes.length > 0) {
    const ph = memoryTypes.map(() => '?').join(', ');
    sql += ` AND m.type IN (${ph})`;
    params.push(...memoryTypes);
  }

  sql += ' ORDER BY m.importance DESC, m.created_at DESC LIMIT ?';
  params.push(limit);

  const memoryRows = db.query(sql, params) || [];

  const memories = memoryRows.map(row => ({
    id: row.id,
    content: row.content,
    type: row.type,
    score: row.importance,
    importance: row.importance,
    created_at: row.created_at,
    entities: [entity.name],
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    source: rowGet(row, 'source'),
    source_id: rowGet(row, 'source_id'),
    source_context: rowGet(row, 'source_context'),
    lifecycle_tier: rowGet(row, 'lifecycle_tier'),
    fact_id: rowGet(row, 'fact_id'),
  }));

  // Get relationships
  let relSql = `
    SELECT r.*,
           s.name as source_name, s.type as source_type,
           t.name as target_name, t.type as target_type
    FROM relationships r
    JOIN entities s ON r.source_entity_id = s.id
    JOIN entities t ON r.target_entity_id = t.id
    WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
  `;
  if (!includeHistorical) {
    relSql += ' AND r.invalid_at IS NULL';
  }
  relSql += ' ORDER BY r.strength DESC';

  const relRows = db.query(relSql, [entity.id, entity.id]) || [];

  const relationships = relRows.map(row => {
    const rel = {
      type: row.relationship_type,
      direction: row.direction,
      strength: row.strength,
      origin_type: rowGet(row, 'origin_type', 'extracted'),
      other_entity: row.source_entity_id === entity.id ? row.target_name : row.source_name,
      other_entity_type: row.source_entity_id === entity.id ? row.target_type : row.source_type,
    };
    if (includeHistorical) {
      rel.valid_at = rowGet(row, 'valid_at');
      rel.invalid_at = rowGet(row, 'invalid_at');
    }
    return rel;
  });

  // Get relevant episode narratives mentioning this entity
  const episodeRows = db.query(
    `SELECT id, session_id, narrative, started_at, ended_at, key_topics
     FROM episodes
     WHERE is_summarized = 1 AND narrative LIKE ?
     ORDER BY started_at DESC
     LIMIT 5`,
    [`%${entity.name}%`],
  ) || [];

  const recentSessions = episodeRows.map(row => ({
    episode_id: row.id,
    narrative: row.narrative,
    started_at: row.started_at,
    key_topics: row.key_topics ? JSON.parse(row.key_topics) : [],
  }));

  // Expand graph: get connected entities
  const connected = expandGraph(db, entity.id);

  return {
    entity: {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      description: entity.description,
      importance: entity.importance,
    },
    memories,
    relationships,
    connected,
    recent_sessions: recentSessions,
  };
}

// ---------------------------------------------------------------------------
// 3. recallSince() -- Memories after a date (sync)
// ---------------------------------------------------------------------------

/**
 * Retrieve memories created or updated since a timestamp.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} since - ISO datetime string
 * @param {object} [options]
 * @param {string} [options.entityName]
 * @param {number} [options.limit=50]
 * @returns {object[]}
 */
export function recallSince(db, config, since, { entityName, limit = 50 } = {}) {
  const conditions = [
    '(m.created_at >= ? OR m.updated_at >= ?)',
    'm.invalidated_at IS NULL',
    "(m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'archived')",
  ];
  const params = [since, since];

  if (entityName) {
    conditions.push(`
      m.id IN (
        SELECT me.memory_id FROM memory_entities me
        JOIN entities e ON me.entity_id = e.id
        WHERE e.canonical_name = ? OR e.name = ?
      )
    `);
    params.push(entityName.toLowerCase(), entityName);
  }

  const where = conditions.join(' AND ');

  const rows = db.query(
    `SELECT m.*, GROUP_CONCAT(e.name) as entity_names
     FROM memories m
     LEFT JOIN memory_entities me ON m.id = me.memory_id
     LEFT JOIN entities e ON me.entity_id = e.id
     WHERE ${where}
     GROUP BY m.id
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [...params, limit],
  ) || [];

  return rows.map(row => rowToSimpleResult(row));
}

// ---------------------------------------------------------------------------
// 4. recallTemporal() -- Semantic search within a time window (async)
// ---------------------------------------------------------------------------

/**
 * Semantic search within a time window.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} query
 * @param {object} [options]
 * @param {string} [options.dateFrom]
 * @param {string} [options.dateTo]
 * @param {number} [options.limit=20]
 * @returns {Promise<object[]>}
 */
export async function recallTemporal(db, config, query, { dateFrom, dateTo, limit = 20 } = {}) {
  // First get semantic results
  const results = await recall(db, config, query, { limit: limit * 2 });

  // Filter by date range
  const filtered = [];
  for (const r of results) {
    const created = r.created_at;
    if (!created) continue;
    if (dateFrom && created < dateFrom) continue;
    if (dateTo && created > dateTo) continue;
    filtered.push(r);
    if (filtered.length >= limit) break;
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// 5. recallTimeline() -- Chronological memories for entity (sync)
// ---------------------------------------------------------------------------

/**
 * Temporal view of an entity: all memories sorted by time.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} entityName
 * @param {object} [options]
 * @param {number} [options.limit=50]
 * @returns {object[]}
 */
export function recallTimeline(db, config, entityName, { limit = 50 } = {}) {
  const rows = db.query(
    `SELECT m.*, GROUP_CONCAT(e2.name) as entity_names
     FROM memories m
     JOIN memory_entities me ON m.id = me.memory_id
     JOIN entities e ON me.entity_id = e.id
     LEFT JOIN memory_entities me2 ON m.id = me2.memory_id
     LEFT JOIN entities e2 ON me2.entity_id = e2.id
     WHERE (e.canonical_name = ? OR e.name = ?)
       AND m.invalidated_at IS NULL
       AND (m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'archived')
     GROUP BY m.id
     ORDER BY COALESCE(m.deadline_at, m.created_at) ASC
     LIMIT ?`,
    [entityName.toLowerCase(), entityName, limit],
  ) || [];

  return rows.map(row => {
    const r = rowToSimpleResult(row);
    const deadlineAt = rowGet(row, 'deadline_at');
    if (deadlineAt) {
      r.metadata = r.metadata || {};
      r.metadata.deadline_at = deadlineAt;
      r.metadata.has_deadline = true;
    }
    return r;
  });
}

// ---------------------------------------------------------------------------
// 6. recallUpcomingDeadlines() -- Memories with upcoming deadlines (sync)
// ---------------------------------------------------------------------------

/**
 * Retrieve memories with upcoming deadlines, sorted by urgency.
 *
 * @param {object} db
 * @param {object} config
 * @param {object} [options]
 * @param {number} [options.daysAhead=14]
 * @param {boolean} [options.includeOverdue=true]
 * @returns {object[]}
 */
export function recallUpcomingDeadlines(db, config, { daysAhead = 14, includeOverdue = true } = {}) {
  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const conditions = [
    'm.deadline_at IS NOT NULL',
    'm.invalidated_at IS NULL',
    "(m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'archived')",
  ];
  const params = [];

  if (includeOverdue) {
    conditions.push('m.deadline_at <= ?');
    params.push(future.toISOString().replace('T', ' ').slice(0, 19));
  } else {
    conditions.push('m.deadline_at BETWEEN ? AND ?');
    params.push(
      now.toISOString().replace('T', ' ').slice(0, 19),
      future.toISOString().replace('T', ' ').slice(0, 19),
    );
  }

  const where = conditions.join(' AND ');

  const rows = db.query(
    `SELECT m.*, GROUP_CONCAT(e.name) as entity_names
     FROM memories m
     LEFT JOIN memory_entities me ON m.id = me.memory_id
     LEFT JOIN entities e ON me.entity_id = e.id
     WHERE ${where}
     GROUP BY m.id
     ORDER BY m.deadline_at ASC`,
    params,
  ) || [];

  return rows.map(row => {
    const deadlineStr = rowGet(row, 'deadline_at');
    let urgency = 'later';
    if (deadlineStr) {
      try {
        const deadlineDt = new Date(deadlineStr);
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (deadlineDt < now) {
          urgency = 'overdue';
        } else if (deadlineDt < new Date(now.getTime() + oneDayMs)) {
          urgency = 'today';
        } else if (deadlineDt < new Date(now.getTime() + 2 * oneDayMs)) {
          urgency = 'tomorrow';
        } else if (deadlineDt < new Date(now.getTime() + 7 * oneDayMs)) {
          urgency = 'this_week';
        }
      } catch {
        // ignore
      }
    }

    const entityStr = rowGet(row, 'entity_names', '');
    return {
      id: row.id,
      content: row.content,
      type: row.type,
      score: row.importance,
      importance: row.importance,
      created_at: row.created_at,
      entities: entityStr ? entityStr.split(',').map(s => s.trim()) : [],
      metadata: { urgency, deadline_at: deadlineStr },
      lifecycle_tier: rowGet(row, 'lifecycle_tier'),
      fact_id: rowGet(row, 'fact_id'),
    };
  });
}

// ---------------------------------------------------------------------------
// 7. searchEntities() -- Entity search with type/name filters (sync)
// ---------------------------------------------------------------------------

/**
 * Search for entities by name or description.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} query
 * @param {object} [options]
 * @param {string[]} [options.entityTypes]
 * @param {number} [options.limit=10]
 * @returns {object[]}
 */
export function searchEntities(db, config, query, { entityTypes, limit = 10 } = {}) {
  const canonical = canonicalName(query);

  let sql = `
    SELECT e.*,
           COUNT(DISTINCT me.memory_id) as memory_count,
           COUNT(DISTINCT r.id) as relationship_count,
           MAX(m.created_at) as last_mentioned
    FROM entities e
    LEFT JOIN memory_entities me ON e.id = me.entity_id
    LEFT JOIN memories m ON me.memory_id = m.id
    LEFT JOIN relationships r ON e.id = r.source_entity_id OR e.id = r.target_entity_id
    WHERE e.canonical_name LIKE ? OR e.name LIKE ?
  `;
  const params = [`%${canonical}%`, `%${query}%`];

  if (entityTypes && entityTypes.length > 0) {
    const ph = entityTypes.map(() => '?').join(', ');
    sql += ` AND e.type IN (${ph})`;
    params.push(...entityTypes);
  }

  sql += ' GROUP BY e.id ORDER BY e.importance DESC LIMIT ?';
  params.push(limit);

  const rows = db.query(sql, params) || [];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    importance: row.importance,
    memory_count: row.memory_count,
    relationship_count: row.relationship_count,
    last_mentioned: row.last_mentioned,
  }));
}

// ---------------------------------------------------------------------------
// 8. getProjectNetwork() -- Entity relationship graph (sync)
// ---------------------------------------------------------------------------

/**
 * Get all people and organizations connected to a project.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} projectName
 * @returns {object}
 */
export function getProjectNetwork(db, config, projectName) {
  const canonical = canonicalName(projectName);

  // Find project entity
  let project = db.queryOne(
    "SELECT * FROM entities WHERE canonical_name = ? AND type = 'project'",
    [canonical],
  );

  if (!project) {
    project = db.queryOne(
      "SELECT * FROM entities WHERE canonical_name LIKE ? AND type = 'project'",
      [`%${canonical}%`],
    );
  }

  if (!project) {
    return { error: `Project '${projectName}' not found`, project: null };
  }

  const result = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      importance: project.importance,
    },
    direct_participants: [],
    organizations: [],
    extended_network: [],
    total_people: 0,
    total_orgs: 0,
  };

  try {
    // Get direct relationships to project
    const directRels = db.query(
      `SELECT r.*, e.id as entity_id, e.name, e.type, e.description, e.importance
       FROM relationships r
       JOIN entities e ON (
         (r.source_entity_id = ? AND r.target_entity_id = e.id) OR
         (r.target_entity_id = ? AND r.source_entity_id = e.id)
       )
       WHERE r.strength > 0.1 AND r.invalid_at IS NULL
       ORDER BY r.strength DESC`,
      [project.id, project.id],
    ) || [];

    const peopleIds = [];
    for (const rel of directRels) {
      const entityData = {
        id: rel.entity_id,
        name: rel.name,
        type: rel.type,
        description: rel.description,
        importance: rel.importance,
        relationship: rel.relationship_type,
        strength: rel.strength,
      };

      if (rel.type === 'person') {
        result.direct_participants.push(entityData);
        peopleIds.push(rel.entity_id);
      } else if (rel.type === 'organization') {
        result.organizations.push(entityData);
      }
    }

    // Get 1-hop connections from direct participants
    const extendedIds = new Set();
    for (const personId of peopleIds.slice(0, 10)) {
      const neighbors = expandGraph(db, personId, 1, 5);
      for (const neighbor of neighbors) {
        if (!peopleIds.includes(neighbor.id) && neighbor.id !== project.id) {
          if (!extendedIds.has(neighbor.id)) {
            extendedIds.add(neighbor.id);
            result.extended_network.push({
              id: neighbor.id,
              name: neighbor.name,
              type: neighbor.type,
              description: neighbor.description,
              connected_via: result.direct_participants.length > 0
                ? result.direct_participants[0].name
                : 'unknown',
            });
          }
        }
      }
    }

    result.total_people = result.direct_participants.length +
      result.extended_network.filter(e => e.type === 'person').length;
    result.total_orgs = result.organizations.length;
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 9. findPath() -- BFS shortest path between entities (sync)
// ---------------------------------------------------------------------------

/**
 * Find shortest path between two entities via relationships.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} entityA
 * @param {string} entityB
 * @param {object} [options]
 * @param {number} [options.maxDepth=4]
 * @returns {object[]|null} Path steps or null if no path found
 */
export function findPath(db, config, entityA, entityB, { maxDepth = 4 } = {}) {
  const canonicalA = canonicalName(entityA);
  const canonicalB = canonicalName(entityB);

  const entA = db.queryOne('SELECT * FROM entities WHERE canonical_name = ?', [canonicalA]);
  const entB = db.queryOne('SELECT * FROM entities WHERE canonical_name = ?', [canonicalB]);

  if (!entA || !entB) return null;
  if (entA.id === entB.id) {
    return [{ entity: entA.name, relationship: null, direction: null }];
  }

  try {
    const rows = db.query(
      `WITH RECURSIVE path_search(entity_id, path, depth) AS (
        SELECT ?, json_array(json_object('entity_id', ?, 'name', ?)), 0

        UNION ALL

        SELECT
          CASE
            WHEN r.source_entity_id = ps.entity_id THEN r.target_entity_id
            ELSE r.source_entity_id
          END,
          json_insert(
            ps.path,
            '$[#]',
            json_object(
              'entity_id', CASE WHEN r.source_entity_id = ps.entity_id THEN r.target_entity_id ELSE r.source_entity_id END,
              'name', e.name,
              'relationship', r.relationship_type,
              'direction', CASE WHEN r.source_entity_id = ps.entity_id THEN 'forward' ELSE 'backward' END
            )
          ),
          ps.depth + 1
        FROM path_search ps
        JOIN relationships r ON (r.source_entity_id = ps.entity_id OR r.target_entity_id = ps.entity_id)
        JOIN entities e ON e.id = CASE WHEN r.source_entity_id = ps.entity_id THEN r.target_entity_id ELSE r.source_entity_id END
        WHERE ps.depth < ?
          AND r.strength > 0.1
          AND r.invalid_at IS NULL
          AND json_extract(ps.path, '$[#-1].entity_id') != CASE WHEN r.source_entity_id = ps.entity_id THEN r.target_entity_id ELSE r.source_entity_id END
      )
      SELECT path, depth FROM path_search
      WHERE entity_id = ?
      ORDER BY depth ASC
      LIMIT 1`,
      [entA.id, entA.id, entA.name, maxDepth, entB.id],
    );

    if (rows && rows.length > 0) {
      return JSON.parse(rows[0].path);
    }
  } catch {
    // Path finding failed
  }

  return null;
}

// ---------------------------------------------------------------------------
// 10. getHubEntities() -- Most-connected entities (sync)
// ---------------------------------------------------------------------------

/**
 * Find most connected entities in the graph.
 *
 * @param {object} db
 * @param {object} config
 * @param {object} [options]
 * @param {number} [options.minConnections=5]
 * @param {string} [options.entityType]
 * @param {number} [options.limit=20]
 * @returns {object[]}
 */
export function getHubEntities(db, config, { minConnections = 5, entityType, limit = 20 } = {}) {
  try {
    let sql = `
      SELECT
        e.id, e.name, e.type, e.description, e.importance,
        COUNT(DISTINCT r.id) as connection_count,
        GROUP_CONCAT(DISTINCT
          CASE
            WHEN r.source_entity_id = e.id THEN t.name
            ELSE s.name
          END
        ) as connected_names
      FROM entities e
      LEFT JOIN relationships r ON (e.id = r.source_entity_id OR e.id = r.target_entity_id)
        AND r.strength > 0.1 AND r.invalid_at IS NULL
      LEFT JOIN entities s ON r.source_entity_id = s.id
      LEFT JOIN entities t ON r.target_entity_id = t.id
      WHERE e.importance > 0.1
    `;
    const params = [];

    if (entityType) {
      sql += ' AND e.type = ?';
      params.push(entityType);
    }

    sql += `
      GROUP BY e.id
      HAVING connection_count >= ?
      ORDER BY connection_count DESC, e.importance DESC
      LIMIT ?
    `;
    params.push(minConnections, limit);

    const rows = db.query(sql, params) || [];

    return rows.map(row => {
      const connectedNames = row.connected_names ? row.connected_names.split(',') : [];
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        description: row.description,
        importance: row.importance,
        connection_count: row.connection_count,
        top_connections: connectedNames.slice(0, 5),
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 11. getDormantRelationships() -- Relationships not updated recently (sync)
// ---------------------------------------------------------------------------

/**
 * Find relationships with no recent activity.
 *
 * @param {object} db
 * @param {object} config
 * @param {object} [options]
 * @param {number} [options.days=60]
 * @param {number} [options.minStrength=0.3]
 * @param {number} [options.limit=20]
 * @returns {object[]}
 */
export function getDormantRelationships(db, config, { days = 60, minStrength = 0.3, limit = 20 } = {}) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const rows = db.query(
      `SELECT
        r.id as relationship_id,
        r.relationship_type,
        r.strength,
        r.created_at as relationship_created,
        s.id as source_id, s.name as source_name, s.type as source_type,
        t.id as target_id, t.name as target_name, t.type as target_type,
        MAX(COALESCE(sm.created_at, '2000-01-01')) as source_last_memory,
        MAX(COALESCE(tm.created_at, '2000-01-01')) as target_last_memory
      FROM relationships r
      JOIN entities s ON r.source_entity_id = s.id
      JOIN entities t ON r.target_entity_id = t.id
      LEFT JOIN memory_entities sme ON sme.entity_id = s.id
      LEFT JOIN memories sm ON sme.memory_id = sm.id
      LEFT JOIN memory_entities tme ON tme.entity_id = t.id
      LEFT JOIN memories tm ON tme.memory_id = tm.id
      WHERE r.strength >= ?
        AND r.invalid_at IS NULL
      GROUP BY r.id
      HAVING MAX(source_last_memory) < ? AND MAX(target_last_memory) < ?
      ORDER BY r.strength DESC, source_last_memory ASC
      LIMIT ?`,
      [minStrength, cutoff, cutoff, limit],
    ) || [];

    const now = new Date();
    return rows.map(row => {
      const sourceLast = new Date(row.source_last_memory);
      const targetLast = new Date(row.target_last_memory);
      const mostRecent = sourceLast > targetLast ? sourceLast : targetLast;
      const daysDormant = Math.floor((now - mostRecent) / (1000 * 60 * 60 * 24));

      return {
        relationship_id: row.relationship_id,
        relationship_type: row.relationship_type,
        strength: row.strength,
        source: {
          id: row.source_id,
          name: row.source_name,
          type: row.source_type,
        },
        target: {
          id: row.target_id,
          name: row.target_name,
          type: row.target_type,
        },
        days_dormant: daysDormant,
        last_activity: mostRecent.toISOString(),
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 12. getReflections() -- Retrieve reflections with filters (sync)
// ---------------------------------------------------------------------------

/**
 * Get reflections with optional filtering.
 *
 * @param {object} db
 * @param {object} config
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {string[]} [options.reflectionTypes]
 * @param {number} [options.minImportance=0.1]
 * @param {string} [options.aboutEntity]
 * @returns {object[]}
 */
export function getReflections(db, config, {
  limit = 20,
  reflectionTypes,
  minImportance = 0.1,
  aboutEntity,
} = {}) {
  let sql = `
    SELECT r.*, e.name as entity_name
    FROM reflections r
    LEFT JOIN entities e ON r.about_entity_id = e.id
    WHERE r.importance >= ?
  `;
  const params = [minImportance];

  if (reflectionTypes && reflectionTypes.length > 0) {
    const ph = reflectionTypes.map(() => '?').join(', ');
    sql += ` AND r.reflection_type IN (${ph})`;
    params.push(...reflectionTypes);
  }

  if (aboutEntity) {
    const canonical = canonicalName(aboutEntity);
    sql += ' AND e.canonical_name = ?';
    params.push(canonical);
  }

  sql += ' ORDER BY r.importance DESC, r.last_confirmed_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.query(sql, params) || [];

  return rows.map(row => ({
    id: row.id,
    content: row.content,
    reflection_type: row.reflection_type,
    importance: row.importance,
    confidence: row.confidence,
    about_entity: row.entity_name,
    first_observed_at: row.first_observed_at,
    last_confirmed_at: row.last_confirmed_at,
    aggregation_count: row.aggregation_count,
    episode_id: row.episode_id,
    score: row.importance,
  }));
}

// ---------------------------------------------------------------------------
// 13. searchReflections() -- Search reflections by content (async)
// ---------------------------------------------------------------------------

/**
 * Semantic search for reflections.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.limit=10]
 * @param {string[]} [options.reflectionTypes]
 * @returns {Promise<object[]>}
 */
export async function searchReflections(db, config, query, { limit = 10, reflectionTypes } = {}) {
  const queryEmbedding = await embed(query);

  let results = [];

  if (queryEmbedding) {
    try {
      let sql = `
        SELECT r.*, e.name as entity_name, (1.0 / (1.0 + re.distance)) as vector_score
        FROM reflection_embeddings re
        JOIN reflections r ON r.id = re.reflection_id
        LEFT JOIN entities e ON r.about_entity_id = e.id
        WHERE re.embedding MATCH ?
      `;
      const params = [JSON.stringify(queryEmbedding)];

      if (reflectionTypes && reflectionTypes.length > 0) {
        const ph = reflectionTypes.map(() => '?').join(', ');
        sql += ` AND r.reflection_type IN (${ph})`;
        params.push(...reflectionTypes);
      }

      sql += ' ORDER BY vector_score DESC LIMIT ?';
      params.push(limit);

      const rows = db.query(sql, params) || [];

      results = rows.map(row => ({
        id: row.id,
        content: row.content,
        reflection_type: row.reflection_type,
        importance: row.importance,
        confidence: row.confidence,
        about_entity: row.entity_name,
        first_observed_at: row.first_observed_at,
        last_confirmed_at: row.last_confirmed_at,
        aggregation_count: row.aggregation_count,
        episode_id: row.episode_id,
        score: row.vector_score,
      }));
    } catch {
      // Reflection vector search failed
    }
  }

  // Fallback to keyword search if vector search failed or returned nothing
  if (results.length === 0) {
    let sql = `
      SELECT r.*, e.name as entity_name
      FROM reflections r
      LEFT JOIN entities e ON r.about_entity_id = e.id
      WHERE r.content LIKE ?
    `;
    const params = [`%${query}%`];

    if (reflectionTypes && reflectionTypes.length > 0) {
      const ph = reflectionTypes.map(() => '?').join(', ');
      sql += ` AND r.reflection_type IN (${ph})`;
      params.push(...reflectionTypes);
    }

    sql += ' ORDER BY r.importance DESC LIMIT ?';
    params.push(limit);

    const rows = db.query(sql, params) || [];

    results = rows.map(row => ({
      id: row.id,
      content: row.content,
      reflection_type: row.reflection_type,
      importance: row.importance,
      confidence: row.confidence,
      about_entity: row.entity_name,
      first_observed_at: row.first_observed_at,
      last_confirmed_at: row.last_confirmed_at,
      aggregation_count: row.aggregation_count,
      episode_id: row.episode_id,
      score: 0.5, // Default score for keyword match
    }));
  }

  return results;
}

// ---------------------------------------------------------------------------
// 14. fetchByIds() -- Fetch memories by ID list (sync)
// ---------------------------------------------------------------------------

/**
 * Fetch specific memories by their IDs.
 *
 * @param {object} db
 * @param {object} config
 * @param {number[]} memoryIds
 * @returns {object[]}
 */
export function fetchByIds(db, config, memoryIds) {
  if (!memoryIds || memoryIds.length === 0) return [];

  const placeholders = memoryIds.map(() => '?').join(', ');
  const rows = db.query(
    `SELECT m.*, GROUP_CONCAT(e.name) as entity_names
     FROM memories m
     LEFT JOIN memory_entities me2 ON m.id = me2.memory_id
     LEFT JOIN entities e ON me2.entity_id = e.id
     WHERE m.id IN (${placeholders})
     GROUP BY m.id`,
    memoryIds,
  ) || [];

  const now = new Date();
  return rows.map(row => rowToResult(row, 0.0, 0.0, now, config));
}

// ---------------------------------------------------------------------------
// 15. traceMemory() -- Provenance chain (sync)
// ---------------------------------------------------------------------------

/**
 * Reconstruct full provenance for a memory.
 *
 * @param {object} db
 * @param {object} config
 * @param {number} memoryId
 * @returns {object}
 */
export function traceMemory(db, config, memoryId) {
  const result = {
    memory: null,
    episode: null,
    archived_turns: null,
    source_file: null,
    source_file_preview: null,
    entities: [],
  };

  // 1. Fetch the memory row
  const memoryRow = db.queryOne('SELECT * FROM memories WHERE id = ?', [memoryId]);
  if (!memoryRow) return result;

  result.memory = {
    id: memoryRow.id,
    content: memoryRow.content,
    type: memoryRow.type,
    importance: memoryRow.importance,
    confidence: memoryRow.confidence,
    source: rowGet(memoryRow, 'source'),
    source_id: rowGet(memoryRow, 'source_id'),
    source_context: rowGet(memoryRow, 'source_context'),
    created_at: memoryRow.created_at,
    updated_at: memoryRow.updated_at,
    access_count: memoryRow.access_count,
  };

  // 2. Fetch related entities
  const entityRows = db.query(
    `SELECT e.name, e.type FROM entities e
     JOIN memory_entities me ON e.id = me.entity_id
     WHERE me.memory_id = ?`,
    [memoryId],
  ) || [];
  result.entities = entityRows.map(r => ({ name: r.name, type: r.type }));

  // 3. If source_id points to an episode, fetch it with archived turns
  const sourceId = result.memory.source_id;
  if (sourceId) {
    try {
      const episodeId = parseInt(sourceId, 10);
      if (!isNaN(episodeId)) {
        const episodeRow = db.queryOne('SELECT * FROM episodes WHERE id = ?', [episodeId]);
        if (episodeRow) {
          result.episode = {
            id: episodeRow.id,
            narrative: rowGet(episodeRow, 'narrative'),
            started_at: episodeRow.started_at,
            ended_at: rowGet(episodeRow, 'ended_at'),
            key_topics: episodeRow.key_topics ? JSON.parse(episodeRow.key_topics) : [],
          };

          // Fetch archived turns
          const turnRows = db.query(
            `SELECT turn_number, user_content, assistant_content, created_at
             FROM turn_buffer
             WHERE episode_id = ? AND is_archived = 1
             ORDER BY turn_number ASC`,
            [episodeId],
          ) || [];
          if (turnRows.length > 0) {
            result.archived_turns = turnRows.map(r => ({
              turn: r.turn_number,
              user: r.user_content,
              assistant: r.assistant_content,
              timestamp: r.created_at,
            }));
          }
        }
      }
    } catch {
      // source_id wasn't a numeric episode ID
    }
  }

  // 4. Check for source material file on disk (legacy path)
  try {
    const sourcesDir = join(dirname(db.dbPath), 'sources');
    const sourceFile = join(sourcesDir, `${memoryId}.md`);
    if (existsSync(sourceFile)) {
      result.source_file = sourceFile;
      try {
        let fileText = readFileSync(sourceFile, 'utf-8');
        // Skip frontmatter for preview
        if (fileText.startsWith('---')) {
          const endIdx = fileText.indexOf('---', 3);
          if (endIdx !== -1) {
            fileText = fileText.slice(endIdx + 3).trim();
          }
        }
        result.source_file_preview = fileText.slice(0, 200);
      } catch {
        result.source_file_preview = '(could not read file)';
      }
    }
  } catch {
    // File system access may fail
  }

  // 5. Check for linked documents via memory_sources (provenance)
  try {
    const docRows = db.query(
      `SELECT d.id, d.filename, d.source_type, d.summary,
              d.storage_path, d.created_at, ms.excerpt
       FROM documents d
       JOIN memory_sources ms ON d.id = ms.document_id
       WHERE ms.memory_id = ?
       ORDER BY d.created_at DESC`,
      [memoryId],
    ) || [];
    if (docRows.length > 0) {
      result.documents = docRows.map(r => ({
        id: r.id,
        filename: r.filename,
        source_type: r.source_type,
        summary: r.summary,
        excerpt: r.excerpt,
        storage_path: r.storage_path,
        created_at: r.created_at,
      }));
    }
  } catch {
    // Graceful degradation if documents table doesn't exist yet
  }

  // 6. Build provenance chain
  result.provenance_chain = buildProvenanceChain(memoryRow, result);

  // 7. Fetch audit trail for this memory
  try {
    const auditRows = db.query(
      `SELECT operation, details, timestamp
       FROM audit_log
       WHERE memory_id = ?
       ORDER BY timestamp ASC`,
      [memoryId],
    ) || [];
    if (auditRows.length > 0) {
      result.audit_trail = auditRows.map(r => ({
        operation: r.operation,
        details: r.details,
        timestamp: r.timestamp,
      }));
    }
  } catch {
    // audit_log may not exist
  }

  return result;
}

// ---------------------------------------------------------------------------
// 16. getBriefing() -- Compact session-start data (sync)
// ---------------------------------------------------------------------------

/**
 * Get compact session-start briefing data.
 *
 * @param {object} db
 * @param {object} config
 * @returns {object}
 */
export function getBriefing(db, config) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Memory counts
  const totalRow = db.queryOne(
    "SELECT COUNT(*) as cnt FROM memories WHERE invalidated_at IS NULL",
  );
  const recentRow = db.queryOne(
    "SELECT COUNT(*) as cnt FROM memories WHERE created_at >= ? AND invalidated_at IS NULL",
    [oneDayAgo],
  );
  const entityRow = db.queryOne(
    "SELECT COUNT(*) as cnt FROM entities WHERE deleted_at IS NULL",
  );

  // Recent memories (last 24h)
  const recentMemories = db.query(
    `SELECT m.content, m.type, m.importance, GROUP_CONCAT(e.name) as entity_names
     FROM memories m
     LEFT JOIN memory_entities me ON m.id = me.memory_id
     LEFT JOIN entities e ON me.entity_id = e.id
     WHERE m.created_at >= ? AND m.invalidated_at IS NULL
     GROUP BY m.id
     ORDER BY m.importance DESC
     LIMIT 10`,
    [oneDayAgo],
  ) || [];

  // Upcoming deadlines (next 7 days)
  const deadlines = recallUpcomingDeadlines(db, config, { daysAhead: 7, includeOverdue: true });

  // Active reflections
  const reflections = getActiveReflections(db, config);

  // Recent sessions
  let recentSessions = [];
  try {
    recentSessions = db.query(
      `SELECT id, session_id, narrative, started_at, key_topics
       FROM episodes
       WHERE is_summarized = 1 AND started_at >= ?
       ORDER BY started_at DESC
       LIMIT 3`,
      [sevenDaysAgo],
    ) || [];
    recentSessions = recentSessions.map(row => ({
      episode_id: row.id,
      narrative: row.narrative,
      started_at: row.started_at,
      key_topics: row.key_topics ? JSON.parse(row.key_topics) : [],
    }));
  } catch {
    // episodes table may not exist
  }

  return {
    counts: {
      total_memories: totalRow ? totalRow.cnt : 0,
      recent_24h: recentRow ? recentRow.cnt : 0,
      total_entities: entityRow ? entityRow.cnt : 0,
    },
    recent_memories: recentMemories.map(r => ({
      content: r.content,
      type: r.type,
      importance: r.importance,
      entities: r.entity_names ? r.entity_names.split(',').map(s => s.trim()) : [],
    })),
    upcoming_deadlines: deadlines.slice(0, 5),
    active_reflections: reflections,
    recent_sessions: recentSessions,
  };
}

// ---------------------------------------------------------------------------
// 17. getProjectHealth() -- Project-specific metrics (sync)
// ---------------------------------------------------------------------------

/**
 * Project relationship velocity projection.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} entityName
 * @param {object} [options]
 * @param {number} [options.daysAhead=30]
 * @returns {object}
 */
export function getProjectHealth(db, config, entityName, { daysAhead = 30 } = {}) {
  const canonical = canonicalName(entityName);
  const entity = db.queryOne(
    'SELECT * FROM entities WHERE canonical_name = ? AND deleted_at IS NULL',
    [canonical],
  );

  if (!entity) {
    return { error: `Entity '${entityName}' not found` };
  }

  const lastContact = rowGet(entity, 'last_contact_at');
  const frequency = rowGet(entity, 'contact_frequency_days');
  const trend = rowGet(entity, 'contact_trend', 'unknown') || 'unknown';

  // If no velocity data, return basic info
  if (!lastContact || !frequency) {
    return {
      entity: entity.name,
      status: 'insufficient_data',
      trend,
      message: 'Not enough contact history to project. Need at least 2 recorded interactions.',
    };
  }

  let lastDt;
  try {
    lastDt = new Date(lastContact);
    if (isNaN(lastDt.getTime())) throw new Error('Invalid date');
  } catch {
    return { entity: entity.name, status: 'parse_error' };
  }

  const now = new Date();
  const daysSince = Math.floor((now - lastDt) / (1000 * 60 * 60 * 24));

  // Dormancy threshold: 2x average frequency
  const dormancyThreshold = frequency * 2.0;

  // Apply trend modifiers
  const trendMultiplier = {
    accelerating: 0.7,
    stable: 1.0,
    decelerating: 1.3,
    dormant: 1.5,
  }[trend] || 1.0;

  const projectedDaysToDormancy = dormancyThreshold * trendMultiplier;
  const projectedDormantDate = new Date(lastDt.getTime() + projectedDaysToDormancy * 24 * 60 * 60 * 1000);

  // Recommended contact: at 1x frequency from last contact (or now if overdue)
  let recommendedContactDate = new Date(lastDt.getTime() + frequency * 24 * 60 * 60 * 1000);
  if (recommendedContactDate < now) {
    recommendedContactDate = now;
  }

  // Risk level
  const daysUntilDormant = Math.floor((projectedDormantDate - now) / (1000 * 60 * 60 * 24));
  let riskLevel;
  if (daysUntilDormant <= 0) riskLevel = 'dormant';
  else if (daysUntilDormant <= 7) riskLevel = 'critical';
  else if (daysUntilDormant <= 14) riskLevel = 'high';
  else if (daysUntilDormant <= 30) riskLevel = 'medium';
  else riskLevel = 'low';

  // Check for open commitments
  const openCommitments = db.query(
    `SELECT m.content FROM memories m
     JOIN memory_entities me ON m.id = me.memory_id
     WHERE me.entity_id = ?
       AND m.type = 'commitment'
       AND m.invalidated_at IS NULL
     ORDER BY m.importance DESC
     LIMIT 5`,
    [entity.id],
  ) || [];

  return {
    entity: entity.name,
    days_since_contact: daysSince,
    contact_frequency_days: Math.round(frequency * 10) / 10,
    trend,
    attention_tier: rowGet(entity, 'attention_tier', 'standard'),
    projected_dormant_date: projectedDormantDate.toISOString().slice(0, 10),
    days_until_dormant: Math.max(0, daysUntilDormant),
    recommended_contact_date: recommendedContactDate.toISOString().slice(0, 10),
    risk_level: riskLevel,
    open_commitments: openCommitments.map(c => c.content),
  };
}

// ---------------------------------------------------------------------------
// Additional methods
// ---------------------------------------------------------------------------

/**
 * Get high-value reflections for session context.
 *
 * @param {object} db
 * @param {object} config
 * @param {object} [options]
 * @param {number} [options.limit=5]
 * @param {number} [options.minImportance=0.6]
 * @returns {object[]}
 */
export function getActiveReflections(db, config, { limit = 5, minImportance = 0.6 } = {}) {
  const rows = db.query(
    `SELECT r.*, e.name as entity_name
     FROM reflections r
     LEFT JOIN entities e ON r.about_entity_id = e.id
     WHERE r.importance >= ?
     ORDER BY r.importance DESC, r.last_confirmed_at DESC
     LIMIT ?`,
    [minImportance, limit],
  ) || [];

  return rows.map(row => ({
    id: row.id,
    content: row.content,
    reflection_type: row.reflection_type,
    importance: row.importance,
    confidence: row.confidence,
    about_entity: row.entity_name,
    first_observed_at: row.first_observed_at,
    last_confirmed_at: row.last_confirmed_at,
    aggregation_count: row.aggregation_count,
    episode_id: row.episode_id,
    score: row.importance,
  }));
}

/**
 * Get a single reflection by ID.
 *
 * @param {object} db
 * @param {object} config
 * @param {number} reflectionId
 * @returns {object|null}
 */
export function getReflectionById(db, config, reflectionId) {
  const row = db.queryOne(
    `SELECT r.*, e.name as entity_name
     FROM reflections r
     LEFT JOIN entities e ON r.about_entity_id = e.id
     WHERE r.id = ?`,
    [reflectionId],
  );

  if (!row) return null;

  return {
    id: row.id,
    content: row.content,
    reflection_type: row.reflection_type,
    importance: row.importance,
    confidence: row.confidence,
    about_entity: row.entity_name,
    first_observed_at: row.first_observed_at,
    last_confirmed_at: row.last_confirmed_at,
    aggregation_count: row.aggregation_count,
    episode_id: row.episode_id,
    score: row.importance,
  };
}

/**
 * Get recent memories within a time window.
 *
 * @param {object} db
 * @param {object} config
 * @param {object} [options]
 * @param {number} [options.limit=10]
 * @param {string[]} [options.memoryTypes]
 * @param {number} [options.hours=24]
 * @param {string} [options.sourceFilter]
 * @returns {object[]}
 */
export function getRecentMemories(db, config, { limit = 10, memoryTypes, hours = 24, sourceFilter } = {}) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let sql = `
    SELECT m.*, GROUP_CONCAT(e.name) as entity_names
    FROM memories m
    LEFT JOIN memory_entities me ON m.id = me.memory_id
    LEFT JOIN entities e ON me.entity_id = e.id
    WHERE m.created_at >= ?
    AND m.invalidated_at IS NULL
    AND (m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'archived')
  `;
  const params = [cutoff];

  if (memoryTypes && memoryTypes.length > 0) {
    const ph = memoryTypes.map(() => '?').join(', ');
    sql += ` AND m.type IN (${ph})`;
    params.push(...memoryTypes);
  }

  if (sourceFilter) {
    sql += ' AND m.source = ?';
    params.push(sourceFilter);
  }

  sql += ' GROUP BY m.id ORDER BY m.created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.query(sql, params) || [];

  return rows.map(row => ({
    id: row.id,
    content: row.content,
    type: row.type,
    score: row.importance,
    importance: row.importance,
    created_at: row.created_at,
    entities: row.entity_names ? row.entity_names.split(',').map(s => s.trim()) : [],
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    source: rowGet(row, 'source'),
    source_id: rowGet(row, 'source_id'),
    source_context: rowGet(row, 'source_context'),
    lifecycle_tier: rowGet(row, 'lifecycle_tier'),
    fact_id: rowGet(row, 'fact_id'),
  }));
}

/**
 * Search episode narratives by semantic similarity.
 *
 * @param {object} db
 * @param {object} config
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.limit=5]
 * @returns {Promise<object[]>}
 */
export async function recallEpisodes(db, config, query, { limit = 5 } = {}) {
  const queryEmbedding = await embed(query);

  let rows;

  if (queryEmbedding) {
    try {
      rows = db.query(
        `SELECT e.*, (1.0 / (1.0 + ee.distance)) as relevance
         FROM episode_embeddings ee
         JOIN episodes e ON e.id = ee.episode_id
         WHERE ee.embedding MATCH ?
         AND e.is_summarized = 1
         ORDER BY relevance DESC
         LIMIT ?`,
        [JSON.stringify(queryEmbedding), limit],
      ) || [];
    } catch {
      // Vector search failed, fall back to keyword
      rows = db.query(
        `SELECT e.*, 0.5 as relevance
         FROM episodes e
         WHERE e.narrative LIKE ?
         AND e.is_summarized = 1
         ORDER BY e.started_at DESC
         LIMIT ?`,
        [`%${query}%`, limit],
      ) || [];
    }
  } else {
    rows = db.query(
      `SELECT e.*, 0.5 as relevance
       FROM episodes e
       WHERE e.narrative LIKE ?
       AND e.is_summarized = 1
       ORDER BY e.started_at DESC
       LIMIT ?`,
      [`%${query}%`, limit],
    ) || [];
  }

  return rows.map(row => ({
    episode_id: row.id,
    session_id: row.session_id,
    narrative: row.narrative,
    summary: row.summary,
    started_at: row.started_at,
    ended_at: row.ended_at,
    key_topics: row.key_topics ? JSON.parse(row.key_topics) : [],
    relevance: row.relevance,
  }));
}

/**
 * Find potential duplicate entities using fuzzy name matching.
 *
 * @param {object} db
 * @param {object} config
 * @param {object} [options]
 * @param {number} [options.threshold=0.85]
 * @param {string} [options.entityType]
 * @param {number} [options.limit=50]
 * @returns {object[]}
 */
export function findDuplicateEntities(db, config, { threshold = 0.85, entityType, limit = 50 } = {}) {
  let sql = `
    SELECT id, name, canonical_name, type, importance
    FROM entities
    WHERE deleted_at IS NULL
  `;
  const params = [];
  if (entityType) {
    sql += ' AND type = ?';
    params.push(entityType);
  }

  const entities = db.query(sql, params) || [];
  const duplicates = [];
  const seenPairs = new Set();

  for (let i = 0; i < entities.length; i++) {
    const e1 = entities[i];
    for (let j = i + 1; j < entities.length; j++) {
      const e2 = entities[j];

      // Skip if different types
      if (e1.type !== e2.type) continue;

      const pairKey = `${Math.min(e1.id, e2.id)}-${Math.max(e1.id, e2.id)}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const ratio = nameSimilarity(e1.canonical_name, e2.canonical_name);

      if (ratio >= threshold) {
        duplicates.push({
          entity_1: {
            id: e1.id,
            name: e1.name,
            type: e1.type,
            importance: e1.importance,
          },
          entity_2: {
            id: e2.id,
            name: e2.name,
            type: e2.type,
            importance: e2.importance,
          },
          similarity: Math.round(ratio * 1000) / 1000,
        });

        if (duplicates.length >= limit) break;
      }
    }
    if (duplicates.length >= limit) break;
  }

  // Sort by similarity descending
  duplicates.sort((a, b) => b.similarity - a.similarity);
  return duplicates;
}

/**
 * Generate a community-style overview of one or more entities.
 *
 * @param {object} db
 * @param {object} config
 * @param {string[]} entityNames
 * @param {object} [options]
 * @param {boolean} [options.includeNetwork=true]
 * @param {boolean} [options.includeSummaries=true]
 * @returns {object}
 */
export function entityOverview(db, config, entityNames, { includeNetwork = true, includeSummaries = true } = {}) {
  const result = {
    entities: [],
    cross_entity_patterns: [],
    clusters: [],
    relationship_map: [],
    open_commitments: [],
  };

  const entityIds = [];
  for (const name of entityNames) {
    const canonical = canonicalName(name);
    let entity = db.queryOne(
      'SELECT * FROM entities WHERE canonical_name = ? AND deleted_at IS NULL',
      [canonical],
    );
    if (!entity) {
      entity = db.queryOne(
        'SELECT * FROM entities WHERE canonical_name LIKE ? AND deleted_at IS NULL',
        [`%${canonical}%`],
      );
    }
    if (entity) {
      entityIds.push(entity.id);

      const entityData = {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        importance: entity.importance,
        attention_tier: rowGet(entity, 'attention_tier', 'standard'),
        contact_trend: rowGet(entity, 'contact_trend'),
      };

      // Attach cached summary if available
      if (includeSummaries) {
        try {
          const summary = db.queryOne(
            "SELECT * FROM entity_summaries WHERE entity_id = ? AND summary_type = 'overview'",
            [entity.id],
          );
          if (summary) {
            entityData.summary = summary.summary;
            entityData.summary_generated_at = summary.generated_at;
          }
        } catch {
          // entity_summaries table may not exist
        }
      }

      result.entities.push(entityData);
    }
  }

  if (entityIds.length === 0) return result;

  // Cross-entity relationships
  if (entityIds.length >= 2) {
    for (let i = 0; i < entityIds.length; i++) {
      for (let j = i + 1; j < entityIds.length; j++) {
        const rels = db.query(
          `SELECT r.relationship_type, r.strength, r.origin_type,
                  s.name as source_name, t.name as target_name
           FROM relationships r
           JOIN entities s ON r.source_entity_id = s.id
           JOIN entities t ON r.target_entity_id = t.id
           WHERE ((r.source_entity_id = ? AND r.target_entity_id = ?)
               OR (r.source_entity_id = ? AND r.target_entity_id = ?))
             AND r.invalid_at IS NULL`,
          [entityIds[i], entityIds[j], entityIds[j], entityIds[i]],
        ) || [];
        for (const rel of rels) {
          result.relationship_map.push({
            source: rel.source_name,
            target: rel.target_name,
            type: rel.relationship_type,
            strength: rel.strength,
            origin: rel.origin_type,
          });
        }
      }
    }
  }

  // Network connections for each entity (1-hop)
  if (includeNetwork) {
    for (const eid of entityIds) {
      const neighbors = expandGraphWeighted(db, eid, 1, 10);
      for (const n of neighbors) {
        if (!entityIds.includes(n.id)) {
          const sourceName = result.entities.find(e => e.id === eid)?.name || 'unknown';
          result.relationship_map.push({
            source: sourceName,
            target: n.name,
            type: n.via_relationship || 'connected_to',
            strength: n.path_strength || 0.5,
            hop: 1,
          });
        }
      }
    }
  }

  // Co-mentioned memories across the queried entities
  if (entityIds.length >= 2) {
    const ph = entityIds.map(() => '?').join(', ');
    const coMemories = db.query(
      `SELECT m.content, m.type, m.importance,
              GROUP_CONCAT(e.name) as entity_names,
              COUNT(DISTINCT me.entity_id) as entity_hit_count
       FROM memories m
       JOIN memory_entities me ON m.id = me.memory_id
       JOIN entities e ON me.entity_id = e.id
       WHERE me.entity_id IN (${ph})
         AND m.invalidated_at IS NULL
       GROUP BY m.id
       HAVING entity_hit_count >= 2
       ORDER BY m.importance DESC
       LIMIT 10`,
      entityIds,
    ) || [];

    for (const mem of coMemories) {
      result.cross_entity_patterns.push({
        content: mem.content,
        type: mem.type,
        importance: mem.importance,
        entities_involved: mem.entity_names ? mem.entity_names.split(',').map(s => s.trim()) : [],
      });
    }
  }

  // Open commitments across all entities
  const ph = entityIds.map(() => '?').join(', ');
  const commitments = db.query(
    `SELECT m.content, m.deadline_at, e.name as entity_name
     FROM memories m
     JOIN memory_entities me ON m.id = me.memory_id
     JOIN entities e ON me.entity_id = e.id
     WHERE me.entity_id IN (${ph})
       AND m.type = 'commitment'
       AND m.invalidated_at IS NULL
     ORDER BY m.deadline_at ASC, m.importance DESC
     LIMIT 10`,
    entityIds,
  ) || [];

  for (const c of commitments) {
    result.open_commitments.push({
      content: c.content,
      deadline: c.deadline_at,
      entity: c.entity_name,
    });
  }

  return result;
}
