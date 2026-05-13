#!/usr/bin/env python3
"""Generate a daily session summary markdown file from observations.jsonl.

Designed to run from a SessionEnd hook OR manually for retrospective summaries.

Output path: ~/.claudia/sessions/YYYY-MM-DD/NN-slug.md
Plus an INDEX.md per day, auto-regenerated.

Usage:
    session-summary.py                    # uses CLAUDE_SESSION_ID env var or stdin JSON
    session-summary.py <session_id>       # explicit session id
    session-summary.py --rebuild-index    # regenerate today's INDEX.md only
"""

import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

OBS_FILE = Path.home() / ".claudia" / "observations.jsonl"
SESSIONS_DIR = Path.home() / ".claudia" / "sessions"

# Words to filter out when deriving topic slugs
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "of", "to", "for", "with",
    "in", "on", "at", "by", "is", "are", "was", "were", "be", "been", "being",
    "i", "you", "we", "us", "they", "this", "that", "these", "those",
    "have", "has", "had", "do", "does", "did", "can", "could", "will",
    "would", "should", "may", "might", "must", "let", "let's", "ok", "okay",
    "yes", "no", "now", "go", "ahead", "please", "thanks", "today",
    "use", "make", "get", "see", "look", "want",
}


def load_observations(session_id: str = None) -> list[dict]:
    """Load observations from the JSONL file, optionally filtered by session_id."""
    if not OBS_FILE.exists():
        return []
    obs = []
    try:
        with open(OBS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    o = json.loads(line)
                    if session_id and o.get("session_id") != session_id:
                        continue
                    obs.append(o)
                except json.JSONDecodeError:
                    continue
    except OSError:
        return []
    return obs


def first_user_prompt(transcript_path: str) -> str | None:
    """Try to extract the first user prompt from a transcript file (JSONL of turns)."""
    if not transcript_path or not Path(transcript_path).exists():
        return None
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    turn = json.loads(line)
                except json.JSONDecodeError:
                    continue
                role = turn.get("role") or turn.get("type")
                if role == "user":
                    content = turn.get("content") or turn.get("text") or ""
                    if isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                return block.get("text", "")[:500]
                    elif isinstance(content, str):
                        return content[:500]
    except OSError:
        return None
    return None


def derive_topic_slug(observations: list[dict], first_prompt: str | None) -> str:
    """Derive a 2-4 word topic slug from observations and first prompt."""
    text_pool = []

    if first_prompt:
        text_pool.append(first_prompt)

    for o in observations:
        if o.get("file_path"):
            parts = Path(o["file_path"]).parts
            if len(parts) >= 2:
                text_pool.append(parts[-2])

    text_blob = " ".join(text_pool).lower()
    words = re.findall(r"[a-z]{3,}", text_blob)
    words = [w for w in words if w not in STOPWORDS]

    if not words:
        return "session"

    counter = Counter(words)
    top_words = [w for w, _ in counter.most_common(4)]
    slug = "-".join(top_words[:3]) if top_words else "session"
    return slug[:60]


def session_window(observations: list[dict]) -> tuple[float, float]:
    """Return (start_ts, end_ts) from observation timestamps."""
    if not observations:
        return (time.time(), time.time())
    timestamps = [o.get("ts", 0) for o in observations if o.get("ts")]
    if not timestamps:
        return (time.time(), time.time())
    return (min(timestamps), max(timestamps))


def files_touched(observations: list[dict]) -> list[str]:
    """Return unique file paths touched in this session, in order of first appearance."""
    seen = []
    seen_set = set()
    for o in observations:
        fp = o.get("file_path")
        if fp and fp not in seen_set:
            seen.append(fp)
            seen_set.add(fp)
    return seen


def external_actions(observations: list[dict]) -> list[dict]:
    """Return observations flagged with external_action."""
    return [
        {
            "ts": o.get("ts"),
            "tool": o.get("tool"),
            "action": o.get("external_action"),
            "input": o.get("input", "")[:200],
        }
        for o in observations if o.get("external_action")
    ]


def memory_entries_in_window(start_ts: float, end_ts: float) -> list[dict]:
    """Best-effort fetch of memory entries created during the session window.

    Relies on the claudia-memory daemon's HTTP endpoint if available.
    Returns empty list if not reachable. The daemon does not currently
    expose a /recent_memories endpoint; this is a placeholder for a
    future enhancement.
    """
    try:
        import urllib.request
        url = f"http://localhost:3848/recent_memories?since={start_ts}&until={end_ts}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=2) as resp:
            return json.loads(resp.read().decode("utf-8")).get("memories", [])
    except Exception:
        return []


def next_session_number(date_dir: Path) -> int:
    """Return the next sequential session number for the day."""
    if not date_dir.exists():
        return 1
    existing = []
    for f in date_dir.glob("[0-9][0-9]-*.md"):
        match = re.match(r"^(\d{2})-", f.name)
        if match:
            existing.append(int(match.group(1)))
    return (max(existing) + 1) if existing else 1


def render_summary(
    session_id: str,
    date_str: str,
    session_num: int,
    topic_slug: str,
    start_ts: float,
    end_ts: float,
    files: list[str],
    actions: list[dict],
    memories: list[dict],
    first_prompt: str | None,
    transcript_path: str | None,
) -> str:
    """Render the session summary markdown."""
    duration_min = max(1, round((end_ts - start_ts) / 60))
    started = datetime.fromtimestamp(start_ts, tz=timezone.utc).astimezone()
    ended = datetime.fromtimestamp(end_ts, tz=timezone.utc).astimezone()

    lines = [
        f"# Session {session_num:02d} — {topic_slug.replace('-', ' ').title()}",
        "",
        f"**Date:** {date_str}",
        f"**Started:** {started.strftime('%H:%M %Z')}",
        f"**Ended:** {ended.strftime('%H:%M %Z')}",
        f"**Duration:** ~{duration_min} min",
        f"**Session ID:** `{session_id}`",
        "",
    ]

    if first_prompt:
        lines += [
            "## Opening prompt",
            "",
            "> " + first_prompt.strip().split("\n")[0][:300],
            "",
        ]

    lines += ["## Files touched", ""]
    if files:
        for f in files:
            lines.append(f"- `{f}`")
    else:
        lines.append("- (none)")
    lines.append("")

    lines += ["## External actions", ""]
    if actions:
        for a in actions:
            lines.append(f"- **{a.get('action')}** via `{a.get('tool')}` — `{a.get('input')[:120]}`")
    else:
        lines.append("- (none)")
    lines.append("")

    lines += ["## Memory entries created", ""]
    if memories:
        for m in memories[:30]:
            mid = m.get("id") or m.get("memory_id") or "?"
            content = (m.get("content") or "")[:200]
            lines.append(f"- `mem-{mid}` — {content}")
    else:
        lines.append("- (none captured — memory daemon may not expose recent_memories endpoint)")
    lines.append("")

    if transcript_path:
        lines += [
            "## Find this again",
            "",
            f"- Transcript: `{transcript_path}`",
            f"- Memory query: `\"{topic_slug.replace('-', ' ')}\"`",
            "",
        ]

    lines += [
        "---",
        f"*Auto-generated by session-summary.py at {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M %Z')}*",
        "",
    ]

    return "\n".join(lines)


def regenerate_index(date_dir: Path) -> None:
    """Regenerate INDEX.md for a given day's folder."""
    if not date_dir.exists():
        return

    sessions = []
    for f in sorted(date_dir.glob("[0-9][0-9]-*.md")):
        first_lines = f.read_text(encoding="utf-8").split("\n")[:6]
        title = first_lines[0].lstrip("# ").strip() if first_lines else f.name
        started = ""
        for line in first_lines:
            if line.startswith("**Started:**"):
                started = line.replace("**Started:**", "").strip()
                break
        sessions.append((f.name, title, started))

    date_str = date_dir.name
    lines = [
        f"# Sessions — {date_str}",
        "",
        f"*{len(sessions)} session(s) captured.*",
        "",
        "| # | Topic | Started | File |",
        "|---|-------|---------|------|",
    ]
    for fname, title, started in sessions:
        match = re.match(r"^(\d{2})-", fname)
        num = match.group(1) if match else "??"
        clean_title = title.split("—", 1)[1].strip() if "—" in title else title
        lines.append(f"| {num} | {clean_title} | {started} | [`{fname}`](./{fname}) |")
    lines += [
        "",
        f"*INDEX regenerated {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M %Z')}*",
        "",
    ]
    (date_dir / "INDEX.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--rebuild-index":
        date_str = sys.argv[2] if len(sys.argv) > 2 else datetime.now().astimezone().strftime("%Y-%m-%d")
        regenerate_index(SESSIONS_DIR / date_str)
        print(json.dumps({"action": "rebuild-index", "date": date_str}))
        return

    session_id = ""
    transcript_path = ""

    if len(sys.argv) > 1:
        session_id = sys.argv[1]
    else:
        session_id = os.environ.get("CLAUDE_SESSION_ID", "")
        # Try stdin (SessionEnd hook contract)
        if not session_id and not sys.stdin.isatty():
            try:
                raw = sys.stdin.read()
                if raw.strip():
                    payload = json.loads(raw)
                    session_id = payload.get("session_id", "")
                    transcript_path = payload.get("transcript_path", "")
            except (json.JSONDecodeError, OSError):
                pass

    if not session_id:
        print(json.dumps({"error": "no session_id provided"}))
        return

    observations = load_observations(session_id)
    if not observations:
        print(json.dumps({"warning": "no observations for session", "session_id": session_id}))
        return

    start_ts, end_ts = session_window(observations)
    date_str = datetime.fromtimestamp(start_ts, tz=timezone.utc).astimezone().strftime("%Y-%m-%d")
    date_dir = SESSIONS_DIR / date_str
    date_dir.mkdir(parents=True, exist_ok=True)

    first_prompt = first_user_prompt(transcript_path) if transcript_path else None
    topic_slug = derive_topic_slug(observations, first_prompt)

    # Check if a summary for this session already exists; overwrite with latest data
    existing_file = None
    session_num = next_session_number(date_dir)
    for existing in date_dir.glob("[0-9][0-9]-*.md"):
        try:
            content = existing.read_text(encoding="utf-8")
            if f"`{session_id}`" in content:
                existing_file = existing
                match = re.match(r"^(\d{2})-", existing.name)
                if match:
                    session_num = int(match.group(1))
                break
        except OSError:
            continue

    files = files_touched(observations)
    actions = external_actions(observations)
    memories = memory_entries_in_window(start_ts, end_ts)

    summary = render_summary(
        session_id=session_id,
        date_str=date_str,
        session_num=session_num,
        topic_slug=topic_slug,
        start_ts=start_ts,
        end_ts=end_ts,
        files=files,
        actions=actions,
        memories=memories,
        first_prompt=first_prompt,
        transcript_path=transcript_path,
    )

    out_file = date_dir / f"{session_num:02d}-{topic_slug}.md"

    # If existing file had a different topic slug, remove the stale name
    if existing_file and existing_file != out_file:
        try:
            existing_file.unlink()
        except OSError:
            pass

    out_file.write_text(summary, encoding="utf-8")
    regenerate_index(date_dir)

    print(json.dumps({
        "ok": True,
        "session_id": session_id,
        "file": str(out_file),
        "files_touched": len(files),
        "external_actions": len(actions),
        "memories_in_window": len(memories),
        "updated": existing_file is not None,
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e)[:200]}))
