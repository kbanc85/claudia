#!/usr/bin/env python3
"""Cross-platform session health check hook for Claudia.

Checks memory daemon health and provides actionable guidance when it's down.
Outputs JSON with additionalContext for Claude Code hooks.
"""

import json
import platform
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError


def _get_status_summary():
    """Call /status endpoint for compact memory counts. Returns summary string or None."""
    try:
        resp = urlopen("http://localhost:3848/status", timeout=5)
        data = json.loads(resp.read().decode())

        counts = data.get("counts", {})
        memories = counts.get("memories", 0)
        entities = counts.get("entities", 0)
        parts = [f"Memory: {memories} memories, {entities} entities."]

        # Embedding warnings only
        components = data.get("components", {})
        embed_status = components.get("embeddings", "ok")
        if embed_status in ("unavailable", "error"):
            parts.append(f"Embeddings {embed_status}.")
        if data.get("embedding_model_mismatch", False):
            parts.append("Embedding model mismatch.")

        return " ".join(parts)
    except (URLError, OSError, TimeoutError, json.JSONDecodeError, KeyError):
        return None



def check_health():
    context_parts = []

    # Check health endpoint
    try:
        resp = urlopen("http://localhost:3848/health", timeout=5)
        body = resp.read().decode()
        if "healthy" in body:
            # Health OK - try to get richer status data
            status_msg = _get_status_summary()
            if status_msg:
                print(json.dumps({"additionalContext": status_msg}))
            else:
                print(json.dumps({"additionalContext": "Memory system healthy."}))
            return
    except (URLError, OSError, TimeoutError):
        pass

    context_parts.append("Memory daemon not responding.")

    # Check daemon installation status (platform-specific)
    system = platform.system()
    home = Path.home()

    if system == "Darwin":
        plist = home / "Library" / "LaunchAgents" / "com.claudia.memory.plist"
        if plist.exists():
            import subprocess
            import time
            restarted = False
            try:
                subprocess.run(["launchctl", "unload", str(plist)],
                               capture_output=True, timeout=10)
                time.sleep(0.5)
                subprocess.run(["launchctl", "load", str(plist)],
                               capture_output=True, timeout=10)
                time.sleep(3)
                try:
                    resp = urlopen("http://localhost:3848/health", timeout=5)
                    if "healthy" in resp.read().decode():
                        restarted = True
                except (URLError, OSError, TimeoutError):
                    pass
            except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
                pass
            if restarted:
                status_msg = _get_status_summary()
                msg = (
                    "Memory daemon was stopped and has been auto-restarted. "
                    "MCP tools not available this session -- restart Claude Code to reconnect. "
                    "Context files are preserved."
                )
                if status_msg:
                    msg = f"{msg} {status_msg}"
                print(json.dumps({"additionalContext": msg}))
                return
            context_parts.append(
                "Memory daemon stopped. "
                "Restart: launchctl load ~/Library/LaunchAgents/com.claudia.memory.plist. "
                "If unavailable, read context/ files directly."
            )
        else:
            context_parts.append(
                "Memory daemon not installed. Run installer or read context/ files directly."
            )

    elif system == "Linux":
        service = home / ".config" / "systemd" / "user" / "claudia-memory.service"
        if service.exists():
            import subprocess
            import time
            restarted = False
            try:
                subprocess.run(["systemctl", "--user", "restart", "claudia-memory"],
                               capture_output=True, timeout=15)
                time.sleep(3)
                try:
                    resp = urlopen("http://localhost:3848/health", timeout=5)
                    if "healthy" in resp.read().decode():
                        restarted = True
                except (URLError, OSError, TimeoutError):
                    pass
            except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
                pass
            if restarted:
                status_msg = _get_status_summary()
                msg = (
                    "Memory daemon was stopped and has been auto-restarted. "
                    "MCP tools not available this session -- restart Claude Code to reconnect. "
                    "Context files are preserved."
                )
                if status_msg:
                    msg = f"{msg} {status_msg}"
                print(json.dumps({"additionalContext": msg}))
                return
            context_parts.append(
                "Memory daemon stopped. "
                "Restart: systemctl --user restart claudia-memory. "
                "If unavailable, read context/ files directly."
            )
        else:
            context_parts.append(
                "Memory daemon not installed. Run installer or read context/ files directly."
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
                f"Memory daemon installed (Task Scheduler, state: {task_status}) but not responding. "
                "Restart via Task Scheduler. If unavailable, read context/ files directly."
            )
        else:
            context_parts.append(
                "Memory daemon not installed. Run installer or read context/ files directly."
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
