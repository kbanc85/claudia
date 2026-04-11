// Integration tests for the full detect→resolve pipeline against real dirs.
// These exercise generateManifest + detectConflicts + applyResolution
// together to catch any wiring mistakes the unit tests wouldn't spot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import {
  generateManifest,
  detectConflicts,
  applyResolution,
  resolveBakPath,
  loadManifest,
} from '../bin/manifest-lib.js';

function makeTree(structure) {
  const root = mkdtempSync(join(tmpdir(), 'claudia-integration-'));
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

test('integration: full upgrade cycle preserves user edits with keep-all', () => {
  // 1. Original shipped template
  const oldTemplate = makeTree({
    'CLAUDE.md': '# CLAUDE v1\n',
    '.claude/skills/morning-brief/SKILL.md': '# Brief v1\n',
    '.claude/skills/meditate/SKILL.md': '# Meditate v1\n',
    '.claude/rules/rule.md': '# Rule v1\n',
  });

  // 2. User had that template installed and then edited one file
  const oldManifest = generateManifest(oldTemplate, { version: '1.0.0' });
  const user = makeTree({
    'CLAUDE.md': '# CLAUDE v1\n',
    '.claude/skills/morning-brief/SKILL.md': '# Brief USER CUSTOM\n',
    '.claude/skills/meditate/SKILL.md': '# Meditate v1\n',
    '.claude/rules/rule.md': '# Rule v1\n',
    '.claude/manifest.json': JSON.stringify(oldManifest, null, 2),
  });

  // 3. New shipped template updates the same file the user edited (conflict)
  // AND updates a file the user didn't touch (silent update)
  const newTemplate = makeTree({
    'CLAUDE.md': '# CLAUDE v1\n',
    '.claude/skills/morning-brief/SKILL.md': '# Brief v2 with new features\n',
    '.claude/skills/meditate/SKILL.md': '# Meditate v2\n',
    '.claude/rules/rule.md': '# Rule v1\n',
  });
  const newManifest = generateManifest(newTemplate, { version: '1.1.0' });

  try {
    // 4. Detect
    const conflicts = detectConflicts({
      userDir: user,
      templateDir: newTemplate,
      oldManifest: loadManifest(join(user, '.claude', 'manifest.json')),
      newManifest,
    });

    assert.deepEqual(conflicts.conflicts, ['.claude/skills/morning-brief/SKILL.md']);
    assert.deepEqual(conflicts.templateChangedOnly, ['.claude/skills/meditate/SKILL.md']);
    assert.deepEqual(conflicts.userModifiedOnly, []);

    // 5. User picks keep-all
    const resolution = applyResolution(conflicts.conflicts, { choice: 'keep-all' });
    assert.equal(resolution.cancelled, false);
    assert.deepEqual(resolution.skip, ['.claude/skills/morning-brief/SKILL.md']);
    assert.deepEqual(resolution.overwrite, []);

    // 6. Verify the user's custom content is still readable
    const userBrief = readFileSync(join(user, '.claude/skills/morning-brief/SKILL.md'), 'utf8');
    assert.match(userBrief, /USER CUSTOM/);
  } finally {
    cleanup(oldTemplate);
    cleanup(user);
    cleanup(newTemplate);
  }
});

test('integration: no conflict when user edits match new template', () => {
  // Rare but real: user edits a file to exactly what the next template ships.
  // Should be treated as unchanged, not a conflict.
  const oldTemplate = makeTree({
    '.claude/skills/a/SKILL.md': '# A v1\n',
  });
  const oldManifest = generateManifest(oldTemplate, { version: '1.0.0' });

  const newTemplate = makeTree({
    '.claude/skills/a/SKILL.md': '# A v2\n',
  });
  const newManifest = generateManifest(newTemplate, { version: '1.1.0' });

  const user = makeTree({
    '.claude/skills/a/SKILL.md': '# A v2\n', // user happened to match v2
  });

  try {
    const conflicts = detectConflicts({
      userDir: user,
      templateDir: newTemplate,
      oldManifest,
      newManifest,
    });
    assert.deepEqual(conflicts.conflicts, []);
    assert.deepEqual(conflicts.userModifiedOnly, []);
    // It's neither userModifiedOnly nor templateChangedOnly — it's unchanged
    assert.deepEqual(conflicts.templateChangedOnly, []);
  } finally {
    cleanup(oldTemplate);
    cleanup(newTemplate);
    cleanup(user);
  }
});

test('integration: resolveBakPath works against real filesystem', () => {
  const dir = makeTree({ 'file.md': 'original' });
  try {
    const file = join(dir, 'file.md');
    // First backup
    const bak1 = resolveBakPath(file);
    assert.equal(bak1, file + '.bak');
    // Simulate it existing
    writeFileSync(bak1, 'first-backup');
    const bak2 = resolveBakPath(file);
    assert.equal(bak2, file + '.bak.1');
  } finally {
    cleanup(dir);
  }
});
