#!/usr/bin/env python3
"""Cross-platform session health check hook for Claudia.

Runs `claudia system-health` and provides actionable guidance.
Outputs JSON with additionalContext for Claude Code hooks.
"""

import json
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path


def _fetch_briefing():
    """Fetch session briefing from the memory daemon's HTTP endpoint."""
    try:
        req = urllib.request.Request("http://localhost:3848/briefing")
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("briefing")
    except Exception:
        return None


def _recent_sessions_summary(max_days: int = 3) -> str:
    """Return a compact recap of the last N days of session summaries.

    Reads ~/.claudia/sessions/YYYY-MM-DD/INDEX.md files. Returns a short
    multi-day digest showing what was worked on. Bounded to keep startup fast.

    Empty string when no session history exists yet (fresh installs).
    """
    sessions_dir = Path.home() / ".claudia" / "sessions"
    if not sessions_dir.exists():
        return ""

    date_folders = sorted(
        [d for d in sessions_dir.iterdir() if d.is_dir() and d.name[:4].isdigit()],
        reverse=True,
    )[:max_days]

    if not date_folders:
        return ""

    lines = []
    for date_dir in date_folders:
        summaries = sorted(date_dir.glob("[0-9][0-9]-*.md"))
        if not summaries:
            continue
        topics = []
        for f in summaries:
            try:
                first_line = f.read_text(encoding="utf-8").split("\n", 1)[0]
                topic = first_line.lstrip("#").strip()
                if "—" in topic:
                    topic = topic.split("—", 1)[1].strip()
                topics.append(topic)
            except OSError:
                continue
        if topics:
            lines.append(f"  {date_dir.name}: {' · '.join(topics[:5])}")

    if not lines:
        return ""

    return "Recent sessions (from ~/.claudia/sessions/):\n" + "\n".join(lines)


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
        briefing = _fetch_briefing()
        recent = _recent_sessions_summary()

        sections = [f"Memory system healthy. {summary}"]
        if recent:
            sections.append("--- Recent Sessions ---\n" + recent)
        if briefing:
            sections.append("--- Session Briefing ---\n" + briefing)

        print(json.dumps({"additionalContext": "\n\n".join(sections)}))
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
