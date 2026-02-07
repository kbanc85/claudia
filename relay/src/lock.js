/**
 * Single-instance guard for Claudia Relay
 *
 * Uses PID file at ~/.claudia/relay.pid to prevent multiple instances.
 */

import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.claudia');
const PID_PATH = join(CONFIG_DIR, 'relay.pid');

/**
 * Check if a process with the given PID is alive.
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire the lock. Throws if another instance is running.
 */
export function acquire() {
  mkdirSync(CONFIG_DIR, { recursive: true });

  // Check for stale lock
  const existingPid = readPid();
  if (existingPid !== null) {
    if (isProcessAlive(existingPid)) {
      throw new Error(`Another relay instance is running (PID ${existingPid})`);
    }
    // Stale PID file, clean it up
    release();
  }

  writeFileSync(PID_PATH, String(process.pid));
}

/**
 * Release the lock by removing the PID file.
 */
export function release() {
  try {
    unlinkSync(PID_PATH);
  } catch {
    // ignore
  }
}

/**
 * Read the PID from the lock file. Returns null if no file or invalid.
 */
export function readPid() {
  try {
    const content = readFileSync(PID_PATH, 'utf8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Check if the relay is currently running.
 */
export function isRunning() {
  const pid = readPid();
  if (pid === null) return false;
  return isProcessAlive(pid);
}

export { PID_PATH };
