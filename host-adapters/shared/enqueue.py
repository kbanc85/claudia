#!/usr/bin/env python3
"""Append one session to ~/.claudia/sessions_pending.jsonl.

Same contract as template-v2/.claude/hooks/session-enqueue.py so the daemon
process_sessions job can ingest sessions from any host (Claude, Grok, manual).

Atomic write: read + write .tmp + rename. Never touches SQLite.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path


def enqueue(
    session_id: str,
    transcript_path: str = "",
    source_channel: str | None = None,
    host: str | None = None,
    enqueued_at: float | None = None,
) -> Path:
    """Append one queue line. Returns path to the queue file."""
    if not session_id:
        raise ValueError("session_id is required")

    entry: dict = {
        "session_id": session_id,
        "transcript_path": transcript_path or "",
        "enqueued_at": float(enqueued_at if enqueued_at is not None else time.time()),
    }
    if source_channel:
        entry["source_channel"] = source_channel
    if host:
        entry["host"] = host

    claudia_dir = Path.home() / ".claudia"
    claudia_dir.mkdir(parents=True, exist_ok=True)

    queue_file = claudia_dir / "sessions_pending.jsonl"
    tmp_file = claudia_dir / "sessions_pending.jsonl.tmp"

    existing = ""
    try:
        if queue_file.exists():
            existing = queue_file.read_text(encoding="utf-8")
    except OSError:
        existing = ""

    new_line = json.dumps(entry, ensure_ascii=False) + "\n"
    try:
        tmp_file.write_text(existing + new_line, encoding="utf-8")
        os.rename(str(tmp_file), str(queue_file))
    except OSError:
        with open(queue_file, "a", encoding="utf-8") as f:
            f.write(new_line)

    return queue_file


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Enqueue a session for Claudia ambient memory ingest"
    )
    parser.add_argument("--session-id", required=True, help="Unique session id")
    parser.add_argument(
        "--transcript",
        default="",
        help="Path to JSONL transcript (role/content lines)",
    )
    parser.add_argument(
        "--source-channel",
        default=None,
        help="e.g. grok_build, claude_code, telegram, manual",
    )
    parser.add_argument("--host", default=None, help="e.g. grok, claude, demo")
    args = parser.parse_args(argv)

    path = enqueue(
        session_id=args.session_id,
        transcript_path=args.transcript,
        source_channel=args.source_channel,
        host=args.host,
    )
    print(f"enqueued {args.session_id} -> {path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
