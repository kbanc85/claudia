/**
 * Claudia personality loader for the gateway.
 *
 * Extracts gateway-relevant sections from the Claudia template files
 * (CLAUDE.md and claudia-principles.md) to build a rich system prompt
 * that gives Telegram/Slack Claudia her real personality.
 *
 * Resolution chain:
 * 1. config.personalityDir -> load from explicit path
 * 2. Auto-detect ../template-v2/ relative to gateway (dev mode)
 * 3. config.systemPromptPath -> single file (backward compat)
 * 4. DEFAULT_SYSTEM_PROMPT fallback
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './utils/logger.js';

const log = createLogger('personality');

const __dirname = dirname(fileURLToPath(import.meta.url));

const GATEWAY_PREAMBLE = `You are Claudia, responding via a messaging app. Adapt your style:
- Keep responses concise and conversational. This is chat, not a document.
- Use plain text formatting suitable for chat.
- Short replies when appropriate, detailed when needed.`;

/**
 * Sections to extract from template-v2/CLAUDE.md.
 * These define Claudia's personality. Developer/Claude-Code-specific sections are excluded.
 */
const CLAUDE_MD_SECTIONS = [
  'Who I Am',
  'Primary Mission: Higher-Level Thinking',
  'How I Carry Myself',
  'Core Behaviors',
  'What I Don\'t Do',
  'What Stays Human Judgment',
];

/**
 * Principles to include from claudia-principles.md (by number prefix).
 * Excludes 11 (Output Formatting), 12 (Source Preservation), 13 (Multi-Source).
 */
const INCLUDED_PRINCIPLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Cached result
let _cachedPersonality = null;
let _cachedDir = null;

/**
 * Extract a markdown section by heading text.
 * Returns everything from the heading line to the next heading of equal or higher level,
 * or to end-of-file.
 *
 * @param {string} markdown - Full markdown text
 * @param {string} heading - Heading text to find (without ## prefix)
 * @returns {string|null} Section content including the heading, or null if not found
 */
export function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  let startIdx = -1;
  let startLevel = 0;

  // Find the heading line
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match && match[2].trim() === heading) {
      startIdx = i;
      startLevel = match[1].length;
      break;
    }
  }

  if (startIdx === -1) return null;

  // Find the end: next heading of same or higher level
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= startLevel) {
      endIdx = i;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join('\n').trim();
}

/**
 * Extract numbered principles from claudia-principles.md.
 *
 * @param {string} markdown - Full principles markdown
 * @param {number[]} numbers - Principle numbers to include
 * @returns {string} Extracted principles joined together
 */
export function extractPrinciples(markdown, numbers) {
  const sections = [];

  for (const num of numbers) {
    // Match "## N." or "## N. Title"
    const pattern = new RegExp(`^## ${num}\\.\\s`, 'm');
    const match = markdown.match(pattern);
    if (!match) continue;

    const startPos = match.index;
    const afterStart = markdown.indexOf('\n', startPos);
    if (afterStart === -1) continue;

    // Find the heading line to get its text
    const headingLine = markdown.slice(startPos, afterStart);

    // Find the next ## heading
    const rest = markdown.slice(afterStart + 1);
    const nextHeading = rest.match(/^## \d+\./m);
    const nextSeparator = rest.match(/^---$/m);

    let endPos;
    if (nextHeading && nextSeparator) {
      endPos = afterStart + 1 + Math.min(nextHeading.index, nextSeparator.index);
    } else if (nextHeading) {
      endPos = afterStart + 1 + nextHeading.index;
    } else if (nextSeparator) {
      endPos = afterStart + 1 + nextSeparator.index;
    } else {
      endPos = markdown.length;
    }

    sections.push(markdown.slice(startPos, endPos).trim());
  }

  return sections.join('\n\n');
}

/**
 * Build the personality prompt from template directory.
 *
 * @param {string} templateDir - Path to template-v2/ directory
 * @param {number} maxChars - Maximum character limit for the prompt
 * @returns {string|null} Assembled personality prompt, or null if files not found
 */
export function buildPersonalityFromDir(templateDir, maxChars = 15000) {
  const claudeMdPath = join(templateDir, 'CLAUDE.md');
  const principlesPath = join(templateDir, '.claude', 'rules', 'claudia-principles.md');

  if (!existsSync(claudeMdPath)) {
    log.debug('CLAUDE.md not found', { path: claudeMdPath });
    return null;
  }

  const parts = [GATEWAY_PREAMBLE, ''];

  // Extract CLAUDE.md sections
  try {
    const claudeMd = readFileSync(claudeMdPath, 'utf8');
    for (const heading of CLAUDE_MD_SECTIONS) {
      const section = extractSection(claudeMd, heading);
      if (section) {
        parts.push(section);
        parts.push('');
      }
    }
  } catch (err) {
    log.warn('Failed to read CLAUDE.md', { error: err.message });
    return null;
  }

  // Extract principles
  if (existsSync(principlesPath)) {
    try {
      const principlesMd = readFileSync(principlesPath, 'utf8');
      const extracted = extractPrinciples(principlesMd, INCLUDED_PRINCIPLES);
      if (extracted) {
        parts.push('# Core Principles\n');
        parts.push(extracted);
      }
    } catch (err) {
      log.debug('Failed to read principles', { error: err.message });
    }
  }

  let result = parts.join('\n');

  // Enforce size limit
  if (result.length > maxChars) {
    log.info('Personality prompt truncated', { original: result.length, limit: maxChars });
    result = result.slice(0, maxChars);
    // Cut at last complete line
    const lastNewline = result.lastIndexOf('\n');
    if (lastNewline > maxChars * 0.8) {
      result = result.slice(0, lastNewline);
    }
    result += '\n\n[Personality truncated for size]';
  }

  return result;
}

/**
 * Resolve the template directory using the config resolution chain.
 *
 * @param {Object} config - Gateway config
 * @returns {string|null} Resolved template directory path, or null
 */
export function resolveTemplateDir(config) {
  // 1. Explicit personalityDir
  if (config.personalityDir) {
    if (existsSync(join(config.personalityDir, 'CLAUDE.md'))) {
      return config.personalityDir;
    }
    log.warn('personalityDir set but CLAUDE.md not found', { dir: config.personalityDir });
  }

  // 2. Auto-detect relative to gateway (dev mode): gateway/../template-v2/
  const devPath = join(__dirname, '..', '..', 'template-v2');
  if (existsSync(join(devPath, 'CLAUDE.md'))) {
    return devPath;
  }

  return null;
}

/**
 * Load the Claudia personality for the gateway.
 * Uses caching to avoid re-reading files on every message.
 *
 * @param {Object} config - Gateway config
 * @returns {string|null} Personality prompt, or null (use fallback)
 */
export function loadPersonality(config) {
  const templateDir = resolveTemplateDir(config);

  // Cache hit: same directory, return cached
  if (_cachedPersonality && _cachedDir === templateDir) {
    return _cachedPersonality;
  }

  if (!templateDir) {
    _cachedPersonality = null;
    _cachedDir = null;
    return null;
  }

  const personality = buildPersonalityFromDir(templateDir, config.personalityMaxChars || 15000);

  if (personality) {
    _cachedPersonality = personality;
    _cachedDir = templateDir;
    const sectionCount = CLAUDE_MD_SECTIONS.length;
    log.info('Loaded Claudia personality', {
      dir: templateDir,
      chars: personality.length,
      sections: sectionCount,
    });
  }

  return personality;
}

/**
 * Clear the personality cache. Useful for testing.
 */
export function clearCache() {
  _cachedPersonality = null;
  _cachedDir = null;
}
