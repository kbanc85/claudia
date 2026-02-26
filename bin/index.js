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

// ─── STATUS Line Parser ─────────────────────────────────────────────────

function parseStatusLine(line) {
  // STATUS:step:state:detail (4+ parts, detail may contain colons)
  // ERROR:step:detail (3+ parts, detail may contain colons)
  if (line.startsWith('STATUS:')) {
    const parts = line.slice(7).split(':');
    if (parts.length >= 2) {
      return { type: 'status', step: parts[0], state: parts[1], detail: parts.slice(2).join(':') };
    }
  } else if (line.startsWith('ERROR:')) {
    const parts = line.slice(6).split(':');
    if (parts.length >= 1) {
      return { type: 'error', step: parts[0], state: '', detail: parts.slice(1).join(':') };
    }
  }
  return null;
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  const version = getVersion();

  // Print compact banner
  process.stdout.write(getBanner(version));

  // Determine target directory and flags
  const args = process.argv.slice(2);

  const isDemoMode = args.includes('--demo');
  const skipMemory = args.includes('--no-memory');
  const filteredArgs = args.filter(a => a !== '--demo' && a !== '--no-memory');
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

    console.log(` ${colors.green}✓${colors.reset} Framework updated (data preserved)`);
  }

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

  // Run install.sh/ps1 in embedded mode, piping STATUS lines
  const memoryDaemonPath = isWindows
    ? join(__dirname, '..', 'memory-daemon', 'scripts', 'install.ps1')
    : join(__dirname, '..', 'memory-daemon', 'scripts', 'install.sh');

  if (!existsSync(memoryDaemonPath)) {
    renderer.update('environment', 'error', 'installer not found');
    renderer.update('models', 'skipped');
    renderer.update('memory', 'skipped');
    renderer.update('health', 'skipped');
    renderer.stopSpinner();
    renderer.render();
    runVaultStep(renderer, () => {
      renderer.render();
      showCompletion(targetDir, isCurrentDir, false);
    });
    return;
  }

  const spawnCmd = isWindows ? powershellPath : 'bash';
  const spawnArgs = isWindows
    ? ['-ExecutionPolicy', 'Bypass', '-File', memoryDaemonPath]
    : [memoryDaemonPath];

  let stderrBuf = '';
  let memoryOk = false;

  const installProc = spawn(spawnCmd, spawnArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CLAUDIA_PROJECT_PATH: targetPath,
      CLAUDIA_NONINTERACTIVE: '1',
      CLAUDIA_EMBEDDED: '1'
    }
  });

  // Parse stdout for STATUS/ERROR lines
  const rl = createInterface({ input: installProc.stdout });
  rl.on('line', (line) => {
    const parsed = parseStatusLine(line);
    if (!parsed) return;

    if (parsed.type === 'error') {
      // ERROR:step:detail
      const stepId = parsed.step;
      renderer.update(stepId, 'error', parsed.detail);
      if (!supportsInPlace) renderer.appendLine(stepId, 'error', parsed.detail);
    } else {
      // STATUS:step:state:detail
      const { step: stepId, state, detail } = parsed;
      if (state === 'ok') {
        renderer.update(stepId, 'done', detail);
        if (!supportsInPlace) renderer.appendLine(stepId, 'done', detail);
      } else if (state === 'warn') {
        renderer.update(stepId, 'warn', detail);
        if (!supportsInPlace) renderer.appendLine(stepId, 'warn', detail);
      } else if (state === 'progress') {
        renderer.update(stepId, 'active', detail);
      }
    }
  });

  // Capture stderr for error dump
  installProc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
  });

  installProc.on('close', (code) => {
    memoryOk = code === 0;

    // Fill in any steps that didn't get a final STATUS
    for (const step of ['environment', 'models', 'memory', 'health']) {
      const st = renderer.states[step].state;
      if (st === 'active' || st === 'pending') {
        if (code === 0) {
          renderer.update(step, 'done');
          if (!supportsInPlace) renderer.appendLine(step, 'done', '');
        } else {
          renderer.update(step, 'error', 'failed');
          if (!supportsInPlace) renderer.appendLine(step, 'error', 'failed');
        }
      }
    }

    renderer.stopSpinner();

    if (memoryOk) {
      // Set up .mcp.json
      setupMcpJson(targetPath);

      // Seed demo database if --demo flag
      if (isDemoMode) {
        const mcpPath = join(targetPath, '.mcp.json');
        seedDemoDatabase(targetPath, mcpPath, () => {
          runVaultStep(renderer, () => {
            renderer.render();
            showCompletion(targetDir, isCurrentDir, true);
          });
        });
        return;
      }
    } else {
      // Dump stderr on failure
      if (stderrBuf.trim()) {
        console.log(`\n${colors.dim}${stderrBuf.trim()}${colors.reset}`);
      }
      console.log(`${colors.dim} Full log: ~/.claudia/install.log${colors.reset}`);
    }

    // Vault step, then completion
    runVaultStep(renderer, () => {
      renderer.render();
      showCompletion(targetDir, isCurrentDir, memoryOk);
    });
  });

  installProc.on('error', (err) => {
    renderer.update('environment', 'error', err.message);
    renderer.update('models', 'skipped');
    renderer.update('memory', 'skipped');
    renderer.update('health', 'skipped');
    renderer.stopSpinner();
    renderer.render();

    runVaultStep(renderer, () => {
      renderer.render();
      showCompletion(targetDir, isCurrentDir, false);
    });
  });

  // ── Vault step (runs in index.js, not in install.sh) ──

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

  // ── .mcp.json setup (silent) ──

  function setupMcpJson(targetPath) {
    const mcpPath = join(targetPath, '.mcp.json');
    const mcpExamplePath = join(targetPath, '.mcp.json.example');

    if (existsSync(mcpExamplePath) && !existsSync(mcpPath)) {
      try {
        let mcpConfig = JSON.parse(readFileSync(mcpExamplePath, 'utf8'));
        mcpConfig.mcpServers = mcpConfig.mcpServers || {};

        const home = homedir();
        const pythonCmd = isWindows
          ? join(home, '.claudia', 'daemon', 'venv', 'Scripts', 'python.exe')
          : `${process.env.HOME}/.claudia/daemon/venv/bin/python`;

        mcpConfig.mcpServers['claudia-memory'] = {
          command: pythonCmd,
          args: ['-m', 'claudia_memory', '--project-dir', '${workspaceFolder}'],
          _description: 'Claudia memory system with vector search'
        };
        writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
      } catch {
        // Non-fatal
      }
    }
  }

  // ── Demo database seeder (silent spawn) ──

  function seedDemoDatabase(targetPath, mcpPath, callback) {
    const seedScript = join(__dirname, '..', 'memory-daemon', 'scripts', 'seed_demo.py');
    const pythonPath = isWindows
      ? join(homedir(), '.claudia', 'daemon', 'venv', 'Scripts', 'python.exe')
      : join(homedir(), '.claudia', 'daemon', 'venv', 'bin', 'python');

    const seedProc = spawn(pythonPath, [seedScript, '--workspace', targetPath, '--force'], {
      stdio: 'pipe'
    });

    seedProc.on('close', (seedCode) => {
      if (seedCode === 0) {
        // Add CLAUDIA_DEMO_MODE to .mcp.json env
        if (existsSync(mcpPath)) {
          try {
            let mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
            if (mcpConfig.mcpServers && mcpConfig.mcpServers['claudia-memory']) {
              mcpConfig.mcpServers['claudia-memory'].env = mcpConfig.mcpServers['claudia-memory'].env || {};
              mcpConfig.mcpServers['claudia-memory'].env.CLAUDIA_DEMO_MODE = '1';
              writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
            }
          } catch {
            // Non-fatal
          }
        }
      }
      callback();
    });

    seedProc.on('error', () => {
      callback();
    });
  }

  // ── Completion block ──

  function showCompletion(targetDir, isCurrentDir, memoryInstalled) {
    const cdCmd = isCurrentDir ? '' : `cd ${targetDir} && `;

    console.log('');
    console.log(`${colors.dim}${'━'.repeat(46)}${colors.reset}`);
    console.log(` ${colors.bold}Done!${colors.reset} Next:`);
    console.log(`   ${colors.cyan}${cdCmd}claude${colors.reset}`);

    if (memoryInstalled) {
      console.log('');
      console.log(` ${colors.boldYellow}⚡${colors.reset} Restart Claude Code if it's already open.`);
    }
    console.log('');
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

## Memory Tools (21 MCP tools)
13 standalone: remember, recall, about, relate, batch, end_session, consolidate, briefing, summary, reflections, system_health, project_health, cognitive.ingest
8 merged: temporal (upcoming/since/timeline/morning), graph (network/path/hubs/dormant/reconnect), entities (create/search/merge/delete/overview), vault (sync/status/canvas/import), modify (correct/invalidate/invalidate_relationship), session (buffer/context/unsummarized), document (store/search), provenance (trace/audit)`;
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
