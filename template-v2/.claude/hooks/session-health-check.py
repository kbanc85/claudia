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


def _enqueue_missed_sessions(queue_file_path: str = None) -> None:
    """Scan ~/.claude/projects/ for transcript files and enqueue any
    sessions not yet in sessions_pending.jsonl or already ingested in DB.

    Bounded: max 50 transcript files, skip files >50MB.
    Must complete in <2 seconds. Wrapped in try/except -- never crashes.
    """
    try:
        import sqlite3
        import time as _time

        claudia_dir = Path.home() / ".claudia"
        queue_file = Path(queue_file_path) if queue_file_path else claudia_dir / "sessions_pending.jsonl"
        claude_projects_dir = Path.home() / ".claude" / "projects"
        db_path = claudia_dir / "memory" / "claudia.db"

        if not claude_projects_dir.exists():
            return

        # Load already-queued session ids
        queued_ids: set = set()
        try:
            if queue_file.exists():
                with open(queue_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entry = json.loads(line)
                            sid = entry.get("session_id", "")
                            if sid:
                                queued_ids.add(sid)
                        except json.JSONDecodeError:
                            continue
        except OSError:
            pass

        # Load already-ingested session ids from DB (best effort)
        ingested_ids: set = set()
        try:
            if db_path.exists():
                conn = sqlite3.connect(str(db_path), timeout=1.0)
                conn.row_factory = sqlite3.Row
                cursor = conn.execute(
                    "SELECT session_id FROM episodes WHERE ingested_at IS NOT NULL AND session_id IS NOT NULL"
                )
                for row in cursor:
                    ingested_ids.add(row["session_id"])
                conn.close()
        except Exception:
            pass  # DB unavailable is fine; skip DB check

        # Scan transcript files (bounded)
        transcript_files = []
        try:
            for jsonl_file in claude_projects_dir.rglob("*.jsonl"):
                try:
                    if jsonl_file.stat().st_size > 50 * 1024 * 1024:
                        continue
                    transcript_files.append(jsonl_file)
                    if len(transcript_files) >= 50:
                        break
                except OSError:
                    continue
        except Exception:
            return

        new_entries = []
        for transcript_path in transcript_files:
            # Extract session_id from first 20 lines
            session_id = None
            try:
                with open(transcript_path, "r", encoding="utf-8") as f:
                    for i, line in enumerate(f):
                        if i >= 20:
                            break
                        line = line.strip()
                        if not line or "session_id" not in line:
                            continue
                        try:
                            turn = json.loads(line)
                            sid = turn.get("session_id", "")
                            if sid:
                                session_id = sid
                                break
                        except json.JSONDecodeError:
                            continue
            except OSError:
                continue

            if not session_id:
                continue
            if session_id in queued_ids or session_id in ingested_ids:
                continue

            new_entries.append({
                "session_id": session_id,
                "transcript_path": str(transcript_path),
                "enqueued_at": _time.time(),
            })
            queued_ids.add(session_id)  # Prevent duplicates within same scan

        if not new_entries:
            return

        # Append new entries to queue file atomically
        claudia_dir.mkdir(parents=True, exist_ok=True)
        existing_content = ""
        try:
            if queue_file.exists():
                existing_content = queue_file.read_text(encoding="utf-8")
        except OSError:
            pass

        new_lines = "".join(json.dumps(e) + "\n" for e in new_entries)
        tmp_file = queue_file.with_suffix(".jsonl.tmp")
        try:
            tmp_file.write_text(existing_content + new_lines, encoding="utf-8")
            os.rename(str(tmp_file), str(queue_file))
        except OSError:
            # Fallback to direct append
            try:
                with open(queue_file, "a", encoding="utf-8") as f:
                    f.write(new_lines)
            except OSError:
                pass

    except Exception:
        pass  # Never crash or block session start


# Update availability check.
# Surfaces, at session start, when a newer get-claudia has shipped. The launcher
# only update-checks when you run the installer; this covers the gap when you
# start a session via the shell launcher. Read-only, cached daily, timeout-bounded,
# fail-open: it must never slow or block startup.

_REGISTRY_URL = "https://registry.npmjs.org/get-claudia/latest"
_UPDATE_CACHE = Path.home() / ".claudia" / ".update_check.json"
_UPDATE_CACHE_TTL = 86400  # 24h


def _is_newer_version(latest: str, current: str) -> bool:
    """True if `latest` is a higher semver (major.minor.patch) than `current`."""
    try:
        a = [int(x) for x in str(latest).split(".")[:3]]
        b = [int(x) for x in str(current).split(".")[:3]]
        a += [0] * (3 - len(a))
        b += [0] * (3 - len(b))
        for i in range(3):
            if a[i] > b[i]:
                return True
            if a[i] < b[i]:
                return False
        return False
    except (ValueError, AttributeError):
        return False


def _installed_version(project_dir: str):
    """Read the installed Claudia version from <project_dir>/.claude/manifest.json."""
    try:
        manifest = Path(project_dir) / ".claude" / "manifest.json"
        return json.loads(manifest.read_text(encoding="utf-8")).get("version")
    except Exception:
        return None


def _fetch_latest_version():
    """Latest get-claudia version from npm, cached 24h. Fail-open (returns None)."""
    import time
    now = time.time()
    try:
        cached = json.loads(_UPDATE_CACHE.read_text(encoding="utf-8"))
        if now - cached.get("checked_at", 0) < _UPDATE_CACHE_TTL:
            return cached.get("latest")
    except Exception:
        pass
    latest = None
    try:
        req = urllib.request.Request(_REGISTRY_URL)
        with urllib.request.urlopen(req, timeout=2) as resp:
            latest = json.loads(resp.read().decode("utf-8")).get("version")
    except Exception:
        latest = None
    # Best-effort cache write (even on failure, to back off for 24h).
    try:
        _UPDATE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        _UPDATE_CACHE.write_text(
            json.dumps({"checked_at": now, "latest": latest}), encoding="utf-8"
        )
    except Exception:
        pass
    return latest


def _update_notice(project_dir: str) -> str:
    """One-line notice if a newer get-claudia is available, else ''."""
    try:
        current = _installed_version(project_dir)
        if not current:
            return ""
        latest = _fetch_latest_version()
        if latest and _is_newer_version(latest, current):
            return (
                f"Update available: Claudia v{latest} (you're on v{current}). "
                f"Run `claudia update` to upgrade."
            )
    except Exception:
        pass
    return ""


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

        notice = _update_notice(project_dir)
        if notice:
            sections.append("--- Update ---\n" + notice)

        _enqueue_missed_sessions()
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

    notice = _update_notice(project_dir)
    if notice:
        msg += f"\n\n{notice}"

    _enqueue_missed_sessions()
    print(json.dumps({"additionalContext": msg}))


if __name__ == "__main__":
    try:
        check_health()
    except Exception:
        print(json.dumps({"additionalContext": "Health check encountered an error."}))
