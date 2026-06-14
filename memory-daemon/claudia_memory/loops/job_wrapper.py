"""Status-only job wrapper for daemon scheduled jobs (Proposal 11, E5).

Wraps a scheduled job so it writes a status file and flags invariant failures,
without ever changing the job's behavior. This is the "status-only" form of the
daemon wrap: a failed invariant is recorded but does NOT halt the job, and a job
that raises is recorded and then re-raised so the daemon's existing error
handling is preserved.

Each invariant is a ``(name, check)`` pair where ``check(result)`` returns
``(ok: bool, detail: str)``. A check may inspect the job's return value or
external state (a backup file on disk, an entity count); it is deterministic, not
an LLM (see Proposal 11 Decision D2: the daemon has no agent context).
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

from claudia_memory.loops.status import write_status

Invariant = tuple[str, Callable[[Any], "tuple[bool, str]"]]


def default_loops_dir() -> Path:
    """Where daemon job status files live."""
    return Path.home() / ".claudia" / "loops"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_with_status(
    job_id: str,
    fn: Callable[[], Any],
    invariants: Iterable[Invariant] = (),
    status_dir: "str | Path | None" = None,
    now: "str | None" = None,
) -> Any:
    """Run ``fn``, check ``invariants``, write ``<job_id>_status.md``, return result.

    Status-only contract:
    - A failed invariant flags the run (``verified: false``) but does not halt it;
      the job's result is still returned.
    - A job that raises is recorded as unverified and then re-raised, so the
      daemon's existing error handling is unchanged.
    """
    base = Path(status_dir) if status_dir is not None else default_loops_dir()

    error: BaseException | None = None
    result: Any = None
    try:
        result = fn()
    except Exception as e:  # noqa: BLE001 - recorded below, then re-raised
        error = e

    checks: list[tuple[str, bool, str]] = []
    if error is None:
        for name, check in invariants:
            try:
                ok, detail = check(result)
            except Exception as e:  # noqa: BLE001 - a raising check is a failed check
                ok, detail = False, f"invariant raised: {e!r}"
            checks.append((name, bool(ok), str(detail)))

    verified = error is None and all(ok for _, ok, _ in checks)
    summary, body = _format_verdict(job_id, error, checks)

    write_status(
        base / f"{job_id}_status.md",
        {
            "loop_id": job_id,
            "verified": verified,
            "checker_verdict": summary,
            "next_action": "none" if verified else "review flagged job run",
            "updated_at": now or _now_iso(),
        },
        body=body,
    )

    if error is not None:
        raise error
    return result


def _format_verdict(job_id: str, error: "BaseException | None", checks) -> "tuple[str, str]":
    if error is not None:
        summary = f"job raised {type(error).__name__}: {error}"
        return summary, f"# Loop status: {job_id}\n\n{summary}"

    failed = [(name, detail) for name, ok, detail in checks if not ok]
    if not checks:
        summary = "ran; no invariants defined"
    elif not failed:
        summary = f"all {len(checks)} invariant(s) held"
    else:
        names = ", ".join(name for name, _ in failed)
        summary = f"{len(failed)} of {len(checks)} invariant(s) failed: {names}"

    lines = [f"# Loop status: {job_id}", "", summary]
    if failed:
        lines.append("")
        lines.extend(f"- {name}: {detail}" for name, detail in failed)
    return summary, "\n".join(lines)
