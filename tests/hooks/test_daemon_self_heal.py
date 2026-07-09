"""Tests for the daemon self-heal pass in session-health-check.py (Task 10).

Scenarios (all mock urllib + subprocess; no real daemon, no real launchctl):

- daemon up -> _ensure_daemon returns '' and never attempts a restart
- daemon down + macOS + plist + restart recovers -> recovery message
- daemon down + macOS + plist + restart fails -> concrete fix guidance
- daemon down + non-macOS -> guidance only, no launchctl call
- daemon down + macOS + no plist -> guidance only, no launchctl call
- any internal error -> fail-open ('' , never raises)
- messages serialize into valid hook JSON
- _launchd_restart issues launchctl unload then load on the plist
- _daemon_up maps a 200 to True and any error to False

Stdlib-only. Matches the existing tests/hooks/ conventions.
Run: ``python3 tests/hooks/test_daemon_self_heal.py``
"""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
HEALTH_PATH = REPO_ROOT / "template-v2" / ".claude" / "hooks" / "session-health-check.py"


def _load():
    """Import session-health-check.py as a module for direct function calls."""
    spec = importlib.util.spec_from_file_location(
        "session_health_check_selfheal", HEALTH_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestEnsureDaemon(unittest.TestCase):
    def setUp(self):
        self.h = _load()

    def test_daemon_up_returns_empty_and_no_restart(self):
        h = self.h
        with mock.patch.object(h, "_daemon_up", return_value=True), \
             mock.patch.object(h, "_launchd_restart") as restart:
            self.assertEqual(h._ensure_daemon(), "")
            restart.assert_not_called()

    def test_restart_succeeds_returns_recovery(self):
        h = self.h
        with mock.patch.object(h, "_daemon_up", side_effect=[False, True]), \
             mock.patch.object(h, "_is_macos", return_value=True), \
             mock.patch.object(h, "_launchd_restart") as restart, \
             mock.patch.object(h, "LAUNCHD_PLIST") as plist, \
             mock.patch.object(h.time, "sleep"):
            plist.exists.return_value = True
            msg = h._ensure_daemon()
        restart.assert_called_once()
        self.assertIn("restarted it automatically", msg)
        self.assertIn("Memory is available", msg)

    def test_restart_fails_returns_guidance(self):
        h = self.h
        with mock.patch.object(h, "_daemon_up", side_effect=[False, False]), \
             mock.patch.object(h, "_is_macos", return_value=True), \
             mock.patch.object(h, "_launchd_restart") as restart, \
             mock.patch.object(h, "LAUNCHD_PLIST") as plist, \
             mock.patch.object(h.time, "sleep"):
            plist.exists.return_value = True
            msg = h._ensure_daemon()
        restart.assert_called_once()
        self.assertIn("system-health", msg)
        self.assertIn("get-claudia", msg)  # macOS reinstall step

    def test_non_macos_guidance_only_no_launchctl(self):
        h = self.h
        with mock.patch.object(h, "_daemon_up", return_value=False), \
             mock.patch.object(h, "_is_macos", return_value=False), \
             mock.patch.object(h, "_launchd_restart") as restart:
            msg = h._ensure_daemon()
        restart.assert_not_called()
        self.assertIn("system-health", msg)
        self.assertIn("#37", msg)  # Windows/non-macOS known issue

    def test_macos_no_plist_guidance_only(self):
        h = self.h
        with mock.patch.object(h, "_daemon_up", return_value=False), \
             mock.patch.object(h, "_is_macos", return_value=True), \
             mock.patch.object(h, "_launchd_restart") as restart, \
             mock.patch.object(h, "LAUNCHD_PLIST") as plist:
            plist.exists.return_value = False
            msg = h._ensure_daemon()
        restart.assert_not_called()
        self.assertIn("system-health", msg)

    def test_ensure_daemon_never_raises(self):
        h = self.h
        with mock.patch.object(h, "_daemon_up", side_effect=RuntimeError("boom")):
            self.assertEqual(h._ensure_daemon(), "")  # fail-open

    def test_messages_are_valid_hook_json(self):
        h = self.h
        with mock.patch.object(h, "_daemon_up", side_effect=[False, True]), \
             mock.patch.object(h, "_is_macos", return_value=True), \
             mock.patch.object(h, "_launchd_restart"), \
             mock.patch.object(h, "LAUNCHD_PLIST") as plist, \
             mock.patch.object(h.time, "sleep"):
            plist.exists.return_value = True
            msg = h._ensure_daemon()
        payload = json.dumps({"additionalContext": msg})
        self.assertEqual(json.loads(payload)["additionalContext"], msg)


class TestLaunchdRestart(unittest.TestCase):
    def test_restart_issues_unload_then_load(self):
        h = _load()
        calls = []

        def fake_run(cmd, **kw):
            calls.append(cmd)
            return mock.Mock(returncode=0)

        with mock.patch.object(h.subprocess, "run", side_effect=fake_run):
            h._launchd_restart()

        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][:2], ["launchctl", "unload"])
        self.assertEqual(calls[1][:2], ["launchctl", "load"])
        self.assertIn("com.claudia.memory.plist", calls[0][2])
        self.assertIn("com.claudia.memory.plist", calls[1][2])

    def test_restart_never_raises_on_subprocess_error(self):
        h = _load()
        with mock.patch.object(h.subprocess, "run", side_effect=OSError("no launchctl")):
            h._launchd_restart()  # must not raise


class TestDaemonUp(unittest.TestCase):
    def test_true_on_200(self):
        h = _load()

        class Resp:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        with mock.patch.object(h.urllib.request, "urlopen", return_value=Resp()):
            self.assertTrue(h._daemon_up())

    def test_false_on_error(self):
        h = _load()
        with mock.patch.object(h.urllib.request, "urlopen", side_effect=OSError("refused")):
            self.assertFalse(h._daemon_up())


if __name__ == "__main__":
    unittest.main()
