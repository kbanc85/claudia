/**
 * Structured logger for Claudia Gateway
 *
 * Writes JSON-structured logs to ~/.claudia/gateway.log and stderr.
 */

import { createWriteStream, mkdirSync, statSync, renameSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = LOG_LEVELS.info;
let fileStream = null;

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

function ensureLogFile() {
  if (fileStream) return;
  const logDir = join(homedir(), '.claudia');
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, 'gateway.log');

  // Rotate if log exceeds 5 MB (one backup, checked once on startup)
  try {
    if (existsSync(logPath) && statSync(logPath).size > MAX_LOG_SIZE) {
      renameSync(logPath, logPath + '.1');
    }
  } catch {
    // Best-effort rotation; continue even if it fails
  }

  fileStream = createWriteStream(logPath, { flags: 'a' });
}

function formatEntry(level, component, message, data) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
  });
}

function emit(level, component, message, data) {
  if (LOG_LEVELS[level] < currentLevel) return;

  const entry = formatEntry(level, component, message, data);

  // Write to file
  ensureLogFile();
  fileStream.write(entry + '\n');

  // Write to stderr (so stdout stays clean for daemon comms)
  const prefix = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[2m';
  process.stderr.write(`${prefix}[${level.toUpperCase()}] [${component}] ${message}\x1b[0m\n`);
}

export function setLevel(level) {
  if (level in LOG_LEVELS) {
    currentLevel = LOG_LEVELS[level];
  }
}

export function createLogger(component) {
  return {
    debug: (msg, data) => emit('debug', component, msg, data),
    info: (msg, data) => emit('info', component, msg, data),
    warn: (msg, data) => emit('warn', component, msg, data),
    error: (msg, data) => emit('error', component, msg, data),
  };
}

export function closeLogger() {
  if (fileStream) {
    fileStream.end();
    fileStream = null;
  }
}
