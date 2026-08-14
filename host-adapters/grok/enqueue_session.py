#!/usr/bin/env python3
"""End a Grok session: enqueue its transcript for Claudia ambient ingest.

Usage:
  python3 host-adapters/grok/enqueue_session.py --session-id grok-2026-07-09-1

Looks for ~/.claudia/sessions/<session_id>.jsonl unless --transcript is set.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running from repo root without install
_GROK_DIR = Path(__file__).resolve().parent
_HOST_ADAPTERS = _GROK_DIR.parent
for _p in (_HOST_ADAPTERS, _GROK_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from shared.enqueue import enqueue  # noqa: E402
from session_log import transcript_path  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Enqueue a Grok session for memory ingest")
    parser.add_argument("--session-id", required=True)
    parser.add_argument(
        "--transcript",
        default="",
        help="Override transcript path (default: ~/.claudia/sessions/<id>.jsonl)",
    )
    args = parser.parse_args(argv)

    path = args.transcript or str(transcript_path(args.session_id))
    if not Path(path).exists():
        print(f"warning: transcript not found at {path} (enqueueing anyway)", file=sys.stderr)

    queue = enqueue(
        session_id=args.session_id,
        transcript_path=path,
        source_channel="grok_build",
        host="grok",
    )
    print(f"enqueued {args.session_id} ({path}) -> {queue}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
