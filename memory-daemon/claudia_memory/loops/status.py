"""Atomic status-file helper for loop engineering (Proposal 11, E1/B3).

A status file is Markdown with a YAML frontmatter block. The frontmatter carries
the structured control fields (loop_id, verified, checker_verdict, next_action,
...) and the body carries the human-readable narrative:

    ---
    loop_id: consolidation
    verified: true
    next_action: none
    ---

    # Loop status: consolidation

    Last run consolidated 12 memories; all invariants held.

Writes go through a temp file in the same directory followed by ``os.replace``,
so an interrupted write never leaves a partially-written file at the canonical
path. A reader sees either the complete previous file or the complete new one.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

_DELIM = "---"


def write_status(path: str | os.PathLike, fields: dict[str, Any], body: str = "") -> None:
    """Atomically write a status file at ``path``.

    Serializes ``fields`` as YAML frontmatter and appends ``body`` as the
    Markdown body. Creates missing parent directories. If the final rename
    fails, the canonical path is left untouched and the temp file is removed.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)

    frontmatter = yaml.safe_dump(fields, sort_keys=False, default_flow_style=False).strip()
    content = f"{_DELIM}\n{frontmatter}\n{_DELIM}\n\n{body}"

    # Temp file lives in the SAME directory as the target so that os.replace is
    # a same-filesystem rename (atomic), not a cross-device copy.
    tmp = target.with_name(f".{target.name}.tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, target)
    except BaseException:
        # Any failure (including the rename) must leave the canonical path
        # intact and must not litter the directory with a temp file.
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def read_status(path: str | os.PathLike) -> tuple[dict[str, Any], str]:
    """Read a status file, returning ``(fields, body)``.

    ``fields`` is the parsed frontmatter (empty dict if there is none); ``body``
    is the Markdown body with the single separating blank line removed.
    """
    text = Path(path).read_text(encoding="utf-8")
    return _split_frontmatter(text)


def _split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith(_DELIM):
        return {}, text
    rest = text[len(_DELIM):].lstrip("\n")
    end = rest.find(f"\n{_DELIM}")
    if end == -1:
        return {}, text
    raw = rest[:end]
    body = rest[end + 1 + len(_DELIM):].lstrip("\n")
    fields = yaml.safe_load(raw) or {}
    return fields, body
