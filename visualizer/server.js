import express from 'express';
import cors from 'cors';
import { findDbPath, openDb, getCounts, getEntityWithDetails } from './lib/database.js';
import { buildGraph } from './lib/graph.js';
import { addClient, startPolling } from './lib/events.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse CLI args
const args = process.argv.slice(2);
const projectDirIdx = args.indexOf('--project-dir');
const projectDir = projectDirIdx !== -1 ? args[projectDirIdx + 1] : null;

const PORT = 3849;
const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
app.use(express.json());

// Database connection (lazy, cached)
let _db = null;
let _dbPath = null;

function getDb() {
  if (_db) return _db;
  _dbPath = findDbPath(projectDir);
  if (!_dbPath) return null;
  try {
    _db = openDb(_dbPath);
    return _db;
  } catch (e) {
    console.error('DB open error:', e.message);
    return null;
  }
}

// Routes
app.get('/health', (req, res) => {
  const db = getDb();
  if (!db) {
    return res.json({ status: 'no_db', message: 'No database found', projectDir });
  }
  try {
    const counts = getCounts(db);
    res.json({ status: 'ok', db: _dbPath, entityCount: counts.entities.total, memoryCount: counts.memories.total });
  } catch (e) {
    res.json({ status: 'error', error: e.message });
  }
});

app.get('/api/graph', (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: 'No database available' });
  try {
    const graph = buildGraph(db);
    res.json(graph);
  } catch (e) {
    console.error('Graph build error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats', (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: 'No database available' });
  try {
    const counts = getCounts(db);
    res.json(counts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/entity/:id', (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: 'No database available' });
  try {
    const data = getEntityWithDetails(db, parseInt(req.params.id));
    if (!data) return res.status(404).json({ error: 'Entity not found' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/events', (req, res) => {
  addClient(res);
});

// Serve built frontend (production)
const distPath = join(__dirname, 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(join(distPath, 'index.html')));
}

// Start server
startPolling(getDb);

app.listen(PORT, () => {
  console.log(`Claudia Brain API running on http://localhost:${PORT}`);
  const dbPath = findDbPath(projectDir);
  if (dbPath) {
    console.log(`Database: ${dbPath}`);
  } else {
    console.warn('Warning: No database found. Start Claudia first or use --project-dir flag.');
  }
});
