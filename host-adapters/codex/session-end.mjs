#!/usr/bin/env node
"use strict";

// Codex SessionEnd hook: queue a transcript for ambient memory ingest.

import { appendFileSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

try {
  const raw = readFileSync(0, 'utf8');
  const payload = raw.trim() ? JSON.parse(raw) : {};
  if (payload.session_id) {
    const entry = {
      session_id: payload.session_id,
      transcript_path: payload.transcript_path || '',
      enqueued_at: Date.now() / 1000,
      source_channel: 'codex',
      host: 'codex',
    };
    const claudiaDir = join(homedir(), '.claudia');
    mkdirSync(claudiaDir, { recursive: true });
    appendFileSync(
      join(claudiaDir, 'sessions_pending.jsonl'),
      `${JSON.stringify(entry)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
  }
} catch {
  // SessionEnd must always fail open.
}
