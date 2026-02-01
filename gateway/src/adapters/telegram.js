/**
 * Telegram adapter for Claudia Gateway
 *
 * Uses grammY to connect to the Telegram Bot API via long polling.
 * Only handles DMs (private chats) for MVP.
 */

import { Bot } from 'grammy';
import { BaseAdapter } from './base.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('telegram');

export class TelegramAdapter extends BaseAdapter {
  constructor(config) {
    super('telegram', config);
    this.bot = null;
  }

  async start() {
    if (!this.config.token) {
      throw new Error('Telegram bot token not configured. Set channels.telegram.token in gateway.json');
    }

    this.bot = new Bot(this.config.token);

    // Handle text messages (DMs only for MVP)
    this.bot.on('message:text', async (ctx) => {
      // Only handle private (DM) messages
      if (ctx.chat.type !== 'private') {
        log.debug('Ignoring non-private message', { chatType: ctx.chat.type });
        return;
      }

      const userId = String(ctx.from.id);
      const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
      const text = ctx.message.text;

      log.info('Received message', { userId, userName, textLength: text.length });

      // Emit standardized message event
      this.emit('message', {
        channel: 'telegram',
        userId,
        userName,
        text,
        metadata: {
          chatId: ctx.chat.id,
          messageId: ctx.message.message_id,
          ctx, // Pass grammY context for reply
        },
      });
    });

    // Error handling
    this.bot.catch((err) => {
      log.error('Bot error', { error: err.message });
      this.emit('error', err);
    });

    // Start polling — set running before start() to close the timing gap
    // where messages arrive before the onStart callback fires
    this.running = true;
    log.info('Starting Telegram bot (long polling)');
    this.bot.start({
      onStart: () => {
        log.info('Telegram bot started');
      },
    });
  }

  async stop() {
    if (this.bot) {
      await this.bot.stop();
      this.running = false;
      log.info('Telegram bot stopped');
    }
  }

  /**
   * Send a message to a Telegram user.
   *
   * @param {string} userId - Telegram user/chat ID
   * @param {string} text - Message text (supports Markdown)
   * @param {Object} [options]
   * @param {string} [options.parseMode] - 'MarkdownV2' or 'HTML'
   * @param {number} [options.replyToMessageId] - Message to reply to
   */
  async sendMessage(userId, text, options = {}) {
    if (!this.bot) {
      throw new Error('Telegram bot not started');
    }

    try {
      // Telegram has a 4096 char limit per message
      const MAX_LEN = 4000;
      if (text.length <= MAX_LEN) {
        await this.bot.api.sendMessage(userId, text, {
          parse_mode: options.parseMode,
          reply_to_message_id: options.replyToMessageId,
        });
      } else {
        // Split long messages
        const chunks = splitText(text, MAX_LEN);
        for (const chunk of chunks) {
          await this.bot.api.sendMessage(userId, chunk, {
            parse_mode: options.parseMode,
          });
        }
      }
    } catch (err) {
      log.error('Failed to send message', { userId, error: err.message });
      throw err;
    }
  }

  /**
   * Send a typing indicator to show Claudia is processing.
   */
  async sendTyping(chatId) {
    if (!this.bot) return;
    try {
      await this.bot.api.sendChatAction(chatId, 'typing');
    } catch {
      // Non-critical, ignore errors
    }
  }
}

/**
 * Split text into chunks at paragraph/sentence boundaries.
 */
function splitText(text, maxLen) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to split at paragraph boundary
    let splitAt = remaining.lastIndexOf('\n\n', maxLen);
    if (splitAt === -1 || splitAt < maxLen * 0.3) {
      // Try sentence boundary
      splitAt = remaining.lastIndexOf('. ', maxLen);
    }
    if (splitAt === -1 || splitAt < maxLen * 0.3) {
      // Force split at maxLen
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
