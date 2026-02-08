import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Bridge } from '../src/bridge.js';

describe('Bridge._resolveModel', () => {
  it('uses per-channel model when set', () => {
    const bridge = new Bridge({
      model: 'claude-sonnet-4-20250514',
      channels: {
        telegram: { model: 'claude-haiku-4-5-20251001' },
        slack: { model: '' },
      },
    });
    bridge.provider = 'anthropic';

    assert.equal(bridge._resolveModel('telegram'), 'claude-haiku-4-5-20251001');
  });

  it('falls back to global Anthropic model for channel with empty model', () => {
    const bridge = new Bridge({
      model: 'claude-sonnet-4-20250514',
      channels: {
        telegram: { model: '' },
      },
    });
    bridge.provider = 'anthropic';

    assert.equal(bridge._resolveModel('telegram'), 'claude-sonnet-4-20250514');
  });

  it('falls back to global model for unknown channel', () => {
    const bridge = new Bridge({
      model: 'claude-sonnet-4-20250514',
      channels: {
        telegram: { model: 'claude-haiku-4-5-20251001' },
      },
    });
    bridge.provider = 'anthropic';

    assert.equal(bridge._resolveModel('discord'), 'claude-sonnet-4-20250514');
  });

  it('resolves Ollama model with per-channel override', () => {
    const bridge = new Bridge({
      model: 'claude-sonnet-4-20250514',
      ollama: { model: 'qwen3:4b' },
      channels: {
        telegram: { model: 'llama3:8b' },
      },
    });
    bridge.provider = 'ollama';

    assert.equal(bridge._resolveModel('telegram'), 'llama3:8b');
  });

  it('falls back to Ollama global model when channel has no override', () => {
    const bridge = new Bridge({
      model: 'claude-sonnet-4-20250514',
      ollama: { model: 'qwen3:4b' },
      channels: {
        telegram: { model: '' },
      },
    });
    bridge.provider = 'ollama';

    assert.equal(bridge._resolveModel('telegram'), 'qwen3:4b');
  });
});

describe('Bridge._buildSystemPrompt', () => {
  it('uses loaded personality when available', () => {
    const bridge = new Bridge({ channels: {} });
    bridge._personality = 'You are Claudia, the real deal.';

    const prompt = bridge._buildSystemPrompt('', 'Kamil', 'telegram');
    assert.ok(prompt.startsWith('You are Claudia, the real deal.'));
    assert.ok(prompt.includes('Channel: telegram'));
    assert.ok(prompt.includes('User: Kamil'));
  });

  it('falls back to DEFAULT_SYSTEM_PROMPT when no personality', () => {
    const bridge = new Bridge({ channels: {} });
    bridge._personality = null;

    const prompt = bridge._buildSystemPrompt('', 'Kamil', 'telegram');
    assert.ok(prompt.includes('warm, sharp, and proactive'));
    assert.ok(prompt.includes('Channel: telegram'));
  });

  it('includes memory context when provided', () => {
    const bridge = new Bridge({ channels: {} });
    bridge._personality = 'Claudia personality';

    const prompt = bridge._buildSystemPrompt('## Relevant Memories\n- User likes coffee', 'Kamil', 'telegram');
    assert.ok(prompt.includes('# Memory Context'));
    assert.ok(prompt.includes('User likes coffee'));
  });
});
