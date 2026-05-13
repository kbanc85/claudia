"""Tests for the external-action detection in post-tool-capture.py.

PR #40 introduced loose substring matching for Bash external-action patterns
(``"git push" in cmd``) which false-positives on echo'd test JSON, prompt
content that mentions the literal string, etc. This test file guards a
follow-up that tightens the matching to compiled-regex word boundaries.

Tests target the hook's internal ``is_external_action`` function directly
(loaded via ``importlib`` since the file has a hyphen in its name). This
keeps the tests fast and precise; integration coverage of the full
stdin/JSONL pipeline lives in ``test_post_tool_capture.py`` (PR #38).

Convention rationale: matches the existing ``tests/hooks/`` directory and
the stdlib-unittest approach used by PR #38's tests.

Run: ``python3 tests/hooks/test_post_tool_capture_external_actions.py``
"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HOOK_PATH = (
    REPO_ROOT / "template-v2" / ".claude" / "hooks" / "post-tool-capture.py"
)


def _load_hook_module():
    """Import the hook file as a module so tests can call its functions."""
    spec = importlib.util.spec_from_file_location(
        "post_tool_capture_under_test", HOOK_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HOOK = _load_hook_module()


class BashExternalActionDetectionTests(unittest.TestCase):
    """Tighten Bash external-action detection to word boundaries.

    The pre-change hook substring-matches ``"git push" in cmd``, which fires
    on any text containing that substring (echo'd JSON, comments, etc.).
    The post-change hook uses compiled regex with ``\\b`` anchors so only
    actual command-line invocations fire.
    """

    # ─── Scenario 1: legitimate git push fires ────────────────────────────

    def test_real_git_push_fires(self):
        result = HOOK.is_external_action(
            "Bash", {"command": "git push origin main"}
        )
        self.assertIsNotNone(result)
        # The label is one of "git push" or similar; whichever the hook
        # chose, it should at least contain the canonical command name.
        self.assertIn("git push", result)

    # ─── Scenario 2: SENSITIVITY -- echo'd test JSON does NOT fire ────────

    def test_echo_of_quoted_command_does_not_fire(self):
        """Sensitivity proof for the word-boundary change.

        Pre-change: substring match ``"git push" in cmd`` fires because
        the literal string appears inside the echo argument.

        Note on regex choice: the brief proposes ``\\bgit\\s+push\\b``,
        but that alone does not solve this false-positive (``\\b`` still
        matches between the opening quote and ``git``). To actually satisfy
        the contract in the brief's table, the implementation uses a
        stronger anchor that requires the command to appear at the start
        of the line or after a shell separator (``;``, ``&&``, ``|``,
        ``\\n``, ``(``), with optional transparent prefixes like ``sudo``,
        ``nohup``, ``time``, or ``env VAR=value``. This faithfully
        implements the brief's stated intent (echo'd test JSON does NOT
        trigger; real invocations do).
        """
        result = HOOK.is_external_action(
            "Bash", {"command": 'echo "git push for testing"'}
        )
        self.assertIsNone(
            result,
            msg=(
                "echo'd quoted string should not be treated as an "
                "external action. cmd='echo \"git push for testing\"'"
            ),
        )

    def test_sudo_prefixed_git_push_still_fires(self):
        """Transparent prefixes (sudo, nohup, time, env VAR=val) pass through.

        Pre-change behavior fired on ``sudo git push origin main``
        because of substring matching. To avoid regressing that
        legitimately-flagged invocation, the new anchor allows these
        transparent prefixes.
        """
        result = HOOK.is_external_action(
            "Bash", {"command": "sudo git push origin main"}
        )
        self.assertIsNotNone(result)
        self.assertIn("git push", result)

    def test_chained_command_fires(self):
        """`cd foo && git push origin main` is a real invocation."""
        result = HOOK.is_external_action(
            "Bash", {"command": "cd foo && git push origin main"}
        )
        self.assertIsNotNone(result)
        self.assertIn("git push", result)

    # ─── Scenario 3: similar-named command does NOT fire ──────────────────

    def test_git_pushd_does_not_fire(self):
        """`git pushd` is not `git push`. Word boundary must reject this."""
        result = HOOK.is_external_action(
            "Bash", {"command": "git pushd /tmp"}
        )
        self.assertIsNone(result)

    # ─── Scenario 4: prefixed command does NOT fire ───────────────────────

    def test_ungit_push_does_not_fire(self):
        """`ungit push something` is not `git push`. Word boundary at start."""
        result = HOOK.is_external_action(
            "Bash", {"command": "ungit push something"}
        )
        self.assertIsNone(result)

    # ─── Scenario 5: gh repo create fires ──────────────────────────────────

    def test_gh_repo_create_fires(self):
        result = HOOK.is_external_action(
            "Bash", {"command": "gh repo create myproject --public"}
        )
        self.assertIsNotNone(result)
        self.assertIn("gh repo create", result)

    # ─── Scenario 6: gh repo create inside echo does NOT fire ─────────────

    def test_echoed_gh_repo_create_does_not_fire(self):
        """Consistent behavior: echo'd command text must not trigger."""
        result = HOOK.is_external_action(
            "Bash", {"command": 'echo "gh repo create example"'}
        )
        self.assertIsNone(result)

    # ─── Scenario 7: MCP send tool-name match still works ─────────────────

    def test_mcp_gmail_send_still_fires(self):
        """The MCP tool-name match path (not regex) must remain intact."""
        result = HOOK.is_external_action(
            "mcp__gmail__send_email", {"to": "x@example.com"}
        )
        self.assertEqual(result, "email send/draft")

    def test_mcp_calendar_create_still_fires(self):
        result = HOOK.is_external_action(
            "mcp__google-calendar__create_event", {"summary": "x"}
        )
        self.assertEqual(result, "calendar event")

    def test_mcp_slack_send_still_fires(self):
        result = HOOK.is_external_action(
            "mcp__claude_ai_Slack__slack_send_message", {"channel": "#x"}
        )
        self.assertEqual(result, "slack send")

    # ─── Scenario 8: every Bash pattern has a regex entry ──────────────────

    def test_every_bash_pattern_has_compiled_regex(self):
        """Structural guard: the new pattern table must compile.

        Pre-change: ``EXTERNAL_ACTION_PATTERNS`` is a list of plain strings.
        Post-change: it must be a list of (label, compiled_regex) tuples,
        or an equivalent structure that allows regex search. This test
        accepts either ``(label, re.Pattern)`` tuples or any iterable of
        items where each item exposes a ``search`` method (duck-typed).
        """
        import re as _re
        patterns = HOOK.EXTERNAL_ACTION_PATTERNS
        self.assertGreater(len(patterns), 0)
        for entry in patterns:
            with self.subTest(entry=entry):
                # Either entry is a tuple (label, compiled_regex)
                if isinstance(entry, tuple):
                    self.assertEqual(len(entry), 2)
                    label, regex = entry
                    self.assertIsInstance(label, str)
                    self.assertGreater(len(label), 0)
                    self.assertIsInstance(regex, _re.Pattern)
                else:
                    self.fail(
                        f"EXTERNAL_ACTION_PATTERNS entry is not a "
                        f"(label, regex) tuple: {entry!r}"
                    )

    # ─── Scenario 9: classic positives still fire ─────────────────────────

    def test_vercel_deploy_fires(self):
        result = HOOK.is_external_action(
            "Bash", {"command": "vercel deploy --prod"}
        )
        self.assertIsNotNone(result)

    def test_netlify_deploy_fires(self):
        result = HOOK.is_external_action(
            "Bash", {"command": "netlify deploy --prod"}
        )
        self.assertIsNotNone(result)

    def test_supabase_db_push_fires(self):
        result = HOOK.is_external_action(
            "Bash", {"command": "supabase db push --linked"}
        )
        self.assertIsNotNone(result)

    # ─── Scenario 10: empty / missing command is None ─────────────────────

    def test_empty_command_returns_none(self):
        self.assertIsNone(HOOK.is_external_action("Bash", {"command": ""}))
        self.assertIsNone(HOOK.is_external_action("Bash", {}))
        self.assertIsNone(HOOK.is_external_action("Bash", None))


if __name__ == "__main__":
    unittest.main()
