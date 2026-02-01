/**
 * Slack adapter for Claudia Gateway
 *
 * Uses Slack Bolt (Socket Mode) for real-time events.
 * Handles DMs and app mentions for MVP.
 */

import pkg from '@slack/bolt';
const { App } = pkg;
import { BaseAdapter } from './base.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('slack');

export class SlackAdapter extends BaseAdapter {
  constructor(config) {
    super('slack', config);
    this.app = null;
    this.botUserId = null;
  }

  async start() {
    if (!this.config.botToken) {
      throw new Error('Slack bot token not configured. Set channels.slack.botToken in gateway.json');
    }
    if (!this.config.appToken) {
      throw new Error('Slack app token not configured. Set channels.slack.appToken in gateway.json');
    }

    this.app = new App({
      token: this.config.botToken,
      appToken: this.config.appToken,
      socketMode: true,
      // Disable built-in receiver logging to reduce noise
      logLevel: 'ERROR',
    });

    // Get bot user ID for filtering self-messages
    try {
      const authResult = await this.app.client.auth.test({ token: this.config.botToken });
      this.botUserId = authResult.user_id;
      log.info('Authenticated as bot', { botUserId: this.botUserId });
    } catch (err) {
      log.error('Failed to authenticate with Slack', { error: err.message });
      throw err;
    }

    // Handle direct messages
    this.app.message(async ({ message, say }) => {
      // Skip bot messages and edited messages
      if (message.subtype || message.bot_id) return;

      // Only handle DMs (im = direct message channel type)
      if (message.channel_type !== 'im') {
        log.debug('Ignoring non-DM message', { channelType: message.channel_type });
        return;
      }

      const userId = message.user;
      const text = message.text || '';

      log.info('Received DM', { userId, textLength: text.length });

      this.emit('message', {
        channel: 'slack',
        userId,
        userName: userId, // Will be resolved by router if needed
        text,
        threadId: message.thread_ts || message.ts,
        metadata: {
          channelId: message.channel,
          ts: message.ts,
          threadTs: message.thread_ts,
          say,
        },
      });
    });

    // Handle app mentions (in channels)
    this.app.event('app_mention', async ({ event, say }) => {
      const userId = event.user;
      // Strip the bot mention from the text
      const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();

      if (!text) return;

      log.info('Received mention', { userId, textLength: text.length });

      this.emit('message', {
        channel: 'slack',
        userId,
        userName: userId,
        text,
        threadId: event.thread_ts || event.ts,
        metadata: {
          channelId: event.channel,
          ts: event.ts,
          threadTs: event.thread_ts,
          say,
        },
      });
    });

    // Start the app
    await this.app.start();
    this.running = true;
    log.info('Slack app started (Socket Mode)');
  }

  async stop() {
    if (this.app) {
      await this.app.stop();
      this.running = false;
      log.info('Slack app stopped');
    }
  }

  /**
   * Send a message to a Slack user/channel.
   *
   * @param {string} channelOrUserId - Slack channel ID or user ID
   * @param {string} text - Message text (supports mrkdwn)
   * @param {Object} [options]
   * @param {string} [options.threadTs] - Thread timestamp for threaded replies
   */
  async sendMessage(channelOrUserId, text, options = {}) {
    if (!this.app) {
      throw new Error('Slack app not started');
    }

    try {
      // If it's a user ID (starts with U), open a DM first
      let channelId = channelOrUserId;
      if (channelOrUserId.startsWith('U')) {
        const result = await this.app.client.conversations.open({
          token: this.config.botToken,
          users: channelOrUserId,
        });
        channelId = result.channel.id;
      }

      await this.app.client.chat.postMessage({
        token: this.config.botToken,
        channel: channelId,
        text,
        thread_ts: options.threadTs,
        mrkdwn: true,
      });
    } catch (err) {
      log.error('Failed to send message', { channelOrUserId, error: err.message });
      throw err;
    }
  }
}
