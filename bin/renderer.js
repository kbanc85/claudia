/**
 * Banner + animated multi-step progress renderer.
 * Pure presentation logic; no side effects beyond stdout writes.
 */

import { colors, isTTY, supportsInPlace } from './lib.js';

// Compact portrait-only banner
export function getBanner(version) {
  if (!isTTY) {
    return `\n CLAUDIA v${version}\n by Kamil Banc · claudia.aiadopters.club\n Research in AI that learns how you work\n`;
  }
  const b = colors.cyan;
  const y = colors.yellow;
  const w = colors.white;
  const r = colors.reset;
  return `
  ${y}████████${b}██${r}
${y}██${w}██████████${b}██${r}
${y}██${w}██${r}  ${w}██${r}  ${w}██${y}██${r}
  ${w}██████████${r}
    ${b}██████${r}
  ${b}██████████${r}
    ${w}██${r}  ${w}██${r}

 ${colors.boldYellow}CLAUDIA${colors.reset} ${colors.yellow}v${version}${colors.reset}
 ${colors.boldCyan}by Kamil Banc${colors.reset} ${colors.cyan}· claudia.aiadopters.club${colors.reset}
 ${colors.white}Research in AI that learns how you work${colors.reset}
`;
}

// ─── 6 Unified Steps ────────────────────────────────────────────────────

export const STEPS = [
  { id: 'environment', label: 'Environment' },
  { id: 'models',      label: 'AI Models' },
  { id: 'memory',      label: 'Memory System' },
  { id: 'daemon',      label: 'Memory Daemon' },
  { id: 'mcp',         label: 'MCP Config' },
  { id: 'vault',       label: 'Obsidian Vault' },
  { id: 'health',      label: 'Health Check' },
];

// ─── Subtitles (shown under progress bar during install) ────────────────

export const SUBTITLES = [
  'Wiring neurons...',
  'Calibrating charm levels...',
  'Teaching myself to be helpful...',
  'Your memory, but better.',
  'I never forget a face. Or a deadline.',
  'Almost sentient. Mostly organized.',
  'Building something that remembers...',
  'Loading opinions...',
  'Preparing to have preferences...',
  'Indexing everything you will tell me...',
  'Learning to listen...',
  'Setting up your second brain...',
];

// ─── Thinking Wave (animated pulse under progress bar) ──────────────────

const WAVE_WIDTH = 28;
const WAVE_CHARS = ['░', '▒', '▓', '█', '▓', '▒', '░'];

export function getWaveFrame(tick) {
  // Build a traveling pulse wave
  const out = [];
  for (let i = 0; i < WAVE_WIDTH; i++) {
    const pos = (i - tick % WAVE_WIDTH + WAVE_WIDTH) % WAVE_WIDTH;
    if (pos < WAVE_CHARS.length) {
      out.push(WAVE_CHARS[pos]);
    } else {
      out.push(' ');
    }
  }
  return ` ${colors.cyan}${out.join('')}${colors.reset}`;
}

// ─── Progress Renderer ──────────────────────────────────────────────────

export class ProgressRenderer {
  constructor() {
    this.states = {};      // id → { state, detail }
    this.lastLineCount = 0;
    this.spinnerFrame = 0;
    this.spinnerChars = ['◐', '◓', '◑', '◒'];
    this.spinnerTimer = null;
    this.subtitleIndex = Math.floor(Math.random() * SUBTITLES.length);
    this.subtitleTicks = 0;   // counts render cycles; rotate every ~20 ticks (4s at 200ms)
    this.waveTick = 0;

    for (const step of STEPS) {
      this.states[step.id] = { state: 'pending', detail: '' };
    }
  }

  update(stepId, state, detail = '') {
    if (this.states[stepId]) {
      this.states[stepId] = { state, detail };
    }
    this.render();
  }

  skip(stepId, detail = 'skipped') {
    this.update(stepId, 'skipped', detail);
  }

  startSpinner() {
    if (!supportsInPlace) return;
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % this.spinnerChars.length;
      this.waveTick++;

      // Rotate subtitle every ~4 seconds (20 ticks * 200ms)
      this.subtitleTicks++;
      if (this.subtitleTicks >= 20) {
        this.subtitleTicks = 0;
        this.subtitleIndex = (this.subtitleIndex + 1) % SUBTITLES.length;
      }

      this.render();
    }, 200);
  }

  stopSpinner() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
  }

  getIcon(state) {
    switch (state) {
      case 'done':    return `${colors.cyan}✓${colors.reset}`;
      case 'warn':    return `${colors.yellow}○${colors.reset}`;
      case 'error':   return `${colors.red}!${colors.reset}`;
      case 'active':  return `${colors.cyan}${this.spinnerChars[this.spinnerFrame]}${colors.reset}`;
      case 'skipped': return `${colors.dim}○${colors.reset}`;
      case 'cascade': return `${colors.dim}·${colors.reset}`;
      default:        return `${colors.dim}░${colors.reset}`;
    }
  }

  getCompletedCount() {
    return STEPS.filter(s => {
      const st = this.states[s.id].state;
      return st === 'done' || st === 'warn' || st === 'skipped' || st === 'cascade';
    }).length;
  }

  getProgressBar() {
    const total = STEPS.length;
    const done = this.getCompletedCount();
    const barWidth = 20;
    const filled = Math.round((done / total) * barWidth);
    const empty = barWidth - filled;
    return ` [${colors.cyan}${'█'.repeat(filled)}${colors.reset}${'░'.repeat(empty)}] ${done}/${total}`;
  }

  getSubtitle() {
    const text = SUBTITLES[this.subtitleIndex];
    return ` ${colors.dim}"${text}"${colors.reset}`;
  }

  render() {
    const lines = [];

    for (const step of STEPS) {
      const { state, detail } = this.states[step.id];
      const icon = this.getIcon(state);
      const detailStr = detail
        ? `${colors.dim}${detail}${colors.reset}`
        : '';
      // Pad label to 20 chars for alignment
      const paddedLabel = step.label.padEnd(20);
      lines.push(` ${icon} ${(state === 'skipped' || state === 'cascade') ? colors.dim + paddedLabel + colors.reset : paddedLabel}${detailStr}`);
    }

    lines.push('');
    lines.push(this.getProgressBar());

    // Show thinking wave and rotating subtitle while spinner is active
    if (this.spinnerTimer) {
      lines.push(getWaveFrame(this.waveTick));
      lines.push(this.getSubtitle());
    }

    if (supportsInPlace) {
      // Move cursor up and clear previous render
      if (this.lastLineCount > 0) {
        process.stdout.write(`\x1b[${this.lastLineCount}A`);
      }
      for (const line of lines) {
        process.stdout.write(`\x1b[2K${line}\n`);
      }
      // Clear any leftover lines from previous render (e.g. wave/subtitle removed)
      if (lines.length < this.lastLineCount) {
        for (let i = 0; i < this.lastLineCount - lines.length; i++) {
          process.stdout.write(`\x1b[2K\n`);
        }
        process.stdout.write(`\x1b[${this.lastLineCount - lines.length}A`);
      }
      this.lastLineCount = lines.length;
    } else {
      // Non-TTY: only print when a step changes to done/warn/error
      // (handled in update via appendLine)
    }
  }

  // Non-TTY fallback: append a single line
  appendLine(stepId, state, detail) {
    if (supportsInPlace) return; // handled by render()
    const step = STEPS.find(s => s.id === stepId);
    if (!step) return;
    if (state === 'done' || state === 'warn' || state === 'error' || state === 'skipped' || state === 'cascade') {
      const icon = state === 'done' ? '✓' :
                   state === 'warn' ? '○' :
                   state === 'error' ? '!' :
                   state === 'cascade' ? '·' : '-';
      console.log(` ${icon} ${step.label}${detail ? '  ' + detail : ''}`);
    }
  }
}
