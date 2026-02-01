import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateExampleConfig, loadConfig } from '../src/config.js';

describe('Config', () => {
  it('generateExampleConfig returns valid structure', () => {
    const config = generateExampleConfig();

    assert.ok(config);
    assert.equal(config.anthropicApiKey, '(set ANTHROPIC_API_KEY env var, or leave empty for Ollama)');
    assert.equal(config.channels.telegram.enabled, true);
    assert.equal(config.channels.telegram.token, '(set TELEGRAM_BOT_TOKEN env var)');
    assert.ok(config.channels.slack);
    assert.ok(config.memoryDaemon);
    assert.ok(config.proactive);
    assert.equal(config.gateway.port, 3849);
  });

  it('loadConfig returns defaults when no config file', () => {
    const config = loadConfig();

    assert.equal(config.model, 'claude-sonnet-4-20250514');
    assert.equal(config.maxTokens, 2048);
    assert.equal(config.channels.telegram.enabled, false);
    assert.equal(config.channels.slack.enabled, false);
  });
});
