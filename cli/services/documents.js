/**
 * Document service for Claudia CLI.
 * Port of memory-daemon/claudia_memory/services/documents.py.
 *
 * Manages document storage, entity/memory linking, and lifecycle transitions.
 * Documents are the physical files (transcripts, emails, uploads) backing memories.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { getClaudiaHome } from '../core/paths.js';
import { canonicalName } from './extraction.js';

// ----- File Storage Helpers -----

function getFilesDir() {
  return join(getClaudiaHome(), 'files');
}

function buildRelativePath(sourceType, filename) {
  const date = new Date().toISOString().slice(0, 10);
  return join(sourceType, date, filename);
}

function buildEntityPath(entityType, entityCanonical, sourceType, filename) {
  return join('entities', entityType, entityCanonical, sourceType, filename);
}

function storeFile(content, relativePath) {
  const baseDir = getFilesDir();
  const fullPath = join(baseDir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  return relativePath;
}

function deleteFile(relativePath) {
  const fullPath = join(getFilesDir(), relativePath);
  try {
    unlinkSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

// ----- Document Operations -----

/**
 * Store a document and register it in the database.
 * @param {object} db
 * @param {object} options
 * @returns {object}
 */
export function fileDocument(db, {
  filePath, content, sourceType = 'upload', filename, summary,
  aboutEntities, memoryIds, sourceRef, entityRelationships, metadata,
}) {
  // Resolve content
  let raw;
  if (filePath) {
    if (!existsSync(filePath)) return { error: `File not found: ${filePath}` };
    raw = readFileSync(filePath);
    if (!filename) filename = basename(filePath);
  } else if (content != null) {
    raw = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    if (!filename) filename = `document-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  } else {
    return { error: 'Either filePath or content is required' };
  }

  // Compute hash for dedup
  const fileHash = createHash('sha256').update(raw).digest('hex');

  // Check duplicate
  const existing = db.queryOne('SELECT * FROM documents WHERE file_hash = ?', [fileHash]);
  if (existing) {
    _linkEntities(db, existing.id, aboutEntities, entityRelationships);
    _linkMemories(db, existing.id, memoryIds);
    return { document_id: existing.id, storage_path: existing.storage_path, deduplicated: true };
  }

  // Determine storage path
  let relativePath;
  if (aboutEntities && aboutEntities.length > 0) {
    const cn = canonicalName(aboutEntities[0]);
    const entity = db.queryOne('SELECT * FROM entities WHERE canonical_name = ?', [cn]);
    if (entity) {
      relativePath = buildEntityPath(entity.type, entity.canonical_name, sourceType, filename);
    }
  }
  if (!relativePath) {
    relativePath = buildRelativePath(sourceType, filename);
  }

  // Store file
  const storagePath = storeFile(raw, relativePath);
  const now = new Date().toISOString();

  // Insert DB row
  const docId = db.insert('documents', {
    file_hash: fileHash,
    filename,
    mime_type: guessMimeType(filename),
    file_size: raw.length,
    storage_provider: 'local',
    storage_path: storagePath,
    source_type: sourceType,
    source_ref: sourceRef || null,
    summary: summary || null,
    lifecycle: 'active',
    last_accessed_at: now,
    created_at: now,
    updated_at: now,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });

  _linkEntities(db, docId, aboutEntities, entityRelationships);
  _linkMemories(db, docId, memoryIds);

  return { document_id: docId, storage_path: storagePath, deduplicated: false };
}

/**
 * Search documents by text, entity, source type, or lifecycle.
 */
export function searchDocuments(db, { query, sourceType, entityName, lifecycle, limit = 20 } = {}) {
  let sql = 'SELECT DISTINCT d.* FROM documents d';
  const params = [];
  const joins = [];
  const wheres = [];

  if (entityName) {
    const cn = canonicalName(entityName);
    joins.push('JOIN entity_documents ed ON d.id = ed.document_id');
    joins.push('JOIN entities e ON ed.entity_id = e.id');
    wheres.push('e.canonical_name = ?');
    params.push(cn);
  }

  if (query) {
    wheres.push('(d.filename LIKE ? OR d.summary LIKE ?)');
    params.push(`%${query}%`, `%${query}%`);
  }

  if (sourceType) {
    wheres.push('d.source_type = ?');
    params.push(sourceType);
  }

  if (lifecycle) {
    wheres.push('d.lifecycle = ?');
    params.push(lifecycle);
  } else {
    wheres.push("d.lifecycle != 'purged'");
  }

  for (const j of joins) sql += ` ${j}`;
  if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
  sql += ' ORDER BY d.created_at DESC LIMIT ?';
  params.push(limit);

  return (db.query(sql, params) || []).map(r => ({
    id: r.id,
    filename: r.filename,
    mime_type: r.mime_type,
    file_size: r.file_size,
    source_type: r.source_type,
    summary: r.summary,
    lifecycle: r.lifecycle,
    created_at: r.created_at,
  }));
}

/**
 * Purge a document: delete file from disk, keep metadata as tombstone.
 */
export function purgeDocument(db, documentId) {
  const doc = db.queryOne('SELECT * FROM documents WHERE id = ?', [documentId]);
  if (!doc) return { error: 'Document not found' };

  let fileDeleted = false;
  if (doc.storage_path) {
    fileDeleted = deleteFile(doc.storage_path);
  }

  db.update('documents', {
    lifecycle: 'purged',
    storage_path: null,
    updated_at: new Date().toISOString(),
  }, 'id = ?', [documentId]);

  return { document_id: documentId, file_deleted: fileDeleted, metadata_preserved: true };
}

/**
 * Get documents linked to a memory (provenance chain).
 */
export function getMemoryDocuments(db, memoryId) {
  return (db.query(`
    SELECT d.*, ms.excerpt
    FROM documents d
    JOIN memory_sources ms ON d.id = ms.document_id
    WHERE ms.memory_id = ?
    ORDER BY d.created_at DESC
  `, [memoryId]) || []).map(r => ({
    id: r.id,
    filename: r.filename,
    source_type: r.source_type,
    summary: r.summary,
    excerpt: r.excerpt,
    storage_path: r.storage_path,
    created_at: r.created_at,
  }));
}

// ----- Internal Helpers -----

function _linkEntities(db, docId, aboutEntities, entityRelationships) {
  if (!aboutEntities) return;
  for (const name of aboutEntities) {
    const cn = canonicalName(name);
    const entity = db.queryOne('SELECT id FROM entities WHERE canonical_name = ?', [cn]);
    if (!entity) continue;
    const rel = entityRelationships?.[name] || 'about';
    try {
      db.insert('entity_documents', {
        entity_id: entity.id,
        document_id: docId,
        relationship: rel,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Duplicate link — ignore
    }
  }
}

function _linkMemories(db, docId, memoryIds) {
  if (!memoryIds) return;
  for (const mid of memoryIds) {
    try {
      db.insert('memory_sources', {
        memory_id: mid,
        document_id: docId,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Duplicate link — ignore
    }
  }
}

function guessMimeType(filename) {
  const ext = (filename || '').split('.').pop()?.toLowerCase();
  const map = {
    txt: 'text/plain', md: 'text/markdown', json: 'application/json',
    pdf: 'application/pdf', html: 'text/html', csv: 'text/csv',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', mp3: 'audio/mpeg', mp4: 'video/mp4',
  };
  return map[ext] || 'application/octet-stream';
}
