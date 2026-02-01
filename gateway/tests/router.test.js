import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/router.js';

class MockAdapter {
  constructor(name) {
    this.name = name;
    this.running = true;
    this.sentMessages = [];
    this._listeners = {};
  }
  on(event, fn) {
    this._listeners[event] = this._listeners[event] || [];
    this._listeners[event].push(fn);
  }
  emit(event, data) {
    (this._listeners[event] || []).forEach((fn) => fn(data));
  }
  async sendMessage(userId, text) {
    this.sentMessages.push({ userId, text });
  }
  isRunning() {
    return this.running;
  }
  getStatus() {
    return { name: this.name, running: this.running, enabled: true };
  }
}

class MockBridge {
  constructor() {
    this.memoryAvailable = true;
    this.lastMessage = null;
  }
  async processMessage(message, history) {
    this.lastMessage = { message, history };
    return { text: `Echo: ${message.text}`, usage: { input_tokens: 10, output_tokens: 5 } };
  }
  getStatus() {
    return { anthropicReady: true, memoryAvailable: true };
  }
}

class MockAuth {
  constructor(allowed = new Set()) {
    this.allowed = allowed;
  }
  isAuthorized(channel, userId) {
    return this.allowed.has(String(userId));
  }
}

describe('Router', () => {
  it('routes authorized messages through bridge', async () => {
    const adapter = new MockAdapter('telegram');
    const bridge = new MockBridge();
    const auth = new MockAuth(new Set(['123']));
    const adapters = new Map([['telegram', adapter]]);

    const router = new Router({ bridge, auth, adapters });
    router.start();

    const replyTexts = [];
    const message = {
      channel: 'telegram',
      userId: '123',
      userName: 'Test User',
      text: 'Hello Claudia',
      metadata: {
        ctx: { reply: async (text) => replyTexts.push(text) },
      },
    };

    await router._handleMessage(message);

    assert.ok(bridge.lastMessage);
    assert.equal(bridge.lastMessage.message.text, 'Hello Claudia');
    assert.equal(replyTexts.length, 1);
    assert.equal(replyTexts[0], 'Echo: Hello Claudia');

    router.stop();
  });

  it('rejects unauthorized messages', async () => {
    const adapter = new MockAdapter('telegram');
    const bridge = new MockBridge();
    const auth = new MockAuth(new Set(['123']));
    const adapters = new Map([['telegram', adapter]]);

    const router = new Router({ bridge, auth, adapters });
    router.start();

    await router._handleMessage({
      channel: 'telegram',
      userId: '999',
      userName: 'Unauthorized',
      text: 'Hello',
      metadata: {},
    });

    assert.equal(bridge.lastMessage, null);
    router.stop();
  });

  it('maintains session history', async () => {
    const adapter = new MockAdapter('telegram');
    const bridge = new MockBridge();
    const auth = new MockAuth(new Set(['500']));
    const adapters = new Map([['telegram', adapter]]);

    const router = new Router({ bridge, auth, adapters });
    router.start();

    const makeMsg = (text) => ({
      channel: 'telegram',
      userId: '500',
      userName: 'HistoryTest',
      text,
      metadata: { ctx: { reply: async () => {} } },
    });

    await router._handleMessage(makeMsg('First message'));
    await router._handleMessage(makeMsg('Second message'));

    assert.equal(bridge.lastMessage.history.length, 1);
    assert.equal(bridge.lastMessage.history[0].user, 'First message');
    router.stop();
  });

  it('sends proactive messages', async () => {
    const adapter = new MockAdapter('telegram');
    const bridge = new MockBridge();
    const auth = new MockAuth(new Set());
    const adapters = new Map([['telegram', adapter]]);

    const router = new Router({ bridge, auth, adapters });
    router.start();

    const sent = await router.sendProactive('telegram', '123', 'Reminder: Call Bob');

    assert.equal(sent, true);
    assert.equal(adapter.sentMessages.length, 1);
    assert.equal(adapter.sentMessages[0].text, 'Reminder: Call Bob');
    router.stop();
  });
});
