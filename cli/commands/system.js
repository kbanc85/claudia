/**
 * System commands for Claudia CLI.
 * Implements: claudia system-health
 */

import { getDatabase } from '../core/database.js';
import { getConfig } from '../core/config.js';
import { getEmbeddingService } from '../core/embeddings.js';
import { getLanguageModelService } from '../core/language-model.js';
import { resolveProjectDir } from '../core/paths.js';
import { outputJson, outputError } from '../core/output.js';

/**
 * claudia system-health
 * Reports database stats, embedding model status, config summary.
 */
export async function systemHealthCommand(options) {
  const projectDir = resolveProjectDir(options.projectDir);

  let dbStats = null;
  let dbError = null;
  try {
    const db = getDatabase(projectDir);
    const memories = db.queryOne('SELECT COUNT(*) as count FROM memories WHERE invalidated_at IS NULL');
    const entities = db.queryOne('SELECT COUNT(*) as count FROM entities WHERE deleted_at IS NULL');
    const relationships = db.queryOne('SELECT COUNT(*) as count FROM relationships WHERE invalid_at IS NULL');
    const episodes = db.queryOne('SELECT COUNT(*) as count FROM episodes');
    const reflections = db.queryOne('SELECT COUNT(*) as count FROM reflections');

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
      entities: entities?.count || 0,
      relationships: relationships?.count || 0,
      episodes: episodes?.count || 0,
      reflections: reflections?.count || 0,
      last_consolidation: lastConsolidation,
    };
  } catch (err) {
    dbError = err.message;
  }

  // Check embedding service
  let embeddingStatus = null;
  try {
    const embedService = getEmbeddingService();
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

  const report = {
    status: dbError ? 'degraded' : 'healthy',
    version: '2.0.0',
    project_dir: projectDir,
    database: dbStats || { error: dbError },
    embedding: embeddingStatus,
    language_model: lmStatus,
    config: configSummary,
  };

  outputJson(report);
}
