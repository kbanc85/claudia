/**
 * Embedding service for Claudia CLI.
 * Port of memory-daemon/claudia_memory/embeddings.py.
 *
 * Uses Ollama HTTP API for local embeddings (default: all-minilm:l6-v2, 384D).
 * All methods are async since Ollama calls are network I/O.
 */

import { createHash } from 'node:crypto';
import { getConfig } from './config.js';

// ----- LRU Cache -----

class EmbeddingCache {
  constructor(maxsize = 256) {
    this._cache = new Map();
    this._maxsize = maxsize;
    this.hits = 0;
    this.misses = 0;
  }

  _key(text) {
    return createHash('sha256').update(text).digest('hex');
  }

  get(text) {
    const key = this._key(text);
    const val = this._cache.get(key);
    if (val !== undefined) {
      this._cache.delete(key);
      this._cache.set(key, val);
      this.hits++;
      return val;
    }
    this.misses++;
    return null;
  }

  put(text, embedding) {
    const key = this._key(text);
    this._cache.delete(key);
    this._cache.set(key, embedding);
    if (this._cache.size > this._maxsize) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
  }

  clear() {
    this._cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this._cache.size,
      maxsize: this._maxsize,
    };
  }
}

// ----- Constants -----

const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30000;

/**
 * fetch with AbortController timeout (Node 18+).
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ----- EmbeddingService -----

class EmbeddingService {
  constructor() {
    const config = getConfig();
    this.host = config.ollama_host;
    this.model = config.embedding_model;
    this.dimensions = config.embedding_dimensions;
    this._cache = new EmbeddingCache(256);
    this._available = null;
  }

  /**
   * Wait for Ollama to become available (with retries).
   */
  async _waitForOllama(maxRetries = RETRY_ATTEMPTS, delayMs = RETRY_DELAY_MS) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetchWithTimeout(`${this.host}/api/tags`, {}, 5000);
        if (res.ok) return true;
      } catch {
        // Retry
      }
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    return false;
  }

  /**
   * Check if Ollama is running and the embedding model is available.
   */
  async isAvailable() {
    if (this._available !== null) return this._available;

    const ollamaUp = await this._waitForOllama();
    if (!ollamaUp) {
      this._available = false;
      return false;
    }

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
      this._available = hasModel;
      return hasModel;
    } catch {
      this._available = false;
      return false;
    }
  }

  /**
   * Generate embedding for text.
   * @param {string} text
   * @returns {Promise<number[]|null>} Float array or null if unavailable
   */
  async embed(text) {
    const cached = this._cache.get(text);
    if (cached) return cached;

    if (!(await this.isAvailable())) return null;

    try {
      const res = await fetchWithTimeout(`${this.host}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      const embedding = data.embedding;

      if (!embedding || embedding.length !== this.dimensions) {
        process.stderr.write(
          `[embeddings] Dimension mismatch: got ${embedding?.length}, expected ${this.dimensions}\n`
        );
        return null;
      }

      this._cache.put(text, embedding);
      return embedding;
    } catch {
      return null;
    }
  }

  /**
   * Generate embeddings for multiple texts in parallel.
   * @param {string[]} texts
   * @returns {Promise<(number[]|null)[]>}
   */
  async embedBatch(texts) {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  /** Cache statistics. */
  cacheStats() {
    return this._cache.stats();
  }

  /** Clear cache (used after model migration). */
  clearCache() {
    this._cache.clear();
  }
}

// ----- Module Singleton -----

let _service = null;

export function getEmbeddingService() {
  if (!_service) {
    _service = new EmbeddingService();
  }
  return _service;
}

export function resetEmbeddingService() {
  _service = null;
}

/** Convenience: embed single text. */
export async function embed(text) {
  return getEmbeddingService().embed(text);
}

/** Convenience: batch embed. */
export async function embedBatch(texts) {
  return getEmbeddingService().embedBatch(texts);
}
