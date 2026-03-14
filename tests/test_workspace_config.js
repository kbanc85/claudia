/**
 * Tests for Google Workspace MCP integration.
 * Validates .mcp.json.example files have the correct workspace-mcp config
 * and old @gongrzhe servers are removed.
 *
 * Run: node --test tests/test_workspace_config.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ─── Helper ──────────────────────────────────────────────────────────────────

function readJson(relPath) {
  const full = join(ROOT, relPath);
  return JSON.parse(readFileSync(full, 'utf-8'));
}

// ─── Root .mcp.json.example ──────────────────────────────────────────────────

describe('.mcp.json.example (root)', () => {
  const config = readJson('.mcp.json.example');

  it('has a google_workspace entry', () => {
    assert.ok(config.mcpServers.google_workspace,
      'Expected mcpServers.google_workspace to exist');
  });

  it('uses uvx command', () => {
    const gw = config.mcpServers.google_workspace;
    assert.equal(gw.command, 'uvx',
      'Expected command to be "uvx"');
  });

  it('includes workspace-mcp in args', () => {
    const gw = config.mcpServers.google_workspace;
    assert.ok(gw.args.includes('workspace-mcp'),
      'Expected args to include "workspace-mcp"');
  });

  it('defaults to --tool-tier core', () => {
    const gw = config.mcpServers.google_workspace;
    const tierIdx = gw.args.indexOf('--tool-tier');
    assert.ok(tierIdx >= 0, 'Expected --tool-tier flag in args');
    assert.equal(gw.args[tierIdx + 1], 'core',
      'Expected default tier to be "core"');
  });

  it('has GOOGLE_OAUTH_CLIENT_ID env var', () => {
    const gw = config.mcpServers.google_workspace;
    assert.ok(gw.env, 'Expected env object');
    assert.ok('GOOGLE_OAUTH_CLIENT_ID' in gw.env,
      'Expected GOOGLE_OAUTH_CLIENT_ID in env');
  });

  it('has GOOGLE_OAUTH_CLIENT_SECRET env var', () => {
    const gw = config.mcpServers.google_workspace;
    assert.ok('GOOGLE_OAUTH_CLIENT_SECRET' in gw.env,
      'Expected GOOGLE_OAUTH_CLIENT_SECRET in env');
  });

  it('does NOT have old gmail entry', () => {
    assert.equal(config.mcpServers.gmail, undefined,
      'Old gmail entry should be removed');
  });

  it('does NOT have old google-calendar entry', () => {
    assert.equal(config.mcpServers['google-calendar'], undefined,
      'Old google-calendar entry should be removed');
  });

  it('does NOT reference @gongrzhe anywhere', () => {
    const raw = readFileSync(join(ROOT, '.mcp.json.example'), 'utf-8');
    assert.ok(!raw.includes('@gongrzhe'),
      'No references to @gongrzhe should remain');
  });

  it('still has rube entry', () => {
    assert.ok(config.mcpServers.rube,
      'Rube entry should be preserved');
  });
});

// ─── template-v2/.mcp.json.example ──────────────────────────────────────────

describe('template-v2/.mcp.json.example', () => {
  const config = readJson('template-v2/.mcp.json.example');

  it('has a google_workspace entry', () => {
    assert.ok(config.mcpServers.google_workspace,
      'Expected mcpServers.google_workspace to exist');
  });

  it('uses uvx command', () => {
    const gw = config.mcpServers.google_workspace;
    assert.equal(gw.command, 'uvx');
  });

  it('defaults to --tool-tier core', () => {
    const gw = config.mcpServers.google_workspace;
    const tierIdx = gw.args.indexOf('--tool-tier');
    assert.ok(tierIdx >= 0);
    assert.equal(gw.args[tierIdx + 1], 'core');
  });

  it('has OAuth env vars', () => {
    const gw = config.mcpServers.google_workspace;
    assert.ok(gw.env);
    assert.ok('GOOGLE_OAUTH_CLIENT_ID' in gw.env);
    assert.ok('GOOGLE_OAUTH_CLIENT_SECRET' in gw.env);
  });

  it('does NOT have old gmail entry', () => {
    assert.equal(config.mcpServers.gmail, undefined);
  });

  it('does NOT have old google-calendar entry', () => {
    assert.equal(config.mcpServers['google-calendar'], undefined);
  });

  it('does NOT reference @gongrzhe anywhere', () => {
    const raw = readFileSync(join(ROOT, 'template-v2', '.mcp.json.example'), 'utf-8');
    assert.ok(!raw.includes('@gongrzhe'));
  });

  it('still has claudia-memory entry', () => {
    assert.ok(config.mcpServers['claudia-memory'],
      'claudia-memory should be preserved');
  });

  it('still has rube entry', () => {
    assert.ok(config.mcpServers.rube,
      'Rube entry should be preserved');
  });
});

// ─── Installer migration detection ──────────────────────────────────────────

describe('installer migration logic', () => {
  // The restoreMcpServers function should NOT restore old gmail/google-calendar
  // entries from _disabled_mcpServers. It should only restore claudia-memory.
  // We test this by checking the function definition in bin/index.js.

  it('restoreMcpServers does not list gmail in toRestore', () => {
    const src = readFileSync(join(ROOT, 'bin', 'index.js'), 'utf-8');
    // Find the toRestore array and verify gmail is not in it
    const match = src.match(/const toRestore = \[([^\]]+)\]/);
    assert.ok(match, 'Expected to find toRestore array in bin/index.js');
    assert.ok(!match[1].includes("'gmail'"),
      'gmail should not be in toRestore list');
  });

  it('restoreMcpServers does not list google-calendar in toRestore', () => {
    const src = readFileSync(join(ROOT, 'bin', 'index.js'), 'utf-8');
    const match = src.match(/const toRestore = \[([^\]]+)\]/);
    assert.ok(match);
    assert.ok(!match[1].includes("'google-calendar'"),
      'google-calendar should not be in toRestore list');
  });
});

// ─── Documentation ──────────────────────────────────────────────────────────

describe('CLAUDE.md documentation', () => {
  const rootMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf-8');

  it('does not reference @gongrzhe', () => {
    assert.ok(!rootMd.includes('@gongrzhe'),
      'CLAUDE.md should not reference old @gongrzhe packages');
  });

  it('references workspace-mcp or google_workspace', () => {
    assert.ok(
      rootMd.includes('workspace-mcp') || rootMd.includes('google_workspace'),
      'CLAUDE.md should reference the new workspace-mcp server'
    );
  });

  it('documents --tool-tier flag', () => {
    assert.ok(rootMd.includes('--tool-tier'),
      'CLAUDE.md should document the --tool-tier option');
  });

  it('mentions Drive as a capability', () => {
    assert.ok(rootMd.includes('Drive'),
      'CLAUDE.md should mention Google Drive as a capability');
  });
});

describe('template-v2/CLAUDE.md documentation', () => {
  const templateMd = readFileSync(join(ROOT, 'template-v2', 'CLAUDE.md'), 'utf-8');

  it('does not reference @gongrzhe', () => {
    assert.ok(!templateMd.includes('@gongrzhe'),
      'template-v2/CLAUDE.md should not reference old @gongrzhe packages');
  });

  it('references workspace-mcp or google_workspace', () => {
    assert.ok(
      templateMd.includes('workspace-mcp') || templateMd.includes('google_workspace'),
      'template-v2/CLAUDE.md should reference the new workspace-mcp server'
    );
  });
});

// ─── Skills ─────────────────────────────────────────────────────────────────

describe('connector-discovery skill', () => {
  const skill = readFileSync(join(ROOT, '.claude', 'skills', 'connector-discovery.md'), 'utf-8');

  it('does not reference @gongrzhe', () => {
    assert.ok(!skill.includes('@gongrzhe'),
      'connector-discovery should not reference old @gongrzhe packages');
  });

  it('references workspace-mcp for Gmail', () => {
    assert.ok(skill.includes('workspace-mcp'),
      'connector-discovery should recommend workspace-mcp');
  });
});

describe('inbox-check skill', () => {
  const skill = readFileSync(
    join(ROOT, '.claude', 'skills', 'inbox-check', 'SKILL.md'), 'utf-8'
  );

  // inbox-check uses generic gmail.* tool detection, which works with any
  // MCP server exposing gmail tools. The test just ensures no @gongrzhe ref.
  it('does not reference @gongrzhe', () => {
    assert.ok(!skill.includes('@gongrzhe'),
      'inbox-check should not reference old @gongrzhe packages');
  });
});
