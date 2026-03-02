/**
 * Output formatting for Claudia CLI.
 * JSON by default (for Claude to parse), --pretty for human-readable.
 */

/**
 * Output a JSON result to stdout.
 * This is the primary output method — Claude parses this.
 */
export function outputJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

/**
 * Output an error as JSON to stderr and exit with code 1.
 */
export function outputError(message, details = {}) {
  const error = { error: true, message, ...details };
  process.stderr.write(JSON.stringify(error, null, 2) + '\n');
  process.exit(1);
}

/**
 * Output a warning to stderr (does not exit).
 */
export function outputWarning(message) {
  process.stderr.write(JSON.stringify({ warning: true, message }) + '\n');
}

/**
 * Output a success result.
 */
export function outputSuccess(message, data = {}) {
  outputJson({ success: true, message, ...data });
}

/**
 * Format a RecallResult for output.
 */
export function formatRecallResult(result) {
  return {
    id: result.id,
    content: result.content,
    type: result.type,
    score: result.score != null ? Math.round(result.score * 1000) / 1000 : undefined,
    importance: result.importance,
    confidence: result.confidence,
    created_at: result.created_at,
    entities: result.entities || [],
    source: result.source,
    source_context: result.source_context,
    origin_type: result.origin_type,
    verification_status: result.verification_status,
    source_channel: result.source_channel,
    lifecycle_tier: result.lifecycle_tier,
    fact_id: result.fact_id,
  };
}

/**
 * Format entity for output.
 */
export function formatEntity(entity) {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    canonical_name: entity.canonical_name,
    description: entity.description,
    importance: entity.importance,
    attention_tier: entity.attention_tier,
    contact_trend: entity.contact_trend,
    close_circle: Boolean(entity.close_circle),
    created_at: entity.created_at,
  };
}

/**
 * Format relationship for output.
 */
export function formatRelationship(rel) {
  return {
    id: rel.id,
    source_name: rel.source_name,
    target_name: rel.target_name,
    relationship_type: rel.relationship_type,
    strength: rel.strength,
    origin_type: rel.origin_type,
    direction: rel.direction,
    valid_at: rel.valid_at,
    invalid_at: rel.invalid_at,
  };
}
