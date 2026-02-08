/**
 * Session management for Claudia Relay
 *
 * Maintains per-user session state with --resume support.
 * Persists to ~/.claudia/relay-sessions.json.
 * Includes a per-user concurrency guard to prevent two claude -p
 * processes from using the same session simultaneously.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STATE_PATH = join(homedir(), '.claudia', 'relay-sessions.json');

export class SessionManager {
  /**
   * @param {Object} options
   * @param {number} options.ttlMinutes - Session expiry after inactivity (default 30)
   */
  constructor({ ttlMinutes = 30 } = {}) {
    this.ttlMs = ttlMinutes * 60 * 1000;
    this.sessions = new Map(); // userId -> { sessionId, lastActive, messageCount }
    this.locks = new Map(); // userId -> Promise chain for concurrency guard
    this._load();
  }

  /**
   * Get or create a session for the given user.
   * Returns the sessionId (for --resume) or null for a fresh session.
   *
   * @param {string} userId
   * @returns {{ sessionId: string|null, isNew: boolean }}
   */
  getOrCreate(userId) {
    const existing = this.sessions.get(userId);
    const now = Date.now();

    if (existing && (now - existing.lastActive) < this.ttlMs) {
      // Session still valid
      existing.lastActive = now;
      existing.messageCount++;
      this._save();
      return { sessionId: existing.sessionId, isNew: false };
    }

    // Create new session (sessionId is null until claude -p gives us one)
    const session = {
      sessionId: null,
      lastActive: now,
      messageCount: 1,
    };
    this.sessions.set(userId, session);
    this._save();
    return { sessionId: null, isNew: true };
  }

  /**
   * Update the session ID after claude -p returns one.
   * Claude CLI outputs the session ID which we capture for --resume.
   *
   * @param {string} userId
   * @param {string} sessionId
   */
  updateSessionId(userId, sessionId) {
    const session = this.sessions.get(userId);
    if (session) {
      session.sessionId = sessionId;
      this._save();
    }
  }

  /**
   * Concurrency guard: ensures only one claude -p runs per user at a time.
   * Returns a function that wraps the given async operation in a queue.
   *
   * @param {string} userId
   * @param {Function} fn - Async function to run exclusively
   * @returns {Promise} Result of fn()
   */
  async withLock(userId, fn) {
    const prev = this.locks.get(userId) || Promise.resolve();
    const current = prev.then(fn, fn); // Run fn after previous completes (regardless of success/failure)
    this.locks.set(userId, current.catch(() => {})); // Swallow to prevent chain breakage
    return current;
  }

  /**
   * Clear expired sessions.
   */
  cleanup() {
    const now = Date.now();
    for (const [userId, session] of this.sessions) {
      if ((now - session.lastActive) >= this.ttlMs) {
        this.sessions.delete(userId);
      }
    }
    this._save();
  }

  /**
   * Load sessions from disk.
   */
  _load() {
    try {
      const raw = readFileSync(STATE_PATH, 'utf8');
      const data = JSON.parse(raw);
      for (const [userId, session] of Object.entries(data)) {
        this.sessions.set(userId, session);
      }
    } catch {
      // No file or invalid JSON, start fresh
    }
  }

  /**
   * Save sessions to disk (atomic: write temp file, then rename).
   */
  _save() {
    try {
      mkdirSync(join(homedir(), '.claudia'), { recursive: true });
      const data = Object.fromEntries(this.sessions);
      const tmpPath = STATE_PATH + '.tmp';
      writeFileSync(tmpPath, JSON.stringify(data, null, 2));
      renameSync(tmpPath, STATE_PATH);
    } catch {
      // Non-critical, log and continue
      console.error('[relay:session] Failed to persist sessions');
    }
  }
}
