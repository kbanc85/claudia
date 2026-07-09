"""Open Knowledge Format (OKF) schema: the single source of truth.

OKF is Google's open format for agent-authored knowledge: a directory of
markdown files with YAML frontmatter. Spec (v0.1 draft):
https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

Everything Claudia knows about OKF field logic lives here. The spec is a draft
and will churn, so exactly one module absorbs it. Skills and builders cite
docs/okf-conventions.md and route their frontmatter through this module.

Core rules encoded here:
- Exactly one required field: ``type`` (free string, non-empty).
- Recommended, in priority order: ``title``, ``description``, ``resource``,
  ``tags``, ``timestamp`` (ISO 8601).
- Reads are LENIENT: unknown fields tolerated, malformed YAML never raises,
  missing frontmatter is not an error. Consumers must not reject user files.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import yaml

OKF_SPEC_VERSION = "0.1"

# OKF core fields, in spec priority order. ``type`` is the only required one.
CORE_FIELDS = ("type", "title", "description", "resource", "tags", "timestamp")

# The house ``type`` vocabulary. OKF types are free strings, but everything
# Claudia AUTHORS is drawn from this list so the corpus stays self-consistent.
# (Consumers still tolerate any unknown type; this constrains writers only.)
TYPE_VOCABULARY = frozenset(
    {
        # context / relationship / knowledge entities
        "person",
        "project",
        "organization",
        "concept",
        "location",
        "context",
        "meeting",
        "deliverable",
        "commitment-ledger",
        "wiki-page",
        # Claudia's Desk (vault projection)
        "pattern",
        "reflection",
        "session-log",
        "moc",
        # workspace templates (already OKF-shaped reference implementation)
        "workspace-agreement",
        "workspace-dashboard",
        "workspace-deliverable",
        "workspace-interview",
        "workspace-invoice",
        "workspace-meeting",
        "workspace-pipeline",
        "workspace-theme",
        "workspace-timeline",
    }
)


def _is_empty(value: Any) -> bool:
    """OKF-core emptiness: None, empty string, or empty list/tuple is omitted."""
    if value is None:
        return True
    if isinstance(value, str) and value == "":
        return True
    if isinstance(value, (list, tuple)) and len(value) == 0:
        return True
    return False


def build_frontmatter(
    type: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[List[str]] = None,
    timestamp: Optional[str] = None,
    resource: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    """Build a fenced OKF YAML frontmatter block.

    - ``type`` is always emitted first, then the recommended core fields in
      spec priority order, then ``extra`` (Claudia extension fields such as
      ``claudia_id``, ``sync_hash``, ``importance``) in caller order.
    - Empty core fields are omitted. In ``extra``, only ``None`` is skipped so
      meaningful falsy values (``0``, ``False``) survive.
    - Output is deterministic (stable for sync hashing) and values are
      YAML-escaped. Long values (URLs) are never line-wrapped.

    Returns the block including both ``---`` fences, ending in a newline.
    """
    data: "Dict[str, Any]" = {}
    data["type"] = type
    if not _is_empty(title):
        data["title"] = title
    if not _is_empty(description):
        data["description"] = description
    if not _is_empty(resource):
        data["resource"] = resource
    if not _is_empty(tags):
        data["tags"] = list(tags)  # type: ignore[arg-type]
    if not _is_empty(timestamp):
        data["timestamp"] = timestamp
    if extra:
        for key, value in extra.items():
            if value is None:
                continue
            if key in data:
                continue  # core fields win; never duplicate a key
            data[key] = value

    dumped = yaml.safe_dump(
        data,
        sort_keys=False,          # preserve our deterministic insertion order
        default_flow_style=False,  # always block style (an all-scalar mapping
                                   # collapses to inline flow under None)
        allow_unicode=True,
        width=1000,               # never wrap long values (URL integrity)
    )
    # safe_dump ends with a trailing newline; the fences bracket it cleanly.
    return f"---\n{dumped}---\n"


def parse_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    """Parse a leading OKF frontmatter block. Lenient by contract.

    Returns ``(frontmatter_dict, body)``. Guarantees:
    - Returns ``({}, text)`` when there is no parseable ``---`` block.
    - Never raises on malformed YAML (returns ``({}, body)`` best-effort).
    - Tolerates and preserves unknown fields.
    - ``body`` is the exact substring after the closing fence (byte-for-byte),
      so callers can add frontmatter without disturbing content.
    """
    if not isinstance(text, str) or not text:
        return {}, text

    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return {}, text

    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            raw_yaml = "".join(lines[1:i])
            body = "".join(lines[i + 1:])
            try:
                parsed = yaml.safe_load(raw_yaml)
            except Exception:
                parsed = None
            if not isinstance(parsed, dict):
                return {}, body
            return parsed, body

    # No closing fence: treat the whole thing as body (lenient).
    return {}, text


def normalize(
    existing: Dict[str, Any],
    type: Optional[str] = None,
    title: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """Additively add missing OKF core fields to an existing frontmatter dict.

    - Never overwrites a field the file already has (existing values win).
    - Never removes or touches extension/unknown fields.
    - Never mutates the input; returns a new dict.
    """
    result: "Dict[str, Any]" = dict(existing)
    if _is_empty(result.get("type")) and not _is_empty(type):
        result["type"] = type
    if _is_empty(result.get("title")) and not _is_empty(title):
        result["title"] = title
    if _is_empty(result.get("timestamp")) and not _is_empty(timestamp):
        result["timestamp"] = timestamp
    return result


def render_frontmatter(data: Dict[str, Any]) -> str:
    """Emit a frontmatter dict (e.g. the output of :func:`normalize`) as a
    fenced OKF block, with core fields ordered first and extensions after.

    Used by the migration to re-emit a normalized file's frontmatter without
    losing any extension fields.
    """
    core = {k: data[k] for k in CORE_FIELDS if k in data and not _is_empty(data[k])}
    extra = {k: v for k, v in data.items() if k not in CORE_FIELDS}
    return build_frontmatter(
        type=core.get("type", ""),
        title=core.get("title"),
        description=core.get("description"),
        tags=core.get("tags"),
        timestamp=core.get("timestamp"),
        resource=core.get("resource"),
        extra=extra,
    )


def is_conformant(data: Dict[str, Any]) -> bool:
    """A frontmatter dict is OKF-conformant iff it has a non-empty ``type``."""
    return isinstance(data, dict) and not _is_empty(data.get("type"))
