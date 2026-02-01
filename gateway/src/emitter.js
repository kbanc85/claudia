/**
 * Proactive Emitter for Claudia Gateway
 *
 * Periodically polls the memory daemon for predictions (reminders, suggestions,
 * warnings, insights) and pushes them to configured channels.
 */

import { createLogger } from './utils/logger.js';

const log = createLogger('emitter');

export class ProactiveEmitter {
  /**
   * @param {Object} options
   * @param {import('./bridge.js').Bridge} options.bridge - Core bridge
   * @param {import('./router.js').Router} options.router - Router for sending messages
   * @param {Object} options.config - Proactive config section
   */
  constructor({ bridge, router, config }) {
    this.bridge = bridge;
    this.router = router;
    this.config = config;
    this._interval = null;
    this._sentPredictions = new Set(); // Track sent prediction IDs to avoid duplicates
    this.running = false;
  }

  start() {
    if (!this.config.enabled) {
      log.info('Proactive notifications disabled');
      return;
    }

    if (!this.config.defaultUserId) {
      log.warn('No defaultUserId configured for proactive notifications');
      return;
    }

    const intervalMs = this.config.pollIntervalMs || 300000;
    log.info('Starting proactive emitter', { intervalMs, channel: this.config.defaultChannel });

    // Initial check after a short delay
    setTimeout(() => this._poll(), 10000);

    // Regular polling
    this._interval = setInterval(() => this._poll(), intervalMs);
    this.running = true;
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this.running = false;
    log.info('Proactive emitter stopped');
  }

  async _poll() {
    if (!this.bridge.memoryAvailable) {
      log.debug('Memory not available, skipping prediction poll');
      return;
    }

    try {
      const predictions = await this.bridge.getPredictions(5);

      for (const prediction of predictions) {
        const predId = prediction.id || prediction.content;
        if (this._sentPredictions.has(predId)) continue;

        // Format the prediction as a notification
        const text = this._formatPrediction(prediction);

        // Send to configured channel and user
        const sent = await this.router.sendProactive(
          this.config.defaultChannel,
          this.config.defaultUserId,
          text
        );

        if (sent) {
          this._sentPredictions.add(predId);
          log.info('Sent proactive notification', {
            type: prediction.prediction_type,
            predictionId: predId,
          });
        }
      }

      // Limit the size of sent tracking set
      if (this._sentPredictions.size > 500) {
        const entries = [...this._sentPredictions];
        this._sentPredictions = new Set(entries.slice(-250));
      }
    } catch (err) {
      log.warn('Prediction poll failed', { error: err.message });
    }
  }

  _formatPrediction(prediction) {
    const type = prediction.prediction_type || 'insight';
    const icons = {
      reminder: 'Reminder',
      suggestion: 'Suggestion',
      warning: 'Heads up',
      insight: 'Insight',
    };

    const prefix = icons[type] || 'Note';
    return `${prefix}: ${prediction.content}`;
  }

  getStatus() {
    return {
      running: this.running,
      enabled: this.config.enabled,
      sentCount: this._sentPredictions.size,
    };
  }
}
