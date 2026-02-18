/**
 * SSE (Server-Sent Events) stream + change detection.
 * Polls key tables every 500ms, tracks deltas via max IDs and timestamps.
 */

import { getDb } from './database.js';

const POLL_INTERVAL = 500; // ms

let clients = [];
let pollTimer = null;
let lastState = null;

/**
 * Register an SSE client connection.
 */
export function createEventStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });

  // Start polling if not already running
  if (!pollTimer) {
    lastState = captureState();
    pollTimer = setInterval(pollForChanges, POLL_INTERVAL);
  }
}

/**
 * Stop the polling loop.
 */
export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  clients = [];
}

/**
 * Capture current state markers for change detection.
 */
function captureState() {
  try {
    const db = getDb();
    return {
      maxMemoryId: db.prepare('SELECT MAX(id) as m FROM memories').get()?.m || 0,
      maxEntityId: db.prepare('SELECT MAX(id) as m FROM entities').get()?.m || 0,
      maxRelId: db.prepare('SELECT MAX(id) as m FROM relationships').get()?.m || 0,
      maxPatternId: db.prepare('SELECT MAX(id) as m FROM patterns').get()?.m || 0,
      maxPredictionId: db.prepare('SELECT MAX(id) as m FROM predictions').get()?.m || 0,
      memoryUpdatedAt: db.prepare('SELECT MAX(updated_at) as m FROM memories').get()?.m || '',
      entityUpdatedAt: db.prepare('SELECT MAX(updated_at) as m FROM entities').get()?.m || '',
      relUpdatedAt: db.prepare('SELECT MAX(updated_at) as m FROM relationships').get()?.m || ''
    };
  } catch {
    return null;
  }
}

/**
 * Poll for changes and emit SSE events.
 */
function pollForChanges() {
  if (clients.length === 0) return;

  try {
    const db = getDb();
    const current = captureState();
    if (!current || !lastState) {
      lastState = current;
      return;
    }

    const events = [];

    // New memories
    if (current.maxMemoryId > lastState.maxMemoryId) {
      const newMemories = db.prepare(
        'SELECT id, content, type, importance, created_at FROM memories WHERE id > ? ORDER BY id'
      ).all(lastState.maxMemoryId);

      for (const m of newMemories) {
        events.push({ type: 'memory_created', data: m });
      }
    }

    // Memory updates (accessed, importance changed, merged, improved)
    if (current.memoryUpdatedAt > lastState.memoryUpdatedAt && current.maxMemoryId === lastState.maxMemoryId) {
      const updated = db.prepare(
        `SELECT id, content, type, importance, last_accessed_at, metadata
         FROM memories WHERE updated_at > ? ORDER BY updated_at LIMIT 20`
      ).all(lastState.memoryUpdatedAt);

      for (const m of updated) {
        const meta = m.metadata ? JSON.parse(m.metadata) : {};
        if (meta.llm_improved) {
          events.push({ type: 'memory_improved', data: m });
        } else if (m.last_accessed_at > lastState.memoryUpdatedAt) {
          events.push({ type: 'memory_accessed', data: m });
        } else {
          events.push({ type: 'importance_decay', data: { id: m.id, importance: m.importance } });
        }
      }
    }

    // New entities
    if (current.maxEntityId > lastState.maxEntityId) {
      const newEntities = db.prepare(
        'SELECT id, name, type, importance FROM entities WHERE id > ? ORDER BY id'
      ).all(lastState.maxEntityId);

      for (const e of newEntities) {
        events.push({ type: 'entity_created', data: e });
      }
    }

    // New relationships
    if (current.maxRelId > lastState.maxRelId) {
      const newRels = db.prepare(
        'SELECT id, source_entity_id, target_entity_id, relationship_type, strength FROM relationships WHERE id > ? ORDER BY id'
      ).all(lastState.maxRelId);

      for (const r of newRels) {
        events.push({ type: 'relationship_created', data: r });
      }
    }

    // Superseded relationships (only if bi-temporal columns exist)
    if (current.relUpdatedAt > lastState.relUpdatedAt) {
      try {
        const superseded = db.prepare(
          `SELECT id, source_entity_id, target_entity_id, relationship_type, invalid_at
           FROM relationships WHERE invalid_at IS NOT NULL AND updated_at > ?`
        ).all(lastState.relUpdatedAt);

        for (const r of superseded) {
          events.push({ type: 'relationship_superseded', data: r });
        }
      } catch {
        // Pre-v8 schema without invalid_at column
      }
    }

    // New patterns
    if (current.maxPatternId > lastState.maxPatternId) {
      const newPatterns = db.prepare(
        'SELECT id, name, pattern_type, confidence FROM patterns WHERE id > ? ORDER BY id'
      ).all(lastState.maxPatternId);

      for (const p of newPatterns) {
        events.push({ type: 'pattern_detected', data: p });
      }
    }

    // New predictions
    if (current.maxPredictionId > lastState.maxPredictionId) {
      const newPredictions = db.prepare(
        'SELECT id, content, prediction_type, priority FROM predictions WHERE id > ? ORDER BY id'
      ).all(lastState.maxPredictionId);

      for (const p of newPredictions) {
        events.push({ type: 'prediction_created', data: p });
      }
    }

    // Broadcast events
    for (const event of events) {
      broadcast(event);
    }

    lastState = current;
  } catch (err) {
    // Silently handle read errors (DB might be mid-write)
  }
}

/**
 * Send event to all connected SSE clients.
 */
function broadcast(event) {
  const data = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
  for (const client of clients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      // Client disconnected
    }
  }
}
