/**
 * Audit service for Claudia CLI.
 * Port of memory-daemon/claudia_memory/services/audit.py.
 *
 * Tracks all memory system operations for debugging and accountability.
 */

/**
 * Log an operation to the audit trail.
 * @param {object} db - ClaudiaDatabase instance
 * @param {string} operation - Operation type (e.g., 'entity_merge', 'memory_correct')
 * @param {object} [options]
 * @param {object} [options.details] - JSON-serializable details
 * @param {string} [options.sessionId] - Session identifier
 * @param {boolean} [options.userInitiated] - Whether triggered by user
 * @param {number} [options.entityId] - Entity ID this affects
 * @param {number} [options.memoryId] - Memory ID this affects
 * @returns {number} Audit log entry ID
 */
export function auditLog(db, operation, { details, sessionId, userInitiated, entityId, memoryId } = {}) {
  try {
    return db.insert('audit_log', {
      timestamp: new Date().toISOString(),
      operation,
      details: details ? JSON.stringify(details) : null,
      session_id: sessionId || null,
      user_initiated: userInitiated ? 1 : 0,
      entity_id: entityId || null,
      memory_id: memoryId || null,
    });
  } catch {
    // Audit logging should never crash the caller
    return -1;
  }
}

/**
 * Get recent audit entries.
 * @param {object} db
 * @param {object} [options]
 * @param {number} [options.limit=50]
 * @param {string} [options.operation]
 * @param {number} [options.entityId]
 * @param {number} [options.memoryId]
 * @returns {object[]}
 */
export function getAuditRecent(db, { limit = 50, operation, entityId, memoryId } = {}) {
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];

  if (operation) {
    sql += ' AND operation = ?';
    params.push(operation);
  }
  if (entityId) {
    sql += ' AND entity_id = ?';
    params.push(entityId);
  }
  if (memoryId) {
    sql += ' AND memory_id = ?';
    params.push(memoryId);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  return (db.query(sql, params) || []).map(formatAuditEntry);
}

/**
 * Get all audit entries affecting an entity.
 * @param {object} db
 * @param {number} entityId
 * @returns {object[]}
 */
export function getEntityAuditHistory(db, entityId) {
  return (db.query(
    'SELECT * FROM audit_log WHERE entity_id = ? ORDER BY timestamp ASC',
    [entityId],
  ) || []).map(formatAuditEntry);
}

/**
 * Get all audit entries affecting a memory.
 * @param {object} db
 * @param {number} memoryId
 * @returns {object[]}
 */
export function getMemoryAuditHistory(db, memoryId) {
  return (db.query(
    'SELECT * FROM audit_log WHERE memory_id = ? ORDER BY timestamp ASC',
    [memoryId],
  ) || []).map(formatAuditEntry);
}

function formatAuditEntry(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    operation: row.operation,
    details: row.details ? JSON.parse(row.details) : null,
    session_id: row.session_id,
    user_initiated: Boolean(row.user_initiated),
    entity_id: row.entity_id,
    memory_id: row.memory_id,
  };
}
