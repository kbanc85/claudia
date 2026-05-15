/**
 * .mcp.json manipulation: restore disabled servers, scan databases,
 * ensure the claudia-memory daemon entry, add Google MCP entries, and
 * check the current server inventory.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, renameSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { homedir } from 'os';
import { colors } from './lib.js';

/**
 * Restore MCP servers that were moved to _disabled_mcpServers by earlier versions.
 * - claudia-memory: v1.51.13+ treated the daemon as legacy (replaced by CLI),
 *   but MCP is the primary memory interface as of v1.51.22.
 * - Gmail/Calendar: v1.53.1 disabled these due to Claude Code bug #17962,
 *   but multiple stdio servers now work reliably. Restore them.
 */
export function restoreMcpServers(targetPath) {
  const mcpPath = join(targetPath, '.mcp.json');
  if (!existsSync(mcpPath)) return;

  try {
    const raw = readFileSync(mcpPath, 'utf-8');
    const config = JSON.parse(raw);
    if (!config.mcpServers) config.mcpServers = {};

    let changed = false;
    const restored = [];

    // Path 1: Restore from _disabled_mcpServers stash (older migration format)
    if (config._disabled_mcpServers) {
      const toRestore = ['claudia-memory', 'claudia_memory'];
      for (const key of toRestore) {
        if (config._disabled_mcpServers[key] && !config.mcpServers[key]) {
          const serverConfig = { ...config._disabled_mcpServers[key] };
          delete serverConfig._replaced_by;
          delete serverConfig._warning;
          config.mcpServers[key] = serverConfig;
          delete config._disabled_mcpServers[key];
          changed = true;
          restored.push(key);
        }
      }

      // Clean up _disabled_mcpServers if it's now empty
      if (Object.keys(config._disabled_mcpServers).length === 0) {
        delete config._disabled_mcpServers;
      }
    }

    // Path 2: Rename _disabled_ prefixed keys in mcpServers itself
    // This handles the case where keys like "_disabled_gmail" exist directly in mcpServers
    for (const key of Object.keys(config.mcpServers)) {
      if (key.startsWith('_disabled_')) {
        const realKey = key.replace('_disabled_', '');
        if (!config.mcpServers[realKey]) {
          const serverConfig = { ...config.mcpServers[key] };
          delete serverConfig._warning;
          config.mcpServers[realKey] = serverConfig;
          delete config.mcpServers[key];
          changed = true;
          restored.push(realKey);
        }
      }
    }

    if (changed) {
      writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
      console.log(` ${colors.cyan}✓${colors.reset} Restored MCP servers: ${restored.join(', ')}`);
    }
  } catch {
    // Not valid JSON or can't read -- skip silently
  }
}

/**
 * Scan ~/.claudia/memory/ for existing databases and return rough stats.
 * Uses sqlite3 CLI (via execFileSync) to query each .db file safely.
 * Returns { unified: { exists, memories, entities }, hashDbs: [...], totalMemories }
 */
export function scanExistingDatabases() {
  const memoryDir = join(homedir(), '.claudia', 'memory');
  const result = {
    unified: { exists: false, memories: 0, entities: 0 },
    hashDbs: [],
    totalMemories: 0,
  };

  if (!existsSync(memoryDir)) return result;

  let files;
  try {
    files = readdirSync(memoryDir);
  } catch {
    return result;
  }

  const hashPattern = /^[0-9a-f]{12}\.db$/;

  for (const file of files) {
    if (!file.endsWith('.db')) continue;
    // Skip WAL/SHM/backup files
    if (file.includes('-wal') || file.includes('-shm') || file.includes('.backup')) continue;
    const filePath = join(memoryDir, file);

    try {
      const stats = statSync(filePath);
      if (stats.size < 4096) continue; // Too small to have data
    } catch {
      continue;
    }

    // Query using sqlite3 CLI (no shell, safe from injection)
    let memories = 0;
    let entities = 0;
    try {
      const memResult = execFileSync('sqlite3', [filePath, 'SELECT COUNT(*) FROM memories;'], {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      memories = parseInt(memResult, 10) || 0;
    } catch { /* table may not exist */ }

    try {
      const entResult = execFileSync('sqlite3', [filePath, 'SELECT COUNT(*) FROM entities WHERE deleted_at IS NULL;'], {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      entities = parseInt(entResult, 10) || 0;
    } catch {
      try {
        const entResult = execFileSync('sqlite3', [filePath, 'SELECT COUNT(*) FROM entities;'], {
          encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        entities = parseInt(entResult, 10) || 0;
      } catch { /* skip */ }
    }

    if (file === 'claudia.db') {
      result.unified = { exists: true, memories, entities };
    } else if (hashPattern.test(file)) {
      result.hashDbs.push({ name: file, memories, entities });
    }

    result.totalMemories += memories;
  }

  return result;
}


/**
 * Ensure .mcp.json has a working claudia-memory daemon entry.
 * - Fresh install (no .mcp.json): creates one with just the daemon entry.
 * - Upgrade: updates the daemon command/args with the correct venv path.
 * Only writes if the venv Python binary exists (daemon was installed).
 */
export function ensureDaemonMcpConfig(targetPath, venvPythonPath) {
  if (!existsSync(venvPythonPath)) return;

  const mcpPath = join(targetPath, '.mcp.json');
  const mcpTmp = mcpPath + '.tmp';

  const daemonConfig = {
    command: venvPythonPath,
    args: ['-m', 'claudia_memory', '--project-dir', targetPath],
    _description: 'Claudia memory system with vector search'
  };

  let config;
  if (existsSync(mcpPath)) {
    try {
      config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    } catch {
      // Malformed JSON: back it up so the user can recover their edits,
      // then start fresh so the daemon gets configured rather than silently skipping.
      const backupPath = mcpPath + '.bak';
      try { renameSync(mcpPath, backupPath); } catch { /* ignore */ }
      console.warn(`\n  .mcp.json was malformed — backed up to .mcp.json.bak and recreated.`);
      config = null;
    }
  }

  if (!config) {
    // Fresh install or recovered from corrupt file
    config = {
      mcpServers: {},
      _notes: {
        quick_start: [
          '1. Restart Claude Code after changes',
          '2. See .mcp.json.example for additional servers (Gmail, Calendar, etc.)',
          '3. Each user authenticates with their own accounts'
        ]
      }
    };
  }

  // Merge: only touch the claudia-memory key, preserve all other servers and keys.
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers['claudia-memory'] = daemonConfig;

  // Atomic write: write to .tmp then rename so a crash mid-write never leaves
  // a half-written (and therefore unreadable) .mcp.json.
  writeFileSync(mcpTmp, JSON.stringify(config, null, 2) + '\n');
  renameSync(mcpTmp, mcpPath);
}

/**
 * Ensure gmail and google-calendar MCP entries exist in .mcp.json
 * if the user has credentials at ~/.gmail-mcp/ and ~/.calendar-mcp/.
 * Does not overwrite existing entries. Only adds if credentials are found.
 * Returns { addedGmail, addedCalendar } indicating what was added.
 */
export function ensureGoogleMcpEntries(targetPath) {
  const mcpPath = join(targetPath, '.mcp.json');
  const result = { addedGmail: false, addedCalendar: false };

  let config;
  if (existsSync(mcpPath)) {
    try {
      config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    } catch {
      return result; // Malformed JSON -- don't touch
    }
  } else {
    return result; // No .mcp.json yet (ensureDaemonMcpConfig creates it first)
  }

  if (!config.mcpServers) config.mcpServers = {};

  const home = homedir();
  let changed = false;

  // Gmail: add if credentials exist and entry doesn't
  const gmailOauthPath = join(home, '.gmail-mcp', 'gcp-oauth.keys.json');
  const gmailCredsPath = join(home, '.gmail-mcp', 'credentials.json');
  if (!config.mcpServers.gmail && existsSync(gmailOauthPath) && existsSync(gmailCredsPath)) {
    config.mcpServers.gmail = {
      command: 'npx',
      args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp@latest'],
      env: {
        GMAIL_OAUTH_PATH: gmailOauthPath,
        GMAIL_CREDENTIALS_PATH: gmailCredsPath,
      },
    };
    result.addedGmail = true;
    changed = true;
  }

  // Google Calendar: add if credentials exist and entry doesn't
  const calOauthPath = join(home, '.calendar-mcp', 'gcp-oauth.keys.json');
  const calCredsPath = join(home, '.calendar-mcp', 'credentials.json');
  if (!config.mcpServers['google-calendar'] && existsSync(calOauthPath) && existsSync(calCredsPath)) {
    config.mcpServers['google-calendar'] = {
      command: 'npx',
      args: ['-y', '@gongrzhe/server-calendar-autoauth-mcp@latest'],
      env: {
        CALENDAR_OAUTH_PATH: calOauthPath,
        CALENDAR_CREDENTIALS_PATH: calCredsPath,
      },
    };
    result.addedCalendar = true;
    changed = true;
  }

  if (changed) {
    writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
  }

  return result;
}

/**
 * Check .mcp.json configuration and return status.
 * Returns { hasDaemon, stdioCount, stdioServers }.
 */
export function checkMcpConfig(targetPath) {
  const mcpPath = join(targetPath, '.mcp.json');
  if (!existsSync(mcpPath)) return { hasDaemon: false, stdioCount: 0, stdioServers: [] };
  try {
    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    const servers = config.mcpServers || {};
    const hasDaemon = !!servers['claudia-memory'];
    const stdioServers = Object.entries(servers)
      .filter(([key]) => !key.startsWith('_'))
      .filter(([, val]) => !val._disabled && (!val.type || val.type === 'stdio'))
      .map(([key]) => key);
    return { hasDaemon, stdioCount: stdioServers.length, stdioServers };
  } catch {
    return { hasDaemon: false, stdioCount: 0, stdioServers: [] };
  }
}
