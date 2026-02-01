/**
 * Async Extraction Module for Claudia Gateway
 *
 * Two-tier extraction from gateway conversations:
 *   Tier 1: Regex note detection (instant, no LLM needed)
 *   Tier 2: LLM extraction via Ollama (async, background)
 *
 * All errors are logged, never thrown. Extraction failure must not block chat.
 */

import { createLogger } from './utils/logger.js';

const log = createLogger('extractor');

// Tier 1: Regex patterns for instant note detection
const NOTE_PATTERNS = [
  /\bremind me\b/i,
  /\bnote to self\b/i,
  /\bdon'?t forget\b/i,
  /\bremember (that|to)\b/i,
  /^\/?(note|todo|reminder)\b/i,
  /\bmake a note\b/i,
  /\bjot down\b/i,
  /\bkeep in mind\b/i,
];

// Tier 2: LLM extraction prompt
const EXTRACTION_PROMPT = `Extract structured information from this conversation turn. Return ONLY valid JSON, no other text.

User message: {user}
Assistant response: {assistant}

Return JSON with this exact shape (empty arrays if nothing found):
{"facts":[],"commitments":[],"notes":[]}

Each item has: {"content":"...","importance":0.7}

Rules:
- facts: concrete information worth remembering (people, dates, preferences, decisions)
- commitments: promises, deadlines, follow-ups ("I'll do X by Y")
- notes: things the user wants to remember or be reminded about
- importance: 0.0-1.0 (routine=0.3, notable=0.6, critical=0.9)
- Skip trivial chitchat. Only extract signal.`;

export class Extractor {
  /**
   * @param {Object} config - Gateway config (needs ollama.host, ollama.model)
   */
  constructor(config) {
    this.config = config;
    this.ollamaHost = config.ollama?.host || 'http://localhost:11434';
    this.ollamaModel = config.ollama?.model;
  }

  /**
   * Extract notes and facts from a conversation turn.
   * Fire-and-forget: all errors are caught and logged.
   *
   * @param {string} userMsg - What the user said
   * @param {string} assistantMsg - What the assistant replied
   * @param {string} channel - Source channel ('telegram', 'slack')
   * @param {import('./bridge.js').Bridge} bridge - Bridge instance for memory calls
   */
  async extract(userMsg, assistantMsg, channel, bridge) {
    try {
      // Tier 1: Instant regex note detection
      const isNote = NOTE_PATTERNS.some((p) => p.test(userMsg));
      if (isNote) {
        log.debug('Note pattern detected', { channel });
        await bridge.remember(
          userMsg,
          'note',
          [],
          0.8,
        );
      }

      // Tier 2: LLM extraction (skip if no Ollama model configured)
      if (!this.ollamaModel) {
        return;
      }

      await this._llmExtract(userMsg, assistantMsg, channel, bridge);
    } catch (err) {
      log.debug('Extraction error (non-blocking)', { error: err.message });
    }
  }

  /**
   * Call Ollama for structured extraction.
   */
  async _llmExtract(userMsg, assistantMsg, channel, bridge) {
    const prompt = EXTRACTION_PROMPT
      .replace('{user}', userMsg.slice(0, 500))
      .replace('{assistant}', assistantMsg.slice(0, 500));

    let response;
    try {
      const res = await fetch(`${this.ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt,
          stream: false,
          options: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        log.debug('Ollama extraction HTTP error', { status: res.status });
        return;
      }

      const data = await res.json();
      response = data.response || '';
    } catch (err) {
      log.debug('Ollama extraction call failed', { error: err.message });
      return;
    }

    // Parse the JSON response
    let extracted;
    try {
      // Try to find JSON in the response (LLMs sometimes wrap in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        log.debug('No JSON found in extraction response');
        return;
      }
      extracted = JSON.parse(jsonMatch[0]);
    } catch (err) {
      log.debug('Failed to parse extraction JSON', { error: err.message });
      return;
    }

    // Store extracted items
    const items = [
      ...(extracted.facts || []).map((f) => ({ ...f, type: 'fact' })),
      ...(extracted.commitments || []).map((c) => ({ ...c, type: 'commitment' })),
      ...(extracted.notes || []).map((n) => ({ ...n, type: 'note' })),
    ];

    if (items.length === 0) {
      log.debug('Nothing to extract from this turn');
      return;
    }

    log.info('Extracted items from gateway turn', {
      channel,
      facts: (extracted.facts || []).length,
      commitments: (extracted.commitments || []).length,
      notes: (extracted.notes || []).length,
    });

    // Store each item via bridge.remember
    for (const item of items) {
      try {
        await bridge.remember(
          item.content,
          item.type,
          [],
          item.importance || 0.7,
        );
      } catch (err) {
        log.debug('Failed to store extracted item', { error: err.message });
      }
    }
  }
}
