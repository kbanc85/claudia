/**
 * Vault Sync Service for Claudia CLI (Node.js port).
 *
 * Port of memory-daemon/claudia_memory/services/vault_sync.py.
 *
 * Exports SQLite memory data to an Obsidian-compatible vault as markdown notes
 * with YAML frontmatter and [[wikilinks]]. The vault is a read projection
 * of SQLite data -- SQLite remains the single source of truth.
 *
 * Vault structure (PARA-inspired):
 *   ~/.claudia/vault/{project_id}/
 *     Active/                   Projects with attention_tier in (active, watchlist)
 *     Relationships/
 *       people/                 Person entities (non-archived)
 *       organizations/          Organization entities (non-archived)
 *     Reference/
 *       concepts/               Concept entities
 *       locations/              Location entities
 *     Archive/
 *       people/                 Dormant or archived people
 *       projects/               Completed or archived projects
 *       organizations/          Past organizations
 *     Claudia's Desk/           Claudia's efficient lookup zone
 *       MOC-People.md           Flat tier table for quick reads
 *       MOC-Commitments.md      Commitment tracking table
 *       MOC-Projects.md         Project overview table
 *       patterns/               Detected pattern notes
 *       reflections/            Reflection notes from /meditate
 *       sessions/               Daily session logs (YYYY/MM/YYYY-MM-DD.md)
 *       _queries/               Dataview query templates
 *     canvases/                 Visual dashboards (human-facing)
 *     Home.md                   PARA-style navigation dashboard
 *     _meta/                    Sync metadata (last-sync.json, sync-log.md)
 *     .obsidian/                Obsidian config
 *
 * All functions take `db` (ClaudiaDatabase instance) as the first parameter.
 */

import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync,
  readdirSync, statSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { getConfig } from '../core/config.js';
import { getVaultDir } from '../core/paths.js';
import { contentHash } from '../core/database.js';
import { canonicalName } from '../core/guards.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Map entity types to vault subdirectory names. */
const ENTITY_TYPE_DIRS = {
  person: 'people',
  project: 'projects',
  organization: 'organizations',
  concept: 'concepts',
  location: 'locations',
};

/** All PARA directories to create on init. */
const PARA_DIRS = [
  'Active',
  'Relationships/people',
  'Relationships/organizations',
  'Reference/concepts',
  'Reference/locations',
  'Archive/people',
  'Archive/projects',
  'Archive/organizations',
  "Claudia's Desk",
  "Claudia's Desk/patterns",
  "Claudia's Desk/reflections",
  "Claudia's Desk/sessions",
  "Claudia's Desk/_queries",
  'canvases',
  '_meta',
  '.obsidian',
  '.obsidian/snippets',
];

/** PARA entity directories for file counting and edit scanning. */
const ENTITY_SUBDIRS = [
  'Active',
  'Relationships/people',
  'Relationships/organizations',
  'Reference/concepts',
  'Reference/locations',
  'Archive/people',
  'Archive/projects',
  'Archive/organizations',
];

/** PARA indices: directory -> [entityType, displayTitle]. */
const PARA_INDICES = {
  'Relationships/people': ['person', 'People'],
  'Relationships/organizations': ['organization', 'Organizations'],
  'Active': ['project', 'Active Projects'],
  'Reference/concepts': ['concept', 'Concepts'],
  'Reference/locations': ['location', 'Locations'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _log(msg) {
  process.stderr.write(`[vault-sync] ${msg}\n`);
}

function _now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function _nowISO() {
  return new Date().toISOString();
}

function _utcStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/**
 * Convert an entity name to a safe filename.
 * Preserves readability while removing characters problematic on Windows/macOS/Linux.
 */
function _sanitizeFilename(name) {
  let s = name.replace(/[<>:"/\\|?*]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^\.+|\.+$/g, '');
  if (s.length > 100) {
    s = s.slice(0, 100).trimEnd();
  }
  return s || 'untitled';
}

/**
 * Compute a short SHA-256 hash of note content for change detection.
 * Used for bidirectional sync: if file content hash differs from sync_hash
 * in frontmatter, the user modified the note.
 */
function _computeSyncHash(content) {
  return createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 12);
}

/**
 * Safely read a property from a row object. Returns default if missing or null.
 */
function _get(row, key, defaultValue = null) {
  if (row == null) return defaultValue;
  const val = row[key];
  return val != null ? val : defaultValue;
}

/**
 * Ensure a directory exists, creating parents as needed.
 */
function _ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * List all .md files in a directory (non-recursive). Returns filenames.
 */
function _listMdFiles(dirPath) {
  if (!existsSync(dirPath)) return [];
  try {
    return readdirSync(dirPath).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

/**
 * Format a date string as "Mon DD, YYYY" for display.
 */
function _formatDate(dateStr) {
  if (!dateStr) return '?';
  try {
    const d = new Date(dateStr.slice(0, 10));
    if (isNaN(d.getTime())) return dateStr.slice(0, 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}, ${d.getUTCFullYear()}`;
  } catch {
    return dateStr.slice(0, 10);
  }
}

/**
 * Calculate days between now (UTC) and a date string.
 */
function _daysAgo(dateStr) {
  if (!dateStr) return null;
  try {
    const then = new Date(dateStr.slice(0, 19));
    if (isNaN(then.getTime())) return null;
    const now = new Date();
    return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PARA directory routing
// ---------------------------------------------------------------------------

/**
 * Route entity to PARA folder based on type + activity status.
 *
 * Archive: explicitly archived or dormant 90+ days.
 * Otherwise: route by entity type to Active/Relationships/Reference.
 *
 * @param {string} vaultPath - Root vault directory
 * @param {string} entityType
 * @param {object} entity - Entity row from DB
 * @returns {string} Absolute path to target directory
 */
function _paraDir(vaultPath, entityType, entity) {
  const tier = _get(entity, 'attention_tier', 'standard');
  const trend = _get(entity, 'contact_trend');

  // Archive: explicitly archived or dormant 90+ days
  if (tier === 'archive' || trend === 'dormant') {
    const subdir = ENTITY_TYPE_DIRS[entityType] || 'concepts';
    return join(vaultPath, 'Archive', subdir);
  }

  if (entityType === 'project') return join(vaultPath, 'Active');
  if (entityType === 'person') return join(vaultPath, 'Relationships', 'people');
  if (entityType === 'organization') return join(vaultPath, 'Relationships', 'organizations');
  if (entityType === 'location') return join(vaultPath, 'Reference', 'locations');
  // concept and anything else
  return join(vaultPath, 'Reference', 'concepts');
}

// ---------------------------------------------------------------------------
// Directory structure
// ---------------------------------------------------------------------------

/**
 * Create the PARA vault directory structure.
 */
function _ensureDirectories(vaultPath) {
  for (const d of PARA_DIRS) {
    _ensureDir(join(vaultPath, d));
  }
}

// ---------------------------------------------------------------------------
// Sync metadata
// ---------------------------------------------------------------------------

/**
 * Read last sync timestamp from _meta/last-sync.json.
 */
function _getLastSyncTime(vaultPath) {
  const metaPath = join(vaultPath, '_meta', 'last-sync.json');
  if (!existsSync(metaPath)) return null;
  try {
    const data = JSON.parse(readFileSync(metaPath, 'utf-8'));
    return data.last_sync || null;
  } catch {
    return null;
  }
}

/**
 * Read vault format version from _meta/last-sync.json.
 */
function _getVaultFormatVersion(vaultPath) {
  const metaPath = join(vaultPath, '_meta', 'last-sync.json');
  if (!existsSync(metaPath)) return 0;
  try {
    const data = JSON.parse(readFileSync(metaPath, 'utf-8'));
    return data.vault_format_version || 1;
  } catch {
    return 0;
  }
}

/**
 * Write sync metadata to _meta/last-sync.json.
 */
function _saveSyncMetadata(vaultPath, stats) {
  const metaPath = join(vaultPath, '_meta', 'last-sync.json');
  _ensureDir(dirname(metaPath));

  let existing = {};
  if (existsSync(metaPath)) {
    try {
      existing = JSON.parse(readFileSync(metaPath, 'utf-8'));
    } catch {
      // Ignore corrupt metadata
    }
  }

  Object.assign(existing, {
    last_sync: _now(),
    vault_format_version: 2,
    stats,
  });

  writeFileSync(metaPath, JSON.stringify(existing, null, 2), 'utf-8');
}

/**
 * Append a line to _meta/sync-log.md.
 */
function _appendSyncLog(vaultPath, message) {
  const logPath = join(vaultPath, '_meta', 'sync-log.md');
  _ensureDir(dirname(logPath));
  const timestamp = _now();
  appendFileSync(logPath, `- [${timestamp}] ${message}\n`, 'utf-8');
}

// ---------------------------------------------------------------------------
// Table validation and repair
// ---------------------------------------------------------------------------

/**
 * Scan markdown content for broken tables where header and separator rows
 * are merged onto a single line.
 *
 * Returns an array of warning strings.
 */
function _validateMarkdownTables(content) {
  const warnings = [];
  for (const line of content.split('\n')) {
    if (/\|[^|\-\n][^|\n]*\|[-\s|]{3,}/.test(line) && line.includes('---')) {
      warnings.push('Broken table detected: header and separator merged on single line');
    }
  }
  return warnings;
}

/**
 * Attempt to repair broken markdown tables where header, separator,
 * and optional data rows have been merged onto a single line.
 */
function _repairBrokenTables(content) {
  const repairedLines = [];

  for (const line of content.split('\n')) {
    const match = line.match(/^(\|[^-\n]+(?:\|[^-\n]+)*\|)([-|\s]*---[-|\s]*)(.*)$/);
    if (!match) {
      repairedLines.push(line);
      continue;
    }

    const headerPart = match[1].trim();
    const remainder = match[3].trim();

    // Reconstruct a clean separator row based on header column count
    const headerCells = headerPart.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const colCount = headerCells.length;
    const separator = '|' + headerCells.map(c => ' ' + '-'.repeat(Math.max(c.length, 3)) + ' ').join('|') + '|';

    repairedLines.push(headerPart);
    repairedLines.push(separator);

    // If there is leftover content after the separator, split it into data rows
    if (remainder) {
      const dataCells = remainder.replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(c => c);
      for (let i = 0; i < dataCells.length; i += colCount) {
        const rowCells = dataCells.slice(i, i + colCount);
        while (rowCells.length < colCount) rowCells.push('');
        repairedLines.push('| ' + rowCells.join(' | ') + ' |');
      }
    }
  }

  return repairedLines.join('\n');
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

/**
 * Fetch entities from the database, optionally filtered by update time.
 */
function _getAllEntities(db, since = null) {
  let sql = 'SELECT * FROM entities WHERE deleted_at IS NULL';
  const params = [];
  if (since) {
    sql += ' AND updated_at >= ?';
    params.push(since);
  }
  sql += ' ORDER BY importance DESC';
  return db.query(sql, params);
}

/**
 * Fetch non-invalidated memories linked to an entity.
 */
function _getEntityMemories(db, entityId) {
  return db.query(`
    SELECT m.* FROM memories m
    JOIN memory_entities me ON m.id = me.memory_id
    WHERE me.entity_id = ? AND m.invalidated_at IS NULL
    ORDER BY m.importance DESC, m.created_at DESC
  `, [entityId]);
}

/**
 * Fetch active relationships for an entity with resolved names.
 */
function _getEntityRelationships(db, entityId) {
  return db.query(`
    SELECT r.*,
           s.name as source_name, s.type as source_type,
           t.name as target_name, t.type as target_type
    FROM relationships r
    JOIN entities s ON r.source_entity_id = s.id
    JOIN entities t ON r.target_entity_id = t.id
    WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
      AND r.invalid_at IS NULL
    ORDER BY r.strength DESC
  `, [entityId, entityId]);
}

/**
 * Fetch aliases for an entity.
 */
function _getEntityAliases(db, entityId) {
  const rows = db.query('SELECT alias FROM entity_aliases WHERE entity_id = ?', [entityId]);
  return rows.map(r => r.alias);
}

// ---------------------------------------------------------------------------
// Entity name wikification cache
// ---------------------------------------------------------------------------

/** Module-level cache for entity names (cleared at start of each sync). */
let _entityNamesCache = null;

function _clearEntityNamesCache() {
  _entityNamesCache = null;
}

function _getEntityNamesCache(db) {
  if (_entityNamesCache) return _entityNamesCache;
  const rows = db.query(
    'SELECT name FROM entities WHERE deleted_at IS NULL ORDER BY LENGTH(name) DESC'
  );
  // Sort by length DESC so longer names match first (e.g., "Sarah Chen" before "Sarah")
  _entityNamesCache = rows.map(r => r.name);
  return _entityNamesCache;
}

/**
 * Wrap known entity names in a narrative with [[wikilinks]].
 * This makes the graph view show session-to-entity connections.
 */
function _wikifyNarrative(db, narrative) {
  if (!narrative) return narrative;

  const names = _getEntityNamesCache(db);
  let result = narrative;
  for (const name of names) {
    if (result.includes(name) && !result.includes(`[[${name}]]`)) {
      // Replace all occurrences that are not already wikilinked
      result = result.split(name).join(`[[${name}]]`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Frontmatter builder
// ---------------------------------------------------------------------------

/**
 * Build YAML frontmatter for an entity note.
 *
 * Includes contact velocity fields, compound tags for graph filtering,
 * and cssclasses for per-type CSS styling in Obsidian.
 */
function _buildFrontmatter(entity, aliases, syncHash = '') {
  const etype = entity.type;
  const lines = ['---'];

  lines.push(`claudia_id: ${entity.id}`);
  lines.push(`type: ${etype}`);
  lines.push(`name: "${entity.name}"`);
  lines.push(`importance: ${entity.importance}`);

  // Contact velocity fields
  const attentionTier = _get(entity, 'attention_tier');
  if (attentionTier) lines.push(`attention_tier: ${attentionTier}`);

  const closeCircle = _get(entity, 'close_circle');
  if (closeCircle) {
    lines.push('close_circle: true');
    const closeReason = _get(entity, 'close_circle_reason');
    if (closeReason) lines.push(`close_circle_reason: "${closeReason}"`);
  }

  const contactTrend = _get(entity, 'contact_trend');
  if (contactTrend) lines.push(`contact_trend: ${contactTrend}`);

  const freq = _get(entity, 'contact_frequency_days');
  if (freq != null) lines.push(`contact_frequency_days: ${freq}`);

  const lastContact = _get(entity, 'last_contact_at');
  if (lastContact) lines.push(`last_contact: ${lastContact.slice(0, 10)}`);

  lines.push(`created: ${entity.created_at}`);
  lines.push(`updated: ${entity.updated_at}`);

  // Aliases as proper YAML list
  if (aliases && aliases.length > 0) {
    lines.push('aliases:');
    for (const alias of aliases) {
      lines.push(`  - "${alias}"`);
    }
  }

  // Compound tags: [type, tier, trend] for graph filtering
  const tags = [etype];
  if (attentionTier && attentionTier !== 'standard') tags.push(attentionTier);
  if (contactTrend) tags.push(contactTrend);
  if (closeCircle) tags.push('close-circle');
  lines.push('tags:');
  for (const tag of tags) {
    lines.push(`  - ${tag}`);
  }

  // CSS classes for per-type styling
  lines.push('cssclasses:');
  lines.push(`  - entity-${etype}`);

  if (syncHash) lines.push(`sync_hash: ${syncHash}`);

  lines.push('---');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Status callout rendering
// ---------------------------------------------------------------------------

/**
 * Render a status callout box at the top of person/project notes.
 *
 * Shows attention tier, trend, last contact, frequency, and importance
 * in a compact Obsidian callout block.
 */
function _renderStatusCallout(db, entity) {
  const etype = entity.type;

  if (etype === 'person') {
    const attention = _get(entity, 'attention_tier');
    const trend = _get(entity, 'contact_trend');
    const lastContact = _get(entity, 'last_contact_at');
    const freq = _get(entity, 'contact_frequency_days');
    const importance = _get(entity, 'importance', 0);

    if (!attention && !trend && !lastContact) return '';

    const partsLine1 = [];
    if (attention) partsLine1.push(`**Attention:** ${attention.charAt(0).toUpperCase() + attention.slice(1)}`);
    if (trend) partsLine1.push(`**Trend:** ${trend.charAt(0).toUpperCase() + trend.slice(1)}`);
    if (lastContact) {
      const dateStr = _formatDate(lastContact);
      partsLine1.push(`**Last Contact:** ${dateStr}`);
    }

    const partsLine2 = [];
    if (freq != null) partsLine2.push(`**Frequency:** Every ~${Math.round(freq)} days`);
    partsLine2.push(`**Importance:** ${importance}`);

    const lines = ['> [!info] Status'];
    lines.push(`> ${partsLine1.join(' | ')}`);
    if (partsLine2.length > 0) lines.push(`> ${partsLine2.join(' | ')}`);
    return lines.join('\n');
  }

  if (etype === 'project') {
    const entityId = entity.id;

    const peopleCount = db.queryOne(`
      SELECT COUNT(DISTINCT e.id) as cnt
      FROM entities e
      JOIN relationships r ON (
        (r.source_entity_id = ? AND r.target_entity_id = e.id) OR
        (r.target_entity_id = ? AND r.source_entity_id = e.id)
      )
      WHERE e.type = 'person' AND e.deleted_at IS NULL AND r.invalid_at IS NULL
    `, [entityId, entityId]);
    const pcount = peopleCount ? peopleCount.cnt : 0;

    const commitmentCount = db.queryOne(`
      SELECT COUNT(*) as cnt FROM memories m
      JOIN memory_entities me ON m.id = me.memory_id
      WHERE me.entity_id = ? AND m.type = 'commitment' AND m.invalidated_at IS NULL
    `, [entityId]);
    const ccount = commitmentCount ? commitmentCount.cnt : 0;

    const lines = ['> [!info] Status'];
    lines.push(`> **People:** ${pcount} connected | **Open Commitments:** ${ccount} | **Importance:** ${entity.importance}`);
    return lines.join('\n');
  }

  return '';
}

// ---------------------------------------------------------------------------
// Relationships section
// ---------------------------------------------------------------------------

/**
 * Render the relationships section as a scannable markdown table.
 */
function _renderRelationshipsSection(entityId, relationships) {
  if (!relationships || relationships.length === 0) return '';

  const lines = ['## Relationships', ''];
  lines.push('| Connection | Type | Strength |');
  lines.push('|------------|------|----------|');

  for (const rel of relationships) {
    const otherName = rel.source_entity_id === entityId ? rel.target_name : rel.source_name;
    lines.push(`| [[${otherName}]] | ${rel.relationship_type} | ${rel.strength} |`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Memories section
// ---------------------------------------------------------------------------

/**
 * Render memories grouped by verification status with Obsidian callouts.
 *
 * Commitments get checkboxes. Other memories are split into verified
 * (note callout) and unverified (warning callout) groups for trust visibility.
 */
function _renderMemoriesSection(memories) {
  if (!memories || memories.length === 0) return '';

  // Group by type
  const byType = {};
  for (const m of memories) {
    const mtype = m.type || 'fact';
    if (!byType[mtype]) byType[mtype] = [];
    byType[mtype].push(m);
  }

  const lines = [];

  // Commitments get special treatment (checkboxes)
  const commitments = byType.commitment || [];
  delete byType.commitment;

  if (commitments.length > 0) {
    lines.push('## Commitments');
    for (const c of commitments) {
      let meta = {};
      if (c.metadata) {
        try { meta = JSON.parse(c.metadata); } catch { /* ignore */ }
      }
      const completed = meta.completed;
      if (completed) {
        lines.push(`- [x] ${c.content} (completed: ${completed})`);
      } else {
        const created = c.created_at || '';
        const detected = created.slice(0, 10);
        lines.push(`- [ ] ${c.content} (detected: ${detected})`);
      }
    }
  }

  // Split remaining memories by verification status
  const verified = [];
  const unverified = [];

  for (const [, mems] of Object.entries(byType)) {
    for (const m of mems) {
      const vstatus = m.verification_status || 'pending';
      const origin = m.origin_type || '';
      const confidence = m.confidence != null ? m.confidence : 1.0;
      const lifecycle = _get(m, 'lifecycle_tier');
      const prefix = lifecycle === 'sacred' ? '[sacred] ' : '';

      const detailParts = [];
      if (origin) detailParts.push(`source: ${origin}`);
      if (confidence != null && confidence < 1.0) detailParts.push(`confidence: ${confidence}`);
      const detail = detailParts.length > 0 ? ` (${detailParts.join(', ')})` : '';
      const entry = `- ${prefix}${m.content}${detail}`;

      if (vstatus === 'verified' || origin === 'user_stated') {
        verified.push(entry);
      } else {
        unverified.push(entry);
      }
    }
  }

  lines.push('');
  lines.push('## Key Facts');

  if (verified.length > 0) {
    lines.push('');
    lines.push('> [!note] Verified');
    for (const entry of verified) {
      lines.push(`> ${entry}`);
    }
  }

  if (unverified.length > 0) {
    lines.push('');
    lines.push('> [!warning] Unverified');
    for (const entry of unverified) {
      lines.push(`> ${entry}`);
    }
  }

  if (verified.length === 0 && unverified.length === 0) {
    lines.push('');
    lines.push('*No facts recorded yet.*');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Recent sessions section
// ---------------------------------------------------------------------------

/**
 * Render recent session mentions as Obsidian callout blocks.
 */
function _renderRecentSessions(db, entityName) {
  const rows = db.query(`
    SELECT id, narrative, started_at
    FROM episodes
    WHERE is_summarized = 1
      AND narrative LIKE ?
    ORDER BY started_at DESC
    LIMIT 10
  `, [`%${entityName}%`]);

  if (rows.length === 0) return '';

  const lines = ['## Recent Interactions'];
  for (const row of rows) {
    const started = row.started_at;
    const dateDisplay = _formatDate(started);
    let narrative = row.narrative || '';
    if (narrative.length > 300) narrative = narrative.slice(0, 300) + '...';

    lines.push('');
    lines.push(`> [!example] ${dateDisplay}`);
    for (const nline of narrative.split('\n')) {
      lines.push(`> ${nline}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Related patterns
// ---------------------------------------------------------------------------

/**
 * Fetch active patterns that reference this entity in their evidence.
 */
function _getRelatedPatterns(db, entityId) {
  try {
    return db.query(`
      SELECT DISTINCT p.id, p.description, p.pattern_type, p.confidence
      FROM patterns p
      WHERE p.is_active = 1
        AND p.evidence LIKE ?
      LIMIT 5
    `, [`%${entityId}%`]);
  } catch {
    return [];
  }
}

/**
 * Render a 'Related Patterns' section with wikilinks to pattern notes.
 */
function _renderRelatedPatterns(patterns) {
  if (!patterns || patterns.length === 0) return '';
  const lines = ['## Related Patterns', ''];
  for (const p of patterns) {
    const ptype = p.pattern_type || 'pattern';
    const confidence = p.confidence || 0.0;
    const pid = p.id;
    const slug = `${ptype}-${String(pid).padStart(3, '0')}`;
    lines.push(
      `- [[${_sanitizeFilename(slug)}]] ` +
      `- *${ptype}* (confidence: ${confidence.toFixed(2)})`
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entity export
// ---------------------------------------------------------------------------

/**
 * Export a single entity as an Obsidian note.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {string} vaultPath - Root vault directory
 * @param {object} entity - Entity row from DB
 * @returns {string|null} Path of the written file, or null on error
 */
function _exportEntity(db, vaultPath, entity) {
  const entityId = entity.id;
  const entityName = entity.name;
  const entityType = entity.type;

  // Determine subdirectory via PARA routing
  const targetDir = _paraDir(vaultPath, entityType, entity);
  _ensureDir(targetDir);

  // Fetch related data
  const memories = _getEntityMemories(db, entityId);
  const relationships = _getEntityRelationships(db, entityId);
  const aliases = _getEntityAliases(db, entityId);

  // Build note body (without frontmatter first, for hash calculation)
  const sections = [];

  // Title
  sections.push(`# ${entityName}`);

  // Description
  const desc = entity.description;
  if (desc) sections.push(`\n${desc}`);

  // Status callout (person/project only)
  const status = _renderStatusCallout(db, entity);
  if (status) sections.push(`\n${status}`);

  // Relationships (table format)
  const relSection = _renderRelationshipsSection(entityId, relationships);
  if (relSection) sections.push(`\n${relSection}`);

  // Memories (verification-grouped callouts)
  const memSection = _renderMemoriesSection(memories);
  if (memSection) sections.push(`\n${memSection}`);

  // Recent session mentions (callout timeline)
  const recent = _renderRecentSessions(db, entityName);
  if (recent) sections.push(`\n${recent}`);

  // Related patterns backlinks
  const relatedPatterns = _getRelatedPatterns(db, entityId);
  if (relatedPatterns.length > 0) {
    sections.push(`\n${_renderRelatedPatterns(relatedPatterns)}`);
  }

  // Sync footer
  const syncTime = _utcStamp();
  sections.push(`\n---\n*Last synced: ${syncTime}*`);

  const body = sections.join('\n');

  // Build frontmatter (includes sync_hash)
  const frontmatter = _buildFrontmatter(entity, aliases, _computeSyncHash(body));
  const fullContent = `${frontmatter}\n\n${body}\n`;

  // Write file
  const filename = _sanitizeFilename(entityName) + '.md';
  const filepath = join(targetDir, filename);
  try {
    writeFileSync(filepath, fullContent, 'utf-8');
    // Validate markdown tables in the exported note
    const tableWarnings = _validateMarkdownTables(fullContent);
    for (const warning of tableWarnings) {
      _log(`${warning} in ${filename}`);
    }
    return filepath;
  } catch (e) {
    _log(`Failed to write entity note ${filepath}: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pattern export
// ---------------------------------------------------------------------------

/**
 * Export active patterns as notes in patterns/ directory.
 * @returns {number} Count of exported patterns
 */
function _exportPatterns(db, vaultPath) {
  const rows = db.query(
    'SELECT * FROM patterns WHERE is_active = 1 ORDER BY last_observed_at DESC'
  );

  let count = 0;
  const targetDir = join(vaultPath, "Claudia's Desk", 'patterns');
  _ensureDir(targetDir);

  for (const row of rows) {
    const patternType = row.pattern_type || 'pattern';
    const description = row.description || '';
    const detectedAt = row.first_observed_at || '';
    const confidence = row.confidence || 0.0;

    const lines = ['---'];
    lines.push(`claudia_id: pattern-${row.id}`);
    lines.push('type: pattern');
    lines.push(`pattern_type: ${patternType}`);
    lines.push(`confidence: ${confidence}`);
    lines.push(`detected: ${detectedAt}`);
    lines.push('tags: [pattern]');
    lines.push('---');
    lines.push('');
    lines.push(`# ${patternType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);
    lines.push('');
    lines.push(description);

    // Include evidence entities if available
    const evidence = row.evidence;
    if (evidence) {
      try {
        const evidenceData = JSON.parse(evidence);
        if (typeof evidenceData === 'object' && evidenceData !== null) {
          const entities = evidenceData.entities || [];
          if (entities.length > 0) {
            lines.push('');
            lines.push('## Related Entities');
            for (const entName of entities) {
              lines.push(`- [[${entName}]]`);
            }
          }
          // Also try entity_ids for typed wikilinks
          const entityIds = evidenceData.entity_ids || [];
          if (entityIds.length > 0 && entities.length === 0) {
            const entLinks = [];
            for (const eid of entityIds.slice(0, 5)) {
              const entRow = db.queryOne(
                'SELECT name FROM entities WHERE id = ? AND deleted_at IS NULL',
                [eid]
              );
              if (entRow) entLinks.push(`[[${entRow.name}]]`);
            }
            if (entLinks.length > 0) {
              lines.push('');
              lines.push('## Related Entities');
              for (const link of entLinks) {
                lines.push(`- ${link}`);
              }
            }
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    const content = lines.join('\n') + '\n';
    const slug = `${patternType}-${String(row.id).padStart(3, '0')}`;
    const filepath = join(targetDir, `${_sanitizeFilename(slug)}.md`);
    try {
      writeFileSync(filepath, content, 'utf-8');
      count++;
    } catch (e) {
      _log(`Failed to write pattern note ${filepath}: ${e.message}`);
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Reflection export
// ---------------------------------------------------------------------------

/**
 * Export reflections as notes in reflections/ directory.
 * @returns {number} Count of exported reflections
 */
function _exportReflections(db, vaultPath) {
  const rows = db.query(
    'SELECT * FROM reflections ORDER BY last_confirmed_at DESC'
  );

  let count = 0;
  const targetDir = join(vaultPath, "Claudia's Desk", 'reflections');
  _ensureDir(targetDir);

  for (const row of rows) {
    const refType = row.reflection_type || 'observation';
    const content = row.content || '';
    const importance = row.importance || 0.5;
    const confidence = row.confidence || 1.0;
    const firstObserved = row.first_observed_at || '';
    const lastConfirmed = row.last_confirmed_at || '';
    const aggCount = row.aggregation_count || 1;

    const lines = ['---'];
    lines.push(`claudia_id: reflection-${row.id}`);
    lines.push('type: reflection');
    lines.push(`reflection_type: ${refType}`);
    lines.push(`importance: ${importance}`);
    lines.push(`confidence: ${confidence}`);
    lines.push(`first_observed: ${firstObserved}`);
    lines.push(`last_confirmed: ${lastConfirmed}`);
    lines.push(`times_confirmed: ${aggCount}`);
    lines.push('tags: [reflection]');
    lines.push('---');
    lines.push('');
    lines.push(`# ${refType.charAt(0).toUpperCase() + refType.slice(1)}`);
    lines.push('');
    lines.push(content);

    const fullContent = lines.join('\n') + '\n';
    const slug = `${refType}-${String(row.id).padStart(3, '0')}`;
    const filepath = join(targetDir, `${_sanitizeFilename(slug)}.md`);
    try {
      writeFileSync(filepath, fullContent, 'utf-8');
      count++;
    } catch (e) {
      _log(`Failed to write reflection note ${filepath}: ${e.message}`);
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Session log export
// ---------------------------------------------------------------------------

/**
 * Export session episodes as daily notes in hierarchical sessions/ directory.
 *
 * Groups episodes by date. Uses sessions/YYYY/MM/YYYY-MM-DD.md path
 * structure to prevent flat folder with hundreds of files.
 * Narratives are wikified to create graph connections.
 *
 * @returns {number} Count of exported session days
 */
function _exportSessions(db, vaultPath, since = null) {
  let sql = `
    SELECT id, session_id, narrative, started_at, ended_at,
           key_topics, summary
    FROM episodes
    WHERE is_summarized = 1
  `;
  const params = [];
  if (since) {
    sql += ' AND started_at > ?';
    params.push(since);
  }
  sql += ' ORDER BY started_at DESC';

  const rows = db.query(sql, params);
  if (rows.length === 0) return 0;

  // Group by date
  const byDate = {};
  for (const row of rows) {
    const started = row.started_at;
    const dateStr = started ? started.slice(0, 10) : 'unknown';
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr].push(row);
  }

  let count = 0;
  const deskSessions = join(vaultPath, "Claudia's Desk", 'sessions');

  for (const [dateStr, episodes] of Object.entries(byDate)) {
    const lines = ['---'];
    lines.push('type: session-log');
    lines.push(`date: ${dateStr}`);
    lines.push(`session_count: ${episodes.length}`);
    lines.push('tags:');
    lines.push('  - session');
    lines.push('---');
    lines.push('');
    lines.push(`# Sessions: ${dateStr}`);

    for (const ep of episodes) {
      const started = ep.started_at || '?';
      lines.push('');
      lines.push(`## Session at ${started}`);

      const rawTopics = ep.key_topics;
      if (rawTopics) {
        try {
          const topics = JSON.parse(rawTopics);
          if (Array.isArray(topics) && topics.length > 0) {
            lines.push(`**Topics:** ${topics.join(', ')}`);
          }
        } catch {
          // Ignore
        }
      }

      let narrative = ep.narrative || ep.summary || '';
      if (narrative) {
        narrative = _wikifyNarrative(db, narrative);
        lines.push('');
        lines.push(narrative);
      }
    }

    const content = lines.join('\n') + '\n';

    // Hierarchical path: Claudia's Desk/sessions/YYYY/MM/YYYY-MM-DD.md
    let targetDir;
    if (dateStr !== 'unknown' && dateStr.length >= 7) {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(5, 7);
      targetDir = join(deskSessions, year, month);
    } else {
      targetDir = deskSessions;
    }
    _ensureDir(targetDir);

    const filepath = join(targetDir, `${dateStr}.md`);
    try {
      writeFileSync(filepath, content, 'utf-8');
      count++;
    } catch (e) {
      _log(`Failed to write session note ${filepath}: ${e.message}`);
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Dataview query templates
// ---------------------------------------------------------------------------

/**
 * Generate starter Dataview query notes in _queries/.
 *
 * Created once and never overwritten (user may customize).
 * @returns {number} Count of templates created
 */
function _exportDataviewTemplates(vaultPath) {
  const queriesDir = join(vaultPath, "Claudia's Desk", '_queries');
  _ensureDir(queriesDir);
  let created = 0;

  const dvTip = '> [!tip] This query requires the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin.\n';

  const templates = {
    'Upcoming Deadlines.md':
      '# Upcoming Deadlines\n\n' +
      'Commitments sorted by deadline date.\n\n' +
      '```dataview\n' +
      'TABLE type, importance\n' +
      'FROM "Active" OR "Relationships" OR "Archive"\n' +
      'WHERE contains(file.content, "- [ ]")\n' +
      'SORT importance DESC\n' +
      '```\n\n' + dvTip,

    'Cooling Relationships.md':
      '# Cooling Relationships\n\n' +
      'People with decelerating or dormant contact trends.\n\n' +
      '```dataview\n' +
      'TABLE contact_trend, last_contact, importance\n' +
      'FROM "Relationships/people" OR "Archive/people"\n' +
      'WHERE contact_trend = "decelerating" OR contact_trend = "dormant"\n' +
      'SORT last_contact ASC\n' +
      '```\n\n' + dvTip,

    'Active Network.md':
      '# Active Network\n\n' +
      'People in the active attention tier.\n\n' +
      '```dataview\n' +
      'TABLE contact_trend, last_contact, contact_frequency_days, importance\n' +
      'FROM "Relationships/people"\n' +
      'WHERE attention_tier = "active"\n' +
      'SORT importance DESC\n' +
      '```\n\n' + dvTip,

    'Recent Memories.md':
      '# Recent Memories\n\n' +
      'What Claudia learned this week.\n\n' +
      '```dataview\n' +
      'TABLE type, importance, created\n' +
      'FROM "Active" OR "Relationships" OR "Reference"\n' +
      'WHERE date(created) >= date(today) - dur(7 days)\n' +
      'SORT created DESC\n' +
      'LIMIT 50\n' +
      '```\n\n' + dvTip,

    'Open Commitments.md':
      '# Open Commitments\n\n' +
      'All tracked commitments across entities.\n\n' +
      '```dataview\n' +
      'TASK\n' +
      'FROM "Active" OR "Relationships"\n' +
      'WHERE !completed\n' +
      'SORT file.name ASC\n' +
      '```\n\n' + dvTip,

    'Entity Overview.md':
      '# Entity Overview\n\n' +
      'All entities grouped by type and sorted by importance.\n\n' +
      '```dataview\n' +
      'TABLE type, attention_tier, contact_trend, importance\n' +
      'FROM "Active" OR "Relationships" OR "Reference" OR "Archive"\n' +
      'SORT type ASC, importance DESC\n' +
      '```\n\n' + dvTip,

    'Session Log.md':
      '# Session Log\n\n' +
      'Recent conversation sessions.\n\n' +
      '```dataview\n' +
      'TABLE date, session_count\n' +
      "FROM \"Claudia's Desk/sessions\"\n" +
      'SORT date DESC\n' +
      'LIMIT 30\n' +
      '```\n\n' + dvTip,
  };

  for (const [filename, content] of Object.entries(templates)) {
    const filepath = join(queriesDir, filename);
    if (!existsSync(filepath)) {
      try {
        writeFileSync(filepath, content, 'utf-8');
        created++;
      } catch (e) {
        _log(`Failed to write Dataview template ${filepath}: ${e.message}`);
      }
    }
  }

  if (created > 0) {
    _log(`Created ${created} Dataview query templates in Claudia's Desk/_queries/`);
  }
  return created;
}

// ---------------------------------------------------------------------------
// Home dashboard
// ---------------------------------------------------------------------------

/**
 * Generate Home.md as a PARA-style navigation dashboard.
 *
 * Written to vault root (not Claudia's Desk) since it's the
 * human-facing entry point. Always regenerated on sync.
 */
function _exportHomeDashboard(db, vaultPath) {
  const lines = ['# Home', ''];

  // Active Projects section
  const activeProjects = db.query(`
    SELECT name, attention_tier, importance
    FROM entities
    WHERE type = 'project' AND deleted_at IS NULL
      AND (attention_tier IN ('active', 'watchlist') OR attention_tier IS NULL)
      AND COALESCE(contact_trend, '') != 'dormant'
    ORDER BY importance DESC
    LIMIT 15
  `);

  lines.push('## Active Projects');
  if (activeProjects.length > 0) {
    lines.push('');
    for (const p of activeProjects) {
      const tier = p.attention_tier || 'standard';
      lines.push(`- [[${p.name}]] (${tier})`);
    }
  } else {
    lines.push('');
    lines.push('*No active projects yet.*');
  }

  // Relationships
  const pcRow = db.queryOne(
    "SELECT COUNT(*) as c FROM entities WHERE type = 'person' AND deleted_at IS NULL"
  );
  const ocRow = db.queryOne(
    "SELECT COUNT(*) as c FROM entities WHERE type = 'organization' AND deleted_at IS NULL"
  );
  const pc = pcRow ? pcRow.c : 0;
  const oc = ocRow ? ocRow.c : 0;

  lines.push('');
  lines.push('## Relationships');
  lines.push('');
  lines.push(`- [[Relationships/people/|People]] (${pc} tracked)`);
  lines.push(`- [[Relationships/organizations/|Organizations]] (${oc} tracked)`);

  // Needs attention
  const watchlist = db.query(`
    SELECT name, contact_trend, last_contact_at
    FROM entities
    WHERE deleted_at IS NULL
      AND type = 'person'
      AND (attention_tier = 'watchlist'
           OR contact_trend IN ('decelerating', 'dormant'))
      AND importance > 0.3
    ORDER BY last_contact_at ASC NULLS FIRST
    LIMIT 8
  `);

  if (watchlist.length > 0) {
    lines.push('');
    lines.push('### Needs Attention');
    lines.push('');
    for (const w of watchlist) {
      const trend = w.contact_trend || 'watch';
      const days = _daysAgo(w.last_contact_at);
      if (days != null) {
        lines.push(`- [[${w.name}]] - ${trend} (${days}d)`);
      } else {
        lines.push(`- [[${w.name}]] - ${trend}`);
      }
    }
  }

  // Quick Links
  lines.push('');
  lines.push('## Quick Links');
  lines.push('');
  lines.push("- [[Claudia's Desk/MOC-Commitments|Open Commitments]]");
  lines.push("- [[Claudia's Desk/MOC-People|Relationship Map]]");
  lines.push("- [[Claudia's Desk/MOC-Projects|Project Overview]]");
  lines.push('- [[Reference/|Reference Materials]]');
  lines.push('- [[Archive/|Archive]]');

  // Recent activity
  const recentSessions = db.query(`
    SELECT started_at, narrative FROM episodes
    WHERE is_summarized = 1 AND narrative IS NOT NULL
    ORDER BY started_at DESC LIMIT 5
  `);

  if (recentSessions.length > 0) {
    lines.push('');
    lines.push('## Recent Activity');
    lines.push('');
    lines.push('| Date | Summary |');
    lines.push('|------|---------|');
    for (const s of recentSessions) {
      const date = s.started_at ? s.started_at.slice(0, 10) : '?';
      let narrative = s.narrative || '';
      if (narrative.length > 80) narrative = narrative.slice(0, 80) + '...';
      narrative = _wikifyNarrative(db, narrative);
      lines.push(`| ${date} | ${narrative} |`);
    }
  }

  // Footer
  const syncTime = _utcStamp();
  lines.push(`\n---\n*Last synced: ${syncTime}*`);

  const content = lines.join('\n') + '\n';
  const filepath = join(vaultPath, 'Home.md');
  writeFileSync(filepath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// MOC indices (_Index.md per PARA directory)
// ---------------------------------------------------------------------------

/**
 * Generate _Index.md files in PARA entity directories.
 *
 * Creates indices in Relationships/people/, Relationships/organizations/,
 * Active/, Reference/concepts/, Reference/locations/ with tables
 * grouped by attention_tier for quick overview.
 */
function _exportMocIndices(db, vaultPath) {
  for (const [paraPath, [etype, title]] of Object.entries(PARA_INDICES)) {
    // Exclude archived/dormant entities (those go to Archive/)
    const entities = db.query(`
      SELECT name, importance, attention_tier, contact_trend, last_contact_at
      FROM entities
      WHERE type = ? AND deleted_at IS NULL
        AND COALESCE(attention_tier, 'standard') != 'archive'
        AND COALESCE(contact_trend, '') != 'dormant'
      ORDER BY importance DESC
    `, [etype]);

    const lines = ['---'];
    lines.push('tags:');
    lines.push('  - moc');
    lines.push('cssclasses:');
    lines.push('  - moc-index');
    lines.push('---');
    lines.push('');
    lines.push(`# ${title}`);

    if (entities.length === 0) {
      lines.push('');
      lines.push(`*No ${etype} entities tracked yet.*`);
    } else {
      // Group by attention tier
      const tiers = {};
      for (const e of entities) {
        const tier = e.attention_tier || 'standard';
        if (!tiers[tier]) tiers[tier] = [];
        tiers[tier].push(e);
      }

      const tierOrder = ['active', 'watchlist', 'standard'];
      for (const tier of tierOrder) {
        const tierEntities = tiers[tier];
        if (!tierEntities || tierEntities.length === 0) continue;
        delete tiers[tier];

        lines.push('');
        lines.push(`## ${tier.charAt(0).toUpperCase() + tier.slice(1)}`);
        lines.push('');

        if (etype === 'person') {
          lines.push('| Name | Trend | Last Contact | Importance |');
          lines.push('|------|-------|-------------|-----------|');
          for (const e of tierEntities) {
            const trend = e.contact_trend || '-';
            const last = e.last_contact_at ? e.last_contact_at.slice(0, 10) : '-';
            lines.push(`| [[${e.name}]] | ${trend} | ${last} | ${e.importance} |`);
          }
        } else {
          lines.push('| Name | Importance |');
          lines.push('|------|-----------|');
          for (const e of tierEntities) {
            lines.push(`| [[${e.name}]] | ${e.importance} |`);
          }
        }
      }

      // Any remaining tiers
      for (const [tier, tierEntities] of Object.entries(tiers)) {
        lines.push('');
        lines.push(`## ${tier.charAt(0).toUpperCase() + tier.slice(1)}`);
        lines.push('');
        lines.push('| Name | Importance |');
        lines.push('|------|-----------|');
        for (const e of tierEntities) {
          lines.push(`| [[${e.name}]] | ${e.importance} |`);
        }
      }
    }

    const content = lines.join('\n') + '\n';
    const targetDir = join(vaultPath, paraPath);
    _ensureDir(targetDir);
    writeFileSync(join(targetDir, '_Index.md'), content, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Obsidian config
// ---------------------------------------------------------------------------

/**
 * Create .obsidian/ configuration files for graph colors, CSS, and workspace.
 *
 * Idempotent: only writes files that don't already exist, so user
 * customizations in .obsidian/ are never overwritten.
 */
function _exportObsidianConfig(vaultPath) {
  const obsidianDir = join(vaultPath, '.obsidian');
  _ensureDir(obsidianDir);

  // graph.json -- Color groups by entity type tag
  const graphPath = join(obsidianDir, 'graph.json');
  if (!existsSync(graphPath)) {
    const graphConfig = {
      'collapse-filter': false,
      search: '',
      showTags: false,
      showAttachments: false,
      hideUnresolved: true,
      showOrphan: false,
      'collapse-color-groups': false,
      colorGroups: [
        { query: 'tag:#person', color: { a: 1, rgb: 5025616 } },       // green
        { query: 'tag:#project', color: { a: 1, rgb: 14701138 } },     // red
        { query: 'tag:#organization', color: { a: 1, rgb: 11141375 } },// purple
        { query: 'tag:#concept', color: { a: 1, rgb: 65535 } },        // cyan
        { query: 'tag:#session', color: { a: 1, rgb: 10066329 } },     // gray
        { query: 'tag:#pattern', color: { a: 1, rgb: 16744448 } },     // orange
        { query: 'tag:#moc', color: { a: 1, rgb: 16776960 } },         // yellow
      ],
      'collapse-display': false,
      showArrow: true,
      textFadeMultiplier: -3,
      nodeSizeMultiplier: 1,
      lineSizeMultiplier: 1,
      'collapse-forces': false,
      centerStrength: 0.5,
      repelStrength: 10,
      linkStrength: 1,
      linkDistance: 250,
      scale: 1,
      close: false,
    };
    writeFileSync(graphPath, JSON.stringify(graphConfig, null, 2), 'utf-8');
  }

  // snippets/claudia-theme.css -- Visual identity
  const snippetsDir = join(obsidianDir, 'snippets');
  _ensureDir(snippetsDir);
  const cssPath = join(snippetsDir, 'claudia-theme.css');
  if (!existsSync(cssPath)) {
    const cssContent = `/* Claudia Vault Theme */

/* Entity type emoji prefixes in Reading View */
.entity-person .inline-title::before { content: "\\01F464 "; }
.entity-project .inline-title::before { content: "\\01F4C1 "; }
.entity-organization .inline-title::before { content: "\\01F3E2 "; }
.entity-concept .inline-title::before { content: "\\01F4A1 "; }
.entity-location .inline-title::before { content: "\\01F4CD "; }

/* Tag color pills matching graph colors */
.tag[href="#person"] { background-color: #4CAF50; color: white; }
.tag[href="#project"] { background-color: #E05252; color: white; }
.tag[href="#organization"] { background-color: #AA00FF; color: white; }
.tag[href="#concept"] { background-color: #00BCD4; color: white; }
.tag[href="#session"] { background-color: #999999; color: white; }
.tag[href="#pattern"] { background-color: #FF9800; color: white; }
.tag[href="#moc"] { background-color: #FFEB3B; color: #333; }
.tag[href="#active"] { background-color: #4CAF50; color: white; }
.tag[href="#watchlist"] { background-color: #FF9800; color: white; }
.tag[href="#dormant"] { background-color: #999999; color: white; }
.tag[href="#decelerating"] { background-color: #E05252; color: white; }

/* MOC index styling */
.moc-index h1 { text-align: center; font-size: 2em; }

/* Compact frontmatter panel */
.metadata-container { font-size: 0.85em; }
`;
    writeFileSync(cssPath, cssContent, 'utf-8');
  }

  // app.json -- Enable CSS snippets, readable line length, show frontmatter
  const appPath = join(obsidianDir, 'app.json');
  if (!existsSync(appPath)) {
    writeFileSync(appPath, JSON.stringify({
      readableLineLength: true,
      showFrontmatter: true,
      livePreview: true,
    }, null, 2), 'utf-8');
  }

  // appearance.json -- Enable the CSS snippet
  const appearancePath = join(obsidianDir, 'appearance.json');
  if (!existsSync(appearancePath)) {
    writeFileSync(appearancePath, JSON.stringify({
      enabledCssSnippets: ['claudia-theme'],
    }, null, 2), 'utf-8');
  }

  // workspace.json -- Open Home.md on first launch with graph in right sidebar
  const workspacePath = join(obsidianDir, 'workspace.json');
  if (!existsSync(workspacePath)) {
    const workspaceConfig = {
      main: {
        id: 'main',
        type: 'split',
        children: [
          {
            id: 'editor',
            type: 'tabs',
            children: [
              {
                id: 'home-tab',
                type: 'leaf',
                state: {
                  type: 'markdown',
                  state: {
                    file: 'Home.md',
                    mode: 'preview',
                  },
                },
              },
            ],
          },
        ],
        direction: 'horizontal',
      },
      active: 'home-tab',
    };
    writeFileSync(workspacePath, JSON.stringify(workspaceConfig, null, 2), 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// MOC generators (Claudia's Desk)
// ---------------------------------------------------------------------------

/**
 * Generate MOC-People.md -- relationship health map for Claudia's read layer.
 *
 * Pre-computed markdown Claudia can read instead of calling memory.graph op=network.
 * Organized by attention tier for quick scanning.
 */
function _generateMocPeople(db) {
  const timestamp = _utcStamp();
  const lines = ['# People \u2014 Health Map', '', `> Last updated: ${timestamp}`, ''];

  const people = db.query(`
    SELECT id, name, attention_tier, contact_trend, last_contact_at
    FROM entities
    WHERE type = 'person' AND deleted_at IS NULL AND importance > 0.05
    ORDER BY importance DESC
  `);

  if (people.length === 0) {
    lines.push('*No people tracked yet.*');
    lines.push(`\n---\n*Last updated: ${timestamp}*`);
    return lines.join('\n');
  }

  // Group by tier
  const tiers = { active: [], watchlist: [], standard: [], archive: [] };
  for (const p of people) {
    let tier = (p.attention_tier || 'standard').toLowerCase();
    if (!tiers[tier]) tier = 'standard';
    tiers[tier].push(p);
  }

  const tierConfig = [
    ['active', '\uD83D\uDD34 Active (needs attention now)'],
    ['watchlist', '\uD83D\uDFE1 Watchlist (declining attention)'],
    ['standard', '\u26AA Standard'],
    ['archive', '\uD83D\uDD35 Archive (dormant 90+ days)'],
  ];

  for (const [tierKey, tierHeading] of tierConfig) {
    const tierPeople = tiers[tierKey] || [];
    if (tierPeople.length === 0) continue;

    lines.push(`## ${tierHeading}`);
    lines.push('');
    lines.push('| Name | Last Contact | Trend | Open Commitments |');
    lines.push('|------|-------------|-------|-----------------|');

    for (const p of tierPeople) {
      const days = _daysAgo(p.last_contact_at);
      const lastStr = days != null ? `${days}d ago` : (p.last_contact_at ? p.last_contact_at.slice(0, 10) : '-');
      const trend = p.contact_trend || '-';

      const commRow = db.queryOne(`
        SELECT COUNT(*) as cnt FROM memories m
        JOIN memory_entities me ON m.id = me.memory_id
        WHERE me.entity_id = ? AND m.type = 'commitment' AND m.invalidated_at IS NULL
      `, [p.id]);
      const commCount = commRow ? commRow.cnt : 0;

      lines.push(
        `| [[people/${_sanitizeFilename(p.name)}]] | ${lastStr} | ${trend} | ${commCount} |`
      );
    }

    lines.push('');
  }

  lines.push(`---\n*Last updated: ${timestamp}*`);
  return lines.join('\n');
}

/**
 * Generate MOC-Commitments.md -- open commitments overview for Claudia's read layer.
 *
 * Organized by urgency: overdue, due this week, open, recently completed.
 */
function _generateMocCommitments(db) {
  const timestamp = _utcStamp();
  const lines = ['# Open Commitments', '', `> Last updated: ${timestamp}`, ''];

  function _getCommitments(sql, params = []) {
    const rows = db.query(sql, params);
    const result = [];
    for (const row of rows) {
      const entRows = db.query(`
        SELECT e.name, e.type FROM entities e
        JOIN memory_entities me ON e.id = me.entity_id
        WHERE me.memory_id = ? AND e.deleted_at IS NULL
        LIMIT 3
      `, [row.id]);
      result.push([row, entRows]);
    }
    return result;
  }

  // Overdue
  const overdue = _getCommitments(`
    SELECT id, content, deadline_at FROM memories
    WHERE type = 'commitment' AND invalidated_at IS NULL
      AND deadline_at IS NOT NULL AND deadline_at < datetime('now')
    ORDER BY deadline_at ASC LIMIT 20
  `);
  if (overdue.length > 0) {
    lines.push('## \u26A0\uFE0F Overdue');
    lines.push('');
    lines.push('| Commitment | Person/Project | Deadline |');
    lines.push('|------------|---------------|---------|');
    for (const [row, entities] of overdue) {
      const content = row.content.length > 80 ? row.content.slice(0, 80) + '...' : row.content;
      const entLinks = entities.length > 0
        ? entities.map(e =>
          `[[${ENTITY_TYPE_DIRS[e.type] || 'concepts'}/${_sanitizeFilename(e.name)}]]`
        ).join(', ')
        : '-';
      const deadline = row.deadline_at ? row.deadline_at.slice(0, 10) : '-';
      lines.push(`| ${content} | ${entLinks} | ${deadline} |`);
    }
    lines.push('');
  }

  // Due this week
  const dueWeek = _getCommitments(`
    SELECT id, content, deadline_at FROM memories
    WHERE type = 'commitment' AND invalidated_at IS NULL
      AND deadline_at BETWEEN datetime('now') AND datetime('now', '+7 days')
    ORDER BY deadline_at ASC LIMIT 20
  `);
  if (dueWeek.length > 0) {
    lines.push('## \uD83D\uDCC5 Due This Week');
    lines.push('');
    lines.push('| Commitment | Person/Project | Deadline |');
    lines.push('|------------|---------------|---------|');
    for (const [row, entities] of dueWeek) {
      const content = row.content.length > 80 ? row.content.slice(0, 80) + '...' : row.content;
      const entLinks = entities.length > 0
        ? entities.map(e =>
          `[[${ENTITY_TYPE_DIRS[e.type] || 'concepts'}/${_sanitizeFilename(e.name)}]]`
        ).join(', ')
        : '-';
      const deadline = row.deadline_at ? row.deadline_at.slice(0, 10) : '-';
      lines.push(`| ${content} | ${entLinks} | ${deadline} |`);
    }
    lines.push('');
  }

  // Open (no deadline)
  const openNd = _getCommitments(`
    SELECT id, content, deadline_at FROM memories
    WHERE type = 'commitment' AND invalidated_at IS NULL
      AND (deadline_at IS NULL OR deadline_at > datetime('now', '+7 days'))
    ORDER BY importance DESC LIMIT 30
  `);
  if (openNd.length > 0) {
    lines.push('## \uD83D\uDD04 Open (no deadline)');
    lines.push('');
    for (const [row, entities] of openNd) {
      const content = row.content.length > 80 ? row.content.slice(0, 80) + '...' : row.content;
      const entLinks = entities.map(e =>
        `[[${ENTITY_TYPE_DIRS[e.type] || 'concepts'}/${_sanitizeFilename(e.name)}]]`
      ).join(' ');
      const suffix = entLinks ? ` (${entLinks})` : '';
      lines.push(`- [ ] ${content}${suffix}`);
    }
    lines.push('');
  }

  // Recently completed
  const completed = _getCommitments(`
    SELECT id, content, invalidated_at as deadline_at FROM memories
    WHERE type = 'commitment' AND invalidated_at IS NOT NULL
      AND invalidated_at > datetime('now', '-7 days')
    ORDER BY invalidated_at DESC LIMIT 10
  `);
  if (completed.length > 0) {
    lines.push('## \u2705 Recently Completed (last 7 days)');
    lines.push('');
    for (const [row] of completed) {
      const content = row.content.length > 80 ? row.content.slice(0, 80) + '...' : row.content;
      lines.push(`- [x] ${content}`);
    }
    lines.push('');
  }

  if (overdue.length === 0 && dueWeek.length === 0 && openNd.length === 0) {
    lines.push('*No open commitments tracked.*');
    lines.push('');
  }

  lines.push(`---\n*Last updated: ${timestamp}*`);
  return lines.join('\n');
}

/**
 * Generate MOC-Projects.md -- project status overview for Claudia's read layer.
 */
function _generateMocProjects(db) {
  const timestamp = _utcStamp();
  const lines = ['# Projects Overview', '', `> Last updated: ${timestamp}`, ''];

  const projects = db.query(`
    SELECT id, name, importance, attention_tier, updated_at
    FROM entities
    WHERE type = 'project' AND deleted_at IS NULL
    ORDER BY importance DESC
  `);

  if (projects.length === 0) {
    lines.push('*No projects tracked yet.*');
    lines.push(`\n---\n*Last updated: ${timestamp}*`);
    return lines.join('\n');
  }

  // Group by tier
  const tiers = { active: [], standard: [], archive: [] };
  for (const p of projects) {
    let tier = (p.attention_tier || 'standard').toLowerCase();
    if (!tiers[tier]) tier = 'standard';
    tiers[tier].push(p);
  }

  const tierConfig = [
    ['active', '## Active Projects'],
    ['standard', '## Standard Projects'],
    ['archive', '## Archive'],
  ];

  for (const [tierKey, tierHeading] of tierConfig) {
    const tierProjects = tiers[tierKey] || [];
    if (tierProjects.length === 0) continue;

    lines.push(tierHeading);
    lines.push('');
    lines.push('| Name | Connected People | Open Commitments | Importance |');
    lines.push('|------|-----------------|-----------------|-----------|');

    for (const p of tierProjects) {
      const peopleRow = db.queryOne(`
        SELECT COUNT(DISTINCT e.id) as cnt
        FROM entities e
        JOIN relationships r ON (
          (r.source_entity_id = ? AND r.target_entity_id = e.id) OR
          (r.target_entity_id = ? AND r.source_entity_id = e.id)
        )
        WHERE e.type = 'person' AND e.deleted_at IS NULL AND r.invalid_at IS NULL
      `, [p.id, p.id]);
      const peopleCount = peopleRow ? peopleRow.cnt : 0;

      const commRow = db.queryOne(`
        SELECT COUNT(*) as cnt FROM memories m
        JOIN memory_entities me ON m.id = me.memory_id
        WHERE me.entity_id = ? AND m.type = 'commitment' AND m.invalidated_at IS NULL
      `, [p.id]);
      const commCount = commRow ? commRow.cnt : 0;

      lines.push(
        `| [[projects/${_sanitizeFilename(p.name)}]] | ${peopleCount} | ${commCount} | ${p.importance} |`
      );
    }

    lines.push('');
  }

  lines.push(`---\n*Last updated: ${timestamp}*`);
  return lines.join('\n');
}

/**
 * Write a MOC file to Claudia's Desk.
 */
function _writeMocFile(vaultPath, filename, content) {
  const mocDir = join(vaultPath, "Claudia's Desk");
  _ensureDir(mocDir);
  const filepath = join(mocDir, filename);
  try {
    writeFileSync(filepath, content, 'utf-8');
  } catch (e) {
    _log(`Failed to write MOC file ${filepath}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Frontmatter parsing (for bidirectional sync)
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a markdown file.
 *
 * Returns [frontmatterDict, bodyText].
 * Returns [null, rawContent] if no frontmatter found.
 *
 * Uses a simple key-value parser (no YAML dependency).
 */
function _parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return [null, raw];

  const parts = raw.split('---');
  // After split on '---', parts[0] is empty, parts[1] is frontmatter, parts[2+] is body
  if (parts.length < 3) return [null, raw];

  const fmText = parts[1].trim();
  const body = parts.slice(2).join('---').trim();

  // Simple key-value parsing (handles most common frontmatter cases)
  const fm = {};
  for (const line of fmText.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    // Skip list items (lines starting with ' -')
    if (line.trimStart().startsWith('-')) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) fm[key] = value;
  }

  return [fm, body];
}

// ---------------------------------------------------------------------------
// Bidirectional sync (import user edits)
// ---------------------------------------------------------------------------

/**
 * Detect notes that users have edited in the vault.
 *
 * Walks all .md files in entity directories, compares content hash to
 * sync_hash in frontmatter.
 *
 * @param {string} vaultPath
 * @returns {object[]} List of edits with file path, entity ID, and change info
 */
function _detectUserEdits(vaultPath) {
  const edits = [];

  for (const subdir of ENTITY_SUBDIRS) {
    const d = join(vaultPath, subdir);
    if (!existsSync(d)) continue;

    const files = _listMdFiles(d);
    for (const filename of files) {
      const filepath = join(d, filename);
      try {
        const raw = readFileSync(filepath, 'utf-8');
        const [fm, body] = _parseFrontmatter(raw);
        if (!fm || !fm.sync_hash) continue;

        const currentHash = _computeSyncHash(body);
        if (currentHash !== fm.sync_hash) {
          edits.push({
            file_path: filepath,
            entity_id: fm.claudia_id ? Number(fm.claudia_id) : null,
            entity_type: fm.type || null,
            old_hash: fm.sync_hash,
            new_hash: currentHash,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return edits;
}

/**
 * Import user edits from a single vault note back into SQLite.
 *
 * Human edits always win: all changes use origin_type='user_stated'
 * and confidence=1.0.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {string} vaultPath - Root vault directory
 * @param {string} filePath - Path to the edited vault note
 * @returns {object} Summary of changes applied
 */
function _importVaultEdit(db, vaultPath, filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const [fm, body] = _parseFrontmatter(raw);

  if (!fm || !fm.claudia_id) {
    return { error: 'No claudia_id in frontmatter', file: filePath };
  }

  const entityId = Number(fm.claudia_id);
  const changes = {
    entity_id: entityId,
    facts_added: 0,
    facts_updated: 0,
    commitments_completed: 0,
    description_updated: false,
  };

  // Get current entity from DB
  const entity = db.queryOne('SELECT * FROM entities WHERE id = ? AND deleted_at IS NULL', [entityId]);
  if (!entity) {
    return { error: `Entity ${entityId} not found`, file: filePath };
  }

  const entityName = entity.name;

  // Parse body sections
  const bodyLines = body.trim().split('\n');

  // Extract description (text after title, before first ## heading)
  const descLines = [];
  let inDesc = false;
  for (const line of bodyLines) {
    if (line.startsWith('# ')) {
      inDesc = true;
      continue;
    }
    if (line.startsWith('## ')) break;
    if (inDesc && line.trim()) {
      descLines.push(line.trim());
    }
  }

  const newDesc = descLines.join(' ').trim() || null;
  if (newDesc && newDesc !== (entity.description || '')) {
    db.update('entities', {
      description: newDesc,
      updated_at: _nowISO(),
    }, 'id = ?', [entityId]);
    changes.description_updated = true;
  }

  // Parse commitment checkboxes and key facts
  let currentSection = null;
  for (const line of bodyLines) {
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim().toLowerCase();
      continue;
    }

    if (currentSection === 'commitments') {
      // Check for completed checkboxes: - [x]
      const completedMatch = line.match(/^-\s*\[x\]\s*(.+?)(?:\s*\(.*\))?\s*$/i);
      if (completedMatch) {
        const commitContent = completedMatch[1].trim();
        // Find matching commitment in DB
        const mem = db.queryOne(`
          SELECT m.id FROM memories m
          JOIN memory_entities me ON m.id = me.memory_id
          WHERE me.entity_id = ? AND m.type = 'commitment'
            AND m.content LIKE ? AND m.invalidated_at IS NULL
          LIMIT 1
        `, [entityId, `%${commitContent.slice(0, 40)}%`]);

        if (mem) {
          db.update('memories', {
            invalidated_at: _nowISO(),
            invalidated_reason: 'completed (marked in vault)',
          }, 'id = ?', [mem.id]);
          changes.commitments_completed++;
        }
      }
    } else if (['key facts', 'preferences', 'observations', 'learnings'].includes(currentSection)) {
      // Check for new bullets
      const bulletMatch = line.match(/^-\s+(.+?)(?:\s*\(.*\))?\s*$/);
      if (bulletMatch) {
        const factContent = bulletMatch[1].trim();
        if (!factContent) continue;

        // Check if this fact already exists
        const factHash = contentHash(factContent);
        const existing = db.queryOne(
          'SELECT id FROM memories WHERE content_hash = ?',
          [factHash]
        );

        if (!existing) {
          const typeMap = {
            'key facts': 'fact',
            preferences: 'preference',
            observations: 'observation',
            learnings: 'learning',
          };
          const memType = typeMap[currentSection] || 'fact';

          // Insert memory directly (simplified path for vault import)
          const memId = db.insert('memories', {
            content: factContent,
            type: memType,
            importance: 0.8,
            confidence: 1.0,
            origin_type: 'user_stated',
            source: 'vault_import',
            content_hash: factHash,
            created_at: _nowISO(),
            updated_at: _nowISO(),
          });

          // Link to entity
          db.insert('memory_entities', {
            memory_id: memId,
            entity_id: entityId,
          });

          changes.facts_added++;
        }
      }
    }
  }

  // Update sync_hash in frontmatter
  const newHash = _computeSyncHash(body);
  const oldHash = fm.sync_hash || '';
  if (oldHash) {
    const updatedRaw = raw.replace(`sync_hash: ${oldHash}`, `sync_hash: ${newHash}`);
    writeFileSync(filePath, updatedRaw, 'utf-8');
  }

  _appendSyncLog(vaultPath,
    `Imported edits from ${filePath.split('/').pop()}: ` +
    `${changes.facts_added} facts, ` +
    `${changes.commitments_completed} commitments completed`
  );

  return changes;
}

// ---------------------------------------------------------------------------
// Canvas generation
// ---------------------------------------------------------------------------

/**
 * Generate a .canvas file for an entity's relationship network.
 *
 * Creates an Obsidian Canvas JSON file showing the entity at center
 * with connected entities arranged around it.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {string} vaultPath - Root vault directory
 * @param {string} entityName - Name of the central entity
 * @returns {string|null} Path to generated canvas file, or null
 */
function generateCanvas(db, vaultPath, entityName) {
  // Find the entity
  const entity = db.queryOne(
    'SELECT * FROM entities WHERE name = ? AND deleted_at IS NULL',
    [entityName]
  );
  if (!entity) {
    _log(`Entity "${entityName}" not found`);
    return null;
  }

  const entityId = entity.id;
  const relationships = _getEntityRelationships(db, entityId);

  if (relationships.length === 0) {
    _log(`No relationships found for "${entityName}"`);
    return null;
  }

  // Build canvas nodes and edges
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();

  // Center node
  const centerId = `entity-${entityId}`;
  nodes.push({
    id: centerId,
    x: 0,
    y: 0,
    width: 250,
    height: 60,
    type: 'file',
    file: `${_sanitizeFilename(entityName)}.md`,
    color: '4',
  });
  nodeIds.add(entityId);

  // Arrange connected entities in a circle
  const angleStep = (2 * Math.PI) / relationships.length;
  const radius = 400;

  for (let i = 0; i < relationships.length; i++) {
    const rel = relationships[i];
    const otherId = rel.source_entity_id === entityId
      ? rel.target_entity_id
      : rel.source_entity_id;
    const otherName = rel.source_entity_id === entityId
      ? rel.target_name
      : rel.source_name;

    if (nodeIds.has(otherId)) continue;
    nodeIds.add(otherId);

    const x = Math.round(Math.cos(angleStep * i) * radius);
    const y = Math.round(Math.sin(angleStep * i) * radius);

    const nodeId = `entity-${otherId}`;
    nodes.push({
      id: nodeId,
      x,
      y,
      width: 200,
      height: 50,
      type: 'file',
      file: `${_sanitizeFilename(otherName)}.md`,
    });

    edges.push({
      id: `edge-${centerId}-${nodeId}`,
      fromNode: centerId,
      toNode: nodeId,
      fromSide: 'right',
      toSide: 'left',
      label: rel.relationship_type,
    });
  }

  const canvasData = { nodes, edges };
  const canvasDir = join(vaultPath, 'canvases');
  _ensureDir(canvasDir);

  const canvasPath = join(canvasDir, `${_sanitizeFilename(entityName)}.canvas`);
  writeFileSync(canvasPath, JSON.stringify(canvasData, null, 2), 'utf-8');

  // Update canvas hash in sync metadata
  const metaPath = join(vaultPath, '_meta', 'last-sync.json');
  let meta = {};
  if (existsSync(metaPath)) {
    try { meta = JSON.parse(readFileSync(metaPath, 'utf-8')); } catch { /* ignore */ }
  }
  if (!meta.canvas_hashes) meta.canvas_hashes = {};
  meta.canvas_hashes[entityName] = _computeSyncHash(JSON.stringify(canvasData));
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  return canvasPath;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Compute vault path from config.
 *
 * Uses vault_base_dir from config, falling back to ~/.claudia/vault/.
 * Path is {vault_base_dir}/{projectId}/ for project-specific vaults,
 * or {vault_base_dir}/default/ for the global vault.
 *
 * @param {string} [projectDir] - Project directory (used as folder name)
 * @returns {string} Vault path
 */
export function getVaultPath(projectDir) {
  const config = getConfig();
  let baseDir = config.vault_base_dir;
  if (!baseDir) {
    baseDir = getVaultDir();
  }
  const folder = projectDir || 'default';
  return join(baseDir, folder);
}

/**
 * Full or incremental vault export (main entry point).
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {object} [options]
 * @param {boolean} [options.full=false] - Force full rebuild
 * @param {string} [options.projectDir] - Project directory for vault path resolution
 * @param {string} [options.vaultPath] - Override vault path directly
 * @returns {object} Stats of exported items
 */
export function syncVault(db, { full = false, projectDir, vaultPath: explicitVaultPath } = {}) {
  const config = getConfig();
  if (config.vault_sync_enabled === false) {
    _log('Vault sync is disabled in config');
    return { skipped: true };
  }

  const vaultPath = explicitVaultPath || getVaultPath(projectDir);

  // Auto-upgrade: if vault format version < 2, force full rebuild
  if (!full && _getVaultFormatVersion(vaultPath) < 2) {
    _log('Vault format version < 2, forcing full rebuild for upgrade');
    full = true;
  }

  if (full) {
    return _exportAll(db, vaultPath);
  }
  return _exportIncremental(db, vaultPath);
}

/**
 * Full vault rebuild from SQLite.
 *
 * Exports all entities, patterns, reflections, sessions, Home dashboard,
 * MOC indices, and .obsidian config.
 *
 * @returns {object} Dict with counts of exported items
 */
function _exportAll(db, vaultPath) {
  _log(`Starting full vault export to ${vaultPath}`);
  _ensureDirectories(vaultPath);
  _clearEntityNamesCache();

  const stats = {
    entities: 0,
    patterns: 0,
    reflections: 0,
    sessions: 0,
    mocs: 0,
  };

  // Export all entities
  const entities = _getAllEntities(db);
  for (const entity of entities) {
    const path = _exportEntity(db, vaultPath, entity);
    if (path) stats.entities++;
  }

  // Export patterns
  stats.patterns = _exportPatterns(db, vaultPath);

  // Export reflections
  stats.reflections = _exportReflections(db, vaultPath);

  // Export sessions (hierarchical, wikified)
  stats.sessions = _exportSessions(db, vaultPath);

  // Export Dataview query templates (only if they don't exist yet)
  _exportDataviewTemplates(vaultPath);

  // Export Home dashboard (always regenerated)
  _exportHomeDashboard(db, vaultPath);

  // Export MOC index files (always regenerated)
  _exportMocIndices(db, vaultPath);

  // Write top-level MOC files (Claudia's read layer)
  _writeMocFile(vaultPath, 'MOC-People.md', _generateMocPeople(db));
  _writeMocFile(vaultPath, 'MOC-Commitments.md', _generateMocCommitments(db));
  _writeMocFile(vaultPath, 'MOC-Projects.md', _generateMocProjects(db));
  stats.mocs = 3;

  // Export .obsidian config (idempotent, never overwrites)
  _exportObsidianConfig(vaultPath);

  // Save metadata with format version
  _saveSyncMetadata(vaultPath, stats);
  _appendSyncLog(vaultPath,
    `Full sync: ${stats.entities} entities, ` +
    `${stats.patterns} patterns, ` +
    `${stats.reflections} reflections, ` +
    `${stats.sessions} session days`
  );

  _log(`Full vault export complete: ${JSON.stringify(stats)}`);
  return stats;
}

/**
 * Incremental export: only entities/sessions changed since last sync.
 *
 * Falls back to full export if no previous sync metadata exists.
 */
function _exportIncremental(db, vaultPath) {
  const lastSync = _getLastSyncTime(vaultPath);
  if (!lastSync) {
    _log('No previous sync found, running full export');
    return _exportAll(db, vaultPath);
  }

  _log(`Starting incremental vault export (since ${lastSync})`);
  _ensureDirectories(vaultPath);
  _clearEntityNamesCache();

  const stats = {
    entities: 0,
    patterns: 0,
    reflections: 0,
    sessions: 0,
    mocs: 0,
  };

  // Export changed entities
  const entities = _getAllEntities(db, lastSync);
  for (const entity of entities) {
    const path = _exportEntity(db, vaultPath, entity);
    if (path) stats.entities++;
  }

  // Patterns and reflections are always fully rebuilt (cheap operation)
  stats.patterns = _exportPatterns(db, vaultPath);
  stats.reflections = _exportReflections(db, vaultPath);

  // Sessions since last sync
  stats.sessions = _exportSessions(db, vaultPath, lastSync);

  // Always regenerate MOC files (pure SQL, fast)
  _writeMocFile(vaultPath, 'MOC-People.md', _generateMocPeople(db));
  _writeMocFile(vaultPath, 'MOC-Commitments.md', _generateMocCommitments(db));
  _writeMocFile(vaultPath, 'MOC-Projects.md', _generateMocProjects(db));
  stats.mocs = 3;

  // Always regenerate Home and indices
  _exportHomeDashboard(db, vaultPath);
  _exportMocIndices(db, vaultPath);

  _saveSyncMetadata(vaultPath, stats);
  _appendSyncLog(vaultPath,
    `Incremental sync (since ${lastSync}): ` +
    `${stats.entities} entities, ` +
    `${stats.patterns} patterns, ` +
    `${stats.reflections} reflections, ` +
    `${stats.sessions} session days`
  );

  _log(`Incremental vault export complete: ${JSON.stringify(stats)}`);
  return stats;
}

/**
 * Get vault sync status information.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {string} vaultPath - Root vault directory
 * @returns {object} Status information
 */
export function getVaultStatus(db, vaultPath) {
  const metaPath = join(vaultPath, '_meta', 'last-sync.json');
  if (!existsSync(metaPath)) {
    return {
      vault_path: vaultPath,
      synced: false,
      last_sync: null,
      stats: null,
    };
  }

  try {
    const data = JSON.parse(readFileSync(metaPath, 'utf-8'));

    // Count files in vault (PARA structure)
    const fileCounts = {};
    const countDirs = [
      'Active', 'Relationships/people', 'Relationships/organizations',
      'Reference/concepts', 'Reference/locations',
      'Archive/people', 'Archive/projects', 'Archive/organizations',
      "Claudia's Desk/patterns", "Claudia's Desk/reflections",
    ];
    for (const subdir of countDirs) {
      fileCounts[subdir] = _listMdFiles(join(vaultPath, subdir)).length;
    }

    return {
      vault_path: vaultPath,
      synced: true,
      last_sync: data.last_sync || null,
      stats: data.stats || null,
      file_counts: fileCounts,
    };
  } catch {
    return {
      vault_path: vaultPath,
      synced: false,
      last_sync: null,
      stats: null,
      error: 'Could not read sync metadata',
    };
  }
}

/**
 * Export a single entity by canonical name lookup.
 *
 * Convenience method for real-time write-through: looks up the entity
 * by name and exports it.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {string} name - Entity name to look up
 * @param {string} vaultPath - Root vault directory
 * @returns {string|null} Path of the written file, or null
 */
export function exportEntityByName(db, name, vaultPath) {
  const canonical = canonicalName(name);

  let entity = db.queryOne(
    'SELECT * FROM entities WHERE canonical_name = ? AND deleted_at IS NULL',
    [canonical]
  );

  if (!entity) {
    // Try alias lookup
    const aliasRow = db.queryOne(
      'SELECT entity_id FROM entity_aliases WHERE canonical_alias = ?',
      [canonical]
    );
    if (aliasRow) {
      entity = db.queryOne(
        'SELECT * FROM entities WHERE id = ? AND deleted_at IS NULL',
        [aliasRow.entity_id]
      );
    }
  }

  if (entity) {
    _ensureDirectories(vaultPath);
    return _exportEntity(db, vaultPath, entity);
  }
  return null;
}

/**
 * Export a single entity by ID.
 *
 * Direct ID-based export for cases where the entity ID is already known.
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {number} entityId - Entity ID
 * @param {string} vaultPath - Root vault directory
 * @returns {string|null} Path of the written file, or null
 */
export function exportEntityById(db, entityId, vaultPath) {
  const entity = db.queryOne(
    'SELECT * FROM entities WHERE id = ? AND deleted_at IS NULL',
    [entityId]
  );
  if (entity) {
    _ensureDirectories(vaultPath);
    return _exportEntity(db, vaultPath, entity);
  }
  return null;
}

/**
 * Detect and import user edits (bidirectional sync).
 *
 * Scans vault for user edits and imports them all back into SQLite.
 * Human edits always win (origin_type='user_stated', confidence=1.0).
 *
 * @param {object} db - ClaudiaDatabase instance
 * @param {string} vaultPath - Root vault directory
 * @returns {object} Summary of all changes applied
 */
export function importVaultEdits(db, vaultPath) {
  const edits = _detectUserEdits(vaultPath);
  if (edits.length === 0) {
    return { edits_found: 0, changes: [] };
  }

  const results = [];
  for (const edit of edits) {
    try {
      const change = _importVaultEdit(db, vaultPath, edit.file_path);
      results.push(change);
    } catch (e) {
      _log(`Failed to import edit from ${edit.file_path}: ${e.message}`);
      results.push({ error: e.message, file: edit.file_path });
    }
  }

  return { edits_found: edits.length, changes: results };
}

// Re-export generateCanvas (already defined above as a named function)
export { generateCanvas };
