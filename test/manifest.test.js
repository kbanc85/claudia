// Tests for the manifest library that powers user-skill preservation on upgrade.
// Test-forward: every case here describes behavior before the implementation exists.
// Run with: node --test test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import {
  hashFile,
  generateManifest,
  detectConflicts,
  resolveBakPath,
  applyResolution,
} from '../bin/manifest-lib.js';

// ---------- helpers ----------

function makeTree(structure) {
  const root = mkdtempSync(join(tmpdir(), 'claudia-manifest-test-'));
  for (const [relPath, content] of Object.entries(structure)) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

const BASIC_TEMPLATE = {
  'CLAUDE.md': '# CLAUDE\nbase version\n',
  '.claude/skills/morning-brief/SKILL.md': '# Morning Brief\nv1 body\n',
  '.claude/skills/meditate/SKILL.md': '# Meditate\nv1\n',
  '.claude/rules/judgment-active.md': '# Judgment\nv1\n',
  // These must be excluded from the manifest:
  '.claude/hooks/session-start.sh': '#!/bin/sh\necho hi\n',
  '.claude/agents/some-agent.md': '# Agent\n',
  '.claude/settings.local.json': '{"theme":"dark"}',
  'workspaces/demo/notes.md': 'user data',
};

// ---------- hashFile ----------

test('hashFile returns stable SHA-256 hex for a known input', () => {
  const dir = makeTree({ 'a.txt': 'hello world' });
  try {
    const hash = hashFile(join(dir, 'a.txt'));
    // SHA-256 of "hello world"
    assert.equal(hash, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  } finally {
    cleanup(dir);
  }
});

test('hashFile produces different hashes for different content', () => {
  const dir = makeTree({ 'a.txt': 'foo', 'b.txt': 'bar' });
  try {
    assert.notEqual(hashFile(join(dir, 'a.txt')), hashFile(join(dir, 'b.txt')));
  } finally {
    cleanup(dir);
  }
});

test('hashFile throws a clear error on missing file', () => {
  assert.throws(
    () => hashFile('/definitely/does/not/exist/xyz.txt'),
    /ENOENT|no such file|not found/i,
  );
});

// ---------- generateManifest ----------

test('generateManifest includes all tracked files under scope rules', () => {
  const dir = makeTree(BASIC_TEMPLATE);
  try {
    const manifest = generateManifest(dir, { version: '1.57.0' });
    const keys = Object.keys(manifest.files).sort();
    assert.deepEqual(keys, [
      '.claude/rules/judgment-active.md',
      '.claude/skills/meditate/SKILL.md',
      '.claude/skills/morning-brief/SKILL.md',
      'CLAUDE.md',
    ]);
  } finally {
    cleanup(dir);
  }
});

test('generateManifest excludes hooks, agents, settings.local.json, workspaces', () => {
  const dir = makeTree(BASIC_TEMPLATE);
  try {
    const manifest = generateManifest(dir, { version: '1.57.0' });
    const keys = Object.keys(manifest.files);
    assert.ok(!keys.some((k) => k.includes('hooks/')), 'hooks/ should be excluded');
    assert.ok(!keys.some((k) => k.includes('agents/')), 'agents/ should be excluded');
    assert.ok(!keys.some((k) => k.includes('settings.local.json')), 'settings.local.json should be excluded');
    assert.ok(!keys.some((k) => k.startsWith('workspaces/')), 'workspaces/ should be excluded');
  } finally {
    cleanup(dir);
  }
});

test('generateManifest uses forward-slash paths in keys regardless of OS', () => {
  const dir = makeTree(BASIC_TEMPLATE);
  try {
    const manifest = generateManifest(dir, { version: '1.57.0' });
    for (const key of Object.keys(manifest.files)) {
      assert.ok(!key.includes('\\'), `key ${key} should not contain backslashes`);
    }
  } finally {
    cleanup(dir);
  }
});

test('generateManifest is idempotent: two runs produce identical files object', () => {
  const dir = makeTree(BASIC_TEMPLATE);
  try {
    const a = generateManifest(dir, { version: '1.57.0' });
    const b = generateManifest(dir, { version: '1.57.0' });
    assert.deepEqual(a.files, b.files);
  } finally {
    cleanup(dir);
  }
});

test('generateManifest records algorithm and version metadata', () => {
  const dir = makeTree(BASIC_TEMPLATE);
  try {
    const manifest = generateManifest(dir, { version: '1.57.0' });
    assert.equal(manifest.algorithm, 'sha256');
    assert.equal(manifest.version, '1.57.0');
    assert.ok(manifest.generated, 'should include generated timestamp');
  } finally {
    cleanup(dir);
  }
});

// ---------- detectConflicts ----------

test('detectConflicts: user unchanged, template unchanged → empty', () => {
  const template = makeTree(BASIC_TEMPLATE);
  const user = makeTree(BASIC_TEMPLATE);
  try {
    const oldManifest = generateManifest(template, { version: '1.56.0' });
    const newManifest = generateManifest(template, { version: '1.57.0' });
    const result = detectConflicts({
      userDir: user,
      templateDir: template,
      oldManifest,
      newManifest,
    });
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.userModifiedOnly, []);
    assert.deepEqual(result.templateChangedOnly, []);
  } finally {
    cleanup(template);
    cleanup(user);
  }
});

test('detectConflicts: both changed same file → conflict', () => {
  const oldTemplate = makeTree(BASIC_TEMPLATE);
  const newTemplate = makeTree({
    ...BASIC_TEMPLATE,
    '.claude/skills/morning-brief/SKILL.md': '# Morning Brief\nv2 body (template update)\n',
  });
  const user = makeTree({
    ...BASIC_TEMPLATE,
    '.claude/skills/morning-brief/SKILL.md': '# Morning Brief\nuser custom\n',
  });
  try {
    const oldManifest = generateManifest(oldTemplate, { version: '1.56.0' });
    const newManifest = generateManifest(newTemplate, { version: '1.57.0' });
    const result = detectConflicts({
      userDir: user,
      templateDir: newTemplate,
      oldManifest,
      newManifest,
    });
    assert.deepEqual(result.conflicts, ['.claude/skills/morning-brief/SKILL.md']);
    assert.deepEqual(result.userModifiedOnly, []);
    assert.deepEqual(result.templateChangedOnly, []);
  } finally {
    cleanup(oldTemplate);
    cleanup(newTemplate);
    cleanup(user);
  }
});

test('detectConflicts: user edited but template unchanged → userModifiedOnly', () => {
  const template = makeTree(BASIC_TEMPLATE);
  const user = makeTree({
    ...BASIC_TEMPLATE,
    '.claude/skills/morning-brief/SKILL.md': '# Morning Brief\nuser custom\n',
  });
  try {
    const oldManifest = generateManifest(template, { version: '1.56.0' });
    const newManifest = generateManifest(template, { version: '1.57.0' });
    const result = detectConflicts({
      userDir: user,
      templateDir: template,
      oldManifest,
      newManifest,
    });
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.userModifiedOnly, ['.claude/skills/morning-brief/SKILL.md']);
    assert.deepEqual(result.templateChangedOnly, []);
  } finally {
    cleanup(template);
    cleanup(user);
  }
});

test('detectConflicts: template changed but user unchanged → templateChangedOnly', () => {
  const oldTemplate = makeTree(BASIC_TEMPLATE);
  const newTemplate = makeTree({
    ...BASIC_TEMPLATE,
    '.claude/skills/morning-brief/SKILL.md': '# Morning Brief\nv2 body\n',
  });
  const user = makeTree(BASIC_TEMPLATE);
  try {
    const oldManifest = generateManifest(oldTemplate, { version: '1.56.0' });
    const newManifest = generateManifest(newTemplate, { version: '1.57.0' });
    const result = detectConflicts({
      userDir: user,
      templateDir: newTemplate,
      oldManifest,
      newManifest,
    });
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.userModifiedOnly, []);
    assert.deepEqual(result.templateChangedOnly, ['.claude/skills/morning-brief/SKILL.md']);
  } finally {
    cleanup(oldTemplate);
    cleanup(newTemplate);
    cleanup(user);
  }
});

test('detectConflicts: missing oldManifest falls back to direct hash compare', () => {
  const newTemplate = makeTree({
    ...BASIC_TEMPLATE,
    '.claude/skills/morning-brief/SKILL.md': '# Morning Brief\nv2 body\n',
  });
  const user = makeTree({
    ...BASIC_TEMPLATE,
    '.claude/skills/morning-brief/SKILL.md': '# Morning Brief\nuser custom\n',
  });
  try {
    const newManifest = generateManifest(newTemplate, { version: '1.57.0' });
    const result = detectConflicts({
      userDir: user,
      templateDir: newTemplate,
      oldManifest: null,
      newManifest,
    });
    // morning-brief differs between user and new template → treated as conflict
    assert.ok(result.conflicts.includes('.claude/skills/morning-brief/SKILL.md'));
    // Other files match new template → unchanged
    assert.ok(!result.conflicts.includes('CLAUDE.md'));
  } finally {
    cleanup(newTemplate);
    cleanup(user);
  }
});

test('detectConflicts: corrupt oldManifest behaves like missing manifest', () => {
  const newTemplate = makeTree(BASIC_TEMPLATE);
  const user = makeTree(BASIC_TEMPLATE);
  try {
    const newManifest = generateManifest(newTemplate, { version: '1.57.0' });
    // Pass an obviously-broken object in place of a real manifest
    const result = detectConflicts({
      userDir: user,
      templateDir: newTemplate,
      oldManifest: { broken: true, files: 'not-an-object' },
      newManifest,
    });
    // Should not crash, should produce a usable result
    assert.ok(Array.isArray(result.conflicts));
    assert.ok(Array.isArray(result.userModifiedOnly));
    assert.ok(Array.isArray(result.templateChangedOnly));
  } finally {
    cleanup(newTemplate);
    cleanup(user);
  }
});

test('detectConflicts: file missing from user dir is not a conflict', () => {
  const template = makeTree(BASIC_TEMPLATE);
  // User dir missing the meditate skill entirely
  const partial = { ...BASIC_TEMPLATE };
  delete partial['.claude/skills/meditate/SKILL.md'];
  const user = makeTree(partial);
  try {
    const newManifest = generateManifest(template, { version: '1.57.0' });
    const result = detectConflicts({
      userDir: user,
      templateDir: template,
      oldManifest: newManifest,
      newManifest,
    });
    // Missing file → treat as "new install" of that file → not a conflict
    assert.ok(!result.conflicts.includes('.claude/skills/meditate/SKILL.md'));
  } finally {
    cleanup(template);
    cleanup(user);
  }
});

// ---------- resolveBakPath ----------

test('resolveBakPath returns plain .bak when no collision', () => {
  const dir = makeTree({ 'foo.md': 'body' });
  try {
    const bak = resolveBakPath(join(dir, 'foo.md'));
    assert.equal(bak, join(dir, 'foo.md.bak'));
  } finally {
    cleanup(dir);
  }
});

test('resolveBakPath appends numeric suffix on collision', () => {
  const dir = makeTree({
    'foo.md': 'body',
    'foo.md.bak': 'old backup',
  });
  try {
    assert.equal(resolveBakPath(join(dir, 'foo.md')), join(dir, 'foo.md.bak.1'));
  } finally {
    cleanup(dir);
  }
});

test('resolveBakPath increments suffix through multiple collisions', () => {
  const dir = makeTree({
    'foo.md': 'body',
    'foo.md.bak': 'old',
    'foo.md.bak.1': 'older',
    'foo.md.bak.2': 'oldest',
  });
  try {
    assert.equal(resolveBakPath(join(dir, 'foo.md')), join(dir, 'foo.md.bak.3'));
  } finally {
    cleanup(dir);
  }
});

// ---------- applyResolution ----------

test('applyResolution keep-all puts every conflict in skip', () => {
  const conflicts = ['a.md', 'b.md', 'c.md'];
  const result = applyResolution(conflicts, { choice: 'keep-all' });
  assert.deepEqual(result.skip.sort(), ['a.md', 'b.md', 'c.md']);
  assert.deepEqual(result.overwrite, []);
  assert.equal(result.cancelled, false);
});

test('applyResolution overwrite-all puts every conflict in overwrite', () => {
  const conflicts = ['a.md', 'b.md'];
  const result = applyResolution(conflicts, { choice: 'overwrite-all' });
  assert.deepEqual(result.overwrite.sort(), ['a.md', 'b.md']);
  assert.deepEqual(result.skip, []);
  assert.equal(result.cancelled, false);
});

test('applyResolution cancel sets cancelled flag', () => {
  const result = applyResolution(['a.md'], { choice: 'cancel' });
  assert.equal(result.cancelled, true);
});

test('applyResolution per-file answers honored', () => {
  const conflicts = ['a.md', 'b.md', 'c.md'];
  const result = applyResolution(conflicts, {
    choice: 'per-file',
    perFile: { 'a.md': 'keep', 'b.md': 'overwrite', 'c.md': 'keep' },
  });
  assert.deepEqual(result.skip.sort(), ['a.md', 'c.md']);
  assert.deepEqual(result.overwrite, ['b.md']);
  assert.equal(result.cancelled, false);
});
