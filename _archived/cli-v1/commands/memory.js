/**
 * Memory commands for Claudia CLI.
 * Wires all memory subcommands to service layer functions.
 *
 * Every handler:
 *  1. Resolves project dir from global opts
 *  2. Gets database and config
 *  3. Validates inputs with guards (where applicable)
 *  4. Calls the appropriate service function
 *  5. Outputs JSON result
 *  6. Handles errors with outputError
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { resolveProjectDir } from '../core/paths.js';
import { getDatabase } from '../core/database.js';
import { getConfig } from '../core/config.js';
import { outputJson, outputError, outputSuccess } from '../core/output.js';
import { validateMemory, validateEntity, validateRelationship, canonicalName } from '../core/guards.js';

import {
  rememberFact,
  rememberEntity,
  relateEntities,
  invalidateRelationship,
  correctMemory,
  invalidateMemory,
  bufferTurn,
  endSession,
  storeReflection,
  updateReflection,
  deleteReflection,
  getUnsummarizedTurns,
  mergeEntities,
  deleteEntity,
  batchOperations,
} from '../services/remember.js';

import {
  recall,
  recallAbout,
  recallSince,
  recallTemporal,
  recallTimeline,
  recallUpcomingDeadlines,
  searchEntities,
  getProjectNetwork,
  findPath,
  getHubEntities,
  getDormantRelationships,
  getReflections,
  searchReflections,
  fetchByIds,
  traceMemory,
  getBriefing,
  getProjectHealth,
  getRecentMemories,
  entityOverview,
  getActiveReflections,
} from '../services/recall.js';

import {
  runFullConsolidation,
  runDecay,
} from '../services/consolidate.js';

import {
  fileDocument,
  searchDocuments,
} from '../services/documents.js';

import {
  getAuditRecent,
  getEntityAuditHistory,
  getMemoryAuditHistory,
} from '../services/audit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read all data from stdin as a string.
 * @returns {Promise<string>}
 */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// ---------------------------------------------------------------------------
// Core Memory Commands
// ---------------------------------------------------------------------------

/**
 * claudia memory save <content>
 * Validate via guards, call rememberFact.
 */
export async function memorySaveCommand(content, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    // Validate
    const validation = validateMemory(content, opts.type, opts.importance);
    if (!validation.isValid) {
      outputError(validation.warnings.join('; '));
      process.exitCode = 1;
      return;
    }

    // Apply adjustments from validation
    const finalContent = validation.adjustments.content || content;
    const finalImportance = validation.adjustments.importance != null
      ? validation.adjustments.importance
      : opts.importance;

    const result = await rememberFact(db, finalContent, {
      memoryType: opts.type,
      importance: finalImportance,
      source: opts.source,
      sourceContext: opts.sourceContext,
      sourceChannel: opts.sourceChannel,
      person: opts.person,
      entities: opts.entity,
      critical: opts.critical || false,
    });

    outputJson({ ...result, warnings: validation.warnings });
  } catch (err) {
    outputError('Failed to save memory', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory recall <query>
 * Call recall with options.
 */
export async function memoryRecallCommand(query, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const results = await recall(db, config, query, {
      limit: opts.limit,
      memoryTypes: opts.type,
      entityName: opts.entity,
      since: opts.since,
      before: opts.before,
      includeArchived: opts.includeArchived || false,
    });

    outputJson(results);
  } catch (err) {
    outputError('Failed to recall memories', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory about <entity>
 * Call recallAbout.
 */
export async function memoryAboutCommand(entity, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const results = recallAbout(db, config, entity, {
      limit: opts.limit,
      includeHistorical: opts.includeHistorical || false,
    });

    outputJson(results);
  } catch (err) {
    outputError('Failed to recall about entity', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory relate --source <name> --target <name> --type <type>
 * Validate via guards, call relateEntities.
 */
export async function memoryRelateCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    if (!opts.source || !opts.target || !opts.type) {
      outputError('--source, --target, and --type are all required');
      process.exitCode = 1;
      return;
    }

    // Validate relationship strength
    const strength = opts.strength != null ? opts.strength : 1.0;
    const originType = opts.origin || 'extracted';
    const validation = validateRelationship(strength, originType);
    if (!validation.isValid) {
      outputError(validation.warnings.join('; '));
      process.exitCode = 1;
      return;
    }

    const finalStrength = validation.adjustments.strength != null
      ? validation.adjustments.strength
      : strength;

    const result = relateEntities(db, opts.source, opts.target, opts.type, {
      strength: finalStrength,
      originType,
      reason: opts.reason,
    });

    outputJson({ ...result, warnings: validation.warnings });
  } catch (err) {
    outputError('Failed to relate entities', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory batch --file <path> | stdin
 * Read JSON operations, call batchOperations.
 */
export async function memoryBatchCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    let jsonText;
    if (opts.file) {
      const filePath = resolve(opts.file);
      jsonText = readFileSync(filePath, 'utf-8');
    } else {
      jsonText = await readStdin();
    }

    if (!jsonText || !jsonText.trim()) {
      outputError('No operations provided. Use --file or pipe JSON to stdin. Expected format: [{"op":"remember","content":"...","about":["Entity"],"type":"fact"}, ...]');
      process.exitCode = 1;
      return;
    }

    let operations;
    try {
      operations = JSON.parse(jsonText);
    } catch (parseErr) {
      outputError('Invalid JSON input. Expected: array of objects with "op" field (remember|entity|relate|correct|invalidate). Example: [{"op":"remember","content":"...","type":"fact"}]', { error: parseErr.message });
      process.exitCode = 1;
      return;
    }

    if (!Array.isArray(operations)) {
      outputError('Batch input must be a JSON array. Expected: [{"op":"remember",...}, {"op":"entity",...}, ...]');
      process.exitCode = 1;
      return;
    }

    if (operations.length > 0 && !operations[0].op) {
      outputError('Each batch operation must have an "op" field. Valid ops: remember, entity, relate, correct, invalidate. Example: {"op":"remember","content":"...","about":["Entity"],"type":"fact"}');
      process.exitCode = 1;
      return;
    }

    const result = await batchOperations(db, operations, {
      sourceChannel: opts.sourceChannel,
    });

    outputJson(result);
  } catch (err) {
    outputError('Batch operations failed', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory end-session --episode-id <id> --narrative <text> | --file <path>
 * Read from opts or file, call endSession.
 */
export async function memoryEndSessionCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    let episodeId = opts.episodeId;
    let narrative = opts.narrative;
    let extractions = undefined;
    let facts = undefined;
    let entities = undefined;
    let relationships = undefined;

    // If a file is provided, load structured session data from it
    if (opts.file) {
      const filePath = resolve(opts.file);
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      episodeId = data.episodeId ?? episodeId;
      narrative = data.narrative ?? narrative;
      extractions = data.extractions;
      facts = data.facts;
      entities = data.entities;
      relationships = data.relationships;
    }

    if (!narrative) {
      outputError('--narrative or --file with narrative is required');
      process.exitCode = 1;
      return;
    }

    const result = await endSession(db, episodeId, narrative, {
      extractions,
      facts,
      entities,
      relationships,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to end session', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory consolidate [--lightweight]
 * If --lightweight: runDecay, else runFullConsolidation.
 */
export async function memoryConsolidateCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    let result;
    if (opts.lightweight) {
      result = runDecay(db, config);
    } else {
      result = await runFullConsolidation(db, config);
    }

    outputJson(result);
  } catch (err) {
    outputError('Consolidation failed', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory briefing
 * Call getBriefing.
 */
export async function memoryBriefingCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = getBriefing(db, config);

    outputJson(result);
  } catch (err) {
    outputError('Failed to get briefing', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory summary --entity <name>
 * If --entity: call entityOverview with [entity], else error.
 */
export async function memorySummaryCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    if (!opts.entity) {
      outputError('--entity is required for summary');
      process.exitCode = 1;
      return;
    }

    const result = entityOverview(db, config, [opts.entity], {
      includeNetwork: true,
      includeSummaries: true,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to get summary', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory reflections
 * Dispatch based on --save/--update/--delete/--query or list all.
 */
export async function memoryReflectionsCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    // --save: store a new reflection
    if (opts.save) {
      const result = await storeReflection(db, opts.save, opts.type || 'observation', {
        importance: opts.importance,
        source: opts.source,
        tags: opts.tags,
      });
      outputJson(result);
      return;
    }

    // --update <id>: update existing reflection
    if (opts.update != null) {
      const result = await updateReflection(db, opts.update, {
        content: opts.content,
        importance: opts.importance,
        type: opts.type,
        tags: opts.tags,
      });
      outputJson(result);
      return;
    }

    // --delete <id>: delete a reflection
    if (opts.delete != null) {
      const result = deleteReflection(db, opts.delete);
      outputJson(result);
      return;
    }

    // --query: search reflections
    if (opts.query) {
      const results = await searchReflections(db, config, opts.query, {
        limit: opts.limit,
        reflectionTypes: opts.type ? [opts.type] : undefined,
      });
      outputJson(results);
      return;
    }

    // Default: list all reflections
    const results = getReflections(db, config, {
      reflectionTypes: opts.type ? [opts.type] : undefined,
      limit: opts.limit,
      minImportance: opts.minImportance,
    });

    outputJson(results);
  } catch (err) {
    outputError('Reflections operation failed', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory project-health --entity <name>
 * Call getProjectHealth.
 */
export async function memoryProjectHealthCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    if (!opts.entity) {
      outputError('--entity is required for project health');
      process.exitCode = 1;
      return;
    }

    const result = getProjectHealth(db, config, opts.entity, {
      daysAhead: opts.daysAhead,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to get project health', { error: err.message });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Temporal Commands
// ---------------------------------------------------------------------------

/**
 * claudia memory temporal upcoming
 * Call recallUpcomingDeadlines.
 */
export async function temporalUpcomingCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = recallUpcomingDeadlines(db, config, {
      daysAhead: opts.days,
      includeOverdue: opts.includeOverdue || false,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to get upcoming deadlines', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory temporal since <date>
 * Call recallSince.
 */
export async function temporalSinceCommand(date, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = recallSince(db, config, date, {
      entityName: opts.entity,
      limit: opts.limit,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to recall since date', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory temporal timeline <entity>
 * Call recallTimeline.
 */
export async function temporalTimelineCommand(entity, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = recallTimeline(db, config, entity, {
      limit: opts.limit,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to get timeline', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory temporal morning
 * Composite: getBriefing + getRecentMemories + recallUpcomingDeadlines.
 */
export async function temporalMorningCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const briefing = getBriefing(db, config);
    const recentMemories = getRecentMemories(db, config, {
      limit: 10,
      hours: 24,
    });
    const upcoming = recallUpcomingDeadlines(db, config, {
      daysAhead: 7,
      includeOverdue: true,
    });

    outputJson({
      briefing,
      recent_memories: recentMemories,
      upcoming_deadlines: upcoming,
    });
  } catch (err) {
    outputError('Failed to get morning digest', { error: err.message });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Graph Commands
// ---------------------------------------------------------------------------

/**
 * claudia memory graph network <entity>
 * Call getProjectNetwork.
 */
export async function graphNetworkCommand(entity, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = getProjectNetwork(db, config, entity);

    outputJson(result);
  } catch (err) {
    outputError('Failed to get project network', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory graph path <entityA> <entityB>
 * Call findPath.
 */
export async function graphPathCommand(entityA, entityB, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = findPath(db, config, entityA, entityB, {
      maxDepth: opts.maxDepth,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to find path', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory graph hubs
 * Call getHubEntities.
 */
export async function graphHubsCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = getHubEntities(db, config, {
      minConnections: opts.minConnections,
      entityType: opts.type,
      limit: opts.limit,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to get hub entities', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory graph dormant
 * Call getDormantRelationships.
 */
export async function graphDormantCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = getDormantRelationships(db, config, {
      days: opts.days,
      minStrength: opts.minStrength,
      limit: opts.limit,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to get dormant relationships', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory graph reconnect
 * Query patterns table for reconnect-type patterns.
 */
export async function graphReconnectCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const limit = opts.limit || 10;

    // Query patterns table for reconnect-type patterns
    const patterns = db.query(
      `SELECT p.*, e.name as entity_name, e.type as entity_type
       FROM patterns p
       LEFT JOIN entities e ON p.entity_id = e.id
       WHERE p.pattern_type IN ('cooling_relationship', 'dormant_contact', 'reconnect_suggestion')
         AND (e.deleted_at IS NULL OR e.deleted_at IS NULL)
       ORDER BY p.detected_at DESC
       LIMIT ?`,
      [limit],
    );

    const results = (patterns || []).map(p => {
      let details = null;
      try { details = JSON.parse(p.details); } catch { /* ignore */ }
      return {
        id: p.id,
        pattern_type: p.pattern_type,
        description: p.description,
        entity_name: p.entity_name,
        entity_type: p.entity_type,
        confidence: p.confidence,
        detected_at: p.detected_at,
        details,
      };
    });

    outputJson({ patterns: results, count: results.length });
  } catch (err) {
    outputError('Failed to get reconnection suggestions', { error: err.message });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Entities Commands
// ---------------------------------------------------------------------------

/**
 * claudia memory entities create <name>
 * Validate via guards, call rememberEntity.
 */
export async function entitiesCreateCommand(name, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    // Validate entity
    const validation = validateEntity(name, opts.type);
    if (!validation.isValid) {
      outputError(validation.warnings.join('; '));
      process.exitCode = 1;
      return;
    }

    const finalType = validation.adjustments.type || opts.type || 'person';

    const result = await rememberEntity(db, name, finalType, {
      description: opts.description,
      aliases: opts.aliases,
    });

    outputJson({ ...result, warnings: validation.warnings });
  } catch (err) {
    outputError('Failed to create entity', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory entities search <query>
 * Call searchEntities.
 */
export async function entitiesSearchCommand(query, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = searchEntities(db, config, query, {
      entityTypes: opts.type,
      limit: opts.limit,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to search entities', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory entities overview <names...>
 * Call entityOverview.
 */
export async function entitiesOverviewCommand(names, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = entityOverview(db, config, names, {
      includeNetwork: true,
      includeSummaries: true,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to get entity overview', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory entities merge --source <id> --target <id>
 * Validate --source, --target, call mergeEntities.
 */
export async function entitiesMergeCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    if (!opts.source || !opts.target) {
      outputError('--source and --target entity IDs are required');
      process.exitCode = 1;
      return;
    }

    const result = mergeEntities(db, opts.source, opts.target, {
      reason: opts.reason,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to merge entities', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory entities delete <id>
 * Call deleteEntity.
 */
export async function entitiesDeleteCommand(id, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = deleteEntity(db, id, {
      reason: opts.reason,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to delete entity', { error: err.message });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Modify Commands
// ---------------------------------------------------------------------------

/**
 * claudia memory modify correct <id> <correction>
 * Call correctMemory.
 */
export async function modifyCorrectCommand(id, correction, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = await correctMemory(db, id, correction, {
      reason: opts.reason,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to correct memory', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory modify invalidate <id>
 * Call invalidateMemory.
 */
export async function modifyInvalidateCommand(id, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = invalidateMemory(db, id, {
      reason: opts.reason,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to invalidate memory', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory modify invalidate-relationship --source <name> --target <name> --type <type>
 * Call invalidateRelationship.
 */
export async function modifyInvalidateRelationshipCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    if (!opts.source || !opts.target || !opts.type) {
      outputError('--source, --target, and --type are all required');
      process.exitCode = 1;
      return;
    }

    const result = invalidateRelationship(db, opts.source, opts.target, opts.type, {
      reason: opts.reason,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to invalidate relationship', { error: err.message });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Session Commands
// ---------------------------------------------------------------------------

/**
 * claudia memory session buffer
 * Call bufferTurn.
 */
export async function sessionBufferCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = bufferTurn(db, {
      userContent: opts.user,
      assistantContent: opts.assistant,
      episodeId: opts.episodeId,
      source: opts.source,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to buffer turn', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory session context
 * Return getActiveReflections + getRecentMemories.
 */
export async function sessionContextCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const reflections = getActiveReflections(db, config, {
      limit: 5,
      minImportance: 0.6,
    });
    const recentMemories = getRecentMemories(db, config, {
      limit: 10,
      hours: 24,
    });

    outputJson({
      active_reflections: reflections,
      recent_memories: recentMemories,
    });
  } catch (err) {
    outputError('Failed to get session context', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory session unsummarized
 * Call getUnsummarizedTurns.
 */
export async function sessionUnsummarizedCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = getUnsummarizedTurns(db);

    outputJson(result);
  } catch (err) {
    outputError('Failed to get unsummarized turns', { error: err.message });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Document Commands
// ---------------------------------------------------------------------------

/**
 * claudia memory document store <file>
 * Call fileDocument.
 */
export async function documentStoreCommand(file, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const filePath = resolve(file);
    const result = fileDocument(db, {
      filePath,
      sourceType: opts.sourceType,
      sourceRef: opts.sourceRef,
      summary: opts.summary,
      entityNames: opts.entityNames,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to store document', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory document search <query>
 * Call searchDocuments.
 */
export async function documentSearchCommand(query, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = searchDocuments(db, {
      query,
      sourceType: opts.sourceType,
      entityName: opts.entityName,
      lifecycle: opts.lifecycle,
      limit: opts.limit,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to search documents', { error: err.message });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Provenance Commands
// ---------------------------------------------------------------------------

/**
 * claudia memory provenance trace <id>
 * Call traceMemory.
 */
export async function provenanceTraceCommand(id, opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const result = traceMemory(db, config, id);

    outputJson(result);
  } catch (err) {
    outputError('Failed to trace memory', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory provenance audit --entity-id <id> | --memory-id <id>
 * Dispatch based on --entity-id or --memory-id.
 */
export async function provenanceAuditCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    if (opts.entityId) {
      const result = getEntityAuditHistory(db, opts.entityId);
      outputJson(result);
      return;
    }

    if (opts.memoryId) {
      const result = getMemoryAuditHistory(db, opts.memoryId);
      outputJson(result);
      return;
    }

    // Default: recent audit entries
    const result = getAuditRecent(db, {
      limit: opts.limit || 50,
    });

    outputJson(result);
  } catch (err) {
    outputError('Failed to get audit history', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia memory provenance verify-chain
 * Verify memory chain hash integrity by recomputing SHA-256 hashes.
 */
export async function provenanceVerifyChainCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const memories = db.query(
      'SELECT id, content, chain_hash, created_at FROM memories WHERE invalidated_at IS NULL ORDER BY id ASC',
    );

    if (!memories || memories.length === 0) {
      outputJson({
        verified: true,
        total: 0,
        valid: 0,
        broken: 0,
        broken_ids: [],
        message: 'No active memories to verify.',
      });
      return;
    }

    let previousHash = null;
    let valid = 0;
    const brokenIds = [];

    for (const memory of memories) {
      // Recompute: SHA-256(content + previous_chain_hash)
      const payload = memory.content + (previousHash || '');
      const expectedHash = createHash('sha256').update(payload).digest('hex');

      if (memory.chain_hash === expectedHash) {
        valid++;
      } else if (memory.chain_hash === null) {
        // Memories without chain_hash are considered valid (pre-chain era)
        valid++;
      } else {
        brokenIds.push({
          id: memory.id,
          expected: expectedHash,
          actual: memory.chain_hash,
          created_at: memory.created_at,
        });
      }

      // Use the stored chain_hash as previous for the next iteration
      // (even if broken, to detect where the break started)
      previousHash = memory.chain_hash || expectedHash;
    }

    outputJson({
      verified: brokenIds.length === 0,
      total: memories.length,
      valid,
      broken: brokenIds.length,
      broken_ids: brokenIds,
      message: brokenIds.length === 0
        ? `All ${memories.length} memories have valid chain hashes.`
        : `${brokenIds.length} of ${memories.length} memories have broken chain hashes.`,
    });
  } catch (err) {
    outputError('Failed to verify chain', { error: err.message });
    process.exitCode = 1;
  }
}
