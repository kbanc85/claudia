// Tests for bin/shell-init.js — the installer hook that writes the `claudia`
// shell function and wires it into the user's shell rc files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import {
  writeShellInit,
  appendShellRC,
  SHELL_INIT_CONTENT,
  SHELL_INIT_MARKER,
} from '../bin/shell-init.js';

function makeHome() {
  return mkdtempSync(join(tmpdir(), 'claudia-shell-init-'));
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

test('writeShellInit writes claudia-home pointing at install dir', () => {
  const home = makeHome();
  try {
    const targetDir = '/some/where/claudia';
    const { homeFile, initFile } = writeShellInit(home, targetDir);

    assert.equal(homeFile, join(home, '.claudia', 'claudia-home'));
    assert.equal(initFile, join(home, '.claudia', 'shell-init.sh'));

    const homeContent = readFileSync(homeFile, 'utf8');
    assert.equal(homeContent.trim(), targetDir);
  } finally {
    cleanup(home);
  }
});

test('writeShellInit writes the shell function content', () => {
  const home = makeHome();
  try {
    const { initFile } = writeShellInit(home, '/x/y');
    const content = readFileSync(initFile, 'utf8');
    assert.equal(content, SHELL_INIT_CONTENT);
    // Spot-check the function structure
    assert.ok(content.includes('claudia()'));
    assert.ok(content.includes('yolo'));
    assert.ok(content.includes('--dangerously-skip-permissions'));
    assert.ok(content.includes('command claudia'));
    // Update surface area
    assert.ok(content.includes('update-claudia()'));
    assert.ok(content.includes('npx get-claudia'));
    assert.ok(content.includes('update)'), 'claudia() must route the `update` subcommand');
  } finally {
    cleanup(home);
  }
});

test('writeShellInit creates ~/.claudia if it does not exist', () => {
  const home = makeHome();
  try {
    // Don't pre-create the dir
    assert.equal(existsSync(join(home, '.claudia')), false);
    writeShellInit(home, '/x');
    assert.equal(existsSync(join(home, '.claudia')), true);
  } finally {
    cleanup(home);
  }
});

test('appendShellRC adds source line to .zshrc and .bashrc when absent', () => {
  const home = makeHome();
  try {
    writeFileSync(join(home, '.zshrc'), '# existing zsh config\nexport FOO=bar\n');
    writeFileSync(join(home, '.bashrc'), '# existing bash config\n');

    const result = appendShellRC(home, 'darwin');

    assert.equal(result.added.length, 2);
    assert.equal(result.unchanged.length, 0);

    const zshrc = readFileSync(join(home, '.zshrc'), 'utf8');
    const bashrc = readFileSync(join(home, '.bashrc'), 'utf8');

    assert.ok(zshrc.includes(SHELL_INIT_MARKER));
    assert.ok(zshrc.includes('source "$HOME/.claudia/shell-init.sh"'));
    assert.ok(zshrc.includes('export FOO=bar')); // existing content preserved
    assert.ok(bashrc.includes(SHELL_INIT_MARKER));
  } finally {
    cleanup(home);
  }
});

test('appendShellRC is idempotent: second run is a no-op', () => {
  const home = makeHome();
  try {
    writeFileSync(join(home, '.zshrc'), '');
    writeFileSync(join(home, '.bashrc'), '');

    const first = appendShellRC(home, 'darwin');
    assert.equal(first.added.length, 2);

    const second = appendShellRC(home, 'darwin');
    assert.equal(second.added.length, 0);
    assert.equal(second.unchanged.length, 2);

    // Verify the marker appears exactly once in each file
    const zshrc = readFileSync(join(home, '.zshrc'), 'utf8');
    const occurrences = zshrc.split(SHELL_INIT_MARKER).length - 1;
    assert.equal(occurrences, 1, '.zshrc must contain marker exactly once');
  } finally {
    cleanup(home);
  }
});

test('appendShellRC creates rc files if missing', () => {
  const home = makeHome();
  try {
    // No rc files exist
    assert.equal(existsSync(join(home, '.zshrc')), false);
    assert.equal(existsSync(join(home, '.bashrc')), false);

    const result = appendShellRC(home, 'linux');

    assert.equal(result.added.length, 2);
    assert.equal(existsSync(join(home, '.zshrc')), true);
    assert.equal(existsSync(join(home, '.bashrc')), true);
  } finally {
    cleanup(home);
  }
});

test('appendShellRC handles rc files without trailing newline', () => {
  const home = makeHome();
  try {
    // File ends without newline — the snippet should still be cleanly separated
    writeFileSync(join(home, '.zshrc'), 'export PATH="/usr/local/bin:$PATH"');
    writeFileSync(join(home, '.bashrc'), 'alias ll="ls -la"');

    appendShellRC(home, 'darwin');

    const zshrc = readFileSync(join(home, '.zshrc'), 'utf8');
    // The original line must remain on its own line, not concatenated with the marker
    assert.ok(zshrc.includes('/usr/local/bin:$PATH"\n'));
    assert.ok(zshrc.includes(SHELL_INIT_MARKER));
  } finally {
    cleanup(home);
  }
});

test('appendShellRC skips on Windows', () => {
  const home = makeHome();
  try {
    const result = appendShellRC(home, 'win32');
    assert.equal(result.skipped, true);
    assert.equal(result.added.length, 0);
    assert.equal(existsSync(join(home, '.zshrc')), false);
    assert.equal(existsSync(join(home, '.bashrc')), false);
  } finally {
    cleanup(home);
  }
});

// ── Runtime self-healing of `_claudia_home` ──────────────────────────────────
// These execute the actual shell function (not just inspect the string) to prove
// the `claudia` command works from anywhere, even when claudia-home holds a stale
// or relative value. Skipped on Windows / where bash is unavailable.

const bashAvailable = (() => {
  try {
    execFileSync('bash', ['-c', 'true'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const skipShell = !bashAvailable || process.platform === 'win32';

// Run `_claudia_home` inside a fake HOME, from a CWD that is deliberately NOT
// that HOME, so any reliance on the current directory would surface as a bug.
function runClaudiaHome(home) {
  const initFile = join(home, '.claudia', 'shell-init.sh');
  const foreignCwd = mkdtempSync(join(tmpdir(), 'claudia-foreign-cwd-'));
  try {
    return execFileSync('bash', ['-c', `source "${initFile}"; _claudia_home`], {
      env: { ...process.env, HOME: home },
      cwd: foreignCwd,
      encoding: 'utf8',
    });
  } finally {
    cleanup(foreignCwd);
  }
}

test('_claudia_home resolves a relative claudia-home against $HOME and self-heals', { skip: skipShell }, () => {
  const home = makeHome();
  try {
    writeShellInit(home, '/placeholder'); // writes shell-init.sh
    // The exact stale/buggy state the user hit: a RELATIVE value.
    writeFileSync(join(home, '.claudia', 'claudia-home'), 'claudia\n');
    // The real install lives at $HOME/claudia (with a Claudia marker).
    mkdirSync(join(home, 'claudia', '.claude'), { recursive: true });

    const out = runClaudiaHome(home).trim();
    assert.equal(out, join(home, 'claudia'), 'relative value must resolve under $HOME');

    // Self-heal: the file is rewritten to the corrected absolute path.
    const healed = readFileSync(join(home, '.claudia', 'claudia-home'), 'utf8').trim();
    assert.equal(healed, join(home, 'claudia'), 'claudia-home must be persisted as absolute');
  } finally {
    cleanup(home);
  }
});

test('_claudia_home recovers when claudia-home is missing but $HOME/claudia exists', { skip: skipShell }, () => {
  const home = makeHome();
  try {
    writeShellInit(home, '/placeholder');
    rmSync(join(home, '.claudia', 'claudia-home'), { force: true });
    mkdirSync(join(home, 'claudia', '.claude'), { recursive: true });

    const out = runClaudiaHome(home).trim();
    assert.equal(out, join(home, 'claudia'));
  } finally {
    cleanup(home);
  }
});

test('_claudia_home returns a valid absolute install path unchanged', { skip: skipShell }, () => {
  const home = makeHome();
  try {
    const install = join(home, 'custom-claudia');
    mkdirSync(install, { recursive: true });
    writeShellInit(home, install); // claudia-home = absolute custom path

    const out = runClaudiaHome(home).trim();
    assert.equal(out, install);
  } finally {
    cleanup(home);
  }
});

test('_claudia_home errors (exit 1) only when no install can be found', { skip: skipShell }, () => {
  const home = makeHome();
  try {
    writeShellInit(home, join(home, 'does-not-exist')); // points nowhere, no $HOME/claudia fallback
    let failed = false;
    try {
      runClaudiaHome(home);
    } catch {
      failed = true;
    }
    assert.equal(failed, true, 'must fail when neither the stored path nor the default exists');
  } finally {
    cleanup(home);
  }
});
