import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectRuntimeHost, resolveInstallArgs } from '../bin/host-detection.js';

test('detectRuntimeHost recognizes Codex session signals', () => {
  assert.deepEqual(detectRuntimeHost({ CODEX_THREAD_ID: 'thread-123' }), {
    host: 'codex',
    signal: 'CODEX_THREAD_ID',
  });
});

test('detectRuntimeHost recognizes Claude Code session signals', () => {
  assert.deepEqual(detectRuntimeHost({ CLAUDECODE: '1' }), {
    host: 'claude',
    signal: 'CLAUDECODE',
  });
});

test('detectRuntimeHost recognizes Grok session signals', () => {
  assert.deepEqual(detectRuntimeHost({ GROK_SESSION_ID: 'grok-123' }), {
    host: 'grok',
    signal: 'GROK_SESSION_ID',
  });
});

test('runtime detection ignores installed-client and credential variables', () => {
  assert.deepEqual(detectRuntimeHost({
    CODEX_HOME: '/tmp/codex',
    GROK_HOME: '/tmp/grok',
    ANTHROPIC_API_KEY: 'secret',
    XAI_API_KEY: 'secret',
  }), { host: null, signal: null });
});

test('bare install in any detected agent targets the folder already open', () => {
  for (const [env, host] of [
    [{ CODEX_THREAD_ID: 'codex-1' }, 'codex'],
    [{ CLAUDECODE: '1' }, 'claude'],
    [{ GROK_SESSION_ID: 'grok-1' }, 'grok'],
  ]) {
    const result = resolveInstallArgs([], env);
    assert.equal(result.host, host);
    assert.equal(result.installArg, undefined);
    assert.equal(result.defaultToCurrentDir, true);
  }
});

test('bare install outside an agent retains the legacy ./claudia default', () => {
  assert.deepEqual(resolveInstallArgs([], {}), {
    host: 'claude',
    explicitHost: null,
    detectedHost: null,
    detectionSignal: null,
    installArg: undefined,
    defaultToCurrentDir: false,
  });
});

test('explicit host overrides detection and defaults to the current folder', () => {
  const result = resolveInstallArgs(['grok'], { CODEX_THREAD_ID: 'codex-1' });
  assert.equal(result.host, 'grok');
  assert.equal(result.explicitHost, 'grok');
  assert.equal(result.detectionSignal, 'argument');
  assert.equal(result.defaultToCurrentDir, true);

  const targeted = resolveInstallArgs(['claude', '/tmp/project'], {});
  assert.equal(targeted.host, 'claude');
  assert.equal(targeted.installArg, '/tmp/project');
  assert.equal(targeted.defaultToCurrentDir, false);
});
