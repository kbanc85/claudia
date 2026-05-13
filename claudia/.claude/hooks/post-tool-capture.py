#!/usr/bin/env python3
"""PostToolUse hook: passively captures tool invocations to a JSONL file.

Reads hook input from stdin (Claude Code's actual contract), not env vars.
Writes observations to ~/.claudia/observations.jsonl for later ingestion
by the memory daemon. Designed to complete in ~1ms (file append only).
"""

import json
import sys
import time
from pathlib import Path

SKIP_PREFIXES = ("memory.", "mcp__plugin_episodic", "cognitive.")
SKIP_NAMES = {"Read", "Glob", "Grep", "LS", "ListMcpResourcesTool", "ReadMcpResourceTool"}


def main():
    # Claude Code passes hook payload as JSON on stdin.
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return
        payload = json.loads(raw)
    except (json.JSONDecodeError, OSError):
        return

    tool_name = payload.get("tool_name", "")
    if not tool_name:
        return

    if any(tool_name.startswith(p) for p in SKIP_PREFIXES) or tool_name in SKIP_NAMES:
        return

    tool_input = json.dumps(payload.get("tool_input") or {})[:200]
    tool_response = payload.get("tool_response") or {}
    if isinstance(tool_response, dict):
        tool_output = json.dumps(tool_response)[:200]
    else:
        tool_output = str(tool_response)[:200]

    observation = {
        "tool": tool_name,
        "input": tool_input,
        "output": tool_output,
        "ts": time.time(),
    }

    obs_file = Path.home() / ".claudia" / "observations.jsonl"
    obs_file.parent.mkdir(parents=True, exist_ok=True)
    with open(obs_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(observation) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # Never block Claude
