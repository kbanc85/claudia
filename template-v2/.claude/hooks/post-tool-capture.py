#!/usr/bin/env python3
"""PostToolUse hook: passively captures tool invocations to a JSONL file.

Writes observations to ~/.claudia/observations.jsonl for later ingestion
by the memory daemon. Designed to complete in ~1ms (file append only).
"""

import json
import os
import sys
import time
from pathlib import Path

SKIP_PREFIXES = ("memory.", "mcp__plugin_episodic", "cognitive.")
SKIP_NAMES = {"Read", "Glob", "Grep", "LS", "ListMcpResourcesTool", "ReadMcpResourceTool"}


def main():
    tool_name = os.environ.get("CLAUDE_TOOL_NAME", "")
    if not tool_name:
        return

    if any(tool_name.startswith(p) for p in SKIP_PREFIXES) or tool_name in SKIP_NAMES:
        return

    tool_input = os.environ.get("CLAUDE_TOOL_INPUT", "")[:200]
    tool_output = os.environ.get("CLAUDE_TOOL_OUTPUT", "")[:200]

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
