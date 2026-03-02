/**
 * Language model service for Claudia CLI.
 * Port of memory-daemon/claudia_memory/language_model.py.
 *
 * Uses Ollama HTTP API for local text generation (default: qwen3:4b).
 * Used by cognitive.ingest for entity/memory extraction from raw text.
 *
 * When no language model is available, returns null so Claude handles
 * the work directly (current fallback behavior).
 */

import { getConfig } from './config.js';

// ----- Constants -----

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120_000; // Longer timeout for generation vs embeddings
const DEFAULT_TEMPERATURE = 0.1; // Low temp for deterministic extraction

/**
 * fetch with AbortController timeout.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ----- LanguageModelService -----

class LanguageModelService {
  constructor() {
    const config = getConfig();
    this.host = config.ollama_host;
    this.model = config.language_model;
    this._available = null;
  }

  /**
   * Check if Ollama is running and the language model is pulled.
   */
  async isAvailable() {
    if (this._available !== null) return this._available;

    // No model configured means the user opted out
    if (!this.model) {
      this._available = false;
      return false;
    }

    // Check Ollama is reachable
    let reachable = false;
    for (let i = 0; i < RETRY_ATTEMPTS; i++) {
      try {
        const res = await fetchWithTimeout(`${this.host}/api/tags`, {}, 5000);
        if (res.ok) {
          reachable = true;
          break;
        }
      } catch {
        // Retry
      }
      if (i < RETRY_ATTEMPTS - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }

    if (!reachable) {
      this._available = false;
      return false;
    }

    // Check the model is pulled
    try {
      const res = await fetchWithTimeout(`${this.host}/api/tags`);
      if (!res.ok) {
        this._available = false;
        return false;
      }
      const data = await res.json();
      const models = (data.models || []).map(m => m.name);
      const hasModel = models.some(m =>
        m === this.model || m === `${this.model}:latest` || m.startsWith(`${this.model}:`)
      );

      if (!hasModel) {
        process.stderr.write(
          `[language-model] Model '${this.model}' not found. ` +
          `Available: ${models.join(', ')}. Pull with: ollama pull ${this.model}\n`
        );
      }

      this._available = hasModel;
      return hasModel;
    } catch {
      this._available = false;
      return false;
    }
  }

  /**
   * Generate text using the local language model.
   * @param {string} prompt - The user prompt to send
   * @param {object} options
   * @param {string} [options.system] - System prompt for task framing
   * @param {number} [options.temperature] - Sampling temperature (low = deterministic)
   * @param {boolean} [options.formatJson] - If true, request JSON output from Ollama
   * @returns {Promise<string|null>} Generated text, or null if unavailable/failed
   */
  async generate(prompt, { system, temperature = DEFAULT_TEMPERATURE, formatJson = false } = {}) {
    if (!(await this.isAvailable())) return null;

    try {
      const payload = {
        model: this.model,
        prompt,
        stream: false,
        options: { temperature },
      };
      if (system) payload.system = system;
      if (formatJson) payload.format = 'json';

      const res = await fetchWithTimeout(`${this.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        process.stderr.write(`[language-model] Generation failed: HTTP ${res.status}\n`);
        return null;
      }

      const data = await res.json();
      return data.response || null;
    } catch (err) {
      if (err.name === 'AbortError') {
        process.stderr.write(`[language-model] Generation timed out (model=${this.model})\n`);
      }
      return null;
    }
  }
}

// ----- Module Singleton -----

let _service = null;

export function getLanguageModelService() {
  if (!_service) {
    _service = new LanguageModelService();
  }
  return _service;
}

export function resetLanguageModelService() {
  _service = null;
}

/** Convenience: generate text. */
export async function generate(prompt, options) {
  return getLanguageModelService().generate(prompt, options);
}
