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
      if (this.globalAllowed.has(userIdStr)) return true;
    }

    // Denied -- figure out why and log an actionable message
    const channelEntries = this.channelAllowed[channel]
      ? [...this.channelAllowed[channel]]
      : [];
    const globalEntries = [...this.globalAllowed];
    const allEntries = [...channelEntries, ...globalEntries];

    if (allEntries.length === 0) {
      // No allowlists configured at all
      log.warn('No allowlists configured - denying all access. Add user IDs to gateway config.', {
        channel,
        userId: userIdStr,
      });
    } else if (allEntries.some(e => !/^\d+$/.test(e))) {
      // Allowlist contains non-numeric entries (likely usernames instead of IDs)
      const nonNumeric = allEntries.filter(e => !/^\d+$/.test(e));
      log.warn(
        'Auth denied: allowlist may contain usernames instead of numeric IDs. ' +
        'Telegram requires numeric user IDs (get yours from @userinfobot).', {
          channel,
          userId: userIdStr,
          hint: 'Replace usernames with numeric IDs in gateway.json',
          suspectEntries: nonNumeric,
        }
      );
    } else {
      // Allowlist exists with numeric IDs, user just isn't in it
      log.warn('Auth denied: user not in allowlist.', {
        channel,
        userId: userIdStr,
      });
    }

    return false;
  }
}
