/**
 * Base adapter interface for Claudia Gateway channel adapters.
 *
 * All channel adapters (Telegram, Slack, Discord, etc.) extend this class.
 */

import { EventEmitter } from 'events';

export class BaseAdapter extends EventEmitter {
  /**
   * @param {string} name - Channel name (e.g., 'telegram', 'slack')
   * @param {Object} config - Channel-specific configuration
   */
  constructor(name, config) {
    super();
    this.name = name;
    this.config = config;
    this.running = false;
  }

  /**
   * Start the adapter (connect to platform, begin listening).
   * Must emit 'message' events with shape: { channel, userId, userName, text, threadId?, metadata? }
   */
  async start() {
    throw new Error(`${this.name}: start() not implemented`);
  }

  /**
   * Stop the adapter (disconnect, cleanup).
   */
  async stop() {
    throw new Error(`${this.name}: stop() not implemented`);
  }

  /**
   * Send a message to a specific user on this channel.
   *
   * @param {string} userId - Platform user ID
   * @param {string} text - Message text
   * @param {Object} [options] - Platform-specific options (threadId, parseMode, etc.)
   */
  async sendMessage(userId, text, options = {}) {
    throw new Error(`${this.name}: sendMessage() not implemented`);
  }

  /**
   * Check if the adapter is currently connected and running.
   */
  isRunning() {
    return this.running;
  }

  /**
   * Get adapter status for health checks.
   */
  getStatus() {
    return {
      name: this.name,
      running: this.running,
      enabled: this.config.enabled || false,
    };
  }
}
