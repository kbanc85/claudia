#!/usr/bin/env python3
"""PostToolUse hook: passively captures tool invocations to a JSONL file.

Reads hook input from stdin (Claude Code's actual contract), not env vars.
Writes observations to ~/.claudia/observations.jsonl for later ingestion
by the memory daemon and by the session-summary generator.

Designed to complete in <50ms (file append only, no network).

Captured per-tool-call:
- tool name + truncated input/output
- file paths touched (for Write/Edit/MultiEdit/NotebookEdit)
- external actions (git push, gh repo create, vercel deploy, etc.)
- session_id for linking observations to a session
"""

import json
import re
import sys
import time
from pathlib import Path

# Skip noisy or read-only tools that don't need observation
SKIP_PREFIXES = ("memory_", "memory.", "mcp__plugin_episodic", "cognitive.")
SKIP_NAMES = {
    "Read", "Glob", "Grep", "LS", "TodoRead",
    "ListMcpResourcesTool", "ReadMcpResourceTool",
    "TaskList", "TaskGet", "TaskOutput", "ToolSearch",
}

# Bash command patterns that signal an "external action" worth flagging in
# the daily summary. Anchored so the candidate command must appear at the
# start of the line or after a shell separator (`;`, `&&`, `|`, `\n`, `(`),
# with optional transparent prefixes (`sudo`, `nohup`, `time`, `env VAR=`).
# This rejects echo'd test JSON ("git push for testing") and prefixed
# look-alikes ("git pushd", "ungit push") while still firing on real
# invocations including chained ones (`cd foo && git push`).
_BASH_CMD_ANCHOR = (
    r"(?:^|[;&|\n(])\s*"
    r"(?:sudo\s+|nohup\s+|time\s+|env\s+\w+=\S+\s+)*"
)
EXTERNAL_ACTION_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("git push", re.compile(_BASH_CMD_ANCHOR + r"git\s+push\b")),
    ("gh repo create", re.compile(_BASH_CMD_ANCHOR + r"gh\s+repo\s+create\b")),
    ("gh pr create", re.compile(_BASH_CMD_ANCHOR + r"gh\s+pr\s+create\b")),
    ("gh release", re.compile(_BASH_CMD_ANCHOR + r"gh\s+release\b")),
    ("vercel --prod", re.compile(_BASH_CMD_ANCHOR + r"vercel\s+(?:[^\n]*\s)?--prod\b")),
    ("vercel deploy", re.compile(_BASH_CMD_ANCHOR + r"vercel\s+deploy\b")),
    ("netlify deploy", re.compile(_BASH_CMD_ANCHOR + r"netlify\s+deploy\b")),
    ("supabase db push", re.compile(_BASH_CMD_ANCHOR + r"supabase\s+db\s+push\b")),
    ("npx supabase", re.compile(_BASH_CMD_ANCHOR + r"npx\s+supabase\b")),
]


def is_external_action(tool_name: str, tool_input) -> str | None:
    """Return a short label if this tool call looks like an external action."""
    if tool_name == "Bash":
        cmd = (tool_input or {}).get("command", "") if tool_input else ""
        if not cmd:
            return None
        for label, regex in EXTERNAL_ACTION_PATTERNS:
            if regex.search(cmd):
                return label
    elif tool_name in {
        "mcp__claudia-private-email__claudia_email_send",
        "mcp__gmail__send_email", "mcp__gmail__draft_email",
    }:
        return "email send/draft"
    elif tool_name in {
        "mcp__google-calendar__create_event",
        "mcp__google-calendar__update_event",
        "mcp__google-calendar__delete_event",
    }:
        return "calendar event"
    elif tool_name.startswith("mcp__claude_ai_Slack__slack_send"):
        return "slack send"
    return None


def extract_file_path(tool_name: str, tool_input: dict) -> str | None:
    """For Write/Edit/MultiEdit/NotebookEdit, return the file path being modified."""
    if tool_name in {"Write", "Edit", "MultiEdit", "NotebookEdit"}:
        return (tool_input or {}).get("file_path")
    return None


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

    tool_input = payload.get("tool_input") or {}
    tool_response = payload.get("tool_response") or {}
    session_id = payload.get("session_id", "")

    input_summary = json.dumps(tool_input)[:300] if tool_input else ""
    output_summary = ""
    if isinstance(tool_response, dict):
        for key in ("stdout", "output", "result", "content"):
            if key in tool_response:
                val = tool_response[key]
                output_summary = str(val)[:300] if val else ""
                break
        if not output_summary:
            output_summary = json.dumps(tool_response)[:300]
    else:
        output_summary = str(tool_response)[:300]

    file_path = extract_file_path(tool_name, tool_input)
    external_action = is_external_action(tool_name, tool_input)

    observation = {
        "ts": time.time(),
        "session_id": session_id,
        "tool": tool_name,
        "input": input_summary,
        "output": output_summary,
    }
    if file_path:
        observation["file_path"] = file_path
    if external_action:
        observation["external_action"] = external_action

    obs_file = Path.home() / ".claudia" / "observations.jsonl"
    obs_file.parent.mkdir(parents=True, exist_ok=True)
    with open(obs_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(observation) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # Never block Claude
