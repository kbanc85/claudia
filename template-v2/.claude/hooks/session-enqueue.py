#!/usr/bin/env python3
"""SessionEnd hook: enqueue session for ambient memory ingestion.

Reads session_id + transcript_path from stdin (same contract as session-summary.py).
Appends ONE JSON line to ~/.claudia/sessions_pending.jsonl for later consumption
by the memory daemon's process_sessions job.

Design constraints:
- Must complete in <50ms (file append only, no SQLite)
- Crash-proof: mkdir -p, atomic write (tmp file then os.rename)
- Never writes SQLite directly
"""

import json
import os
import sys
import time
from pathlib import Path


def main():
    # Read and parse stdin (SessionEnd hook contract)
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return
        payload = json.loads(raw)
    except (json.JSONDecodeError, OSError):
        return

    session_id = payload.get("session_id", "")
    transcript_path = payload.get("transcript_path", "")

    if not session_id:
        return

    entry = {
        "session_id": session_id,
        "transcript_path": transcript_path,
        "enqueued_at": time.time(),
    }

    claudia_dir = Path.home() / ".claudia"
    claudia_dir.mkdir(parents=True, exist_ok=True)

    queue_file = claudia_dir / "sessions_pending.jsonl"
    tmp_file = claudia_dir / "sessions_pending.jsonl.tmp"

    # Read existing content (if any)
    existing = ""
    try:
        if queue_file.exists():
            existing = queue_file.read_text(encoding="utf-8")
    except OSError:
        existing = ""

    # Atomic write: write to .tmp then rename
    new_line = json.dumps(entry) + "\n"
    try:
        tmp_file.write_text(existing + new_line, encoding="utf-8")
        os.rename(str(tmp_file), str(queue_file))
    except OSError:
        # Try direct append as fallback (non-atomic but better than losing data)
        try:
            with open(queue_file, "a", encoding="utf-8") as f:
                f.write(new_line)
        except OSError:
            pass


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # Never block Claude
