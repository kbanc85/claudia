/**
 * Configuration management for Claudia CLI.
 * Port of memory-daemon/claudia_memory/config.py.
 *
 * Loads settings from ~/.claudia/config.json with sensible defaults.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfigPath, getClaudiaHome, getDbPath, getLogPath } from './paths.js';

/** Default configuration values (mirrors Python MemoryConfig dataclass) */
const DEFAULTS = {
  // Embedding settings
  ollama_host: 'http://localhost:11434',
  embedding_model: 'all-minilm:l6-v2',
  embedding_dimensions: 384,

  // Language model (for cognitive tools)
  language_model: 'qwen3:4b',

  // Decay and consolidation
  decay_rate_daily: 0.995,
  min_importance_threshold: 0.1,
  consolidation_interval_hours: 6,
  pattern_detection_interval_hours: 24,

  // Search/ranking weights (sum to ~1.0)
  vector_weight: 0.50,
  importance_weight: 0.25,
  recency_weight: 0.10,
  fts_weight: 0.15,
  recency_half_life_days: 30,
  max_recall_results: 50,

  // Memory merging
  similarity_merge_threshold: 0.92,
  enable_memory_merging: true,

  // RRF scoring
  rrf_k: 60,
  enable_rrf: true,
  graph_proximity_enabled: true,
  graph_proximity_weight: 0.15,

  // Entity summaries
  enable_entity_summaries: true,
  entity_summary_min_memories: 5,
  entity_summary_max_age_days: 7,

  // Auto-deduplication
  enable_auto_dedupe: true,
  auto_dedupe_threshold: 0.90,

  // Document storage
  document_dormant_days: 90,
  document_archive_days: 180,

  // Backup settings
  backup_retention_count: 3,
  enable_pre_consolidation_backup: true,
  backup_daily_retention: 7,
  backup_weekly_retention: 4,

  // Retention (data cleanup during consolidation)
  audit_log_retention_days: 90,
  prediction_retention_days: 30,
  turn_buffer_retention_days: 60,
  metrics_retention_days: 90,

  // Vault sync (Obsidian integration)
  vault_sync_enabled: true,
  vault_name: 'claudia-vault',
  vault_layout: 'para',
  obsidian_rest_api_port: 27124,
  obsidian_rest_api_enabled: false,

  // Lifecycle & sacred memory
  cooling_threshold_days: 60,
  archive_threshold_days: 180,
  enable_auto_sacred: true,
  close_circle_keywords: [
    'close friend', 'bestie', 'family', 'inner circle', 'best friend',
    'spouse', 'partner', 'sibling', 'parent', 'child',
  ],
  sacred_core_keywords: [
    'birthday', 'allergy', 'family', 'boundary', 'health',
    'never forget', 'anniversary', 'preference', 'medical',
    'dietary', 'phobia', 'trigger',
  ],
  enable_chain_verification: true,
  context_builder_token_budget: 8000,
  context_builder_max_facts: 30,
};

/** All config keys that can be loaded from config.json */
const CONFIG_KEYS = Object.keys(DEFAULTS);

/**
 * Validate config values. Warns and auto-corrects out-of-range values.
 * Matches Python _validate() logic exactly.
 */
function validate(config) {
  const warnings = [];

  if (!(config.decay_rate_daily > 0 && config.decay_rate_daily <= 1.0)) {
    warnings.push(`decay_rate_daily=${config.decay_rate_daily} out of range (0,1], using default 0.995`);
    config.decay_rate_daily = 0.995;
  }
  if (config.max_recall_results < 1 || config.max_recall_results > 200) {
    warnings.push(`max_recall_results=${config.max_recall_results} out of range [1,200], using default 50`);
    config.max_recall_results = 50;
  }
  if (config.min_importance_threshold < 0 || config.min_importance_threshold > 1.0) {
    warnings.push(`min_importance_threshold=${config.min_importance_threshold} out of range [0,1], using default 0.1`);
    config.min_importance_threshold = 0.1;
  }

  const weights = config.vector_weight + config.importance_weight + config.recency_weight + config.fts_weight;
  if (Math.abs(weights - 1.0) > 0.01) {
    warnings.push(`Ranking weights sum to ${weights.toFixed(3)}, not 1.0. Results may be skewed.`);
  }

  if (config.backup_retention_count < 1) {
    warnings.push(`backup_retention_count=${config.backup_retention_count} below minimum, using 1`);
    config.backup_retention_count = 1;
  }
  if (config.backup_daily_retention < 1) {
    config.backup_daily_retention = 1;
  }
  if (config.backup_weekly_retention < 1) {
    config.backup_weekly_retention = 1;
  }

  for (const attr of ['audit_log_retention_days', 'prediction_retention_days', 'turn_buffer_retention_days', 'metrics_retention_days']) {
    if (config[attr] < 1) {
      warnings.push(`${attr}=${config[attr]} below minimum, using 1`);
      config[attr] = 1;
    }
  }

  const commonDims = new Set([384, 512, 768, 1024, 1536]);
  if (!commonDims.has(config.embedding_dimensions)) {
    warnings.push(`embedding_dimensions=${config.embedding_dimensions} is not a common value. Verify this matches your embedding model.`);
  }

  if (!(config.auto_dedupe_threshold >= 0.0 && config.auto_dedupe_threshold <= 1.0)) {
    config.auto_dedupe_threshold = 0.90;
  }
  if (config.entity_summary_min_memories < 1) {
    config.entity_summary_min_memories = 1;
  }
  if (config.entity_summary_max_age_days < 1) {
    config.entity_summary_max_age_days = 1;
  }
  if (!(config.graph_proximity_weight >= 0.0 && config.graph_proximity_weight <= 1.0)) {
    config.graph_proximity_weight = 0.15;
  }
  if (config.cooling_threshold_days < 1) {
    config.cooling_threshold_days = 60;
  }
  if (config.archive_threshold_days < config.cooling_threshold_days) {
    config.archive_threshold_days = config.cooling_threshold_days * 3;
  }
  if (config.context_builder_token_budget < 500) {
    config.context_builder_token_budget = 2000;
  }
  if (config.context_builder_max_facts < 5) {
    config.context_builder_max_facts = 10;
  }

  return warnings;
}

/**
 * Load configuration from ~/.claudia/config.json with defaults.
 * @param {string|null} projectDir - Project directory for DB path resolution
 * @returns {{ config: object, warnings: string[] }}
 */
export function loadConfig(projectDir = null) {
  const config = { ...DEFAULTS };
  const configPath = getConfigPath();

  if (existsSync(configPath)) {
    try {
      const data = JSON.parse(readFileSync(configPath, 'utf-8'));
      for (const key of CONFIG_KEYS) {
        if (key in data) {
          config[key] = data[key];
        }
      }
    } catch (e) {
      // Warn but continue with defaults
    }
  }

  // Resolve database path via paths.js (handles env overrides, demo mode, project isolation)
  config.db_path = getDbPath(projectDir);

  // Resolve derived paths
  config.log_path = getLogPath();
  config.vault_base_dir = getClaudiaHome() + '/vault';
  config.files_base_dir = getClaudiaHome() + '/files';

  const warnings = validate(config);
  return { config, warnings };
}

/**
 * Save configuration to ~/.claudia/config.json.
 * Only saves user-configurable keys (not derived paths).
 */
export function saveConfig(config) {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });

  const data = {};
  for (const key of CONFIG_KEYS) {
    if (key in config) {
      data[key] = config[key];
    }
  }

  writeFileSync(configPath, JSON.stringify(data, null, 2) + '\n');
}

// Module-level cache
let _cachedConfig = null;
let _cachedProjectDir = null;

/**
 * Get the global config (cached, lazy-loaded).
 * @param {string|null} projectDir
 */
export function getConfig(projectDir = null) {
  if (_cachedConfig === null || projectDir !== _cachedProjectDir) {
    const { config, warnings } = loadConfig(projectDir);
    _cachedConfig = config;
    _cachedProjectDir = projectDir;
    // Log warnings to stderr
    for (const w of warnings) {
      process.stderr.write(`[config] ${w}\n`);
    }
  }
  return _cachedConfig;
}

/** Reset cached config (for testing). */
export function resetConfig() {
  _cachedConfig = null;
  _cachedProjectDir = null;
}
