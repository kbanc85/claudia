import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkForNewerVersion, isNewerVersion } from '../bin/update-check.js';

test('isNewerVersion compares semantic release numbers', () => {
  assert.equal(isNewerVersion('1.68.0', '1.67.1'), true);
  assert.equal(isNewerVersion('1.67.1', '1.67.1'), false);
  assert.equal(isNewerVersion('1.67.0', '1.67.1'), false);
  assert.equal(isNewerVersion('2.0.0', '1.99.99'), true);
});

test('plain invocation resolves npm latest when the cached copy is stale', async () => {
  const requested = [];
  const latest = await checkForNewerVersion('1.67.1', {
    env: {},
    argv: ['node', 'get-claudia'],
    fetchImpl: async (url) => {
      requested.push(url);
      return { ok: true, json: async () => ({ version: '1.68.0' }) };
    },
  });
  assert.equal(latest, '1.68.0');
  assert.deepEqual(requested, ['https://registry.npmjs.org/get-claudia/latest']);
});

test('latest check fails open offline and avoids re-exec loops', async () => {
  const offline = await checkForNewerVersion('1.67.1', {
    env: {},
    argv: ['node', 'get-claudia'],
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.equal(offline, null);

  const skipped = await checkForNewerVersion('1.67.1', {
    env: { CLAUDIA_SKIP_UPDATE_CHECK: '1' },
    argv: ['node', 'get-claudia'],
    fetchImpl: async () => { throw new Error('must not fetch'); },
  });
  assert.equal(skipped, null);
});
