/**
 * User authentication and allowlist for Claudia Gateway
 *
 * Controls which external users can interact with Claudia via messaging channels.
 */

import { createLogger } from './logger.js';

const log = createLogger('auth');

export class AuthManager {
  /**
   * @param {Object} config - Gateway configuration
   * @param {Object} config.channels - Channel configs with allowedUsers arrays
   * @param {string[]} config.globalAllowedUsers - Global user ID allowlist
   */
  constructor(config) {
    this.globalAllowed = new Set(config.globalAllowedUsers || []);
    this.channelAllowed = {};

    for (const [channel, channelConfig] of Object.entries(config.channels || {})) {
      if (channelConfig.allowedUsers && channelConfig.allowedUsers.length > 0) {
        this.channelAllowed[channel] = new Set(channelConfig.allowedUsers);
      }
    }
  }

  /**
   * Check if a user is authorized to interact on a given channel.
   *
   * @param {string} channel - Channel name (e.g., 'telegram', 'slack')
   * @param {string} userId - Platform-specific user ID
   * @returns {boolean}
   */
  isAuthorized(channel, userId) {
    const userIdStr = String(userId);

    // Check channel-specific allowlist first
    if (this.channelAllowed[channel]) {
      if (this.channelAllowed[channel].has(userIdStr)) return true;
    }

    // Fall back to global allowlist
    if (this.globalAllowed.size > 0) {
      return this.globalAllowed.has(userIdStr);
    }

    // If no allowlists configured at all, deny by default (secure default)
    log.warn('No allowlists configured - denying all access. Add user IDs to gateway config.', {
      channel,
      userId: userIdStr,
    });
    return false;
  }
}
