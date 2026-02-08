import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateExampleConfig,
  loadConfig,
  deepMerge,
  writePidFile,
  readPidFile,
  removePidFile,
  PID_PATH,
} from '../src/config.js';

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

  it('loadConfig returns a config with expected structure', () => {
    const config = loadConfig();

    // These fields always exist regardless of whether a config file is present
    assert.ok(config.model);
    assert.ok(typeof config.maxTokens === 'number');
    assert.ok(config.channels);
    assert.ok('telegram' in config.channels);
    assert.ok('slack' in config.channels);
    assert.ok(typeof config.gateway.port === 'number');
  });
});

describe('deepMerge', () => {
  it('merges nested objects', () => {
    const defaults = { a: 1, nested: { x: 10, y: 20 } };
    const overrides = { nested: { y: 99 } };
    const result = deepMerge(defaults, overrides);

    assert.equal(result.a, 1);
    assert.equal(result.nested.x, 10);
    assert.equal(result.nested.y, 99);
  });

  it('overrides scalar values', () => {
    const defaults = { a: 1, b: 'hello' };
    const overrides = { a: 42 };
    const result = deepMerge(defaults, overrides);

    assert.equal(result.a, 42);
    assert.equal(result.b, 'hello');
  });

  it('preserves arrays from overrides', () => {
    const defaults = { items: [1, 2] };
    const overrides = { items: [3, 4, 5] };
    const result = deepMerge(defaults, overrides);

    assert.deepEqual(result.items, [3, 4, 5]);
  });

  it('adds new keys from overrides', () => {
    const defaults = { a: 1 };
    const overrides = { b: 2 };
    const result = deepMerge(defaults, overrides);

    assert.equal(result.a, 1);
    assert.equal(result.b, 2);
  });

  it('preserves per-channel model overrides', () => {
    const defaults = {
      model: 'claude-sonnet-4-20250514',
      channels: {
        telegram: { enabled: false, token: '', allowedUsers: [], model: '' },
        slack: { enabled: false, model: '' },
      },
    };
    const overrides = {
      channels: {
        telegram: { enabled: true, model: 'claude-haiku-4-5-20251001' },
      },
    };
    const result = deepMerge(defaults, overrides);

    assert.equal(result.model, 'claude-sonnet-4-20250514');
    assert.equal(result.channels.telegram.model, 'claude-haiku-4-5-20251001');
    assert.equal(result.channels.telegram.enabled, true);
    assert.equal(result.channels.telegram.allowedUsers.length, 0);
    assert.equal(result.channels.slack.model, '');
  });
});

describe('PID file operations', () => {
  it('writes and reads PID file', () => {
    writePidFile(12345);
    const pid = readPidFile();
    assert.equal(pid, 12345);
    removePidFile();
  });

  it('returns null when PID file does not exist', () => {
    // Ensure clean state
    try { unlinkSync(PID_PATH); } catch {}
    const pid = readPidFile();
    assert.equal(pid, null);
  });

  it('removePidFile does not throw when file missing', () => {
    try { unlinkSync(PID_PATH); } catch {}
    // Should not throw
    removePidFile();
  });
});
