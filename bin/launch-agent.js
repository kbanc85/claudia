/**
 * macOS LaunchAgent management for the standalone claudia-memory daemon.
 * The standalone daemon is what runs scheduled jobs (consolidation, decay,
 * vault sync) outside of Claude Code's per-session MCP daemon.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { homedir } from 'os';

/**
 * Register (or update) the macOS LaunchAgent for the standalone daemon.
 * The standalone daemon runs 24/7 for scheduled jobs (consolidation, decay, vault sync).
 * This is separate from the MCP daemon that Claude Code spawns per-session.
 */
export async function ensureLaunchAgent(venvPythonPath) {
  const plistDir = join(homedir(), 'Library', 'LaunchAgents');
  const plistPath = join(plistDir, 'com.claudia.memory.plist');

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claudia.memory</string>
    <key>ProgramArguments</key>
    <array>
        <string>${venvPythonPath}</string>
        <string>-m</string>
        <string>claudia_memory</string>
        <string>--standalone</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${join(homedir(), '.claudia', 'daemon')}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${join(homedir(), '.claudia', 'daemon-stdout.log')}</string>
    <key>StandardErrorPath</key>
    <string>${join(homedir(), '.claudia', 'daemon-stderr.log')}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>`;

  try {
    mkdirSync(plistDir, { recursive: true });
    const needsUpdate = !existsSync(plistPath) || readFileSync(plistPath, 'utf8') !== plistContent;
    if (needsUpdate) {
      // Unload existing agent if present (ignore errors)
      try {
        await new Promise((resolve) => {
          const proc = spawn('launchctl', ['unload', plistPath], { stdio: 'pipe', timeout: 5000 });
          proc.on('close', () => resolve());
          proc.on('error', () => resolve());
        });
      } catch { /* not loaded */ }

      writeFileSync(plistPath, plistContent);

      // Load the new agent
      await new Promise((resolve) => {
        const proc = spawn('launchctl', ['load', plistPath], { stdio: 'pipe', timeout: 5000 });
        proc.on('close', () => resolve());
        proc.on('error', () => resolve());
      });
    }
  } catch {
    // Non-fatal: standalone daemon is optional
  }
}
