#!/usr/bin/env python3
"""Append conversation turns to a Grok-compatible session transcript.

Writes Claude-ingestible JSONL (role + content) under ~/.claudia/sessions/
so process_sessions can parse it without daemon changes.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path


def sessions_dir() -> Path:
    d = Path.home() / ".claudia" / "sessions"
    d.mkdir(parents=True, exist_ok=True)
    return d


def transcript_path(session_id: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in session_id)
    return sessions_dir() / f"{safe}.jsonl"


def append_turn(session_id: str, role: str, content: str) -> Path:
    role_norm = role.strip().lower()
    if role_norm in ("human", "user"):
        role_norm = "user"
    elif role_norm in ("assistant", "claudia", "model"):
        role_norm = "assistant"
    else:
        raise ValueError(f"role must be user or assistant, got {role!r}")

    path = transcript_path(session_id)
    line = json.dumps(
        {
            "role": role_norm,
            "content": content,
            "ts": time.time(),
        },
        ensure_ascii=False,
    )
    with open(path, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Append a turn to a Grok session transcript")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--role", required=True, choices=["user", "assistant", "human"])
    parser.add_argument("--content", required=True, help="Turn text")
    args = parser.parse_args(argv)

    path = append_turn(args.session_id, args.role, args.content)
    print(str(path))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
