"""Tests for session-enqueue.py hook.

Scenarios covered:

- E1: SessionEnd payload with session_id + transcript_path writes one JSON line
      to ~/.claudia/sessions_pending.jsonl
- E2: Running twice with the same session_id results in 2 lines (queue is
      append-only; dedup happens at consume time in the daemon)
- E3: Empty stdin produces no crash and no spurious file creation (or leaves
      any pre-existing queue file intact)

Each test isolates state under a temp HOME so the host machine is never
written to.

Run: ``python3 tests/hooks/test_session_enqueue.py``
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HOOKS_DIR = REPO_ROOT / "template-v2" / ".claude" / "hooks"
ENQUEUE_HOOK_PATH = HOOKS_DIR / "session-enqueue.py"


def run_enqueue(
    home_dir: Path,
    stdin_payload: str = "",
) -> subprocess.CompletedProcess:
    """Invoke session-enqueue.py with HOME overridden."""
    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["USERPROFILE"] = str(home_dir)
    cmd = [sys.executable, str(ENQUEUE_HOOK_PATH)]
    return subprocess.run(
        cmd,
        input=stdin_payload,
        capture_output=True,
        text=True,
        env=env,
        timeout=10,
    )


class SessionEnqueueTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    # --- E1: basic enqueue writes one line ---

    def test_enqueue_writes_to_queue(self):
        """SessionEnd payload writes one JSON line to sessions_pending.jsonl."""
        session_id = "sess-enqueue-001"
        transcript = "/tmp/transcripts/sess-enqueue-001.jsonl"
        payload = json.dumps({
            "session_id": session_id,
            "transcript_path": transcript,
        })

        result = run_enqueue(self.home, stdin_payload=payload)
        self.assertEqual(result.returncode, 0, msg=result.stderr)

        queue_file = self.home / ".claudia" / "sessions_pending.jsonl"
        self.assertTrue(queue_file.exists(), "sessions_pending.jsonl should be created")

        content = queue_file.read_text(encoding="utf-8")
        lines = [l for l in content.splitlines() if l.strip()]
        self.assertEqual(len(lines), 1, "Exactly one entry should be written")

        entry = json.loads(lines[0])
        self.assertEqual(entry["session_id"], session_id)
        self.assertEqual(entry["transcript_path"], transcript)
        self.assertIn("enqueued_at", entry)
        self.assertIsInstance(entry["enqueued_at"], float)

    # --- E2: duplicate session_id produces 2 lines ---

    def test_enqueue_idempotent_on_dup_session(self):
        """Running twice with same session_id yields 2 lines (no dedup in hook)."""
        session_id = "sess-enqueue-002"
        payload = json.dumps({
            "session_id": session_id,
            "transcript_path": "/tmp/t.jsonl",
        })

        # First run
        r1 = run_enqueue(self.home, stdin_payload=payload)
        self.assertEqual(r1.returncode, 0)

        # Second run (same session_id)
        r2 = run_enqueue(self.home, stdin_payload=payload)
        self.assertEqual(r2.returncode, 0)

        queue_file = self.home / ".claudia" / "sessions_pending.jsonl"
        self.assertTrue(queue_file.exists())
        lines = [l for l in queue_file.read_text(encoding="utf-8").splitlines() if l.strip()]
        self.assertEqual(len(lines), 2, "Two runs should produce two lines")
        for line in lines:
            entry = json.loads(line)
            self.assertEqual(entry["session_id"], session_id)

    # --- E3: empty stdin does not crash ---

    def test_enqueue_no_crash_on_empty_stdin(self):
        """Empty stdin causes no crash and no queue file creation."""
        result = run_enqueue(self.home, stdin_payload="")
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        # Queue file should NOT exist (nothing to enqueue)
        queue_file = self.home / ".claudia" / "sessions_pending.jsonl"
        self.assertFalse(
            queue_file.exists(),
            "No queue file should be created for empty stdin",
        )

    # --- E4: bad JSON stdin does not crash ---

    def test_enqueue_no_crash_on_bad_stdin(self):
        """Malformed JSON stdin causes no crash."""
        result = run_enqueue(self.home, stdin_payload="{not valid json")
        self.assertEqual(result.returncode, 0, msg=result.stderr)

    # --- E5: missing session_id does not write ---

    def test_enqueue_no_write_on_missing_session_id(self):
        """Payload without session_id does not write to queue."""
        payload = json.dumps({"transcript_path": "/tmp/t.jsonl"})
        result = run_enqueue(self.home, stdin_payload=payload)
        self.assertEqual(result.returncode, 0)
        queue_file = self.home / ".claudia" / "sessions_pending.jsonl"
        self.assertFalse(queue_file.exists(), "No queue file when session_id is missing")


if __name__ == "__main__":
    unittest.main()
