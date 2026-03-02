#!/usr/bin/env python3
"""Cross-platform session health check hook for Claudia.

Runs `claudia system-health` and provides actionable guidance.
Outputs JSON with additionalContext for Claude Code hooks.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path


def _run_claudia(*args):
    """Run claudia CLI and return parsed JSON output, or None on failure."""
    claudia_bin = shutil.which("claudia")
    if not claudia_bin:
        # Check local node_modules
        project_dir = os.environ.get("CLAUDE_PROJECT_DIR", ".")
        local_bin = Path(project_dir) / "node_modules" / ".bin" / "claudia"
        if local_bin.exists():
            claudia_bin = str(local_bin)
        else:
            return None

    try:
        result = subprocess.run(
            [claudia_bin, *args],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError, json.JSONDecodeError):
        pass
    return None


def check_health():
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", ".")

    data = _run_claudia("system-health", "--project-dir", project_dir)

    if data:
        db = data.get("database", {})
        emb = data.get("embedding", {})
        parts = []

        if db.get("memories") is not None:
            parts.append(f"{db['memories']} memories, {db.get('entities', 0)} entities.")
        if not emb.get("available", False):
            parts.append("Embeddings unavailable.")

        summary = " ".join(parts) if parts else "System ready."
        print(json.dumps({"additionalContext": f"Memory system healthy. {summary}"}))
        return

    # CLI not available -- provide fallback guidance
    context_parts = ["Claudia CLI not responding."]

    if not shutil.which("claudia"):
        local_bin = Path(project_dir) / "node_modules" / ".bin" / "claudia"
        if local_bin.exists():
            context_parts.append("CLI found at node_modules/.bin/claudia but not on PATH.")
        else:
            context_parts.append("Install with: npm install -g get-claudia && claudia setup.")

    context_parts.append("Reading context/ files as fallback.")

    # Attach user profile if available
    profile_path = Path(project_dir) / "context" / "me.md"
    profile = ""
    if profile_path.exists():
        try:
            profile = profile_path.read_text(encoding="utf-8")[:2000]
        except OSError:
            pass

    msg = " ".join(context_parts)
    if profile:
        msg += f"\n\nUser profile (from context/me.md):\n{profile}"

    print(json.dumps({"additionalContext": msg}))


if __name__ == "__main__":
    try:
        check_health()
    except Exception:
        print(json.dumps({"additionalContext": "Health check encountered an error."}))
