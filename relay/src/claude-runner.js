/**
 * Claude CLI runner for Claudia Relay
 *
 * Spawns `claude -p` as a child process with the Claudia install
 * directory as cwd. This is the heart of the relay -- instead of
 * calling LLM APIs directly, we delegate to the full Claude Code
 * agent which automatically picks up CLAUDE.md, MCP servers,
 * skills, rules, and hooks.
 */

import { spawn } from 'child_process';

/**
 * Run a prompt through claude -p and return the response.
 *
 * @param {string} prompt - User's message text
 * @param {Object} options
 * @param {string|null} options.sessionId - Resume this session (null for new)
 * @param {number} options.timeoutMs - Timeout in milliseconds (default 180000)
 * @param {string} options.claudiaDir - Working directory for claude -p
 * @param {string} options.permissionMode - Claude permission mode (default 'plan')
 * @returns {Promise<{ text: string, sessionId: string|null, exitCode: number, durationMs: number }>}
 */
export async function runClaude(prompt, {
  sessionId = null,
  timeoutMs = 180000,
  claudiaDir = process.cwd(),
  permissionMode = 'plan',
  files = [],
} = {}) {
  const startTime = Date.now();

  // Build the context-enriched prompt
  const now = new Date().toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  // Include attached file paths in the prompt so Claude can Read them natively
  let fileContext = '';
  if (files.length > 0) {
    fileContext = '\n\nThe user attached files via Telegram. Use your Read tool to view them:\n';
    for (const file of files) {
      fileContext += `- ${file.path}\n`;
    }
  }

  const enrichedPrompt = `[${now} | responding via Telegram -- keep responses concise and mobile-friendly, no markdown headers]\n\nIMPORTANT: When storing memories via memory.remember or memory.batch, always pass source_channel: "telegram" so memories are tagged with their origin channel.${fileContext}\n\n${prompt}`;

  // Build args
  const args = [
    '-p', enrichedPrompt,
    '--output-format', 'text',
    '--permission-mode', permissionMode,
  ];

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd: claudiaDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Timeout handling
    let timedOut = false;
    let killTimer = null;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      // Give it a moment to clean up, then force kill
      killTimer = setTimeout(() => {
        try { if (!proc.killed) proc.kill('SIGKILL'); } catch {}
      }, 5000);
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      const durationMs = Date.now() - startTime;

      // Try to extract session ID from stderr
      // Claude CLI outputs session info to stderr
      let newSessionId = sessionId;
      const sessionMatch = stderr.match(/session:\s*([a-f0-9-]+)/i);
      if (sessionMatch) {
        newSessionId = sessionMatch[1];
      }

      const text = stdout.trim();

      if (timedOut && !text) {
        reject(new Error(
          `claude -p timed out after ${Math.round(timeoutMs / 1000)}s`
        ));
        return;
      }

      if (code !== 0 && !text) {
        reject(new Error(
          `claude -p exited with code ${code}${stderr ? `: ${stderr.slice(0, 200)}` : ''}`
        ));
        return;
      }

      resolve({
        text: text || '(No response from Claude)',
        sessionId: newSessionId,
        exitCode: code ?? 0,
        durationMs,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error(
          'claude CLI not found in PATH. Install Claude Code: https://docs.anthropic.com/en/docs/claude-code'
        ));
      } else {
        reject(err);
      }
    });
  });
}
