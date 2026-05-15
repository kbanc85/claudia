/**
 * Interactive prompt helpers. All respect non-TTY / --yes for CI safety.
 */

import { createInterface } from 'readline';
import { colors, isTTY } from './lib.js';

// Simple y/n prompt. Returns true if user confirms (or non-TTY / --yes flag).
export function confirm(question) {
  if (!isTTY || process.argv.includes('--yes') || process.argv.includes('-y')) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(` ${question} ${colors.dim}(y/n)${colors.reset} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

// Single-keystroke prompt. Returns the lowercased first character of the
// user's answer, or `defaultKey` when non-TTY / --yes.
export function promptKey(question, validKeys, defaultKey) {
  if (!isTTY || process.argv.includes('--yes') || process.argv.includes('-y')) {
    return Promise.resolve(defaultKey);
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const c = (answer || '').trim().toLowerCase().charAt(0);
      if (validKeys.includes(c)) resolve(c);
      else resolve(defaultKey);
    });
  });
}

// Free-form text prompt. Returns the trimmed answer, or '' when non-TTY.
export function prompt(question) {
  if (!isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(` ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
