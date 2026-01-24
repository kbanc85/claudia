#!/usr/bin/env node

import { existsSync, mkdirSync, cpSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const bannerArt = `
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ██╗ █████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██║██╔══██╗
██║     ██║     ███████║██║   ██║██║  ██║██║███████║
██║     ██║     ██╔══██║██║   ██║██║  ██║██║██╔══██║
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝██║██║  ██║
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝╚═╝  ╚═╝
`;

const banner = `
${colors.yellow}${bannerArt}${colors.reset}
${colors.dim}Agentic executive assistant — learns and adapts to how you work.${colors.reset}
${colors.dim}by Kamil Banc${colors.reset}
`;

function main() {
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

  // Show next steps
  const cdStep = isCurrentDir ? '' : `  ${colors.cyan}cd ${targetDir}${colors.reset}\n`;
  console.log(`
${colors.bold}Next:${colors.reset}
${cdStep}  ${colors.cyan}claude${colors.reset}
  ${colors.dim}Say hi!${colors.reset}

${colors.dim}She'll introduce herself and set things up for you.${colors.reset}
`);
}

main();
