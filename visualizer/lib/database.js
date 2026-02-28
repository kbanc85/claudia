/**
 * Read-only SQLite connection to Claudia's memory database.
 * Computes workspace hash the same way the Python daemon does (SHA256[:12]).
 * Opens in WAL mode for safe concurrent reads alongside the running daemon.
 */

import { createHash } from 'crypto';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import Database from 'better-sqlite3';

/**
 * Compute the project hash matching Python's get_project_hash().
 * SHA256 of the directory path, truncated to 12 hex chars.
 */
export function getProjectHash(projectDir) {
  return createHash('sha256').update(projectDir).digest('hex').slice(0, 12);
}

/**
 * Find the database path for a given project directory.
 * Falls back to the default claudia.db if no project-specific DB exists.
 */
export function findDbPath(projectDir) {
  const memoryDir = join(homedir(), '.claudia', 'memory');

  if (projectDir) {
    const hash = getProjectHash(projectDir);
    const projectDb = join(memoryDir, `${hash}.db`);
    if (existsSync(projectDb)) {
      return projectDb;
    }
  }

  // Fall back: try to find any .db file in the memory directory
  const defaultDb = join(memoryDir, 'claudia.db');
  if (existsSync(defaultDb)) {
    return defaultDb;
  }

  return null;
}

/**
 * List all available database files with their project hashes.
 * Excludes backup files, WAL artifacts, and journal files.
 */
export function listDatabases() {
  const memoryDir = join(homedir(), '.claudia', 'memory');
  try {
    return readdirSync(memoryDir)
      .filter(f =>
        f.endsWith('.db') &&
        !f.endsWith('-journal') &&
        !f.endsWith('-wal') &&
        !f.endsWith('-shm') &&
        !f.includes('.backup-')  // Exclude backup files
      )
      .map(f => {
        const hash = f.replace('.db', '');
        return {
          filename: f,
          path: join(memoryDir, f),
          hash,
          // Try to get entity count for richer display
          entityCount: getEntityCount(join(memoryDir, f)),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Safely read entity count from a database file (for listing).
 */
function getEntityCount(dbPath) {
  try {
    const tempDb = new Database(dbPath, { readonly: true });
    const row = tempDb.prepare('SELECT COUNT(*) as c FROM entities').get();
    tempDb.close();
    return row.c;
  } catch {
    return null;
  }
}

let _db = null;

/**
 * Open a read-only connection to the Claudia memory database.
 */
export function openDatabase(dbPath) {
  if (_db) {
    _db.close();
    _db = null;
  }

  if (!dbPath || !existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  _db = new Database(dbPath, { readonly: true });

  // Enable WAL read mode for concurrent access
  _db.pragma('journal_mode = WAL');
  _db.pragma('query_only = ON');

  return _db;
}

/**
 * Get the current database connection.
 */
export function getDb() {
  if (!_db) {
    throw new Error('Database not opened. Call openDatabase() first.');
  }
  return _db;
}

/**
 * Close the database connection.
 */
export function closeDatabase() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
