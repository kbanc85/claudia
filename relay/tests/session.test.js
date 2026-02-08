import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../src/session.js';

describe('SessionManager', () => {
  let manager;

  beforeEach(() => {
    // Short TTL for testing
    manager = new SessionManager({ ttlMinutes: 1 });
    // Clear any loaded sessions
    manager.sessions.clear();
  });

  it('should create a new session for unknown user', () => {
    const result = manager.getOrCreate('user123');
    assert.strictEqual(result.sessionId, null);
    assert.strictEqual(result.isNew, true);
  });

  it('should return existing session within TTL', () => {
    manager.getOrCreate('user123');
    manager.updateSessionId('user123', 'session-abc');

    const result = manager.getOrCreate('user123');
    assert.strictEqual(result.sessionId, 'session-abc');
    assert.strictEqual(result.isNew, false);
  });

  it('should create new session after TTL expires', () => {
    manager.ttlMs = 1; // 1ms TTL for testing
    manager.getOrCreate('user123');
    manager.updateSessionId('user123', 'session-old');

    // Wait for TTL to expire
    const start = Date.now();
    while (Date.now() - start < 5) {} // busy wait 5ms

    const result = manager.getOrCreate('user123');
    assert.strictEqual(result.sessionId, null);
    assert.strictEqual(result.isNew, true);
  });

  it('should track message count', () => {
    manager.getOrCreate('user123');
    const session = manager.sessions.get('user123');
    assert.strictEqual(session.messageCount, 1);

    manager.getOrCreate('user123');
    assert.strictEqual(session.messageCount, 2);

    manager.getOrCreate('user123');
    assert.strictEqual(session.messageCount, 3);
  });

  it('should handle multiple users independently', () => {
    manager.getOrCreate('user1');
    manager.updateSessionId('user1', 'session-1');
    manager.getOrCreate('user2');
    manager.updateSessionId('user2', 'session-2');

    const r1 = manager.getOrCreate('user1');
    const r2 = manager.getOrCreate('user2');

    assert.strictEqual(r1.sessionId, 'session-1');
    assert.strictEqual(r2.sessionId, 'session-2');
  });

  it('should clean up expired sessions', () => {
    manager.ttlMs = 1;
    manager.getOrCreate('user1');
    manager.getOrCreate('user2');

    // Wait for TTL
    const start = Date.now();
    while (Date.now() - start < 5) {}

    manager.cleanup();
    assert.strictEqual(manager.sessions.size, 0);
  });

  it('should serialize concurrency with withLock', async () => {
    const order = [];

    const p1 = manager.withLock('user1', async () => {
      order.push('start-1');
      await new Promise(r => setTimeout(r, 50));
      order.push('end-1');
      return 'result-1';
    });

    const p2 = manager.withLock('user1', async () => {
      order.push('start-2');
      await new Promise(r => setTimeout(r, 10));
      order.push('end-2');
      return 'result-2';
    });

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.strictEqual(r1, 'result-1');
    assert.strictEqual(r2, 'result-2');
    assert.deepStrictEqual(order, ['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('should not block different users with withLock', async () => {
    const order = [];

    const p1 = manager.withLock('user1', async () => {
      order.push('start-user1');
      await new Promise(r => setTimeout(r, 50));
      order.push('end-user1');
    });

    const p2 = manager.withLock('user2', async () => {
      order.push('start-user2');
      await new Promise(r => setTimeout(r, 10));
      order.push('end-user2');
    });

    await Promise.all([p1, p2]);

    // user2 should finish before user1 (no blocking between users)
    const user2End = order.indexOf('end-user2');
    const user1End = order.indexOf('end-user1');
    assert.ok(user2End < user1End, 'user2 should finish before user1');
  });
});
