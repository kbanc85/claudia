#!/usr/bin/env node

/**
 * Claudia CLI - Diagnostics and setup.
 *
 * Only two commands remain here:
 *   claudia system-health   (database + embedding diagnostics)
 *   claudia setup            (onboarding wizard)
 *
 * All memory operations are handled by the claudia-memory MCP daemon.
 * See _archived/cli-v1/ for the previous CLI command implementations.
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('claudia')
  .description('Claudia CLI - Diagnostics and setup')
  .version(pkg.version)
  .option('--project-dir <dir>', 'Workspace directory (auto-detected if omitted)');

program
  .command('system-health')
  .description('Check system health and diagnostics')
  .action(async () => {
    const { systemHealthCommand } = await import('./commands/system.js');
    await systemHealthCommand(program.opts());
  });

program
  .command('setup')
  .description('Onboarding wizard — create dirs, verify Ollama, run health check')
  .option('--skip-ollama', 'Skip Ollama model checks')
  .action(async (opts) => {
    const { setupCommand } = await import('./commands/setup.js');
    await setupCommand(opts, program.opts());
  });

// Parse and execute
program.parseAsync(process.argv);
