/**
 * Message Router & Session Manager for Claudia Gateway
 *
 * Routes inbound messages from adapters through auth, session management,
 * and the core bridge, then sends responses back via the originating adapter.
 *
 * Each (channel, userId) pair gets its own session with conversation history.
 */

import { createLogger } from './utils/logger.js';

const log = createLogger('router');

// Session TTL: 30 minutes of inactivity
const SESSION_TTL_MS = 30 * 60 * 1000;
// Max conversation history per session (turns, not messages)
const MAX_HISTORY = 10;

export class Router {
  /**
   * @param {Object} options
   * @param {import('./bridge.js').Bridge} options.bridge - Core bridge instance
   * @param {import('./utils/auth.js').AuthManager} options.auth - Auth manager
   * @param {Map<string, import('./adapters/base.js').BaseAdapter>} options.adapters - Channel adapters
   */
  constructor({ bridge, auth, adapters }) {
    this.bridge = bridge;
    this.auth = auth;
    this.adapters = adapters;
    this.sessions = new Map(); // sessionKey -> { history: [], lastActive: Date }
    this._rejectedUsers = new Set(); // Track users we've already sent a rejection reply to
    this._cleanupInterval = null;
  }

  /**
   * Start the router: wire up adapters and begin session cleanup.
   */
  start() {
    // Subscribe to message events from all adapters
    for (const [name, adapter] of this.adapters) {
      adapter.on('message', (msg) => this._handleMessage(msg));
      adapter.on('error', (err) => {
        log.error('Adapter error', { channel: name, error: err.message });
      });
    }

    // Periodic session cleanup
    this._cleanupInterval = setInterval(() => this._cleanupSessions(), 60000);

    log.info('Router started', { adapterCount: this.adapters.size });
  }

  stop() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this.sessions.clear();
    log.info('Router stopped');
  }

  /**
   * Handle an inbound message from any adapter.
   */
  async _handleMessage(message) {
    const { channel, userId, userName, text, metadata } = message;

    // 1. Auth check
    if (!this.auth.isAuthorized(channel, userId)) {
      log.warn('Unauthorized message rejected', { channel, userId });

      // Send a one-time rejection reply so the user knows what's wrong
      const rejectKey = `${channel}:${userId}`;
      if (!this._rejectedUsers.has(rejectKey)) {
        this._rejectedUsers.add(rejectKey);
        const rejectMsg =
          `I don't recognize your user ID. Your ${channel} user ID is: ${userId}\n` +
          `Ask the person who set me up to add it to the allowlist in ~/.claudia/gateway.json`;
        try {
          const adapter = this.adapters.get(channel);
          if (adapter && metadata?.ctx && channel === 'telegram') {
            await metadata.ctx.reply(rejectMsg);
          } else if (adapter && metadata?.say && channel === 'slack') {
            await metadata.say({ text: rejectMsg });
          } else if (adapter) {
            const targetId = metadata?.chatId || metadata?.channelId || userId;
            await adapter.sendMessage(targetId, rejectMsg);
          }
        } catch (err) {
          log.debug('Failed to send rejection reply', { channel, userId, error: err.message });
        }
      }

      return;
    }

    // 2. Get or create session
    const sessionKey = `${channel}:${userId}`;
    const session = this._getSession(sessionKey);

    // 3. Send typing indicator (best effort)
    const adapter = this.adapters.get(channel);
    if (adapter && typeof adapter.sendTyping === 'function') {
      const chatId = metadata?.chatId || metadata?.channelId || userId;
      adapter.sendTyping(chatId).catch(() => {});
    }

    // 4. Process via bridge
    try {
      const result = await this.bridge.processMessage(
        { text, userId, userName, channel },
        [...session.history],
        session.episodeId
      );

      // 5. Store episode ID for session continuity
      if (result.episodeId) {
        session.episodeId = result.episodeId;
      }

      // 6. Update session history
      session.history.push({
        user: text,
        assistant: result.text,
        timestamp: new Date().toISOString(),
      });
      if (session.history.length > MAX_HISTORY) {
        session.history = session.history.slice(-MAX_HISTORY);
      }
      session.lastActive = Date.now();

      // 6. Send response
      await this._sendResponse(channel, message, result.text);

      log.info('Message processed', {
        channel,
        userId,
        responseLength: result.text.length,
        usage: result.usage,
      });
    } catch (err) {
      log.error('Failed to process message', { channel, userId, error: err.message });

      // Send error message to user
      const errorMsg = 'Sorry, I ran into an issue processing that. Try again in a moment.';
      await this._sendResponse(channel, message, errorMsg).catch(() => {});
    }
  }

  /**
   * Send a response back to the user via the originating adapter.
   */
  async _sendResponse(channel, originalMessage, text) {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      log.error('No adapter for channel', { channel });
      return;
    }

    const { userId, metadata } = originalMessage;

    // Channel-specific reply handling
    if (channel === 'telegram' && metadata?.ctx) {
      // Use grammY context for direct reply
      try {
        await metadata.ctx.reply(text);
        return;
      } catch (err) {
        log.debug('Telegram ctx.reply failed, falling through', { error: err.message });
      }
    }

    if (channel === 'slack' && metadata?.say) {
      // Use Bolt say() for threaded reply
      try {
        await metadata.say({
          text,
          thread_ts: metadata.threadTs || metadata.ts,
        });
        return;
      } catch (err) {
        log.debug('Slack say() failed, falling through', { error: err.message });
      }
    }

    // Generic fallback
    const targetId = metadata?.chatId || metadata?.channelId || userId;
    await adapter.sendMessage(targetId, text);
  }

  /**
   * Send a proactive message to a user on a specific channel.
   */
  async sendProactive(channel, userId, text) {
    const adapter = this.adapters.get(channel);
    if (!adapter || !adapter.isRunning()) {
      log.warn('Cannot send proactive: adapter not available', { channel });
      return false;
    }

    try {
      await adapter.sendMessage(userId, text);
      log.info('Proactive message sent', { channel, userId, textLength: text.length });
      return true;
    } catch (err) {
      log.error('Failed to send proactive message', { channel, userId, error: err.message });
      return false;
    }
  }

  /**
   * Get or create a session for a (channel, userId) pair.
   */
  _getSession(key) {
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        history: [],
        lastActive: Date.now(),
        episodeId: null,
      });
    }
    return this.sessions.get(key);
  }

  /**
   * Clean up stale sessions.
   */
  _cleanupSessions() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, session] of this.sessions) {
      if (now - session.lastActive > SESSION_TTL_MS) {
        // Finalize episode in memory before discarding the session
        if (session.history.length > 0) {
          this.bridge.endSession(session).catch((err) => {
            log.debug('Failed to end session on cleanup', { key, error: err.message });
          });
        }
        this.sessions.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      log.debug('Cleaned up stale sessions', { cleaned, remaining: this.sessions.size });
    }
  }

  getStatus() {
    return {
      activeSessions: this.sessions.size,
      adapters: Object.fromEntries(
        [...this.adapters.entries()].map(([name, a]) => [name, a.getStatus()])
      ),
    };
  }
}
