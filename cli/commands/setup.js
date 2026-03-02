/**
 * Setup/onboarding wizard for Claudia CLI.
 * Creates directories, verifies Ollama, pulls models, runs health check.
 *
 * Usage: claudia setup [--skip-ollama]
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getClaudiaHome,
  getMemoryDir,
  getVaultDir,
  getConfigPath,
  ensureDir,
} from '../core/paths.js';
import { getConfig, saveConfig } from '../core/config.js';
import { getEmbeddingService } from '../core/embeddings.js';
import { getLanguageModelService } from '../core/language-model.js';
import { getDatabase } from '../core/database.js';
import { outputJson, outputError } from '../core/output.js';

/**
 * claudia setup
 * Interactive onboarding wizard.
 */
export async function setupCommand(opts, globalOpts) {
  const steps = [];
  let hasError = false;

  // Step 1: Create directory structure
  try {
    const home = getClaudiaHome();
    ensureDir(home);
    ensureDir(getMemoryDir());
    ensureDir(getVaultDir());
    ensureDir(join(home, 'backups'));

    steps.push({ step: 'directories', status: 'ok', path: home });
  } catch (err) {
    steps.push({ step: 'directories', status: 'error', error: err.message });
    hasError = true;
  }

  // Step 2: Ensure config.json exists
  try {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
      // Write default config
      const defaultConfig = getConfig();
      saveConfig(defaultConfig);
      steps.push({ step: 'config', status: 'created', path: configPath });
    } else {
      steps.push({ step: 'config', status: 'exists', path: configPath });
    }
  } catch (err) {
    steps.push({ step: 'config', status: 'error', error: err.message });
    hasError = true;
  }

  // Step 3: Verify database can be opened
  try {
    const projectDir = globalOpts.projectDir || process.cwd();
    const db = getDatabase(projectDir);
    const memCount = db.queryOne('SELECT COUNT(*) as count FROM memories');
    steps.push({
      step: 'database',
      status: 'ok',
      path: db.dbPath,
      memories: memCount?.count || 0,
      vec_available: db.vecAvailable,
    });
  } catch (err) {
    steps.push({ step: 'database', status: 'error', error: err.message });
    hasError = true;
  }

  // Step 4: Check Ollama and embedding model
  if (!opts.skipOllama) {
    try {
      const embedService = getEmbeddingService();
      const available = await embedService.isAvailable();

      if (available) {
        steps.push({
          step: 'embedding_model',
          status: 'ok',
          model: embedService.model,
          dimensions: embedService.dimensions,
          host: embedService.host,
        });
      } else {
        steps.push({
          step: 'embedding_model',
          status: 'unavailable',
          model: embedService.model,
          host: embedService.host,
          message: `Model not available. Run: ollama pull ${embedService.model}`,
        });
      }
    } catch (err) {
      steps.push({ step: 'embedding_model', status: 'error', error: err.message });
    }

    // Step 5: Check language model (optional, for cognitive.ingest)
    try {
      const lmService = getLanguageModelService();
      const available = await lmService.isAvailable();

      if (available) {
        steps.push({
          step: 'language_model',
          status: 'ok',
          model: lmService.model,
          host: lmService.host,
        });
      } else {
        steps.push({
          step: 'language_model',
          status: 'unavailable',
          model: lmService.model,
          message: `Optional. Run: ollama pull ${lmService.model}`,
        });
      }
    } catch (err) {
      steps.push({ step: 'language_model', status: 'skipped', error: err.message });
    }
  } else {
    steps.push({ step: 'embedding_model', status: 'skipped', reason: '--skip-ollama' });
    steps.push({ step: 'language_model', status: 'skipped', reason: '--skip-ollama' });
  }

  const report = {
    status: hasError ? 'incomplete' : 'ready',
    claudia_home: getClaudiaHome(),
    steps,
  };

  outputJson(report);

  if (hasError) {
    process.exitCode = 1;
  }
}
