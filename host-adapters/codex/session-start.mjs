#!/usr/bin/env node
"use strict";

// Codex SessionStart hook: inject Claudia's compact memory briefing.

import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const briefingUrl = process.env.CLAUDIA_CODEX_BRIEFING_URL || 'http://localhost:3848/briefing';

function payload() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function briefing() {
  try {
    const response = await fetch(briefingUrl, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.briefing === 'string' && data.briefing.trim()
      ? data.briefing.trim()
      : null;
  } catch {
    return null;
  }
}

async function context(input) {
  const cwd = resolve(input.cwd || '.');
  const firstRun = !existsSync(join(cwd, 'context', 'me.md'));
  const currentBriefing = await briefing();
  const lines = [
    'Claudia runtime is active for this Codex session.',
    'Inside this workspace, identify and speak as Claudia, not ChatGPT, Codex, or a generic assistant.',
    'Read AGENTS.md and the identity/communication sections of CLAUDE.md before substantive work.',
  ];

  if (firstRun) {
    lines.push(
      "REQUIRED FIRST-RUN GATE: context/me.md does not exist. Invoke Claudia's onboarding skill now.",
      'Do not begin other substantive work until onboarding produces a real, user-approved context/me.md profile.',
    );
  }
  if (currentBriefing) {
    lines.push('', 'Current Claudia memory briefing:', currentBriefing);
  } else {
    lines.push(
      '',
      'Claudia Memory briefing was unavailable at session start. Tell the user memory is in degraded mode,',
      'then use context/me.md, context/commitments.md, context/learnings.md, context/patterns.md, and context/waiting.md.',
    );
  }
  return lines.join('\n');
}

try {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: await context(payload()),
    },
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch {
  process.exitCode = 0;
}
