/**
 * Tests for the `get-claudia google` subcommand logic.
 * Tests the core functions that modify .mcp.json for Google Workspace setup.
 *
 * Run: node --test tests/test_google_setup.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We'll import these from bin/google-setup.js (extracted module)
let setupGoogleWorkspace, detectOldGoogleMcp;

// Dynamic import since the module doesn't exist yet (TDD: test first)
try {
  const mod = await import('../bin/google-setup.js');
  setupGoogleWorkspace = mod.setupGoogleWorkspace;
  detectOldGoogleMcp = mod.detectOldGoogleMcp;
} catch {
  // Expected to fail until we implement the module
  setupGoogleWorkspace = null;
  detectOldGoogleMcp = null;
}

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeTmpDir() {
  const dir = join(tmpdir(), `claudia-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeMcpJson(dir, config) {
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify(config, null, 2));
}

function readMcpJson(dir) {
  return JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'));
}

// ─── setupGoogleWorkspace ────────────────────────────────────────────────────

describe('setupGoogleWorkspace', () => {
  let tmp;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('adds google_workspace to existing .mcp.json', () => {
    if (!setupGoogleWorkspace) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, {
      mcpServers: {
        'claudia-memory': { command: 'python', args: ['-m', 'claudia_memory'] }
      }
    });

    setupGoogleWorkspace(tmp, 'test-client-id', 'test-client-secret', 'core');

    const config = readMcpJson(tmp);
    assert.ok(config.mcpServers.google_workspace, 'google_workspace entry should exist');
    assert.equal(config.mcpServers.google_workspace.command, 'uvx');
    assert.ok(config.mcpServers.google_workspace.args.includes('workspace-mcp'));
  });

  it('sets correct OAuth env vars', () => {
    if (!setupGoogleWorkspace) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, { mcpServers: {} });

    setupGoogleWorkspace(tmp, 'my-client-id', 'my-secret', 'core');

    const config = readMcpJson(tmp);
    const gw = config.mcpServers.google_workspace;
    assert.equal(gw.env.GOOGLE_OAUTH_CLIENT_ID, 'my-client-id');
    assert.equal(gw.env.GOOGLE_OAUTH_CLIENT_SECRET, 'my-secret');
  });

  it('respects the tier argument', () => {
    if (!setupGoogleWorkspace) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, { mcpServers: {} });

    setupGoogleWorkspace(tmp, 'id', 'secret', 'extended');

    const config = readMcpJson(tmp);
    const tierIdx = config.mcpServers.google_workspace.args.indexOf('--tool-tier');
    assert.equal(config.mcpServers.google_workspace.args[tierIdx + 1], 'extended');
  });

  it('defaults tier to core when not specified', () => {
    if (!setupGoogleWorkspace) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, { mcpServers: {} });

    setupGoogleWorkspace(tmp, 'id', 'secret');

    const config = readMcpJson(tmp);
    const tierIdx = config.mcpServers.google_workspace.args.indexOf('--tool-tier');
    assert.equal(config.mcpServers.google_workspace.args[tierIdx + 1], 'core');
  });

  it('preserves existing MCP servers', () => {
    if (!setupGoogleWorkspace) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, {
      mcpServers: {
        'claudia-memory': { command: 'python', args: [] },
        'rube': { type: 'http', url: 'https://mcp.composio.dev' }
      }
    });

    setupGoogleWorkspace(tmp, 'id', 'secret', 'core');

    const config = readMcpJson(tmp);
    assert.ok(config.mcpServers['claudia-memory'], 'claudia-memory preserved');
    assert.ok(config.mcpServers.rube, 'rube preserved');
    assert.ok(config.mcpServers.google_workspace, 'google_workspace added');
  });

  it('removes old gmail entry when present', () => {
    if (!setupGoogleWorkspace) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, {
      mcpServers: {
        gmail: { command: 'npx', args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'] },
        'google-calendar': { command: 'npx', args: ['-y', '@gongrzhe/server-calendar-autoauth-mcp'] }
      }
    });

    setupGoogleWorkspace(tmp, 'id', 'secret', 'core');

    const config = readMcpJson(tmp);
    assert.equal(config.mcpServers.gmail, undefined, 'old gmail removed');
    assert.equal(config.mcpServers['google-calendar'], undefined, 'old google-calendar removed');
    assert.ok(config.mcpServers.google_workspace, 'google_workspace added');
  });

  it('creates .mcp.json if it does not exist', () => {
    if (!setupGoogleWorkspace) return assert.fail('Module not yet implemented');

    // No .mcp.json in tmp
    setupGoogleWorkspace(tmp, 'id', 'secret', 'core');

    assert.ok(existsSync(join(tmp, '.mcp.json')), '.mcp.json created');
    const config = readMcpJson(tmp);
    assert.ok(config.mcpServers.google_workspace);
  });

  it('overwrites existing google_workspace entry', () => {
    if (!setupGoogleWorkspace) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, {
      mcpServers: {
        google_workspace: {
          command: 'uvx',
          args: ['workspace-mcp', '--tool-tier', 'core'],
          env: { GOOGLE_OAUTH_CLIENT_ID: 'old-id', GOOGLE_OAUTH_CLIENT_SECRET: 'old-secret' }
        }
      }
    });

    setupGoogleWorkspace(tmp, 'new-id', 'new-secret', 'extended');

    const config = readMcpJson(tmp);
    assert.equal(config.mcpServers.google_workspace.env.GOOGLE_OAUTH_CLIENT_ID, 'new-id');
    const tierIdx = config.mcpServers.google_workspace.args.indexOf('--tool-tier');
    assert.equal(config.mcpServers.google_workspace.args[tierIdx + 1], 'extended');
  });
});

// ─── detectOldGoogleMcp ──────────────────────────────────────────────────────

describe('detectOldGoogleMcp', () => {
  let tmp;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns empty when no .mcp.json exists', () => {
    if (!detectOldGoogleMcp) return assert.fail('Module not yet implemented');

    const result = detectOldGoogleMcp(tmp);
    assert.deepEqual(result, { hasOldGmail: false, hasOldCalendar: false, hasWorkspace: false });
  });

  it('detects old gmail entry', () => {
    if (!detectOldGoogleMcp) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, {
      mcpServers: {
        gmail: { command: 'npx', args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'] }
      }
    });

    const result = detectOldGoogleMcp(tmp);
    assert.equal(result.hasOldGmail, true);
  });

  it('detects old google-calendar entry', () => {
    if (!detectOldGoogleMcp) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, {
      mcpServers: {
        'google-calendar': { command: 'npx', args: ['-y', '@gongrzhe/server-calendar-autoauth-mcp'] }
      }
    });

    const result = detectOldGoogleMcp(tmp);
    assert.equal(result.hasOldCalendar, true);
  });

  it('detects existing google_workspace entry', () => {
    if (!detectOldGoogleMcp) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, {
      mcpServers: {
        google_workspace: { command: 'uvx', args: ['workspace-mcp'] }
      }
    });

    const result = detectOldGoogleMcp(tmp);
    assert.equal(result.hasWorkspace, true);
  });

  it('detects all three simultaneously', () => {
    if (!detectOldGoogleMcp) return assert.fail('Module not yet implemented');

    writeMcpJson(tmp, {
      mcpServers: {
        gmail: { command: 'npx', args: [] },
        'google-calendar': { command: 'npx', args: [] },
        google_workspace: { command: 'uvx', args: ['workspace-mcp'] }
      }
    });

    const result = detectOldGoogleMcp(tmp);
    assert.equal(result.hasOldGmail, true);
    assert.equal(result.hasOldCalendar, true);
    assert.equal(result.hasWorkspace, true);
  });
});

// ─── CLI subcommand routing ──────────────────────────────────────────────────

describe('CLI recognizes google subcommand', () => {
  it('bin/index.js contains google subcommand handler', () => {
    const src = readFileSync(
      new URL('../bin/index.js', import.meta.url), 'utf-8'
    );
    assert.ok(
      src.includes("'google'") || src.includes('"google"'),
      'bin/index.js should handle the "google" subcommand'
    );
  });
});
