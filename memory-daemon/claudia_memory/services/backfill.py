"""Entity-link backfill command (Proposal #51).

The pre-v1.58 write path linked entities to memories *most* of the time
but auto-created organisations as type=person and could miss entities
referenced only in the content (no ``about_entities`` array supplied).

This module scans existing memories that have no entity links and
proposes new entity creations + ``memory_entities`` rows. Two phases:

* ``plan_backfill(db)`` -- pure read. Returns a :class:`BackfillPlan`
  with everything it would do. No writes.
* ``apply_backfill(db, plan, backup_path)`` -- writes. **First** creates
  a SQLite backup at ``backup_path``. If backup fails, raises BEFORE
  any DB modification.

CLI entry points live in ``claudia_memory/__main__.py``:
``claudia-memory --backfill-entities`` (dry-run; default) and
``claudia-memory --backfill-entities --apply``.

No new deps. No schema migrations. Idempotent on re-apply.
"""

from __future__ import annotations

import logging
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .entities import infer_entity_type

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Plan / Result dataclasses
# ---------------------------------------------------------------------------


@dataclass
class BackfillPlan:
    """Read-only plan of what apply_backfill would do.

    Attributes:
        orphan_count: number of memory rows with zero memory_entities links
            that the planner thinks SHOULD have at least one link.
        proposed_entities: list of dicts ``{"name": str, "inferred_type":
            str, "memory_ids": [int, ...]}``. Each dict represents a name
            we detected in memory content for which we will (a) create the
            entity if missing, (b) link it to those memories.
        scanned_memories: total memories the planner looked at.
    """

    orphan_count: int = 0
    proposed_entities: List[Dict[str, Any]] = field(default_factory=list)
    scanned_memories: int = 0


@dataclass
class BackfillResult:
    """Counts of writes performed by apply_backfill."""

    entities_created: int = 0
    entities_reused: int = 0
    links_created: int = 0
    backup_path: Optional[Path] = None


# ---------------------------------------------------------------------------
# Name detection -- intentionally conservative
# ---------------------------------------------------------------------------

# Two or more capitalised words: a reasonable signal for proper nouns.
# We won't catch single-word entities like "Acme" here -- that prevents a
# flood of false positives like "The", "She", "Monday" at sentence starts.
_PROPER_NOUN_RE = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b")

# Things we never want to propose as entity names.
_STOPWORDS = frozenset(
    {
        "Project",  # Without a following noun, this is the keyword itself.
        "Inc",
        "LLC",
        "Corp",
        "AI",
        "Ltd",
        "Co",
    }
)


def _candidate_names(content: str) -> List[str]:
    """Extract proper-noun candidate names from memory content.

    Returns a list of unique, order-preserved candidates.
    """
    if not content:
        return []

    seen: Dict[str, None] = {}
    for match in _PROPER_NOUN_RE.finditer(content):
        raw = match.group(1).strip()
        # Reject single-token stopwords we accidentally captured.
        if raw in _STOPWORDS:
            continue
        seen.setdefault(raw, None)
    return list(seen.keys())


# ---------------------------------------------------------------------------
# Phase 1: plan_backfill (NO writes)
# ---------------------------------------------------------------------------


def plan_backfill(db) -> BackfillPlan:
    """Scan memories with no entity links and propose new links.

    Args:
        db: The Database object (sqlite wrapper).

    Returns:
        A :class:`BackfillPlan`. The caller can inspect ``orphan_count``
        and ``proposed_entities`` before deciding to ``--apply``.

    This function MUST NOT write to the database. Tests assert this.
    """
    plan = BackfillPlan()

    # Find memories that have no entity link at all and have content
    # that looks like it mentions someone or something.
    rows = db.execute(
        """
        SELECT m.id, m.content
        FROM memories m
        LEFT JOIN memory_entities me ON m.id = me.memory_id
        WHERE me.memory_id IS NULL
          AND m.invalidated_at IS NULL
          AND m.content IS NOT NULL
        """,
        fetch=True,
    ) or []

    plan.scanned_memories = len(rows)
    if not rows:
        return plan

    # name -> {"inferred_type": str, "memory_ids": [int]}
    by_name: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        memory_id = row["id"]
        content = row["content"]
        names = _candidate_names(content)
        if not names:
            continue
        plan.orphan_count += 1
        for name in names:
            entry = by_name.setdefault(
                name,
                {
                    "name": name,
                    "inferred_type": infer_entity_type(name, content),
                    "memory_ids": [],
                },
            )
            entry["memory_ids"].append(memory_id)

    plan.proposed_entities = list(by_name.values())
    return plan


# ---------------------------------------------------------------------------
# Phase 2: apply_backfill (WRITES, but only after a successful backup)
# ---------------------------------------------------------------------------


def _create_backup(db, backup_path: Path) -> Path:
    """Write a SQLite-native backup of ``db`` to ``backup_path``.

    Uses :meth:`sqlite3.Connection.backup` for crash-consistent copy.
    Creates parent directories. Raises on any failure so the caller can
    abort the apply before touching the main DB.
    """
    backup_path = Path(backup_path)
    backup_path.parent.mkdir(parents=True, exist_ok=True)

    # The Database wrapper exposes a thread-local connection via
    # ``_get_connection``. We do not capture it as a long-lived
    # attribute -- always ask the wrapper for the live one.
    if hasattr(db, "_get_connection"):
        source_conn = db._get_connection()  # noqa: SLF001
    elif hasattr(db, "conn"):
        source_conn = db.conn
    else:
        raise RuntimeError(
            "Cannot create backup: db has no _get_connection or conn attribute"
        )

    target = sqlite3.connect(str(backup_path))
    try:
        source_conn.backup(target)
    finally:
        target.close()

    if not backup_path.exists() or backup_path.stat().st_size == 0:
        raise RuntimeError(f"Backup file at {backup_path} is missing or empty")

    return backup_path


def _ensure_entity_for_backfill(
    db, name: str, entity_type: str
) -> tuple[int, bool]:
    """Return (entity_id, created_now).

    Looks up by canonical_name (lowercased). Returns the existing id
    if found, else inserts a new row. Does not touch embeddings (the
    main daemon's normal flow will pick those up on next access).
    """
    canonical = name.lower().strip()
    existing = db.get_one(
        "entities",
        where="canonical_name = ?",
        where_params=(canonical,),
    )
    if existing:
        return existing["id"], False

    now = datetime.utcnow().isoformat()
    new_id = db.insert(
        "entities",
        {
            "name": name,
            "type": entity_type,
            "canonical_name": canonical,
            "importance": 1.0,
            "created_at": now,
            "updated_at": now,
        },
    )
    return new_id, True


def apply_backfill(db, plan: BackfillPlan, backup_path: Path) -> BackfillResult:
    """Apply the plan after first taking a SQLite backup.

    Args:
        db: Database wrapper.
        plan: A :class:`BackfillPlan` from :func:`plan_backfill`.
        backup_path: Where to write the SQLite backup. Required.

    Returns:
        A :class:`BackfillResult` with counts.

    Raises:
        Anything raised by :func:`_create_backup`. If the backup step
        fails, NO writes are performed.
    """
    backup_path = Path(backup_path)

    # Backup MUST come first. If it fails, abort before any DB write.
    created_backup = _create_backup(db, backup_path)
    logger.info("Backfill: backup created at %s", created_backup)

    result = BackfillResult(backup_path=created_backup)

    for proposal in plan.proposed_entities:
        name = proposal["name"]
        entity_type = proposal["inferred_type"]
        memory_ids = proposal["memory_ids"]

        entity_id, created_now = _ensure_entity_for_backfill(db, name, entity_type)
        if created_now:
            result.entities_created += 1
        else:
            result.entities_reused += 1

        for memory_id in memory_ids:
            try:
                db.insert(
                    "memory_entities",
                    {
                        "memory_id": memory_id,
                        "entity_id": entity_id,
                        "relationship": "about",
                    },
                )
                result.links_created += 1
            except Exception as e:
                # Duplicate link (memory already has it) is harmless.
                logger.debug(
                    "Backfill: skipping duplicate link memory=%s entity=%s: %s",
                    memory_id,
                    entity_id,
                    e,
                )

    logger.info(
        "Backfill applied: %d entities created, %d reused, %d links",
        result.entities_created,
        result.entities_reused,
        result.links_created,
    )
    return result


# ---------------------------------------------------------------------------
# CLI helper: render a plan summary for the dry-run output
# ---------------------------------------------------------------------------


def format_plan_summary(plan: BackfillPlan) -> str:
    """Human-readable summary of a plan (printed in dry-run mode)."""
    lines = [
        "Entity-link backfill plan (dry-run, no writes):",
        f"  Scanned memories without links: {plan.scanned_memories}",
        f"  Memories with orphan name references: {plan.orphan_count}",
        f"  Proposed new/linked entities: {len(plan.proposed_entities)}",
    ]
    if plan.proposed_entities:
        lines.append("")
        lines.append("  By inferred type:")
        type_counts: Dict[str, int] = {}
        for p in plan.proposed_entities:
            type_counts[p["inferred_type"]] = (
                type_counts.get(p["inferred_type"], 0) + 1
            )
        for t, n in sorted(type_counts.items()):
            lines.append(f"    {t}: {n}")
        # Show a small sample so the user can sanity-check.
        sample = plan.proposed_entities[:10]
        lines.append("")
        lines.append("  Sample (first 10):")
        for p in sample:
            lines.append(
                f"    - {p['name']!r} -> {p['inferred_type']} "
                f"({len(p['memory_ids'])} memory link(s))"
            )
    lines.append("")
    lines.append(
        "Run with --apply to write changes. A SQLite backup will be created first."
    )
    return "\n".join(lines)
