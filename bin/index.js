#!/usr/bin/env node

import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWindows = process.platform === 'win32';

// Resolve full PowerShell path on Windows (not always on PATH, e.g. Git Bash)
const powershellPath = isWindows
  ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : null;

// TTY detection
const isTTY = process.stdout.isTTY === true;
const supportsInPlace = isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  white: '\x1b[97m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  boldYellow: '\x1b[1;33m',
  boldCyan: '\x1b[1;36m',
};

// Disable colors when not TTY
if (!isTTY || process.env.NO_COLOR) {
  Object.keys(colors).forEach(k => { colors[k] = ''; });
}

// Read version from package.json
function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Simple y/n prompt. Returns true if user confirms (or non-TTY / --yes flag).
function confirm(question) {
  if (!isTTY || process.argv.includes('--yes') || process.argv.includes('-y')) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(` ${question} ${colors.dim}(y/n)${colors.reset} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

// Compact portrait-only banner
function getBanner(version) {
  if (!isTTY) {
    return `\n CLAUDIA v${version}\n by Kamil Banc · github.com/kbanc85/claudia\n Research in AI that learns how you work\n`;
  }
  const b = colors.cyan;
  const y = colors.yellow;
  const w = colors.white;
  const r = colors.reset;
  return `
  ${y}████████${b}██${r}
${y}██${w}██████████${b}██${r}
${y}██${w}██${r}  ${w}██${r}  ${w}██${y}██${r}
  ${w}██████████${r}
    ${b}██████${r}
  ${b}██████████${r}
    ${w}██${r}  ${w}██${r}

 ${colors.boldYellow}CLAUDIA${colors.reset} ${colors.yellow}v${version}${colors.reset}
 ${colors.boldCyan}by Kamil Banc${colors.reset} ${colors.cyan}· github.com/kbanc85/claudia${colors.reset}
 ${colors.white}Research in AI that learns how you work${colors.reset}
`;
}

// ─── 5 Unified Steps ────────────────────────────────────────────────────

const STEPS = [
  { id: 'environment', label: 'Environment' },
  { id: 'models',      label: 'AI Models' },
  { id: 'memory',      label: 'Memory System' },
  { id: 'vault',       label: 'Obsidian Vault' },
  { id: 'health',      label: 'Health Check' },
];

// ─── Progress Renderer ──────────────────────────────────────────────────

class ProgressRenderer {
  constructor() {
    this.states = {};      // id → { state, detail }
    this.lastLineCount = 0;
    this.spinnerFrame = 0;
    this.spinnerChars = ['◐', '◓', '◑', '◒'];
    this.spinnerTimer = null;

    for (const step of STEPS) {
      this.states[step.id] = { state: 'pending', detail: '' };
    }
  }

  update(stepId, state, detail = '') {
    if (this.states[stepId]) {
      this.states[stepId] = { state, detail };
    }
    this.render();
  }

  skip(stepId, detail = 'skipped') {
    this.update(stepId, 'skipped', detail);
  }

  startSpinner() {
    if (!supportsInPlace) return;
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % this.spinnerChars.length;
      this.render();
    }, 200);
  }

  stopSpinner() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
  }

  getIcon(state) {
    switch (state) {
      case 'done':    return `${colors.green}✓${colors.reset}`;
      case 'warn':    return `${colors.yellow}○${colors.reset}`;
      case 'error':   return `${colors.red}!${colors.reset}`;
      case 'active':  return `${colors.cyan}${this.spinnerChars[this.spinnerFrame]}${colors.reset}`;
      case 'skipped': return `${colors.dim}○${colors.reset}`;
      default:        return `${colors.dim}░${colors.reset}`;
    }
  }

  getCompletedCount() {
    return STEPS.filter(s => {
      const st = this.states[s.id].state;
      return st === 'done' || st === 'warn' || st === 'skipped';
    }).length;
  }

  getProgressBar() {
    const total = STEPS.length;
    const done = this.getCompletedCount();
    const barWidth = 20;
    const filled = Math.round((done / total) * barWidth);
    const empty = barWidth - filled;
    return ` [${colors.green}${'█'.repeat(filled)}${colors.reset}${'░'.repeat(empty)}] ${done}/${total}`;
  }

  render() {
    const lines = [];

    for (const step of STEPS) {
      const { state, detail } = this.states[step.id];
      const icon = this.getIcon(state);
      const label = state === 'skipped'
        ? `${colors.dim}${step.label}${colors.reset}`
        : step.label;
      const detailStr = detail
        ? `${colors.dim}${detail}${colors.reset}`
        : '';
      // Pad label to 20 chars for alignment
      const paddedLabel = step.label.padEnd(20);
      lines.push(` ${icon} ${state === 'skipped' ? colors.dim + paddedLabel + colors.reset : paddedLabel}${detailStr}`);
    }

    lines.push('');
    lines.push(this.getProgressBar());

    if (supportsInPlace) {
      // Move cursor up and clear previous render
      if (this.lastLineCount > 0) {
        process.stdout.write(`\x1b[${this.lastLineCount}A`);
      }
      for (const line of lines) {
        process.stdout.write(`\x1b[2K${line}\n`);
      }
      this.lastLineCount = lines.length;
    } else {
      // Non-TTY: only print when a step changes to done/warn/error
      // (handled in update via appendLine)
    }
  }

  // Non-TTY fallback: append a single line
  appendLine(stepId, state, detail) {
    if (supportsInPlace) return; // handled by render()
    const step = STEPS.find(s => s.id === stepId);
    if (!step) return;
    if (state === 'done' || state === 'warn' || state === 'error' || state === 'skipped') {
      const icon = state === 'done' ? '✓' :
                   state === 'warn' ? '○' :
                   state === 'error' ? '!' : '-';
      console.log(` ${icon} ${step.label}${detail ? '  ' + detail : ''}`);
    }
  }
}

// ─── Ollama helpers ──────────────────────────────────────────────────────

/** Check if Ollama CLI is installed (on PATH or in common locations). */
async function isOllamaInstalled() {
  // Check PATH
  const which = isWindows ? 'where' : 'which';
  const found = await new Promise((resolve) => {
    const proc = spawn(which, ['ollama'], { stdio: 'pipe', timeout: 5000 });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
  if (found) return true;

  // Check common install locations
  if (process.platform === 'darwin') {
    return existsSync('/usr/local/bin/ollama') || existsSync('/opt/homebrew/bin/ollama');
  } else if (!isWindows) {
    return existsSync('/usr/local/bin/ollama') || existsSync('/usr/bin/ollama');
  }
  return existsSync(join(process.env.LOCALAPPDATA || '', 'Ollama', 'ollama.exe'));
}

/**
 * Install Ollama automatically.
 * macOS: uses brew if available, otherwise curl installer
 * Linux: uses official curl installer
 * Windows: skip (requires manual download from ollama.com)
 */
async function installOllama() {
  if (isWindows) return false; // Windows needs manual install from ollama.com

  if (process.platform === 'darwin') {
    // Try Homebrew first
    const hasBrew = await new Promise((resolve) => {
      const proc = spawn('which', ['brew'], { stdio: 'pipe', timeout: 5000 });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });

    if (hasBrew) {
      return new Promise((resolve) => {
        const proc = spawn('brew', ['install', 'ollama'], { stdio: 'pipe', timeout: 120000 });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    }
  }

  // Linux and macOS fallback: official install script
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], {
      stdio: 'pipe',
      timeout: 120000
    });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Start the Ollama service and wait for it to respond.
 * On macOS: open the Ollama app or run `ollama serve` in background.
 * On Linux: run `ollama serve` in background.
 * Returns true if Ollama API responds within ~15 seconds.
 */
async function startOllama() {
  try {
    if (process.platform === 'darwin') {
      // Try macOS app first (installed by brew cask or .dmg), fall back to serve
      const appExists = existsSync('/Applications/Ollama.app');
      if (appExists) {
        spawn('open', ['-a', 'Ollama'], { stdio: 'pipe', detached: true }).unref();
      } else {
        spawn('ollama', ['serve'], { stdio: 'pipe', detached: true }).unref();
      }
    } else if (!isWindows) {
      spawn('ollama', ['serve'], { stdio: 'pipe', detached: true }).unref();
    } else {
      return false;
    }
  } catch {
    return false;
  }

  // Poll until API responds (up to 15 seconds)
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const resp = await fetch('http://127.0.0.1:11434/api/version');
      if (resp.ok) return true;
    } catch { /* not ready yet */ }
  }
  return false;
}

/**
 * Ensure Ollama's Ed25519 identity key exists at ~/.ollama/id_ed25519.
 * A fresh Ollama install sometimes creates ~/.ollama/ without the key file,
 * causing registry pull requests to fail silently. We generate one with
 * ssh-keygen (available on macOS, Linux, and Windows with Git).
 */
async function ensureOllamaKey() {
  const ollamaDir = join(homedir(), '.ollama');
  const keyPath = join(ollamaDir, 'id_ed25519');
  if (existsSync(keyPath)) return;

  mkdirSync(ollamaDir, { recursive: true });
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('ssh-keygen', ['-t', 'ed25519', '-f', keyPath, '-N', '', '-q'], {
        stdio: 'pipe',
        timeout: 10000
      });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ssh-keygen exited ${code}`)));
      proc.on('error', reject);
    });
  } catch {
    // ssh-keygen unavailable or failed; Ollama will need a restart to self-generate.
  }
}

/**
 * Restart Ollama so it regenerates missing config (identity keys, etc.).
 * Kills the running process, waits, then delegates to startOllama().
 */
async function restartOllama() {
  try {
    const killCmd = isWindows ? 'taskkill' : 'pkill';
    const killArgs = isWindows ? ['/f', '/im', 'ollama.exe'] : ['-f', 'ollama'];
    await new Promise((resolve) => {
      const proc = spawn(killCmd, killArgs, { stdio: 'pipe', timeout: 5000 });
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
    await new Promise(r => setTimeout(r, 2000));
  } catch { /* ignore */ }
  return startOllama();
}

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

async function main() {
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

  const skipMemory = args.includes('--no-memory');
  const filteredArgs = args.filter(a => a !== '--no-memory' && a !== '--yes' && a !== '-y');
  const arg = filteredArgs[0];

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
    } catch (error) {
      console.error(`\n${colors.red}!${colors.reset}  Error copying files: ${error.message}`);
      process.exit(1);
    }
  } else {
    // Upgrade: copy framework files, preserve user data
    const frameworkPaths = ['.claude', 'CLAUDE.md', '.gitignore', '.mcp.json.example', 'LICENSE', 'NOTICE', 'workspaces'];

    try {
      for (const item of frameworkPaths) {
        const src = join(templatePath, item);
        const dest = join(targetPath, item);
        if (!existsSync(src)) continue;

        const srcStat = statSync(src);
        if (srcStat.isDirectory()) {
          cpSync(src, dest, { recursive: true, force: true });
        } else {
          cpSync(src, dest, { force: true });
        }
      }
    } catch (error) {
      console.error(`\n${colors.red}!${colors.reset}  Error upgrading files: ${error.message}`);
      process.exit(1);
    }

    console.log('');
    console.log(` ${colors.green}✓${colors.reset} Framework updated (data preserved)`);
  }

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
    renderer.skip('health');

    if (!supportsInPlace) {
      for (const id of ['environment', 'models', 'memory', 'health']) {
        renderer.appendLine(id, 'skipped', 'skipped');
      }
    }
    renderer.render();

    // Only run vault step
    runVaultStep(renderer, () => {
      renderer.stopSpinner();
      renderer.render();
      showCompletion(targetDir, isCurrentDir, false);
    });
    return;
  }

  // Start the 5-step progress display
  renderer.startSpinner();
  console.log('');
  renderer.render();

  // Run CLI-based setup (no Python daemon needed)
  let memoryOk = false;

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

    // Step 3: Memory System -- verify native deps (for system-health diagnostic) and create directories
    renderer.update('memory', 'active', 'checking native deps...');
    const claudiaHome = join(homedir(), '.claudia');
    mkdirSync(join(claudiaHome, 'memory'), { recursive: true });
    mkdirSync(join(claudiaHome, 'backups'), { recursive: true });

    let nativeDepsOk = false;
    try {
      const { createRequire } = await import('module');
      const cliDir = join(__dirname, '..', 'cli');
      // Check that better-sqlite3 can be loaded from the installed package
      const require = createRequire(join(cliDir, 'index.js'));
      require('better-sqlite3');
      nativeDepsOk = true;
    } catch {
      // Native deps not available -- try installing them
      renderer.update('memory', 'active', 'installing native deps...');
      nativeDepsOk = await new Promise((resolve) => {
        const npmCmd = isWindows ? 'npm.cmd' : 'npm';
        const npmProc = spawn(npmCmd, ['install', '--production'], {
          cwd: join(__dirname, '..'),
          stdio: 'pipe'
        });
        npmProc.on('close', (code) => resolve(code === 0));
        npmProc.on('error', () => resolve(false));
      });
    }

    if (nativeDepsOk) {
      renderer.update('memory', 'done', 'Database ready');
      if (!supportsInPlace) renderer.appendLine('memory', 'done', 'Database ready');
    } else {
      renderer.update('memory', 'warn', 'native deps missing (run npm install)');
      if (!supportsInPlace) renderer.appendLine('memory', 'warn', 'native deps missing');
    }

    // Note: claudia-memory daemon is the primary memory interface (MCP server).
    // The CLI (better-sqlite3) provides system-health and fallback access.

    // Step 4 (vault): handled below

    // Step 5: Health Check -- run claudia system-health
    renderer.update('health', 'active', 'verifying...');
    let healthOk = false;

    const cliEntryPoint = join(__dirname, '..', 'cli', 'index.js');
    if (existsSync(cliEntryPoint) && nativeDepsOk) {
      healthOk = await new Promise((resolve) => {
        const proc = spawn(process.execPath, [cliEntryPoint, 'system-health', '--project-dir', targetPath], {
          stdio: 'pipe',
          timeout: 15000
        });
        let stdout = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.on('close', (code) => {
          if (code === 0) {
            try {
              const data = JSON.parse(stdout);
              resolve(data.status === 'healthy' || data.status === 'degraded');
            } catch {
              resolve(false);
            }
          } else {
            resolve(false);
          }
        });
        proc.on('error', () => resolve(false));
      });
    }

    if (healthOk) {
      renderer.update('health', 'done', 'system healthy');
      if (!supportsInPlace) renderer.appendLine('health', 'done', 'system healthy');
    } else if (nativeDepsOk) {
      renderer.update('health', 'warn', 'check CLAUDE.md for troubleshooting');
      if (!supportsInPlace) renderer.appendLine('health', 'warn', 'check manually');
    } else {
      renderer.update('health', 'warn', 'skipped (deps missing)');
      if (!supportsInPlace) renderer.appendLine('health', 'warn', 'skipped');
    }

    memoryOk = nativeDepsOk;

    // (Global CLI install and demo seeder removed in v1.51.25.
    //  Memory operations use the MCP daemon, not the CLI binary.)

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
    showCompletion(targetDir, isCurrentDir, memoryOk);
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
      renderer.update('vault', 'warn', 'Obsidian not found (optional)');
      if (!supportsInPlace) renderer.appendLine('vault', 'warn', 'Obsidian not found (optional)');
    }

    callback(obsidianDetected);
  }

  // ── Completion block ──

  function showCompletion(targetDir, isCurrentDir, memoryInstalled) {
    const cdCmd = isCurrentDir ? '' : `cd ${targetDir} && `;

    console.log('');
    console.log(`${colors.dim}${'━'.repeat(46)}${colors.reset}`);
    console.log(` ${colors.bold}Done!${colors.reset} Open Claude Code:`);
    console.log(`   ${colors.cyan}${cdCmd}claude${colors.reset}`);

    if (!memoryInstalled) {
      console.log('');
      console.log(` ${colors.dim}Memory requires the claudia-memory daemon and Ollama.${colors.reset}`);
      console.log(` ${colors.dim}See CLAUDE.md for setup instructions.${colors.reset}`);
    } else {
      console.log('');
      console.log(` ${colors.dim}Memory database ready. Claudia will remember across sessions.${colors.reset}`);
    }

    console.log('');
  }
}


/**
 * Restore MCP servers that were moved to _disabled_mcpServers by earlier versions.
 * - Gmail/Calendar: v1.51.9-v1.51.12 treated them as legacy, now restored.
 * - claudia-memory: v1.51.13+ treated the daemon as legacy (replaced by CLI),
 *   but MCP is the primary memory interface as of v1.51.22.
 */
function restoreMcpServers(targetPath) {
  const mcpPath = join(targetPath, '.mcp.json');
  if (!existsSync(mcpPath)) return;

  try {
    const raw = readFileSync(mcpPath, 'utf-8');
    const config = JSON.parse(raw);
    if (!config._disabled_mcpServers) return;
    if (!config.mcpServers) config.mcpServers = {};

    const toRestore = ['gmail', 'google-calendar', 'claudia-memory', 'claudia_memory'];
    let changed = false;
    const restored = [];

    for (const key of toRestore) {
      if (config._disabled_mcpServers[key] && !config.mcpServers[key]) {
        const serverConfig = { ...config._disabled_mcpServers[key] };
        delete serverConfig._replaced_by;
        config.mcpServers[key] = serverConfig;
        delete config._disabled_mcpServers[key];
        changed = true;
        restored.push(key);
      }
    }

    // Clean up _disabled_mcpServers if it's now empty
    if (config._disabled_mcpServers && Object.keys(config._disabled_mcpServers).length === 0) {
      delete config._disabled_mcpServers;
    }

    if (changed) {
      writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
      console.log(` ${colors.green}✓${colors.reset} Restored MCP servers: ${restored.join(', ')} (moved back from _disabled_mcpServers)`);
    }
  } catch {
    // Not valid JSON or can't read -- skip silently
  }
}

function installVisualizer() {
  const vizSrc = join(__dirname, '..', 'visualizer');
  if (!existsSync(vizSrc)) return;

  const vizDest = join(homedir(), '.claudia', 'visualizer');
  try {
    mkdirSync(vizDest, { recursive: true });
    cpSync(vizSrc, vizDest, { recursive: true, force: true });

    // Run npm install --production in background (non-blocking, silent)
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';
    const npmProc = spawn(npmCmd, ['install', '--production'], {
      cwd: vizDest,
      stdio: 'pipe',
    });
    npmProc.on('close', () => {});
    npmProc.on('error', () => {});
  } catch {
    // Non-fatal: visualizer is optional
  }
}

function extractChangelog(version) {
  try {
    const changelogPath = join(__dirname, '..', 'CHANGELOG.md');
    const changelog = readFileSync(changelogPath, 'utf8');
    const versionHeader = `## ${version}`;
    const startIdx = changelog.indexOf(versionHeader);
    if (startIdx === -1) return null;

    const afterHeader = startIdx + versionHeader.length;
    const nextHeader = changelog.indexOf('\n## ', afterHeader);
    const section = nextHeader === -1
      ? changelog.slice(afterHeader)
      : changelog.slice(afterHeader, nextHeader);

    return section.trim();
  } catch {
    return null;
  }
}

function writeWhatsNewFile(targetPath, version) {
  try {
    const contextDir = join(targetPath, 'context');
    mkdirSync(contextDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const changelogSection = extractChangelog(version) || 'No changelog available for this version.';

    let skillSections = '';
    try {
      const skillIndexPath = join(__dirname, '..', 'template-v2', '.claude', 'skills', 'skill-index.json');
      const skillIndex = JSON.parse(readFileSync(skillIndexPath, 'utf8'));
      const skills = skillIndex.skills || [];

      const proactive = skills.filter(s => s.invocation === 'proactive');
      const contextual = skills.filter(s => s.invocation === 'contextual');
      const explicit = skills.filter(s => s.invocation === 'explicit');

      skillSections = `## Your Complete Skill Set

### Proactive (auto-activate)
${proactive.map(s => `- **${s.name}** - ${s.description}`).join('\n')}

### Contextual (natural language or /command)
${contextual.map(s => `- **/${s.name}** - ${s.description}`).join('\n')}

### Explicit (/command only)
${explicit.map(s => `- **/${s.name}** - ${s.description}`).join('\n')}

## Memory System
Memory operations use MCP tools from the claudia-memory daemon (memory.recall, memory.remember, memory.about, etc.).
The daemon provides ~33 tools for semantic search, pattern detection, and relationship tracking.
See the memory-manager skill for the full tool reference.`;
    } catch {
      // skill-index.json not found, skip skills section
    }

    const content = `# Updated to v${version} (${date})

## What's New

${changelogSection}

${skillSections}

---
_Surface this update in your first greeting, then delete this file._
`;

    writeFileSync(join(contextDir, 'whats-new.md'), content);
  } catch (err) {
    // Non-fatal
    process.stderr.write(`${colors.dim}  Could not write whats-new.md: ${err.message}${colors.reset}\n`);
  }
}

main();
