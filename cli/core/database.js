/**
 * Database management for Claudia CLI (Node.js port).
 *
 * Handles SQLite connection with:
 * - WAL mode for crash safety
 * - sqlite-vec extension for vector similarity search
 * - Schema migration system (v1-v20)
 * - Query helpers and backup
 *
 * Uses better-sqlite3 (synchronous API) instead of Python's sqlite3.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  readdirSync, statSync, unlinkSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { getRegistryPath } from './paths.js';

// createRequire for loading native addons in ESM context
const require = createRequire(import.meta.url);

// better-sqlite3 is a native addon; use require for reliable loading
const BetterSqlite3 = require('better-sqlite3');

// ---------------------------------------------------------------------------
// Schema path resolution
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', '..', 'memory-daemon', 'claudia_memory', 'schema.sql');

// ---------------------------------------------------------------------------
// Vec0 table definitions
// ---------------------------------------------------------------------------

const VEC0_TABLES = [
  ['entity_embeddings', 'entity_id'],
  ['memory_embeddings', 'memory_id'],
  ['message_embeddings', 'message_id'],
  ['episode_embeddings', 'episode_id'],
  ['reflection_embeddings', 'reflection_id'],
];

// ---------------------------------------------------------------------------
// Database wrapper class
// ---------------------------------------------------------------------------

class ClaudiaDatabase {
  /**
   * @param {string} dbPath - Absolute path to the SQLite database file
   * @param {object|null} config - Config object (from getConfig). If null, loaded automatically.
   */
  constructor(dbPath, config = null) {
    this.dbPath = dbPath;
    this.config = config;
    this.db = null;
    this.vecAvailable = false;
    this._initialized = false;
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /** Open the database, load extensions, run schema + migrations. */
  initialize() {
    if (this._initialized) return;

    // Ensure parent directory exists
    const dir = dirname(this.dbPath);
    mkdirSync(dir, { recursive: true });

    // Open database
    this.db = new BetterSqlite3(this.dbPath);

    // PRAGMAs
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');

    // Recover any uncommitted WAL writes from a previous crash
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (_) {
      // Non-fatal
    }

    // Load sqlite-vec
    this._loadVec();

    // Execute schema.sql
    this._executeSchema();

    // Create vec0 virtual tables
    this._createVec0Tables();

    // Run migrations
    this._runMigrations();

    // Store workspace path in _meta
    this._storeWorkspacePath();

    // Register in central registry
    this._registerDatabase();

    this._initialized = true;
  }

  // -------------------------------------------------------------------------
  // Extension loading
  // -------------------------------------------------------------------------

  /** Attempt to load sqlite-vec extension. Sets this.vecAvailable. */
  _loadVec() {
    try {
      const sqliteVec = require('sqlite-vec');
      if (typeof sqliteVec.load === 'function') {
        sqliteVec.load(this.db);
        this.vecAvailable = true;
        return;
      }
    } catch (_) {
      // Not available
    }

    process.stderr.write(
      '[database] sqlite-vec not available. Vector search will be disabled. ' +
      'Install with: npm install sqlite-vec\n'
    );
    this.vecAvailable = false;
  }

  // -------------------------------------------------------------------------
  // Schema execution
  // -------------------------------------------------------------------------

  /** Read and execute schema.sql, splitting on ; at end of line. */
  _executeSchema() {
    if (!existsSync(SCHEMA_PATH)) {
      process.stderr.write(`[database] Schema file not found at ${SCHEMA_PATH}\n`);
      return;
    }

    const schemaSql = readFileSync(SCHEMA_PATH, 'utf-8');
    const statements = [];
    let current = [];

    for (const line of schemaSql.split('\n')) {
      const stripped = line.trim();
      // Skip comment-only lines
      if (stripped.startsWith('--')) continue;
      current.push(line);
      if (stripped.endsWith(';')) {
        const stmt = current.join('\n').trim();
        if (stmt) statements.push(stmt);
        current = [];
      }
    }

    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      try {
        this.db.exec(stmt);
      } catch (e) {
        const msg = e.message || '';
        // Virtual tables may fail if sqlite-vec not loaded
        if (msg.includes('no such module: vec0')) {
          // Expected when vec not available; skip silently
        } else if (msg.includes('no such column')) {
          // Indexes on columns added by migrations; _runMigrations will handle
        } else {
          throw e;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Vec0 virtual tables
  // -------------------------------------------------------------------------

  /** Create vec0 virtual tables with configurable embedding dimensions. */
  _createVec0Tables() {
    const config = this.config || getConfig();
    const dim = config.embedding_dimensions || 384;

    for (const [table, pk] of VEC0_TABLES) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS ${table} USING vec0(
            ${pk} INTEGER PRIMARY KEY,
            embedding FLOAT[${dim}]
          )
        `);
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('no such module: vec0')) {
          // Expected when vec not available
        } else {
          process.stderr.write(`[database] Could not create ${table}: ${msg}\n`);
        }
      }
    }

    // Store dimensions in _meta for migration detection
    try {
      const check = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_meta'"
      ).get();
      if (check) {
        const existing = this.db.prepare(
          "SELECT value FROM _meta WHERE key = 'embedding_dimensions'"
        ).get();
        if (!existing) {
          this.db.prepare(
            "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_dimensions', ?)"
          ).run(String(dim));
        } else if (Number(existing.value) !== dim) {
          process.stderr.write(
            `[database] Embedding dimensions mismatch: config=${dim}, ` +
            `database=${existing.value}. Run --migrate-embeddings to fix.\n`
          );
        }
      }
    } catch (_) {
      // _meta table may not exist yet on very first run
    }
  }

  // -------------------------------------------------------------------------
  // Migration integrity check
  // -------------------------------------------------------------------------

  /** Get column names for a table. */
  _getTableColumns(table) {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all();
    return new Set(rows.map(r => r.name));
  }

  /** Get set of table names from sqlite_master. */
  _getTableNames() {
    const rows = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    return new Set(rows.map(r => r.name));
  }

  /**
   * Check if migrations completed properly by verifying expected columns exist.
   * Returns the effective schema version based on what actually exists,
   * which may be lower than what schema_migrations claims.
   * Returns null if all migrations completed properly.
   */
  _checkMigrationIntegrity() {
    const memoryCols = this._getTableColumns('memories');
    const relCols = this._getTableColumns('relationships');
    const entityCols = this._getTableColumns('entities');
    const tables = this._getTableNames();

    // Migration 5: verification_status, verified_at on memories
    if (!memoryCols.has('verification_status') || !memoryCols.has('verified_at')) {
      return 4;
    }
    // Migration 8: valid_at, invalid_at on relationships
    if (!relCols.has('invalid_at') || !relCols.has('valid_at')) {
      return 7;
    }
    // Migration 10: reflections table
    if (!tables.has('reflections')) {
      return 9;
    }
    // Migration 12: audit_log, metrics, soft-delete/correction columns
    if (!tables.has('audit_log') || !tables.has('metrics')) {
      return 11;
    }
    if (!entityCols.has('deleted_at')) {
      return 11;
    }
    if (!memoryCols.has('invalidated_at') || !memoryCols.has('corrected_at')) {
      return 11;
    }
    // Migration 13: origin_type on memories, agent_dispatches table
    if (!memoryCols.has('origin_type')) {
      return 12;
    }
    if (!tables.has('agent_dispatches')) {
      return 12;
    }
    // Migration 14: dispatch_tier on agent_dispatches
    if (tables.has('agent_dispatches')) {
      const dispatchCols = this._getTableColumns('agent_dispatches');
      if (!dispatchCols.has('dispatch_tier')) {
        return 13;
      }
    }
    // Migration 15: origin_type on relationships
    if (!relCols.has('origin_type')) {
      return 14;
    }
    // Migration 16: source_channel on memories
    if (!memoryCols.has('source_channel')) {
      return 15;
    }
    // Migration 17: deadline_at, temporal_markers on memories
    if (!memoryCols.has('deadline_at') || !memoryCols.has('temporal_markers')) {
      return 16;
    }
    // Migration 18: contact velocity + attention tier on entities
    if (!entityCols.has('last_contact_at') || !entityCols.has('attention_tier')) {
      return 17;
    }
    // Migration 19: entity_summaries table
    if (!tables.has('entity_summaries')) {
      return 18;
    }
    // Migration 20: lifecycle_tier, fact_id on memories; close_circle on entities
    if (!memoryCols.has('lifecycle_tier') || !memoryCols.has('fact_id')) {
      return 19;
    }
    if (!entityCols.has('close_circle')) {
      return 19;
    }

    return null; // All good
  }

  // -------------------------------------------------------------------------
  // Migrations v1-v20
  // -------------------------------------------------------------------------

  _runMigrations() {
    let currentVersion;
    try {
      const row = this.db.prepare(
        'SELECT MAX(version) as v FROM schema_migrations'
      ).get();
      currentVersion = (row && row.v) ? row.v : 0;
    } catch (_) {
      // schema_migrations table does not exist yet
      return;
    }

    // Integrity check: verify migrations actually completed
    const effectiveVersion = this._checkMigrationIntegrity();
    if (effectiveVersion !== null) {
      process.stderr.write(
        `[database] Migration integrity check: effective version is ${effectiveVersion}, not ${currentVersion}\n`
      );
      currentVersion = effectiveVersion;
    }

    // --- Migration 2: turn_buffer, episode narrative columns ---
    if (currentVersion < 2) {
      const stmts = [
        'ALTER TABLE episodes ADD COLUMN narrative TEXT',
        'ALTER TABLE episodes ADD COLUMN turn_count INTEGER DEFAULT 0',
        'ALTER TABLE episodes ADD COLUMN is_summarized INTEGER DEFAULT 0',
        `CREATE TABLE IF NOT EXISTS turn_buffer (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
          turn_number INTEGER NOT NULL,
          user_content TEXT,
          assistant_content TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        'CREATE INDEX IF NOT EXISTS idx_turn_buffer_episode ON turn_buffer(episode_id)',
      ];
      for (const stmt of stmts) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 2 failed: ${e.message}\n`);
          }
        }
      }
      // Mark existing episodes as summarized if they have a summary
      try {
        this.db.exec(
          "UPDATE episodes SET is_summarized = 1 WHERE summary IS NOT NULL AND summary != ''"
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (2, 'Add turn_buffer table, episode narrative/summary columns, episode_embeddings')"
      );
    }

    // --- Migration 3: source_context on memories, is_archived on turn_buffer ---
    if (currentVersion < 3) {
      for (const stmt of [
        'ALTER TABLE memories ADD COLUMN source_context TEXT',
        'ALTER TABLE turn_buffer ADD COLUMN is_archived INTEGER DEFAULT 0',
      ]) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 3 failed: ${e.message}\n`);
          }
        }
      }
      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (3, 'Add source_context to memories, is_archived to turn_buffer for episodic provenance')"
      );
    }

    // --- Migration 4: FTS5 full-text search ---
    if (currentVersion < 4) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
            content,
            content=memories,
            content_rowid=id,
            tokenize='porter unicode61'
          )
        `);
        this.db.exec(`
          CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
            INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
          END
        `);
        this.db.exec(`
          CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
          END
        `);
        this.db.exec(`
          CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
            INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
          END
        `);
        // Backfill existing memories into FTS5
        this.db.exec(
          'INSERT INTO memories_fts(rowid, content) SELECT id, content FROM memories'
        );
        this.db.exec(
          "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (4, 'Add FTS5 full-text search table and auto-sync triggers for hybrid search')"
        );
      } catch (e) {
        process.stderr.write(`[database] Migration 4 (FTS5) failed: ${e.message}. FTS5 may not be available.\n`);
      }
    }

    // --- Migration 5: Verification columns on memories ---
    if (currentVersion < 5) {
      for (const stmt of [
        'ALTER TABLE memories ADD COLUMN verified_at TEXT',
        "ALTER TABLE memories ADD COLUMN verification_status TEXT DEFAULT 'pending'",
        'ALTER TABLE predictions ADD COLUMN prediction_pattern_name TEXT',
      ]) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 5 failed: ${e.message}\n`);
          }
        }
      }
      try {
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_memories_verification ON memories(verification_status)'
        );
      } catch (_) { /* ignore */ }
      // Grandfather existing memories as verified
      try {
        this.db.exec(
          "UPDATE memories SET verification_status = 'verified', verified_at = datetime('now') WHERE verification_status = 'pending' OR verification_status IS NULL"
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (5, 'Add verification columns to memories, prediction_pattern_name to predictions')"
      );
    }

    // --- Migration 6: Source tracking on episodes ---
    if (currentVersion < 6) {
      for (const stmt of [
        'ALTER TABLE episodes ADD COLUMN source TEXT',
        'ALTER TABLE episodes ADD COLUMN ingested_at TEXT',
        'ALTER TABLE turn_buffer ADD COLUMN source TEXT',
      ]) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 6 failed: ${e.message}\n`);
          }
        }
      }
      try {
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_episodes_source_ingested ON episodes(source, ingested_at)'
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (6, 'Add source and ingested_at to episodes, source to turn_buffer for gateway integration')"
      );
    }

    // --- Migration 7: Document storage and provenance ---
    if (currentVersion < 7) {
      const stmts = [
        `CREATE TABLE IF NOT EXISTS documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_hash TEXT,
          filename TEXT NOT NULL,
          mime_type TEXT,
          file_size INTEGER,
          storage_provider TEXT DEFAULT 'local',
          storage_path TEXT,
          source_type TEXT,
          source_ref TEXT,
          summary TEXT,
          lifecycle TEXT DEFAULT 'active',
          last_accessed_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          workspace_id TEXT,
          metadata TEXT
        )`,
        'CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash)',
        'CREATE INDEX IF NOT EXISTS idx_documents_lifecycle ON documents(lifecycle)',
        'CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type)',
        'CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id)',
        `CREATE TABLE IF NOT EXISTS entity_documents (
          entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          relationship TEXT DEFAULT 'about',
          created_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (entity_id, document_id, relationship)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_entity_documents_doc ON entity_documents(document_id)',
        `CREATE TABLE IF NOT EXISTS memory_sources (
          memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
          document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          excerpt TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (memory_id, document_id)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_memory_sources_doc ON memory_sources(document_id)',
      ];
      for (const stmt of stmts) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 7 failed: ${e.message}\n`);
          }
        }
      }
      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (7, 'Add documents, entity_documents, memory_sources tables for provenance tracking')"
      );
    }

    // --- Migration 8: Bi-temporal relationship tracking ---
    if (currentVersion < 8) {
      for (const stmt of [
        'ALTER TABLE relationships ADD COLUMN valid_at TEXT',
        'ALTER TABLE relationships ADD COLUMN invalid_at TEXT',
      ]) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 8 failed: ${e.message}\n`);
          }
        }
      }
      try {
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_relationships_temporal ON relationships(invalid_at, valid_at)'
        );
      } catch (_) { /* ignore */ }
      // Grandfather existing relationships
      try {
        this.db.exec(
          'UPDATE relationships SET valid_at = created_at WHERE valid_at IS NULL'
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (8, 'Add valid_at, invalid_at to relationships for bi-temporal tracking')"
      );
    }

    // --- Migration 9: _meta table ---
    if (currentVersion < 9) {
      try {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS _meta (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `);
      } catch (e) {
        if (!_isDuplicateOrExists(e)) {
          process.stderr.write(`[database] Migration 9 failed: ${e.message}\n`);
        }
      }
      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (9, 'Add _meta table for database identification and workspace path tracking')"
      );
    }

    // --- Migration 10: Reflections table ---
    if (currentVersion < 10) {
      const stmts = [
        `CREATE TABLE IF NOT EXISTS reflections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          episode_id INTEGER REFERENCES episodes(id),
          reflection_type TEXT NOT NULL,
          content TEXT NOT NULL,
          content_hash TEXT,
          about_entity_id INTEGER REFERENCES entities(id),
          importance REAL DEFAULT 0.7,
          confidence REAL DEFAULT 0.8,
          decay_rate REAL DEFAULT 0.999,
          aggregated_from TEXT,
          aggregation_count INTEGER DEFAULT 1,
          first_observed_at TEXT DEFAULT (datetime('now')),
          last_confirmed_at TEXT DEFAULT (datetime('now')),
          embedding BLOB,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT,
          surfaced_count INTEGER DEFAULT 0,
          last_surfaced_at TEXT
        )`,
        'CREATE INDEX IF NOT EXISTS idx_reflections_type ON reflections(reflection_type)',
        'CREATE INDEX IF NOT EXISTS idx_reflections_importance ON reflections(importance DESC)',
        'CREATE INDEX IF NOT EXISTS idx_reflections_entity ON reflections(about_entity_id)',
        'CREATE INDEX IF NOT EXISTS idx_reflections_episode ON reflections(episode_id)',
      ];
      for (const stmt of stmts) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 10 failed: ${e.message}\n`);
          }
        }
      }
      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (10, 'Add reflections table and reflection_embeddings for /meditate skill')"
      );
    }

    // --- Migration 11: Source lookup index on documents ---
    if (currentVersion < 11) {
      try {
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_documents_source_lookup ON documents(source_type, source_ref)'
        );
      } catch (e) {
        if (!_isDuplicateOrExists(e)) {
          process.stderr.write(`[database] Migration 11 failed: ${e.message}\n`);
        }
      }
      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (11, 'Add compound index for fast source lookup on documents')"
      );
    }

    // --- Migration 12: Audit log, metrics, soft-delete/correction ---
    if (currentVersion < 12) {
      const stmts = [
        `CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT DEFAULT (datetime('now')),
          operation TEXT NOT NULL,
          details TEXT,
          session_id TEXT,
          user_initiated INTEGER DEFAULT 0,
          entity_id INTEGER,
          memory_id INTEGER
        )`,
        'CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON audit_log(operation)',
        'CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_log_memory ON audit_log(memory_id)',
        `CREATE TABLE IF NOT EXISTS metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT DEFAULT (datetime('now')),
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          dimensions TEXT
        )`,
        'CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(metric_name, timestamp DESC)',
        'ALTER TABLE entities ADD COLUMN deleted_at TEXT',
        'ALTER TABLE entities ADD COLUMN deleted_reason TEXT',
        'ALTER TABLE memories ADD COLUMN corrected_at TEXT',
        'ALTER TABLE memories ADD COLUMN corrected_from TEXT',
        'ALTER TABLE memories ADD COLUMN invalidated_at TEXT',
        'ALTER TABLE memories ADD COLUMN invalidated_reason TEXT',
      ];
      for (const stmt of stmts) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 12 failed: ${e.message}\n`);
          }
        }
      }
      try {
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_memories_invalidated ON memories(invalidated_at)'
        );
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_entities_deleted ON entities(deleted_at)'
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (12, 'Add audit_log, metrics tables, soft-delete on entities, correction/invalidation on memories')"
      );
    }

    // --- Migration 13: Trust North Star - origin_type, agent_dispatches ---
    if (currentVersion < 13) {
      const stmts = [
        "ALTER TABLE memories ADD COLUMN origin_type TEXT DEFAULT 'inferred'",
        `CREATE TABLE IF NOT EXISTS agent_dispatches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_name TEXT NOT NULL,
          dispatch_category TEXT NOT NULL,
          task_summary TEXT,
          started_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT,
          duration_ms INTEGER,
          success INTEGER DEFAULT 1,
          required_claudia_judgment INTEGER DEFAULT 0,
          judgment_reason TEXT,
          episode_id INTEGER REFERENCES episodes(id),
          user_approved INTEGER DEFAULT 1,
          metadata TEXT
        )`,
        'CREATE INDEX IF NOT EXISTS idx_agent_dispatches_agent ON agent_dispatches(agent_name)',
        'CREATE INDEX IF NOT EXISTS idx_agent_dispatches_category ON agent_dispatches(dispatch_category)',
        'CREATE INDEX IF NOT EXISTS idx_agent_dispatches_started ON agent_dispatches(started_at DESC)',
      ];
      for (const stmt of stmts) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 13 failed: ${e.message}\n`);
          }
        }
      }
      // Grandfather: high-importance conversation memories = user_stated
      try {
        this.db.exec(
          "UPDATE memories SET origin_type = 'user_stated' WHERE origin_type IS NULL AND source = 'conversation' AND importance >= 0.9"
        );
        this.db.exec(
          "UPDATE memories SET origin_type = 'inferred' WHERE origin_type IS NULL"
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (13, 'Add origin_type to memories, agent_dispatches table for Trust North Star')"
      );
    }

    // --- Migration 14: dispatch_tier on agent_dispatches ---
    if (currentVersion < 14) {
      try {
        this.db.exec(
          "ALTER TABLE agent_dispatches ADD COLUMN dispatch_tier TEXT DEFAULT 'task'"
        );
      } catch (e) {
        if (!_isDuplicateOrExists(e)) {
          process.stderr.write(`[database] Migration 14 failed: ${e.message}\n`);
        }
      }
      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (14, 'Add dispatch_tier to agent_dispatches for native agent team support')"
      );
    }

    // --- Migration 15: origin_type on relationships ---
    if (currentVersion < 15) {
      try {
        this.db.exec(
          "ALTER TABLE relationships ADD COLUMN origin_type TEXT DEFAULT 'extracted'"
        );
      } catch (e) {
        if (!_isDuplicateOrExists(e)) {
          process.stderr.write(`[database] Migration 15 failed: ${e.message}\n`);
        }
      }
      // Grandfather existing relationships
      try {
        this.db.exec(
          "UPDATE relationships SET origin_type = 'extracted' WHERE origin_type IS NULL"
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (15, 'Add origin_type to relationships for organic trust model')"
      );
    }

    // --- Migration 16: source_channel on memories ---
    if (currentVersion < 16) {
      try {
        this.db.exec(
          "ALTER TABLE memories ADD COLUMN source_channel TEXT DEFAULT 'claude_code'"
        );
      } catch (e) {
        if (!_isDuplicateOrExists(e)) {
          process.stderr.write(`[database] Migration 16 failed: ${e.message}\n`);
        }
      }
      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (16, 'Add source_channel to memories for channel-aware memory')"
      );
    }

    // --- Migration 17: Temporal intelligence ---
    if (currentVersion < 17) {
      for (const stmt of [
        'ALTER TABLE memories ADD COLUMN deadline_at TEXT',
        'ALTER TABLE memories ADD COLUMN temporal_markers TEXT',
      ]) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 17 failed: ${e.message}\n`);
          }
        }
      }
      try {
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_memories_deadline ON memories(deadline_at)'
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (17, 'Add deadline_at and temporal_markers to memories for temporal intelligence')"
      );
    }

    // --- Migration 18: Contact velocity + attention tiers ---
    if (currentVersion < 18) {
      for (const stmt of [
        'ALTER TABLE entities ADD COLUMN last_contact_at TEXT',
        'ALTER TABLE entities ADD COLUMN contact_frequency_days REAL',
        'ALTER TABLE entities ADD COLUMN contact_trend TEXT',
        "ALTER TABLE entities ADD COLUMN attention_tier TEXT DEFAULT 'standard'",
      ]) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 18 failed: ${e.message}\n`);
          }
        }
      }
      try {
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_entities_last_contact ON entities(last_contact_at)'
        );
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_entities_trend ON entities(contact_trend)'
        );
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_entities_attention_tier ON entities(attention_tier)'
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (18, 'Add contact velocity and attention tier to entities for proactive relationship intelligence')"
      );
    }

    // --- Migration 19: Entity summaries ---
    if (currentVersion < 19) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS entity_summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          summary TEXT NOT NULL,
          summary_type TEXT DEFAULT 'overview',
          memory_count INTEGER DEFAULT 0,
          relationship_count INTEGER DEFAULT 0,
          generated_at TEXT DEFAULT (datetime('now')),
          expires_at TEXT,
          metadata TEXT,
          UNIQUE(entity_id, summary_type)
        )
      `);
      try {
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_entity_summaries_entity ON entity_summaries(entity_id)'
        );
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_entity_summaries_expires ON entity_summaries(expires_at)'
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (19, 'Add entity_summaries table for hierarchical graph-aware retrieval')"
      );
    }

    // --- Migration 20: Lifecycle tiers, sacred, close-circle, fact_id, chain ---
    if (currentVersion < 20) {
      const stmts = [
        "ALTER TABLE memories ADD COLUMN lifecycle_tier TEXT DEFAULT 'active'",
        'ALTER TABLE memories ADD COLUMN sacred_reason TEXT',
        'ALTER TABLE memories ADD COLUMN archived_at TEXT',
        'ALTER TABLE memories ADD COLUMN fact_id TEXT',
        'ALTER TABLE memories ADD COLUMN hash TEXT',
        'ALTER TABLE memories ADD COLUMN prev_hash TEXT',
        'ALTER TABLE entities ADD COLUMN close_circle BOOLEAN DEFAULT FALSE',
        'ALTER TABLE entities ADD COLUMN close_circle_reason TEXT',
        "ALTER TABLE relationships ADD COLUMN lifecycle_tier TEXT DEFAULT 'active'",
      ];
      for (const stmt of stmts) {
        try { this.db.exec(stmt); } catch (e) {
          if (!_isDuplicateOrExists(e)) {
            process.stderr.write(`[database] Migration 20 failed: ${e.message}\n`);
          }
        }
      }
      try {
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_memories_lifecycle ON memories(lifecycle_tier)'
        );
        this.db.exec(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_fact_id ON memories(fact_id)'
        );
        this.db.exec(
          'CREATE INDEX IF NOT EXISTS idx_entities_close_circle ON entities(close_circle) WHERE close_circle = 1'
        );
      } catch (_) { /* ignore */ }

      // Backfill: generate fact_id for existing memories
      try {
        const rows = this.db.prepare(
          'SELECT id FROM memories WHERE fact_id IS NULL'
        ).all();
        const updateStmt = this.db.prepare(
          'UPDATE memories SET fact_id = ? WHERE id = ?'
        );
        const batchUpdate = this.db.transaction((batch) => {
          for (const row of batch) {
            updateStmt.run(randomUUID(), row.id);
          }
        });
        // Process in batches of 1000
        for (let i = 0; i < rows.length; i += 1000) {
          batchUpdate(rows.slice(i, i + 1000));
        }
      } catch (e) {
        process.stderr.write(`[database] Migration 20 fact_id backfill failed: ${e.message}\n`);
      }

      // Initialize chain_head and view_as_of in _meta
      try {
        this.db.exec(
          "INSERT OR IGNORE INTO _meta (key, value, updated_at) VALUES ('chain_head', NULL, datetime('now'))"
        );
        this.db.exec(
          "INSERT OR IGNORE INTO _meta (key, value, updated_at) VALUES ('view_as_of', NULL, datetime('now'))"
        );
      } catch (_) { /* ignore */ }

      this.db.exec(
        "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (20, 'Add lifecycle tiers, sacred memories, close-circle entities, fact_id, SHA-256 chain')"
      );
    }

    // -----------------------------------------------------------------------
    // Post-migration: Ensure FTS5 table + triggers exist
    // -----------------------------------------------------------------------
    try {
      const ftsCheck = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'"
      ).get();
      if (!ftsCheck) {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
            content,
            content='memories',
            content_rowid='id',
            tokenize='porter unicode61'
          )
        `);
        this.db.exec(`
          CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
            INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
          END
        `);
        this.db.exec(`
          CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
          END
        `);
        this.db.exec(`
          CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE OF content ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
            INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
          END
        `);
        // Backfill existing memories
        this.db.exec(
          'INSERT INTO memories_fts(rowid, content) SELECT id, content FROM memories'
        );
        this.db.exec(
          "INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (4, 'FTS5 full-text search with auto-sync triggers')"
        );
      }
    } catch (e) {
      const msg = e.message || '';
      if (msg.toLowerCase().includes('fts5')) {
        process.stderr.write(`[database] FTS5 not available in this SQLite build: ${msg}\n`);
      } else {
        process.stderr.write(`[database] FTS5 setup failed: ${msg}\n`);
      }
    }

    // -----------------------------------------------------------------------
    // Post-migration: Ensure dispatch_tier validation trigger exists
    // -----------------------------------------------------------------------
    try {
      const triggerCheck = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='validate_dispatch_tier'"
      ).get();
      if (!triggerCheck) {
        this.db.exec(`
          CREATE TRIGGER IF NOT EXISTS validate_dispatch_tier
          BEFORE INSERT ON agent_dispatches
          WHEN NEW.dispatch_tier NOT IN ('task', 'native_team')
          BEGIN
            SELECT RAISE(ABORT, 'dispatch_tier must be task or native_team');
          END
        `);
      }
    } catch (_) {
      // Non-fatal; dispatch_tier trigger is a safety guard, not required
    }
  }

  // -------------------------------------------------------------------------
  // Workspace path and registry
  // -------------------------------------------------------------------------

  /** Store workspace path in _meta table for database identification. */
  _storeWorkspacePath() {
    try {
      const check = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_meta'"
      ).get();
      if (!check) return;
    } catch (_) {
      return;
    }

    const workspacePath = process.env.CLAUDIA_WORKSPACE_PATH;
    if (!workspacePath) return;

    this.db.prepare(
      `INSERT INTO _meta (key, value, updated_at)
       VALUES ('workspace_path', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run(workspacePath);

    this.db.prepare(
      `INSERT OR IGNORE INTO _meta (key, value, updated_at)
       VALUES ('created_at', ?, datetime('now'))`
    ).run(new Date().toISOString());
  }

  /** Register this database in the central registry. */
  _registerDatabase() {
    const registryPath = getRegistryPath();

    try {
      let registry;
      if (existsSync(registryPath)) {
        registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
      } else {
        registry = { databases: [] };
      }

      const dbStr = this.dbPath;
      let entry = registry.databases.find(d => d.path === dbStr);

      const workspace = process.env.CLAUDIA_WORKSPACE_PATH || '';
      // Extract bare filename without extension as the name
      const name = this.dbPath.split('/').pop().replace(/\.db$/, '');

      if (entry) {
        entry.workspace = workspace || entry.workspace || '';
        entry.last_seen = new Date().toISOString();
      } else {
        registry.databases.push({
          path: dbStr,
          workspace,
          name,
          registered_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        });
      }

      mkdirSync(dirname(registryPath), { recursive: true });
      writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    } catch (_) {
      // Non-fatal
    }
  }

  // -------------------------------------------------------------------------
  // Query helpers
  // -------------------------------------------------------------------------

  /**
   * Execute SQL and return { changes, lastInsertRowid }.
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {{ changes: number, lastInsertRowid: number }}
   */
  run(sql, params = []) {
    const info = this.db.prepare(sql).run(...params);
    return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
  }

  /**
   * Execute SQL and return info (alias matching Python execute()).
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {{ changes: number, lastInsertRowid: number }}
   */
  execute(sql, params = []) {
    return this.run(sql, params);
  }

  /**
   * Execute SQL and return all rows as plain objects.
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {object[]}
   */
  query(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Execute SQL and return first row or null.
   * @param {string} sql
   * @param {Array} [params=[]]
   * @returns {object|null}
   */
  queryOne(sql, params = []) {
    return this.db.prepare(sql).get(...params) || null;
  }

  /**
   * INSERT a row and return lastInsertRowid.
   * @param {string} table
   * @param {object} data - Column-value pairs
   * @returns {number}
   */
  insert(table, data) {
    const keys = Object.keys(data);
    const columns = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    const info = this.db.prepare(sql).run(...Object.values(data));
    return Number(info.lastInsertRowid);
  }

  /**
   * UPDATE rows and return changes count.
   * @param {string} table
   * @param {object} data - Column-value pairs to SET
   * @param {string} where - WHERE clause (without "WHERE" keyword)
   * @param {Array} [whereParams=[]]
   * @returns {number}
   */
  update(table, data, where, whereParams = []) {
    const setClause = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;
    const info = this.db.prepare(sql).run(...Object.values(data), ...whereParams);
    return info.changes;
  }

  /**
   * Execute raw SQL (multi-statement). No return value.
   * Use this for DDL or multi-statement scripts.
   * @param {string} sql
   */
  rawExec(sql) {
    this.db.exec(sql);
  }

  /**
   * Create a transaction wrapper.
   * Usage: const txn = db.transaction((args) => { ... }); txn(args);
   * @param {Function} fn - Function to execute within transaction
   * @returns {Function} - Transaction-wrapped function
   */
  createTransaction(fn) {
    return this.db.transaction(fn);
  }

  // -------------------------------------------------------------------------
  // Backup
  // -------------------------------------------------------------------------

  /**
   * Create a backup of the database using better-sqlite3's backup() API.
   * @param {string} [label] - Optional label (e.g., "daily", "weekly", "pre-migration")
   * @returns {Promise<string>} Path to backup file
   */
  async backup(label = null) {
    const config = this.config || getConfig();
    const timestamp = _formatTimestamp();
    const suffix = label ? `backup-${label}-${timestamp}` : `backup-${timestamp}`;
    const backupPath = `${this.dbPath}.${suffix}.db`;

    // better-sqlite3 backup() returns a promise
    await this.db.backup(backupPath);

    // Verify backup integrity
    try {
      const verifyDb = new BetterSqlite3(backupPath, { readonly: true });
      const result = verifyDb.pragma('integrity_check');
      verifyDb.close();
      if (result && result[0] && result[0].integrity_check !== 'ok') {
        try { unlinkSync(backupPath); } catch (_) { /* ignore */ }
        throw new Error(`Backup integrity check failed: ${JSON.stringify(result)}`);
      }
    } catch (e) {
      if (e.message && e.message.includes('integrity check failed')) throw e;
      // Verification could not run, non-fatal
    }

    // Rolling retention
    const retention = label
      ? _getLabelRetention(label, config)
      : config.backup_retention_count;

    _cleanOldBackups(this.dbPath, label, retention);

    return backupPath;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Close the database connection. */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this._initialized = false;
  }
}

// ---------------------------------------------------------------------------
// Utility helpers (module-private)
// ---------------------------------------------------------------------------

/** Check if an error is "duplicate column" or "already exists". */
function _isDuplicateOrExists(e) {
  const msg = (e.message || '').toLowerCase();
  return msg.includes('duplicate column') || msg.includes('already exists');
}

/** Format current timestamp as YYYY-MM-DD-HHmmss. */
function _formatTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    '-', pad(d.getMonth() + 1),
    '-', pad(d.getDate()),
    '-', pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

/** Get retention count for a labeled backup category. */
function _getLabelRetention(label, config) {
  const map = {
    daily: config.backup_daily_retention,
    weekly: config.backup_weekly_retention,
  };
  return map[label] || config.backup_retention_count;
}

/** Clean old backups, keeping only `retention` most recent. */
function _cleanOldBackups(dbPath, label, retention) {
  try {
    const dir = dirname(dbPath);
    const dbFilename = dbPath.split('/').pop();
    const prefix = label
      ? `${dbFilename}.backup-${label}-`
      : `${dbFilename}.backup-`;

    const files = readdirSync(dir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.db'))
      .map(f => ({
        name: f,
        path: join(dir, f),
        mtime: statSync(join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => a.mtime - b.mtime);

    while (files.length > retention) {
      const oldest = files.shift();
      try { unlinkSync(oldest.path); } catch (_) { /* ignore */ }
    }
  } catch (_) {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Content hash utility
// ---------------------------------------------------------------------------

/**
 * Generate SHA-256 hex hash of content for deduplication.
 * @param {string} content
 * @returns {string}
 */
export function contentHash(content) {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ---------------------------------------------------------------------------
// Singleton pattern
// ---------------------------------------------------------------------------

/** @type {ClaudiaDatabase|null} */
let _instance = null;
let _instanceProjectDir = undefined;

/**
 * Get or create the global database instance (lazy-initialized singleton).
 * @param {string|null} [projectDir=null] - Project directory for DB path resolution
 * @returns {ClaudiaDatabase}
 */
export function getDatabase(projectDir = null) {
  if (_instance !== null && projectDir === _instanceProjectDir) {
    return _instance;
  }

  const config = getConfig(projectDir);
  const db = new ClaudiaDatabase(config.db_path, config);
  db.initialize();

  _instance = db;
  _instanceProjectDir = projectDir;
  return _instance;
}

/**
 * Reset the global database instance (for testing).
 */
export function resetDatabase() {
  if (_instance) {
    _instance.close();
  }
  _instance = null;
  _instanceProjectDir = undefined;
}

export { ClaudiaDatabase };
