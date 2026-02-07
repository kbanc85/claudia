/**
 * Telegram bot adapter for Claudia Relay
 *
 * Uses grammY for long polling. Handles auth, typing indicators,
 * and message chunking. Delegates all intelligence to claude-runner.
 */

import { Bot, InputFile } from 'grammy';
import { writeFile, unlink, mkdtemp, rmdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
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

  async _downloadFile(ctx, fileId) {
    const file = await ctx.api.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Create temp directory and save file
    const tempDir = await mkdtemp(join(tmpdir(), 'claudia-relay-'));
    const ext = file.file_path.split('.').pop() || 'bin';
    const filename = `file_${Date.now()}.${ext}`;
    const filePath = join(tempDir, filename);
    await writeFile(filePath, buffer);

    return { path: filePath, name: filename, tempDir };
  }

  async _sendResponseWithFiles(ctx, text) {
    // Detect file paths in response (absolute paths to common file types)
    const filePathRegex = /(?:^|\s)(\/[\w./-]+\.(?:png|jpg|jpeg|gif|webp|pdf|svg|csv|xlsx|docx|txt|html|json))\b/gi;
    const matches = [...text.matchAll(filePathRegex)];
    const filePaths = matches
      .map(m => m[1])
      .filter(p => existsSync(p));

    // Send detected files
    for (const filePath of filePaths) {
      try {
        const ext = filePath.split('.').pop().toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
        if (isImage) {
          await ctx.replyWithPhoto(new InputFile(filePath));
        } else {
          await ctx.replyWithDocument(new InputFile(filePath));
        }
      } catch (err) {
        console.error(`[relay:telegram] Failed to send file ${filePath}: ${err.message}`);
      }
    }

    // Strip file paths from text before sending
    let cleanText = text;
    for (const filePath of filePaths) {
      cleanText = cleanText.replace(filePath, '').replace(/\s{2,}/g, ' ');
    }

    return cleanText.trim();
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

          // Check for file paths in response and send them
          const cleanText = await this._sendResponseWithFiles(ctx, result.text);

          if (cleanText) {
            const html = markdownToTelegramHTML(cleanText);
            const chunks = chunkText(html);
            for (const chunk of chunks) {
              try {
                await ctx.reply(chunk, { parse_mode: 'HTML' });
              } catch {
                // HTML parse failed (malformed tags), fall back to plain text
                await ctx.reply(chunk.replace(/<[^>]+>/g, ''));
              }
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

    // Handle photo messages
    this.bot.on('message:photo', async (ctx) => {
      if (ctx.chat.type !== 'private') return;

      const userId = String(ctx.from.id);

      // Auth check
      if (this.allowedUsers.size > 0 && !this.allowedUsers.has(userId)) {
        if (!this.rejectedUsers.has(userId)) {
          this.rejectedUsers.add(userId);
          await ctx.reply("Sorry, I'm not configured to chat with you.");
        }
        return;
      }

      // Get highest resolution photo
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      const caption = ctx.message.caption || 'Describe this image.';

      console.log(`[relay:telegram] Photo from ${userId} (${photo.width}x${photo.height}): ${caption.slice(0, 80)}`);

      let tempFiles = [];
      await this.sessions.withLock(userId, async () => {
        const typingInterval = setInterval(async () => {
          try { await ctx.api.sendChatAction(ctx.chat.id, 'typing'); } catch {}
        }, 5000);
        try { await ctx.api.sendChatAction(ctx.chat.id, 'typing'); } catch {}

        try {
          const downloaded = await this._downloadFile(ctx, photo.file_id);
          tempFiles.push(downloaded);

          const { sessionId } = this.sessions.getOrCreate(userId);

          const result = await runClaude(caption, {
            sessionId,
            timeoutMs: this.claudeConfig.timeoutMs,
            claudiaDir: this.claudeConfig.claudiaDir,
            permissionMode: this.claudeConfig.permissionMode,
            files: [{ name: downloaded.name, path: downloaded.path }],
          });

          if (result.sessionId) {
            this.sessions.updateSessionId(userId, result.sessionId);
          }

          console.log(`[relay:telegram] Photo response for ${userId}: ${result.durationMs}ms`);

          // Check for file paths in response and send them
          const cleanText = await this._sendResponseWithFiles(ctx, result.text);

          if (cleanText) {
            const html = markdownToTelegramHTML(cleanText);
            const chunks = chunkText(html);
            for (const chunk of chunks) {
              try {
                await ctx.reply(chunk, { parse_mode: 'HTML' });
              } catch {
                await ctx.reply(chunk.replace(/<[^>]+>/g, ''));
              }
            }
          }
        } catch (err) {
          console.error(`[relay:telegram] Error processing photo: ${err.message}`);
          await ctx.reply(`Something went wrong processing your image: ${err.message}`);
        } finally {
          clearInterval(typingInterval);
          // Clean up temp files
          for (const f of tempFiles) {
            try { await unlink(f.path); } catch {}
            try { await rmdir(f.tempDir); } catch {}
          }
        }
      });
    });

    // Handle document messages
    this.bot.on('message:document', async (ctx) => {
      if (ctx.chat.type !== 'private') return;

      const userId = String(ctx.from.id);

      if (this.allowedUsers.size > 0 && !this.allowedUsers.has(userId)) {
        if (!this.rejectedUsers.has(userId)) {
          this.rejectedUsers.add(userId);
          await ctx.reply("Sorry, I'm not configured to chat with you.");
        }
        return;
      }

      const doc = ctx.message.document;
      const caption = ctx.message.caption || `Process this file: ${doc.file_name}`;

      console.log(`[relay:telegram] Document from ${userId}: ${doc.file_name} (${doc.file_size} bytes)`);

      let tempFiles = [];
      await this.sessions.withLock(userId, async () => {
        const typingInterval = setInterval(async () => {
          try { await ctx.api.sendChatAction(ctx.chat.id, 'typing'); } catch {}
        }, 5000);
        try { await ctx.api.sendChatAction(ctx.chat.id, 'typing'); } catch {}

        try {
          const downloaded = await this._downloadFile(ctx, doc.file_id);
          // Use original filename if available
          const originalName = doc.file_name || downloaded.name;
          tempFiles.push(downloaded);

          const { sessionId } = this.sessions.getOrCreate(userId);

          const result = await runClaude(caption, {
            sessionId,
            timeoutMs: this.claudeConfig.timeoutMs,
            claudiaDir: this.claudeConfig.claudiaDir,
            permissionMode: this.claudeConfig.permissionMode,
            files: [{ name: originalName, path: downloaded.path }],
          });

          if (result.sessionId) {
            this.sessions.updateSessionId(userId, result.sessionId);
          }

          console.log(`[relay:telegram] Document response for ${userId}: ${result.durationMs}ms`);

          const cleanText = await this._sendResponseWithFiles(ctx, result.text);

          if (cleanText) {
            const html = markdownToTelegramHTML(cleanText);
            const chunks = chunkText(html);
            for (const chunk of chunks) {
              try {
                await ctx.reply(chunk, { parse_mode: 'HTML' });
              } catch {
                await ctx.reply(chunk.replace(/<[^>]+>/g, ''));
              }
            }
          }
        } catch (err) {
          console.error(`[relay:telegram] Error processing document: ${err.message}`);
          await ctx.reply(`Something went wrong processing your file: ${err.message}`);
        } finally {
          clearInterval(typingInterval);
          for (const f of tempFiles) {
            try { await unlink(f.path); } catch {}
            try { await rmdir(f.tempDir); } catch {}
          }
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
