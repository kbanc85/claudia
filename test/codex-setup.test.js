import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  activateCodexPlugin,
  codexManualCommands,
  CODEX_MARKETPLACE_NAME,
  prepareCodexRuntime,
  syncCodexPluginMcp,
} from '../bin/codex-setup.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function tempWorkspace() {
  return mkdtempSync(join(tmpdir(), 'claudia-codex-'));
}

test('prepareCodexRuntime copies the plugin and creates a local marketplace', () => {
  const targetPath = tempWorkspace();
  try {
    writeFileSync(join(targetPath, '.mcp.json'), JSON.stringify({
      mcpServers: {
        'claudia-memory': {
          command: '/tmp/venv/bin/python',
          args: ['-m', 'claudia_memory', '--project-dir', targetPath],
        },
      },
    }));

    const result = prepareCodexRuntime({
      packageRoot: repoRoot,
      targetPath,
      version: '9.8.7',
    });

    const manifest = JSON.parse(readFileSync(join(result.pluginPath, '.codex-plugin', 'plugin.json')));
    assert.equal(manifest.version, '9.8.7');

    const marketplace = JSON.parse(readFileSync(result.marketplacePath));
    assert.equal(marketplace.name, CODEX_MARKETPLACE_NAME);
    assert.deepEqual(marketplace.plugins[0].source, {
      source: 'local',
      path: './plugins/claudia',
    });

    const pluginMcp = JSON.parse(readFileSync(join(result.pluginPath, '.mcp.json')));
    assert.equal(pluginMcp.mcpServers['claudia-memory'].command, '/tmp/venv/bin/python');
  } finally {
    rmSync(targetPath, { recursive: true, force: true });
  }
});

test('syncCodexPluginMcp emits an empty server map when memory is intentionally skipped', () => {
  const targetPath = tempWorkspace();
  try {
    const pluginDir = join(targetPath, 'plugins', 'claudia');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(targetPath, '.mcp.json'), '{"mcpServers":{}}\n');

    const result = syncCodexPluginMcp(targetPath);
    assert.equal(result.configured, false);
    assert.deepEqual(JSON.parse(readFileSync(result.path)), { mcpServers: {} });
  } finally {
    rmSync(targetPath, { recursive: true, force: true });
  }
});

test('activateCodexPlugin registers the marketplace and installs Claudia', () => {
  const calls = [];
  const fakeRun = (_command, args) => {
    calls.push(args);
    if (args[0] === '--version') return 'codex-cli 1.0.0';
    if (args.join(' ') === 'plugin marketplace list --json') return '{"marketplaces":[]}';
    if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') return '{}';
    if (args.join(' ') === 'plugin list --json') return '{"installed":[]}';
    if (args[0] === 'plugin' && args[1] === 'add') return '{}';
    throw new Error(`Unexpected command: ${args.join(' ')}`);
  };

  const result = activateCodexPlugin('/tmp/claudia', fakeRun);
  assert.equal(result.ok, true);
  assert.ok(calls.some((args) => args.join(' ') === 'plugin marketplace add /tmp/claudia --json'));
  assert.ok(calls.some((args) => args.join(' ') === 'plugin add claudia@claudia-official --json'));
});

test('activateCodexPlugin replaces a stale official marketplace automatically', () => {
  const calls = [];
  let pluginListCalls = 0;
  const fakeRun = (_command, args) => {
    calls.push(args);
    if (args[0] === '--version') return 'codex-cli 1.0.0';
    if (args.join(' ') === 'plugin marketplace list --json') {
      return JSON.stringify({
        marketplaces: [{
          name: CODEX_MARKETPLACE_NAME,
          marketplaceSource: { source: '/somewhere/else' },
        }],
      });
    }
    if (args.join(' ') === 'plugin list --json') {
      pluginListCalls += 1;
      return pluginListCalls === 1
        ? '{"installed":[{"pluginId":"claudia@claudia-official"}]}'
        : '{"installed":[]}';
    }
    if (args.join(' ') === 'plugin remove claudia@claudia-official --json') return '{}';
    if (args.join(' ') === 'plugin marketplace remove claudia-official --json') return '{}';
    if (args.join(' ') === 'plugin marketplace add /tmp/claudia --json') return '{}';
    if (args.join(' ') === 'plugin add claudia@claudia-official --json') return '{}';
    throw new Error(`Unexpected command: ${args.join(' ')}`);
  };

  const result = activateCodexPlugin('/tmp/claudia', fakeRun);
  assert.equal(result.ok, true);
  assert.equal(result.marketplaceReplaced, true);
  assert.equal(calls.filter((args) => args.join(' ') === 'plugin marketplace add /tmp/claudia --json').length, 1);
  assert.deepEqual(codexManualCommands('/tmp/claudia'), [
    'codex plugin marketplace add "/tmp/claudia"',
    'codex plugin add claudia@claudia-official',
  ]);
});
