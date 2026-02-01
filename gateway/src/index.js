#!/usr/bin/env node

/**
 * Claudia Gateway CLI
 *
 * Usage:
 *   claudia-gateway start [--channels telegram,slack] [--debug]
 *   claudia-gateway stop
 *   claudia-gateway status
 *   claudia-gateway logs [--lines N]
 *   claudia-gateway init
 */

import { Gateway } from './gateway.js';
import {
  loadConfig,
  generateExampleConfig,
  saveConfig,
  writePidFile,
  readPidFile,
  removePidFile,
  CONFIG_PATH,
  CONFIG_DIR,
} from './config.js';
import { setLevel, createLogger, closeLogger } from './utils/logger.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const log = createLogger('cli');

const HELP = `
Claudia Gateway - Multi-channel messaging for Claudia

Usage:
  claudia-gateway start [options]    Start the gateway service
  claudia-gateway stop               Stop the running gateway
  claudia-gateway status             Show gateway status
  claudia-gateway logs [--lines N]   Show recent gateway logs
  claudia-gateway init               Generate example config file

Options:
  --channels <list>   Comma-separated channels to enable (telegram,slack)
  --debug             Enable debug logging
  --help              Show this help message

Configuration:
  Edit ${CONFIG_PATH}
  Tokens can also be set via environment variables:
    ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, SLACK_BOT_TOKEN, SLACK_APP_TOKEN
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  switch (command) {
    case 'start':
      await cmdStart(args.slice(1));
      break;
    case 'stop':
      await cmdStop();
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'logs':
      await cmdLogs(args.slice(1));
      break;
    case 'init':
      await cmdInit();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

async function cmdStart(args) {
  const debug = args.includes('--debug');
  const channelIdx = args.indexOf('--channels');
  const channelList = channelIdx >= 0 ? args[channelIdx + 1]?.split(',') : null;

  if (debug) setLevel('debug');

  // Check for existing process
  const existingPid = readPidFile();
  if (existingPid) {
    try {
      process.kill(existingPid, 0); // Check if process exists
      console.error(`Gateway already running (PID ${existingPid}). Use 'claudia-gateway stop' first.`);
      process.exit(1);
    } catch {
      // Process not running, clean up stale PID
      removePidFile();
    }
  }

  // Build config overrides from CLI args
  const overrides = {};
  if (channelList) {
    overrides.channels = {};
    for (const ch of channelList) {
      const trimmed = ch.trim();
      overrides.channels[trimmed] = { enabled: true };
    }
  }

  // Pre-flight: check for missing tokens before starting
  const preflight = loadConfig();
  const telegramEnabled = preflight.channels?.telegram?.enabled || overrides.channels?.telegram?.enabled;
  const slackEnabled = preflight.channels?.slack?.enabled || overrides.channels?.slack?.enabled;
  if (telegramEnabled && !process.env.TELEGRAM_BOT_TOKEN && !preflight.channels?.telegram?.token) {
    console.error('Telegram is enabled but TELEGRAM_BOT_TOKEN is not set in this terminal.');
    console.error('');
    console.error('Your token was likely saved to your shell profile during install.');
    console.error('Fix: Open a NEW terminal window and run claudia-gateway start');
    console.error('  Or: source ~/.zshrc   (or ~/.bashrc)');
    console.error('  Or: export TELEGRAM_BOT_TOKEN="your-token-here"');
    process.exit(1);
  }
  if (slackEnabled && !process.env.SLACK_BOT_TOKEN && !preflight.channels?.slack?.token) {
    console.error('Slack is enabled but SLACK_BOT_TOKEN is not set in this terminal.');
    console.error('');
    console.error('Fix: Open a NEW terminal window and run claudia-gateway start');
    console.error('  Or: export SLACK_BOT_TOKEN="your-token-here"');
    console.error('  Or: export SLACK_APP_TOKEN="your-token-here"');
    process.exit(1);
  }

  const gateway = new Gateway(overrides);

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    try {
      await gateway.stop();
    } finally {
      removePidFile();
      closeLogger();
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await gateway.start();
    writePidFile(process.pid);

    console.log('Claudia Gateway is running.');
    console.log(`  Channels: ${[...gateway.adapters.keys()].join(', ') || 'none'}`);
    console.log(`  Memory: ${gateway.bridge?.memoryAvailable ? 'connected' : 'unavailable'}`);
    console.log(`  PID: ${process.pid}`);
    console.log('');
    console.log('This terminal is now dedicated to the gateway. Use Claude in a separate terminal.');
    console.log('Press Ctrl+C to stop.\n');

    // Keep process alive
    await new Promise(() => {});
  } catch (err) {
    console.error(`Failed to start gateway: ${err.message}`);
    removePidFile();
    process.exit(1);
  }
}

async function cmdStop() {
  const pid = readPidFile();
  if (!pid) {
    console.log('No gateway process found.');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Sent stop signal to gateway (PID ${pid}).`);
    removePidFile();
  } catch (err) {
    if (err.code === 'ESRCH') {
      console.log('Gateway process not found (stale PID file). Cleaning up.');
      removePidFile();
    } else {
      console.error(`Failed to stop gateway: ${err.message}`);
    }
  }
}

async function cmdStatus() {
  const pid = readPidFile();
  const logPath = join(homedir(), '.claudia', 'gateway.log');

  console.log('Claudia Gateway Status');
  console.log('----------------------');

  if (pid) {
    try {
      process.kill(pid, 0);
      console.log(`  Status: Running (PID ${pid})`);
    } catch {
      console.log('  Status: Stopped (stale PID file)');
    }
  } else {
    console.log('  Status: Stopped');
  }

  console.log(`  Config: ${CONFIG_PATH}`);
  console.log(`  Logs:   ${logPath}`);

  // Show configured channels
  if (existsSync(CONFIG_PATH)) {
    try {
      const config = loadConfig();
      const channels = Object.entries(config.channels || {})
        .filter(([, v]) => v.enabled)
        .map(([k]) => k);
      console.log(`  Channels: ${channels.length > 0 ? channels.join(', ') : 'none enabled'}`);
    } catch {
      // ignore
    }
  }

  // Check memory daemon health
  try {
    const config = loadConfig();
    const port = config.memoryDaemon?.healthPort || 3848;
    const resp = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      console.log('  Memory Daemon: healthy');
    } else {
      console.log('  Memory Daemon: unhealthy');
    }
  } catch {
    console.log('  Memory Daemon: not running');
  }
}

async function cmdLogs(args) {
  const linesIdx = args.indexOf('--lines');
  const lines = linesIdx >= 0 ? parseInt(args[linesIdx + 1], 10) || 50 : 50;
  const logPath = join(homedir(), '.claudia', 'gateway.log');

  if (!existsSync(logPath)) {
    console.log('No gateway logs found.');
    return;
  }

  try {
    const content = readFileSync(logPath, 'utf8');
    const allLines = content.trim().split('\n');
    const tail = allLines.slice(-lines);
    console.log(tail.join('\n'));
  } catch (err) {
    console.error(`Failed to read logs: ${err.message}`);
  }
}

async function cmdInit() {
  if (existsSync(CONFIG_PATH)) {
    console.log(`Config already exists at ${CONFIG_PATH}`);
    console.log('Edit it manually to update settings.');
    return;
  }

  const example = generateExampleConfig();
  saveConfig(example);
  console.log(`Example config created at ${CONFIG_PATH}`);
  console.log('\nNext steps:');
  console.log('  1. Set your Anthropic API key');
  console.log('  2. Configure at least one channel (Telegram or Slack)');
  console.log('  3. Add your user ID(s) to the allowlist');
  console.log('  4. Run: claudia-gateway start');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
