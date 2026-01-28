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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_accessed_at TEXT,  -- For rehearsal-based importance boost
    access_count INTEGER DEFAULT 0,
    metadata TEXT  -- JSON blob for flexible attributes
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);

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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    metadata TEXT,
    UNIQUE(source_entity_id, target_entity_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);

-- ============================================================================
-- EPISODES: Conversation session summaries
-- ============================================================================

CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,  -- External session identifier
    summary TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    message_count INTEGER DEFAULT 0,
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
-- MIGRATION TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now')),
    description TEXT
);

-- Record initial schema version
INSERT OR IGNORE INTO schema_migrations (version, description)
VALUES (1, 'Initial schema with entities, memories, relationships, episodes, patterns, predictions');
