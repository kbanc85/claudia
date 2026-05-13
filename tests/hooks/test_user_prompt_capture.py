"""Tests for the UserPromptSubmit capture hook.

The hook at ``template-v2/.claude/hooks/user-prompt-capture.py`` is invoked by
Claude Code with a JSON payload on stdin and emits a JSON object on stdout
with ``additionalContext`` whenever a commitment trigger or destructive
pattern fires. These tests run the hook as a subprocess.

Two PR-review concerns are guarded here:

1. **No raw regex syntax leaks to the model.** When the destructive branch
   fires, the message must show human-readable labels (e.g.
   ``rm -rf (recursive delete)``), never the raw pattern source
   (``\\brm\\s+-rf\\b``). Test 3 parametrizes over every entry in
   ``DESTRUCTIVE_PATTERNS`` to enforce this behaviorally.

2. **No hardcoded tool names in the commitment message.** The hook must
   stay tool-agnostic so doctrine doesn't rot if tool names change. The
   memory-commitment rule governs which tool to call; the hook only
   fires the alarm. Tests 4 and 5 enforce this.

Convention rationale: same as ``tests/hooks/test_post_tool_capture.py`` --
stdlib ``unittest``, subprocess invocation, no new dependencies.

Run: ``python3 tests/hooks/test_user_prompt_capture.py``
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HOOK_PATH = (
    REPO_ROOT / "template-v2" / ".claude" / "hooks" / "user-prompt-capture.py"
)


def _load_hook_module():
    """Import the hook file as a module so tests can read its constants.

    The hook file has a hyphen in its name, so a normal ``import`` won't
    work; we use ``importlib`` to load it by absolute path.
    """
    spec = importlib.util.spec_from_file_location(
        "user_prompt_capture_under_test", HOOK_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HOOK_MODULE = _load_hook_module()


def run_hook(prompt: str) -> tuple[int, str, str]:
    """Invoke the hook with a stdin payload containing ``prompt``.

    Returns (exit_code, stdout, stderr).
    """
    payload = json.dumps({"prompt": prompt})
    result = subprocess.run(
        [sys.executable, str(HOOK_PATH)],
        input=payload,
        capture_output=True,
        text=True,
        env=os.environ.copy(),
        timeout=5,
    )
    return result.returncode, result.stdout, result.stderr


def run_hook_raw(raw_stdin: str) -> tuple[int, str, str]:
    """Invoke the hook with arbitrary raw stdin (for malformed-input tests)."""
    result = subprocess.run(
        [sys.executable, str(HOOK_PATH)],
        input=raw_stdin,
        capture_output=True,
        text=True,
        env=os.environ.copy(),
        timeout=5,
    )
    return result.returncode, result.stdout, result.stderr


def extract_additional_context(stdout: str) -> str:
    """Parse the hook's stdout JSON and return additionalContext, or '' if none."""
    stripped = stdout.strip()
    if not stripped:
        return ""
    parsed = json.loads(stripped)
    return parsed.get("additionalContext", "")


class UserPromptCaptureHookTests(unittest.TestCase):
    """One test method per scenario in PR #42's revised plan."""

    # ─── Scenario 1: rm -rf prompt shows the human-readable label ──────────

    def test_rm_rf_shows_human_label(self):
        _exit, stdout, _stderr = run_hook("rm -rf the build dir")
        ctx = extract_additional_context(stdout)
        self.assertIn("rm -rf (recursive delete)", ctx)

    # ─── Scenario 2: git push --force shows the human-readable label ───────

    def test_force_push_shows_human_label(self):
        _exit, stdout, _stderr = run_hook("git push --force on main")
        ctx = extract_additional_context(stdout)
        self.assertIn("git push --force", ctx)
        # Must not contain the raw alternation group from the regex.
        self.assertNotIn("-+f", ctx)
        self.assertNotIn("(?:", ctx)

    # ─── Scenario 3: SENSITIVITY -- no raw regex syntax leaks (exhaustive) ─

    def test_no_raw_regex_syntax_leaks_in_any_destructive_output(self):
        """Sensitivity proof for the PATTERN_LABELS change.

        Pre-change behavior: ``patterns_list`` is built directly from the
        regex pattern strings, so triggering any destructive match leaks
        raw regex syntax (``\\b``, ``\\s+``, ``(?:``, etc.) into
        ``additionalContext``. This test runs the hook against a trigger
        prompt for every pattern in DESTRUCTIVE_PATTERNS and asserts no
        regex meta-syntax appears in the output. On the un-fixed hook this
        fails for the `\\b` escape on every pattern. On the fixed hook the
        labels are plain English and contain none of these tokens.
        """
        # Minimal prompts known to match each pattern. Ordered so the dict
        # below stays human-scannable.
        trigger_prompts = {
            r"\brm\s+-rf\b": "please rm -rf the dir",
            r"\bdrop\s+(table|database|schema)\b": "drop table users",
            r"\bgit\s+push\s+(?:-+f\b|--force\b)": "git push --force",
            r"\bgit\s+reset\s+--hard\b": "git reset --hard HEAD~1",
            r"\btruncate\s+table\b": "truncate table logs",
            r"\bDELETE\s+FROM\b": "DELETE FROM users",
        }

        # Sanity: the prompts above cover every documented pattern.
        self.assertEqual(
            set(trigger_prompts.keys()),
            set(HOOK_MODULE.DESTRUCTIVE_PATTERNS),
            msg="Test fixture out of sync with DESTRUCTIVE_PATTERNS",
        )

        # Forbidden regex meta-tokens that must never appear in the output.
        # We do NOT forbid every backslash (the human label "DELETE FROM (SQL)"
        # has none anyway, but a label COULD contain a literal backslash).
        # Instead we forbid the specific regex idioms that would prove a
        # raw pattern is being interpolated.
        regex_leaks = [
            r"\b",       # word boundary
            r"\s+",      # whitespace quantifier
            r"\s*",      # whitespace quantifier
            "(?:",        # non-capturing group
            "(?=",        # lookahead
            "(?!",        # negative lookahead
        ]

        for pattern, prompt in trigger_prompts.items():
            with self.subTest(pattern=pattern):
                _exit, stdout, _stderr = run_hook(prompt)
                ctx = extract_additional_context(stdout)
                self.assertNotEqual(
                    ctx, "",
                    msg=f"No additionalContext fired for prompt: {prompt!r}",
                )
                for token in regex_leaks:
                    self.assertNotIn(
                        token, ctx,
                        msg=(
                            f"Raw regex token {token!r} leaked into output "
                            f"for pattern {pattern!r}. ctx={ctx!r}"
                        ),
                    )
                # Also: no backslash followed by a letter (e.g. \b, \s, \d).
                self.assertFalse(
                    re.search(r"\\[a-zA-Z]", ctx),
                    msg=(
                        f"Backslash-letter regex escape leaked for "
                        f"pattern {pattern!r}. ctx={ctx!r}"
                    ),
                )

    # ─── Scenario 4: SENSITIVITY -- no tool names in commitment output ────

    def test_no_tool_names_in_commitment_output(self):
        """Sensitivity proof for the tool-agnostic phrasing change.

        Pre-change the commitment message hardcoded ``memory_remember`` and
        ``memory_batch``. The memory-commitment rule (PR #39) is the single
        place that names tools; the hook should fire the alarm only.
        """
        _exit, stdout, _stderr = run_hook(
            "the brand red is #D63233, lock this in"
        )
        ctx = extract_additional_context(stdout)
        self.assertNotEqual(ctx, "")
        for forbidden in ("memory_remember", "memory_batch", "memory."):
            self.assertNotIn(
                forbidden, ctx,
                msg=(
                    f"Tool-name string {forbidden!r} leaked into commitment "
                    f"output. ctx={ctx!r}"
                ),
            )

    # ─── Scenario 5: positive assertion on the new tool-agnostic phrasing ──

    def test_commitment_uses_new_phrasing(self):
        _exit, stdout, _stderr = run_hook(
            "the brand red is #D63233, lock this in"
        )
        ctx = extract_additional_context(stdout)
        self.assertIn("save the canonical fact to memory immediately", ctx)

    # ─── Scenario 6: both branches fire on a combined prompt ──────────────

    def test_combined_commitment_and_destructive_prompt(self):
        _exit, stdout, _stderr = run_hook(
            "remember this: I always rm -rf the build dir"
        )
        ctx = extract_additional_context(stdout)
        # Commitment branch: new phrasing present.
        self.assertIn("save the canonical fact to memory immediately", ctx)
        # Destructive branch: human label present, raw regex absent.
        self.assertIn("rm -rf (recursive delete)", ctx)
        self.assertNotIn(r"\b", ctx)
        self.assertNotIn(r"\s+", ctx)
        # Neither branch leaks tool names.
        for forbidden in ("memory_remember", "memory_batch"):
            self.assertNotIn(forbidden, ctx)

    # ─── Scenario 7: innocuous prompt produces no output ──────────────────

    def test_no_trigger_no_output(self):
        exit_code, stdout, _stderr = run_hook("hello world")
        self.assertEqual(exit_code, 0)
        self.assertEqual(stdout, "")

    # ─── Scenario 8: malformed JSON on stdin is a silent no-op ────────────

    def test_malformed_json_is_noop(self):
        exit_code, stdout, _stderr = run_hook_raw("not json")
        self.assertEqual(exit_code, 0)
        self.assertEqual(stdout, "")

    # ─── Scenario 9: empty stdin is a silent no-op ────────────────────────

    def test_empty_stdin_is_noop(self):
        exit_code, stdout, _stderr = run_hook_raw("")
        self.assertEqual(exit_code, 0)
        self.assertEqual(stdout, "")

    # ─── Scenario 10: structural assertions on PATTERN_LABELS ──────────────

    def test_pattern_labels_covers_every_destructive_pattern(self):
        """Pattern_labels must be in lockstep with DESTRUCTIVE_PATTERNS.

        The hook itself asserts this at import time (fail-fast). This test
        makes the contract explicit for reviewers and would fail loudly if
        a future PR adds a pattern without a label.
        """
        self.assertTrue(hasattr(HOOK_MODULE, "PATTERN_LABELS"),
                        msg="Hook is missing PATTERN_LABELS dict")
        self.assertEqual(
            set(HOOK_MODULE.DESTRUCTIVE_PATTERNS),
            set(HOOK_MODULE.PATTERN_LABELS.keys()),
            msg=(
                "Every DESTRUCTIVE_PATTERN must have a PATTERN_LABELS entry "
                "(and vice versa). Add or remove together."
            ),
        )
        # Every label is a non-empty human-readable string with no raw
        # regex escapes.
        for pattern, label in HOOK_MODULE.PATTERN_LABELS.items():
            with self.subTest(pattern=pattern):
                self.assertIsInstance(label, str)
                self.assertGreater(len(label), 0)
                self.assertNotIn(r"\b", label)
                self.assertNotIn(r"\s", label)
                self.assertNotIn("(?:", label)


if __name__ == "__main__":
    unittest.main()
