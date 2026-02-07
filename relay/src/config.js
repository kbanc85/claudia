/**
 * Configuration management for Claudia Relay
 *
 * Loads from ~/.claudia/relay.json with sensible defaults.
 * Follows gateway/src/config.js pattern: deepMerge + env overrides.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.claudia');
const CONFIG_PATH = join(CONFIG_DIR, 'relay.json');

const DEFAULT_CONFIG = {
  // Path to the Claudia install directory (where CLAUDE.md lives)
  // claude -p runs with this as cwd, activating personality + MCP
  claudiaDir: '',

  // Telegram settings
  telegram: {
    enabled: true,
    allowedUsers: [], // Telegram user IDs (strings)
  },

  // Claude CLI settings
  claude: {
    timeoutMs: 180000, // 3 minutes
    permissionMode: 'plan',
  },

  // Session management
  session: {
    ttlMinutes: 30,
  },
};

/**
 * Deep merge two objects (overrides win on conflict).
 */
export function deepMerge(defaults, overrides) {
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
 * Load relay configuration from disk, merged with defaults.
 */
export function loadConfig() {
  mkdirSync(CONFIG_DIR, { recursive: true });

  let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf8');
      const userConfig = JSON.parse(raw);
      config = deepMerge(DEFAULT_CONFIG, userConfig);
    } catch (err) {
      console.error(`[relay:config] Failed to load config: ${err.message}, using defaults`);
    }
  }

  // Env overrides (take precedence over file)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    config.telegram.token = process.env.TELEGRAM_BOT_TOKEN;
  }
  if (process.env.CLAUDIA_DIR) {
    config.claudiaDir = process.env.CLAUDIA_DIR;
  }

  // Warn if token is in config file
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
      if (raw.telegram?.token) {
        console.warn('[relay:config] Telegram token found in relay.json. Consider using TELEGRAM_BOT_TOKEN env var instead.');
      }
    } catch {
      // ignore
    }
  }

  return config;
}

/**
 * Save current config to disk (strips secrets).
 */
export function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });

  const safe = JSON.parse(JSON.stringify(config));
  delete safe.telegram?.token;

  writeFileSync(CONFIG_PATH, JSON.stringify(safe, null, 2));
}

export { CONFIG_PATH, CONFIG_DIR };
