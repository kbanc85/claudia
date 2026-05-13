"""Tests for the PostToolUse capture hook.

The hook at ``template-v2/.claude/hooks/post-tool-capture.py`` is invoked by
Claude Code with a JSON payload on stdin and writes one observation line per
invocation to ``~/.claudia/observations.jsonl``. These tests run the hook as
a subprocess with ``HOME`` overridden to a temp directory so the host
machine's real observations file is never touched.

Convention rationale: the repo has Node tests in ``tests/`` (root) and pytest
tests for the daemon package in ``memory-daemon/tests/``. The hook is a
standalone Python script that lives outside the daemon package, so the
appropriate placement is ``tests/hooks/`` at the repo root. We use stdlib
``unittest`` to avoid adding pytest as a root-level dependency (the daemon
keeps its own pytest setup self-contained).

Run: ``python3 -m unittest tests.hooks.test_post_tool_capture``
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HOOK_PATH = REPO_ROOT / "template-v2" / ".claude" / "hooks" / "post-tool-capture.py"


def run_hook(stdin_payload: str, home_dir: Path) -> subprocess.CompletedProcess:
    """Invoke the hook as a subprocess with HOME overridden to ``home_dir``.

    Returns the completed process so callers can assert on exit code / stdout.
    """
    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    # On some shells USERPROFILE on Windows is consulted by Path.home(); set it
    # too for safety even though CI here is POSIX.
    env["USERPROFILE"] = str(home_dir)
    return subprocess.run(
        [sys.executable, str(HOOK_PATH)],
        input=stdin_payload,
        capture_output=True,
        text=True,
        env=env,
        timeout=5,
    )


def read_observations(home_dir: Path) -> list[dict]:
    """Return all observations written under the temp HOME, or [] if missing."""
    obs_file = home_dir / ".claudia" / "observations.jsonl"
    if not obs_file.exists():
        return []
    lines = obs_file.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


class PostToolCaptureHookTests(unittest.TestCase):
    """One test method per manual scenario in PR #38's test plan."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    # ─── Scenario 1: valid JSON payload writes one observation ──────────────

    def test_valid_payload_writes_observation(self):
        """Sensitivity proof scenario: this is the bug-fix witness.

        On main (pre-fix) the hook reads env vars and ignores stdin entirely,
        so observations.jsonl is never created. On the branch the hook reads
        the JSON payload from stdin and appends exactly one line. If this
        test passes, the stdin contract is honored.
        """
        payload = json.dumps({
            "tool_name": "Bash",
            "tool_input": {"command": "ls"},
            "tool_response": "file1",
        })

        result = run_hook(payload, self.home)
        self.assertEqual(result.returncode, 0)

        observations = read_observations(self.home)
        self.assertEqual(len(observations), 1)

        obs = observations[0]
        self.assertEqual(obs["tool"], "Bash")
        self.assertEqual(obs["output"], "file1")
        # tool_input is JSON-dumped then truncated; verify it round-trips
        self.assertEqual(json.loads(obs["input"]), {"command": "ls"})
        # The hook uses time.time() (float epoch seconds), not ISO 8601.
        # We assert it is a non-negative number rather than guessing format.
        self.assertIsInstance(obs["ts"], (int, float))
        self.assertGreater(obs["ts"], 0)

    # ─── Scenario 2: empty stdin is a silent no-op ──────────────────────────

    def test_empty_stdin_is_noop(self):
        result = run_hook("", self.home)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertEqual(read_observations(self.home), [])

    # ─── Scenario 3: malformed JSON is a silent no-op ───────────────────────

    def test_malformed_json_is_noop(self):
        result = run_hook("not json", self.home)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertEqual(read_observations(self.home), [])

    # ─── Scenario 4: skipped tool names produce no observation ──────────────

    def test_skipped_tool_name_is_filtered(self):
        for skipped in ("Read", "Glob", "Grep", "LS"):
            with self.subTest(tool=skipped):
                # Fresh HOME per subtest so a leak from one would still be
                # caught (we are not using setUp here intentionally to keep
                # the loop self-contained).
                payload = json.dumps({
                    "tool_name": skipped,
                    "tool_input": {},
                    "tool_response": "x",
                })
                result = run_hook(payload, self.home)
                self.assertEqual(result.returncode, 0)
        self.assertEqual(read_observations(self.home), [])

    # ─── Scenario 5: prefix-skipped tool names produce no observation ──────

    def test_prefix_skipped_tools_are_filtered(self):
        for skipped in (
            "memory_remember",
            "memory.recall",
            "mcp__plugin_episodic_search",
            "cognitive.ingest",
        ):
            with self.subTest(tool=skipped):
                payload = json.dumps({
                    "tool_name": skipped,
                    "tool_input": {"q": "anything"},
                    "tool_response": {"ok": True},
                })
                result = run_hook(payload, self.home)
                self.assertEqual(result.returncode, 0)
        self.assertEqual(read_observations(self.home), [])

    # ─── Scenario 6: large tool_response is truncated to 200 chars ─────────

    def test_long_response_is_truncated_to_200_chars(self):
        long_output = "a" * 1000
        payload = json.dumps({
            "tool_name": "Bash",
            "tool_input": {"command": "yes | head -c 1000"},
            "tool_response": long_output,
        })
        result = run_hook(payload, self.home)
        self.assertEqual(result.returncode, 0)

        observations = read_observations(self.home)
        self.assertEqual(len(observations), 1)
        self.assertEqual(len(observations[0]["output"]), 200)
        self.assertEqual(observations[0]["output"], "a" * 200)

    # ─── Scenario 7: missing tool_name field is a silent no-op ──────────────

    def test_missing_tool_name_is_noop(self):
        payload = json.dumps({
            "tool_input": {"command": "ls"},
            "tool_response": "anything",
        })
        result = run_hook(payload, self.home)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(read_observations(self.home), [])

    # ─── Scenario 8: fresh-install accumulation across a simulated session ──

    def test_fresh_install_accumulation(self):
        """Simulates the PR's 6th manual test plan checkbox.

        Starts with no ``~/.claudia`` directory (the temp HOME has nothing
        in it), then runs the hook three times with valid payloads, one
        invocation that should be skipped, and one with malformed JSON.
        After the dust settles the file must exist, contain exactly three
        lines (the valid ones), and the lines must be in invocation order.
        """
        # Precondition: no .claudia directory yet (fresh install).
        self.assertFalse((self.home / ".claudia").exists())

        invocations = [
            (json.dumps({"tool_name": "Bash", "tool_input": {"c": "1"},
                         "tool_response": "one"}), True),
            # Skipped tool: should not produce a line.
            (json.dumps({"tool_name": "Read", "tool_input": {"f": "/x"},
                         "tool_response": "ignored"}), False),
            (json.dumps({"tool_name": "Edit", "tool_input": {"f": "/y"},
                         "tool_response": "two"}), True),
            # Malformed: should not produce a line, must not crash.
            ("not json at all", False),
            (json.dumps({"tool_name": "Write", "tool_input": {"f": "/z"},
                         "tool_response": "three"}), True),
        ]

        for payload, _expected_kept in invocations:
            result = run_hook(payload, self.home)
            self.assertEqual(result.returncode, 0,
                             msg=f"Hook crashed on payload: {payload!r}")

        # The .claudia directory should have been created on first valid call.
        self.assertTrue((self.home / ".claudia").exists())
        self.assertTrue((self.home / ".claudia" / "observations.jsonl").exists())

        observations = read_observations(self.home)
        self.assertEqual(len(observations), 3,
                         msg="Expected three valid observations to accumulate")

        # Order preserved (append-only).
        self.assertEqual([o["tool"] for o in observations],
                         ["Bash", "Edit", "Write"])
        self.assertEqual([o["output"] for o in observations],
                         ["one", "two", "three"])


if __name__ == "__main__":
    unittest.main()
