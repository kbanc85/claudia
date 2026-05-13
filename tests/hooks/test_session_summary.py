"""Tests for session-summary.py and the session-health-check digest path.

Scenarios covered:

- S1: SessionEnd with 3 observations creates a well-formed summary file
- S2: Re-running SessionEnd for the same session_id is idempotent
       (the same file is overwritten, no duplicate appears)
- S3: SessionEnd with zero observations for the requested session_id is
       a graceful no-op (no crash, no junk file)
- S4: --rebuild-index regenerates INDEX.md without touching session files
- S5: session-health-check._recent_sessions_summary() returns empty
       string when ~/.claudia/sessions/ does not exist (fresh installs)

Each test isolates state under a temp HOME so the host machine is never
written to.

Convention rationale: matches the existing ``tests/hooks/`` directory.
Stdlib-only. Subprocess invocation with HOME overridden.

Run: ``python3 tests/hooks/test_session_summary.py``
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HOOKS_DIR = REPO_ROOT / "template-v2" / ".claude" / "hooks"
SESSION_SUMMARY_PATH = HOOKS_DIR / "session-summary.py"
SESSION_HEALTH_PATH = HOOKS_DIR / "session-health-check.py"


def _load_health_module():
    """Import session-health-check.py for direct function calls in S5."""
    spec = importlib.util.spec_from_file_location(
        "session_health_check_under_test", SESSION_HEALTH_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_session_summary(
    home_dir: Path,
    stdin_payload: str = "",
    args: list[str] | None = None,
) -> subprocess.CompletedProcess:
    """Invoke session-summary.py with HOME overridden."""
    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["USERPROFILE"] = str(home_dir)  # Windows safety
    # Wipe CLAUDE_SESSION_ID so it doesn't leak from the parent env.
    env.pop("CLAUDE_SESSION_ID", None)
    cmd = [sys.executable, str(SESSION_SUMMARY_PATH)]
    if args:
        cmd.extend(args)
    return subprocess.run(
        cmd,
        input=stdin_payload,
        capture_output=True,
        text=True,
        env=env,
        timeout=10,
    )


def write_observations(home_dir: Path, observations: list[dict]) -> Path:
    """Write a list of observation dicts to ~/.claudia/observations.jsonl."""
    obs_file = home_dir / ".claudia" / "observations.jsonl"
    obs_file.parent.mkdir(parents=True, exist_ok=True)
    with open(obs_file, "w", encoding="utf-8") as f:
        for o in observations:
            f.write(json.dumps(o) + "\n")
    return obs_file


class SessionSummaryTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    # ─── S1: SessionEnd with 3 observations creates a summary ─────────────

    def test_session_with_three_observations_creates_summary(self):
        session_id = "sess-abc-001"
        now = time.time()
        write_observations(self.home, [
            {"ts": now - 120, "session_id": session_id, "tool": "Bash",
             "input": '{"command": "ls"}', "output": "file1\nfile2"},
            {"ts": now - 60, "session_id": session_id, "tool": "Edit",
             "input": '{"file_path": "/tmp/notes/draft.md"}',
             "output": "ok", "file_path": "/tmp/notes/draft.md"},
            {"ts": now, "session_id": session_id, "tool": "Bash",
             "input": '{"command": "git push origin main"}',
             "output": "Everything up-to-date",
             "external_action": "git push"},
        ])

        result = run_session_summary(
            self.home, stdin_payload=json.dumps({"session_id": session_id})
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        out = json.loads(result.stdout)
        self.assertTrue(out.get("ok"), msg=result.stdout)

        # Find the generated file under sessions/YYYY-MM-DD/01-*.md
        sessions_dir = self.home / ".claudia" / "sessions"
        date_dirs = list(sessions_dir.iterdir())
        self.assertEqual(len(date_dirs), 1)
        date_dir = date_dirs[0]
        # Match the YYYY-MM-DD pattern
        self.assertRegex(date_dir.name, r"^\d{4}-\d{2}-\d{2}$")

        summary_files = list(date_dir.glob("[0-9][0-9]-*.md"))
        self.assertEqual(len(summary_files), 1)
        content = summary_files[0].read_text(encoding="utf-8")

        # Header + key sections present
        self.assertRegex(content, r"^# Session 01 — ")
        self.assertIn("## Files touched", content)
        self.assertIn("/tmp/notes/draft.md", content)
        self.assertIn("## External actions", content)
        self.assertIn("git push", content)
        self.assertIn(session_id, content)

        # INDEX.md regenerated
        index = date_dir / "INDEX.md"
        self.assertTrue(index.exists())
        index_content = index.read_text(encoding="utf-8")
        self.assertIn("Sessions —", index_content)

    # ─── S2: idempotent re-run for same session_id ────────────────────────

    def test_rerun_same_session_is_idempotent(self):
        session_id = "sess-abc-002"
        now = time.time()
        write_observations(self.home, [
            {"ts": now - 60, "session_id": session_id, "tool": "Edit",
             "input": '{"file_path": "/tmp/notes/draft.md"}',
             "output": "ok", "file_path": "/tmp/notes/draft.md"},
            {"ts": now, "session_id": session_id, "tool": "Edit",
             "input": '{"file_path": "/tmp/notes/draft.md"}',
             "output": "ok", "file_path": "/tmp/notes/draft.md"},
        ])

        # First run
        result1 = run_session_summary(
            self.home, stdin_payload=json.dumps({"session_id": session_id})
        )
        self.assertEqual(result1.returncode, 0)
        out1 = json.loads(result1.stdout)
        self.assertTrue(out1.get("ok"))
        self.assertFalse(
            out1.get("updated"),
            msg="First run should not be flagged as an update.",
        )

        date_dir = next(
            (self.home / ".claudia" / "sessions").iterdir()
        )
        first_files = sorted(date_dir.glob("[0-9][0-9]-*.md"))
        self.assertEqual(len(first_files), 1)
        first_slug = first_files[0].name

        # Second run with same payload
        result2 = run_session_summary(
            self.home, stdin_payload=json.dumps({"session_id": session_id})
        )
        self.assertEqual(result2.returncode, 0)
        out2 = json.loads(result2.stdout)
        self.assertTrue(out2.get("ok"))
        self.assertTrue(
            out2.get("updated"),
            msg="Second run should be flagged as an update of an existing file.",
        )

        second_files = sorted(date_dir.glob("[0-9][0-9]-*.md"))
        self.assertEqual(
            len(second_files), 1,
            msg="Re-running must not create a duplicate session file.",
        )
        # The session number stays at 01 because the topic content hasn't
        # changed; the slug should also be stable.
        self.assertEqual(second_files[0].name, first_slug)

    # ─── S3: zero matching observations is a graceful no-op ───────────────

    def test_zero_observations_is_graceful_noop(self):
        # Write observations for a DIFFERENT session_id, then query ours.
        now = time.time()
        write_observations(self.home, [
            {"ts": now, "session_id": "some-other-session", "tool": "Bash",
             "input": "", "output": ""},
        ])

        session_id = "sess-empty"
        result = run_session_summary(
            self.home, stdin_payload=json.dumps({"session_id": session_id})
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        out = json.loads(result.stdout)
        # The hook emits a "warning: no observations" rather than crashing.
        self.assertIn("warning", out)
        self.assertEqual(out.get("session_id"), session_id)

        # No file or date dir should have been created for this session.
        sessions_dir = self.home / ".claudia" / "sessions"
        if sessions_dir.exists():
            for date_dir in sessions_dir.iterdir():
                files = list(date_dir.glob("[0-9][0-9]-*.md"))
                self.assertEqual(
                    files, [],
                    msg="No summary file should be created for empty session.",
                )

    # ─── S4: --rebuild-index regenerates INDEX.md only ────────────────────

    def test_rebuild_index_regenerates_index_only(self):
        session_id = "sess-rebuild-001"
        now = time.time()
        write_observations(self.home, [
            {"ts": now, "session_id": session_id, "tool": "Edit",
             "input": '{"file_path": "/tmp/x.md"}', "output": "ok",
             "file_path": "/tmp/x.md"},
        ])

        # Create one session summary first.
        result = run_session_summary(
            self.home, stdin_payload=json.dumps({"session_id": session_id})
        )
        self.assertEqual(result.returncode, 0)
        out = json.loads(result.stdout)
        self.assertTrue(out.get("ok"))

        date_dir = next(
            (self.home / ".claudia" / "sessions").iterdir()
        )
        summary_files = list(date_dir.glob("[0-9][0-9]-*.md"))
        self.assertEqual(len(summary_files), 1)

        # Snapshot summary file state.
        snapshot = summary_files[0].read_text(encoding="utf-8")
        snapshot_mtime = summary_files[0].stat().st_mtime

        # Now corrupt the index intentionally to verify the rebuild rewrites it.
        index = date_dir / "INDEX.md"
        index.write_text("PLACEHOLDER", encoding="utf-8")

        # Wait a hair so any rewrite gets a distinguishable mtime.
        time.sleep(0.05)

        result2 = run_session_summary(
            self.home, args=["--rebuild-index", date_dir.name]
        )
        self.assertEqual(result2.returncode, 0, msg=result2.stderr)
        out2 = json.loads(result2.stdout)
        self.assertEqual(out2.get("action"), "rebuild-index")
        self.assertEqual(out2.get("date"), date_dir.name)

        # INDEX rebuilt: no longer the placeholder
        new_index = index.read_text(encoding="utf-8")
        self.assertNotEqual(new_index, "PLACEHOLDER")
        self.assertIn("Sessions —", new_index)

        # Per-session summary file is unchanged (same content, same mtime).
        post_summary_files = list(date_dir.glob("[0-9][0-9]-*.md"))
        self.assertEqual(len(post_summary_files), 1)
        self.assertEqual(post_summary_files[0].name, summary_files[0].name)
        self.assertEqual(
            post_summary_files[0].read_text(encoding="utf-8"), snapshot
        )
        self.assertEqual(post_summary_files[0].stat().st_mtime, snapshot_mtime)


class SessionHealthDigestTests(unittest.TestCase):
    """S5: ``_recent_sessions_summary`` handles fresh installs gracefully."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name)
        # Patch HOME for Path.home() inside the imported module by setting
        # the env var BEFORE importing the module fresh.
        self._old_home = os.environ.get("HOME")
        os.environ["HOME"] = str(self.home)

    def tearDown(self):
        if self._old_home is not None:
            os.environ["HOME"] = self._old_home
        else:
            os.environ.pop("HOME", None)
        self._tmp.cleanup()

    def test_recent_sessions_summary_empty_when_no_sessions_dir(self):
        # Fresh install: no ~/.claudia/sessions/ at all.
        health = _load_health_module()
        result = health._recent_sessions_summary()
        self.assertEqual(result, "")

    def test_recent_sessions_summary_empty_when_dir_has_no_date_folders(self):
        # ~/.claudia/sessions/ exists but is empty.
        (self.home / ".claudia" / "sessions").mkdir(parents=True)
        health = _load_health_module()
        result = health._recent_sessions_summary()
        self.assertEqual(result, "")

    def test_recent_sessions_summary_returns_digest_when_sessions_exist(self):
        # One date folder with one summary file.
        date_dir = self.home / ".claudia" / "sessions" / "2026-05-13"
        date_dir.mkdir(parents=True)
        (date_dir / "01-test-topic.md").write_text(
            "# Session 01 — Test Topic\n\n**Date:** 2026-05-13\n",
            encoding="utf-8",
        )
        health = _load_health_module()
        result = health._recent_sessions_summary()
        self.assertIn("2026-05-13", result)
        self.assertIn("Test Topic", result)


if __name__ == "__main__":
    unittest.main()
