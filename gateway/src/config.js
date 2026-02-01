/**
 * Configuration management for Claudia Gateway
 *
 * Loads from ~/.claudia/gateway.json with sensible defaults.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createLogger } from './utils/logger.js';

const log = createLogger('config');

const CONFIG_DIR = join(homedir(), '.claudia');
const CONFIG_PATH = join(CONFIG_DIR, 'gateway.json');
const PID_PATH = join(CONFIG_DIR, 'gateway.pid');

const DEFAULT_CONFIG = {
  // Anthropic API
  anthropicApiKey: '',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 2048,

  // Ollama (local model, auto-detected from ~/.claudia/config.json)
  ollama: {
    host: 'http://localhost:11434',
    model: '', // Auto-detected from ~/.claudia/config.json language_model field
  },

  // System prompt context
  systemPromptPath: '', // Optional path to custom system prompt

  // Memory daemon connection
  memoryDaemon: {
    pythonPath: join(homedir(), '.claudia', 'daemon', 'venv', 'bin', 'python'),
    moduleName: 'claudia_memory.mcp.server',
    projectDir: '',
    healthPort: 3848,
  },

  // Global auth
  globalAllowedUsers: [],

  // Channels
  channels: {
    telegram: {
      enabled: false,
      token: '',
      allowedUsers: [],
    },
    slack: {
      enabled: false,
      botToken: '',
      appToken: '',
      signingSecret: '',
      allowedUsers: [],
    },
  },

  // Proactive notifications
  proactive: {
    enabled: false,
    pollIntervalMs: 300000, // 5 minutes
    defaultChannel: 'telegram',
    defaultUserId: '',
  },

  // Gateway service
  gateway: {
    port: 3849,
    logLevel: 'info',
  },
};

/**
 * Deep merge two objects (target wins on conflict)
 */
function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      defaults[key] &&
      typeof defaults[key] === 'object' &&
      !Array.isArray(defaults[key])
    ) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

/**
 * Load gateway configuration from disk, merged with defaults.
 */
export function loadConfig() {
  mkdirSync(CONFIG_DIR, { recursive: true });

  if (!existsSync(CONFIG_PATH)) {
    log.info('No gateway config found, using defaults');
    const defaults = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    if (!defaults.ollama.model) {
      defaults.ollama.model = readClaudiaConfig();
    }
    if (process.env.ANTHROPIC_API_KEY) {
      defaults.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.OLLAMA_HOST) {
      defaults.ollama.host = process.env.OLLAMA_HOST;
    }
    return defaults;
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const userConfig = JSON.parse(raw);
    const merged = deepMerge(DEFAULT_CONFIG, userConfig);

    // Allow env overrides for sensitive values
    if (process.env.ANTHROPIC_API_KEY) {
      merged.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.TELEGRAM_BOT_TOKEN) {
      merged.channels.telegram.token = process.env.TELEGRAM_BOT_TOKEN;
    }
    if (process.env.SLACK_BOT_TOKEN) {
      merged.channels.slack.botToken = process.env.SLACK_BOT_TOKEN;
    }
    if (process.env.SLACK_APP_TOKEN) {
      merged.channels.slack.appToken = process.env.SLACK_APP_TOKEN;
    }
    if (process.env.SLACK_SIGNING_SECRET) {
      merged.channels.slack.signingSecret = process.env.SLACK_SIGNING_SECRET;
    }
    if (process.env.OLLAMA_HOST) {
      merged.ollama.host = process.env.OLLAMA_HOST;
    }

    // Auto-detect Ollama model from Claudia's shared config if not explicitly set
    if (!merged.ollama.model) {
      merged.ollama.model = readClaudiaConfig();
    }

    log.info('Loaded gateway config', { path: CONFIG_PATH });
    return merged;
  } catch (err) {
    log.error('Failed to load config, using defaults', { error: err.message });
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save current config to disk.
 */
export function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });

  // Strip secrets before writing to disk (they come from env vars at load time)
  const safe = JSON.parse(JSON.stringify(config));
  delete safe.anthropicApiKey;
  if (safe.channels?.telegram) delete safe.channels.telegram.token;
  if (safe.channels?.slack) {
    delete safe.channels.slack.botToken;
    delete safe.channels.slack.appToken;
    delete safe.channels.slack.signingSecret;
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(safe, null, 2));
  log.info('Saved gateway config', { path: CONFIG_PATH });
}

/**
 * Read the shared Claudia config (~/.claudia/config.json) to get the
 * language_model value set during memory daemon installation.
 *
 * @returns {string} Model name (e.g. 'qwen3:4b') or empty string if not found
 */
export function readClaudiaConfig() {
  const configPath = join(homedir(), '.claudia', 'config.json');
  try {
    if (!existsSync(configPath)) return '';
    const data = JSON.parse(readFileSync(configPath, 'utf8'));
    return data.language_model || '';
  } catch {
    return '';
  }
}

/**
 * Generate an example config file.
 */
export function generateExampleConfig() {
  const example = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  example.anthropicApiKey = '(set ANTHROPIC_API_KEY env var, or leave empty for Ollama)';
  example.ollama.model = '(auto-detected from ~/.claudia/config.json)';
  example.channels.telegram.enabled = true;
  example.channels.telegram.token = '(set TELEGRAM_BOT_TOKEN env var)';
  example.channels.telegram.allowedUsers = ['YOUR_TELEGRAM_USER_ID'];
  example.globalAllowedUsers = [];
  return example;
}

/**
 * Write PID file for daemon management.
 */
export function writePidFile(pid) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PID_PATH, String(pid));
}

/**
 * Read PID file.
 */
export function readPidFile() {
  try {
    if (!existsSync(PID_PATH)) return null;
    const pid = parseInt(readFileSync(PID_PATH, 'utf8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Remove PID file.
 */
export function removePidFile() {
  try {
    unlinkSync(PID_PATH);
  } catch {
    // ignore
  }
}

export { CONFIG_PATH, PID_PATH, CONFIG_DIR, deepMerge };
