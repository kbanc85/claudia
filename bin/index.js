#!/usr/bin/env node

import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, statSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execFileSync } from 'child_process';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { setupGoogleWorkspace, detectOldGoogleMcp, extractProjectNumber, buildApiEnableUrl, TIER_APIS } from './google-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getMemoryDaemonSrc() {
  return join(__dirname, '..', 'memory-daemon');
}

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
    return `\n CLAUDIA v${version}\n by Kamil Banc · claudia.aiadopters.club\n Research in AI that learns how you work\n`;
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
 ${colors.boldCyan}by Kamil Banc${colors.reset} ${colors.cyan}· claudia.aiadopters.club${colors.reset}
 ${colors.white}Research in AI that learns how you work${colors.reset}
`;
}

// ─── 6 Unified Steps ────────────────────────────────────────────────────

const STEPS = [
  { id: 'environment', label: 'Environment' },
  { id: 'models',      label: 'AI Models' },
  { id: 'memory',      label: 'Memory System' },
  { id: 'daemon',      label: 'Memory Daemon' },
  { id: 'mcp',         label: 'MCP Config' },
  { id: 'vault',       label: 'Obsidian Vault' },
  { id: 'health',      label: 'Health Check' },
];

// ─── Subtitles (shown under progress bar during install) ────────────────

const SUBTITLES = [
  'Wiring neurons...',
  'Calibrating charm levels...',
  'Teaching myself to be helpful...',
  'Your memory, but better.',
  'I never forget a face. Or a deadline.',
  'Almost sentient. Mostly organized.',
  'Building something that remembers...',
  'Loading opinions...',
  'Preparing to have preferences...',
  'Indexing everything you will tell me...',
  'Learning to listen...',
  'Setting up your second brain...',
];

// ─── Thinking Wave (animated pulse under progress bar) ──────────────────

const WAVE_WIDTH = 28;
const WAVE_CHARS = ['░', '▒', '▓', '█', '▓', '▒', '░'];

function getWaveFrame(tick) {
  // Build a traveling pulse wave
  const out = [];
  for (let i = 0; i < WAVE_WIDTH; i++) {
    const pos = (i - tick % WAVE_WIDTH + WAVE_WIDTH) % WAVE_WIDTH;
    if (pos < WAVE_CHARS.length) {
      out.push(WAVE_CHARS[pos]);
    } else {
      out.push(' ');
    }
  }
  return ` ${colors.cyan}${out.join('')}${colors.reset}`;
}

// ─── Progress Renderer ──────────────────────────────────────────────────

class ProgressRenderer {
  constructor() {
    this.states = {};      // id → { state, detail }
    this.lastLineCount = 0;
    this.spinnerFrame = 0;
    this.spinnerChars = ['◐', '◓', '◑', '◒'];
    this.spinnerTimer = null;
    this.subtitleIndex = Math.floor(Math.random() * SUBTITLES.length);
    this.subtitleTicks = 0;   // counts render cycles; rotate every ~20 ticks (4s at 200ms)
    this.waveTick = 0;

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
      this.waveTick++;

      // Rotate subtitle every ~4 seconds (20 ticks * 200ms)
      this.subtitleTicks++;
      if (this.subtitleTicks >= 20) {
        this.subtitleTicks = 0;
        this.subtitleIndex = (this.subtitleIndex + 1) % SUBTITLES.length;
      }

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
      case 'done':    return `${colors.cyan}✓${colors.reset}`;
      case 'warn':    return `${colors.yellow}○${colors.reset}`;
      case 'error':   return `${colors.red}!${colors.reset}`;
      case 'active':  return `${colors.cyan}${this.spinnerChars[this.spinnerFrame]}${colors.reset}`;
      case 'skipped': return `${colors.dim}○${colors.reset}`;
      case 'cascade': return `${colors.dim}·${colors.reset}`;
      default:        return `${colors.dim}░${colors.reset}`;
    }
  }

  getCompletedCount() {
    return STEPS.filter(s => {
      const st = this.states[s.id].state;
      return st === 'done' || st === 'warn' || st === 'skipped' || st === 'cascade';
    }).length;
  }

  getProgressBar() {
    const total = STEPS.length;
    const done = this.getCompletedCount();
    const barWidth = 20;
    const filled = Math.round((done / total) * barWidth);
    const empty = barWidth - filled;
    return ` [${colors.cyan}${'█'.repeat(filled)}${colors.reset}${'░'.repeat(empty)}] ${done}/${total}`;
  }

  getSubtitle() {
    const text = SUBTITLES[this.subtitleIndex];
    return ` ${colors.dim}"${text}"${colors.reset}`;
  }

  render() {
    const lines = [];

    for (const step of STEPS) {
      const { state, detail } = this.states[step.id];
      const icon = this.getIcon(state);
      const detailStr = detail
        ? `${colors.dim}${detail}${colors.reset}`
        : '';
      // Pad label to 20 chars for alignment
      const paddedLabel = step.label.padEnd(20);
      lines.push(` ${icon} ${(state === 'skipped' || state === 'cascade') ? colors.dim + paddedLabel + colors.reset : paddedLabel}${detailStr}`);
    }

    lines.push('');
    lines.push(this.getProgressBar());

    // Show thinking wave and rotating subtitle while spinner is active
    if (this.spinnerTimer) {
      lines.push(getWaveFrame(this.waveTick));
      lines.push(this.getSubtitle());
    }

    if (supportsInPlace) {
      // Move cursor up and clear previous render
      if (this.lastLineCount > 0) {
        process.stdout.write(`\x1b[${this.lastLineCount}A`);
      }
      for (const line of lines) {
        process.stdout.write(`\x1b[2K${line}\n`);
      }
      // Clear any leftover lines from previous render (e.g. wave/subtitle removed)
      if (lines.length < this.lastLineCount) {
        for (let i = 0; i < this.lastLineCount - lines.length; i++) {
          process.stdout.write(`\x1b[2K\n`);
        }
        process.stdout.write(`\x1b[${this.lastLineCount - lines.length}A`);
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
    if (state === 'done' || state === 'warn' || state === 'error' || state === 'skipped' || state === 'cascade') {
      const icon = state === 'done' ? '✓' :
                   state === 'warn' ? '○' :
                   state === 'error' ? '!' :
                   state === 'cascade' ? '·' : '-';
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

// ─── Python helpers ─────────────────────────────────────────────────────

/** Check if Python 3.10+ is available. Returns the command name or null. */
async function isPythonInstalled() {
  // Prefer Python < 3.14 (spaCy/pydantic-core don't support 3.14 yet)
  // Try versioned binaries first (3.13, 3.12, 3.11), then unversioned python3
  const candidates = [
    'python3.13', 'python3.12', 'python3.11',  // Versioned: guaranteed < 3.14
    'python3', 'python',                         // Unversioned: check version
  ];
  // On macOS, also check Homebrew paths explicitly
  if (process.platform === 'darwin') {
    candidates.unshift(
      '/opt/homebrew/bin/python3.13', '/opt/homebrew/bin/python3.12', '/opt/homebrew/bin/python3.11',
      '/usr/local/bin/python3.13', '/usr/local/bin/python3.12', '/usr/local/bin/python3.11',
    );
  }
  let fallback314 = null;
  for (const cmd of candidates) {
    const ver = await new Promise((resolve) => {
      const proc = spawn(cmd, ['--version'], { stdio: 'pipe', timeout: 5000 });
      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.on('close', () => resolve(stdout.trim()));
      proc.on('error', () => resolve(''));
    });
    const match = ver.match(/Python (\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1]);
      const minor = parseInt(match[2]);
      if (major === 3 && minor >= 10 && minor < 14) return cmd;
      // Remember 3.14+ as fallback (daemon works, just no spaCy)
      if (major === 3 && minor >= 14 && !fallback314) fallback314 = cmd;
    }
  }
  return fallback314;
}

/**
 * Install Python automatically.
 * macOS: uses brew if available
 * Linux: tries apt, dnf, pacman
 * Windows: skip (requires manual install from python.org)
 */
async function installPython() {
  if (isWindows) return false;

  if (process.platform === 'darwin') {
    const hasBrew = await new Promise((resolve) => {
      const proc = spawn('which', ['brew'], { stdio: 'pipe', timeout: 5000 });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
    if (hasBrew) {
      return new Promise((resolve) => {
        const proc = spawn('brew', ['install', 'python@3.12'], {
          stdio: 'pipe', timeout: 300000
        });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    }
    return false;
  }

  // Linux: try apt, dnf, pacman
  for (const [pm, args] of [
    ['apt-get', ['install', '-y', 'python3', 'python3-venv']],
    ['dnf', ['install', '-y', 'python3']],
    ['pacman', ['-S', '--noconfirm', 'python']],
  ]) {
    const hasPm = await new Promise((resolve) => {
      const proc = spawn('which', [pm], { stdio: 'pipe', timeout: 5000 });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
    if (hasPm) {
      return new Promise((resolve) => {
        const proc = spawn('sudo', [pm, ...args], {
          stdio: 'pipe', timeout: 300000
        });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    }
  }
  return false;
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
    console.log(` ${colors.cyan}✓${colors.reset} Framework updated (data preserved)`);
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


/**
 * Restore MCP servers that were moved to _disabled_mcpServers by earlier versions.
 * - claudia-memory: v1.51.13+ treated the daemon as legacy (replaced by CLI),
 *   but MCP is the primary memory interface as of v1.51.22.
 * - Gmail/Calendar: v1.53.1 disabled these due to Claude Code bug #17962,
 *   but multiple stdio servers now work reliably. Restore them.
 */
function restoreMcpServers(targetPath) {
  const mcpPath = join(targetPath, '.mcp.json');
  if (!existsSync(mcpPath)) return;

  try {
    const raw = readFileSync(mcpPath, 'utf-8');
    const config = JSON.parse(raw);
    if (!config.mcpServers) config.mcpServers = {};

    let changed = false;
    const restored = [];

    // Path 1: Restore from _disabled_mcpServers stash (older migration format)
    if (config._disabled_mcpServers) {
      const toRestore = ['claudia-memory', 'claudia_memory'];
      for (const key of toRestore) {
        if (config._disabled_mcpServers[key] && !config.mcpServers[key]) {
          const serverConfig = { ...config._disabled_mcpServers[key] };
          delete serverConfig._replaced_by;
          delete serverConfig._warning;
          config.mcpServers[key] = serverConfig;
          delete config._disabled_mcpServers[key];
          changed = true;
          restored.push(key);
        }
      }

      // Clean up _disabled_mcpServers if it's now empty
      if (Object.keys(config._disabled_mcpServers).length === 0) {
        delete config._disabled_mcpServers;
      }
    }

    // Path 2: Rename _disabled_ prefixed keys in mcpServers itself
    // This handles the case where keys like "_disabled_gmail" exist directly in mcpServers
    for (const key of Object.keys(config.mcpServers)) {
      if (key.startsWith('_disabled_')) {
        const realKey = key.replace('_disabled_', '');
        if (!config.mcpServers[realKey]) {
          const serverConfig = { ...config.mcpServers[key] };
          delete serverConfig._warning;
          config.mcpServers[realKey] = serverConfig;
          delete config.mcpServers[key];
          changed = true;
          restored.push(realKey);
        }
      }
    }

    if (changed) {
      writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
      console.log(` ${colors.cyan}✓${colors.reset} Restored MCP servers: ${restored.join(', ')}`);
    }
  } catch {
    // Not valid JSON or can't read -- skip silently
  }
}

/**
 * Scan ~/.claudia/memory/ for existing databases and return rough stats.
 * Uses sqlite3 CLI (via execFileSync) to query each .db file safely.
 * Returns { unified: { exists, memories, entities }, hashDbs: [...], totalMemories }
 */
function scanExistingDatabases() {
  const memoryDir = join(homedir(), '.claudia', 'memory');
  const result = {
    unified: { exists: false, memories: 0, entities: 0 },
    hashDbs: [],
    totalMemories: 0,
  };

  if (!existsSync(memoryDir)) return result;

  let files;
  try {
    files = readdirSync(memoryDir);
  } catch {
    return result;
  }

  const hashPattern = /^[0-9a-f]{12}\.db$/;

  for (const file of files) {
    if (!file.endsWith('.db')) continue;
    // Skip WAL/SHM/backup files
    if (file.includes('-wal') || file.includes('-shm') || file.includes('.backup')) continue;
    const filePath = join(memoryDir, file);

    try {
      const stats = statSync(filePath);
      if (stats.size < 4096) continue; // Too small to have data
    } catch {
      continue;
    }

    // Query using sqlite3 CLI (no shell, safe from injection)
    let memories = 0;
    let entities = 0;
    try {
      const memResult = execFileSync('sqlite3', [filePath, 'SELECT COUNT(*) FROM memories;'], {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      memories = parseInt(memResult, 10) || 0;
    } catch { /* table may not exist */ }

    try {
      const entResult = execFileSync('sqlite3', [filePath, 'SELECT COUNT(*) FROM entities WHERE deleted_at IS NULL;'], {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      entities = parseInt(entResult, 10) || 0;
    } catch {
      try {
        const entResult = execFileSync('sqlite3', [filePath, 'SELECT COUNT(*) FROM entities;'], {
          encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        entities = parseInt(entResult, 10) || 0;
      } catch { /* skip */ }
    }

    if (file === 'claudia.db') {
      result.unified = { exists: true, memories, entities };
    } else if (hashPattern.test(file)) {
      result.hashDbs.push({ name: file, memories, entities });
    }

    result.totalMemories += memories;
  }

  return result;
}


/**
 * Ensure .mcp.json has a working claudia-memory daemon entry.
 * - Fresh install (no .mcp.json): creates one with just the daemon entry.
 * - Upgrade: updates the daemon command/args with the correct venv path.
 * Only writes if the venv Python binary exists (daemon was installed).
 */
function ensureDaemonMcpConfig(targetPath, venvPythonPath) {
  if (!existsSync(venvPythonPath)) return;

  const mcpPath = join(targetPath, '.mcp.json');
  const mcpTmp = mcpPath + '.tmp';

  const daemonConfig = {
    command: venvPythonPath,
    args: ['-m', 'claudia_memory', '--project-dir', targetPath],
    _description: 'Claudia memory system with vector search'
  };

  let config;
  if (existsSync(mcpPath)) {
    try {
      config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    } catch {
      // Malformed JSON: back it up so the user can recover their edits,
      // then start fresh so the daemon gets configured rather than silently skipping.
      const backupPath = mcpPath + '.bak';
      try { renameSync(mcpPath, backupPath); } catch { /* ignore */ }
      console.warn(`\n  .mcp.json was malformed — backed up to .mcp.json.bak and recreated.`);
      config = null;
    }
  }

  if (!config) {
    // Fresh install or recovered from corrupt file
    config = {
      mcpServers: {},
      _notes: {
        quick_start: [
          '1. Restart Claude Code after changes',
          '2. See .mcp.json.example for additional servers (Gmail, Calendar, etc.)',
          '3. Each user authenticates with their own accounts'
        ]
      }
    };
  }

  // Merge: only touch the claudia-memory key, preserve all other servers and keys.
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers['claudia-memory'] = daemonConfig;

  // Atomic write: write to .tmp then rename so a crash mid-write never leaves
  // a half-written (and therefore unreadable) .mcp.json.
  writeFileSync(mcpTmp, JSON.stringify(config, null, 2) + '\n');
  renameSync(mcpTmp, mcpPath);
}

/**
 * Ensure gmail and google-calendar MCP entries exist in .mcp.json
 * if the user has credentials at ~/.gmail-mcp/ and ~/.calendar-mcp/.
 * Does not overwrite existing entries. Only adds if credentials are found.
 * Returns { addedGmail, addedCalendar } indicating what was added.
 */
function ensureGoogleMcpEntries(targetPath) {
  const mcpPath = join(targetPath, '.mcp.json');
  const result = { addedGmail: false, addedCalendar: false };

  let config;
  if (existsSync(mcpPath)) {
    try {
      config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    } catch {
      return result; // Malformed JSON -- don't touch
    }
  } else {
    return result; // No .mcp.json yet (ensureDaemonMcpConfig creates it first)
  }

  if (!config.mcpServers) config.mcpServers = {};

  const home = homedir();
  let changed = false;

  // Gmail: add if credentials exist and entry doesn't
  const gmailOauthPath = join(home, '.gmail-mcp', 'gcp-oauth.keys.json');
  const gmailCredsPath = join(home, '.gmail-mcp', 'credentials.json');
  if (!config.mcpServers.gmail && existsSync(gmailOauthPath) && existsSync(gmailCredsPath)) {
    config.mcpServers.gmail = {
      command: 'npx',
      args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp@latest'],
      env: {
        GMAIL_OAUTH_PATH: gmailOauthPath,
        GMAIL_CREDENTIALS_PATH: gmailCredsPath,
      },
    };
    result.addedGmail = true;
    changed = true;
  }

  // Google Calendar: add if credentials exist and entry doesn't
  const calOauthPath = join(home, '.calendar-mcp', 'gcp-oauth.keys.json');
  const calCredsPath = join(home, '.calendar-mcp', 'credentials.json');
  if (!config.mcpServers['google-calendar'] && existsSync(calOauthPath) && existsSync(calCredsPath)) {
    config.mcpServers['google-calendar'] = {
      command: 'npx',
      args: ['-y', '@gongrzhe/server-calendar-autoauth-mcp@latest'],
      env: {
        CALENDAR_OAUTH_PATH: calOauthPath,
        CALENDAR_CREDENTIALS_PATH: calCredsPath,
      },
    };
    result.addedCalendar = true;
    changed = true;
  }

  if (changed) {
    writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
  }

  return result;
}

/**
 * Check .mcp.json configuration and return status.
 * Returns { hasDaemon, stdioCount, stdioServers }.
 */
function checkMcpConfig(targetPath) {
  const mcpPath = join(targetPath, '.mcp.json');
  if (!existsSync(mcpPath)) return { hasDaemon: false, stdioCount: 0, stdioServers: [] };
  try {
    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    const servers = config.mcpServers || {};
    const hasDaemon = !!servers['claudia-memory'];
    const stdioServers = Object.entries(servers)
      .filter(([key]) => !key.startsWith('_'))
      .filter(([, val]) => !val._disabled && (!val.type || val.type === 'stdio'))
      .map(([key]) => key);
    return { hasDaemon, stdioCount: stdioServers.length, stdioServers };
  } catch {
    return { hasDaemon: false, stdioCount: 0, stdioServers: [] };
  }
}


/**
 * Register (or update) the macOS LaunchAgent for the standalone daemon.
 * The standalone daemon runs 24/7 for scheduled jobs (consolidation, decay, vault sync).
 * This is separate from the MCP daemon that Claude Code spawns per-session.
 */
async function ensureLaunchAgent(venvPythonPath) {
  const plistDir = join(homedir(), 'Library', 'LaunchAgents');
  const plistPath = join(plistDir, 'com.claudia.memory.plist');

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claudia.memory</string>
    <key>ProgramArguments</key>
    <array>
        <string>${venvPythonPath}</string>
        <string>-m</string>
        <string>claudia_memory</string>
        <string>--standalone</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${join(homedir(), '.claudia', 'daemon')}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${join(homedir(), '.claudia', 'daemon-stdout.log')}</string>
    <key>StandardErrorPath</key>
    <string>${join(homedir(), '.claudia', 'daemon-stderr.log')}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>`;

  try {
    mkdirSync(plistDir, { recursive: true });
    const needsUpdate = !existsSync(plistPath) || readFileSync(plistPath, 'utf8') !== plistContent;
    if (needsUpdate) {
      // Unload existing agent if present (ignore errors)
      try {
        await new Promise((resolve) => {
          const proc = spawn('launchctl', ['unload', plistPath], { stdio: 'pipe', timeout: 5000 });
          proc.on('close', () => resolve());
          proc.on('error', () => resolve());
        });
      } catch { /* not loaded */ }

      writeFileSync(plistPath, plistContent);

      // Load the new agent
      await new Promise((resolve) => {
        const proc = spawn('launchctl', ['load', plistPath], { stdio: 'pipe', timeout: 5000 });
        proc.on('close', () => resolve());
        proc.on('error', () => resolve());
      });
    }
  } catch {
    // Non-fatal: standalone daemon is optional
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
Memory operations use MCP tools from the claudia-memory daemon (memory_recall, memory_remember, memory_about, etc.).
The daemon provides ~33 tools for semantic search, pattern detection, and relationship tracking.
See the memory-manager skill for the full tool reference.`;
    } catch {
      // skill-index.json not found, skip skills section
    }

    const googleSection = `## Google Workspace Integration

Claudia connects to your full Google Workspace: Gmail, Calendar, Drive, Docs, Sheets, Tasks, and more through one server.

**Quick setup:** Run \`npx get-claudia google\` to configure it interactively. It will generate a one-click URL to enable all required APIs at once.

Or see the Google Integration Setup section in CLAUDE.md for manual configuration. If you enable new APIs later, remember to re-authenticate (delete ~/.workspace-mcp/token.json and restart Claude Code).`;

    const content = `# Updated to v${version} (${date})

## What's New

${changelogSection}

${googleSection}

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

// ─── Google Workspace Setup Command ──────────────────────────────────────────

function prompt(question) {
  if (!isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(` ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

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

main();
