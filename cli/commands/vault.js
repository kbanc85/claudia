/**
 * Vault commands for Claudia CLI.
 * Implements: claudia vault sync|status|canvas|import
 */

import { resolveProjectDir } from '../core/paths.js';
import { getDatabase } from '../core/database.js';
import { getConfig } from '../core/config.js';
import { outputJson, outputError, outputSuccess } from '../core/output.js';

/**
 * claudia vault sync
 * Export memory data to Obsidian vault in PARA structure.
 */
export async function vaultSyncCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    if (!config.vault_sync_enabled) {
      outputError('Vault sync is disabled. Enable it in config: vault_sync_enabled = true');
      process.exitCode = 1;
      return;
    }

    const { syncVault } = await import('../services/vault-sync.js');
    const result = syncVault(db, config);
    outputJson(result);
  } catch (err) {
    outputError('Vault sync failed', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia vault status
 * Report vault sync status and last sync metadata.
 */
export async function vaultStatusCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    const { getVaultStatus } = await import('../services/vault-sync.js');
    const status = getVaultStatus(db, config);
    outputJson(status);
  } catch (err) {
    outputError('Vault status check failed', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia vault canvas
 * Generate .canvas files for Obsidian's canvas view.
 */
export async function vaultCanvasCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    if (!config.vault_sync_enabled) {
      outputError('Vault sync is disabled. Enable it in config: vault_sync_enabled = true');
      process.exitCode = 1;
      return;
    }

    const { generateCanvasFiles } = await import('../services/vault-sync.js');
    const result = generateCanvasFiles(db, config);
    outputJson(result);
  } catch (err) {
    outputError('Canvas generation failed', { error: err.message });
    process.exitCode = 1;
  }
}

/**
 * claudia vault import
 * Import user edits from vault markdown files back to memory DB.
 */
export async function vaultImportCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);
    const db = getDatabase(projectDir);
    const config = getConfig(projectDir);

    if (!config.vault_sync_enabled) {
      outputError('Vault sync is disabled. Enable it in config: vault_sync_enabled = true');
      process.exitCode = 1;
      return;
    }

    const { importVaultEdits } = await import('../services/vault-sync.js');
    const result = importVaultEdits(db, config);
    outputJson(result);
  } catch (err) {
    outputError('Vault import failed', { error: err.message });
    process.exitCode = 1;
  }
}
