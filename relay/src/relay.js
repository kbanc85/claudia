/**
 * Claudia Relay orchestrator
 *
 * Wires together: config + runner + sessions + telegram + lock.
 * Single start()/stop() interface.
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { loadConfig } from './config.js';
import { SessionManager } from './session.js';
import { TelegramBot } from './telegram.js';
import * as lock from './lock.js';

export class Relay {
  constructor() {
    this.config = null;
    this.sessions = null;
    this.telegram = null;
  }

  /**
   * Start the relay. Validates config, acquires lock, starts bot.
   */
  async start() {
    // Load config
    this.config = loadConfig();

    // Validate claudiaDir
    const claudiaDir = this.config.claudiaDir;
    if (!claudiaDir) {
      throw new Error(
        'claudiaDir not set. Configure it in ~/.claudia/relay.json or set CLAUDIA_DIR env var.\n' +
        'This should point to your Claudia install directory (where CLAUDE.md lives).'
      );
    }

    const resolvedDir = resolve(claudiaDir);
    if (!existsSync(resolvedDir)) {
      throw new Error(`claudiaDir does not exist: ${resolvedDir}`);
    }

    // Check claude CLI is available
    try {
      execFileSync('claude', ['--version'], { stdio: 'pipe' });
    } catch {
      throw new Error(
        'claude CLI not found in PATH. Install Claude Code: https://docs.anthropic.com/en/docs/claude-code'
      );
    }

    // Validate Telegram token
    const token = this.config.telegram.token;
    if (!token) {
      throw new Error(
        'Telegram bot token required. Set TELEGRAM_BOT_TOKEN env var or telegram.token in relay.json.'
      );
    }

    // Acquire lock (single instance)
    lock.acquire();

    // Create session manager
    this.sessions = new SessionManager({
      ttlMinutes: this.config.session.ttlMinutes,
    });

    // Session cleanup every 10 minutes
    this._cleanupInterval = setInterval(() => {
      this.sessions.cleanup();
    }, 10 * 60 * 1000);

    // Create and start Telegram bot
    this.telegram = new TelegramBot({
      token,
      allowedUsers: this.config.telegram.allowedUsers || [],
      sessionManager: this.sessions,
      claudeConfig: {
        timeoutMs: this.config.claude.timeoutMs,
        permissionMode: this.config.claude.permissionMode,
        claudiaDir: resolvedDir,
      },
    });

    await this.telegram.start();

    console.log('[relay] Claudia Relay started');
    console.log(`[relay]   claudiaDir: ${resolvedDir}`);
    console.log(`[relay]   permission mode: ${this.config.claude.permissionMode}`);
    console.log(`[relay]   session TTL: ${this.config.session.ttlMinutes} min`);
    console.log(`[relay]   allowed users: ${this.config.telegram.allowedUsers?.length || 'all'}`);
  }

  /**
   * Gracefully stop the relay.
   */
  async stop() {
    console.log('[relay] Stopping Claudia Relay...');

    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
    }

    if (this.telegram) {
      await this.telegram.stop();
    }

    lock.release();
    console.log('[relay] Claudia Relay stopped');
  }
}
