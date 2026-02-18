// Pure ESM module. Uses better-sqlite3 (synchronous).
// Opens the Claudia SQLite database for a given project directory.

import Database from 'better-sqlite3';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

// Find the database file for a project directory.
// Uses workspace folder hash (same logic as memory-daemon database.py)
// If projectDir provided: hash it to find the specific DB
// If not: find the most recently modified .db file in ~/.claudia/memory/
export function findDbPath(projectDir) {
  const memoryDir = join(homedir(), '.claudia', 'memory');
  if (!existsSync(memoryDir)) return null;

  if (projectDir) {
    // Hash the project directory path (same as Python memory daemon)
    const hash = createHash('sha256').update(projectDir).digest('hex').substring(0, 16);
    const dbPath = join(memoryDir, `${hash}.db`);
    if (existsSync(dbPath)) return dbPath;
    // Fallback: try direct match
  }

  // Find most recently modified .db file
  try {
    const files = readdirSync(memoryDir)
      .filter(f => f.endsWith('.db'))
      .map(f => ({ path: join(memoryDir, f), mtime: statSync(join(memoryDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0]?.path || null;
  } catch { return null; }
}

// Open database with read-only mode
export function openDb(dbPath) {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

// Check if a column exists in a table (graceful fallback)
export function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

// Get all non-deleted entities
export function getEntities(db) {
  const hasDeletedAt = columnExists(db, 'entities', 'deleted_at');
  const whereClause = hasDeletedAt ? 'WHERE deleted_at IS NULL' : '';
  return db.prepare(`SELECT id, name, type, canonical_name, description, importance, created_at, updated_at, metadata, last_contact_at FROM entities ${whereClause} ORDER BY importance DESC`).all();
}

// Get all non-invalidated memories
export function getMemories(db) {
  const hasInvalidatedAt = columnExists(db, 'memories', 'invalidated_at');
  const whereClause = hasInvalidatedAt ? 'WHERE invalidated_at IS NULL' : '';
  return db.prepare(`SELECT id, content, type, importance, confidence, source_context, created_at, updated_at, source_channel FROM memories ${whereClause} ORDER BY importance DESC LIMIT 2000`).all();
}

// Get all current relationships (invalid_at IS NULL)
export function getRelationships(db) {
  const hasInvalidAt = columnExists(db, 'relationships', 'invalid_at');
  const whereClause = hasInvalidAt ? 'WHERE invalid_at IS NULL' : '';
  try {
    return db.prepare(`SELECT id, source_entity_id, target_entity_id, relationship_type, strength, created_at FROM relationships ${whereClause}`).all();
  } catch (e) { console.warn('getRelationships:', e.message); return []; }
}

// Get memory-entity links
export function getMemoryEntityLinks(db) {
  try {
    return db.prepare(`SELECT memory_id, entity_id, relationship FROM memory_entities`).all();
  } catch { return []; }
}

// Get patterns
export function getPatterns(db) {
  try {
    return db.prepare(`SELECT id, pattern_type, description, confidence, created_at FROM patterns LIMIT 100`).all();
  } catch { return []; }
}

// Check if embedding tables exist and get embeddings
export function getEntityEmbeddings(db) {
  try {
    // vec0 tables have unusual PRAGMA behavior - just try to query
    const rows = db.prepare(`SELECT entity_id, embedding FROM entity_embeddings LIMIT 500`).all();
    // Embeddings stored as JSON arrays in vec0
    return rows.map(r => ({
      id: r.entity_id,
      embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : Array.from(r.embedding || [])
    }));
  } catch { return []; }
}

export function getMemoryEmbeddings(db) {
  try {
    const rows = db.prepare(`SELECT memory_id, embedding FROM memory_embeddings LIMIT 1000`).all();
    return rows.map(r => ({
      id: r.memory_id,
      embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : Array.from(r.embedding || [])
    }));
  } catch { return []; }
}

// Get entity with full details (for detail panel)
export function getEntityWithDetails(db, entityId) {
  const entity = db.prepare(`SELECT * FROM entities WHERE id = ?`).get(entityId);
  if (!entity) return null;

  const hasInvalidatedAt = columnExists(db, 'memories', 'invalidated_at');
  const memWhereClause = hasInvalidatedAt ? 'AND m.invalidated_at IS NULL' : '';

  const memories = db.prepare(`
    SELECT m.id, m.content, m.type, m.importance, m.source_context, m.created_at
    FROM memories m
    JOIN memory_entities me ON me.memory_id = m.id
    WHERE me.entity_id = ? ${memWhereClause}
    ORDER BY m.importance DESC LIMIT 10
  `).all(entityId);

  const relationships = db.prepare(`
    SELECT r.id, r.relationship_type, r.strength,
           e.name as other_name, e.type as other_type,
           CASE WHEN r.source_entity_id = ? THEN r.target_entity_id ELSE r.source_entity_id END as other_id
    FROM relationships r
    JOIN entities e ON e.id = CASE WHEN r.source_entity_id = ? THEN r.target_entity_id ELSE r.source_entity_id END
    WHERE (r.source_entity_id = ? OR r.target_entity_id = ?) AND r.invalid_at IS NULL
    ORDER BY r.strength DESC LIMIT 10
  `).all(entityId, entityId, entityId, entityId);

  return { entity, memories, relationships };
}

// Get counts for stats
export function getCounts(db) {
  const hasDeletedAt = columnExists(db, 'entities', 'deleted_at');
  const hasInvalidatedAt = columnExists(db, 'memories', 'invalidated_at');
  const hasInvalidAt = columnExists(db, 'relationships', 'invalid_at');

  const entityCount = db.prepare(`SELECT COUNT(*) as count FROM entities ${hasDeletedAt ? 'WHERE deleted_at IS NULL' : ''}`).get().count;
  const memoryCount = db.prepare(`SELECT COUNT(*) as count FROM memories ${hasInvalidatedAt ? 'WHERE invalidated_at IS NULL' : ''}`).get().count;
  const relCount = db.prepare(`SELECT COUNT(*) as count FROM relationships ${hasInvalidAt ? 'WHERE invalid_at IS NULL' : ''}`).get().count;

  const entityByType = db.prepare(`SELECT type, COUNT(*) as count FROM entities ${hasDeletedAt ? 'WHERE deleted_at IS NULL' : ''} GROUP BY type`).all();
  const memByType = db.prepare(`SELECT type, COUNT(*) as count FROM memories ${hasInvalidatedAt ? 'WHERE invalidated_at IS NULL' : ''} GROUP BY type`).all();

  return {
    entities: { total: entityCount, byType: Object.fromEntries(entityByType.map(r => [r.type, r.count])) },
    memories: { total: memoryCount, byType: Object.fromEntries(memByType.map(r => [r.type, r.count])) },
    relationships: relCount
  };
}

// Get last modified timestamp for change detection
export function getLastModified(db) {
  try {
    const entityTs = db.prepare(`SELECT MAX(updated_at) as ts FROM entities`).get().ts;
    const memTs = db.prepare(`SELECT MAX(updated_at) as ts FROM memories`).get().ts;
    return [entityTs, memTs].filter(Boolean).sort().reverse()[0] || '0';
  } catch { return '0'; }
}
