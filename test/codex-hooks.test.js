import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const startHook = new URL('../host-adapters/codex/session-start.mjs', import.meta.url).pathname;
const endHook = new URL('../host-adapters/codex/session-end.mjs', import.meta.url).pathname;

function makeTemp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('SessionStart emits Codex additionalContext and fails open without the daemon', () => {
  const cwd = makeTemp('claudia-hook-cwd-');
  try {
    const result = spawnSync(process.execPath, [startHook], {
      input: JSON.stringify({ cwd, source: 'startup' }),
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDIA_CODEX_BRIEFING_URL: 'http://127.0.0.1:9/briefing',
      },
    });
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    const context = output.hookSpecificOutput.additionalContext;
    assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(context, /Claudia runtime is active/);
    assert.match(context, /identify and speak as Claudia/);
    assert.match(context, /REQUIRED FIRST-RUN GATE/);
    assert.match(context, /onboarding skill/);
    assert.match(context, /degraded mode/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('SessionEnd appends a Codex transcript entry without touching SQLite', () => {
  const fakeHome = makeTemp('claudia-hook-home-');
  try {
    const payload = {
      session_id: 'thr_codex_123',
      transcript_path: '/tmp/rollout.jsonl',
      reason: 'other',
    };
    const result = spawnSync(process.execPath, [endHook], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, HOME: fakeHome },
    });
    assert.equal(result.status, 0);

    const queue = join(fakeHome, '.claudia', 'sessions_pending.jsonl');
    const entry = JSON.parse(readFileSync(queue, 'utf8').trim());
    assert.equal(entry.session_id, payload.session_id);
    assert.equal(entry.transcript_path, payload.transcript_path);
    assert.equal(entry.source_channel, 'codex');
    assert.equal(entry.host, 'codex');
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});
