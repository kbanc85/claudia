/**
 * Python detection + system-level Python install helpers.
 * Venv creation lives in installer.js since it needs renderer/state context.
 */

import { spawn } from 'child_process';
import { isWindows } from './lib.js';

/** Check if Python 3.10+ is available. Returns the command name or null. */
export async function isPythonInstalled() {
  // Prefer Python < 3.14 (spaCy/pydantic-core don't support 3.14 yet)
  // Try versioned binaries first (3.13, 3.12, 3.11), then unversioned python3
  const candidates = [
    'python3.13', 'python3.12', 'python3.11',  // Versioned: guaranteed < 3.14
    'python3', 'python',                         // Unversioned: check version
  ];
  // On macOS, also check Homebrew paths explicitly
  if (process.platform === 'darwin') {
    candidates.unshift(
      '/opt/homebrew/bin/python3.13', '/opt/homebrew/bin/python3.12', '/opt/homebrew/bin/python3.11',
      '/usr/local/bin/python3.13', '/usr/local/bin/python3.12', '/usr/local/bin/python3.11',
    );
  }
  let fallback314 = null;
  for (const cmd of candidates) {
    const ver = await new Promise((resolve) => {
      const proc = spawn(cmd, ['--version'], { stdio: 'pipe', timeout: 5000 });
      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.on('close', () => resolve(stdout.trim()));
      proc.on('error', () => resolve(''));
    });
    const match = ver.match(/Python (\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1]);
      const minor = parseInt(match[2]);
      if (major === 3 && minor >= 10 && minor < 14) return cmd;
      // Remember 3.14+ as fallback (daemon works, just no spaCy)
      if (major === 3 && minor >= 14 && !fallback314) fallback314 = cmd;
    }
  }
  return fallback314;
}

/**
 * Install Python automatically.
 * macOS: uses brew if available
 * Linux: tries apt, dnf, pacman
 * Windows: skip (requires manual install from python.org)
 */
export async function installPython() {
  if (isWindows) return false;

  if (process.platform === 'darwin') {
    const hasBrew = await new Promise((resolve) => {
      const proc = spawn('which', ['brew'], { stdio: 'pipe', timeout: 5000 });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
    if (hasBrew) {
      return new Promise((resolve) => {
        const proc = spawn('brew', ['install', 'python@3.12'], {
          stdio: 'pipe', timeout: 300000
        });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    }
    return false;
  }

  // Linux: try apt, dnf, pacman
  for (const [pm, args] of [
    ['apt-get', ['install', '-y', 'python3', 'python3-venv']],
    ['dnf', ['install', '-y', 'python3']],
    ['pacman', ['-S', '--noconfirm', 'python']],
  ]) {
    const hasPm = await new Promise((resolve) => {
      const proc = spawn('which', [pm], { stdio: 'pipe', timeout: 5000 });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
    if (hasPm) {
      return new Promise((resolve) => {
        const proc = spawn('sudo', [pm, ...args], {
          stdio: 'pipe', timeout: 300000
        });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    }
  }
  return false;
}
