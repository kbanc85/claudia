#!/usr/bin/env node

import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWindows = process.platform === 'win32';

// Resolve full PowerShell path on Windows (not always on PATH, e.g. Git Bash)
const powershellPath = isWindows
  ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : null;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  white: '\x1b[97m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  boldYellow: '\x1b[1;33m',
  boldCyan: '\x1b[1;36m',
};

// Read version from package.json
function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Typewriter effect - writes text char by char
function typewriter(text, color = '') {
  return new Promise((resolve) => {
    const reset = color ? colors.reset : '';
    let i = 0;
    process.stdout.write(color);
    const interval = setInterval(() => {
      if (i < text.length) {
        process.stdout.write(text[i]);
        i++;
      } else {
        process.stdout.write(reset + '\n');
        clearInterval(interval);
        resolve();
      }
    }, 25);
  });
}

// Pixel art banner - "CLAUDIA" text + portrait (double-width for square pixels)
const b = colors.cyan;    // blue pixels
const y = colors.yellow;  // yellow pixels (hair)
const w = colors.white;   // white pixels (face)
const r = colors.reset;
const px = '██';          // double-width block for square pixels
const _ = '  ';           // double-width space

const bannerArt = `
${b}${px}${px}${r}${_}${b}${px}${r}${_}${_}${_}${b}${px}${r}${_}${_}${b}${px}${r}${_}${b}${px}${r}${_}${b}${px}${px}${r}${_}${_}${b}${px}${r}${_}${_}${b}${px}${r}
${b}${px}${r}${_}${_}${b}${px}${r}${_}${_}${b}${px}${r}${_}${b}${px}${r}${_}${b}${px}${r}${_}${b}${px}${r}${_}${b}${px}${r}${_}${b}${px}${r}${_}${b}${px}${r}${_}${b}${px}${r}${_}${b}${px}${r}
${b}${px}${px}${r}${_}${b}${px}${px}${r}${_}${b}${px}${r}${_}${b}${px}${r}${_}${_}${b}${px}${r}${_}${_}${b}${px}${px}${r}${_}${_}${b}${px}${r}${_}${b}${px}${r}${_}${b}${px}${r}

                ${y}${px}${px}${px}${px}${b}${px}${r}
              ${y}${px}${w}${px}${px}${px}${px}${px}${b}${px}${r}
              ${y}${px}${w}${px}${r}${_}${w}${px}${r}${_}${w}${px}${y}${px}${r}
                ${w}${px}${px}${px}${px}${px}${r}
                  ${b}${px}${px}${px}${r}
                ${b}${px}${px}${px}${px}${px}${r}
                  ${w}${px}${r}${_}${w}${px}${r}
`;

async function main() {
  const version = getVersion();

  // Print pixel art
  console.log(bannerArt);

  // Version badge + tagline + attribution (all yellow)
  console.log(`   ${colors.boldYellow}CLAUDIA${colors.reset} ${colors.yellow}v${version}${colors.reset}`);
  await typewriter('   Agentic executive assistant. Learns and adapts to how you work.', colors.yellow);
  console.log(`   ${colors.yellow}by Kamil Banc${colors.reset}`);
  console.log(`   ${colors.yellow}${'─'.repeat(40)}${colors.reset}`);
  console.log();

  // Determine target directory and flags
  const args = process.argv.slice(2);

  // Check for --demo flag
  const isDemoMode = args.includes('--demo');
  const filteredArgs = args.filter(a => a !== '--demo');
  const arg = filteredArgs[0];

  // Support "." or "upgrade" for current directory
  const isCurrentDir = arg === '.' || arg === 'upgrade';
  const targetDir = isCurrentDir ? '.' : (arg || 'claudia');
  const targetPath = isCurrentDir ? process.cwd() : join(process.cwd(), targetDir);
  const displayDir = isCurrentDir ? 'current directory' : targetDir;

  if (isDemoMode) {
    console.log(`${colors.yellow}Demo mode${colors.reset} - Will seed with example data after install`);
  }

  // Check if directory already exists with Claudia files
  let isUpgrade = false;

  if (existsSync(targetPath)) {
    const contents = readdirSync(targetPath);
    const hasClaudioFiles = contents.some(f => f === 'CLAUDE.md' || f === '.claude');

    if (hasClaudioFiles) {
      isUpgrade = true;
      console.log(`${colors.cyan}✓${colors.reset} Found existing Claudia instance. Upgrading framework files...`);
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
      console.log(`${colors.green}✓${colors.reset} Installed in ${displayDir}`);
    } catch (error) {
      console.error(`\n${colors.yellow}!${colors.reset}  Error copying files: ${error.message}`);
      process.exit(1);
    }
  } else {
    // Upgrade: copy framework files, preserve user data
    // Framework = .claude/ (skills, commands, rules, hooks), CLAUDE.md, .gitignore,
    //             .mcp.json.example, LICENSE, NOTICE
    // User data = context/, people/, projects/, .mcp.json (has user's config)
    const frameworkPaths = ['.claude', 'CLAUDE.md', '.gitignore', '.mcp.json.example', 'LICENSE', 'NOTICE'];
    let upgraded = 0;

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
        upgraded++;
      }
      console.log(`${colors.green}✓${colors.reset} Updated ${upgraded} framework components (skills, commands, rules, identity)`);
      console.log(`${colors.dim}  Your data (context/, people/, projects/) was preserved.${colors.reset}`);
    } catch (error) {
      console.error(`\n${colors.yellow}!${colors.reset}  Error upgrading files: ${error.message}`);
      process.exit(1);
    }
  }

  // Show what's new in this release
  showWhatsNew(isUpgrade);

  // Helper: seed demo database using spawn (safe, no shell injection)
  function seedDemoDatabase(targetPath, mcpPath, callback) {
    console.log(`\n${colors.cyan}Seeding demo database...${colors.reset}`);
    const seedScript = join(__dirname, '..', 'memory-daemon', 'scripts', 'seed_demo.py');
    const pythonPath = isWindows
      ? join(homedir(), '.claudia', 'daemon', 'venv', 'Scripts', 'python.exe')
      : join(homedir(), '.claudia', 'daemon', 'venv', 'bin', 'python');

    const seedProc = spawn(pythonPath, [seedScript, '--workspace', targetPath, '--force'], {
      stdio: 'inherit'
    });

    seedProc.on('close', (seedCode) => {
      if (seedCode === 0) {
        console.log(`${colors.green}✓${colors.reset} Demo data seeded (isolated in ~/.claudia/demo/)`);
        console.log(`${colors.dim}  Your real data directory (~/.claudia/memory/) is untouched.${colors.reset}`);

        // Add CLAUDIA_DEMO_MODE to .mcp.json env
        if (existsSync(mcpPath)) {
          try {
            let mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
            if (mcpConfig.mcpServers && mcpConfig.mcpServers['claudia-memory']) {
              mcpConfig.mcpServers['claudia-memory'].env = mcpConfig.mcpServers['claudia-memory'].env || {};
              mcpConfig.mcpServers['claudia-memory'].env.CLAUDIA_DEMO_MODE = '1';
              writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
              console.log(`${colors.green}✓${colors.reset} Configured to use demo database`);
            }
          } catch (e) {
            console.log(`${colors.yellow}!${colors.reset} Could not update .mcp.json for demo mode`);
          }
        }
      } else {
        console.log(`${colors.yellow}!${colors.reset} Could not seed demo data`);
        console.log(`  You can seed manually: python ~/.claudia/daemon/venv/bin/python ~/.claudia/daemon/memory-daemon/scripts/seed_demo.py`);
      }
      callback();
    });

    seedProc.on('error', (err) => {
      console.log(`${colors.yellow}!${colors.reset} Could not seed demo data: ${err.message}`);
      callback();
    });
  }

  // Helper: set up Obsidian vault and detect Obsidian installation
  function runObsidianSetup(callback) {
    console.log(`\n${colors.boldYellow}━━━ Phase 2/2: Obsidian Vault ━━━${colors.reset}\n`);

    let obsidianDetected = false;

    // Platform-specific Obsidian detection
    if (process.platform === 'darwin') {
      obsidianDetected = existsSync('/Applications/Obsidian.app');
    } else if (isWindows) {
      const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
      obsidianDetected = existsSync(join(localAppData, 'Obsidian', 'Obsidian.exe'));
    } else {
      // Linux: check if obsidian is on PATH
      try {
        const which = spawn('which', ['obsidian'], { stdio: 'pipe' });
        which.on('close', (code) => {
          obsidianDetected = code === 0;
          finishObsidianSetup(obsidianDetected, callback);
        });
        which.on('error', () => {
          finishObsidianSetup(false, callback);
        });
        return; // Wait for async which to complete on Linux
      } catch {
        obsidianDetected = false;
      }
    }

    finishObsidianSetup(obsidianDetected, callback);
  }

  function finishObsidianSetup(obsidianDetected, callback) {
    if (obsidianDetected) {
      console.log(`${colors.green}✓${colors.reset} Obsidian detected`);
    } else {
      console.log(`${colors.yellow}○${colors.reset} Obsidian not found (optional, recommended)`);
      if (process.platform === 'darwin') {
        console.log(`  Install: ${colors.cyan}brew install --cask obsidian${colors.reset} or download from ${colors.cyan}https://obsidian.md${colors.reset}`);
      } else if (isWindows) {
        console.log(`  Install: ${colors.cyan}winget install Obsidian.Obsidian${colors.reset} or download from ${colors.cyan}https://obsidian.md${colors.reset}`);
      } else {
        console.log(`  Install: ${colors.cyan}snap install obsidian --classic${colors.reset} or download AppImage from ${colors.cyan}https://obsidian.md${colors.reset}`);
      }
    }

    // Create vault directory
    const vaultPath = join(homedir(), '.claudia', 'vault');
    mkdirSync(vaultPath, { recursive: true });
    console.log(`${colors.green}✓${colors.reset} Vault directory ready at ~/.claudia/vault/`);

    // Create minimal .obsidian config inside vault
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

    console.log(`${colors.green}✓${colors.reset} Obsidian config created`);
    console.log(`${colors.dim}  Recommended plugin: Dataview (for dynamic queries)${colors.reset}`);

    callback(obsidianDetected);
  }

  // Helper: run system health check after install
  function runSystemHealthCheck(callback) {
    const diagnoseScript = isWindows
      ? join(homedir(), '.claudia', 'diagnose.ps1')
      : join(homedir(), '.claudia', 'diagnose.sh');

    if (!existsSync(diagnoseScript)) {
      // Diagnose script not installed yet - skip check
      callback(true);
      return;
    }

    console.log(`\n${colors.cyan}Running system health check...${colors.reset}`);

    const spawnCmd = isWindows ? powershellPath : 'bash';
    const spawnArgs = isWindows
      ? ['-ExecutionPolicy', 'Bypass', '-File', diagnoseScript]
      : [diagnoseScript];

    const healthCheck = spawn(spawnCmd, spawnArgs, {
      stdio: 'inherit'
    });

    healthCheck.on('close', (code) => {
      callback(code === 0);
    });

    healthCheck.on('error', () => {
      // If health check fails to run, continue anyway
      callback(true);
    });
  }

  // Helper: finish install after optional components
  function finishInstall(memoryInstalled, obsidianDetected) {
    if (memoryInstalled) {
      // Run health check when memory system was installed
      runSystemHealthCheck((healthy) => {
        showNextSteps(memoryInstalled, obsidianDetected, healthy);
      });
    } else {
      showNextSteps(memoryInstalled, obsidianDetected, true);
    }
  }

  // Memory system always installs (no prompt)
  console.log(`\n${colors.boldYellow}━━━ Phase 1/2: Memory System ━━━${colors.reset}\n`);

  const memoryDaemonPath = isWindows
    ? join(__dirname, '..', 'memory-daemon', 'scripts', 'install.ps1')
    : join(__dirname, '..', 'memory-daemon', 'scripts', 'install.sh');

  if (existsSync(memoryDaemonPath)) {
    try {
      // Run the install script, passing project path for upgrades
      const spawnCmd = isWindows ? powershellPath : 'bash';
      const spawnArgs = isWindows
        ? ['-ExecutionPolicy', 'Bypass', '-File', memoryDaemonPath]
        : [memoryDaemonPath];
      const result = spawn(spawnCmd, spawnArgs, {
        stdio: 'inherit',
        env: {
          ...process.env,
          CLAUDIA_PROJECT_PATH: isUpgrade ? targetPath : '',
          CLAUDIA_NONINTERACTIVE: '1'
        }
      });

      result.on('close', (code) => {
        let memoryOk = false;
        if (code === 0) {
          console.log(`${colors.green}✓${colors.reset} Memory system installed`);
          memoryOk = true;

          // Update .mcp.json if it exists
          const mcpPath = join(targetPath, '.mcp.json');
          const mcpExamplePath = join(targetPath, '.mcp.json.example');

          if (existsSync(mcpExamplePath) && !existsSync(mcpPath)) {
            // Read example and add memory server
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
            console.log(`${colors.green}✓${colors.reset} Created .mcp.json with memory server`);
          }

          // Seed demo database if --demo flag was passed
          if (isDemoMode) {
            const mcpPathForDemo = join(targetPath, '.mcp.json');
            seedDemoDatabase(targetPath, mcpPathForDemo, () => runObsidianSetup((obsidianOk) => finishInstall(memoryOk, obsidianOk)));
            return; // Wait for demo seed to complete
          }
        } else {
          console.log(`${colors.yellow}!${colors.reset} Memory setup had issues. You can run it later with:`);
          if (isWindows) {
            console.log(`  ${colors.cyan}powershell.exe -ExecutionPolicy Bypass -File "${memoryDaemonPath}"${colors.reset}`);
          } else {
            console.log(`  ${colors.cyan}bash ${memoryDaemonPath}${colors.reset}`);
          }
        }

        // Chain Obsidian vault setup, then finish
        runObsidianSetup((obsidianOk) => finishInstall(memoryOk, obsidianOk));
      });

      return; // Wait for spawn to complete
    } catch (error) {
      console.log(`${colors.yellow}!${colors.reset} Could not set up memory system: ${error.message}`);
      console.log(`  You can set it up later manually.`);
    }
  } else {
    console.log(`${colors.yellow}!${colors.reset} Memory daemon files not found. Skipping.`);
  }

  // Memory failed to spawn -- continue with Obsidian setup
  runObsidianSetup((obsidianOk) => finishInstall(false, obsidianOk));

  function showNextSteps(memoryInstalled, obsidianDetected, systemHealthy = true) {
    const cdStep = isCurrentDir ? '' : `  ${colors.cyan}cd ${targetDir}${colors.reset}\n`;

    // Installation summary
    console.log(`\n${colors.boldYellow}━━━ Installation Complete ━━━${colors.reset}\n`);

    const check = `${colors.green}✓${colors.reset}`;
    const warn = `${colors.yellow}○${colors.reset}`;

    console.log(`${memoryInstalled ? check : warn} Memory system    ${memoryInstalled ? 'Active' : 'Skipped'}`);
    console.log(`${obsidianDetected ? check : warn} Obsidian vault    ${obsidianDetected ? 'Detected' : 'Not found (optional)'}`);

    if (!systemHealthy) {
      console.log(`\n${colors.yellow}Some issues were detected above.${colors.reset}`);
      console.log(`${colors.dim}You can fix them now, or Claudia will work in fallback mode until they're resolved.${colors.reset}`);
      console.log(`${colors.dim}Re-run diagnostics anytime: ${isWindows ? '%USERPROFILE%\\.claudia\\diagnose.ps1' : '~/.claudia/diagnose.sh'}${colors.reset}`);
    }

    console.log(`
${colors.bold}Next:${colors.reset}
${cdStep}  ${colors.cyan}claude${colors.reset}
`);

    if (memoryInstalled) {
      console.log(`${colors.dim}If Claude was already running elsewhere, restart it to activate memory tools.${colors.reset}`);
    }
  }
}

function showWhatsNew(isUpgrade) {
  const c = colors.cyan;
  const y = colors.yellow;
  const d = colors.dim;
  const by = colors.boldYellow;
  const bc = colors.boldCyan;
  const r = colors.reset;

  const header = isUpgrade ? `${by}What's New${r}` : `${by}What You're Getting${r}`;
  const line = `${y}${'─'.repeat(48)}${r}`;

  console.log(`
${line}
  ${header}
${line}

  ${bc}Zero-Prompt Install${r}  ${d}Everything installs automatically.${r}
                       ${d}No questions, smart defaults, graceful fallbacks.${r}

  ${bc}Obsidian Vault${r}       ${d}Memory syncs to ~/.claudia/vault/ as markdown.${r}
                       ${d}Open in Obsidian for graph view and search.${r}

  ${bc}Document Storage${r}     ${d}Files, transcripts, and emails are stored${r}
                       ${d}and linked to people and memories.${r}

  ${bc}Provenance${r}           ${d}Every fact traces back to its source.${r}
                       ${d}Ask "how do you know that?" and Claudia shows her work.${r}

${line}
`);
}

main();
