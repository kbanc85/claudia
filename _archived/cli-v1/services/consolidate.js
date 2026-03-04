/**
 * Consolidation Service for Claudia CLI (Node.js port).
 * Port of memory-daemon/claudia_memory/services/consolidate.py.
 *
 * Handles memory decay, pattern detection, near-duplicate merging,
 * lifecycle transitions, entity summaries, and retention cleanup.
 * Runs on a schedule (typically overnight) to maintain memory health.
 *
 * All functions are synchronous (better-sqlite3 is sync, no Ollama calls).
 */

// ---------------------------------------------------------------------------
// Cosine similarity (pure JS, no external dependencies)
// ---------------------------------------------------------------------------

function cosineSimilarity(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowISO() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function nowISOFull() {
  return new Date().toISOString();
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysAhead(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function hoursAgo(hours) {
  const d = new Date();
  d.setTime(d.getTime() - hours * 3600 * 1000);
  return d.toISOString();
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return (b.getTime() - a.getTime()) / (86400 * 1000);
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function log(msg) {
  process.stderr.write(`[consolidate] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Phase 0 support: Deadline surge
// ---------------------------------------------------------------------------

/**
 * Boost importance of memories with approaching deadlines.
 * Runs BEFORE decay so that deadline-driven items resist decay.
 * Tiered surge:
 *  - Overdue: surge to 1.0
 *  - Due within 48 hours: surge to 0.95
 *  - Due within 7 days: surge to 0.85
 *
 * @param {object} db - ClaudiaDatabase instance
 * @returns {{ overdue_surged: number, near_surged: number, week_surged: number }}
 */
function surgeApproachingDeadlines(db) {
  const now = nowISO();
  const twoDays = daysAhead(2);
  const oneWeek = daysAhead(7);

  // Overdue: surge to 1.0
  const overdueResult = db.run(
    `UPDATE memories SET importance = 1.0, updated_at = datetime('now')
     WHERE deadline_at IS NOT NULL
       AND deadline_at < ?
       AND invalidated_at IS NULL
       AND importance < 1.0`,
    [now],
  );
  const overdue = overdueResult.changes;

  // Due within 48 hours: surge to 0.95
  const nearResult = db.run(
    `UPDATE memories SET importance = MAX(importance, 0.95), updated_at = datetime('now')
     WHERE deadline_at IS NOT NULL
       AND deadline_at BETWEEN ? AND ?
       AND invalidated_at IS NULL`,
    [now, twoDays],
  );
  const near = nearResult.changes;

  // Due within 7 days: surge to 0.85
  const weekResult = db.run(
    `UPDATE memories SET importance = MAX(importance, 0.85), updated_at = datetime('now')
     WHERE deadline_at IS NOT NULL
       AND deadline_at BETWEEN ? AND ?
       AND invalidated_at IS NULL`,
    [twoDays, oneWeek],
  );
  const week = weekResult.changes;

  const total = overdue + near + week;
  if (total > 0) {
    log(`Deadline surge: ${overdue} overdue, ${near} within 48h, ${week} within 7d`);
  }

  return { overdue_surged: overdue, near_surged: near, week_surged: week };
}

// ---------------------------------------------------------------------------
// Phase 1: Decay
// ---------------------------------------------------------------------------

/**
 * Apply tiered importance decay to memories, entities, relationships, and reflections.
 *
 * Tier 1 (high-value): importance > 0.7 -> decay at half standard rate
 * Tier 2 (standard): everything else -> decay at config rate (0.995)
 *
 * All decays have a floor at min_importance_threshold to prevent memories
 * from becoming permanently invisible.
 *
 * Sacred memories (lifecycle_tier='sacred') and close-circle entities are exempt.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {object} config - Configuration object
 * @returns {object} Counts of decayed items
 */
export function runDecay(db, config) {
  // Surge approaching deadlines BEFORE decay (so they resist decay)
  let surgeResults = {};
  try {
    surgeResults = surgeApproachingDeadlines(db);
  } catch (e) {
    // Column may not exist on older schemas
    surgeResults = {};
  }

  const decayRate = config.decay_rate_daily;
  const slowDecayRate = (1.0 + decayRate) / 2; // Midpoint between 1.0 and standard rate
  const floor = config.min_importance_threshold;
  const ts = nowISOFull();

  // Tier 1: High-value memories decay slower
  const tier1 = db.run(
    `UPDATE memories
     SET importance = MAX(?, importance * ?),
         updated_at = ?
     WHERE importance > 0.7
       AND importance > ?
       AND (lifecycle_tier IS NULL OR lifecycle_tier != 'sacred')`,
    [floor, slowDecayRate, ts, floor],
  );
  const tier1Count = tier1.changes;

  // Tier 2: Standard memories decay normally
  const tier2 = db.run(
    `UPDATE memories
     SET importance = MAX(?, importance * ?),
         updated_at = ?
     WHERE importance <= 0.7
       AND importance > ?
       AND (lifecycle_tier IS NULL OR lifecycle_tier != 'sacred')`,
    [floor, decayRate, ts, floor],
  );
  const tier2Count = tier2.changes;

  const memoriesDecayed = tier1Count + tier2Count;

  // Entities: same tiered approach (close-circle entities are protected from decay)
  db.run(
    `UPDATE entities
     SET importance = MAX(?, importance * ?),
         updated_at = ?
     WHERE importance > 0.7
       AND importance > ?
       AND (close_circle IS NULL OR close_circle = 0)`,
    [floor, slowDecayRate, ts, floor],
  );
  db.run(
    `UPDATE entities
     SET importance = MAX(?, importance * ?),
         updated_at = ?
     WHERE importance <= 0.7
       AND importance > ?
       AND (close_circle IS NULL OR close_circle = 0)`,
    [floor, decayRate, ts, floor],
  );

  // Relationships: tiered by strength
  db.run(
    `UPDATE relationships
     SET strength = MAX(0.01, strength * ?),
         updated_at = ?
     WHERE strength > 0.7
       AND strength > 0.01
       AND (lifecycle_tier IS NULL OR lifecycle_tier != 'sacred')`,
    [slowDecayRate, ts],
  );
  db.run(
    `UPDATE relationships
     SET strength = MAX(0.01, strength * ?),
         updated_at = ?
     WHERE strength <= 0.7
       AND strength > 0.01
       AND (lifecycle_tier IS NULL OR lifecycle_tier != 'sacred')`,
    [decayRate, ts],
  );

  // Reflections: keep using per-row decay_rate (unchanged)
  let reflectionsDecayed = 0;
  try {
    const refResult = db.run(
      `UPDATE reflections
       SET importance = MAX(0.01, importance * decay_rate),
           updated_at = ?
       WHERE importance > 0.01`,
      [ts],
    );
    reflectionsDecayed = refResult.changes;
  } catch {
    // Reflection table may not exist
  }

  log(`Decay applied: standard_rate=${decayRate}, slow_rate=${slowDecayRate.toFixed(4)}, floor=${floor}`);

  return {
    memories_decayed: memoriesDecayed,
    reflections_decayed: reflectionsDecayed,
    ...surgeResults,
  };
}

// ---------------------------------------------------------------------------
// Phase 1: Boost
// ---------------------------------------------------------------------------

/**
 * Boost importance of recently accessed memories (rehearsal effect).
 * Memories accessed in the last 24 hours get a 5% importance boost.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @returns {number} Count of boosted memories
 */
export function boostAccessedMemories(db) {
  const cutoff = hoursAgo(24);
  const boostFactor = 1.05;

  const result = db.run(
    `UPDATE memories
     SET importance = MIN(1.0, importance * ?),
         updated_at = ?
     WHERE last_accessed_at >= ?`,
    [boostFactor, nowISOFull(), cutoff],
  );

  const count = result.changes;
  if (count > 0) {
    log(`Boosted ${count} recently accessed memories`);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Phase 1b: Lifecycle transitions
// ---------------------------------------------------------------------------

/**
 * Apply lifecycle tier transitions based on access patterns.
 *
 * Cooling: memory not accessed for cooling_threshold_days AND not sacred
 * Archive: in cooling for archive_threshold_days AND importance < 0.3
 *
 * @param {object} db
 * @param {object} config
 * @returns {{ cooled: number, archived: number }}
 */
export function runLifecycleTransitions(db, config) {
  const coolingCutoff = daysAgo(config.cooling_threshold_days);
  const archiveCutoff = daysAgo(config.archive_threshold_days);

  // Active -> Cooling: not accessed recently, not sacred
  let cooled = 0;
  try {
    const result = db.run(
      `UPDATE memories
       SET lifecycle_tier = 'cooling', updated_at = datetime('now')
       WHERE (lifecycle_tier = 'active' OR lifecycle_tier IS NULL)
         AND invalidated_at IS NULL
         AND (lifecycle_tier IS NULL OR lifecycle_tier != 'sacred')
         AND (last_accessed_at IS NULL OR last_accessed_at < ?)
         AND created_at < ?`,
      [coolingCutoff, coolingCutoff],
    );
    cooled = result.changes;
  } catch (e) {
    // lifecycle_tier column may not exist on older schemas
  }

  // Cooling -> Archived: been cooling long enough AND low importance
  let archived = 0;
  try {
    const result = db.run(
      `UPDATE memories
       SET lifecycle_tier = 'archived',
           archived_at = datetime('now'),
           updated_at = datetime('now')
       WHERE lifecycle_tier = 'cooling'
         AND invalidated_at IS NULL
         AND importance < 0.3
         AND (last_accessed_at IS NULL OR last_accessed_at < ?)
         AND created_at < ?`,
      [archiveCutoff, archiveCutoff],
    );
    archived = result.changes;
  } catch (e) {
    // lifecycle_tier column may not exist
  }

  if (cooled > 0 || archived > 0) {
    log(`Lifecycle transitions: ${cooled} cooled, ${archived} archived`);
  }

  return { cooled, archived };
}

// ---------------------------------------------------------------------------
// Phase 1b: Auto-sacred detection
// ---------------------------------------------------------------------------

/**
 * Auto-promote memories about close-circle entities that match sacred keywords.
 *
 * @param {object} db
 * @param {object} config
 * @returns {number} Count of promoted memories
 */
export function detectAutoSacred(db, config) {
  if (!config.enable_auto_sacred) {
    return 0;
  }

  let promoted = 0;
  try {
    const closeEntities = db.query(
      "SELECT id FROM entities WHERE close_circle = 1 AND deleted_at IS NULL",
    );

    for (const entity of closeEntities) {
      const entityId = entity.id;
      for (const keyword of config.sacred_core_keywords) {
        const rows = db.query(
          `SELECT m.id FROM memories m
           JOIN memory_entities me ON m.id = me.memory_id
           WHERE me.entity_id = ?
             AND m.invalidated_at IS NULL
             AND (m.lifecycle_tier IS NULL OR m.lifecycle_tier != 'sacred')
             AND LOWER(m.content) LIKE '%' || LOWER(?) || '%'`,
          [entityId, keyword],
        );
        for (const row of rows) {
          db.run(
            `UPDATE memories SET lifecycle_tier = 'sacred',
                sacred_reason = ?,
                updated_at = datetime('now')
                WHERE id = ? AND (lifecycle_tier IS NULL OR lifecycle_tier != 'sacred')`,
            [`auto: close-circle keyword '${keyword}'`, row.id],
          );
          promoted++;
        }
      }
    }
  } catch (e) {
    // close_circle or lifecycle_tier column may not exist
  }

  if (promoted > 0) {
    log(`Auto-sacred: promoted ${promoted} memories`);
  }
  return promoted;
}

// ---------------------------------------------------------------------------
// Phase 1b: Close-circle candidate detection
// ---------------------------------------------------------------------------

/**
 * Detect entities that should be close-circle based on contact velocity.
 *
 * @param {object} db
 * @param {object} config
 * @returns {Array<{ entity_id: number, name: string, reason: string }>}
 */
export function detectCloseCircleCandidates(db, config) {
  const candidates = [];

  try {
    // High contact velocity detection
    const rows = db.query(
      `SELECT id, name, contact_frequency_days, contact_trend, description
       FROM entities
       WHERE type = 'person'
         AND deleted_at IS NULL
         AND (close_circle IS NULL OR close_circle = 0)
         AND contact_frequency_days IS NOT NULL
         AND contact_frequency_days < 7
         AND contact_trend IN ('accelerating', 'stable')`,
    );

    for (const row of rows) {
      candidates.push({
        entity_id: row.id,
        name: row.name,
        reason: `high contact velocity (${row.contact_frequency_days.toFixed(1)}d, ${row.contact_trend})`,
      });
    }

    // Keyword-based detection in entity descriptions
    for (const keyword of config.close_circle_keywords) {
      const descRows = db.query(
        `SELECT id, name FROM entities
         WHERE type = 'person'
           AND deleted_at IS NULL
           AND (close_circle IS NULL OR close_circle = 0)
           AND LOWER(description) LIKE '%' || LOWER(?) || '%'`,
        [keyword],
      );
      for (const row of descRows) {
        if (!candidates.some(c => c.entity_id === row.id)) {
          candidates.push({
            entity_id: row.id,
            name: row.name,
            reason: `keyword match: '${keyword}' in description`,
          });
        }
      }
    }
  } catch (e) {
    // close_circle or contact_frequency_days columns may not exist
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Phase 2: Memory merging
// ---------------------------------------------------------------------------

/**
 * Merge a duplicate memory into the primary.
 * - Transfers entity links from duplicate to primary
 * - Adds merged_from to primary's metadata
 * - Sets duplicate importance to 0.001
 */
function mergeMemoryPair(db, primaryId, duplicateId) {
  // Transfer entity links
  const dupLinks = db.query(
    "SELECT entity_id, relationship FROM memory_entities WHERE memory_id = ?",
    [duplicateId],
  );

  for (const link of dupLinks) {
    try {
      db.insert("memory_entities", {
        memory_id: primaryId,
        entity_id: link.entity_id,
        relationship: link.relationship,
      });
    } catch {
      // Duplicate link, ignore
    }
  }

  // Update primary's metadata with merge info
  const primary = db.queryOne("SELECT metadata FROM memories WHERE id = ?", [primaryId]);
  if (primary) {
    const meta = safeJsonParse(primary.metadata, {});
    const mergedFrom = meta.merged_from || [];
    mergedFrom.push(duplicateId);
    meta.merged_from = mergedFrom;
    db.update(
      "memories",
      { metadata: JSON.stringify(meta), updated_at: nowISOFull() },
      "id = ?",
      [primaryId],
    );
  }

  // Suppress duplicate (don't delete, just minimize importance)
  db.update(
    "memories",
    { importance: 0.001, updated_at: nowISOFull() },
    "id = ?",
    [duplicateId],
  );
}

/**
 * Merge semantically similar memories during consolidation.
 * Uses existing stored embeddings (no new Ollama calls).
 *
 * Finds entities with 5+ linked memories, loads stored embeddings,
 * computes pairwise cosine similarity, and merges pairs above threshold (0.92).
 * Keeps the higher-scoring memory (importance * (1 + access_count)).
 *
 * @param {object} db
 * @param {object} config
 * @returns {number} Count of merged memory pairs
 */
export function mergeSimilarMemories(db, config) {
  if (!config.enable_memory_merging) {
    return 0;
  }

  const threshold = config.similarity_merge_threshold;
  let mergedCount = 0;

  try {
    // Find entities with 5+ linked memories (high-memory entities first)
    const entityRows = db.query(
      `SELECT me.entity_id, COUNT(DISTINCT me.memory_id) as mem_count
       FROM memory_entities me
       GROUP BY me.entity_id
       HAVING mem_count >= 5
       ORDER BY mem_count DESC
       LIMIT 50`,
    );

    for (const entityRow of entityRows) {
      const entityId = entityRow.entity_id;

      // Load memory IDs and embeddings for this entity
      const memRows = db.query(
        `SELECT me.memory_id, m.importance, m.access_count,
                emb.embedding
         FROM memory_entities me
         JOIN memories m ON me.memory_id = m.id
         LEFT JOIN memory_embeddings emb ON m.id = emb.memory_id
         WHERE me.entity_id = ?
           AND m.importance > 0.01
         ORDER BY m.importance DESC`,
        [entityId],
      );

      // Parse embeddings
      const memoriesWithEmb = [];
      for (const row of memRows) {
        if (row.embedding) {
          try {
            const emb = typeof row.embedding === 'string'
              ? JSON.parse(row.embedding)
              : row.embedding;
            memoriesWithEmb.push({
              id: row.memory_id,
              importance: row.importance,
              accessCount: row.access_count || 0,
              embedding: emb,
            });
          } catch {
            continue;
          }
        }
      }

      if (memoriesWithEmb.length < 2) {
        continue;
      }

      // Pairwise cosine similarity
      const alreadyMerged = new Set();
      for (let i = 0; i < memoriesWithEmb.length; i++) {
        if (alreadyMerged.has(memoriesWithEmb[i].id)) continue;
        for (let j = i + 1; j < memoriesWithEmb.length; j++) {
          if (alreadyMerged.has(memoriesWithEmb[j].id)) continue;

          const sim = cosineSimilarity(
            memoriesWithEmb[i].embedding,
            memoriesWithEmb[j].embedding,
          );
          if (sim >= threshold) {
            // Keep the one with higher importance * (1 + access_count)
            const scoreI = memoriesWithEmb[i].importance * (1 + memoriesWithEmb[i].accessCount);
            const scoreJ = memoriesWithEmb[j].importance * (1 + memoriesWithEmb[j].accessCount);

            let primaryId, duplicateId;
            if (scoreI >= scoreJ) {
              primaryId = memoriesWithEmb[i].id;
              duplicateId = memoriesWithEmb[j].id;
            } else {
              primaryId = memoriesWithEmb[j].id;
              duplicateId = memoriesWithEmb[i].id;
            }

            mergeMemoryPair(db, primaryId, duplicateId);
            alreadyMerged.add(duplicateId);
            mergedCount++;
          }
        }
      }
    }
  } catch (e) {
    log(`Memory merging failed: ${e.message || e}`);
  }

  if (mergedCount > 0) {
    log(`Merged ${mergedCount} near-duplicate memory pairs`);
  }
  return mergedCount;
}

// ---------------------------------------------------------------------------
// Phase 2: Reflection aggregation
// ---------------------------------------------------------------------------

/**
 * Merge a duplicate reflection into the primary.
 * Preserves timeline: earliest first_observed_at, latest last_confirmed_at.
 * Combines aggregation counts. Adjusts decay rate for well-confirmed reflections.
 */
function mergeReflectionPair(db, primary, duplicate) {
  const newAggregationCount = primary.aggregation_count + duplicate.aggregation_count;
  const newFirstObserved = primary.first_observed_at < duplicate.first_observed_at
    ? primary.first_observed_at
    : duplicate.first_observed_at;
  const newLastConfirmed = primary.last_confirmed_at > duplicate.last_confirmed_at
    ? primary.last_confirmed_at
    : duplicate.last_confirmed_at;

  // Slow decay for well-confirmed reflections
  const newDecayRate = newAggregationCount >= 3 ? 0.9995 : 0.999;

  // Boost importance slightly for confirmed patterns
  const newImportance = Math.min(1.0, primary.importance + 0.05);

  // Track which reflections were merged
  const existing = db.queryOne("SELECT aggregated_from FROM reflections WHERE id = ?", [primary.id]);
  const aggregatedFrom = safeJsonParse(existing ? existing.aggregated_from : null, []);
  aggregatedFrom.push(duplicate.id);

  // Update primary
  db.update(
    "reflections",
    {
      aggregation_count: newAggregationCount,
      first_observed_at: newFirstObserved,
      last_confirmed_at: newLastConfirmed,
      decay_rate: newDecayRate,
      importance: newImportance,
      aggregated_from: JSON.stringify(aggregatedFrom),
      updated_at: nowISOFull(),
    },
    "id = ?",
    [primary.id],
  );

  // Suppress duplicate (don't delete, minimize importance)
  db.update(
    "reflections",
    { importance: 0.001, updated_at: nowISOFull() },
    "id = ?",
    [duplicate.id],
  );
}

/**
 * Aggregate semantically similar reflections during consolidation.
 *
 * Finds reflection pairs with high cosine similarity (>0.85) of the
 * same type and merges them while preserving timeline information.
 *
 * @param {object} db
 * @returns {number} Count of reflection pairs merged
 */
export function aggregateReflections(db) {
  const threshold = 0.85;
  let mergedCount = 0;

  try {
    // Find reflections with embeddings
    const rows = db.query(
      `SELECT r.id, r.content, r.reflection_type, r.importance,
              r.aggregation_count, r.first_observed_at, r.last_confirmed_at,
              re.embedding
       FROM reflections r
       JOIN reflection_embeddings re ON r.id = re.reflection_id
       WHERE r.importance > 0.1
       ORDER BY r.importance DESC`,
    );

    if (rows.length < 2) {
      return 0;
    }

    // Parse embeddings
    const reflectionsWithEmb = [];
    for (const row of rows) {
      if (row.embedding) {
        try {
          const emb = typeof row.embedding === 'string'
            ? JSON.parse(row.embedding)
            : row.embedding;
          reflectionsWithEmb.push({
            id: row.id,
            content: row.content,
            type: row.reflection_type,
            importance: row.importance,
            aggregation_count: row.aggregation_count,
            first_observed_at: row.first_observed_at,
            last_confirmed_at: row.last_confirmed_at,
            embedding: emb,
          });
        } catch {
          continue;
        }
      }
    }

    // Pairwise similarity, same type only
    const alreadyMerged = new Set();
    for (let i = 0; i < reflectionsWithEmb.length; i++) {
      if (alreadyMerged.has(reflectionsWithEmb[i].id)) continue;
      for (let j = i + 1; j < reflectionsWithEmb.length; j++) {
        if (alreadyMerged.has(reflectionsWithEmb[j].id)) continue;

        // Only merge same type
        if (reflectionsWithEmb[i].type !== reflectionsWithEmb[j].type) continue;

        const sim = cosineSimilarity(
          reflectionsWithEmb[i].embedding,
          reflectionsWithEmb[j].embedding,
        );
        if (sim >= threshold) {
          // Keep the one with higher aggregation_count * importance
          const scoreI = reflectionsWithEmb[i].aggregation_count * reflectionsWithEmb[i].importance;
          const scoreJ = reflectionsWithEmb[j].aggregation_count * reflectionsWithEmb[j].importance;

          let primary, duplicate;
          if (scoreI >= scoreJ) {
            primary = reflectionsWithEmb[i];
            duplicate = reflectionsWithEmb[j];
          } else {
            primary = reflectionsWithEmb[j];
            duplicate = reflectionsWithEmb[i];
          }

          mergeReflectionPair(db, primary, duplicate);
          alreadyMerged.add(duplicate.id);
          mergedCount++;
        }
      }
    }
  } catch (e) {
    // Reflection table may not exist
  }

  if (mergedCount > 0) {
    log(`Aggregated ${mergedCount} similar reflection pairs`);
  }
  return mergedCount;
}

// ---------------------------------------------------------------------------
// Phase 3: Pattern detection - sub-detectors
// ---------------------------------------------------------------------------

/**
 * Store or update a detected pattern in the database.
 * @param {object} db
 * @param {{ name: string, description: string, pattern_type: string, confidence: number, evidence: string[] }} pattern
 * @returns {number} Pattern row ID
 */
function storePattern(db, pattern) {
  const existing = db.queryOne(
    "SELECT id, occurrences, confidence FROM patterns WHERE name = ?",
    [pattern.name],
  );

  if (existing) {
    const newOccurrences = existing.occurrences + 1;
    const newConfidence = Math.min(1.0, (existing.confidence + pattern.confidence) / 2);

    db.update(
      "patterns",
      {
        occurrences: newOccurrences,
        confidence: newConfidence,
        last_observed_at: nowISOFull(),
        evidence: JSON.stringify(pattern.evidence),
      },
      "id = ?",
      [existing.id],
    );
    return existing.id;
  } else {
    return db.insert("patterns", {
      name: pattern.name,
      description: pattern.description,
      pattern_type: pattern.pattern_type,
      occurrences: 1,
      confidence: pattern.confidence,
      first_observed_at: nowISOFull(),
      last_observed_at: nowISOFull(),
      evidence: JSON.stringify(pattern.evidence),
      is_active: 1,
    });
  }
}

/**
 * Detect relationships that haven't been mentioned recently.
 * @param {object} db
 * @returns {Array} Detected patterns
 */
function detectCoolingRelationships(db) {
  const patterns = [];
  const cutoff30 = daysAgo(30);

  const rows = db.query(
    `SELECT e.id, e.name, e.type, e.importance,
            MAX(m.created_at) as last_mention
     FROM entities e
     LEFT JOIN memory_entities me ON e.id = me.entity_id
     LEFT JOIN memories m ON me.memory_id = m.id
     WHERE e.type = 'person'
       AND e.importance > 0.3
     GROUP BY e.id
     HAVING last_mention < ? OR last_mention IS NULL
     ORDER BY e.importance DESC
     LIMIT 20`,
    [cutoff30],
  );

  for (const row of rows) {
    let daysSince = null;
    if (row.last_mention) {
      daysSince = Math.floor(daysBetween(row.last_mention, new Date().toISOString()));
    }

    patterns.push({
      name: `cooling_relationship_${row.id}`,
      description: `No contact with ${row.name} in ${daysSince || 'many'} days`,
      pattern_type: "relationship",
      confidence: Math.min(0.9, 0.5 + (daysSince || 30) / 100),
      evidence: [`Last mention: ${row.last_mention || 'never'}`],
    });
  }

  return patterns;
}

/**
 * Detect patterns in commitments (overdue, frequently delayed, etc.)
 * @param {object} db
 * @returns {Array} Detected patterns
 */
function detectCommitmentPatterns(db) {
  const patterns = [];
  const cutoff = daysAgo(7);

  const overdue = db.queryOne(
    `SELECT COUNT(*) as count FROM memories
     WHERE type = 'commitment'
       AND importance > 0.5
       AND created_at < ?`,
    [cutoff],
  );

  if (overdue && overdue.count > 3) {
    patterns.push({
      name: "overdue_commitments",
      description: `${overdue.count} commitments older than 7 days may be overdue`,
      pattern_type: "behavioral",
      confidence: 0.7,
      evidence: ["Multiple old commitments detected"],
    });
  }

  return patterns;
}

/**
 * Detect communication style patterns.
 * @param {object} db
 * @returns {Array} Detected patterns
 */
function detectCommunicationPatterns(db) {
  const patterns = [];

  try {
    const recentMessages = db.query(
      `SELECT role, LENGTH(content) as msg_length
       FROM messages
       WHERE created_at >= ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [daysAgo(7)],
    );

    if (recentMessages.length >= 20) {
      const userMsgs = recentMessages.filter(m => m.role === 'user');
      if (userMsgs.length > 0) {
        const avgLength = userMsgs.reduce((sum, m) => sum + m.msg_length, 0) / userMsgs.length;

        if (avgLength < 50) {
          patterns.push({
            name: "brief_communication_style",
            description: "User tends to communicate in brief messages",
            pattern_type: "communication",
            confidence: 0.6,
            evidence: [`Average message length: ${Math.round(avgLength)} characters`],
          });
        } else if (avgLength > 200) {
          patterns.push({
            name: "detailed_communication_style",
            description: "User tends to provide detailed context",
            pattern_type: "communication",
            confidence: 0.6,
            evidence: [`Average message length: ${Math.round(avgLength)} characters`],
          });
        }
      }
    }
  } catch {
    // messages table may not exist
  }

  return patterns;
}

/**
 * Detect person entities that co-occur in memories but have no explicit relationship.
 * @param {object} db
 * @returns {Array} Detected patterns
 */
function detectCrossEntityPatterns(db) {
  const patterns = [];

  try {
    // Find pairs of person entities that appear together in 2+ memories
    const coMentions = db.query(
      `SELECT
          e1.id as id1, e1.name as name1,
          e2.id as id2, e2.name as name2,
          COUNT(DISTINCT me1.memory_id) as co_count
       FROM memory_entities me1
       JOIN memory_entities me2 ON me1.memory_id = me2.memory_id AND me1.entity_id < me2.entity_id
       JOIN entities e1 ON me1.entity_id = e1.id AND e1.type = 'person'
       JOIN entities e2 ON me2.entity_id = e2.id AND e2.type = 'person'
       GROUP BY me1.entity_id, me2.entity_id
       HAVING co_count >= 2
       ORDER BY co_count DESC
       LIMIT 20`,
    );

    for (const row of coMentions) {
      // Check if a relationship already exists between them
      const existing = db.queryOne(
        `SELECT id FROM relationships
         WHERE (source_entity_id = ? AND target_entity_id = ?)
            OR (source_entity_id = ? AND target_entity_id = ?)`,
        [row.id1, row.id2, row.id2, row.id1],
      );
      if (existing) continue;

      const coCount = row.co_count;
      const confidence = Math.min(0.9, 0.4 + coCount * 0.1);

      patterns.push({
        name: `cross_entity_${row.id1}_${row.id2}`,
        description: `${row.name1} and ${row.name2} appear together in ${coCount} memories. Are they connected?`,
        pattern_type: "relationship",
        confidence,
        evidence: [`Co-mentioned in ${coCount} memories`],
      });
    }
  } catch {
    // database structure issue
  }

  return patterns;
}

/**
 * Infer a likely connection between two entities based on shared attributes.
 * @param {object} db
 * @param {number} entityAId
 * @param {number} entityBId
 * @returns {[string, number]|null} [relationship_type, confidence] or null
 */
function inferConnections(db, entityAId, entityBId) {
  try {
    const entityA = db.queryOne("SELECT * FROM entities WHERE id = ?", [entityAId]);
    const entityB = db.queryOne("SELECT * FROM entities WHERE id = ?", [entityBId]);

    if (!entityA || !entityB) return null;

    const aMeta = safeJsonParse(entityA.metadata, {});
    const bMeta = safeJsonParse(entityB.metadata, {});

    // Same company = definitely connected (colleagues)
    const aCompany = aMeta.company;
    const bCompany = bMeta.company;
    if (aCompany && bCompany && aCompany.toLowerCase() === bCompany.toLowerCase()) {
      return ["colleagues", 0.9];
    }

    // Same community = probably know each other
    const aCommunities = new Set((aMeta.communities || []).map(c => c.toLowerCase()));
    const bCommunities = new Set((bMeta.communities || []).map(c => c.toLowerCase()));
    const sharedCommunities = [...aCommunities].filter(c => bCommunities.has(c));
    if (sharedCommunities.length > 0) {
      return ["community_connection", 0.6];
    }

    // Same city + same industry = might know each other
    const aGeo = aMeta.geography || {};
    const bGeo = bMeta.geography || {};
    const aCity = (aGeo.city || "").toLowerCase();
    const bCity = (bGeo.city || "").toLowerCase();

    const aIndustries = new Set((aMeta.industries || []).map(i => i.toLowerCase()));
    const bIndustries = new Set((bMeta.industries || []).map(i => i.toLowerCase()));
    const sharedIndustries = [...aIndustries].filter(i => bIndustries.has(i));

    if (aCity && aCity === bCity && sharedIndustries.length > 0) {
      return ["likely_connected", 0.3];
    }

    // Same industry alone = weak inference
    if (sharedIndustries.length >= 1) {
      return ["industry_peers", 0.2];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Detect potential connections between entities based on shared attributes.
 * @param {object} db
 * @returns {Array} Detected patterns
 */
function detectInferredConnections(db) {
  const patterns = [];

  try {
    const entities = db.query(
      `SELECT id, name, metadata FROM entities
       WHERE type = 'person' AND importance > 0.2 AND metadata IS NOT NULL
       ORDER BY importance DESC
       LIMIT 100`,
    );

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entityA = entities[i];
        const entityB = entities[j];

        // Check if relationship already exists
        const existing = db.queryOne(
          `SELECT id FROM relationships
           WHERE (source_entity_id = ? AND target_entity_id = ?)
              OR (source_entity_id = ? AND target_entity_id = ?)`,
          [entityA.id, entityB.id, entityB.id, entityA.id],
        );
        if (existing) continue;

        const inference = inferConnections(db, entityA.id, entityB.id);
        if (inference) {
          const [relType, confidence] = inference;
          patterns.push({
            name: `inferred_connection_${entityA.id}_${entityB.id}`,
            description: `${entityA.name} and ${entityB.name} may be connected (${relType})`,
            pattern_type: "relationship",
            confidence,
            evidence: [`Inferred relationship type: ${relType}`],
          });
        }
      }
    }
  } catch {
    // database structure issue
  }

  return patterns;
}

/**
 * Detect pairs of people who share attributes but aren't directly connected.
 * Only strong inferences (confidence >= 0.5).
 * @param {object} db
 * @returns {Array} Detected patterns (max 10)
 */
function detectIntroductionOpportunities(db) {
  const patterns = [];

  try {
    const entities = db.query(
      `SELECT id, name, metadata FROM entities
       WHERE type = 'person' AND importance > 0.3 AND metadata IS NOT NULL
       ORDER BY importance DESC
       LIMIT 50`,
    );

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entityA = entities[i];
        const entityB = entities[j];

        // Check if relationship already exists
        const existing = db.queryOne(
          `SELECT id FROM relationships
           WHERE (source_entity_id = ? AND target_entity_id = ?)
              OR (source_entity_id = ? AND target_entity_id = ?)`,
          [entityA.id, entityB.id, entityB.id, entityA.id],
        );
        if (existing) continue;

        const inference = inferConnections(db, entityA.id, entityB.id);
        if (inference && inference[1] >= 0.5) {
          const [relType, confidence] = inference;
          const aMeta = safeJsonParse(entityA.metadata, {});
          const bMeta = safeJsonParse(entityB.metadata, {});

          // Build reason
          const reasonParts = [];
          if (relType === "colleagues") {
            reasonParts.push(`both at ${aMeta.company || 'same company'}`);
          } else if (relType === "community_connection") {
            const sharedCommunities = (aMeta.communities || []).filter(
              c => (bMeta.communities || []).map(x => x.toLowerCase()).includes(c.toLowerCase()),
            );
            if (sharedCommunities.length > 0) {
              reasonParts.push(`both in ${sharedCommunities[0]}`);
            }
          }

          const reason = reasonParts.length > 0 ? reasonParts.join(" and ") : relType;

          patterns.push({
            name: `intro_opportunity_${entityA.id}_${entityB.id}`,
            description: `${entityA.name} and ${entityB.name} might benefit from meeting (${reason})`,
            pattern_type: "relationship",
            confidence,
            evidence: [`Shared attributes suggest connection: ${relType}`],
          });
        }
      }
    }
  } catch {
    // database structure issue
  }

  return patterns.slice(0, 10);
}

/**
 * Detect when 3+ people are mentioned together frequently.
 * @param {object} db
 * @returns {Array} Detected patterns
 */
function detectClusterForming(db) {
  const patterns = [];

  try {
    const cutoff = daysAgo(30);

    const clusterRows = db.query(
      `SELECT
          m.id as memory_id,
          GROUP_CONCAT(e.name) as people,
          COUNT(DISTINCT e.id) as person_count
       FROM memories m
       JOIN memory_entities me ON m.id = me.memory_id
       JOIN entities e ON me.entity_id = e.id AND e.type = 'person'
       WHERE m.created_at >= ?
       GROUP BY m.id
       HAVING person_count >= 3
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [cutoff],
    );

    // Count co-occurrence frequency
    const clusterCounts = new Map();
    for (const row of clusterRows) {
      const people = row.people.split(",").sort();
      const key = people.join(",");
      clusterCounts.set(key, (clusterCounts.get(key) || 0) + 1);
    }

    // Sort by count descending, take top 5
    const sorted = [...clusterCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [key, count] of sorted) {
      if (count >= 2) {
        const people = key.split(",");
        let peopleStr = people.slice(0, 3).join(", ");
        if (people.length > 3) {
          peopleStr += ` and ${people.length - 3} others`;
        }

        const nameKey = people.slice(0, 3).map(p => p.split(/\s+/)[0].toLowerCase()).join("_");

        patterns.push({
          name: `cluster_forming_${nameKey}`,
          description: `You're frequently mentioning ${peopleStr} together (${count} times recently)`,
          pattern_type: "behavioral",
          confidence: Math.min(0.9, 0.5 + count * 0.1),
          evidence: [`Co-mentioned in ${count} memories in the last 30 days`],
        });
      }
    }
  } catch {
    // database structure issue
  }

  return patterns;
}

/**
 * Find people with skills/interests that match projects they're not connected to.
 * @param {object} db
 * @param {object} config
 * @returns {Array} Detected patterns (max 10)
 */
function detectSkillProjectMatches(db, config) {
  const patterns = [];

  try {
    // Get projects with descriptions
    const projects = db.query(
      `SELECT id, name, description, metadata FROM entities
       WHERE type = 'project' AND importance > 0.2
       ORDER BY importance DESC
       LIMIT 20`,
    );

    // Get people with attributes
    const people = db.query(
      `SELECT id, name, metadata FROM entities
       WHERE type = 'person' AND importance > 0.3 AND metadata IS NOT NULL
       ORDER BY importance DESC
       LIMIT 50`,
    );

    for (const project of projects) {
      const projDesc = (project.description || "").toLowerCase();
      const projMeta = safeJsonParse(project.metadata, {});
      const projIndustries = new Set(projMeta.industries || []);

      for (const person of people) {
        // Check if person is already connected to project
        const existing = db.queryOne(
          `SELECT id FROM relationships
           WHERE (source_entity_id = ? AND target_entity_id = ?)
              OR (source_entity_id = ? AND target_entity_id = ?)`,
          [person.id, project.id, project.id, person.id],
        );
        if (existing) continue;

        const personMeta = safeJsonParse(person.metadata, {});
        const personIndustries = new Set(personMeta.industries || []);
        const personRole = (personMeta.role || "").toLowerCase();

        // Check for industry match
        const sharedIndustries = [...projIndustries].filter(i => personIndustries.has(i));
        if (sharedIndustries.length > 0) {
          patterns.push({
            name: `skill_project_match_${person.id}_${project.id}`,
            description: `${person.name} might be valuable for ${project.name} (shares ${sharedIndustries.join(', ')} expertise)`,
            pattern_type: "opportunity",
            confidence: 0.6,
            evidence: [`Shared industries: ${sharedIndustries.join(', ')}`],
          });
          continue;
        }

        // Check for role match in description
        if (personRole && projDesc.includes(personRole)) {
          patterns.push({
            name: `skill_project_match_${person.id}_${project.id}`,
            description: `${person.name} (${personRole}) might be valuable for ${project.name}`,
            pattern_type: "opportunity",
            confidence: 0.5,
            evidence: [`Role '${personRole}' mentioned in project description`],
          });
        }
      }
    }
  } catch {
    // database structure issue
  }

  return patterns.slice(0, 10);
}

/**
 * Detect when the user bridges distinct clusters in their network.
 * @param {object} db
 * @returns {Array} Detected patterns
 */
function detectNetworkBridges(db) {
  const patterns = [];

  try {
    // Find people with high connection counts
    const hubs = db.query(
      `SELECT e.id, e.name,
              COUNT(DISTINCT r.id) as connection_count
       FROM entities e
       LEFT JOIN relationships r ON (e.id = r.source_entity_id OR e.id = r.target_entity_id)
           AND r.strength > 0.2 AND r.invalid_at IS NULL
       WHERE e.type = 'person' AND e.importance > 0.4
       GROUP BY e.id
       HAVING connection_count >= 5
       ORDER BY connection_count DESC
       LIMIT 10`,
    );

    for (const hub of hubs) {
      // Get all neighbors of this hub
      const neighbors = db.query(
        `SELECT DISTINCT
            CASE WHEN r.source_entity_id = ? THEN r.target_entity_id ELSE r.source_entity_id END as neighbor_id,
            e.name as neighbor_name
         FROM relationships r
         JOIN entities e ON e.id = CASE WHEN r.source_entity_id = ? THEN r.target_entity_id ELSE r.source_entity_id END
         WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
           AND r.strength > 0.2 AND r.invalid_at IS NULL
           AND e.type = 'person'`,
        [hub.id, hub.id, hub.id, hub.id],
      );

      if (neighbors.length < 4) continue;

      // Check how many neighbors are connected to each other (not through hub)
      const neighborIds = neighbors.map(n => n.neighbor_id);
      const placeholders = neighborIds.map(() => '?').join(',');
      const interconnections = db.queryOne(
        `SELECT COUNT(*) as cnt FROM relationships
         WHERE source_entity_id IN (${placeholders})
           AND target_entity_id IN (${placeholders})
           AND strength > 0.2 AND invalid_at IS NULL`,
        [...neighborIds, ...neighborIds],
      );

      const interCount = interconnections ? interconnections.cnt : 0;
      const maxPossible = neighborIds.length * (neighborIds.length - 1) / 2;

      // If few interconnections relative to possible, this is a bridge
      if (maxPossible > 0 && interCount / maxPossible < 0.2) {
        const groupA = neighbors.slice(0, Math.floor(neighbors.length / 2));
        const groupB = neighbors.slice(Math.floor(neighbors.length / 2));

        patterns.push({
          name: `network_bridge_${hub.id}`,
          description: `${hub.name} bridges distinct groups (${groupA.length} and ${groupB.length} people who don't know each other)`,
          pattern_type: "opportunity",
          confidence: 0.7,
          evidence: [`Only ${interCount} connections among ${neighborIds.length} neighbors`],
        });
      }
    }
  } catch {
    // database structure issue
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Phase 3: Contact velocity + attention tiers
// ---------------------------------------------------------------------------

/**
 * Calculate contact frequency and trend for person entities.
 * @param {object} db
 */
function updateContactVelocity(db) {
  const entities = db.query(
    "SELECT id, name FROM entities WHERE type = 'person' AND deleted_at IS NULL",
  );

  const now = new Date();

  for (const entity of entities) {
    // Get all memory timestamps for this entity
    const rows = db.query(
      `SELECT m.created_at
       FROM memories m
       JOIN memory_entities me ON m.id = me.memory_id
       WHERE me.entity_id = ?
         AND m.invalidated_at IS NULL
       ORDER BY m.created_at ASC`,
      [entity.id],
    );

    if (rows.length === 0) continue;

    const timestamps = [];
    for (const r of rows) {
      try {
        timestamps.push(new Date(r.created_at));
      } catch {
        continue;
      }
    }

    if (timestamps.length === 0) continue;

    const lastContact = timestamps[timestamps.length - 1];

    // Calculate intervals between consecutive mentions (in days)
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      const delta = (timestamps[i].getTime() - timestamps[i - 1].getTime()) / (86400 * 1000);
      if (delta > 0) {
        intervals.push(delta);
      }
    }

    let avgFreq = null;
    let trend = "stable";

    // Need at least 2 intervals for trend detection
    if (intervals.length < 2) {
      avgFreq = intervals.length > 0 ? intervals[0] : null;
      trend = "stable";
    } else {
      // Rolling average: last 5 intervals vs historical
      const recent = intervals.length >= 5 ? intervals.slice(-5) : intervals.slice();
      avgFreq = recent.reduce((s, v) => s + v, 0) / recent.length;

      if (intervals.length >= 4) {
        const historical = intervals.length > recent.length
          ? intervals.slice(0, -recent.length)
          : intervals.slice(0, Math.floor(intervals.length / 2));
        const histAvg = historical.length > 0
          ? historical.reduce((s, v) => s + v, 0) / historical.length
          : avgFreq;

        const ratio = histAvg > 0 ? avgFreq / histAvg : 1.0;

        if (ratio < 0.7) {
          trend = "accelerating"; // Recent intervals shorter
        } else if (ratio > 1.5) {
          trend = "decelerating"; // Recent intervals longer
        } else {
          trend = "stable";
        }
      } else {
        trend = "stable";
      }
    }

    // Check for dormancy: last contact > 2x average frequency
    const daysSinceContact = (now.getTime() - lastContact.getTime()) / (86400 * 1000);
    if (avgFreq && daysSinceContact > avgFreq * 2 && daysSinceContact > 30) {
      trend = "dormant";
    }

    // Update entity
    db.run(
      `UPDATE entities
       SET last_contact_at = ?,
           contact_frequency_days = ?,
           contact_trend = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        lastContact.toISOString(),
        avgFreq !== null ? Math.round(avgFreq * 10) / 10 : null,
        trend,
        entity.id,
      ],
    );
  }

  log(`Updated contact velocity for ${entities.length} entities`);
}

/**
 * Assign attention tiers based on recency and deadlines.
 *
 * - Active: mentioned in last 7 days OR has deadline within 14 days
 * - Watchlist: decelerating trend OR has deadline within 30 days
 * - Standard: default
 * - Archive: not mentioned in 90+ days AND importance < 0.3
 *
 * @param {object} db
 */
function updateAttentionTiers(db) {
  const sevenDays = daysAgo(7);
  const ninetyDays = daysAgo(90);
  const fourteenDaysAhead = daysAhead(14);
  const thirtyDaysAhead = daysAhead(30);
  const nowStr = nowISO();

  // Reset all to standard first
  db.run("UPDATE entities SET attention_tier = 'standard' WHERE deleted_at IS NULL");

  // Archive: no contact in 90+ days AND low importance
  db.run(
    `UPDATE entities SET attention_tier = 'archive'
     WHERE deleted_at IS NULL
       AND type = 'person'
       AND (last_contact_at IS NULL OR last_contact_at < ?)
       AND importance < 0.3`,
    [ninetyDays],
  );

  // Watchlist: decelerating trend OR deadline within 30 days
  db.run(
    `UPDATE entities SET attention_tier = 'watchlist'
     WHERE deleted_at IS NULL
       AND type = 'person'
       AND (
         contact_trend = 'decelerating'
         OR id IN (
             SELECT DISTINCT me.entity_id
             FROM memory_entities me
             JOIN memories m ON me.memory_id = m.id
             WHERE m.deadline_at IS NOT NULL
               AND m.deadline_at BETWEEN ? AND ?
               AND m.invalidated_at IS NULL
         )
       )`,
    [nowStr, thirtyDaysAhead],
  );

  // Active: mentioned in last 7 days OR deadline within 14 days
  db.run(
    `UPDATE entities SET attention_tier = 'active'
     WHERE deleted_at IS NULL
       AND type = 'person'
       AND (
         last_contact_at >= ?
         OR id IN (
             SELECT DISTINCT me.entity_id
             FROM memory_entities me
             JOIN memories m ON me.memory_id = m.id
             WHERE m.deadline_at IS NOT NULL
               AND m.deadline_at BETWEEN ? AND ?
               AND m.invalidated_at IS NULL
         )
       )`,
    [sevenDays, nowStr, fourteenDaysAhead],
  );

  log("Updated attention tiers");
}

/**
 * Generate actionable reconnection predictions for dormant/decelerating contacts.
 * @param {object} db
 */
function generateReconnectionSuggestions(db) {
  const entities = db.query(
    `SELECT id, name, contact_trend, last_contact_at, contact_frequency_days
     FROM entities
     WHERE type = 'person'
       AND deleted_at IS NULL
       AND contact_trend IN ('decelerating', 'dormant')
       AND importance > 0.3
     ORDER BY importance DESC
     LIMIT 20`,
  );

  const now = new Date();

  for (const entity of entities) {
    const entityId = entity.id;
    const entityName = entity.name;
    const trend = entity.contact_trend;

    // Calculate days since last contact
    let daysSince = 0;
    if (entity.last_contact_at) {
      try {
        const lastDt = new Date(entity.last_contact_at);
        daysSince = Math.floor((now.getTime() - lastDt.getTime()) / (86400 * 1000));
      } catch {
        // ignore parse errors
      }
    }

    // Get last topic (most recent memory about this entity)
    const lastMemory = db.queryOne(
      `SELECT m.content FROM memories m
       JOIN memory_entities me ON m.id = me.memory_id
       WHERE me.entity_id = ? AND m.invalidated_at IS NULL
       ORDER BY m.created_at DESC LIMIT 1`,
      [entityId],
    );
    const lastTopic = lastMemory ? lastMemory.content.slice(0, 100) : "No recent topic";

    // Get open commitments
    const openCommitments = db.query(
      `SELECT m.content FROM memories m
       JOIN memory_entities me ON m.id = me.memory_id
       WHERE me.entity_id = ?
         AND m.type = 'commitment'
         AND m.invalidated_at IS NULL
       ORDER BY m.importance DESC LIMIT 3`,
      [entityId],
    );
    const commitmentList = openCommitments.map(c => c.content.slice(0, 80));

    // Build suggestion
    let suggestedAction = "Reach out to reconnect";
    if (commitmentList.length > 0) {
      suggestedAction = `Address open commitment: ${commitmentList[0]}`;
    }

    let priority = 0.7;
    if (trend === "dormant") {
      priority = 0.85;
    }
    if (commitmentList.length > 0) {
      priority = Math.min(1.0, priority + 0.1);
    }

    let content = `Reconnect with ${entityName} (${daysSince} days, ${trend}). Last topic: ${lastTopic}. `;
    if (commitmentList.length > 0) {
      content += `Open commitments: ${commitmentList.join('; ')}. `;
    }
    content += `Suggested: ${suggestedAction}`;

    const metadata = JSON.stringify({
      entity_id: entityId,
      entity_name: entityName,
      days_since_contact: daysSince,
      trend,
      open_commitments: commitmentList,
      last_topic: lastTopic,
    });

    const expires = new Date(now.getTime() + 14 * 86400 * 1000).toISOString();

    // Check for existing reconnection prediction for this entity
    const existing = db.queryOne(
      `SELECT id FROM predictions
       WHERE prediction_type = 'reconnection'
         AND metadata LIKE ?
         AND expires_at > ?
       LIMIT 1`,
      [`%"entity_id": ${entityId}%`, now.toISOString()],
    );

    if (existing) {
      db.update(
        "predictions",
        {
          content,
          priority,
          metadata,
          expires_at: expires,
          updated_at: nowISOFull(),
        },
        "id = ?",
        [existing.id],
      );
    } else {
      db.insert("predictions", {
        content,
        prediction_type: "reconnection",
        priority,
        expires_at: expires,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        metadata,
      });
    }
  }

  if (entities.length > 0) {
    log(`Generated ${entities.length} reconnection suggestions`);
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Pattern detection (orchestrator)
// ---------------------------------------------------------------------------

/**
 * Analyze memories and entities to detect behavioral patterns.
 *
 * Detects: cooling relationships, commitment patterns, communication patterns,
 * cross-entity patterns, inferred connections, introduction opportunities,
 * cluster forming, opportunities (skill-project matches, network bridges).
 *
 * Also updates contact velocity and attention tiers.
 *
 * @param {object} db
 * @param {object} config
 * @returns {Array} List of detected patterns
 */
export function detectPatterns(db, config) {
  const patterns = [];

  // Detect relationship cooling
  patterns.push(...detectCoolingRelationships(db));

  // Detect commitment patterns
  patterns.push(...detectCommitmentPatterns(db));

  // Detect communication patterns
  patterns.push(...detectCommunicationPatterns(db));

  // Detect cross-entity patterns (co-mentioned people without explicit relationships)
  patterns.push(...detectCrossEntityPatterns(db));

  // Detect inferred connections (attribute-based: same city, industry, community)
  patterns.push(...detectInferredConnections(db));

  // Detect introduction opportunities (people who should know each other)
  patterns.push(...detectIntroductionOpportunities(db));

  // Detect forming clusters (3+ people mentioned together frequently)
  patterns.push(...detectClusterForming(db));

  // Detect opportunities (skill-project matches, network bridges)
  patterns.push(...detectSkillProjectMatches(db, config));
  patterns.push(...detectNetworkBridges(db));

  // Update contact velocity and attention tiers
  try {
    updateContactVelocity(db);
    updateAttentionTiers(db);
    generateReconnectionSuggestions(db);
  } catch (e) {
    // Velocity/tier columns may not exist
  }

  // Store detected patterns
  for (const pattern of patterns) {
    storePattern(db, pattern);
  }

  log(`Detected ${patterns.length} patterns`);
  return patterns;
}

// ---------------------------------------------------------------------------
// Phase 4: Entity summaries
// ---------------------------------------------------------------------------

/**
 * Build a structured summary for a single entity.
 * @param {object} db
 * @param {object} entity - Entity row with mem_count
 * @returns {string|null} Summary text or null if not enough data
 */
function buildEntitySummary(db, entity) {
  const entityId = entity.id;
  const parts = [];

  // Header
  const entityType = entity.type;
  const name = entity.name;
  const description = entity.description || "";
  if (description) {
    parts.push(`${name} (${entityType}): ${description}`);
  } else {
    parts.push(`${name} (${entityType})`);
  }

  // Key facts (top 5 by importance)
  const facts = db.query(
    `SELECT m.content, m.type, m.importance
     FROM memories m
     JOIN memory_entities me ON m.id = me.memory_id
     WHERE me.entity_id = ?
       AND m.invalidated_at IS NULL
       AND m.importance > 0.2
     ORDER BY m.importance DESC
     LIMIT 5`,
    [entityId],
  );

  if (facts.length > 0) {
    const factLines = [];
    for (const f of facts) {
      const prefix = f.type !== "fact" ? f.type.toUpperCase() : "";
      const content = f.content.slice(0, 120);
      if (prefix) {
        factLines.push(`  [${prefix}] ${content}`);
      } else {
        factLines.push(`  - ${content}`);
      }
    }
    parts.push("Key information:\n" + factLines.join("\n"));
  }

  // Relationships
  const relationships = db.query(
    `SELECT r.relationship_type, r.strength, r.origin_type,
            e.name as connected_name, e.type as connected_type
     FROM relationships r
     JOIN entities e ON e.id = CASE
         WHEN r.source_entity_id = ? THEN r.target_entity_id
         ELSE r.source_entity_id END
     WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
       AND r.invalid_at IS NULL
       AND r.strength > 0.1
     ORDER BY r.strength DESC
     LIMIT 10`,
    [entityId, entityId, entityId],
  );

  if (relationships.length > 0) {
    const relLines = [];
    for (const r of relationships) {
      relLines.push(
        `  ${r.relationship_type} -> ${r.connected_name} ` +
        `(${r.connected_type}, strength: ${r.strength.toFixed(1)})`,
      );
    }
    parts.push("Relationships:\n" + relLines.join("\n"));
  }

  // Open commitments
  const commitments = db.query(
    `SELECT m.content, m.deadline_at
     FROM memories m
     JOIN memory_entities me ON m.id = me.memory_id
     WHERE me.entity_id = ?
       AND m.type = 'commitment'
       AND m.invalidated_at IS NULL
     ORDER BY m.importance DESC
     LIMIT 3`,
    [entityId],
  );

  if (commitments.length > 0) {
    const commitLines = [];
    for (const c of commitments) {
      const deadline = c.deadline_at ? ` (due: ${c.deadline_at})` : "";
      commitLines.push(`  - ${c.content.slice(0, 100)}${deadline}`);
    }
    parts.push("Open commitments:\n" + commitLines.join("\n"));
  }

  // Contact velocity (for person entities)
  if (entity.type === "person") {
    const velocityParts = [];
    if (entity.contact_trend) {
      velocityParts.push(`trend: ${entity.contact_trend}`);
    }
    if (entity.contact_frequency_days) {
      velocityParts.push(`avg frequency: ${Math.round(entity.contact_frequency_days)} days`);
    }
    if (entity.attention_tier) {
      velocityParts.push(`tier: ${entity.attention_tier}`);
    }
    if (entity.last_contact_at) {
      try {
        const lastDt = new Date(entity.last_contact_at);
        const daysSince = Math.floor((new Date().getTime() - lastDt.getTime()) / (86400 * 1000));
        velocityParts.push(`last contact: ${daysSince} days ago`);
      } catch {
        // ignore parse error
      }
    }
    if (velocityParts.length > 0) {
      parts.push("Contact velocity: " + velocityParts.join(", "));
    }
  }

  if (parts.length <= 1) {
    return null; // Not enough data for a useful summary
  }

  return parts.join("\n\n");
}

/**
 * Store or update an entity summary.
 * @param {object} db
 * @param {number} entityId
 * @param {string} summary
 * @param {object} entity
 * @param {object} config
 */
function storeEntitySummary(db, entityId, summary, entity, config) {
  const now = nowISOFull();
  const expires = new Date(new Date().getTime() + config.entity_summary_max_age_days * 86400 * 1000).toISOString();

  // Count relationships
  const relCountRow = db.queryOne(
    `SELECT COUNT(*) as cnt FROM relationships
     WHERE (source_entity_id = ? OR target_entity_id = ?)
       AND invalid_at IS NULL AND strength > 0.1`,
    [entityId, entityId],
  );
  const relCount = relCountRow ? relCountRow.cnt : 0;

  const metadata = JSON.stringify({
    entity_name: entity.name,
    entity_type: entity.type,
    attention_tier: entity.attention_tier,
    contact_trend: entity.contact_trend,
  });

  // Upsert: try update first, then insert
  const existing = db.queryOne(
    "SELECT id FROM entity_summaries WHERE entity_id = ? AND summary_type = 'overview'",
    [entityId],
  );

  if (existing) {
    db.update(
      "entity_summaries",
      {
        summary,
        memory_count: entity.mem_count,
        relationship_count: relCount,
        generated_at: now,
        expires_at: expires,
        metadata,
      },
      "id = ?",
      [existing.id],
    );
  } else {
    db.insert("entity_summaries", {
      entity_id: entityId,
      summary,
      summary_type: "overview",
      memory_count: entity.mem_count,
      relationship_count: relCount,
      generated_at: now,
      expires_at: expires,
      metadata,
    });
  }
}

/**
 * Generate hierarchical summaries for entities with enough memories.
 *
 * Creates or updates entity_summaries rows that provide a high-level
 * overview of each significant entity.
 *
 * @param {object} db
 * @param {object} config
 * @returns {number} Count of summaries generated or updated
 */
export function generateEntitySummaries(db, config) {
  if (!config.enable_entity_summaries) {
    return 0;
  }

  const minMemories = config.entity_summary_min_memories;
  const maxAgeDays = config.entity_summary_max_age_days;
  const cutoff = daysAgo(maxAgeDays);
  let count = 0;

  try {
    // Find entities that need summaries (enough memories, no recent summary)
    const entities = db.query(
      `SELECT e.id, e.name, e.type, e.description, e.importance,
              e.last_contact_at, e.contact_frequency_days, e.contact_trend,
              e.attention_tier,
              COUNT(DISTINCT me.memory_id) as mem_count,
              es.generated_at as last_summary_at
       FROM entities e
       JOIN memory_entities me ON e.id = me.entity_id
       LEFT JOIN entity_summaries es ON e.id = es.entity_id AND es.summary_type = 'overview'
       WHERE e.deleted_at IS NULL
         AND e.importance > 0.1
       GROUP BY e.id
       HAVING mem_count >= ?
         AND (es.generated_at IS NULL OR es.generated_at < ?)
       ORDER BY e.importance DESC, mem_count DESC
       LIMIT 50`,
      [minMemories, cutoff],
    );

    for (const entity of entities) {
      const summary = buildEntitySummary(db, entity);
      if (summary) {
        storeEntitySummary(db, entity.id, summary, entity, config);
        count++;
      }
    }
  } catch (e) {
    log(`Entity summary generation failed: ${e.message || e}`);
  }

  if (count > 0) {
    log(`Generated ${count} entity summaries`);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Phase 5: Auto-dedupe entities
// ---------------------------------------------------------------------------

/**
 * Find and flag potential entity duplicates using embedding similarity.
 *
 * Uses vec0's native KNN search on entity_embeddings to find entities with
 * similar embeddings that likely refer to the same real-world entity.
 * Does NOT auto-merge -- stores suggestions in predictions for user review.
 *
 * Also checks alias overlap between entities of the same type.
 *
 * @param {object} db
 * @param {object} config
 * @returns {Array} List of duplicate candidate pairs with similarity scores
 */
export function autoDedupeEntities(db, config) {
  if (!config.enable_auto_dedupe) {
    return [];
  }

  const threshold = config.auto_dedupe_threshold;
  const candidates = [];
  const seenPairs = new Set();

  // Method 1: vec0 KNN search on entity embeddings
  try {
    const entities = db.query(
      `SELECT e.id, e.name, e.canonical_name, e.type, e.importance
       FROM entities e
       WHERE e.deleted_at IS NULL AND e.importance > 0.05
       ORDER BY e.importance DESC
       LIMIT 200`,
    );

    const entityMap = new Map();
    for (const e of entities) {
      entityMap.set(e.id, e);
    }

    let embRows;
    try {
      embRows = db.query("SELECT entity_id FROM entity_embeddings");
    } catch {
      embRows = [];
    }
    const entityIdsWithEmb = new Set(
      embRows.filter(r => entityMap.has(r.entity_id)).map(r => r.entity_id),
    );

    for (const eid of entityIdsWithEmb) {
      try {
        const neighbors = db.query(
          `SELECT ee.entity_id, ee.distance
           FROM entity_embeddings ee
           WHERE ee.embedding MATCH (
               SELECT embedding FROM entity_embeddings WHERE entity_id = ?
           )
           AND k = 10`,
          [eid],
        );

        const e1 = entityMap.get(eid);
        if (!e1) continue;

        for (const neighbor of neighbors) {
          const nid = neighbor.entity_id;
          if (nid === eid) continue;
          const e2 = entityMap.get(nid);
          if (!e2) continue;
          if (e1.type !== e2.type) continue;

          const dist = neighbor.distance;
          const sim = 1.0 - dist;
          if (sim < threshold) continue;

          const pairKey = `${Math.min(eid, nid)}_${Math.max(eid, nid)}`;
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);

          candidates.push({
            entity_1: { id: e1.id, name: e1.name, type: e1.type },
            entity_2: { id: e2.id, name: e2.name, type: e2.type },
            similarity: Math.round(sim * 1000) / 1000,
            method: "embedding",
          });
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Embedding-based dedupe unavailable
  }

  // Method 2: Alias overlap detection
  try {
    const aliasRows = db.query(
      `SELECT a1.entity_id as eid1, a2.entity_id as eid2,
              a1.canonical_alias as alias
       FROM entity_aliases a1
       JOIN entity_aliases a2 ON a1.canonical_alias = a2.canonical_alias
           AND a1.entity_id < a2.entity_id
       JOIN entities e1 ON a1.entity_id = e1.id AND e1.deleted_at IS NULL
       JOIN entities e2 ON a2.entity_id = e2.id AND e2.deleted_at IS NULL
           AND e1.type = e2.type`,
    );

    for (const row of aliasRows) {
      const pairKey = `${row.eid1}_${row.eid2}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const e1 = db.queryOne("SELECT id, name, type FROM entities WHERE id = ?", [row.eid1]);
      const e2 = db.queryOne("SELECT id, name, type FROM entities WHERE id = ?", [row.eid2]);
      if (e1 && e2) {
        candidates.push({
          entity_1: { id: e1.id, name: e1.name, type: e1.type },
          entity_2: { id: e2.id, name: e2.name, type: e2.type },
          similarity: 0.95,
          method: "alias_overlap",
          shared_alias: row.alias,
        });
      }
    }

    // Store top candidates as predictions for user review
    const now = new Date();
    for (const candidate of candidates.slice(0, 10)) {
      const content =
        `Possible duplicate entities: '${candidate.entity_1.name}' ` +
        `and '${candidate.entity_2.name}' ` +
        `(${Math.round(candidate.similarity * 100)}% similar via ${candidate.method}). ` +
        `Consider merging with memory.merge_entities.`;

      // Check for existing dedupe prediction
      const existing = db.queryOne(
        `SELECT id FROM predictions
         WHERE prediction_type = 'suggestion'
           AND metadata LIKE ?
           AND expires_at > ?
         LIMIT 1`,
        [
          `%"dedupe_pair": [${candidate.entity_1.id}, ${candidate.entity_2.id}]%`,
          now.toISOString(),
        ],
      );

      if (!existing) {
        db.insert("predictions", {
          content,
          prediction_type: "suggestion",
          priority: 0.6 + 0.3 * candidate.similarity,
          expires_at: new Date(now.getTime() + 14 * 86400 * 1000).toISOString(),
          created_at: now.toISOString(),
          metadata: JSON.stringify({
            dedupe_pair: [candidate.entity_1.id, candidate.entity_2.id],
            similarity: candidate.similarity,
            method: candidate.method,
          }),
        });
      }
    }
  } catch (e) {
    log(`Auto dedupe failed: ${e.message || e}`);
  }

  if (candidates.length > 0) {
    log(`Found ${candidates.length} potential entity duplicates`);
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Phase 6: Retention cleanup
// ---------------------------------------------------------------------------

/**
 * Auto-close orphan episodes that have no end_session call.
 * After 24 hours these will never be closed naturally.
 *
 * @param {object} db
 * @returns {number} Number of episodes closed
 */
export function closeStaleEpisodes(db) {
  const cutoff = hoursAgo(24);
  try {
    const result = db.run(
      `UPDATE episodes
       SET
           ended_at = COALESCE(
               (
                   SELECT MAX(created_at) FROM turn_buffer
                   WHERE turn_buffer.session_id = episodes.session_id
               ),
               started_at
           ),
           is_summarized = 1,
           summary = 'Auto-closed: session ended without explicit end_session call'
       WHERE ended_at IS NULL
         AND started_at < ?`,
      [cutoff],
    );
    const count = result.changes;
    if (count > 0) {
      log(`Auto-closed ${count} stale open episode(s)`);
    }
    return count;
  } catch (e) {
    log(`close_stale_episodes failed: ${e.message || e}`);
    return 0;
  }
}

/**
 * Clean up old data per retention policies.
 *
 * Removes:
 * - Old audit_log entries
 * - Expired predictions past retention window
 * - Archived turn_buffer from old episodes
 * - Old metrics rows
 * - Auto-closes stale open episodes (no end_session after 24h)
 *
 * @param {object} db
 * @param {object} config
 * @returns {object} Counts of deleted items by category
 */
export function runRetentionCleanup(db, config) {
  const results = {};

  // Audit log cleanup
  try {
    const cutoff = daysAgo(config.audit_log_retention_days);
    const r = db.run("DELETE FROM audit_log WHERE timestamp < ?", [cutoff]);
    results.audit_log_deleted = r.changes;
  } catch (e) {
    log(`Audit log cleanup failed: ${e.message || e}`);
    results.audit_log_deleted = 0;
  }

  // Predictions cleanup (expired + past retention window)
  try {
    const cutoff = daysAgo(config.prediction_retention_days);
    const r = db.run(
      "DELETE FROM predictions WHERE expires_at IS NOT NULL AND expires_at < ?",
      [cutoff],
    );
    results.predictions_deleted = r.changes;
  } catch (e) {
    log(`Predictions cleanup failed: ${e.message || e}`);
    results.predictions_deleted = 0;
  }

  // Turn buffer cleanup (old archived turns)
  try {
    const cutoff = daysAgo(config.turn_buffer_retention_days);
    const r = db.run("DELETE FROM turn_buffer WHERE created_at < ?", [cutoff]);
    results.turn_buffer_deleted = r.changes;
  } catch (e) {
    log(`Turn buffer cleanup failed: ${e.message || e}`);
    results.turn_buffer_deleted = 0;
  }

  // Metrics cleanup
  try {
    const cutoff = daysAgo(config.metrics_retention_days);
    const r = db.run("DELETE FROM metrics WHERE timestamp < ?", [cutoff]);
    results.metrics_deleted = r.changes;
  } catch (e) {
    log(`Metrics cleanup failed: ${e.message || e}`);
    results.metrics_deleted = 0;
  }

  // Auto-close orphan episodes (no end_session after 24h)
  results.stale_episodes_closed = closeStaleEpisodes(db);

  log(`Retention cleanup: ${JSON.stringify(results)}`);
  return results;
}

// ---------------------------------------------------------------------------
// Full consolidation orchestrator
// ---------------------------------------------------------------------------

/**
 * Run complete consolidation: decay, patterns, merging, summaries, cleanup.
 * Typically called overnight. Each phase is wrapped in try/catch so partial
 * failures don't prevent later phases from running.
 *
 * Phases:
 *  0. Pre-consolidation backup
 *  1. Decay + boost + lifecycle transitions + auto-sacred
 *  2. Memory merging + reflection aggregation
 *  3. Pattern detection
 *  4. Entity summaries (if enabled)
 *  5. Auto-dedupe entities (if enabled)
 *  6. Retention cleanup
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {object} config - Configuration object
 * @returns {object} Results dict with counts from each phase
 */
export async function runFullConsolidation(db, config) {
  log("Starting full consolidation");

  const results = {};

  // Phase 0: Pre-consolidation backup
  if (config.enable_pre_consolidation_backup) {
    try {
      const backupPath = await db.backup();
      results.backup_path = backupPath;
    } catch (e) {
      log(`Pre-consolidation backup failed: ${e.message || e}`);
      results.backup_error = String(e.message || e);
    }
  }

  // Phase 1: Decay + boost (modifies importance scores)
  try {
    results.decay = runDecay(db, config);
    results.boosted = boostAccessedMemories(db);
  } catch (e) {
    log(`Decay phase failed: ${e.message || e}`);
    results.decay = { error: String(e.message || e) };
    results.boosted = 0;
  }

  // Phase 1b: Lifecycle transitions + auto-sacred
  try {
    results.lifecycle = runLifecycleTransitions(db, config);
    results.auto_sacred = detectAutoSacred(db, config);
    results.close_circle_candidates = detectCloseCircleCandidates(db, config).length;
  } catch (e) {
    log(`Lifecycle phase failed: ${e.message || e}`);
    results.lifecycle = { error: String(e.message || e) };
  }

  // Phase 2: Merging (modifies memory content)
  try {
    results.merged = mergeSimilarMemories(db, config);
    results.reflections_aggregated = aggregateReflections(db);
  } catch (e) {
    log(`Merge phase failed: ${e.message || e}`);
    results.merged = 0;
    results.reflections_aggregated = 0;
  }

  // Phase 3: Detection (read-heavy, writes new pattern rows)
  try {
    const patterns = detectPatterns(db, config);
    results.patterns_detected = patterns.length;
  } catch (e) {
    log(`Pattern detection failed: ${e.message || e}`);
    results.patterns_detected = 0;
  }

  // Phase 4: Entity summaries (hierarchical graph retrieval)
  try {
    results.entity_summaries_generated = generateEntitySummaries(db, config);
  } catch (e) {
    log(`Entity summary generation failed: ${e.message || e}`);
    results.entity_summaries_generated = 0;
  }

  // Phase 5: Auto-dedupe entities
  try {
    const dedupeCandidates = autoDedupeEntities(db, config);
    results.dedupe_candidates_found = dedupeCandidates.length;
  } catch (e) {
    log(`Auto dedupe failed: ${e.message || e}`);
    results.dedupe_candidates_found = 0;
  }

  // Phase 6: Retention cleanup (removes old data)
  try {
    results.retention = runRetentionCleanup(db, config);
  } catch (e) {
    log(`Retention cleanup failed: ${e.message || e}`);
    results.retention = { error: String(e.message || e) };
  }

  log(`Consolidation complete: ${JSON.stringify(results)}`);
  return results;
}
