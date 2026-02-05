-- Claudia Memory System Schema
-- SQLite with sqlite-vec for vector similarity search
-- WAL mode enabled for crash safety

-- Enable WAL mode for crash safety
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- ============================================================================
-- ENTITIES: People, organizations, projects, concepts
-- ============================================================================

CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('person', 'organization', 'project', 'concept', 'location')),
    canonical_name TEXT,  -- Normalized name for matching (lowercase, no titles)
    description TEXT,
    importance REAL DEFAULT 1.0,  -- Decays over time but never deleted
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    metadata TEXT,  -- JSON blob for flexible attributes
    UNIQUE(canonical_name, type)
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_importance ON entities(importance DESC);

-- Entity aliases for matching variations (e.g., "Sarah", "Sarah Chen", "S. Chen")
CREATE TABLE IF NOT EXISTS entity_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    canonical_alias TEXT NOT NULL,  -- Normalized for matching
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(entity_id, canonical_alias)
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical ON entity_aliases(canonical_alias);

-- ============================================================================
-- MEMORIES: Facts, preferences, observations, learnings
-- ============================================================================

CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    content_hash TEXT UNIQUE,  -- SHA256 for deduplication
    type TEXT NOT NULL CHECK (type IN ('fact', 'preference', 'observation', 'learning', 'commitment', 'pattern')),
    importance REAL DEFAULT 1.0,  -- Decays over time
    confidence REAL DEFAULT 1.0,  -- How sure we are about this
    source TEXT,  -- Where this came from (conversation, document, etc.)
    source_id TEXT,  -- Reference to source (episode_id, etc.)
    source_context TEXT,  -- One-line breadcrumb (e.g., "Email from Jim re: Forum V+, 2025-01-28")
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_accessed_at TEXT,  -- For rehearsal-based importance boost
    access_count INTEGER DEFAULT 0,
    verified_at TEXT,  -- When this memory was verified
    verification_status TEXT DEFAULT 'pending',  -- pending, verified, flagged, contradicts
    metadata TEXT  -- JSON blob for flexible attributes
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);
CREATE INDEX IF NOT EXISTS idx_memories_verification ON memories(verification_status);

-- Junction table linking memories to entities
CREATE TABLE IF NOT EXISTS memory_entities (
    memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relationship TEXT DEFAULT 'about',  -- about, by, to, from, etc.
    PRIMARY KEY (memory_id, entity_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_memory_entities_entity ON memory_entities(entity_id);

-- ============================================================================
-- RELATIONSHIPS: Graph connections between entities
-- ============================================================================

CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,  -- works_with, manages, client_of, etc.
    strength REAL DEFAULT 1.0,  -- Relationship strength (decays/grows)
    direction TEXT DEFAULT 'bidirectional' CHECK (direction IN ('forward', 'backward', 'bidirectional')),
    valid_at TEXT,  -- When this relationship became true in the real world
    invalid_at TEXT,  -- When this relationship was superseded (NULL = current)
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    metadata TEXT,
    UNIQUE(source_entity_id, target_entity_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_temporal ON relationships(invalid_at, valid_at);

-- ============================================================================
-- EPISODES: Conversation session summaries
-- ============================================================================

CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,  -- External session identifier
    summary TEXT,
    narrative TEXT,  -- Free-form session narrative (tone, context, unresolved threads)
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    message_count INTEGER DEFAULT 0,
    turn_count INTEGER DEFAULT 0,  -- Buffered turns count
    is_summarized INTEGER DEFAULT 0,  -- Whether session has been summarized by Claude
    source TEXT,  -- Origin channel: 'claude_code', 'telegram', 'slack', etc.
    ingested_at TEXT,  -- When Claude Code read this (NULL = unread)
    key_topics TEXT,  -- JSON array of main topics
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);
CREATE INDEX IF NOT EXISTS idx_episodes_started ON episodes(started_at DESC);

-- ============================================================================
-- MESSAGES: Individual conversation turns
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    content_hash TEXT,  -- For deduplication
    created_at TEXT DEFAULT (datetime('now')),
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_episode ON messages(episode_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- ============================================================================
-- PATTERNS: Detected behavioral patterns
-- ============================================================================

CREATE TABLE IF NOT EXISTS patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    pattern_type TEXT NOT NULL,  -- behavioral, communication, scheduling, relationship
    occurrences INTEGER DEFAULT 1,
    first_observed_at TEXT DEFAULT (datetime('now')),
    last_observed_at TEXT DEFAULT (datetime('now')),
    confidence REAL DEFAULT 0.5,  -- Grows with observations
    is_active INTEGER DEFAULT 1,
    evidence TEXT,  -- JSON array of supporting observations
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_active ON patterns(is_active);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence DESC);

-- ============================================================================
-- PREDICTIONS: Proactive suggestions
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    prediction_type TEXT NOT NULL,  -- reminder, suggestion, warning, insight
    priority REAL DEFAULT 0.5,
    expires_at TEXT,  -- When this prediction is no longer relevant
    is_shown INTEGER DEFAULT 0,  -- Whether user has seen this
    is_acted_on INTEGER DEFAULT 0,  -- Whether user acted on this
    created_at TEXT DEFAULT (datetime('now')),
    shown_at TEXT,
    prediction_pattern_name TEXT,  -- Links to pattern for feedback loop
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_predictions_type ON predictions(prediction_type);
CREATE INDEX IF NOT EXISTS idx_predictions_expires ON predictions(expires_at);
CREATE INDEX IF NOT EXISTS idx_predictions_shown ON predictions(is_shown);
CREATE INDEX IF NOT EXISTS idx_predictions_priority ON predictions(priority DESC);

-- ============================================================================
-- CONFIG: Runtime configuration stored in database
-- ============================================================================

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- VECTOR TABLES: sqlite-vec virtual tables for semantic search
-- ============================================================================

-- Entity embeddings (384 dimensions for all-minilm)
CREATE VIRTUAL TABLE IF NOT EXISTS entity_embeddings USING vec0(
    entity_id INTEGER PRIMARY KEY,
    embedding FLOAT[384]
);

-- Memory embeddings
CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
    memory_id INTEGER PRIMARY KEY,
    embedding FLOAT[384]
);

-- Message embeddings (optional, for searching conversations)
CREATE VIRTUAL TABLE IF NOT EXISTS message_embeddings USING vec0(
    message_id INTEGER PRIMARY KEY,
    embedding FLOAT[384]
);

-- ============================================================================
-- TURN BUFFER: Raw conversation turns awaiting session summary
-- ============================================================================

CREATE TABLE IF NOT EXISTS turn_buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    user_content TEXT,
    assistant_content TEXT,
    is_archived INTEGER DEFAULT 0,
    source TEXT,  -- Origin channel: 'claude_code', 'telegram', 'slack', etc.
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_turn_buffer_episode ON turn_buffer(episode_id);

-- Episode narrative embeddings (for semantic search across session summaries)
CREATE VIRTUAL TABLE IF NOT EXISTS episode_embeddings USING vec0(
    episode_id INTEGER PRIMARY KEY,
    embedding FLOAT[384]
);

-- ============================================================================
-- DOCUMENTS: File registry for provenance tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_hash TEXT,  -- SHA-256 of file contents for deduplication
    filename TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    storage_provider TEXT DEFAULT 'local' CHECK (storage_provider IN ('local', 'google_drive')),
    storage_path TEXT,  -- Resolved file path on disk or cloud URI
    source_type TEXT CHECK (source_type IN ('gmail', 'transcript', 'upload', 'capture', 'session')),
    source_ref TEXT,  -- External reference (email ID, URL, etc.)
    summary TEXT,
    lifecycle TEXT DEFAULT 'active' CHECK (lifecycle IN ('active', 'dormant', 'archived', 'purged')),
    last_accessed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    workspace_id TEXT,  -- Project hash for isolation
    metadata TEXT  -- JSON blob
);

CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_lifecycle ON documents(lifecycle);
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_source_lookup ON documents(source_type, source_ref);

-- Links documents to entities (people, projects, etc.)
CREATE TABLE IF NOT EXISTS entity_documents (
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    relationship TEXT DEFAULT 'about' CHECK (relationship IN ('sent_by', 'about', 'mentioned_in', 'authored', 'received_by')),
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (entity_id, document_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_entity_documents_doc ON entity_documents(document_id);

-- Links memories to source documents (provenance)
CREATE TABLE IF NOT EXISTS memory_sources (
    memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    excerpt TEXT,  -- Relevant excerpt from the document
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (memory_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_sources_doc ON memory_sources(document_id);

-- ============================================================================
-- DATABASE METADATA
-- ============================================================================

-- Stores database-level metadata like workspace path for identification
CREATE TABLE IF NOT EXISTS _meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now')),
    description TEXT
);

-- Record schema versions
INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (1, 'Initial schema with entities, memories, relationships, episodes, patterns, predictions');

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (2, 'Add turn_buffer table, episode narrative/summary columns, episode_embeddings');

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (3, 'Add source_context to memories, is_archived to turn_buffer for episodic provenance');

-- NOTE: FTS5 full-text search (migration v4) is created by database.py migration code
-- rather than here, because CREATE TRIGGER statements contain internal semicolons
-- that the schema.sql line-based parser cannot handle.

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (5, 'Add verification columns to memories, prediction_pattern_name to predictions');

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (6, 'Add source and ingested_at to episodes, source to turn_buffer for gateway integration');

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (7, 'Add documents, entity_documents, memory_sources tables for provenance tracking');

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (8, 'Add valid_at, invalid_at to relationships for bi-temporal tracking');

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (9, 'Add _meta table for database identification and workspace path tracking');

-- ============================================================================
-- REFLECTIONS: Persistent learnings and observations (from /meditate)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER REFERENCES episodes(id),

    -- Type and content
    reflection_type TEXT NOT NULL CHECK (reflection_type IN ('observation', 'pattern', 'learning', 'question')),
    content TEXT NOT NULL,
    content_hash TEXT,  -- For deduplication

    -- Optional entity association
    about_entity_id INTEGER REFERENCES entities(id),

    -- Scoring (reflections are user-approved, so start high)
    importance REAL DEFAULT 0.7,
    confidence REAL DEFAULT 0.8,

    -- Very slow decay (reflections are long-term learnings)
    decay_rate REAL DEFAULT 0.999,

    -- Aggregation tracking
    aggregated_from TEXT,  -- JSON array of reflection IDs this merged from
    aggregation_count INTEGER DEFAULT 1,

    -- Timeline tracking (pattern evolution)
    first_observed_at TEXT DEFAULT (datetime('now')),
    last_confirmed_at TEXT DEFAULT (datetime('now')),

    -- Embedding for semantic search
    embedding BLOB,

    -- Timestamps
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    surfaced_count INTEGER DEFAULT 0,
    last_surfaced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reflections_type ON reflections(reflection_type);
CREATE INDEX IF NOT EXISTS idx_reflections_importance ON reflections(importance DESC);
CREATE INDEX IF NOT EXISTS idx_reflections_entity ON reflections(about_entity_id);
CREATE INDEX IF NOT EXISTS idx_reflections_episode ON reflections(episode_id);

-- Reflection embeddings for semantic search
CREATE VIRTUAL TABLE IF NOT EXISTS reflection_embeddings USING vec0(
    reflection_id INTEGER PRIMARY KEY,
    embedding FLOAT[384]
);

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (10, 'Add reflections table and reflection_embeddings for /meditate skill');

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (11, 'Add compound index for fast source lookup on documents');

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (13, 'Add origin_type to memories, agent_dispatches table for Trust North Star');

INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (14, 'Add dispatch_tier to agent_dispatches for native agent team support');

-- ============================================================================
-- AGENT DISPATCHES: Track delegated tasks to sub-agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_dispatches (
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
    dispatch_tier TEXT DEFAULT 'task',
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_dispatches_agent ON agent_dispatches(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_dispatches_category ON agent_dispatches(dispatch_category);
CREATE INDEX IF NOT EXISTS idx_agent_dispatches_started ON agent_dispatches(started_at DESC);
