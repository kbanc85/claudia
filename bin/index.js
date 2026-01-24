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
`;

function main() {
  console.log(banner);

  // Determine target directory
  const args = process.argv.slice(2);
  const targetDir = args[0] || 'claudia';
  const targetPath = join(process.cwd(), targetDir);

  // Check if directory already exists
  if (existsSync(targetPath)) {
    const contents = readdirSync(targetPath);
    if (contents.length > 0) {
      console.log(`\n${colors.yellow}⚠${colors.reset}  Directory '${targetDir}' already exists and is not empty.`);
      console.log(`   Please choose a different name or remove the existing directory.\n`);
      process.exit(1);
    }
  }

  // Create target directory
  mkdirSync(targetPath, { recursive: true });
  console.log(`${colors.green}✓${colors.reset} Created ${targetDir}/ directory`);

  // Copy template files (v2 - minimal seed)
  const templatePath = join(__dirname, '..', 'template-v2');

  try {
    cpSync(templatePath, targetPath, { recursive: true });
    console.log(`${colors.green}✓${colors.reset} Copied Claudia 2.0 seed files`);
  } catch (error) {
    console.error(`\n${colors.yellow}⚠${colors.reset}  Error copying files: ${error.message}`);
    process.exit(1);
  }

  // Show next steps
  console.log(`
${colors.bold}What's different in Claudia 2.0:${colors.reset}
${colors.dim}• Ultra-minimal install — just the essentials
• Conversational onboarding — Claudia learns about you first
• Personalized structure — folders and commands tailored to your work
• Cross-session memory — she remembers and learns over time${colors.reset}

${colors.bold}Next steps:${colors.reset}
  ${colors.cyan}cd ${targetDir}${colors.reset}
  ${colors.cyan}claudia${colors.reset}

${colors.dim}When you start, Claudia will introduce herself and ask a few questions
to understand how you work. Then she'll create a personalized setup just for you.${colors.reset}

${colors.green}Claudia is ready to meet you!${colors.reset}
`);
}

main();
