/**
 * UMAP projection — reduces 384-dim embeddings to 3D positions.
 * Falls back gracefully if sqlite-vec extension isn't loadable
 * (the frontend force simulation handles positioning instead).
 */

import { getDb } from './database.js';

let cachedProjection = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Attempt to read embeddings from vec0 tables and project to 3D.
 * Returns a map of nodeId -> { x, y, z } or null if unavailable.
 */
export async function getProjectedPositions() {
  // Check cache
  if (cachedProjection && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedProjection;
  }

  const db = getDb();
  const positions = {};

  try {
    // Try reading entity embeddings
    const entityEmbs = readEmbeddings(db, 'entity_embeddings', 'entity_id');
    const memoryEmbs = readEmbeddings(db, 'memory_embeddings', 'memory_id');

    if (entityEmbs.length === 0 && memoryEmbs.length === 0) {
      return null; // No embeddings available, let force simulation handle it
    }

    // Combine all embeddings for UMAP
    const allIds = [];
    const allVectors = [];

    for (const { id, embedding } of entityEmbs) {
      allIds.push(`entity-${id}`);
      allVectors.push(embedding);
    }
    for (const { id, embedding } of memoryEmbs) {
      allIds.push(`memory-${id}`);
      allVectors.push(embedding);
    }

    if (allVectors.length < 5) {
      return null; // Too few points for meaningful UMAP
    }

    // Dynamic import of umap-js (heavy dependency)
    const { UMAP } = await import('umap-js');

    const umap = new UMAP({
      nComponents: 3,
      nNeighbors: Math.min(15, Math.floor(allVectors.length / 2)),
      minDist: 0.1,
      spread: 1.0
    });

    const projected = umap.fit(allVectors);

    // Scale to reasonable graph coordinates
    const scale = 300;
    for (let i = 0; i < allIds.length; i++) {
      positions[allIds[i]] = {
        x: projected[i][0] * scale,
        y: projected[i][1] * scale,
        z: projected[i][2] * scale
      };
    }

    cachedProjection = positions;
    cacheTimestamp = Date.now();
    return positions;
  } catch (err) {
    console.warn('UMAP projection unavailable:', err.message);
    return null; // Graceful fallback
  }
}

/**
 * Read embeddings from a vec0 virtual table.
 * Returns array of { id, embedding: number[384] }
 */
function readEmbeddings(db, tableName, idColumn) {
  try {
    // vec0 tables store embeddings as binary blobs
    // We need to read them and convert to float arrays
    const rows = db.prepare(
      `SELECT ${idColumn} as id, embedding FROM ${tableName}`
    ).all();

    return rows.map(row => ({
      id: row.id,
      embedding: blobToFloat32Array(row.embedding)
    })).filter(r => r.embedding !== null);
  } catch {
    return []; // Table might not exist or extension not loaded
  }
}

/**
 * Convert a binary blob (from sqlite-vec) to a Float32Array.
 * sqlite-vec stores FLOAT[384] as raw little-endian float32 bytes.
 */
function blobToFloat32Array(blob) {
  if (!blob) return null;

  try {
    if (Buffer.isBuffer(blob)) {
      // Raw binary from better-sqlite3
      const floats = new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4);
      return Array.from(floats);
    }
    if (typeof blob === 'string') {
      // JSON string fallback
      return JSON.parse(blob);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Invalidate the projection cache (call after DB changes).
 */
export function invalidateProjectionCache() {
  cachedProjection = null;
  cacheTimestamp = 0;
}
