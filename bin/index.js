#!/usr/bin/env node

import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { createInterface } from 'readline';
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

const banner = `
${bannerArt}
${colors.dim}Agentic executive assistant. Learns and adapts to how you work.${colors.reset}
${colors.dim}by Kamil Banc${colors.reset}
`;

async function main() {
  console.log(banner);

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
    console.log(`${colors.yellow}🎭 Demo mode${colors.reset} - Will seed with example data after install`);
  }

  // Check if directory already exists with Claudia files
  let isUpgrade = false;

  if (existsSync(targetPath)) {
    const contents = readdirSync(targetPath);
    const hasClaudioFiles = contents.some(f => f === 'CLAUDE.md' || f === '.claude');

    if (hasClaudioFiles) {
      isUpgrade = true;
      console.log(`\n${colors.cyan}✓${colors.reset} Found existing Claudia instance. Upgrading framework files...`);
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
      console.error(`\n${colors.yellow}⚠${colors.reset}  Error copying files: ${error.message}`);
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
      console.error(`\n${colors.yellow}⚠${colors.reset}  Error upgrading files: ${error.message}`);
      process.exit(1);
    }
  }

  // Show what's new in this release
  showWhatsNew(isUpgrade);

  // Interactive setup prompts
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askYesNo = (question) => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  };

  const setupMemory = await askYesNo(`\n${colors.yellow}?${colors.reset} Set up enhanced memory system? (recommended) [y/n]: `);
  rl.close();

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

  // Helper: run visualizer install script and call back when done (auto-install, no prompt)
  function runVisualizerSetup(callback) {
    console.log(`\n${colors.cyan}Setting up brain visualizer...${colors.reset}`);

    const visualizerScriptPath = isWindows
      ? join(__dirname, '..', 'visualizer', 'scripts', 'install.ps1')
      : join(__dirname, '..', 'visualizer', 'scripts', 'install.sh');

    if (!existsSync(visualizerScriptPath)) {
      console.log(`${colors.yellow}!${colors.reset} Visualizer files not found. Skipping.`);
      callback(false);
      return;
    }

    try {
      const spawnCmd = isWindows ? powershellPath : 'bash';
      const spawnArgs = isWindows
        ? ['-ExecutionPolicy', 'Bypass', '-File', visualizerScriptPath]
        : [visualizerScriptPath];
      const vizResult = spawn(spawnCmd, spawnArgs, {
        stdio: 'inherit'
      });

      vizResult.on('close', (code) => {
        if (code === 0) {
          console.log(`${colors.green}✓${colors.reset} Brain visualizer installed`);
          callback(true);
        } else {
          console.log(`${colors.yellow}!${colors.reset} Visualizer setup had issues. You can run it later with:`);
          if (isWindows) {
            console.log(`  ${colors.cyan}powershell.exe -ExecutionPolicy Bypass -File "${visualizerScriptPath}"${colors.reset}`);
          } else {
            console.log(`  ${colors.cyan}bash ${visualizerScriptPath}${colors.reset}`);
          }
          callback(false);
        }
      });
    } catch (error) {
      console.log(`${colors.yellow}!${colors.reset} Could not set up visualizer: ${error.message}`);
      callback(false);
    }
  }

  // Helper: run gateway install script and call back when done
  function runGatewaySetup(callback) {
    console.log(`\n${colors.cyan}Setting up messaging gateway...${colors.reset}`);

    const gatewayScriptPath = isWindows
      ? join(__dirname, '..', 'gateway', 'scripts', 'install.ps1')
      : join(__dirname, '..', 'gateway', 'scripts', 'install.sh');

    if (!existsSync(gatewayScriptPath)) {
      console.log(`${colors.yellow}!${colors.reset} Gateway files not found. Skipping.`);
      callback(false);
      return;
    }

    try {
      const spawnCmd = isWindows ? powershellPath : 'bash';
      const spawnArgs = isWindows
        ? ['-ExecutionPolicy', 'Bypass', '-File', gatewayScriptPath]
        : [gatewayScriptPath];
      const gwResult = spawn(spawnCmd, spawnArgs, {
        stdio: 'inherit',
        env: {
          ...process.env,
          CLAUDIA_GATEWAY_UPGRADE: isUpgrade ? '1' : '0'
        }
      });

      gwResult.on('close', (code) => {
        if (code === 0) {
          console.log(`${colors.green}✓${colors.reset} Gateway installed`);
          callback(true);
        } else {
          console.log(`${colors.yellow}!${colors.reset} Gateway setup had issues. You can run it later with:`);
          if (isWindows) {
            console.log(`  ${colors.cyan}powershell.exe -ExecutionPolicy Bypass -File "${gatewayScriptPath}"${colors.reset}`);
          } else {
            console.log(`  ${colors.cyan}bash ${gatewayScriptPath}${colors.reset}`);
          }
          callback(false);
        }
      });
    } catch (error) {
      console.log(`${colors.yellow}!${colors.reset} Could not set up gateway: ${error.message}`);
      callback(false);
    }
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
  function finishInstall(memoryInstalled, visualizerInstalled, gatewayInstalled) {
    if (memoryInstalled) {
      // Run health check when memory system was installed
      runSystemHealthCheck((healthy) => {
        showNextSteps(memoryInstalled, visualizerInstalled, gatewayInstalled, healthy);
      });
    } else {
      showNextSteps(memoryInstalled, visualizerInstalled, gatewayInstalled, true);
    }
  }

  // Helper: run gateway setup (auto-install like visualizer), then finish
  function maybeRunGateway(memoryInstalled, visualizerInstalled) {
    runGatewaySetup((gatewayOk) => finishInstall(memoryInstalled, visualizerInstalled, gatewayOk));
  }

  // Helper: auto-install visualizer after memory (if memory was installed), then chain to gateway
  function maybeRunVisualizer(memoryInstalled) {
    if (memoryInstalled) {
      // Visualizer auto-installs when memory is installed (needs the database)
      runVisualizerSetup((vizOk) => maybeRunGateway(memoryInstalled, vizOk));
    } else {
      // Skip visualizer if no memory system
      maybeRunGateway(memoryInstalled, false);
    }
  }

  if (setupMemory) {
    console.log(`\n${colors.cyan}Setting up enhanced memory system...${colors.reset}`);

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
            CLAUDIA_PROJECT_PATH: isUpgrade ? targetPath : ''
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
                args: ['-m', 'claudia_memory.mcp.server'],
                _description: 'Claudia memory system with vector search'
              };
              writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
              console.log(`${colors.green}✓${colors.reset} Created .mcp.json with memory server`);
            }

            // Seed demo database if --demo flag was passed
            if (isDemoMode) {
              const mcpPathForDemo = join(targetPath, '.mcp.json');
              seedDemoDatabase(targetPath, mcpPathForDemo, () => maybeRunVisualizer(memoryOk));
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

          // Chain visualizer setup (auto), then gateway (if requested)
          maybeRunVisualizer(memoryOk);
        });

        return; // Wait for spawn to complete
      } catch (error) {
        console.log(`${colors.yellow}!${colors.reset} Could not set up memory system: ${error.message}`);
        console.log(`  You can set it up later manually.`);
      }
    } else {
      console.log(`${colors.yellow}!${colors.reset} Memory daemon files not found. Skipping.`);
    }
  }

  // Memory skipped or failed to spawn -- continue with visualizer/gateway
  maybeRunVisualizer(false);

  function showNextSteps(memoryInstalled, visualizerInstalled, gatewayInstalled, systemHealthy = true) {
    // Show next steps - different message based on what was installed
    const cdStep = isCurrentDir ? '' : `  ${colors.cyan}cd ${targetDir}${colors.reset}\n`;

    if (memoryInstalled) {
      if (systemHealthy) {
        console.log(`
${colors.bold}Next:${colors.reset}
${cdStep}  ${colors.cyan}claude${colors.reset}
  ${colors.dim}Memory system ready!${colors.reset}

${colors.dim}If Claude was already running elsewhere, restart it to activate memory tools.${colors.reset}
`);
      } else {
        console.log(`
${colors.yellow}Some issues were detected above.${colors.reset}
${colors.dim}You can fix them now, or Claudia will work in fallback mode until they're resolved.${colors.reset}
${colors.dim}Re-run diagnostics anytime: ${isWindows ? '%USERPROFILE%\\.claudia\\diagnose.ps1' : '~/.claudia/diagnose.sh'}${colors.reset}

${colors.bold}Next:${colors.reset}
${cdStep}  ${colors.cyan}claude${colors.reset}
  ${colors.dim}Claudia will help you troubleshoot with /diagnose${colors.reset}
`);
      }
    } else {
      console.log(`
${colors.bold}Next:${colors.reset}
${cdStep}  ${colors.cyan}claude${colors.reset}
  ${colors.dim}Say hi!${colors.reset}

${colors.dim}She'll introduce herself and set things up for you.${colors.reset}
`);
    }

    if (visualizerInstalled) {
      console.log(`${colors.bold}Brain Visualizer:${colors.reset}
  ${colors.dim}See your memory in 3D:${colors.reset}  ${colors.cyan}/brain${colors.reset}
`);
    }

    if (gatewayInstalled) {
      console.log(`${colors.bold}Gateway:${colors.reset}
  ${colors.dim}If claudia-gateway isn't found, open a new terminal or run:${colors.reset}
  ${colors.cyan}~/.claudia/bin/claudia-gateway start${colors.reset}
  ${colors.dim}See ~/.claudia/gateway.json for settings.${colors.reset}
`);
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

  ${bc}Document Storage${r}   ${d}Files, transcripts, and emails are stored${r}
                      ${d}and linked to people and memories.${r}

  ${bc}Provenance${r}         ${d}Every fact traces back to its source.${r}
                      ${d}Ask "how do you know that?" and Claudia shows her work.${r}

  ${bc}Graph Traversal${r}    ${d}Ask about a person, see their connected${r}
                      ${d}network of people and projects.${r}

  ${bc}Smart Briefing${r}     ${d}Session startup is now ~500 tokens, not${r}
                      ${d}thousands. Full context pulled on demand.${r}

  ${bc}/memory-audit${r}      ${d}New command. See everything Claudia knows${r}
                      ${d}about a person, with source chains.${r}

${line}
`);
}

main();
