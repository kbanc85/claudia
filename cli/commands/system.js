/**
 * System commands for Claudia CLI.
 * Implements: claudia system-health
 *
 * Health checks are both structural (do tables exist?) and functional
 * (can we generate an embedding, insert it into vec0, and query it back?).
 */

import { getDatabase } from '../core/database.js';
import { getConfig } from '../core/config.js';
import { getEmbeddingService } from '../core/embeddings.js';
import { getLanguageModelService } from '../core/language-model.js';
import { resolveProjectDir } from '../core/paths.js';
import { outputJson, outputError } from '../core/output.js';

/**
 * Run a functional embedding roundtrip test:
 * 1. Generate a test embedding via Ollama
 * 2. Verify dimensions match config
 * 3. Insert into memory_embeddings vec0 table
 * 4. Query it back via MATCH (KNN)
 * 5. Clean up the test row
 *
 * Returns { ok, steps, error? } where steps shows which stages passed.
 */
async function functionalEmbeddingTest(db, embedService, configDimensions) {
  const steps = {
    generate: false,
    dimensions_match: false,
    vec0_insert: false,
    vec0_query: false,
    cleanup: false,
  };

  // Use a large positive ID that won't collide with real data.
  // Vec0 primary keys must be positive BigInts in better-sqlite3.
  const testId = 2147483647;
  const testIdBig = BigInt(testId);

  try {
    // Step 1: Generate a real embedding
    // Reset availability cache so we get a live check, not stale state
    embedService.resetAvailability();
    const embedding = await embedService.embed('claudia health check test');
    if (!embedding) {
      return { ok: false, steps, error: 'Embedding generation returned null (Ollama may be down or model missing)' };
    }
    steps.generate = true;

    // Step 2: Verify dimensions match config
    if (embedding.length !== configDimensions) {
      return {
        ok: false,
        steps,
        error: `Dimension mismatch: model produced ${embedding.length}D, config expects ${configDimensions}D. Run 'claudia --migrate-embeddings' to fix.`,
      };
    }
    steps.dimensions_match = true;

    // Step 3: Check if vec0 is available before trying insert
    if (!db.vecAvailable) {
      return {
        ok: false,
        steps,
        error: 'sqlite-vec extension not loaded. Vector search disabled. Install with: npm install sqlite-vec',
      };
    }

    // Step 4: INSERT into memory_embeddings vec0 table
    // sqlite-vec v0.1.6 + better-sqlite3 requires BigInt for vec0 PRIMARY KEY columns
    const vecParam = new Float32Array(embedding);
    try {
      db.run(
        'INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)',
        [testIdBig, vecParam]
      );
      steps.vec0_insert = true;
    } catch (e) {
      return {
        ok: false,
        steps,
        error: `Vec0 INSERT failed: ${e.message}. This means embedding storage is broken. Ensure BigInt is used for vec0 primary keys.`,
      };
    }

    // Step 5: MATCH query (KNN search) to verify roundtrip
    try {
      const row = db.queryOne(
        `SELECT memory_id, distance
         FROM memory_embeddings
         WHERE embedding MATCH ? AND k = 1`,
        [vecParam]
      );
      if (row && row.memory_id === testId) {
        steps.vec0_query = true;
      } else {
        return {
          ok: false,
          steps,
          error: `Vec0 MATCH returned unexpected result: ${JSON.stringify(row)}`,
        };
      }
    } catch (e) {
      return {
        ok: false,
        steps,
        error: `Vec0 MATCH query failed: ${e.message}. Semantic search is broken.`,
      };
    }

    // Step 6: Cleanup test row
    try {
      db.run('DELETE FROM memory_embeddings WHERE memory_id = ?', [testIdBig]);
      steps.cleanup = true;
    } catch {
      // Non-fatal: test row with high ID won't affect real data
      steps.cleanup = false;
    }

    return { ok: true, steps };
  } catch (e) {
    return { ok: false, steps, error: e.message };
  } finally {
    // Best-effort cleanup even on unexpected errors
    try {
      db.run('DELETE FROM memory_embeddings WHERE memory_id = ?', [testIdBig]);
    } catch {
      // Swallow: table might not exist or DB might be closed
    }
  }
}

/**
 * Check dimension consistency across config, _meta table, and actual model output.
 * Returns { consistent, config, database, model?, error? }
 */
async function checkDimensionConsistency(db, embedService, config) {
  const result = {
    consistent: true,
    config: config.embedding_dimensions,
    database: null,
    model: null,
  };

  // Read dimensions from _meta
  try {
    const meta = db.queryOne("SELECT value FROM _meta WHERE key = 'embedding_dimensions'");
    if (meta) {
      result.database = Number(meta.value);
      if (result.database !== result.config) {
        result.consistent = false;
        result.error = `Config says ${result.config}D but database has ${result.database}D tables. Run 'claudia --migrate-embeddings'.`;
      }
    }
  } catch {
    // _meta might not exist
  }

  // Check actual model output dimensions
  try {
    embedService.resetAvailability();
    const testEmbed = await embedService.embed('dimension test');
    if (testEmbed) {
      result.model = testEmbed.length;
      if (result.model !== result.config) {
        result.consistent = false;
        result.error = `Model produces ${result.model}D but config expects ${result.config}D. Update config or run 'claudia --migrate-embeddings'.`;
      }
    }
  } catch {
    // If Ollama is down, we can't check model dimensions
  }

  return result;
}

/**
 * claudia system-health
 * Reports database stats, embedding model status, config summary,
 * and runs functional tests for embeddings and vec0 tables.
 */
export async function systemHealthCommand(options) {
  const projectDir = resolveProjectDir(options.projectDir);

  let db = null;
  let dbStats = null;
  let dbError = null;
  try {
    db = getDatabase(projectDir);
    const memories = db.queryOne('SELECT COUNT(*) as count FROM memories WHERE invalidated_at IS NULL');
    const entities = db.queryOne('SELECT COUNT(*) as count FROM entities WHERE deleted_at IS NULL');
    const relationships = db.queryOne('SELECT COUNT(*) as count FROM relationships WHERE invalid_at IS NULL');
    const episodes = db.queryOne('SELECT COUNT(*) as count FROM episodes');
    const reflections = db.queryOne('SELECT COUNT(*) as count FROM reflections');

    // Count memories that actually have embeddings stored
    let memoriesWithEmbeddings = 0;
    if (db.vecAvailable) {
      try {
        const embCount = db.queryOne('SELECT COUNT(*) as count FROM memory_embeddings');
        memoriesWithEmbeddings = embCount?.count || 0;
      } catch {
        // vec0 table might not exist
      }
    }

    // Get last consolidation time from _meta
    let lastConsolidation = null;
    try {
      const meta = db.queryOne("SELECT value FROM _meta WHERE key = 'last_consolidation'");
      if (meta) lastConsolidation = meta.value;
    } catch {
      // _meta table might not exist in older DBs
    }

    // DB file size
    let dbSizeBytes = 0;
    try {
      const { statSync } = await import('node:fs');
      dbSizeBytes = statSync(db.dbPath).size;
    } catch {
      // ignore
    }

    dbStats = {
      path: db.dbPath,
      size_bytes: dbSizeBytes,
      size_mb: Math.round(dbSizeBytes / 1024 / 1024 * 100) / 100,
      vec_available: db.vecAvailable,
      memories: memories?.count || 0,
      memories_with_embeddings: memoriesWithEmbeddings,
      entities: entities?.count || 0,
      relationships: relationships?.count || 0,
      episodes: episodes?.count || 0,
      reflections: reflections?.count || 0,
      last_consolidation: lastConsolidation,
    };
  } catch (err) {
    dbError = err.message;
  }

  // Check embedding service (with fresh availability check)
  let embeddingStatus = null;
  let embedService = null;
  try {
    embedService = getEmbeddingService();
    // Reset cached availability so we get live status
    embedService.resetAvailability();
    const available = await embedService.isAvailable();
    embeddingStatus = {
      available,
      model: embedService.model,
      dimensions: embedService.dimensions,
      host: embedService.host,
      cache: embedService.cacheStats(),
    };
  } catch (err) {
    embeddingStatus = { available: false, error: err.message };
  }

  // Check language model service
  let lmStatus = null;
  try {
    const lmService = getLanguageModelService();
    const available = await lmService.isAvailable();
    lmStatus = {
      available,
      model: lmService.model,
      host: lmService.host,
    };
  } catch (err) {
    lmStatus = { available: false, error: err.message };
  }

  // Config summary
  const config = getConfig(projectDir);
  const configSummary = {
    ollama_host: config.ollama_host,
    embedding_model: config.embedding_model,
    embedding_dimensions: config.embedding_dimensions,
    language_model: config.language_model,
    decay_rate_daily: config.decay_rate_daily,
    vault_sync_enabled: config.vault_sync_enabled,
    enable_auto_dedupe: config.enable_auto_dedupe,
    enable_memory_merging: config.enable_memory_merging,
  };

  // --- Functional tests (only if DB and embedding service are available) ---
  let functionalTests = null;
  if (db && embedService && embeddingStatus?.available) {
    // Dimension consistency check
    const dimensions = await checkDimensionConsistency(db, embedService, config);

    // Full roundtrip: embed → insert → query → cleanup
    const roundtrip = await functionalEmbeddingTest(db, embedService, config.embedding_dimensions);

    functionalTests = {
      dimensions,
      embedding_roundtrip: roundtrip,
    };
  } else {
    functionalTests = {
      skipped: true,
      reason: !db ? 'Database unavailable' :
              !embedService ? 'Embedding service failed to initialize' :
              'Embedding model not available (Ollama down or model not pulled)',
    };
  }

  // --- Determine overall status ---
  let status = 'healthy';
  const warnings = [];

  if (dbError) {
    status = 'degraded';
    warnings.push(`Database error: ${dbError}`);
  }

  if (!embeddingStatus?.available) {
    status = status === 'healthy' ? 'degraded' : status;
    warnings.push('Embedding service unavailable: semantic search disabled, falling back to keyword search');
  }

  if (functionalTests && !functionalTests.skipped) {
    if (!functionalTests.dimensions.consistent) {
      status = 'degraded';
      warnings.push(functionalTests.dimensions.error);
    }
    if (!functionalTests.embedding_roundtrip.ok) {
      status = 'degraded';
      warnings.push(`Embedding roundtrip FAILED: ${functionalTests.embedding_roundtrip.error}`);
    }
  }

  // Check embedding coverage (memories exist but few have embeddings)
  if (dbStats && dbStats.memories > 0 && dbStats.vec_available) {
    const coverage = dbStats.memories_with_embeddings / dbStats.memories;
    if (coverage < 0.5) {
      warnings.push(
        `Low embedding coverage: ${dbStats.memories_with_embeddings}/${dbStats.memories} memories have embeddings (${Math.round(coverage * 100)}%). ` +
        `Run 'claudia --backfill-embeddings' to fix.`
      );
    }
  }

  const report = {
    status,
    version: '2.0.0',
    project_dir: projectDir,
    database: dbStats || { error: dbError },
    embedding: embeddingStatus,
    language_model: lmStatus,
    config: configSummary,
    functional_tests: functionalTests,
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  outputJson(report);
}
