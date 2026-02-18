/**
 * Claudia Brain Visualizer — Express server
 *
 * Serves static frontend + API endpoints for the 3D memory graph.
 * Reads Claudia's SQLite database in read-only mode (WAL-safe).
 *
 * Usage:
 *   node server.js [--project-dir /path/to/project] [--port 3849] [--db /path/to/db] [--open]
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFile } from 'child_process';
import { openDatabase, findDbPath, closeDatabase, getDb, listDatabases, getProjectHash } from './lib/database.js';
import { buildGraph } from './lib/graph.js';
import { getProjectedPositions } from './lib/projection.js';
import { createEventStream, stopPolling } from './lib/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { port: 3849, projectDir: null, dbPath: null, open: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
        parsed.port = parseInt(args[++i], 10);
        break;
      case '--project-dir':
        parsed.projectDir = args[++i];
        break;
      case '--db':
        parsed.dbPath = args[++i];
        break;
      case '--open':
        parsed.open = true;
        break;
    }
  }
  return parsed;
}

const config = parseArgs();
const app = express();

// Track current database for UI
let currentDbPath = null;
let currentProjectDir = null;

app.use(cors());
app.use(express.json());
// Serve Vite build output (dist/) if it exists, fallback to public/ for styles
import { existsSync } from 'fs';
const distDir = join(__dirname, 'dist');
const publicDir = join(__dirname, 'public');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
}
app.use(express.static(publicDir));

// ── Helpers ─────────────────────────────────────────────────

function safeCount(db, primaryQuery, fallbackQuery) {
  try {
    return db.prepare(primaryQuery).get().c;
  } catch {
    return db.prepare(fallbackQuery).get().c;
  }
}

// ── Health ──────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM entities').get();
    res.json({ status: 'ok', entities: row.count });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── Graph data ──────────────────────────────────────────────────────

app.get('/api/graph', async (req, res) => {
  try {
    const includeHistorical = req.query.historical === 'true';
    const graph = buildGraph({ includeHistorical });

    // Try to add UMAP positions (async, graceful fallback)
    try {
      const positions = await getProjectedPositions();
      if (positions) {
        for (const node of graph.nodes) {
          if (positions[node.id]) {
            node.fx = positions[node.id].x;
            node.fy = positions[node.id].y;
            node.fz = positions[node.id].z;
          }
        }
        graph.meta.umapEnabled = true;
      }
    } catch {
      graph.meta.umapEnabled = false;
    }

    res.json(graph);
  } catch (err) {
    console.error('Graph error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ───────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  try {
    const db = getDb();
    const stats = {
      entities: db.prepare('SELECT COUNT(*) as c FROM entities').get().c,
      memories: db.prepare('SELECT COUNT(*) as c FROM memories').get().c,
      relationships: safeCount(db, 'SELECT COUNT(*) as c FROM relationships WHERE invalid_at IS NULL',
                          'SELECT COUNT(*) as c FROM relationships'),
      patterns: db.prepare('SELECT COUNT(*) as c FROM patterns WHERE is_active = 1').get().c,
      predictions: db.prepare('SELECT COUNT(*) as c FROM predictions WHERE is_shown = 0').get().c,
      recentActivity: db.prepare(
        `SELECT COUNT(*) as c FROM memories WHERE created_at > datetime('now', '-24 hours')`
      ).get().c,
      entityTypes: db.prepare(
        'SELECT type, COUNT(*) as count FROM entities GROUP BY type'
      ).all(),
      memoryTypes: db.prepare(
        'SELECT type, COUNT(*) as count FROM memories GROUP BY type'
      ).all()
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Entity detail ───────────────────────────────────────────────────

app.get('/api/entity/:id', (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);

    const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(id);
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const memories = db.prepare(`
      SELECT m.*, me.relationship
      FROM memories m
      JOIN memory_entities me ON me.memory_id = m.id
      WHERE me.entity_id = ?
      ORDER BY m.importance DESC
      LIMIT 50
    `).all(id);

    let relationships;
    try {
      relationships = db.prepare(`
        SELECT r.*,
          CASE WHEN r.source_entity_id = ? THEN e2.name ELSE e1.name END as other_name,
          CASE WHEN r.source_entity_id = ? THEN e2.type ELSE e1.type END as other_type,
          CASE WHEN r.source_entity_id = ? THEN e2.id ELSE e1.id END as other_id
        FROM relationships r
        JOIN entities e1 ON e1.id = r.source_entity_id
        JOIN entities e2 ON e2.id = r.target_entity_id
        WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
          AND r.invalid_at IS NULL
        ORDER BY r.strength DESC
      `).all(id, id, id, id, id);
    } catch {
      relationships = db.prepare(`
        SELECT r.*,
          CASE WHEN r.source_entity_id = ? THEN e2.name ELSE e1.name END as other_name,
          CASE WHEN r.source_entity_id = ? THEN e2.type ELSE e1.type END as other_type,
          CASE WHEN r.source_entity_id = ? THEN e2.id ELSE e1.id END as other_id
        FROM relationships r
        JOIN entities e1 ON e1.id = r.source_entity_id
        JOIN entities e2 ON e2.id = r.target_entity_id
        WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
        ORDER BY r.strength DESC
      `).all(id, id, id, id, id);
    }

    const aliases = db.prepare(
      'SELECT alias FROM entity_aliases WHERE entity_id = ?'
    ).all(id);

    let documents = [];
    try {
      documents = db.prepare(`
        SELECT d.*, ed.relationship
        FROM documents d
        JOIN entity_documents ed ON ed.document_id = d.id
        WHERE ed.entity_id = ?
        ORDER BY d.created_at DESC
        LIMIT 20
      `).all(id);
    } catch {
      // documents table may not exist in older schemas
    }

    res.json({ entity, memories, relationships, aliases, documents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Timeline ────────────────────────────────────────────────────────

app.get('/api/timeline', (req, res) => {
  try {
    const db = getDb();
    const start = req.query.start || '2020-01-01';
    const end = req.query.end || '2099-12-31';

    const events = db.prepare(`
      SELECT 'memory' as event_type, id, content as label, type as subtype,
             importance, created_at as timestamp
      FROM memories
      WHERE created_at BETWEEN ? AND ?
      UNION ALL
      SELECT 'entity' as event_type, id, name as label, type as subtype,
             importance, created_at as timestamp
      FROM entities
      WHERE created_at BETWEEN ? AND ?
      UNION ALL
      SELECT 'relationship' as event_type, id, relationship_type as label,
             direction as subtype, strength as importance, created_at as timestamp
      FROM relationships
      WHERE created_at BETWEEN ? AND ?
      UNION ALL
      SELECT 'pattern' as event_type, id, name as label, pattern_type as subtype,
             confidence as importance, first_observed_at as timestamp
      FROM patterns
      WHERE first_observed_at BETWEEN ? AND ?
      ORDER BY timestamp DESC
      LIMIT 1000
    `).all(start, end, start, end, start, end, start, end);

    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SSE event stream ────────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  createEventStream(req, res);
});

// ── Database management ─────────────────────────────────────────────

app.get('/api/databases', (req, res) => {
  try {
    const databases = listDatabases();

    // Enrich with entity counts and mark current
    const enriched = databases.map(db => {
      const isCurrent = db.path === currentDbPath;
      let entityCount = 0;

      if (isCurrent) {
        try {
          const currentDb = getDb();
          entityCount = currentDb.prepare('SELECT COUNT(*) as c FROM entities').get().c;
        } catch { /* ignore */ }
      }

      return {
        ...db,
        isCurrent,
        entityCount: isCurrent ? entityCount : null,
        label: db.hash === 'claudia' ? 'Default' : db.hash.slice(0, 8)
      };
    });

    res.json({
      databases: enriched,
      current: currentDbPath
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/database/switch', (req, res) => {
  try {
    const { path: dbPath, projectDir } = req.body;

    if (!dbPath && !projectDir) {
      return res.status(400).json({ error: 'Provide either path or projectDir' });
    }

    let targetPath = dbPath;
    if (!targetPath && projectDir) {
      targetPath = findDbPath(projectDir);
    }

    if (!targetPath) {
      return res.status(404).json({ error: 'Database not found for given project' });
    }

    // Close current and open new
    closeDatabase();
    openDatabase(targetPath);
    currentDbPath = targetPath;
    currentProjectDir = projectDir || null;

    console.log(`Switched to database: ${targetPath}`);

    res.json({
      success: true,
      path: targetPath,
      message: 'Database switched. Refresh graph to see new data.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ────────────────────────────────────────────────────

function start() {
  // Resolve database path
  const dbPath = config.dbPath || findDbPath(config.projectDir || process.cwd());

  if (!dbPath) {
    console.error('No Claudia memory database found.');
    console.error('Searched for project-specific DB and ~/.claudia/memory/claudia.db');
    console.error('Use --db /path/to/db or --project-dir /path/to/project');
    process.exit(1);
  }

  console.log(`Opening database: ${dbPath}`);
  openDatabase(dbPath);
  currentDbPath = dbPath;
  currentProjectDir = config.projectDir || null;

  app.listen(config.port, () => {
    const url = `http://localhost:${config.port}`;
    console.log(`\n  Claudia Brain Visualizer`);
    console.log(`  ${url}\n`);

    if (config.open) {
      const cmd = process.platform === 'darwin' ? 'open'
                : process.platform === 'win32' ? 'cmd'
                : 'xdg-open';
      const args = process.platform === 'win32' ? ['/c', 'start', url] : [url];
      execFile(cmd, args, () => {});
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', () => { stopPolling(); closeDatabase(); process.exit(0); });
process.on('SIGINT', () => { stopPolling(); closeDatabase(); process.exit(0); });

start();
