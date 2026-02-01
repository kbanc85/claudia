/**
 * Main Gateway Service Orchestrator
 *
 * Wires together all components: config, auth, adapters, bridge, router, emitter.
 * Provides lifecycle management (start/stop) and health reporting.
 */

import { loadConfig, deepMerge } from './config.js';
import { AuthManager } from './utils/auth.js';
import { Bridge } from './bridge.js';
import { Router } from './router.js';
import { ProactiveEmitter } from './emitter.js';
import { TelegramAdapter } from './adapters/telegram.js';
import { SlackAdapter } from './adapters/slack.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('gateway');

export class Gateway {
  constructor(configOverrides = {}) {
    this.config = null;
    this.auth = null;
    this.bridge = null;
    this.router = null;
    this.emitter = null;
    this.adapters = new Map();
    this.running = false;
    this._configOverrides = configOverrides;
  }

  /**
   * Initialize and start all gateway components.
   */
  async start() {
    log.info('Starting Claudia Gateway');

    // 1. Load config
    this.config = loadConfig();
    this.config = deepMerge(this.config, this._configOverrides);

    // 2. Initialize auth
    this.auth = new AuthManager(this.config);

    // 3. Initialize adapters based on config
    await this._initAdapters();

    if (this.adapters.size === 0) {
      throw new Error(
        'No channels enabled. Enable at least one channel in ~/.claudia/gateway.json'
      );
    }

    // 4. Initialize bridge (Anthropic API + memory daemon)
    this.bridge = new Bridge(this.config);
    await this.bridge.start();

    // 5. Initialize router
    this.router = new Router({
      bridge: this.bridge,
      auth: this.auth,
      adapters: this.adapters,
    });
    this.router.start();

    // 6. Initialize proactive emitter
    this.emitter = new ProactiveEmitter({
      bridge: this.bridge,
      router: this.router,
      config: this.config.proactive,
    });
    this.emitter.start();

    // 7. Start adapters
    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.start();
        log.info(`Adapter started: ${name}`);
      } catch (err) {
        log.error(`Failed to start adapter: ${name}`, { error: err.message });
        // Continue with other adapters
      }
    }

    this.running = true;
    log.info('Claudia Gateway started', {
      channels: [...this.adapters.keys()],
      memoryAvailable: this.bridge.memoryAvailable,
    });
  }

  /**
   * Gracefully stop all components.
   */
  async stop() {
    log.info('Stopping Claudia Gateway');

    // Stop in reverse order
    if (this.emitter) this.emitter.stop();
    if (this.router) this.router.stop();

    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.stop();
      } catch (err) {
        log.warn(`Error stopping adapter ${name}`, { error: err.message });
      }
    }

    if (this.bridge) await this.bridge.stop();

    this.running = false;
    log.info('Claudia Gateway stopped');
  }

  /**
   * Get comprehensive status for health checks.
   */
  getStatus() {
    return {
      running: this.running,
      bridge: this.bridge?.getStatus(),
      router: this.router?.getStatus(),
      emitter: this.emitter?.getStatus(),
      adapters: Object.fromEntries(
        [...this.adapters.entries()].map(([name, a]) => [name, a.getStatus()])
      ),
    };
  }

  async _initAdapters() {
    const { channels } = this.config;

    if (channels.telegram?.enabled) {
      const adapter = new TelegramAdapter(channels.telegram);
      this.adapters.set('telegram', adapter);
      log.info('Telegram adapter initialized');
    }

    if (channels.slack?.enabled) {
      const adapter = new SlackAdapter(channels.slack);
      this.adapters.set('slack', adapter);
      log.info('Slack adapter initialized');
    }
  }
}
