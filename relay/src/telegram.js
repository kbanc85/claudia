/**
 * Telegram bot adapter for Claudia Relay
 *
 * Uses grammY for long polling. Handles auth, typing indicators,
 * and message chunking. Delegates all intelligence to claude-runner.
 */

import { Bot } from 'grammy';
import { chunkText } from './chunker.js';
import { runClaude } from './claude-runner.js';
import { markdownToTelegramHTML } from './formatter.js';

export class TelegramBot {
  /**
   * @param {Object} options
   * @param {string} options.token - Telegram bot token
   * @param {string[]} options.allowedUsers - Telegram user IDs allowed to interact
   * @param {Object} options.sessionManager - SessionManager instance
   * @param {Object} options.claudeConfig - { timeoutMs, permissionMode, claudiaDir }
   */
  constructor({ token, allowedUsers, sessionManager, claudeConfig }) {
    if (!token) {
      throw new Error('Telegram bot token required. Set TELEGRAM_BOT_TOKEN env var.');
    }

    this.bot = new Bot(token);
    this.allowedUsers = new Set(allowedUsers.map(String));
    this.sessions = sessionManager;
    this.claudeConfig = claudeConfig;
    this.rejectedUsers = new Set(); // Track users who've already been rejected

    this._setupHandlers();
  }

  _setupHandlers() {
    // Handle text messages (DMs only)
    this.bot.on('message:text', async (ctx) => {
      if (ctx.chat.type !== 'private') return;

      const userId = String(ctx.from.id);

      // Auth check
      if (this.allowedUsers.size > 0 && !this.allowedUsers.has(userId)) {
        if (!this.rejectedUsers.has(userId)) {
          this.rejectedUsers.add(userId);
          await ctx.reply("Sorry, I'm not configured to chat with you. Ask my owner to add your user ID to the relay config.");
          console.log(`[relay:telegram] Rejected unauthorized user: ${userId}`);
        }
        return;
      }

      const text = ctx.message.text;
      console.log(`[relay:telegram] Message from ${userId}: ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`);

      // Process with concurrency guard (one claude -p per user at a time)
      await this.sessions.withLock(userId, async () => {
        // Start typing indicator (refresh every 5s)
        const typingInterval = setInterval(async () => {
          try {
            await ctx.api.sendChatAction(ctx.chat.id, 'typing');
          } catch {
            // Non-critical
          }
        }, 5000);

        // Send initial typing indicator immediately
        try {
          await ctx.api.sendChatAction(ctx.chat.id, 'typing');
        } catch {
          // Non-critical
        }

        try {
          // Get or create session for --resume
          const { sessionId } = this.sessions.getOrCreate(userId);

          // Run claude -p
          const result = await runClaude(text, {
            sessionId,
            timeoutMs: this.claudeConfig.timeoutMs,
            claudiaDir: this.claudeConfig.claudiaDir,
            permissionMode: this.claudeConfig.permissionMode,
          });

          // Update session with response's session ID
          if (result.sessionId) {
            this.sessions.updateSessionId(userId, result.sessionId);
          }

          console.log(`[relay:telegram] Response for ${userId}: ${result.durationMs}ms, ${result.text.length} chars`);

          // Convert markdown to Telegram HTML, chunk, and send
          const html = markdownToTelegramHTML(result.text);
          const chunks = chunkText(html);
          for (const chunk of chunks) {
            try {
              await ctx.reply(chunk, { parse_mode: 'HTML' });
            } catch {
              // HTML parse failed (malformed tags), fall back to plain text
              await ctx.reply(chunk.replace(/<[^>]+>/g, ''));
            }
          }
        } catch (err) {
          console.error(`[relay:telegram] Error processing message: ${err.message}`);
          await ctx.reply(`Something went wrong: ${err.message}`);
        } finally {
          clearInterval(typingInterval);
        }
      });
    });

    // Error handling
    this.bot.catch((err) => {
      console.error(`[relay:telegram] Bot error: ${err.message}`);
    });
  }

  /**
   * Start the Telegram bot (long polling).
   */
  async start() {
    console.log('[relay:telegram] Starting Telegram bot (long polling)');
    this.bot.start({
      onStart: () => {
        console.log('[relay:telegram] Telegram bot started');
      },
    });
  }

  /**
   * Stop the Telegram bot.
   */
  async stop() {
    await this.bot.stop();
    console.log('[relay:telegram] Telegram bot stopped');
  }
}
