"""okf-normalize: bring an existing install's knowledge files up to OKF.

Additive and reversible by construction:
- It only ADDS frontmatter; body content is preserved byte-for-byte.
- Dry-run by default (``plan_okf_normalize`` reads only); ``apply_okf_normalize``
  backs every file it changes up to a timestamped dir before writing.
- Idempotent: a file that already has a non-empty ``type`` is left untouched, so
  a second run changes nothing.

See docs/okf-conventions.md. All OKF field logic lives in ``claudia_memory.okf``.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .. import okf

# Top-level knowledge directories to walk, mapped to the type inferred for the
# files they contain. Anything else falls back to ``concept``.
DIR_TYPE: Dict[str, str] = {
    "people": "person",
    "projects": "project",
    "context": "context",
    "clients": "organization",
    "pipeline": "context",
    "finances": "context",
    "accountability": "commitment-ledger",
    "insights": "context",
}
DEFAULT_TYPE = "concept"
KNOWLEDGE_DIRS: Tuple[str, ...] = tuple(DIR_TYPE.keys())

# OKF reserved filenames: listings/history, never concept documents.
RESERVED_FILENAMES = {"index.md", "log.md"}


@dataclass
class FileAction:
    path: Path
    rel: str                       # path relative to project_dir, for display
    action: str                    # 'add' | 'normalize' | 'skip'
    type: str
    title: str
    description: Optional[str]
    new_content: Optional[str]     # bytes to write; None when action == 'skip'


@dataclass
class IndexAction:
    path: Path
    rel: str
    new_content: str
    changed: bool                  # True when the file is absent or differs


@dataclass
class NormalizePlan:
    project_dir: Path
    files: List[FileAction] = field(default_factory=list)
    indexes: List[IndexAction] = field(default_factory=list)

    def changed_files(self) -> List[FileAction]:
        return [f for f in self.files if f.action != "skip"]

    def changed_indexes(self) -> List[IndexAction]:
        return [i for i in self.indexes if i.changed]

    def has_changes(self) -> bool:
        return bool(self.changed_files() or self.changed_indexes())


def _infer_type(project_dir: Path, path: Path) -> str:
    """Type from the file's top-level knowledge directory."""
    try:
        top = path.relative_to(project_dir).parts[0]
    except (ValueError, IndexError):
        return DEFAULT_TYPE
    return DIR_TYPE.get(top, DEFAULT_TYPE)


def _infer_title(body: str, path: Path) -> str:
    """First ``# `` heading in the body, else a humanized filename."""
    for line in body.splitlines():
        s = line.strip()
        if s.startswith("# "):
            return s[2:].strip()
    stem = path.stem.replace("-", " ").replace("_", " ").strip()
    return stem.title() if stem else path.stem


def _mtime_iso(path: Path) -> str:
    ts = path.stat().st_mtime
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _plan_file(project_dir: Path, path: Path) -> FileAction:
    rel = str(path.relative_to(project_dir))
    text = path.read_text(encoding="utf-8")
    data, body = okf.parse_frontmatter(text)

    inferred_type = _infer_type(project_dir, path)

    if okf.is_conformant(data):
        # Already has a non-empty type: leave it entirely alone (idempotent).
        title = data.get("title") or _infer_title(body, path)
        return FileAction(
            path=path, rel=rel, action="skip",
            type=data.get("type"), title=title,
            description=data.get("description"), new_content=None,
        )

    title = _infer_title(body, path)
    timestamp = _mtime_iso(path)

    if not data:
        # No frontmatter at all: add a fresh block, keep the whole file as body.
        fm = okf.build_frontmatter(type=inferred_type, title=title, timestamp=timestamp)
        sep = "" if (not text or text.startswith("\n")) else "\n"
        new_content = fm + sep + text
        return FileAction(
            path=path, rel=rel, action="add",
            type=inferred_type, title=title, description=None,
            new_content=new_content,
        )

    # Has frontmatter but no conformant type: add missing OKF core, keep the
    # rest, preserve the body exactly.
    normalized = okf.normalize(data, type=inferred_type, title=title, timestamp=timestamp)
    fm = okf.render_frontmatter(normalized)
    new_content = fm + body
    return FileAction(
        path=path, rel=rel, action="normalize",
        type=normalized.get("type"), title=normalized.get("title") or title,
        description=normalized.get("description"), new_content=new_content,
    )


def _index_content(dir_path: Path, entries: List[Tuple[str, str, Optional[str]]]) -> str:
    """OKF §6 index.md: NO frontmatter, one bullet per file."""
    heading = dir_path.name.replace("-", " ").replace("_", " ").strip().title() or dir_path.name
    lines = [f"# {heading}", ""]
    for filename, title, desc in entries:
        if desc:
            lines.append(f"* [{title}]({filename}) - {desc}")
        else:
            lines.append(f"* [{title}]({filename})")
    return "\n".join(lines) + "\n"


def plan_okf_normalize(project_dir: Path) -> NormalizePlan:
    """Read-only. Compute what okf-normalize WOULD change. Mutates nothing."""
    project_dir = Path(project_dir)
    plan = NormalizePlan(project_dir=project_dir)

    # Resolved (title, description) per directory, for index generation.
    by_dir: Dict[Path, List[Tuple[str, str, Optional[str]]]] = {}

    for top in KNOWLEDGE_DIRS:
        root = project_dir / top
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*.md")):
            if not path.is_file():
                continue
            if path.name in RESERVED_FILENAMES:
                continue
            # Defensive: never touch a nested .claude config tree.
            if ".claude" in path.relative_to(project_dir).parts:
                continue
            fa = _plan_file(project_dir, path)
            plan.files.append(fa)
            by_dir.setdefault(path.parent, []).append(
                (path.name, fa.title, fa.description)
            )

    for dir_path, entries in sorted(by_dir.items()):
        entries_sorted = sorted(entries, key=lambda e: e[0])
        content = _index_content(dir_path, entries_sorted)
        idx_path = dir_path / "index.md"
        existing = idx_path.read_text(encoding="utf-8") if idx_path.exists() else None
        plan.indexes.append(
            IndexAction(
                path=idx_path,
                rel=str(idx_path.relative_to(project_dir)),
                new_content=content,
                changed=(existing != content),
            )
        )

    return plan


def format_plan_summary(plan: NormalizePlan) -> str:
    changed = plan.changed_files()
    changed_idx = plan.changed_indexes()
    lines = [f"OKF normalize plan for {plan.project_dir}", ""]
    if not changed and not changed_idx:
        lines.append("Everything is already OKF-conformant. Nothing to do.")
        return "\n".join(lines)
    adds = [f for f in changed if f.action == "add"]
    norms = [f for f in changed if f.action == "normalize"]
    lines.append(f"Files to add frontmatter:  {len(adds)}")
    lines.append(f"Files to normalize:        {len(norms)}")
    lines.append(f"index.md to write/update:  {len(changed_idx)}")
    skipped = len(plan.files) - len(changed)
    lines.append(f"Already conformant (skip): {skipped}")
    lines.append("")
    for f in changed:
        lines.append(f"  [{f.action:9}] {f.rel}  (type: {f.type})")
    for i in changed_idx:
        lines.append(f"  [index    ] {i.rel}")
    return "\n".join(lines)


def apply_okf_normalize(
    plan: NormalizePlan, backup_root: Optional[Path] = None
) -> Dict[str, object]:
    """Write the planned changes. Backs up every changed file first.

    ``backup_root`` is the directory backups are copied into (the CLI passes
    ``~/.claudia/backups/okf-normalize-<date>/``). Bodies are preserved
    byte-for-byte; a skip-action file is never touched.
    """
    project_dir = plan.project_dir
    stats: Dict[str, object] = {
        "files_added": 0,
        "files_normalized": 0,
        "indexes_written": 0,
        "backup_dir": str(backup_root) if backup_root else None,
    }

    changed = plan.changed_files()
    changed_idx = plan.changed_indexes()

    if backup_root is not None and (changed or changed_idx):
        backup_root = Path(backup_root)
        backup_root.mkdir(parents=True, exist_ok=True)

    def _backup(path: Path) -> None:
        if backup_root is None or not path.exists():
            return
        dest = backup_root / path.relative_to(project_dir)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)

    for f in changed:
        _backup(f.path)
        f.path.write_text(f.new_content, encoding="utf-8")
        if f.action == "add":
            stats["files_added"] = int(stats["files_added"]) + 1
        else:
            stats["files_normalized"] = int(stats["files_normalized"]) + 1

    for i in changed_idx:
        _backup(i.path)
        i.path.write_text(i.new_content, encoding="utf-8")
        stats["indexes_written"] = int(stats["indexes_written"]) + 1

    return stats
