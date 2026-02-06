#!/usr/bin/env python3
"""Cross-platform session health check hook for Claudia.

Checks memory daemon health and provides actionable guidance when it's down.
Outputs JSON with additionalContext for Claude Code hooks.
"""

import json
import os
import platform
import sys
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError


def check_health():
    context_parts = []

    # Check health endpoint
    try:
        resp = urlopen("http://localhost:3848/health", timeout=5)
        body = resp.read().decode()
        if "healthy" in body:
            print(json.dumps({"additionalContext": "Memory system healthy."}))
            return
    except (URLError, OSError, TimeoutError):
        pass

    context_parts.append(
        "IMPORTANT: Memory daemon is NOT running. Without it, you lose semantic search, "
        "pattern detection, cross-session learning, and proactive predictions. "
        "You MUST surface this to the user and offer to help fix it."
    )

    # Check daemon installation status (platform-specific)
    system = platform.system()
    home = Path.home()

    if system == "Darwin":
        plist = home / "Library" / "LaunchAgents" / "com.claudia.memory.plist"
        if plist.exists():
            context_parts.append(
                "Daemon is installed (LaunchAgent exists) but not running. "
                "Suggest: 'Your memory daemon is installed but stopped. Want me to try starting it? "
                "I can run: launchctl load ~/Library/LaunchAgents/com.claudia.memory.plist'"
            )
        else:
            context_parts.append(
                "Daemon is NOT installed. Suggest: 'The memory daemon hasn't been set up yet. "
                "Want me to install it? I can run the installer for you.'"
            )

    elif system == "Linux":
        service = home / ".config" / "systemd" / "user" / "claudia-memory.service"
        if service.exists():
            context_parts.append(
                "Daemon is installed (systemd service exists) but not running. "
                "Suggest: 'Your memory daemon is installed but stopped. Want me to try starting it? "
                "I can run: systemctl --user start claudia-memory'"
            )
        else:
            context_parts.append(
                "Daemon is NOT installed. Suggest: 'The memory daemon hasn't been set up yet. "
                "Want me to install it? I can run the installer for you.'"
            )

    elif system == "Windows":
        # Check Task Scheduler for ClaudiaMemoryDaemon
        task_status = None
        try:
            import subprocess
            result = subprocess.run(
                ["powershell", "-Command",
                 "(Get-ScheduledTask -TaskName 'ClaudiaMemoryDaemon' -ErrorAction SilentlyContinue).State"],
                capture_output=True, text=True, timeout=5
            )
            task_status = result.stdout.strip()
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

        if task_status:
            context_parts.append(
                f"Daemon is installed (Task Scheduler, state: {task_status}). "
                "Suggest: 'Your memory daemon is installed but not responding. "
                "Want me to check the logs and try restarting it?'"
            )
        else:
            context_parts.append(
                "Daemon is NOT installed as a scheduled task. "
                "Suggest: 'The memory daemon hasn't been set up yet. "
                "Want me to install it? I can run the installer for you.'"
            )

    # Check for recent crash logs
    log_path = home / ".claudia" / "daemon-stderr.log"
    if log_path.exists():
        try:
            lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
            last_lines = lines[-5:-2] if len(lines) > 5 else lines[-3:]
            if last_lines:
                log_snippet = " ".join(line.strip() for line in last_lines)
                context_parts.append(f"Recent daemon log: {log_snippet}")
        except OSError:
            pass

    output = " ".join(context_parts)
    print(json.dumps({"additionalContext": output}))


if __name__ == "__main__":
    try:
        check_health()
    except Exception:
        # Never let the hook crash Claude Code startup
        print(json.dumps({"additionalContext": "Health check encountered an error."}))
