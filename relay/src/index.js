#!/usr/bin/env node

/**
 * Claudia Relay CLI
 *
 * Commands:
 *   start   - Start the relay (foreground)
 *   stop    - Stop a running relay instance
 *   status  - Check if the relay is running
 */

import { Relay } from './relay.js';
import * as lock from './lock.js';

const command = process.argv[2];

async function main() {
  switch (command) {
    case 'start':
      await startRelay();
      break;

    case 'stop':
      stopRelay();
      break;

    case 'status':
      showStatus();
      break;

    default:
      console.log('Claudia Relay - Telegram relay for Claude Code\n');
      console.log('Usage: claudia-relay <command>\n');
      console.log('Commands:');
      console.log('  start   Start the relay (foreground)');
      console.log('  stop    Stop a running relay instance');
      console.log('  status  Check if the relay is running');
      console.log('\nEnvironment:');
      console.log('  TELEGRAM_BOT_TOKEN  Telegram bot token (required)');
      console.log('  CLAUDIA_DIR         Path to Claudia install directory');
      process.exit(1);
  }
}

async function startRelay() {
  const relay = new Relay();

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n[relay] Received ${signal}, shutting down...`);
    await relay.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await relay.start();
  } catch (err) {
    console.error(`[relay] Failed to start: ${err.message}`);
    process.exit(1);
  }
}

function stopRelay() {
  const pid = lock.readPid();
  if (pid === null) {
    console.log('[relay] No running relay found');
    process.exit(0);
  }

  if (!lock.isRunning()) {
    console.log(`[relay] Stale PID file (PID ${pid} is not running), cleaning up`);
    lock.release();
    process.exit(0);
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[relay] Sent SIGTERM to PID ${pid}`);
  } catch (err) {
    console.error(`[relay] Failed to stop PID ${pid}: ${err.message}`);
    process.exit(1);
  }
}

function showStatus() {
  const pid = lock.readPid();
  if (pid === null) {
    console.log('[relay] Not running');
    process.exit(1);
  }

  if (lock.isRunning()) {
    console.log(`[relay] Running (PID ${pid})`);
  } else {
    console.log(`[relay] Not running (stale PID file for ${pid})`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[relay] Fatal error: ${err.message}`);
  process.exit(1);
});
