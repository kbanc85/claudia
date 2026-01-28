#!/usr/bin/env node

import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  // Determine target directory
  const args = process.argv.slice(2);
  const arg = args[0];

  // Support "." for current directory
  const isCurrentDir = arg === '.';
  const targetDir = isCurrentDir ? '.' : (arg || 'claudia');
  const targetPath = isCurrentDir ? process.cwd() : join(process.cwd(), targetDir);
  const displayDir = isCurrentDir ? 'current directory' : targetDir;

  // Check if directory already exists and has conflicting files
  if (existsSync(targetPath)) {
    const contents = readdirSync(targetPath);
    const hasConflict = contents.some(f => f === 'CLAUDE.md' || f === '.claude');
    if (hasConflict) {
      console.log(`\n${colors.yellow}⚠${colors.reset}  Claudia files already exist in ${displayDir}.`);
      console.log(`   Remove CLAUDE.md and .claude/ first, or choose a different location.\n`);
      process.exit(1);
    }
  }

  // Create target directory if not current dir
  if (!isCurrentDir) {
    mkdirSync(targetPath, { recursive: true });
  }

  // Copy template files (v2 - minimal seed)
  const templatePath = join(__dirname, '..', 'template-v2');

  try {
    cpSync(templatePath, targetPath, { recursive: true });
    console.log(`${colors.green}✓${colors.reset} Installed in ${displayDir}`);
  } catch (error) {
    console.error(`\n${colors.yellow}⚠${colors.reset}  Error copying files: ${error.message}`);
    process.exit(1);
  }

  // Ask about enhanced memory system
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askMemory = () => {
    return new Promise((resolve) => {
      rl.question(`\n${colors.yellow}?${colors.reset} Set up enhanced memory system? (recommended) [y/n]: `, (answer) => {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  };

  const setupMemory = await askMemory();
  rl.close();

  if (setupMemory) {
    console.log(`\n${colors.cyan}Setting up enhanced memory system...${colors.reset}`);

    const memoryDaemonPath = join(__dirname, '..', 'memory-daemon', 'scripts', 'install.sh');

    if (existsSync(memoryDaemonPath)) {
      try {
        // Run the install script
        const result = spawn('bash', [memoryDaemonPath], {
          stdio: 'inherit',
          shell: true
        });

        result.on('close', (code) => {
          if (code === 0) {
            console.log(`${colors.green}✓${colors.reset} Memory system installed`);

            // Update .mcp.json if it exists
            const mcpPath = join(targetPath, '.mcp.json');
            const mcpExamplePath = join(targetPath, '.mcp.json.example');

            if (existsSync(mcpExamplePath) && !existsSync(mcpPath)) {
              // Read example and add memory server
              let mcpConfig = JSON.parse(readFileSync(mcpExamplePath, 'utf8'));
              mcpConfig.mcpServers = mcpConfig.mcpServers || {};
              mcpConfig.mcpServers['claudia-memory'] = {
                command: `${process.env.HOME}/.claudia/daemon/venv/bin/python`,
                args: ['-m', 'claudia_memory.mcp.server'],
                _description: 'Claudia memory system with vector search'
              };
              writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
              console.log(`${colors.green}✓${colors.reset} Created .mcp.json with memory server`);
            }
            showNextSteps(true); // Memory installed - emphasize restart
          } else {
            console.log(`${colors.yellow}!${colors.reset} Memory setup had issues. You can run it later with:`);
            console.log(`  ${colors.cyan}bash ${memoryDaemonPath}${colors.reset}`);
            showNextSteps(false);
          }
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

  showNextSteps(false);

  function showNextSteps(memoryInstalled) {
    // Show next steps - different message if memory was installed
    const cdStep = isCurrentDir ? '' : `  ${colors.cyan}cd ${targetDir}${colors.reset}\n`;

    if (memoryInstalled) {
      // Memory was installed - emphasize restart requirement
      console.log(`
${colors.bold}${colors.yellow}IMPORTANT: Open a NEW terminal before running claude${colors.reset}

${cdStep}  ${colors.cyan}claude${colors.reset}
  ${colors.dim}Memory tools need a fresh terminal to activate.${colors.reset}

${colors.dim}Troubleshooting: ~/.claudia/diagnose.sh${colors.reset}
`);
    } else {
      // No memory - standard message
      console.log(`
${colors.bold}Next:${colors.reset}
${cdStep}  ${colors.cyan}claude${colors.reset}
  ${colors.dim}Say hi!${colors.reset}

${colors.dim}She'll introduce herself and set things up for you.${colors.reset}
`);
    }
  }
}

main();
