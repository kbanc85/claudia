/**
 * Input validation for Claudia CLI.
 * Port of memory-daemon/claudia_memory/guards.py.
 *
 * Deterministic validation: no LLM calls, just regex + clamping.
 */

// ----- Deadline Detection Patterns -----

const DEADLINE_PATTERNS = [
  /\b(by|before|due|until|deadline)\s+\w+/i,
  /\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(tomorrow|tonight|next week|next month|end of (week|month|day|year))\b/i,
  /\bEOD\b|\bEOW\b|\bEOM\b/,
];

// ----- Origin Strength Ceilings -----

export const ORIGIN_STRENGTH_CEILING = {
  user_stated: 1.0,
  extracted: 0.8,
  inferred: 0.5,
  corrected: 1.0,
};

export const REINFORCEMENT_BY_ORIGIN = {
  user_stated: 0.2,
  extracted: 0.1,
  inferred: 0.05,
  corrected: 0.2,
};

// ----- Validation Results -----

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid
 * @property {string[]} warnings
 * @property {Object} adjustments - Key-value pairs of adjusted values
 */

/**
 * Validate a memory before saving.
 * @param {string} content
 * @param {string} memoryType - fact, preference, observation, learning, commitment, pattern
 * @param {number} importance - 0.0-1.0
 * @returns {ValidationResult}
 */
export function validateMemory(content, memoryType = 'fact', importance = 1.0) {
  const warnings = [];
  const adjustments = {};

  // Content length check
  if (content.length > 1000) {
    warnings.push('Content exceeds 1000 characters. Truncating.');
    adjustments.content = content.slice(0, 1000);
  } else if (content.length > 500) {
    warnings.push('Content is long (>500 chars). Consider breaking into multiple memories.');
  }

  // Importance clamping
  if (importance < 0) {
    adjustments.importance = 0;
    warnings.push(`Importance ${importance} below 0, clamped to 0.`);
  } else if (importance > 1.0) {
    adjustments.importance = 1.0;
    warnings.push(`Importance ${importance} above 1.0, clamped to 1.0.`);
  }

  // Commitment deadline detection
  if (memoryType === 'commitment') {
    const hasDeadline = DEADLINE_PATTERNS.some(p => p.test(content));
    if (!hasDeadline) {
      warnings.push('Commitment without a detected deadline. Consider adding a date or timeframe.');
    }
  }

  return { isValid: true, warnings, adjustments };
}

/**
 * Validate an entity before creating.
 * @param {string} name
 * @param {string} entityType - person, organization, project, concept, location
 * @param {string[]|null} existingCanonicalNames - For near-duplicate detection
 * @returns {ValidationResult}
 */
export function validateEntity(name, entityType = '', existingCanonicalNames = null) {
  const warnings = [];
  const adjustments = {};

  if (!name || !name.trim()) {
    return { isValid: false, warnings: ['Entity name cannot be empty.'], adjustments };
  }

  if (!entityType) {
    warnings.push("Entity type not specified. Defaulting to 'person'.");
    adjustments.type = 'person';
  }

  // Near-duplicate detection (simple ratio check)
  if (existingCanonicalNames && existingCanonicalNames.length > 0) {
    const canonical = canonicalName(name);
    for (const existing of existingCanonicalNames) {
      const ratio = similarityRatio(canonical, existing);
      if (ratio > 0.85 && canonical !== existing) {
        warnings.push(`Near-duplicate detected: "${name}" is ${(ratio * 100).toFixed(0)}% similar to existing entity "${existing}".`);
      }
    }
  }

  return { isValid: true, warnings, adjustments };
}

/**
 * Validate a relationship.
 * @param {number} strength - 0.0-1.0
 * @param {string} originType - user_stated, extracted, inferred, corrected
 * @returns {ValidationResult}
 */
export function validateRelationship(strength = 1.0, originType = 'extracted') {
  const warnings = [];
  const adjustments = {};

  // Clamp strength to [0, 1]
  let clamped = Math.max(0, Math.min(1.0, strength));

  // Cap by origin authority ceiling
  const ceiling = ORIGIN_STRENGTH_CEILING[originType] ?? 0.5;
  if (clamped > ceiling) {
    warnings.push(`Strength ${clamped} exceeds ceiling ${ceiling} for origin '${originType}'. Capping.`);
    clamped = ceiling;
  }

  if (clamped !== strength) {
    adjustments.strength = clamped;
  }

  return { isValid: true, warnings, adjustments };
}

// ----- Utility Functions -----

/**
 * Normalize entity name to canonical form.
 * Lowercase, strip special characters, trim whitespace.
 */
export function canonicalName(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple string similarity ratio (Dice coefficient).
 * Good enough for near-duplicate detection.
 */
function similarityRatio(a, b) {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0.0;

  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.slice(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.slice(i, i + 2);
    const count = bigrams.get(bigram) || 0;
    if (count > 0) {
      bigrams.set(bigram, count - 1);
      matches++;
    }
  }

  return (2.0 * matches) / (a.length + b.length - 2);
}

/**
 * Check if content contains deadline patterns.
 * @param {string} content
 * @returns {boolean}
 */
export function hasDeadlinePattern(content) {
  return DEADLINE_PATTERNS.some(p => p.test(content));
}
