/**
 * Cognitive commands for Claudia CLI.
 * Implements: claudia cognitive ingest
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveProjectDir } from '../core/paths.js';
import { getDatabase } from '../core/database.js';
import { getConfig } from '../core/config.js';
import { outputJson, outputError } from '../core/output.js';
import { ingest } from '../services/ingest.js';
import { extractAll } from '../services/extraction.js';

/**
 * claudia cognitive ingest --text "..." | --file <path>
 * Extract entities, facts, commitments from text using Ollama LLM.
 * Falls back to regex extraction if LLM unavailable.
 */
export async function cognitiveIngestCommand(opts, globalOpts) {
  try {
    const projectDir = resolveProjectDir(globalOpts.projectDir);

    // Get text from --text or --file
    let text = opts.text;
    if (!text && opts.file) {
      const filePath = resolve(opts.file);
      text = readFileSync(filePath, 'utf-8');
    }

    if (!text) {
      outputError('No text provided. Use --text or --file.');
      process.exitCode = 1;
      return;
    }

    // Determine source type from option or auto-detect
    const sourceType = opts.type || _detectSourceType(text);

    // Try LLM extraction first
    const result = await ingest(text, {
      sourceType,
      context: opts.context,
    });

    // If LLM unavailable, fall back to regex extraction
    if (result.status === 'llm_unavailable') {
      const regexResult = extractAll(text);
      outputJson({
        status: 'regex_fallback',
        source_type: sourceType,
        data: {
          entities: regexResult.entities,
          memories: regexResult.memories,
        },
        message: 'LLM unavailable — used regex extraction. Install Ollama and pull the language model for richer extraction.',
      });
      return;
    }

    // If LLM returned but parse failed, include regex as supplement
    if (result.status === 'parse_error') {
      const regexResult = extractAll(text);
      outputJson({
        status: 'parse_error_with_fallback',
        source_type: sourceType,
        data: {
          entities: regexResult.entities,
          memories: regexResult.memories,
        },
        raw_output: result.raw_output,
        message: 'LLM output could not be parsed. Regex extraction included as fallback.',
      });
      return;
    }

    // Successful LLM extraction — augment with regex entities if needed
    const regexResult = extractAll(text);
    const llmEntities = result.data.entities || [];
    const regexEntities = regexResult.entities || [];

    // Merge: add regex entities not already found by LLM
    const llmNames = new Set(llmEntities.map(e => (e.name || '').toLowerCase()));
    const supplemental = regexEntities.filter(e => !llmNames.has(e.name.toLowerCase()));

    if (supplemental.length > 0) {
      result.data.entities = [...llmEntities, ...supplemental.map(e => ({
        name: e.name,
        type: e.type,
        description: null,
      }))];
    }

    outputJson(result);
  } catch (err) {
    outputError('Cognitive ingest failed', { error: err.message });
    process.exitCode = 1;
  }
}

// ----- Helpers -----

/**
 * Auto-detect source type from text content.
 */
function _detectSourceType(text) {
  const lower = text.toLowerCase();

  // Meeting detection
  if (
    /\b(meeting|standup|sync|call|discussion|agenda|attendees?)\b/.test(lower) &&
    /\b(action items?|next steps?|follow.?up|decided|agreed)\b/.test(lower)
  ) {
    return 'meeting';
  }

  // Email detection
  if (
    /^(from|to|subject|date|cc|bcc)\s*:/im.test(text) ||
    /\b(dear |hi |hello |regards|sincerely|best wishes)\b/i.test(lower)
  ) {
    return 'email';
  }

  // Document detection (structured content with headings)
  if (
    /^#{1,3}\s/m.test(text) ||
    /\b(abstract|introduction|conclusion|references|table of contents)\b/.test(lower)
  ) {
    return 'document';
  }

  return 'general';
}
