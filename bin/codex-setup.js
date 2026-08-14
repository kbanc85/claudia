// Native Codex setup for Claudia.
//
// The npm installer remains responsible for machine setup (Python venv,
// background daemon, workspace files). Codex then consumes the generated
// plugin from the installed Claudia workspace through a local marketplace.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';

export const CODEX_MARKETPLACE_NAME = 'claudia-official';
export const CODEX_PLUGIN_NAME = 'claudia';

/**
 * Inside an active Codex thread, a bare installer command should target the
 * folder the user already opened. Explicit `codex` keeps the same behavior
 * outside Codex. Ordinary terminal installs retain the legacy ./claudia target.
 */
export function resolveCodexInstallArgs(filteredArgs, env = process.env) {
  const explicitCodex = filteredArgs[0] === 'codex';
  const detectedCodex = Boolean(env.CODEX_THREAD_ID);
  const codexMode = explicitCodex || detectedCodex;
  const installArg = explicitCodex ? filteredArgs[1] : filteredArgs[0];
  return {
    codexMode,
    installArg,
    defaultToCurrentDir: codexMode && installArg === undefined,
  };
}

function readJson(path, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

function claudiaMemoryServer(targetPath) {
  const rootMcp = readJson(join(targetPath, '.mcp.json'), {});
  const servers = rootMcp.mcpServers || {};
  return servers['claudia-memory'] || servers.claudia_memory || null;
}

/**
 * Copy the official Codex plugin into an installed Claudia workspace and
 * create the repository marketplace Codex expects.
 */
export function prepareCodexRuntime({ packageRoot, targetPath, version }) {
  const sourcePlugin = join(packageRoot, 'plugins', CODEX_PLUGIN_NAME);
  if (!existsSync(sourcePlugin)) {
    throw new Error(`Codex plugin source is missing: ${sourcePlugin}`);
  }

  const pluginsDir = join(targetPath, 'plugins');
  const targetPlugin = join(pluginsDir, CODEX_PLUGIN_NAME);
  mkdirSync(pluginsDir, { recursive: true });
  rmSync(targetPlugin, { recursive: true, force: true });
  cpSync(sourcePlugin, targetPlugin, { recursive: true, force: true });

  const manifestPath = join(targetPlugin, '.codex-plugin', 'plugin.json');
  const manifest = readJson(manifestPath, {});
  manifest.version = version;
  writeJsonAtomic(manifestPath, manifest);

  const marketplacePath = join(targetPath, '.agents', 'plugins', 'marketplace.json');
  const marketplace = readJson(marketplacePath, {
    name: CODEX_MARKETPLACE_NAME,
    interface: { displayName: 'Claudia Official' },
    plugins: [],
  });

  marketplace.name = CODEX_MARKETPLACE_NAME;
  marketplace.interface = {
    ...(marketplace.interface || {}),
    displayName: 'Claudia Official',
  };
  if (!Array.isArray(marketplace.plugins)) marketplace.plugins = [];

  const entry = {
    name: CODEX_PLUGIN_NAME,
    source: { source: 'local', path: './plugins/claudia' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Productivity',
  };
  const existingIndex = marketplace.plugins.findIndex((plugin) => plugin.name === CODEX_PLUGIN_NAME);
  if (existingIndex >= 0) marketplace.plugins[existingIndex] = entry;
  else marketplace.plugins.push(entry);
  writeJsonAtomic(marketplacePath, marketplace);

  syncCodexPluginMcp(targetPath);
  return { marketplacePath, pluginPath: targetPlugin };
}

/**
 * Keep the plugin-bundled MCP declaration aligned with the installer-created
 * root .mcp.json. This gives Codex the same daemon and project isolation as the
 * other Claudia hosts without hard-coded developer paths.
 */
export function syncCodexPluginMcp(targetPath) {
  const pluginMcpPath = join(targetPath, 'plugins', CODEX_PLUGIN_NAME, '.mcp.json');
  const memoryServer = claudiaMemoryServer(targetPath);
  const config = { mcpServers: {} };
  if (memoryServer) config.mcpServers['claudia-memory'] = memoryServer;
  writeJsonAtomic(pluginMcpPath, config);
  return { configured: Boolean(memoryServer), path: pluginMcpPath };
}

function runJson(run, command, args) {
  const raw = run(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(raw || '{}');
}

/**
 * Register the workspace marketplace and enable Claudia. Failures are returned
 * as actionable status so a missing/older Codex CLI never breaks Claudia's
 * underlying installation.
 */
export function activateCodexPlugin(targetPath, run = execFileSync) {
  const command = process.platform === 'win32' ? 'codex.cmd' : 'codex';
  try {
    run(command, ['--version'], { stdio: 'ignore' });
  } catch {
    return {
      ok: false,
      issue: 'codex-missing',
      message: 'Codex CLI was not found. Install Codex, then run the two commands shown below.',
    };
  }

  try {
    const listed = runJson(run, command, ['plugin', 'marketplace', 'list', '--json']);
    const marketplaces = listed.marketplaces || [];
    const existing = marketplaces.find((item) => item.name === CODEX_MARKETPLACE_NAME);
    const existingSource = existing?.marketplaceSource?.source;
    let marketplaceReady = Boolean(existing && existingSource === targetPath);
    let marketplaceReplaced = false;

    if (existing && existingSource !== targetPath) {
      const pluginId = `${CODEX_PLUGIN_NAME}@${CODEX_MARKETPLACE_NAME}`;
      const plugins = runJson(run, command, ['plugin', 'list', '--json']);
      const installed = (plugins.installed || []).some((item) => item.pluginId === pluginId);
      if (installed) {
        runJson(run, command, ['plugin', 'remove', pluginId, '--json']);
      }
      runJson(run, command, ['plugin', 'marketplace', 'remove', CODEX_MARKETPLACE_NAME, '--json']);
      runJson(run, command, ['plugin', 'marketplace', 'add', targetPath, '--json']);
      marketplaceReady = true;
      marketplaceReplaced = true;
    }

    if (!marketplaceReady) {
      runJson(run, command, ['plugin', 'marketplace', 'add', targetPath, '--json']);
    }

    const pluginId = `${CODEX_PLUGIN_NAME}@${CODEX_MARKETPLACE_NAME}`;
    const plugins = runJson(run, command, ['plugin', 'list', '--json']);
    const installed = (plugins.installed || []).some((item) => item.pluginId === pluginId);

    // `plugin add` is idempotent and refreshes the cached plugin snapshot. Run
    // it on upgrades too so regenerated skills, hooks, and MCP paths take effect.
    runJson(run, command, ['plugin', 'add', pluginId, '--json']);

    return {
      ok: true,
      pluginId,
      alreadyInstalled: installed,
      marketplaceReplaced,
    };
  } catch (error) {
    return {
      ok: false,
      issue: 'activation-failed',
      message: error?.stderr?.toString().trim() || error.message,
    };
  }
}

export function codexManualCommands(targetPath) {
  return [
    `codex plugin marketplace add ${JSON.stringify(targetPath)}`,
    `codex plugin add ${CODEX_PLUGIN_NAME}@${CODEX_MARKETPLACE_NAME}`,
  ];
}
