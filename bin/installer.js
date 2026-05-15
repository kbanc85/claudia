/**
 * Installer orchestration.
 *
 * Owns argv parsing, the self-update trampoline, the 7-step progress flow,
 * the Google Workspace subcommand, and the completion banner. Calls into
 * focused modules (ollama, python-env, mcp-config, etc.) for the actual
 * platform work.
 */

import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, statSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execFileSync } from 'child_process';
import { homedir } from 'os';
import { setupGoogleWorkspace, detectOldGoogleMcp, extractProjectNumber, buildApiEnableUrl, TIER_APIS } from './google-setup.js';
import {
  colors,
  isTTY,
  isWindows,
  supportsInPlace,
  getMemoryDaemonSrc,
  getVersion,
} from './lib.js';
import { confirm, prompt } from './prompt.js';
import { getBanner, ProgressRenderer } from './renderer.js';
import {
  isOllamaInstalled,
  installOllama,
  startOllama,
  ensureOllamaKey,
  restartOllama,
} from './ollama.js';
import { isPythonInstalled, installPython } from './python-env.js';
import { ensureLaunchAgent } from './launch-agent.js';
import {
  restoreMcpServers,
  scanExistingDatabases,
  ensureDaemonMcpConfig,
  ensureGoogleMcpEntries,
  checkMcpConfig,
} from './mcp-config.js';
import { installVisualizer } from './visualizer.js';
import { writeWhatsNewFile } from './changelog.js';
import { handleSkillConflicts } from './template-copy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Self-update trampoline ──────────────────────────────────────────────
// npx aggressively caches packages. If the user runs `npx get-claudia .`
// and a newer version exists, we re-exec with the latest to avoid stale installs.

function isNewerVersion(latest, current) {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

async function checkForNewerVersion(currentVersion) {
  // Skip if already re-execing (prevent infinite recursion)
  if (process.env.CLAUDIA_SKIP_UPDATE_CHECK) return null;
  // Skip for --help / --version (no need to update-check)
  if (process.argv.includes('--help') || process.argv.includes('-h') || process.argv.includes('--version')) return null;

  try {
    const resp = await fetch('https://registry.npmjs.org/get-claudia/latest', {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const latest = data.version;
    if (latest && isNewerVersion(latest, currentVersion)) return latest;
  } catch {
    // Network error or timeout: proceed with current version
  }
  return null;
}

// ─── Main ───────────────────────────────────────────────────────────────

export async function main() {
  const version = getVersion();

  // Self-update trampoline: re-exec with latest if we're stale
  const newerVersion = await checkForNewerVersion(version);
  if (newerVersion) {
    process.stdout.write(`\n ${colors.yellow}→${colors.reset} v${newerVersion} available (running v${version}). Updating...\n\n`);
    const npxCmd = isWindows ? 'npx.cmd' : 'npx';
    try {
      const child = spawn(npxCmd, ['--yes', `get-claudia@${newerVersion}`, ...process.argv.slice(2)], {
        stdio: 'inherit',
        env: { ...process.env, CLAUDIA_SKIP_UPDATE_CHECK: '1' },
      });
      await new Promise((resolve, reject) => {
        child.on('close', (code) => resolve(code));
        child.on('error', reject);
      }).then((code) => {
        process.exit(code || 0);
      });
    } catch {
      // Re-exec failed, fall through to current version
      process.stdout.write(` ${colors.dim}Update failed, continuing with v${version}${colors.reset}\n`);
    }
  }

  // Print compact banner
  process.stdout.write(getBanner(version));

  // Determine target directory and flags
  const args = process.argv.slice(2);

  // --skip-memory is the documented flag; --no-memory kept for backward compatibility.
  const skipMemory = args.includes('--no-memory') || args.includes('--skip-memory');
  // --dev: skip venv creation; load the daemon directly from the local source tree
  // via PYTHONPATH. Useful when iterating on the daemon without `pip install -e`.
  const devMode = args.includes('--dev');
  const filteredArgs = args.filter(a => a !== '--no-memory' && a !== '--skip-memory' && a !== '--dev' && a !== '--yes' && a !== '-y');
  const arg = filteredArgs[0];

  // ─── Subcommand: get-claudia google ─────────────────────────────────────
  if (arg === 'google') {
    await runGoogleSetup();
    process.exit(0);
  }

  // Support "." or "upgrade" for current directory
  const isCurrentDir = arg === '.' || arg === 'upgrade';
  const targetDir = isCurrentDir ? '.' : (arg || 'claudia');
  const targetPath = isCurrentDir ? process.cwd() : join(process.cwd(), targetDir);

  // Check if directory already exists with Claudia files
  let isUpgrade = false;

  if (existsSync(targetPath)) {
    const contents = readdirSync(targetPath);
    const hasClaudioFiles = contents.some(f => f === 'CLAUDE.md' || f === '.claude');
    if (hasClaudioFiles) {
      isUpgrade = true;
    }
  }

  // Ask for confirmation before installing or upgrading
  const action = isUpgrade ? 'Update Claudia' : `Install Claudia to ./${targetDir}`;
  const confirmed = await confirm(`${action}?`);
  if (!confirmed) {
    console.log(` ${colors.dim}Cancelled.${colors.reset}`);
    process.exit(0);
  }

  // Create target directory if not current dir (only for fresh installs)
  if (!isCurrentDir && !isUpgrade) {
    mkdirSync(targetPath, { recursive: true });
  }

  const templatePath = join(__dirname, '..', 'template-v2');

  if (!isUpgrade) {
    // Fresh install: copy everything
    try {
      cpSync(templatePath, targetPath, { recursive: true });
      // npm strips .gitignore from packages, so we ship it as "gitignore" and rename here
      const gitignoreSrc = join(targetPath, 'gitignore');
      const gitignoreDest = join(targetPath, '.gitignore');
      if (existsSync(gitignoreSrc) && !existsSync(gitignoreDest)) {
        renameSync(gitignoreSrc, gitignoreDest);
      }
    } catch (error) {
      console.error(`\n${colors.red}!${colors.reset}  Error copying files: ${error.message}`);
      process.exit(1);
    }
  } else {
    // Upgrade: copy framework files, preserve user data
    const frameworkPaths = ['.claude', 'CLAUDE.md', '.mcp.json.example', 'LICENSE', 'NOTICE', 'workspaces'];

    // Detect user-modified shipped files and let the user decide what to
    // do before we touch anything. Returns a Set of POSIX-relative paths
    // to exclude from the copy; may exit(0) if the user cancels.
    let skipPaths;
    try {
      skipPaths = await handleSkillConflicts(targetPath, templatePath);
    } catch (err) {
      // Conflict detection must never break the upgrade. Fall back to the
      // original copy-over-top behavior with a warning.
      console.log(` ${colors.yellow}!${colors.reset}  Conflict detection failed (${err.message}); falling back to overwrite.`);
      skipPaths = new Set();
    }

    // Build an absolute-path skip set for the cpSync filter callback.
    const skipAbs = new Set();
    for (const rel of skipPaths) {
      skipAbs.add(join(targetPath, rel));
    }
    const copyFilter = (_src, dest) => !skipAbs.has(dest);

    try {
      for (const item of frameworkPaths) {
        const src = join(templatePath, item);
        const dest = join(targetPath, item);
        if (!existsSync(src)) continue;

        const srcStat = statSync(src);
        if (srcStat.isDirectory()) {
          cpSync(src, dest, { recursive: true, force: true, filter: copyFilter });
        } else {
          // For top-level files (CLAUDE.md, LICENSE, etc.), check skip manually
          if (!skipAbs.has(dest)) {
            cpSync(src, dest, { force: true });
          }
        }
      }

      // npm strips .gitignore from packages, so we ship it as "gitignore"
      const gitignoreSrc = join(templatePath, 'gitignore');
      const gitignoreDest = join(targetPath, '.gitignore');
      if (existsSync(gitignoreSrc)) {
        cpSync(gitignoreSrc, gitignoreDest, { force: true });
      }
    } catch (error) {
      console.error(`\n${colors.red}!${colors.reset}  Error upgrading files: ${error.message}`);
      process.exit(1);
    }

    console.log('');
    console.log(` ${colors.cyan}✓${colors.reset} Framework updated`);
    console.log(`   • Your memory at ${colors.bold}~/.claudia/${colors.reset} is preserved (entities, relationships, reflections, embeddings).`);
    console.log(`   • Skills and hooks refreshed; any modifications you chose to keep were respected.`);
    console.log(`   • Restart Claude Code for changes to take effect.`);
  }

  // Self-heal: strip CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS from settings (#24)
  // This env var causes double-spawn crashes on Linux and some macOS setups
  try {
    const settingsPath = join(targetPath, '.claude', 'settings.local.json');
    if (existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(raw);
      if (settings.env && settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) {
        delete settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      }
    }
  } catch { /* non-fatal */ }

  // Restore MCP servers that earlier versions incorrectly disabled.
  restoreMcpServers(targetPath);

  // Write context/whats-new.md for Claudia's self-awareness (silent)
  writeWhatsNewFile(targetPath, version);

  // Install brain visualizer to ~/.claudia/visualizer/ (silent)
  installVisualizer();

  // Create and render progress display
  const renderer = new ProgressRenderer();

  if (skipMemory) {
    renderer.skip('environment');
    renderer.skip('models');
    renderer.skip('memory');
    renderer.skip('daemon');
    renderer.skip('health');

    if (!supportsInPlace) {
      for (const id of ['environment', 'models', 'memory', 'daemon', 'health']) {
        renderer.appendLine(id, 'skipped', 'skipped');
      }
    }
    renderer.render();

    // Only run vault step
    runVaultStep(renderer, () => {
      renderer.stopSpinner();
      renderer.render();
      showCompletion(targetDir, isCurrentDir, false, undefined, isUpgrade);
    });
    return;
  }

  // Start the 5-step progress display
  renderer.startSpinner();
  console.log('');
  renderer.render();

  // Run CLI-based setup (no Python daemon needed)
  let memoryOk = false;
  let rootCause = null;
  let dbScan = null;

  try {
    // Step 1: Environment -- check Node.js version, detect/install/start Ollama
    renderer.update('environment', 'active', 'checking...');
    const nodeVersion = process.versions.node;
    const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
    if (nodeMajor < 18) {
      renderer.update('environment', 'error', `Node ${nodeVersion} (need 18+)`);
      if (!supportsInPlace) renderer.appendLine('environment', 'error', `Node ${nodeVersion} (need 18+)`);
      throw new Error('Node 18+ required');
    }

    // Phase 1: Is Ollama running?
    let ollamaOk = false;
    try {
      const resp = await fetch('http://127.0.0.1:11434/api/version');
      if (resp.ok) ollamaOk = true;
    } catch { /* not running */ }

    // Phase 2: If not running, is it installed?
    if (!ollamaOk) {
      const ollamaInstalled = await isOllamaInstalled();

      if (!ollamaInstalled) {
        // Phase 3: Not installed at all. Install it.
        renderer.update('environment', 'active', 'installing Ollama...');
        const installed = await installOllama();
        if (!installed) {
          renderer.update('environment', 'warn', `Node ${nodeVersion}, no Ollama`);
          if (!supportsInPlace) renderer.appendLine('environment', 'warn', `Node ${nodeVersion}, no Ollama`);
        }
      }

      // Phase 4: Installed (or just installed). Try starting it.
      if (!ollamaOk) {
        renderer.update('environment', 'active', 'starting Ollama...');
        ollamaOk = await startOllama();
      }
    }

    if (ollamaOk) {
      renderer.update('environment', 'done', `Node ${nodeVersion}, Ollama`);
      if (!supportsInPlace) renderer.appendLine('environment', 'done', `Node ${nodeVersion}, Ollama`);
    } else {
      renderer.update('environment', 'warn', `Node ${nodeVersion}, no Ollama`);
      if (!supportsInPlace) renderer.appendLine('environment', 'warn', `Node ${nodeVersion}, no Ollama`);
    }

    // Step 2: AI Models -- pull embedding model if Ollama is available
    if (ollamaOk) {
      renderer.update('models', 'active', 'checking embedding model...');
      let modelReady = false;

      try {
        const tagsResp = await fetch('http://127.0.0.1:11434/api/tags');
        if (tagsResp.ok) {
          const tagsData = await tagsResp.json();
          const models = (tagsData.models || []).map(m => m.name);
          modelReady = models.some(m => m.startsWith('all-minilm'));
        }
      } catch { /* ignore */ }

      if (!modelReady) {
        // Ensure Ollama's identity key exists (required for registry pulls).
        // A fresh Ollama install may have ~/.ollama/ but no key file,
        // causing silent pull failures. Generate one with ssh-keygen if missing.
        await ensureOllamaKey();

        renderer.update('models', 'active', 'pulling all-minilm:l6-v2...');
        let pullOk = false;
        try {
          const pullResp = await fetch('http://127.0.0.1:11434/api/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'all-minilm:l6-v2', stream: false })
          });
          pullOk = pullResp.ok;
        } catch { /* ignore */ }

        // If pull failed, restart Ollama (regenerates keys) and retry once
        if (!pullOk) {
          renderer.update('models', 'active', 'retrying pull...');
          await restartOllama();
          try {
            const retryResp = await fetch('http://127.0.0.1:11434/api/pull', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'all-minilm:l6-v2', stream: false })
            });
            pullOk = retryResp.ok;
          } catch { /* ignore */ }
        }

        modelReady = pullOk;
      }

      if (modelReady) {
        renderer.update('models', 'done', 'all-minilm:l6-v2');
        if (!supportsInPlace) renderer.appendLine('models', 'done', 'all-minilm:l6-v2');
      } else {
        renderer.update('models', 'warn', 'pull failed (can retry later)');
        if (!supportsInPlace) renderer.appendLine('models', 'warn', 'pull failed');
      }
    } else {
      renderer.update('models', 'warn', 'Ollama not running');
      if (!supportsInPlace) renderer.appendLine('models', 'warn', 'Ollama not running');
    }

    // Step 3: Memory System -- create directories, check for existing database
    renderer.update('memory', 'active', 'checking directories...');
    const claudiaHome = join(homedir(), '.claudia');
    mkdirSync(join(claudiaHome, 'memory'), { recursive: true });
    mkdirSync(join(claudiaHome, 'backups'), { recursive: true });

    // Check if a database already exists (existing user)
    const memoryDir = join(claudiaHome, 'memory');
    const existingDbs = readdirSync(memoryDir).filter(f => f.endsWith('.db') && !f.includes('.backup'));
    const hasExistingDb = existingDbs.length > 0;

    if (hasExistingDb) {
      // Health check: detect and remove corrupt/empty claudia.db with stale WAL/SHM files.
      // This prevents "database disk image is malformed" from blocking daemon startup.
      const mainDb = join(memoryDir, 'claudia.db');
      if (existsSync(mainDb)) {
        let dbHealthy = false;
        try {
          execFileSync('sqlite3', [mainDb, 'SELECT COUNT(*) FROM memories;'], {
            encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
          });
          dbHealthy = true;
        } catch {
          // claudia.db exists but can't be queried (empty, corrupt, or stale WAL)
          dbHealthy = false;
        }

        if (!dbHealthy) {
          // Check if there are other databases with actual data to merge
          const otherDbs = existingDbs.filter(f => f !== 'claudia.db' && f !== 'demo.db');
          // Safe to remove: claudia.db is broken and there are other sources, OR it's truly empty
          const dbSize = statSync(mainDb).size;
          if (otherDbs.length > 0 || dbSize <= 8192) {
            try {
              // Remove corrupt db and stale WAL/SHM so daemon can create a fresh one.
              // Stale SHM files cause "database disk image is malformed" on new connections.
              const filesToRemove = [mainDb, mainDb + '-shm', mainDb + '-wal'];
              for (const f of filesToRemove) {
                try { if (existsSync(f)) unlinkSync(f); } catch {}
              }
              renderer.update('memory', 'active', 'repaired corrupt claudia.db');
            } catch (e) {
              // If removal fails, continue -- daemon will report the error
            }
          }
        }
      }

      // Show a quick count via sqlite3 if available
      let quickMemCount = 0;
      if (existsSync(mainDb)) {
        try {
          quickMemCount = parseInt(execFileSync('sqlite3', [mainDb, 'SELECT COUNT(*) FROM memories;'], {
            encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
          }).trim(), 10) || 0;
        } catch { /* sqlite3 CLI not available or db just cleaned up */ }
      }
      const memoryLabel = quickMemCount > 0
        ? `${quickMemCount.toLocaleString()} memories in claudia.db`
        : `${existingDbs.length} database files found`;
      renderer.update('memory', 'done', memoryLabel);
      if (!supportsInPlace) renderer.appendLine('memory', 'done', memoryLabel);
    } else {
      renderer.update('memory', 'done', 'Directories ready (new install)');
      if (!supportsInPlace) renderer.appendLine('memory', 'done', 'Directories ready');
    }

    // Memory operations use the claudia-memory daemon (MCP server).
    // The daemon creates and migrates databases on first startup.

    // Step 4: Memory Daemon -- Python venv + claudia-memory package
    renderer.update('daemon', 'active', 'checking Python...');
    let daemonOk = false;
    let preflightPython = null;   // set by whichever path succeeds (dev or venv)
    let preflightEnv = undefined; // extra env for preflight spawn (dev mode sets PYTHONPATH)
    const daemonVenvDir = join(homedir(), '.claudia', 'daemon', 'venv');
    const venvPython = isWindows
      ? join(daemonVenvDir, 'Scripts', 'python.exe')
      : join(daemonVenvDir, 'bin', 'python');
    const venvPip = isWindows
      ? join(daemonVenvDir, 'Scripts', 'pip')
      : join(daemonVenvDir, 'bin', 'pip');

    // --dev: skip venv entirely; use system Python + PYTHONPATH pointing at the
    // local source tree. Claude Code will spawn the daemon the same way.
    if (devMode) {
      const devPython = await isPythonInstalled();
      const daemonSrc = getMemoryDaemonSrc();
      if (devPython) {
        renderer.update('daemon', 'active', 'dev mode: checking source import...');
        const devImportOk = await new Promise((resolve) => {
          const proc = spawn(devPython, ['-c', 'import claudia_memory; print("ok")'], {
            stdio: 'pipe', timeout: 10000,
            env: { ...process.env, PYTHONPATH: daemonSrc }
          });
          proc.on('close', (code) => resolve(code === 0));
          proc.on('error', () => resolve(false));
        });
        if (devImportOk) {
          daemonOk = true;
          preflightPython = devPython;
          preflightEnv = { ...process.env, PYTHONPATH: daemonSrc };
          renderer.update('daemon', 'done', 'dev mode: source import ok');
          if (!supportsInPlace) renderer.appendLine('daemon', 'done', 'dev mode (PYTHONPATH)');
          // Write .mcp.json with system python + PYTHONPATH env
          const mcpPath = join(targetPath, '.mcp.json');
          const mcpTmp = mcpPath + '.tmp';
          let config = {};
          if (existsSync(mcpPath)) { try { config = JSON.parse(readFileSync(mcpPath, 'utf-8')); } catch { config = {}; } }
          if (!config.mcpServers) config.mcpServers = {};
          config.mcpServers['claudia-memory'] = {
            command: devPython,
            args: ['-m', 'claudia_memory', '--project-dir', targetPath],
            env: { PYTHONPATH: daemonSrc },
            _description: 'Claudia memory (dev mode, no venv)'
          };
          writeFileSync(mcpTmp, JSON.stringify(config, null, 2) + '\n');
          renameSync(mcpTmp, mcpPath);
        } else {
          renderer.update('daemon', 'warn', 'dev mode: import failed (check PYTHONPATH)');
          if (!supportsInPlace) renderer.appendLine('daemon', 'warn', 'dev mode import failed');
          rootCause = rootCause || { step: 'daemon', issue: 'import' };
        }
      } else {
        renderer.update('daemon', 'warn', 'Python 3.10+ not found');
        rootCause = { step: 'daemon', issue: 'python' };
      }
    } else {

    // Phase 1: Find Python 3.10+ (auto-install if missing)
    let pythonCmd = await isPythonInstalled();

    if (!pythonCmd) {
      renderer.update('daemon', 'active', 'installing Python...');
      const installed = await installPython();
      if (installed) pythonCmd = await isPythonInstalled();
    }

    if (!pythonCmd) {
      renderer.update('daemon', 'warn', 'Python 3.10+ not found');
      if (!supportsInPlace) renderer.appendLine('daemon', 'warn', 'Python 3.10+ not found');
      rootCause = { step: 'daemon', issue: 'python' };
    } else {
      // Phase 2: Create venv (or rebuild if using Python 3.14)
      if (existsSync(venvPython)) {
        // Self-heal: check if existing venv uses Python 3.14+
        const venvVer = await new Promise((resolve) => {
          const proc = spawn(venvPython, ['-c', 'import sys; print(sys.version_info.minor)'], {
            stdio: 'pipe', timeout: 5000
          });
          let out = '';
          proc.stdout.on('data', (d) => { out += d.toString(); });
          proc.on('close', () => resolve(out.trim()));
          proc.on('error', () => resolve(''));
        });
        if (venvVer && parseInt(venvVer) >= 14 && pythonCmd !== venvPython) {
          // Check if pythonCmd is < 3.14
          const sysVer = await new Promise((resolve) => {
            const proc = spawn(pythonCmd, ['-c', 'import sys; print(sys.version_info.minor)'], {
              stdio: 'pipe', timeout: 5000
            });
            let out = '';
            proc.stdout.on('data', (d) => { out += d.toString(); });
            proc.on('close', () => resolve(out.trim()));
            proc.on('error', () => resolve(''));
          });
          if (sysVer && parseInt(sysVer) < 14) {
            renderer.update('daemon', 'active', `rebuilding venv (3.14→3.${sysVer})...`);
            // Rebuild venv with better Python
            await new Promise((resolve) => {
              const proc = spawn(pythonCmd, ['-m', 'venv', '--clear', daemonVenvDir], {
                stdio: 'pipe', timeout: 30000
              });
              proc.on('close', (code) => resolve(code === 0));
              proc.on('error', () => resolve(false));
            });
          }
        }
      }

      if (!existsSync(venvPython)) {
        renderer.update('daemon', 'active', 'creating venv...');
        mkdirSync(join(homedir(), '.claudia', 'daemon'), { recursive: true });

        // If pythonCmd is 3.14+ and we're on macOS with Homebrew, auto-install 3.12
        if (process.platform === 'darwin') {
          const cmdVer = await new Promise((resolve) => {
            const proc = spawn(pythonCmd, ['-c', 'import sys; print(sys.version_info.minor)'], {
              stdio: 'pipe', timeout: 5000
            });
            let out = '';
            proc.stdout.on('data', (d) => { out += d.toString(); });
            proc.on('close', () => resolve(out.trim()));
            proc.on('error', () => resolve(''));
          });
          if (cmdVer && parseInt(cmdVer) >= 14) {
            renderer.update('daemon', 'active', 'installing Python 3.12...');
            const installed312 = await new Promise((resolve) => {
              const proc = spawn('brew', ['install', 'python@3.12'], {
                stdio: 'pipe', timeout: 300000
              });
              proc.on('close', (code) => resolve(code === 0));
              proc.on('error', () => resolve(false));
            });
            if (installed312) {
              // Re-detect best Python
              pythonCmd = await isPythonInstalled() || pythonCmd;
            }
          }
        }

        const venvCreated = await new Promise((resolve) => {
          const proc = spawn(pythonCmd, ['-m', 'venv', daemonVenvDir], { stdio: 'pipe' });
          proc.on('close', (code) => resolve(code === 0));
          proc.on('error', () => resolve(false));
        });
        if (!venvCreated) {
          renderer.update('daemon', 'warn', 'venv creation failed');
          if (!supportsInPlace) renderer.appendLine('daemon', 'warn', 'venv creation failed');
          rootCause = rootCause || { step: 'daemon', issue: 'venv' };
        }
      }

      // Phase 3: Install/upgrade claudia-memory into venv
      if (existsSync(venvPip)) {
        renderer.update('daemon', 'active', 'installing daemon...');
        const daemonSrc = join(__dirname, '..', 'memory-daemon');
        const pipInstalled = await new Promise((resolve) => {
          const proc = spawn(venvPip, ['install', '--upgrade', '--quiet', daemonSrc], {
            stdio: 'pipe',
            timeout: 120000
          });
          proc.on('close', (code) => resolve(code === 0));
          proc.on('error', () => resolve(false));
        });
        if (pipInstalled) {
          daemonOk = true;
        } else {
          renderer.update('daemon', 'warn', 'pip install failed');
          if (!supportsInPlace) renderer.appendLine('daemon', 'warn', 'pip install failed');
          rootCause = rootCause || { step: 'daemon', issue: 'pip' };
        }
      }

      // Phase 4: Verify daemon can be imported
      if (daemonOk && existsSync(venvPython)) {
        const verified = await new Promise((resolve) => {
          const proc = spawn(venvPython, ['-c', 'import claudia_memory; print("ok")'], {
            stdio: 'pipe',
            timeout: 10000
          });
          proc.on('close', (code) => resolve(code === 0));
          proc.on('error', () => resolve(false));
        });
        if (!verified) {
          daemonOk = false;
          renderer.update('daemon', 'warn', 'daemon import failed');
          if (!supportsInPlace) renderer.appendLine('daemon', 'warn', 'import failed');
          rootCause = rootCause || { step: 'daemon', issue: 'import' };
        }
      }

      if (daemonOk) {
        preflightPython = venvPython;
        renderer.update('daemon', 'done', 'claudia-memory ready');
        if (!supportsInPlace) renderer.appendLine('daemon', 'done', 'claudia-memory ready');
      }
    }

    // Configure .mcp.json with correct daemon path (venv mode only; dev mode writes its own)
    if (daemonOk && !devMode) {
      ensureDaemonMcpConfig(targetPath, venvPython);
    }
    } // end non-dev mode branch

    // Auto-detect and add Gmail/Calendar MCP entries if credentials exist
    const googleMcpResult = ensureGoogleMcpEntries(targetPath);

    // Run preflight check to verify daemon can actually start.
    // Pass --json so the daemon emits a machine-readable result after a sentinel
    // line (PREFLIGHT_JSON_BEGIN), giving structured failures instead of grepping text.
    if (daemonOk && preflightPython) {
      renderer.update('daemon', 'active', 'running preflight...');
      const preflightOk = await new Promise((resolve) => {
        const proc = spawn(preflightPython, [
          '-m', 'claudia_memory', '--preflight', '--json', '--project-dir', targetPath
        ], { stdio: 'pipe', timeout: 30000, env: preflightEnv });
        let stdout = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.on('close', (code) => {
          // Try structured JSON output first
          const sentinelIdx = stdout.indexOf('PREFLIGHT_JSON_BEGIN\n');
          if (sentinelIdx !== -1) {
            try {
              const jsonStr = stdout.slice(sentinelIdx + 'PREFLIGHT_JSON_BEGIN\n'.length).trim();
              const result = JSON.parse(jsonStr);
              const failures = (result.checks || [])
                .filter(c => !c.ok && c.critical)
                .map(c => `[FAIL] ${c.name}: ${c.detail}${c.fix ? ` — Fix: ${c.fix}` : ''}`);
              return resolve({ ok: result.ok === true, failures });
            } catch { /* fall through */ }
          }
          // Fallback: scan human-readable output for [FAIL] lines
          const lines = stdout.split('\n').filter(l => l.includes('[FAIL]'));
          resolve({ ok: code === 0, failures: lines.map(l => l.trim()) });
        });
        proc.on('error', () => resolve({ ok: false, failures: ['preflight process failed to start'] }));
      });
      if (preflightOk.ok) {
        renderer.update('daemon', 'done', 'preflight passed');
        if (!supportsInPlace) renderer.appendLine('daemon', 'done', 'preflight passed');
      } else {
        renderer.update('daemon', 'warn', 'preflight failed');
        if (!supportsInPlace) renderer.appendLine('daemon', 'warn', 'preflight failed');
        // Show failure details after renderer stops
        if (preflightOk.failures && preflightOk.failures.length > 0) {
          for (const line of preflightOk.failures.slice(0, 3)) {
            if (!supportsInPlace) renderer.appendLine('daemon', 'warn', `  ${line}`);
          }
        }
      }
    }

    // Register LaunchAgent and verify standalone daemon is running (macOS only)
    if (daemonOk && process.platform === 'darwin') {
      await ensureLaunchAgent(venvPython);
      // Verify daemon is actually running (self-heal for existing installs)
      const daemonRunning = await new Promise((resolve) => {
        const proc = spawn('launchctl', ['list', 'com.claudia.memory'], {
          stdio: 'pipe', timeout: 5000
        });
        let out = '';
        proc.stdout.on('data', (d) => { out += d.toString(); });
        proc.on('close', (code) => {
          // launchctl list returns PID in first column, or "-" if not running
          const pid = out.trim().split(/\s+/)[0];
          resolve(code === 0 && pid !== '-' && pid !== '');
        });
        proc.on('error', () => resolve(false));
      });
      if (!daemonRunning) {
        // Force reload: unload then load
        const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.claudia.memory.plist');
        if (existsSync(plistPath)) {
          await new Promise((resolve) => {
            const proc = spawn('launchctl', ['unload', plistPath], { stdio: 'pipe', timeout: 5000 });
            proc.on('close', () => resolve());
            proc.on('error', () => resolve());
          });
          await new Promise((resolve) => {
            const proc = spawn('launchctl', ['load', plistPath], { stdio: 'pipe', timeout: 5000 });
            proc.on('close', () => resolve());
            proc.on('error', () => resolve());
          });
        }
      }
    }

    // On Linux, verify systemd service is enabled and running
    if (daemonOk && process.platform === 'linux') {
      const serviceFile = join(homedir(), '.config', 'systemd', 'user', 'claudia-memory.service');
      if (existsSync(serviceFile)) {
        // Enable and start if not running
        await new Promise((resolve) => {
          const proc = spawn('systemctl', ['--user', 'enable', '--now', 'claudia-memory'], {
            stdio: 'pipe', timeout: 10000
          });
          proc.on('close', () => resolve());
          proc.on('error', () => resolve());
        });
      }
    }

    // MCP Config step: verify .mcp.json is correct and check stdio server count
    if (rootCause?.step === 'daemon') {
      const cascadeMsg = rootCause.issue === 'python' ? 'needs Python first' : 'needs daemon first';
      renderer.update('mcp', 'cascade', cascadeMsg);
      if (!supportsInPlace) renderer.appendLine('mcp', 'cascade', cascadeMsg);
    } else {
      renderer.update('mcp', 'active', 'checking .mcp.json...');
      const mcpCheckResult = checkMcpConfig(targetPath);
      if (mcpCheckResult.hasDaemon && mcpCheckResult.stdioCount >= 1) {
        // Build detail string showing what's configured
        const extras = [];
        if (mcpCheckResult.stdioServers.includes('gmail')) extras.push('gmail');
        if (mcpCheckResult.stdioServers.includes('google-calendar')) extras.push('calendar');
        const otherCount = mcpCheckResult.stdioCount - 1 - extras.length;
        const parts = ['claudia-memory'];
        if (extras.length > 0) parts.push(extras.join(', '));
        if (otherCount > 0) parts.push(`+${otherCount} more`);
        const serverDetail = parts.join(' + ');
        renderer.update('mcp', 'done', serverDetail);
        if (!supportsInPlace) renderer.appendLine('mcp', 'done', serverDetail);
      } else if (mcpCheckResult.hasDaemon && mcpCheckResult.stdioCount === 0) {
        renderer.update('mcp', 'warn', 'claudia-memory configured (no stdio?)');
        if (!supportsInPlace) renderer.appendLine('mcp', 'warn', 'claudia-memory configured (no stdio?)');
      } else {
        renderer.update('mcp', 'warn', 'claudia-memory not in .mcp.json');
        if (!supportsInPlace) renderer.appendLine('mcp', 'warn', 'daemon not configured');
      }
    }

    // Vault step: handled below

    // Health Check: check daemon health endpoint or verify daemon can import
    if (rootCause?.step === 'daemon') {
      const cascadeMsg = rootCause.issue === 'python' ? 'needs Python first' : 'needs daemon first';
      renderer.update('health', 'cascade', cascadeMsg);
      if (!supportsInPlace) renderer.appendLine('health', 'cascade', cascadeMsg);
    } else {
      renderer.update('health', 'active', 'verifying...');
      let healthOk = false;

      // Use /health (fast, no DB queries) rather than /status (full DB scan).
      try {
        const healthResp = await fetch('http://localhost:3848/health', {
          signal: AbortSignal.timeout(3000),
        });
        if (healthResp.ok) {
          const healthData = await healthResp.json();
          healthOk = healthData.status === 'healthy';
        }
      } catch {
        // Standalone daemon not running -- that's OK, check daemon importability instead
      }

      // Fallback: verify the daemon can at least be imported
      if (!healthOk && daemonOk && existsSync(venvPython)) {
        healthOk = await new Promise((resolve) => {
          const proc = spawn(venvPython, ['-c', 'from claudia_memory.database import Database; print("ok")'], {
            stdio: 'pipe',
            timeout: 10000
          });
          proc.on('close', (code) => resolve(code === 0));
          proc.on('error', () => resolve(false));
        });
      }

      if (healthOk) {
        renderer.update('health', 'done', 'system healthy');
        if (!supportsInPlace) renderer.appendLine('health', 'done', 'system healthy');
      } else if (daemonOk) {
        renderer.update('health', 'warn', 'daemon installed, standalone not running');
        if (!supportsInPlace) renderer.appendLine('health', 'warn', 'standalone not running');
      } else {
        renderer.update('health', 'warn', 'check CLAUDE.md for troubleshooting');
        if (!supportsInPlace) renderer.appendLine('health', 'warn', 'check manually');
      }
    }

    // Scan existing databases (results shown after renderer finishes)
    if (daemonOk) {
      dbScan = scanExistingDatabases();
    }

    memoryOk = daemonOk || hasExistingDb;

  } catch (err) {
    // Environment check failed early
    for (const step of ['models', 'memory', 'health']) {
      if (renderer.states[step].state === 'pending' || renderer.states[step].state === 'active') {
        renderer.update(step, 'skipped');
      }
    }
  }

  renderer.stopSpinner();

  // Vault step, then completion
  runVaultStep(renderer, () => {
    renderer.render();
    showDbScanResults(dbScan);
    showCompletion(targetDir, isCurrentDir, memoryOk, rootCause, isUpgrade);
  });

  // ── Vault step ──

  function runVaultStep(renderer, callback) {
    renderer.update('vault', 'active', 'detecting Obsidian...');

    let obsidianDetected = false;

    if (process.platform === 'darwin') {
      obsidianDetected = existsSync('/Applications/Obsidian.app');
      finishVault(obsidianDetected, renderer, callback);
    } else if (isWindows) {
      const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
      obsidianDetected = existsSync(join(localAppData, 'Obsidian', 'Obsidian.exe'));
      finishVault(obsidianDetected, renderer, callback);
    } else {
      // Linux: async detection
      try {
        const which = spawn('which', ['obsidian'], { stdio: 'pipe' });
        which.on('close', (code) => {
          finishVault(code === 0, renderer, callback);
        });
        which.on('error', () => {
          finishVault(false, renderer, callback);
        });
      } catch {
        finishVault(false, renderer, callback);
      }
    }
  }

  function finishVault(obsidianDetected, renderer, callback) {
    // Create vault directory and config (silent)
    const vaultPath = join(homedir(), '.claudia', 'vault');
    mkdirSync(vaultPath, { recursive: true });

    const obsidianDir = join(vaultPath, '.obsidian');
    mkdirSync(obsidianDir, { recursive: true });

    writeFileSync(join(obsidianDir, 'app.json'), JSON.stringify({
      vimMode: false,
      strictLineBreaks: true
    }, null, 2));

    writeFileSync(join(obsidianDir, 'graph.json'), JSON.stringify({
      colorGroups: [
        { query: 'tag:#person', color: { a: 1, rgb: 3329330 } },
        { query: 'tag:#project', color: { a: 1, rgb: 14355762 } },
        { query: 'tag:#organization', color: { a: 1, rgb: 10159730 } }
      ]
    }, null, 2));

    writeFileSync(join(obsidianDir, 'community-plugins.json'), JSON.stringify([], null, 2));

    if (obsidianDetected) {
      renderer.update('vault', 'done', 'configured');
      if (!supportsInPlace) renderer.appendLine('vault', 'done', 'configured');
    } else {
      renderer.update('vault', 'skipped', 'Obsidian not installed (optional)');
      if (!supportsInPlace) renderer.appendLine('vault', 'skipped', 'Obsidian not installed (optional)');
    }

    callback(obsidianDetected);
  }

  // ── Completion block ──

  function showDbScanResults(dbScan) {
    if (!dbScan) return;
    if (dbScan.totalMemories === 0 && dbScan.hashDbs.length === 0) return;

    const withData = dbScan.hashDbs.filter(d => d.memories > 0 || d.entities > 0);
    const empty = dbScan.hashDbs.filter(d => d.memories === 0 && d.entities === 0);

    // Nothing interesting to show if unified DB has data and no legacy DBs
    if (withData.length === 0 && empty.length === 0 && dbScan.unified.memories > 0) return;

    const pl = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : (word.endsWith('y') ? word.slice(0, -1) + 'ies' : word + 's')}`;
    // Simpler: just handle the cases we need
    const memLabel = (n) => n === 1 ? '1 memory' : `${n.toLocaleString()} memories`;
    const entLabel = (n) => n === 1 ? '1 entity' : `${n.toLocaleString()} entities`;
    const dbLabel = (n) => n === 1 ? '1 database' : `${n} databases`;

    console.log('');
    console.log(`${colors.dim}${'─'.repeat(46)}${colors.reset}`);
    console.log(` ${colors.boldCyan}Memory Database Scan${colors.reset}`);
    console.log('');

    if (dbScan.unified.exists) {
      console.log(` ${colors.cyan}●${colors.reset} claudia.db: ${colors.bold}${memLabel(dbScan.unified.memories)}${colors.reset}, ${colors.bold}${entLabel(dbScan.unified.entities)}${colors.reset}`);
    }

    if (withData.length > 0) {
      const totalMem = withData.reduce((s, d) => s + d.memories, 0);
      const totalEnt = withData.reduce((s, d) => s + d.entities, 0);

      console.log('');
      console.log(` ${colors.yellow}${dbLabel(withData.length)} to consolidate (${memLabel(totalMem)}, ${entLabel(totalEnt)}):${colors.reset}`);
      for (const db of withData) {
        console.log(`   ${colors.dim}${db.name}${colors.reset}  ${memLabel(db.memories)}, ${entLabel(db.entities)}`);
      }
      console.log('');
      console.log(` ${colors.dim}Auto-merged into claudia.db on next startup.${colors.reset}`);
    }

    if (empty.length > 0) {
      console.log(` ${colors.dim}${dbLabel(empty.length)} empty, will be cleaned up.${colors.reset}`);
    }

    console.log(`${colors.dim}${'─'.repeat(46)}${colors.reset}`);
  }

  function showCompletion(targetDir, isCurrentDir, memoryInstalled, failureCause, isUpgrade) {
    const rerunCmd = isCurrentDir ? 'npx get-claudia .' : `cd ${targetDir} && npx get-claudia .`;
    const launchCmd = isCurrentDir ? 'claude' : `cd ${targetDir} && claude`;

    console.log('');
    console.log(`${colors.dim}${'━'.repeat(46)}${colors.reset}`);

    if (memoryInstalled && !failureCause) {
      console.log('');
      if (isUpgrade) {
        // Returning user: short and sweet
        const version = getVersion();
        console.log(` ${colors.cyan}Updated to v${version}.${colors.reset}`);
        console.log('');
        console.log(`   ${colors.cyan}${launchCmd}${colors.reset}`);
        console.log('');
        console.log(` ${colors.dim}What's new: /morning-brief · /inbox-check · /feedback${colors.reset}`);
      } else {
        // Fresh install: build anticipation for the onboarding
        console.log(` ${colors.cyan}Claudia is ready.${colors.reset} ${colors.dim}She's waiting to meet you.${colors.reset}`);
        console.log('');
        if (!isCurrentDir) {
          console.log(`   ${colors.cyan}cd ${targetDir}${colors.reset}`);
        }
        console.log(`   ${colors.cyan}claude${colors.reset}`);
        console.log('');
        console.log(` ${colors.dim}She'll introduce herself and learn how you work.${colors.reset}`);
        console.log(` ${colors.dim}Try: ${colors.reset}${colors.cyan}"Say hi"${colors.reset} ${colors.dim}·${colors.reset} ${colors.cyan}/morning-brief${colors.reset} ${colors.dim}·${colors.reset} ${colors.cyan}"Who do I know?"${colors.reset}`);
      }
      console.log(` ${colors.dim}Feedback? Tell Claudia, or visit github.com/kbanc85/claudia/discussions${colors.reset}`);
      console.log('');
      return;
    }

    // Something needs fixing
    console.log('');
    console.log(` ${colors.boldYellow}Almost there!${colors.reset} One thing to fix:`);
    console.log('');

    if (failureCause?.issue === 'python') {
      console.log(` ${colors.bold}→ Install Python 3.10+:${colors.reset}`);
      if (process.platform === 'darwin') {
        const hasBrew = existsSync('/opt/homebrew/bin/brew') || existsSync('/usr/local/bin/brew');
        if (hasBrew) {
          console.log(`   ${colors.cyan}brew install python@3.12${colors.reset}`);
        } else {
          console.log(`   ${colors.dim}Install Homebrew first:${colors.reset}`);
          console.log(`   ${colors.cyan}/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"${colors.reset}`);
          console.log('');
          console.log(`   ${colors.dim}Then:${colors.reset}`);
          console.log(`   ${colors.cyan}brew install python@3.12${colors.reset}`);
        }
      } else if (isWindows) {
        console.log(`   ${colors.cyan}https://www.python.org/downloads/${colors.reset}`);
      } else {
        console.log(`   ${colors.cyan}sudo apt install python3 python3-venv${colors.reset}  ${colors.dim}(Debian/Ubuntu)${colors.reset}`);
        console.log(`   ${colors.cyan}sudo dnf install python3${colors.reset}              ${colors.dim}(Fedora/RHEL)${colors.reset}`);
      }
    } else if (failureCause?.issue === 'venv') {
      console.log(` ${colors.bold}→ Python venv creation failed.${colors.reset}`);
      console.log(`   ${colors.dim}Try: python3 -m ensurepip && python3 -m venv ~/.claudia/daemon/venv${colors.reset}`);
    } else if (failureCause?.issue === 'pip') {
      console.log(` ${colors.bold}→ Daemon package install failed.${colors.reset}`);
      console.log(`   ${colors.dim}Check your internet connection and try again.${colors.reset}`);
    } else if (failureCause?.issue === 'import') {
      console.log(` ${colors.bold}→ Daemon installed but won't load.${colors.reset}`);
      console.log(`   ${colors.dim}Try: rm -rf ~/.claudia/daemon/venv && re-run setup.${colors.reset}`);
    } else {
      console.log(` ${colors.bold}→ Memory daemon not ready.${colors.reset}`);
    }

    console.log('');
    console.log(` ${colors.bold}Then finish setup:${colors.reset}`);
    console.log(`   ${colors.cyan}${rerunCmd}${colors.reset}`);
    console.log('');
    console.log(` ${colors.dim}Stuck? Copy this message into any AI chat and ask for help.${colors.reset}`);
    console.log('');
  }
}

// ─── Google Workspace Setup Command ──────────────────────────────────────────

async function runGoogleSetup() {
  const targetPath = process.cwd();

  console.log('');
  console.log(` ${colors.boldCyan}Google Workspace Setup${colors.reset}`);
  console.log(` ${colors.dim}Connect Gmail, Calendar, Drive, Docs, Sheets, Tasks, and more${colors.reset}`);
  console.log('');

  // Check for uvx using spawn (safe, no shell injection)
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('uvx', ['--version'], { stdio: 'ignore' });
      child.on('close', (code) => code === 0 ? resolve() : reject());
      child.on('error', reject);
    });
  } catch {
    console.log(` ${colors.red}!${colors.reset}  uvx is not installed. Install it first:`);
    console.log(`   ${colors.cyan}pip install uv${colors.reset}  or  ${colors.cyan}brew install uv${colors.reset}`);
    process.exit(1);
  }

  // Detect existing state
  const state = detectOldGoogleMcp(targetPath);

  if (state.hasGmail || state.hasCalendar) {
    console.log(` ${colors.yellow}→${colors.reset} Found standalone Gmail/Calendar MCP servers. These will be kept.`);
    console.log(`   ${colors.dim}Both options work side by side. Workspace MCP adds Drive, Docs, Sheets, and more.${colors.reset}`);
    console.log('');
  }

  if (state.hasWorkspace) {
    const overwrite = await confirm('Google Workspace MCP is already configured. Reconfigure?');
    if (!overwrite) {
      console.log(` ${colors.dim}Keeping existing config.${colors.reset}`);
      return;
    }
  }

  // Get credentials
  console.log(` ${colors.dim}You need a Google Cloud OAuth client (Desktop type).${colors.reset}`);
  console.log(` ${colors.dim}Create one at: https://console.cloud.google.com/apis/credentials${colors.reset}`);
  console.log('');

  const clientId = await prompt(`${colors.cyan}Client ID:${colors.reset}`);
  if (!clientId) {
    console.log(` ${colors.red}!${colors.reset}  Client ID is required.`);
    process.exit(1);
  }

  const clientSecret = await prompt(`${colors.cyan}Client Secret:${colors.reset}`);
  if (!clientSecret) {
    console.log(` ${colors.red}!${colors.reset}  Client Secret is required.`);
    process.exit(1);
  }

  // Pick tier
  console.log('');
  console.log(` ${colors.boldCyan}Tool tiers:${colors.reset}`);
  console.log(`   ${colors.cyan}core${colors.reset}      43 tools  Gmail, Calendar, Drive, Contacts ${colors.dim}(recommended)${colors.reset}`);
  console.log(`   ${colors.yellow}extended${colors.reset}  83 tools  + Docs, Sheets, Tasks, Chat`);
  console.log(`   ${colors.magenta}complete${colors.reset} 111 tools  + Slides, Forms, Apps Script`);
  console.log('');

  const tierInput = await prompt(`${colors.cyan}Tier${colors.reset} ${colors.dim}(core/extended/complete, default: core):${colors.reset}`);
  const tier = ['core', 'extended', 'complete'].includes(tierInput) ? tierInput : 'core';

  // Write config
  setupGoogleWorkspace(targetPath, clientId, clientSecret, tier);

  console.log('');
  console.log(` ${colors.cyan}✓${colors.reset} Google Workspace MCP configured (${colors.bold}${tier}${colors.reset} tier)`);

  if (state.hasGmail || state.hasCalendar) {
    console.log(` ${colors.cyan}✓${colors.reset} Standalone Gmail/Calendar MCP servers kept alongside Workspace`);
  }

  // Build one-click API enablement URL
  const projectNumber = extractProjectNumber(clientId);
  const apiUrl = buildApiEnableUrl(projectNumber, tier);
  const apiCount = (TIER_APIS[tier] || TIER_APIS.core).length;

  console.log('');
  console.log(` ${colors.boldYellow}Next steps:${colors.reset}`);
  console.log('');
  if (projectNumber) {
    console.log(`   1. ${colors.bold}Enable all ${apiCount} APIs at once${colors.reset} (one click):`);
    console.log(`      ${colors.cyan}${apiUrl}${colors.reset}`);
  } else {
    console.log(`   1. ${colors.bold}Enable APIs${colors.reset} in your GCP project:`);
    console.log(`      ${colors.cyan}${apiUrl}${colors.reset}`);
    console.log(`      ${colors.dim}Enable: ${(TIER_APIS[tier] || TIER_APIS.core).join(', ')}${colors.reset}`);
  }
  console.log(`   2. ${colors.bold}Restart Claude Code${colors.reset} for the new MCP server to connect`);
  console.log(`   3. First run will open your browser for ${colors.bold}Google sign-in${colors.reset}`);
  console.log(`   4. ${colors.dim}If you enable more APIs later, sign out and re-authenticate${colors.reset}`);
  console.log(`      ${colors.dim}(delete ~/.workspace-mcp/token.json and restart Claude Code)${colors.reset}`);
  console.log('');
  console.log(` ${colors.dim}Try: "check my inbox", "what's on my calendar", "search my Drive for..."${colors.reset}`);
  console.log('');
}
