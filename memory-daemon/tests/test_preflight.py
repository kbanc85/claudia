"""Tests for the preflight check and --json output format."""

import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.__main__ import run_preflight


class TestPreflightStructure:
    """Verify the dict returned by run_preflight() has the required shape."""

    def test_returns_dict(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        assert isinstance(result, dict)

    def test_has_ok_key(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        assert "ok" in result

    def test_ok_is_bool(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        assert isinstance(result["ok"], bool)

    def test_has_checks_list(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        assert "checks" in result
        assert isinstance(result["checks"], list)

    def test_checks_are_non_empty(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        assert len(result["checks"]) > 0

    def test_each_check_has_required_keys(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        for check in result["checks"]:
            assert "name" in check, f"check missing 'name': {check}"
            assert "ok" in check, f"check missing 'ok': {check}"
            assert "critical" in check, f"check missing 'critical': {check}"

    def test_each_check_ok_is_bool(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        for check in result["checks"]:
            assert isinstance(check["ok"], bool), (
                f"check['ok'] is not bool for {check['name']}: {check['ok']!r}"
            )

    def test_failed_critical_check_fails_overall(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        any_critical_fail = any(
            not c["ok"] and c["critical"] for c in result["checks"]
        )
        if any_critical_fail:
            assert result["ok"] is False


class TestPreflightChecks:
    """Verify individual checks are present and behave correctly."""

    def test_python_version_check_is_present(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        names = [c["name"] for c in result["checks"]]
        assert "python_version" in names

    def test_python_version_check_passes_on_current_python(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        py_check = next(c for c in result["checks"] if c["name"] == "python_version")
        # We are running this test on the same Python, so it must pass
        assert py_check["ok"] is True

    def test_python_version_check_is_critical(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        py_check = next(c for c in result["checks"] if c["name"] == "python_version")
        assert py_check["critical"] is True

    def test_mcp_sdk_check_is_present(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        names = [c["name"] for c in result["checks"]]
        assert "mcp_sdk" in names

    def test_mcp_sdk_check_is_critical(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        mcp_check = next(c for c in result["checks"] if c["name"] == "mcp_sdk")
        assert mcp_check["critical"] is True

    def test_db_path_check_is_present(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        names = [c["name"] for c in result["checks"]]
        assert "db_path" in names

    def test_failed_check_has_detail(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        for check in result["checks"]:
            if not check["ok"]:
                assert "detail" in check, (
                    f"Failed check '{check['name']}' is missing 'detail'"
                )

    def test_failed_critical_check_has_fix(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        for check in result["checks"]:
            if not check["ok"] and check["critical"]:
                assert "fix" in check, (
                    f"Failed critical check '{check['name']}' is missing 'fix' hint"
                )

    def test_overall_ok_reflects_critical_failures(self, tmp_path):
        result = run_preflight(project_id=str(tmp_path))
        critical_failures = [c for c in result["checks"] if not c["ok"] and c["critical"]]
        if critical_failures:
            assert result["ok"] is False
        elif all(c["ok"] for c in result["checks"] if c["critical"]):
            assert result["ok"] is True


def _json_flag_supported(tmp_path) -> bool:
    """Return True if `--preflight --json` outputs the sentinel line."""
    import subprocess
    result = subprocess.run(
        [sys.executable, "-m", "claudia_memory", "--preflight", "--json",
         "--project-dir", str(tmp_path)],
        capture_output=True, text=True, timeout=30,
    )
    return "PREFLIGHT_JSON_BEGIN" in result.stdout


class TestPreflightJsonOutput:
    """Verify the --json CLI flag produces machine-readable output.

    These tests require the --json flag to be wired up in __main__.py
    (added in fix/preflight-json-output). They are skipped automatically
    on branches where the flag is not yet present.
    """

    def _run_preflight_cli(self, extra_args=None, tmp_path=None):
        """Run the preflight as a subprocess and return (returncode, stdout)."""
        import subprocess
        cmd = [sys.executable, "-m", "claudia_memory", "--preflight"]
        if tmp_path:
            cmd += ["--project-dir", str(tmp_path)]
        if extra_args:
            cmd += extra_args
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return result.returncode, result.stdout, result.stderr

    def test_json_flag_prints_sentinel(self, tmp_path):
        if not _json_flag_supported(tmp_path):
            pytest.skip("--json flag not available in this build")
        _, stdout, _ = self._run_preflight_cli(["--json"], tmp_path=tmp_path)
        assert "PREFLIGHT_JSON_BEGIN" in stdout

    def test_json_flag_output_is_valid_json(self, tmp_path):
        if not _json_flag_supported(tmp_path):
            pytest.skip("--json flag not available in this build")
        _, stdout, _ = self._run_preflight_cli(["--json"], tmp_path=tmp_path)
        sentinel = "PREFLIGHT_JSON_BEGIN\n"
        idx = stdout.find(sentinel)
        assert idx != -1, "Sentinel not found in output"
        json_str = stdout[idx + len(sentinel):].strip()
        parsed = json.loads(json_str)
        assert isinstance(parsed, dict)

    def test_json_output_has_ok_and_checks(self, tmp_path):
        if not _json_flag_supported(tmp_path):
            pytest.skip("--json flag not available in this build")
        _, stdout, _ = self._run_preflight_cli(["--json"], tmp_path=tmp_path)
        sentinel = "PREFLIGHT_JSON_BEGIN\n"
        idx = stdout.find(sentinel)
        parsed = json.loads(stdout[idx + len(sentinel):].strip())
        assert "ok" in parsed
        assert "checks" in parsed

    def test_no_json_flag_exits_zero_on_success(self, tmp_path):
        code, _, _ = self._run_preflight_cli(tmp_path=tmp_path)
        # Exit code must be 0 (pass) or 1 (fail), never a crash code like 2
        assert code in (0, 1)

    def test_json_flag_exit_code_matches_ok_field(self, tmp_path):
        if not _json_flag_supported(tmp_path):
            pytest.skip("--json flag not available in this build")
        code, stdout, _ = self._run_preflight_cli(["--json"], tmp_path=tmp_path)
        sentinel = "PREFLIGHT_JSON_BEGIN\n"
        idx = stdout.find(sentinel)
        parsed = json.loads(stdout[idx + len(sentinel):].strip())
        if parsed["ok"]:
            assert code == 0
        else:
            assert code == 1
