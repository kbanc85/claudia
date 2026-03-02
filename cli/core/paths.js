/**
 * Path resolution for Claudia CLI.
 * Handles ~/.claudia/ directory structure and workspace detection.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

/** Base Claudia home directory */
export function getClaudiaHome() {
  return process.env.CLAUDIA_HOME || join(homedir(), '.claudia');
}

/** Memory database directory */
export function getMemoryDir() {
  return join(getClaudiaHome(), 'memory');
}

/** Config file path */
export function getConfigPath() {
  return join(getClaudiaHome(), 'config.json');
}

/** Vault base directory */
export function getVaultDir() {
  return join(getClaudiaHome(), 'vault');
}

/** Files storage directory */
export function getFilesDir() {
  return join(getClaudiaHome(), 'files');
}

/** Log file path */
export function getLogPath() {
  return join(getClaudiaHome(), 'daemon.log');
}

/** Backup directory for a database */
export function getBackupDir(dbPath) {
  const dir = join(getClaudiaHome(), 'backups');
  ensureDir(dir);
  return dir;
}

/**
 * Compute workspace hash for per-project database isolation.
 * SHA-256[:12] of the absolute workspace path.
 */
export function workspaceHash(projectDir) {
  const absPath = resolve(projectDir);
  return createHash('sha256').update(absPath).digest('hex').slice(0, 12);
}

/**
 * Get database path for a project directory.
 *
 * Priority:
 * 1. CLAUDIA_DB_OVERRIDE env var
 * 2. CLAUDIA_DEMO_MODE=1 → demo database
 * 3. projectDir → per-project database
 * 4. Default → claudia.db
 */
export function getDbPath(projectDir) {
  // Override
  if (process.env.CLAUDIA_DB_OVERRIDE) {
    return process.env.CLAUDIA_DB_OVERRIDE;
  }

  const memDir = getMemoryDir();
  ensureDir(memDir);

  // Demo mode
  if (process.env.CLAUDIA_DEMO_MODE === '1') {
    const demoDir = join(getClaudiaHome(), 'demo');
    ensureDir(demoDir);
    if (projectDir) {
      return join(demoDir, `${workspaceHash(projectDir)}.db`);
    }
    return join(demoDir, 'claudia-demo.db');
  }

  // Per-project isolation
  if (projectDir) {
    return join(memDir, `${workspaceHash(projectDir)}.db`);
  }

  // Default
  return join(memDir, 'claudia.db');
}

/**
 * Detect workspace directory by walking up from cwd.
 * Looks for CLAUDE.md + .claude/ directory as markers.
 */
export function detectWorkspace(startDir) {
  let dir = resolve(startDir || process.cwd());
  const root = resolve('/');

  while (dir !== root) {
    const hasClaudeMd = existsSync(join(dir, 'CLAUDE.md'));
    const hasClaudeDir = existsSync(join(dir, '.claude'));
    if (hasClaudeMd && hasClaudeDir) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * Resolve the project directory from various sources.
 *
 * Priority:
 * 1. Explicit --project-dir flag
 * 2. CLAUDIA_PROJECT_DIR env var
 * 3. Auto-detect from cwd
 * 4. Fall back to cwd
 */
export function resolveProjectDir(explicitDir) {
  if (explicitDir) {
    return resolve(explicitDir);
  }

  if (process.env.CLAUDIA_PROJECT_DIR) {
    return resolve(process.env.CLAUDIA_PROJECT_DIR);
  }

  const detected = detectWorkspace(process.cwd());
  if (detected) {
    return detected;
  }

  return process.cwd();
}

/** Ensure a directory exists, creating it recursively if needed. */
export function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Database registry path */
export function getRegistryPath() {
  return join(getMemoryDir(), 'registry.json');
}
