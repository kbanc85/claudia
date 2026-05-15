/**
 * Ollama install / start / restart helpers used during the Environment +
 * Models setup steps. All probes time out aggressively so a stuck Ollama
 * never blocks the installer.
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { isWindows } from './lib.js';

/** Check if Ollama CLI is installed (on PATH or in common locations). */
export async function isOllamaInstalled() {
  // Check PATH
  const which = isWindows ? 'where' : 'which';
  const found = await new Promise((resolve) => {
    const proc = spawn(which, ['ollama'], { stdio: 'pipe', timeout: 5000 });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
  if (found) return true;

  // Check common install locations
  if (process.platform === 'darwin') {
    return existsSync('/usr/local/bin/ollama') || existsSync('/opt/homebrew/bin/ollama');
  } else if (!isWindows) {
    return existsSync('/usr/local/bin/ollama') || existsSync('/usr/bin/ollama');
  }
  return existsSync(join(process.env.LOCALAPPDATA || '', 'Ollama', 'ollama.exe'));
}

/**
 * Install Ollama automatically.
 * macOS: uses brew if available, otherwise curl installer
 * Linux: uses official curl installer
 * Windows: skip (requires manual download from ollama.com)
 */
export async function installOllama() {
  if (isWindows) return false; // Windows needs manual install from ollama.com

  if (process.platform === 'darwin') {
    // Try Homebrew first
    const hasBrew = await new Promise((resolve) => {
      const proc = spawn('which', ['brew'], { stdio: 'pipe', timeout: 5000 });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });

    if (hasBrew) {
      return new Promise((resolve) => {
        const proc = spawn('brew', ['install', 'ollama'], { stdio: 'pipe', timeout: 120000 });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    }
  }

  // Linux and macOS fallback: official install script
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], {
      stdio: 'pipe',
      timeout: 120000
    });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Start the Ollama service and wait for it to respond.
 * On macOS: open the Ollama app or run `ollama serve` in background.
 * On Linux: run `ollama serve` in background.
 * Returns true if Ollama API responds within ~15 seconds.
 */
export async function startOllama() {
  try {
    if (process.platform === 'darwin') {
      // Try macOS app first (installed by brew cask or .dmg), fall back to serve
      const appExists = existsSync('/Applications/Ollama.app');
      if (appExists) {
        spawn('open', ['-a', 'Ollama'], { stdio: 'pipe', detached: true }).unref();
      } else {
        spawn('ollama', ['serve'], { stdio: 'pipe', detached: true }).unref();
      }
    } else if (!isWindows) {
      spawn('ollama', ['serve'], { stdio: 'pipe', detached: true }).unref();
    } else {
      return false;
    }
  } catch {
    return false;
  }

  // Poll until API responds (up to 15 seconds)
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const resp = await fetch('http://127.0.0.1:11434/api/version');
      if (resp.ok) return true;
    } catch { /* not ready yet */ }
  }
  return false;
}

/**
 * Ensure Ollama's Ed25519 identity key exists at ~/.ollama/id_ed25519.
 * A fresh Ollama install sometimes creates ~/.ollama/ without the key file,
 * causing registry pull requests to fail silently. We generate one with
 * ssh-keygen (available on macOS, Linux, and Windows with Git).
 */
export async function ensureOllamaKey() {
  const ollamaDir = join(homedir(), '.ollama');
  const keyPath = join(ollamaDir, 'id_ed25519');
  if (existsSync(keyPath)) return;

  mkdirSync(ollamaDir, { recursive: true });
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('ssh-keygen', ['-t', 'ed25519', '-f', keyPath, '-N', '', '-q'], {
        stdio: 'pipe',
        timeout: 10000
      });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ssh-keygen exited ${code}`)));
      proc.on('error', reject);
    });
  } catch {
    // ssh-keygen unavailable or failed; Ollama will need a restart to self-generate.
  }
}

/**
 * Restart Ollama so it regenerates missing config (identity keys, etc.).
 * Kills the running process, waits, then delegates to startOllama().
 */
export async function restartOllama() {
  try {
    const killCmd = isWindows ? 'taskkill' : 'pkill';
    const killArgs = isWindows ? ['/f', '/im', 'ollama.exe'] : ['-f', 'ollama'];
    await new Promise((resolve) => {
      const proc = spawn(killCmd, killArgs, { stdio: 'pipe', timeout: 5000 });
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
    await new Promise(r => setTimeout(r, 2000));
  } catch { /* ignore */ }
  return startOllama();
}
