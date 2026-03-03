/**
 * Remember Service for Claudia CLI (Node.js port).
 *
 * Port of memory-daemon/claudia_memory/services/remember.py.
 *
 * Handles storing memories, entities, relationships, conversation turns,
 * session finalization, reflections, corrections, invalidations, merges,
 * and batch operations.
 *
 * All functions take `db` (ClaudiaDatabase instance) as the first parameter.
 * Functions that need embeddings are async; pure-DB functions are synchronous.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { contentHash } from '../core/database.js';
import { getConfig } from '../core/config.js';
import { embed, embedBatch } from '../core/embeddings.js';

/**
 * Convert a JS number[] embedding to Float32Array for sqlite-vec.
 * better-sqlite3 requires Float32Array (not JSON strings) for vec0 virtual tables.
 * @param {number[]} embedding
 * @returns {Float32Array}
 */
function toVecParam(embedding) {
  return new Float32Array(embedding);
}

/**
 * Wrap a primary key as BigInt for vec0 INSERT statements.
 * sqlite-vec v0.1.6 + better-sqlite3 requires BigInt for INTEGER PRIMARY KEY
 * columns in vec0 virtual tables (JS numbers are doubles, not SQLite integers).
 * @param {number} id
 * @returns {bigint}
 */
function toVecId(id) {
  return BigInt(id);
}
import {
  validateMemory,
  validateEntity,
  validateRelationship,
  canonicalName,
  ORIGIN_STRENGTH_CEILING,
  REINFORCEMENT_BY_ORIGIN,
} from '../core/guards.js';
import { auditLog } from './audit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _now() {
  return new Date().toISOString();
}

/**
 * Compute SHA-256 chain hash for memory integrity verification.
 * @param {string} content
 * @param {object|null} metadata
 * @param {string|null} prevHash
 * @returns {string}
 */
function _computeChainHash(content, metadata, prevHash) {
  const metaStr = metadata ? JSON.stringify(metadata, Object.keys(metadata).sort()) : '';
  const payload = `${content}|${metaStr}|${prevHash || ''}`;
  return createHash('sha256').update(payload, 'utf-8').digest('hex');
}

/**
 * Safe audit log wrapper. Audit failures never crash the caller.
 */
function _audit(db, operation, options = {}) {
  try {
    auditLog(db, operation, options);
  } catch {
    // Swallow audit errors
  }
}

// ---------------------------------------------------------------------------
// Entity lookup helpers
// ---------------------------------------------------------------------------

/**
 * Find entity by name (canonical match or alias), or create if not found.
 * Synchronous helper (entity creation itself calls rememberEntity which needs
 * to be called in an async context for embeddings, but this sync version
 * skips embedding for the quick-create path used internally).
 *
 * @param {object} db
 * @param {string} name
 * @param {string} [entityType='person']
 * @returns {number|null} Entity ID
 */
function _findOrCreateEntitySync(db, name, entityType = 'person') {
  const canonical = canonicalName(name);

  // Try exact canonical match
  const existing = db.queryOne(
    'SELECT id FROM entities WHERE canonical_name = ?',
    [canonical]
  );
  if (existing) return existing.id;

  // Try alias match
  const aliasMatch = db.queryOne(
    'SELECT entity_id FROM entity_aliases WHERE canonical_alias = ?',
    [canonical]
  );
  if (aliasMatch) return aliasMatch.entity_id;

  // Create new entity (no embedding in sync path; embedding added later if needed)
  const now = _now();
  const id = db.insert('entities', {
    name,
    type: entityType,
    canonical_name: canonical,
    importance: 1.0,
    created_at: now,
    updated_at: now,
  });

  _audit(db, 'entity_create', { details: { name, type: entityType } });
  return id;
}

/**
 * Async version of find-or-create that generates embeddings for new entities.
 * @param {object} db
 * @param {string} name
 * @param {string} [entityType='person']
 * @returns {Promise<number|null>} Entity ID
 */
async function _findOrCreateEntity(db, name, entityType = 'person') {
  const canonical = canonicalName(name);

  const existing = db.queryOne(
    'SELECT id FROM entities WHERE canonical_name = ?',
    [canonical]
  );
  if (existing) return existing.id;

  const aliasMatch = db.queryOne(
    'SELECT entity_id FROM entity_aliases WHERE canonical_alias = ?',
    [canonical]
  );
  if (aliasMatch) return aliasMatch.entity_id;

  // Create new entity with embedding
  return rememberEntity(db, name, entityType);
}

// ---------------------------------------------------------------------------
// Episode helper
// ---------------------------------------------------------------------------

/**
 * Create a new episode.
 * @param {object} db
 * @param {string|null} [source=null]
 * @returns {number} Episode ID
 */
function _getOrCreateEpisode(db, source = null) {
  const sessionId = randomUUID();
  const data = {
    session_id: sessionId,
    started_at: _now(),
    message_count: 0,
  };
  if (source) data.source = source;
  return db.insert('episodes', data);
}

// ---------------------------------------------------------------------------
// rememberFact
// ---------------------------------------------------------------------------

/**
 * Store a discrete fact/memory.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {string} content - The memory content
 * @param {object} [options]
 * @param {string} [options.memoryType='fact'] - fact, preference, observation, learning, commitment, pattern
 * @param {string[]} [options.aboutEntities] - List of entity names this memory relates to
 * @param {number} [options.importance=1.0] - 0.0-1.0
 * @param {number} [options.confidence=1.0] - 0.0-1.0
 * @param {string} [options.source] - Where this came from
 * @param {string} [options.sourceId] - Reference to source
 * @param {string} [options.sourceContext] - One-line breadcrumb
 * @param {object} [options.metadata] - Additional metadata
 * @param {string} [options.originType] - user_stated, extracted, inferred, corrected
 * @param {string} [options.sourceChannel] - claude_code, telegram, slack
 * @param {boolean} [options.critical=false] - If true, mark sacred (immune to decay)
 * @param {string} [options.factId] - UUID for the memory; auto-generated if omitted
 * @param {number[]} [options.precomputedEmbedding] - Skip Ollama call if provided
 * @returns {Promise<number|null>} Memory ID or null if duplicate
 */
export async function rememberFact(db, content, options = {}) {
  const {
    memoryType = 'fact',
    aboutEntities = null,
    importance: rawImportance = 1.0,
    confidence = 1.0,
    source = null,
    sourceId = null,
    sourceContext = null,
    metadata = null,
    originType: rawOriginType = null,
    sourceChannel = null,
    critical = false,
    factId: rawFactId = null,
    precomputedEmbedding = null,
  } = options;

  let importance = rawImportance;
  let originType = rawOriginType;
  let factId = rawFactId;

  // Check for duplicate
  const memHash = contentHash(content);
  const existing = db.queryOne(
    'SELECT id, access_count FROM memories WHERE content_hash = ?',
    [memHash]
  );
  if (existing) {
    // Update access count and timestamp
    db.update(
      'memories',
      {
        last_accessed_at: _now(),
        access_count: (existing.access_count || 0) + 1,
      },
      'id = ?',
      [existing.id]
    );
    return existing.id;
  }

  if (!factId) {
    factId = randomUUID();
  }

  // Run deterministic guards
  const guardResult = validateMemory(content, memoryType, importance);
  for (const w of guardResult.warnings) {
    process.stderr.write(`[remember] Memory guard: ${w}\n`);
  }
  if ('content' in guardResult.adjustments) {
    content = guardResult.adjustments.content;
  }
  if ('importance' in guardResult.adjustments) {
    importance = guardResult.adjustments.importance;
  }

  // Determine origin_type (Trust North Star)
  if (!originType) {
    if (source === 'conversation' && importance >= 0.9) {
      originType = 'user_stated';
    } else if (['transcript', 'email', 'document', 'session_summary'].includes(source)) {
      originType = 'extracted';
    } else {
      originType = 'inferred';
    }
  }

  // Extract deadline for commitments (temporal intelligence)
  let deadlineAt = null;
  let temporalMarkersJson = null;
  if (memoryType === 'commitment') {
    try {
      // Simple deadline extraction from guards
      const { hasDeadlinePattern } = await import('../core/guards.js');
      if (hasDeadlinePattern(content)) {
        // Extract date-like patterns for the deadline_at field
        const dateMatch = content.match(
          /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/
        );
        if (dateMatch) {
          deadlineAt = dateMatch[1];
        }
      }
    } catch {
      // Deadline extraction is best-effort
    }
  }

  // Insert new memory
  const now = _now();
  const insertData = {
    content,
    content_hash: memHash,
    type: memoryType,
    importance,
    confidence,
    source,
    source_id: sourceId,
    created_at: now,
    updated_at: now,
    metadata: metadata ? JSON.stringify(metadata) : null,
    origin_type: originType,
    fact_id: factId,
  };
  if (sourceContext) insertData.source_context = sourceContext;
  if (sourceChannel) insertData.source_channel = sourceChannel;
  if (deadlineAt) insertData.deadline_at = deadlineAt;
  if (temporalMarkersJson) insertData.temporal_markers = temporalMarkersJson;
  if (critical) {
    insertData.lifecycle_tier = 'sacred';
    insertData.sacred_reason = 'user-protected';
  }

  const memoryId = db.insert('memories', insertData);

  // SHA-256 chain linking for memory integrity verification
  try {
    const config = getConfig();
    if (config.enable_chain_verification) {
      const prevHashRow = db.queryOne(
        "SELECT value FROM _meta WHERE key = 'chain_head'"
      );
      const prevHash = prevHashRow ? prevHashRow.value : null;
      const chainHash = _computeChainHash(content, metadata, prevHash);
      db.run(
        'UPDATE memories SET hash = ?, prev_hash = ? WHERE id = ?',
        [chainHash, prevHash, memoryId]
      );
      db.run(
        `INSERT INTO _meta (key, value, updated_at)
         VALUES ('chain_head', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [chainHash]
      );
    }
  } catch {
    // Chain hash is best-effort
  }

  // Store embedding (use precomputed if available, otherwise generate)
  const embedding = precomputedEmbedding || (await embed(content));
  if (embedding) {
    try {
      db.run(
        'INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)',
        [toVecId(memoryId), toVecParam(embedding)]
      );
    } catch (e) {
      process.stderr.write(`[remember] WARNING: Embedding NOT stored for memory ${memoryId}. Semantic search will not find this memory. Error: ${e.message}\n`);
    }
  }

  // Link to entities
  if (aboutEntities && aboutEntities.length > 0) {
    for (const entityName of aboutEntities) {
      const entityId = _findOrCreateEntitySync(db, entityName);
      if (entityId) {
        try {
          db.insert('memory_entities', {
            memory_id: memoryId,
            entity_id: entityId,
            relationship: 'about',
          });
        } catch {
          // Duplicate link, ignore
        }
      }
    }
  }

  // Audit log
  _audit(db, 'memory_create', {
    details: { type: memoryType, source, importance },
    memoryId,
  });

  return memoryId;
}

// ---------------------------------------------------------------------------
// rememberEntity
// ---------------------------------------------------------------------------

/**
 * Create or update an entity.
 *
 * @param {object} db
 * @param {string} name
 * @param {string} [entityType='person']
 * @param {object} [options]
 * @param {string} [options.description]
 * @param {string[]} [options.aliases]
 * @param {object} [options.metadata]
 * @param {number[]} [options.precomputedEmbedding]
 * @returns {Promise<number>} Entity ID
 */
export async function rememberEntity(db, name, entityType = 'person', options = {}) {
  const {
    description = null,
    aliases = null,
    metadata = null,
    precomputedEmbedding = null,
  } = options;

  // Run deterministic guards
  const existingNames = db.query('SELECT canonical_name FROM entities')
    .map(r => r.canonical_name);
  const guardResult = validateEntity(name, entityType, existingNames);
  for (const w of guardResult.warnings) {
    process.stderr.write(`[remember] Entity guard: ${w}\n`);
  }
  if ('type' in guardResult.adjustments) {
    entityType = guardResult.adjustments.type;
  }

  const canonical = canonicalName(name);

  // Check for existing
  const existing = db.queryOne(
    'SELECT * FROM entities WHERE canonical_name = ? AND type = ?',
    [canonical, entityType]
  );

  let entityId;

  if (existing) {
    // Update existing
    const updateData = { updated_at: _now() };
    if (description) {
      updateData.description = description;
    }
    if (metadata) {
      const existingMeta = JSON.parse(existing.metadata || '{}');
      Object.assign(existingMeta, metadata);
      updateData.metadata = JSON.stringify(existingMeta);
    }

    db.update('entities', updateData, 'id = ?', [existing.id]);
    entityId = existing.id;
  } else {
    // Create new
    const now = _now();
    entityId = db.insert('entities', {
      name,
      type: entityType,
      canonical_name: canonical,
      description,
      importance: 1.0,
      created_at: now,
      updated_at: now,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    // Store embedding (use precomputed if available, otherwise generate)
    const embedText = `${name}. ${description || ''}`;
    const embedding = precomputedEmbedding || (await embed(embedText));
    if (embedding) {
      try {
        db.run(
          'INSERT OR REPLACE INTO entity_embeddings (entity_id, embedding) VALUES (?, ?)',
          [toVecId(entityId), toVecParam(embedding)]
        );
      } catch (e) {
        process.stderr.write(`[remember] WARNING: Embedding NOT stored for entity ${entityId}. Semantic search will not find this entity. Error: ${e.message}\n`);
      }
    }

    // Audit log for new entity
    _audit(db, 'entity_create', {
      details: { name, type: entityType },
      entityId,
    });
  }

  // Add aliases
  if (aliases && aliases.length > 0) {
    const now = _now();
    for (const alias of aliases) {
      const canonicalAlias = canonicalName(alias);
      try {
        db.insert('entity_aliases', {
          entity_id: entityId,
          alias,
          canonical_alias: canonicalAlias,
          created_at: now,
        });
      } catch {
        // Duplicate alias, ignore
      }
    }
  }

  return entityId;
}

// ---------------------------------------------------------------------------
// relateEntities
// ---------------------------------------------------------------------------

/**
 * Create or strengthen a relationship between entities.
 *
 * @param {object} db
 * @param {string} sourceName - Source entity name
 * @param {string} targetName - Target entity name
 * @param {string} relationshipType - works_with, manages, etc.
 * @param {object} [options]
 * @param {number} [options.strength=1.0]
 * @param {string} [options.direction='bidirectional'] - forward, backward, bidirectional
 * @param {object} [options.metadata]
 * @param {string} [options.validAt] - ISO string
 * @param {boolean} [options.supersedes=false] - Invalidate existing before creating new
 * @param {string} [options.originType='extracted']
 * @returns {number|null} Relationship ID or null
 */
export function relateEntities(db, sourceName, targetName, relationshipType, options = {}) {
  let {
    strength = 1.0,
    direction = 'bidirectional',
    metadata = null,
    validAt = null,
    supersedes = false,
    originType = 'extracted',
  } = options;

  // Run deterministic guards (origin-aware)
  const guardResult = validateRelationship(strength, originType);
  for (const w of guardResult.warnings) {
    process.stderr.write(`[remember] Relationship guard: ${w}\n`);
  }
  if ('strength' in guardResult.adjustments) {
    strength = guardResult.adjustments.strength;
  }

  const sourceId = _findOrCreateEntitySync(db, sourceName);
  const targetId = _findOrCreateEntitySync(db, targetName);

  if (!sourceId || !targetId) return null;

  const now = _now();
  const effectiveValidAt = validAt || now;

  if (supersedes) {
    // Invalidate existing relationship of same type between same entities (atomic)
    const existingToSupersede = db.queryOne(
      `SELECT * FROM relationships
       WHERE source_entity_id = ? AND target_entity_id = ?
         AND relationship_type = ? AND invalid_at IS NULL`,
      [sourceId, targetId, relationshipType]
    );

    if (existingToSupersede) {
      const txn = db.createTransaction(() => {
        // Invalidate the old relationship (mark when it ended)
        db.run(
          'UPDATE relationships SET invalid_at = ?, updated_at = ? WHERE id = ?',
          [now, now, existingToSupersede.id]
        );
        // Rename the type to free the UNIQUE constraint slot
        const oldMeta = JSON.parse(existingToSupersede.metadata || '{}');
        oldMeta.superseded_by_at = now;
        db.run(
          'UPDATE relationships SET relationship_type = ?, metadata = ? WHERE id = ?',
          [
            `${relationshipType}__superseded_${existingToSupersede.id}`,
            JSON.stringify(oldMeta),
            existingToSupersede.id,
          ]
        );
      });
      txn();

      _audit(db, 'relationship_supersede', {
        details: {
          old_id: existingToSupersede.id,
          source: sourceName,
          target: targetName,
          type: relationshipType,
        },
      });
    }

    // Supersede always sets origin_type to 'corrected'
    const supersedeOrigin = 'corrected';
    const ceiling = ORIGIN_STRENGTH_CEILING[supersedeOrigin] ?? 0.5;
    const cappedStrength = Math.min(strength, ceiling);

    // Create new relationship
    const newId = db.insert('relationships', {
      source_entity_id: sourceId,
      target_entity_id: targetId,
      relationship_type: relationshipType,
      strength: cappedStrength,
      origin_type: supersedeOrigin,
      direction,
      valid_at: effectiveValidAt,
      created_at: now,
      updated_at: now,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    _audit(db, 'relationship_create', {
      details: {
        id: newId,
        source: sourceName,
        target: targetName,
        type: relationshipType,
        origin_type: supersedeOrigin,
        strength: cappedStrength,
      },
    });

    return newId;
  }

  // Check for existing current relationship (non-supersede path)
  const existing = db.queryOne(
    `SELECT * FROM relationships
     WHERE source_entity_id = ? AND target_entity_id = ?
       AND relationship_type = ? AND invalid_at IS NULL`,
    [sourceId, targetId, relationshipType]
  );

  if (existing) {
    // Determine ceiling: if new origin is higher-authority, upgrade
    const existingOrigin = existing.origin_type || 'extracted';
    let effectiveOrigin = existingOrigin;

    // Origin upgrade: user_stated/corrected outrank extracted, which outranks inferred
    const originRank = { inferred: 0, extracted: 1, user_stated: 2, corrected: 2 };
    if ((originRank[originType] ?? 0) > (originRank[existingOrigin] ?? 0)) {
      effectiveOrigin = originType;
    }

    const ceiling = ORIGIN_STRENGTH_CEILING[effectiveOrigin] ?? 0.5;
    const increment = REINFORCEMENT_BY_ORIGIN[originType] ?? 0.1;
    const newStrength = Math.min(ceiling, existing.strength + increment);

    const updateData = {
      strength: newStrength,
      updated_at: now,
      origin_type: effectiveOrigin,
    };
    // Ensure valid_at is set on existing relationships
    if (!existing.valid_at) {
      updateData.valid_at = existing.created_at;
    }

    db.update('relationships', updateData, 'id = ?', [existing.id]);
    return existing.id;
  }

  // Create new relationship
  const newId = db.insert('relationships', {
    source_entity_id: sourceId,
    target_entity_id: targetId,
    relationship_type: relationshipType,
    strength,
    origin_type: originType,
    direction,
    valid_at: effectiveValidAt,
    created_at: now,
    updated_at: now,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });

  _audit(db, 'relationship_create', {
    details: {
      id: newId,
      source: sourceName,
      target: targetName,
      type: relationshipType,
      origin_type: originType,
      strength,
    },
  });

  return newId;
}

// ---------------------------------------------------------------------------
// invalidateRelationship
// ---------------------------------------------------------------------------

/**
 * Invalidate a relationship without creating a replacement.
 *
 * Finds the active relationship by source + target + type, marks it with
 * invalid_at, and renames the type to free the UNIQUE constraint. Atomic.
 *
 * @param {object} db
 * @param {string} sourceName
 * @param {string} targetName
 * @param {string} relationshipType
 * @param {object} [options]
 * @param {string} [options.reason]
 * @returns {object|null} Dict with invalidated relationship info, or null if not found
 */
export function invalidateRelationship(db, sourceName, targetName, relationshipType, options = {}) {
  const { reason = null } = options;

  const sourceId = _findOrCreateEntitySync(db, sourceName);
  const targetId = _findOrCreateEntitySync(db, targetName);

  if (!sourceId || !targetId) return null;

  const existing = db.queryOne(
    `SELECT * FROM relationships
     WHERE source_entity_id = ? AND target_entity_id = ?
       AND relationship_type = ? AND invalid_at IS NULL`,
    [sourceId, targetId, relationshipType]
  );

  if (!existing) return null;

  const now = _now();

  const txn = db.createTransaction(() => {
    // Invalidate and rename type atomically
    const oldMeta = JSON.parse(existing.metadata || '{}');
    oldMeta.invalidated_reason = reason;
    oldMeta.invalidated_at = now;

    db.run(
      `UPDATE relationships SET invalid_at = ?, updated_at = ?,
       relationship_type = ?, metadata = ? WHERE id = ?`,
      [
        now,
        now,
        `${relationshipType}__invalidated_${existing.id}`,
        JSON.stringify(oldMeta),
        existing.id,
      ]
    );
  });
  txn();

  _audit(db, 'relationship_invalidate', {
    details: {
      id: existing.id,
      source: sourceName,
      target: targetName,
      type: relationshipType,
      reason,
    },
  });

  return {
    relationship_id: existing.id,
    source: sourceName,
    target: targetName,
    relationship_type: relationshipType,
    invalidated_at: now,
    reason,
  };
}

// ---------------------------------------------------------------------------
// correctMemory
// ---------------------------------------------------------------------------

/**
 * Correct a memory's content, preserving history.
 *
 * Stores original content in corrected_from, updates content,
 * and sets corrected_at timestamp for audit trail.
 *
 * @param {object} db
 * @param {number} memoryId
 * @param {string} correction - New corrected content
 * @param {object} [options]
 * @param {string} [options.reason]
 * @returns {Promise<object>} Correction status
 */
export async function correctMemory(db, memoryId, correction, options = {}) {
  const { reason = null } = options;

  const memory = db.queryOne('SELECT * FROM memories WHERE id = ?', [memoryId]);
  if (!memory) {
    return { success: false, error: `Memory ${memoryId} not found` };
  }

  const now = _now();
  const originalContent = memory.content;

  // Build metadata with correction history
  const existingMeta = JSON.parse(memory.metadata || '{}');
  const correctionsHistory = existingMeta.corrections || [];
  correctionsHistory.push({
    original: originalContent,
    corrected_to: correction,
    reason,
    corrected_at: now,
  });
  existingMeta.corrections = correctionsHistory;

  // Update the memory
  const newHash = contentHash(correction);
  db.update(
    'memories',
    {
      content: correction,
      content_hash: newHash,
      corrected_at: now,
      corrected_from: originalContent,
      updated_at: now,
      metadata: JSON.stringify(existingMeta),
      origin_type: 'corrected',
      confidence: 1.0,
    },
    'id = ?',
    [memoryId]
  );

  // Re-generate embedding for new content
  const embedding = await embed(correction);
  if (embedding) {
    try {
      db.run(
        'INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)',
        [toVecId(memoryId), toVecParam(embedding)]
      );
    } catch (e) {
      process.stderr.write(`[remember] WARNING: Embedding NOT updated for memory ${memoryId}. Error: ${e.message}\n`);
    }
  }

  _audit(db, 'memory_correct', {
    details: {
      original_content: originalContent.slice(0, 200),
      corrected_content: correction.slice(0, 200),
      reason,
    },
    memoryId,
    userInitiated: true,
  });

  return {
    success: true,
    memory_id: memoryId,
    original_content: originalContent,
    corrected_content: correction,
    corrected_at: now,
  };
}

// ---------------------------------------------------------------------------
// invalidateMemory
// ---------------------------------------------------------------------------

/**
 * Mark a memory as no longer true (soft delete).
 *
 * Sets invalidated_at timestamp but preserves the memory for
 * historical queries.
 *
 * @param {object} db
 * @param {number} memoryId
 * @param {object} [options]
 * @param {string} [options.reason]
 * @returns {object} Invalidation status
 */
export function invalidateMemory(db, memoryId, options = {}) {
  const { reason = null } = options;

  const memory = db.queryOne('SELECT * FROM memories WHERE id = ?', [memoryId]);
  if (!memory) {
    return { success: false, error: `Memory ${memoryId} not found` };
  }

  const now = _now();

  // Build metadata with invalidation reason
  const existingMeta = JSON.parse(memory.metadata || '{}');
  existingMeta.invalidation = {
    reason: reason || 'User requested invalidation',
    invalidated_at: now,
  };

  db.update(
    'memories',
    {
      invalidated_at: now,
      invalidated_reason: reason || 'User requested invalidation',
      updated_at: now,
      metadata: JSON.stringify(existingMeta),
    },
    'id = ?',
    [memoryId]
  );

  _audit(db, 'memory_invalidate', {
    details: {
      content: memory.content.slice(0, 200),
      reason: reason || 'User requested invalidation',
    },
    memoryId,
    userInitiated: true,
  });

  return {
    success: true,
    memory_id: memoryId,
    content: memory.content,
    invalidated_at: now,
    reason,
  };
}

// ---------------------------------------------------------------------------
// bufferTurn
// ---------------------------------------------------------------------------

/**
 * Buffer a conversation turn for later summarization.
 *
 * Lightweight storage -- no embeddings, no extraction, no processing.
 * The raw exchange is held in turn_buffer until Claude summarizes the session.
 *
 * @param {object} db
 * @param {object} [options]
 * @param {string} [options.userContent]
 * @param {string} [options.assistantContent]
 * @param {number} [options.episodeId] - Creates one if null
 * @param {string} [options.source] - Origin channel
 * @returns {object} { episode_id, turn_number }
 */
export function bufferTurn(db, options = {}) {
  let {
    userContent = null,
    assistantContent = null,
    episodeId = null,
    source = null,
  } = options;

  if (episodeId == null) {
    episodeId = _getOrCreateEpisode(db, source);
  }

  // Get next turn number
  const row = db.queryOne(
    'SELECT COALESCE(MAX(turn_number), 0) as max_turn FROM turn_buffer WHERE episode_id = ?',
    [episodeId]
  );
  const nextTurn = (row ? row.max_turn : 0) + 1;

  const insertData = {
    episode_id: episodeId,
    turn_number: nextTurn,
    user_content: userContent,
    assistant_content: assistantContent,
    created_at: _now(),
  };
  if (source) insertData.source = source;

  db.insert('turn_buffer', insertData);

  // Update episode turn count
  db.run(
    'UPDATE episodes SET turn_count = turn_count + 1 WHERE id = ?',
    [episodeId]
  );

  return { episode_id: episodeId, turn_number: nextTurn };
}

// ---------------------------------------------------------------------------
// endSession
// ---------------------------------------------------------------------------

/**
 * Finalize a session with Claude's narrative summary and structured extractions.
 *
 * @param {object} db
 * @param {number} episodeId
 * @param {string} narrative - Free-form narrative summary
 * @param {object} [options]
 * @param {Array<{content:string, type?:string, about?:string[], importance?:number, source?:string, source_context?:string, source_material?:string}>} [options.facts]
 * @param {Array<{content:string, about?:string[], importance?:number, source?:string, source_context?:string, source_material?:string}>} [options.commitments]
 * @param {Array<{name:string, type?:string, description?:string, aliases?:string[]}>} [options.entities]
 * @param {Array<{source:string, target:string, relationship:string, strength?:number}>} [options.relationships]
 * @param {string[]} [options.keyTopics]
 * @returns {Promise<object>} Counts of what was stored
 */
export async function endSession(db, episodeId, narrative, options = {}) {
  const {
    facts = null,
    commitments = null,
    entities = null,
    relationships = null,
    keyTopics = null,
  } = options;

  const result = {
    episode_id: episodeId,
    narrative_stored: false,
    facts_stored: 0,
    commitments_stored: 0,
    entities_stored: 0,
    relationships_stored: 0,
  };

  // Validate episode exists
  const episode = db.queryOne('SELECT id FROM episodes WHERE id = ?', [episodeId]);
  if (!episode) {
    result.error = `Episode ${episodeId} not found. Call memory.buffer_turn first to create an episode.`;
    return result;
  }

  // 1. Store narrative in episode
  const updateData = {
    narrative,
    ended_at: _now(),
    is_summarized: 1,
  };
  if (keyTopics) {
    updateData.key_topics = JSON.stringify(keyTopics);
  }
  db.update('episodes', updateData, 'id = ?', [episodeId]);
  result.narrative_stored = true;

  // 2. Generate and store embedding for narrative
  const narrativeEmbedding = await embed(narrative);
  if (narrativeEmbedding) {
    try {
      db.run(
        'INSERT OR REPLACE INTO episode_embeddings (episode_id, embedding) VALUES (?, ?)',
        [toVecId(episodeId), toVecParam(narrativeEmbedding)]
      );
    } catch (e) {
      process.stderr.write(`[remember] WARNING: Embedding NOT stored for episode ${episodeId}. Error: ${e.message}\n`);
    }
  }

  // 3. Store structured facts
  if (facts) {
    for (const fact of facts) {
      const memId = await rememberFact(db, fact.content, {
        memoryType: fact.type || 'fact',
        aboutEntities: fact.about,
        importance: fact.importance ?? 1.0,
        source: fact.source || 'session_summary',
        sourceId: String(episodeId),
        sourceContext: fact.source_context,
      });
      if (memId) {
        result.facts_stored++;
        if (fact.source_material) {
          saveSourceMaterial(db, memId, fact.source_material, {
            source: fact.source || 'session_summary',
            source_context: fact.source_context,
          });
        }
      }
    }
  }

  // 4. Store commitments
  if (commitments) {
    for (const commitment of commitments) {
      const memId = await rememberFact(db, commitment.content, {
        memoryType: 'commitment',
        aboutEntities: commitment.about,
        importance: commitment.importance ?? 1.0,
        source: commitment.source || 'session_summary',
        sourceId: String(episodeId),
        sourceContext: commitment.source_context,
      });
      if (memId) {
        result.commitments_stored++;
        if (commitment.source_material) {
          saveSourceMaterial(db, memId, commitment.source_material, {
            source: commitment.source || 'session_summary',
            source_context: commitment.source_context,
          });
        }
      }
    }
  }

  // 5. Store entities
  if (entities) {
    for (const entity of entities) {
      const entId = await rememberEntity(db, entity.name, entity.type || 'person', {
        description: entity.description,
        aliases: entity.aliases,
      });
      if (entId) {
        result.entities_stored++;
      }
    }
  }

  // 6. Store relationships
  if (relationships) {
    for (const rel of relationships) {
      const relId = relateEntities(db, rel.source, rel.target, rel.relationship, {
        strength: rel.strength ?? 1.0,
      });
      if (relId) {
        result.relationships_stored++;
      }
    }
  }

  // 7. Archive turn buffer for this episode
  db.run(
    'UPDATE turn_buffer SET is_archived = 1 WHERE episode_id = ?',
    [episodeId]
  );

  return result;
}

// ---------------------------------------------------------------------------
// storeReflection
// ---------------------------------------------------------------------------

/**
 * Store a reflection (observation, pattern, learning, question) from /meditate.
 *
 * Reflections are user-approved persistent learnings that decay very slowly.
 *
 * @param {object} db
 * @param {string} content
 * @param {string} reflectionType - observation, pattern, learning, question
 * @param {object} [options]
 * @param {number} [options.episodeId]
 * @param {string} [options.aboutEntity] - Entity name
 * @param {number} [options.importance=0.7]
 * @param {number} [options.confidence=0.8]
 * @returns {Promise<number|null>} Reflection ID or null if duplicate
 */
export async function storeReflection(db, content, reflectionType, options = {}) {
  const {
    episodeId = null,
    aboutEntity = null,
    importance = 0.7,
    confidence = 0.8,
  } = options;

  // Check for near-duplicate
  const refHash = contentHash(content);
  const existing = db.queryOne(
    'SELECT * FROM reflections WHERE content_hash = ?',
    [refHash]
  );
  if (existing) {
    // Duplicate content - confirm the existing one instead of creating new
    db.update(
      'reflections',
      {
        last_confirmed_at: _now(),
        aggregation_count: (existing.aggregation_count || 0) + 1,
        confidence: Math.min(1.0, (existing.confidence || 0) + 0.05),
        updated_at: _now(),
      },
      'id = ?',
      [existing.id]
    );
    return existing.id;
  }

  // Find entity if specified
  let entityId = null;
  if (aboutEntity) {
    entityId = _findOrCreateEntitySync(db, aboutEntity);
  }

  // Insert new reflection
  const now = _now();
  const reflectionId = db.insert('reflections', {
    episode_id: episodeId,
    reflection_type: reflectionType,
    content,
    content_hash: refHash,
    about_entity_id: entityId,
    importance,
    confidence,
    decay_rate: 0.999,
    aggregation_count: 1,
    first_observed_at: now,
    last_confirmed_at: now,
    created_at: now,
  });

  // Generate and store embedding
  const embedding = await embed(content);
  if (embedding) {
    try {
      db.run(
        'INSERT OR REPLACE INTO reflection_embeddings (reflection_id, embedding) VALUES (?, ?)',
        [toVecId(reflectionId), toVecParam(embedding)]
      );
    } catch (e) {
      process.stderr.write(`[remember] WARNING: Embedding NOT stored for reflection ${reflectionId}. Error: ${e.message}\n`);
    }
  }

  return reflectionId;
}

// ---------------------------------------------------------------------------
// updateReflection
// ---------------------------------------------------------------------------

/**
 * Update an existing reflection.
 *
 * @param {object} db
 * @param {number} reflectionId
 * @param {object} [options]
 * @param {string} [options.content]
 * @param {number} [options.importance]
 * @returns {Promise<boolean>} True if updated, false if not found
 */
export async function updateReflection(db, reflectionId, options = {}) {
  const { content = null, importance = null } = options;

  const existing = db.queryOne(
    'SELECT id FROM reflections WHERE id = ?',
    [reflectionId]
  );
  if (!existing) return false;

  const updateData = { updated_at: _now() };

  if (content !== null) {
    updateData.content = content;
    updateData.content_hash = contentHash(content);
    // Re-generate embedding
    const embedding = await embed(content);
    if (embedding) {
      try {
        db.run(
          'INSERT OR REPLACE INTO reflection_embeddings (reflection_id, embedding) VALUES (?, ?)',
          [toVecId(reflectionId), toVecParam(embedding)]
        );
      } catch (e) {
        process.stderr.write(`[remember] WARNING: Embedding NOT updated for reflection ${reflectionId}. Error: ${e.message}\n`);
      }
    }
  }

  if (importance !== null) {
    updateData.importance = importance;
  }

  db.update('reflections', updateData, 'id = ?', [reflectionId]);
  return true;
}

// ---------------------------------------------------------------------------
// deleteReflection
// ---------------------------------------------------------------------------

/**
 * Delete a reflection.
 *
 * @param {object} db
 * @param {number} reflectionId
 * @returns {boolean} True if deleted, false if not found
 */
export function deleteReflection(db, reflectionId) {
  const { changes } = db.run('DELETE FROM reflections WHERE id = ?', [reflectionId]);
  if (changes > 0) {
    try {
      db.run(
        'DELETE FROM reflection_embeddings WHERE reflection_id = ?',
        [reflectionId]
      );
    } catch {
      // Ignore embedding cleanup errors
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// getUnsummarizedTurns
// ---------------------------------------------------------------------------

/**
 * Find episodes with buffered turns that were never summarized.
 *
 * @param {object} db
 * @returns {object[]} List of episode info with turns
 */
export function getUnsummarizedTurns(db) {
  const episodes = db.query(
    `SELECT e.id, e.session_id, e.turn_count, e.started_at
     FROM episodes e
     WHERE e.is_summarized = 0
       AND e.turn_count > 0
     ORDER BY e.started_at DESC`
  );

  const results = [];
  for (const ep of episodes) {
    const turns = db.query(
      `SELECT turn_number, user_content, assistant_content, created_at
       FROM turn_buffer
       WHERE episode_id = ? AND (is_archived = 0 OR is_archived IS NULL)
       ORDER BY turn_number ASC`,
      [ep.id]
    );

    if (turns.length > 0) {
      results.push({
        episode_id: ep.id,
        session_id: ep.session_id,
        started_at: ep.started_at,
        turn_count: ep.turn_count,
        turns: turns.map(t => ({
          turn_number: t.turn_number,
          user: t.user_content,
          assistant: t.assistant_content,
          timestamp: t.created_at,
        })),
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// mergeEntities
// ---------------------------------------------------------------------------

/**
 * Merge source entity into target entity.
 *
 * Updates all references to point to target, adds source name as alias of target,
 * then soft-deletes the source entity. Preserves full history.
 *
 * @param {object} db
 * @param {number} sourceId - Entity ID to merge FROM (will be deleted)
 * @param {number} targetId - Entity ID to merge INTO (will be kept)
 * @param {object} [options]
 * @param {string} [options.reason]
 * @returns {object} Merge statistics
 */
export function mergeEntities(db, sourceId, targetId, options = {}) {
  const { reason = null } = options;
  const now = _now();

  const result = {
    source_id: sourceId,
    target_id: targetId,
    aliases_moved: 0,
    memories_moved: 0,
    relationships_moved: 0,
    reflections_moved: 0,
    success: false,
  };

  // Verify both entities exist
  const source = db.queryOne('SELECT * FROM entities WHERE id = ?', [sourceId]);
  const target = db.queryOne('SELECT * FROM entities WHERE id = ?', [targetId]);

  if (!source) {
    result.error = `Source entity ${sourceId} not found`;
    return result;
  }
  if (!target) {
    result.error = `Target entity ${targetId} not found`;
    return result;
  }

  // 1. Add source name as alias of target
  try {
    db.insert('entity_aliases', {
      entity_id: targetId,
      alias: source.name,
      canonical_alias: source.canonical_name,
      created_at: now,
    });
    result.aliases_moved++;
  } catch {
    // Duplicate alias, ignore
  }

  // 2. Move source's aliases to target
  const sourceAliases = db.query(
    'SELECT * FROM entity_aliases WHERE entity_id = ?',
    [sourceId]
  );
  for (const alias of sourceAliases) {
    try {
      db.insert('entity_aliases', {
        entity_id: targetId,
        alias: alias.alias,
        canonical_alias: alias.canonical_alias,
        created_at: now,
      });
      result.aliases_moved++;
    } catch {
      // Duplicate alias, ignore
    }
  }
  // Delete moved aliases from source
  db.run('DELETE FROM entity_aliases WHERE entity_id = ?', [sourceId]);

  // 3. Update memory_entities references
  const memoriesResult = db.run(
    `UPDATE memory_entities SET entity_id = ?
     WHERE entity_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM memory_entities me2
         WHERE me2.memory_id = memory_entities.memory_id
           AND me2.entity_id = ?
       )`,
    [targetId, sourceId, targetId]
  );
  // Delete any remaining duplicates
  db.run('DELETE FROM memory_entities WHERE entity_id = ?', [sourceId]);
  result.memories_moved = memoriesResult.changes || 0;

  // 4. Update relationships (both source and target directions)
  const relsSource = db.run(
    `UPDATE relationships SET source_entity_id = ?, updated_at = ?
     WHERE source_entity_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM relationships r2
         WHERE r2.source_entity_id = ?
           AND r2.target_entity_id = relationships.target_entity_id
           AND r2.relationship_type = relationships.relationship_type
       )`,
    [targetId, now, sourceId, targetId]
  );
  const relsTarget = db.run(
    `UPDATE relationships SET target_entity_id = ?, updated_at = ?
     WHERE target_entity_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM relationships r2
         WHERE r2.source_entity_id = relationships.source_entity_id
           AND r2.target_entity_id = ?
           AND r2.relationship_type = relationships.relationship_type
       )`,
    [targetId, now, sourceId, targetId]
  );
  // Delete any remaining duplicates
  db.run(
    'DELETE FROM relationships WHERE source_entity_id = ? OR target_entity_id = ?',
    [sourceId, sourceId]
  );
  result.relationships_moved = (relsSource.changes || 0) + (relsTarget.changes || 0);

  // 5. Update reflections about_entity_id
  const reflectionsResult = db.run(
    'UPDATE reflections SET about_entity_id = ? WHERE about_entity_id = ?',
    [targetId, sourceId]
  );
  result.reflections_moved = reflectionsResult.changes || 0;

  // 6. Merge attributes (target wins on conflicts, but preserve metadata)
  if (source.description && !target.description) {
    db.update('entities', { description: source.description }, 'id = ?', [targetId]);
  }

  const sourceMeta = JSON.parse(source.metadata || '{}');
  const targetMeta = JSON.parse(target.metadata || '{}');
  // Merge: source values fill in target gaps
  const mergedMeta = { ...sourceMeta, ...targetMeta };
  if (!mergedMeta.merged_from) mergedMeta.merged_from = [];
  mergedMeta.merged_from.push({
    entity_id: sourceId,
    name: source.name,
    merged_at: now,
    reason,
  });
  db.update(
    'entities',
    { metadata: JSON.stringify(mergedMeta), updated_at: now },
    'id = ?',
    [targetId]
  );

  // 7. Soft-delete source entity
  db.update(
    'entities',
    {
      deleted_at: now,
      deleted_reason: `Merged into entity ${targetId}` + (reason ? `: ${reason}` : ''),
    },
    'id = ?',
    [sourceId]
  );

  result.success = true;

  _audit(db, 'entity_merge', {
    details: {
      source_name: source.name,
      target_name: target.name,
      reason,
      aliases_moved: result.aliases_moved,
      memories_moved: result.memories_moved,
      relationships_moved: result.relationships_moved,
    },
    entityId: targetId,
    userInitiated: true,
  });

  return result;
}

// ---------------------------------------------------------------------------
// deleteEntity
// ---------------------------------------------------------------------------

/**
 * Soft-delete an entity.
 *
 * Sets deleted_at timestamp. Does NOT remove references (memories, relationships)
 * as they may have historical value.
 *
 * @param {object} db
 * @param {number} entityId
 * @param {object} [options]
 * @param {string} [options.reason]
 * @returns {object} Deletion status
 */
export function deleteEntity(db, entityId, options = {}) {
  const { reason = null } = options;

  const entity = db.queryOne('SELECT * FROM entities WHERE id = ?', [entityId]);
  if (!entity) {
    return { success: false, error: `Entity ${entityId} not found` };
  }

  const now = _now();
  db.update(
    'entities',
    {
      deleted_at: now,
      deleted_reason: reason || 'User requested deletion',
    },
    'id = ?',
    [entityId]
  );

  _audit(db, 'entity_delete', {
    details: { name: entity.name, reason },
    entityId,
    userInitiated: true,
  });

  return {
    success: true,
    entity_id: entityId,
    name: entity.name,
    deleted_at: now,
  };
}

// ---------------------------------------------------------------------------
// setCloseCircle
// ---------------------------------------------------------------------------

/**
 * Mark an entity as close-circle and auto-promote core facts to sacred.
 *
 * @param {object} db
 * @param {number} entityId
 * @param {object} [options]
 * @param {string} [options.reason='user-designated']
 * @returns {object} { entity_id, close_circle, facts_promoted_to_sacred }
 */
export function setCloseCircle(db, entityId, options = {}) {
  const { reason = 'user-designated' } = options;
  const config = getConfig();

  db.run(
    "UPDATE entities SET close_circle = 1, close_circle_reason = ?, updated_at = datetime('now') WHERE id = ?",
    [reason, entityId]
  );

  let promoted = 0;
  if (config.enable_auto_sacred) {
    const keywords = config.sacred_core_keywords || [];
    for (const keyword of keywords) {
      const rows = db.query(
        `SELECT m.id FROM memories m
         JOIN memory_entities me ON m.id = me.memory_id
         WHERE me.entity_id = ?
           AND m.invalidated_at IS NULL
           AND (m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'sacred')
           AND LOWER(m.content) LIKE '%' || LOWER(?) || '%'`,
        [entityId, keyword]
      );
      for (const row of rows) {
        db.run(
          `UPDATE memories SET lifecycle_tier = 'sacred',
           sacred_reason = ?,
           updated_at = datetime('now')
           WHERE id = ? AND (lifecycle_tier IS NULL OR lifecycle_tier != 'sacred')`,
          [`auto: close-circle keyword '${keyword}'`, row.id]
        );
        promoted++;
      }
    }
  }

  _audit(db, 'close_circle_set', {
    details: { entity_id: entityId, reason, promoted },
    entityId,
  });

  return { entity_id: entityId, close_circle: true, facts_promoted_to_sacred: promoted };
}

// ---------------------------------------------------------------------------
// saveSourceMaterial
// ---------------------------------------------------------------------------

/**
 * Save raw source material (email, transcript, document) to disk.
 *
 * Files are plain markdown with a YAML frontmatter header, stored at
 * {dbDir}/sources/{memoryId}.md.
 *
 * Also registers the file in the documents table and creates a
 * memory_sources link for provenance tracking.
 *
 * @param {object} db
 * @param {number} memoryId
 * @param {string} content
 * @param {object} [metadata]
 * @returns {string|null} Path to saved file, or null on failure
 */
export function saveSourceMaterial(db, memoryId, content, metadata = null) {
  try {
    const sourcesDir = join(dirname(db.dbPath), 'sources');
    mkdirSync(sourcesDir, { recursive: true });

    const filePath = join(sourcesDir, `${memoryId}.md`);

    // Build frontmatter
    const headerLines = ['---'];
    headerLines.push(`memory_id: ${memoryId}`);
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        if (value != null) {
          headerLines.push(`${key}: "${value}"`);
        }
      }
    }
    headerLines.push(`saved_at: ${_now()}`);
    headerLines.push('---');
    headerLines.push('');

    const fileContent = headerLines.join('\n') + content;
    writeFileSync(filePath, fileContent, 'utf-8');

    // Register in documents table for provenance
    _registerDocumentProvenance(db, memoryId, content, filePath, metadata);

    return filePath;
  } catch (e) {
    process.stderr.write(`[remember] Could not save source material for memory ${memoryId}: ${e.message}\n`);
    return null;
  }
}

/**
 * Register a source material file in the documents table and link to memory.
 */
function _registerDocumentProvenance(db, memoryId, content, filePath, metadata = null) {
  try {
    const fileHash = createHash('sha256').update(content, 'utf-8').digest('hex');
    const sourceType = (metadata || {}).source || 'session';
    const sourceContext = (metadata || {}).source_context || null;
    const filename = typeof filePath === 'string' ? filePath.split('/').pop() : String(filePath);

    const validSourceTypes = ['gmail', 'transcript', 'upload', 'capture', 'session'];
    const docSourceType = validSourceTypes.includes(sourceType) ? sourceType : 'session';
    const now = _now();

    const docId = db.insert('documents', {
      file_hash: fileHash,
      filename,
      mime_type: 'text/markdown',
      file_size: Buffer.byteLength(content, 'utf-8'),
      storage_provider: 'local',
      storage_path: String(filePath),
      source_type: docSourceType,
      source_ref: sourceContext,
      lifecycle: 'active',
      last_accessed_at: now,
      created_at: now,
      updated_at: now,
    });

    // Create provenance link
    db.insert('memory_sources', {
      memory_id: memoryId,
      document_id: docId,
      created_at: now,
    });
  } catch {
    // Graceful degradation: documents table may not exist on older schemas
  }
}

// ---------------------------------------------------------------------------
// batchOperations
// ---------------------------------------------------------------------------

/**
 * Execute multiple memory operations in a single call with parallel embedding.
 *
 * Operations are: entity, remember, relate.
 * Embeddings for all remember/entity ops are collected and computed in one
 * parallel batch before executing the actual DB writes.
 *
 * @param {object} db
 * @param {object[]} operations - Array of operation descriptors
 * @param {object} [options]
 * @param {string} [options.sourceChannel]
 * @returns {Promise<object[]>} Array of per-operation results
 */
export async function batchOperations(db, operations, options = {}) {
  const { sourceChannel = null } = options;

  // --- Pass 1: Collect all texts that need embeddings ---
  const embedTasks = []; // { index, text }
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const opType = op.op;
    if (opType === 'remember') {
      embedTasks.push({ index: i, text: op.content });
    } else if (opType === 'entity') {
      const embedText = `${op.name}. ${op.description || ''}`;
      embedTasks.push({ index: i, text: embedText });
    }
  }

  // --- Parallel embedding pass ---
  const embeddingsMap = {}; // index -> embedding
  if (embedTasks.length > 0) {
    try {
      const texts = embedTasks.map(t => t.text);
      const allEmbeddings = await embedBatch(texts);
      for (let j = 0; j < embedTasks.length; j++) {
        if (allEmbeddings[j] != null) {
          embeddingsMap[embedTasks[j].index] = allEmbeddings[j];
        }
      }
    } catch (e) {
      process.stderr.write(`[remember] Batch parallel embedding failed, falling back to per-op: ${e.message}\n`);
      // embeddingsMap stays empty; individual ops will embed themselves
    }
  }

  // --- Pass 2: Execute operations with pre-computed embeddings ---
  const results = [];
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const opType = op.op;
    const opResult = { index: i, op: opType };

    try {
      if (opType === 'entity') {
        const entityId = await rememberEntity(db, op.name, op.type || 'person', {
          description: op.description,
          aliases: op.aliases,
          precomputedEmbedding: embeddingsMap[i] || null,
        });
        opResult.success = true;
        opResult.entity_id = entityId;
      } else if (opType === 'remember') {
        const memoryId = await rememberFact(db, op.content, {
          memoryType: op.type || 'fact',
          aboutEntities: op.about,
          importance: op.importance ?? 1.0,
          source: op.source,
          sourceContext: op.source_context,
          sourceChannel: op.source_channel || sourceChannel,
          precomputedEmbedding: embeddingsMap[i] || null,
        });
        opResult.success = true;
        opResult.memory_id = memoryId;
        // Save source material to disk if provided
        if (memoryId && op.source_material) {
          saveSourceMaterial(db, memoryId, op.source_material, {
            source: op.source,
            source_context: op.source_context,
          });
        }
      } else if (opType === 'relate') {
        const relId = relateEntities(
          db,
          op.source,
          op.target,
          op.relationship,
          {
            strength: op.strength ?? 1.0,
            supersedes: op.supersedes || false,
            validAt: op.valid_at,
            direction: op.direction || 'bidirectional',
            originType: op.origin_type || 'extracted',
          }
        );
        opResult.success = true;
        opResult.relationship_id = relId;
      } else {
        opResult.success = false;
        opResult.error = `Unknown operation type: ${opType}`;
      }
    } catch (e) {
      opResult.success = false;
      opResult.error = e.message;
    }

    results.push(opResult);
  }

  return results;
}
