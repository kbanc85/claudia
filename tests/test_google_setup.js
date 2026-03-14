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
let setupGoogleWorkspace, detectOldGoogleMcp, extractProjectNumber, buildApiEnableUrl, TIER_APIS;

// Dynamic import since the module doesn't exist yet (TDD: test first)
try {
  const mod = await import('../bin/google-setup.js');
  setupGoogleWorkspace = mod.setupGoogleWorkspace;
  detectOldGoogleMcp = mod.detectOldGoogleMcp;
  extractProjectNumber = mod.extractProjectNumber;
  buildApiEnableUrl = mod.buildApiEnableUrl;
  TIER_APIS = mod.TIER_APIS;
} catch {
  // Expected to fail until we implement the module
  setupGoogleWorkspace = null;
  detectOldGoogleMcp = null;
  extractProjectNumber = null;
  buildApiEnableUrl = null;
  TIER_APIS = null;
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

// ─── extractProjectNumber ────────────────────────────────────────────────────

describe('extractProjectNumber', () => {
  it('extracts number from standard Client ID format', () => {
    if (!extractProjectNumber) return assert.fail('Module not yet implemented');

    const result = extractProjectNumber('561758721404-abc123def.apps.googleusercontent.com');
    assert.equal(result, '561758721404');
  });

  it('returns null for non-standard ID without leading digits', () => {
    if (!extractProjectNumber) return assert.fail('Module not yet implemented');

    const result = extractProjectNumber('not-a-numeric-prefix.apps.googleusercontent.com');
    assert.equal(result, null);
  });

  it('returns null for empty string', () => {
    if (!extractProjectNumber) return assert.fail('Module not yet implemented');

    assert.equal(extractProjectNumber(''), null);
  });

  it('returns null for null/undefined', () => {
    if (!extractProjectNumber) return assert.fail('Module not yet implemented');

    assert.equal(extractProjectNumber(null), null);
    assert.equal(extractProjectNumber(undefined), null);
  });
});

// ─── buildApiEnableUrl ───────────────────────────────────────────────────────

describe('buildApiEnableUrl', () => {
  it('builds core-tier URL with project number', () => {
    if (!buildApiEnableUrl) return assert.fail('Module not yet implemented');

    const url = buildApiEnableUrl('561758721404', 'core');
    assert.ok(url.includes('flows/enableapi'), 'uses flows/enableapi path');
    assert.ok(url.includes('project=561758721404'), 'includes project number');
    assert.ok(url.includes('gmail.googleapis.com'), 'includes Gmail API');
    assert.ok(url.includes('calendar-json.googleapis.com'), 'includes Calendar API');
  });

  it('builds complete-tier URL with all 11 APIs', () => {
    if (!buildApiEnableUrl || !TIER_APIS) return assert.fail('Module not yet implemented');

    const url = buildApiEnableUrl('12345', 'complete');
    assert.ok(url.includes('slides.googleapis.com'), 'includes Slides API');
    assert.ok(url.includes('forms.googleapis.com'), 'includes Forms API');
    assert.ok(url.includes('script.googleapis.com'), 'includes Apps Script API');
  });

  it('returns generic library URL when project number is null', () => {
    if (!buildApiEnableUrl) return assert.fail('Module not yet implemented');

    const url = buildApiEnableUrl(null, 'core');
    assert.equal(url, 'https://console.cloud.google.com/apis/library');
  });

  it('falls back to core for unknown tier', () => {
    if (!buildApiEnableUrl || !TIER_APIS) return assert.fail('Module not yet implemented');

    const url = buildApiEnableUrl('12345', 'nonexistent');
    const coreUrl = buildApiEnableUrl('12345', 'core');
    assert.equal(url, coreUrl, 'unknown tier should produce same URL as core');
  });
});

// ─── TIER_APIS ───────────────────────────────────────────────────────────────

describe('TIER_APIS', () => {
  it('has correct counts per tier', () => {
    if (!TIER_APIS) return assert.fail('Module not yet implemented');

    assert.equal(TIER_APIS.core.length, 4);
    assert.equal(TIER_APIS.extended.length, 8);
    assert.equal(TIER_APIS.complete.length, 11);
  });

  it('extended is a superset of core', () => {
    if (!TIER_APIS) return assert.fail('Module not yet implemented');

    for (const api of TIER_APIS.core) {
      assert.ok(TIER_APIS.extended.includes(api), `extended should include ${api}`);
    }
  });

  it('complete is a superset of extended', () => {
    if (!TIER_APIS) return assert.fail('Module not yet implemented');

    for (const api of TIER_APIS.extended) {
      assert.ok(TIER_APIS.complete.includes(api), `complete should include ${api}`);
    }
  });

  it('all API IDs end with .googleapis.com', () => {
    if (!TIER_APIS) return assert.fail('Module not yet implemented');

    for (const tier of Object.keys(TIER_APIS)) {
      for (const api of TIER_APIS[tier]) {
        assert.ok(api.endsWith('.googleapis.com'), `${api} should end with .googleapis.com`);
      }
    }
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
