"""Tests for the okf-normalize migration (services/okf_normalize.py).

All temp dirs; never touches a real install. Proves the safety contract:
dry-run mutates nothing, apply adds frontmatter while preserving bodies exactly,
backups are taken, the run is idempotent, and files that already conform are
left alone.
"""

import tempfile
from pathlib import Path

import pytest

from claudia_memory import okf
from claudia_memory.services import okf_normalize as onm


@pytest.fixture
def install():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "people").mkdir()
        (root / "projects").mkdir()
        (root / "context").mkdir()
        (root / ".claude" / "skills").mkdir(parents=True)
        yield root


def _write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


# ── dry-run purity ───────────────────────────────────────────────


def test_dry_run_mutates_nothing(install):
    f = install / "people" / "sarah-chen.md"
    original = "# Sarah Chen\n\nVP Engineering.\n"
    _write(f, original)

    plan = onm.plan_okf_normalize(install)

    assert f.read_text(encoding="utf-8") == original      # untouched on disk
    assert not (install / "people" / "index.md").exists()  # no index written
    assert plan.has_changes()
    changed = plan.changed_files()
    assert len(changed) == 1
    assert changed[0].action == "add"
    assert changed[0].type == "person"        # inferred from people/
    assert changed[0].title == "Sarah Chen"   # from the # heading


# ── apply: add frontmatter, preserve body ────────────────────────


def test_apply_adds_frontmatter_and_preserves_body(install):
    f = install / "people" / "sarah-chen.md"
    original = "# Sarah Chen\n\nVP Engineering.\n\n---\nA horizontal rule in the body.\n"
    _write(f, original)

    plan = onm.plan_okf_normalize(install)
    onm.apply_okf_normalize(plan, backup_root=install.parent / "bk")

    new_text = f.read_text(encoding="utf-8")
    data, body = okf.parse_frontmatter(new_text)
    assert data["type"] == "person"
    assert data["title"] == "Sarah Chen"
    assert data.get("timestamp")
    # Body preserved byte-for-byte (the whole original became the body).
    assert new_text.endswith(original)
    assert original in new_text


def test_apply_infers_type_by_directory(install):
    _write(install / "people" / "a.md", "# A\n")
    _write(install / "projects" / "b.md", "# B\n")
    _write(install / "context" / "me.md", "# Me\n")

    plan = onm.plan_okf_normalize(install)
    onm.apply_okf_normalize(plan, backup_root=install.parent / "bk")

    assert okf.parse_frontmatter((install / "people" / "a.md").read_text())[0]["type"] == "person"
    assert okf.parse_frontmatter((install / "projects" / "b.md").read_text())[0]["type"] == "project"
    assert okf.parse_frontmatter((install / "context" / "me.md").read_text())[0]["type"] == "context"


# ── existing frontmatter: add missing core, remove nothing ───────


def test_normalizes_partial_frontmatter_without_removing_fields(install):
    f = install / "people" / "mike.md"
    _write(f, "---\nname: Mike\ncustom_field: keepme\n---\n# Mike Johnson\n\nTech lead.\n")

    plan = onm.plan_okf_normalize(install)
    fa = next(x for x in plan.files if x.path == f)
    assert fa.action == "normalize"

    onm.apply_okf_normalize(plan, backup_root=install.parent / "bk")
    data, body = okf.parse_frontmatter(f.read_text(encoding="utf-8"))
    assert data["type"] == "person"          # added (was missing)
    assert data["title"] == "Mike Johnson"   # added from heading
    assert data["name"] == "Mike"            # kept
    assert data["custom_field"] == "keepme"  # kept, nothing removed
    assert "# Mike Johnson" in body          # body intact


def test_conformant_files_are_skipped(install):
    f = install / "people" / "already.md"
    original = "---\ntype: person\ntitle: Already Done\n---\n# Already Done\n"
    _write(f, original)

    plan = onm.plan_okf_normalize(install)
    fa = next(x for x in plan.files if x.path == f)
    assert fa.action == "skip"

    onm.apply_okf_normalize(plan, backup_root=install.parent / "bk")
    assert f.read_text(encoding="utf-8") == original  # untouched


# ── idempotency ──────────────────────────────────────────────────


def test_second_run_is_a_noop(install):
    _write(install / "people" / "sarah.md", "# Sarah\n")
    _write(install / "projects" / "site.md", "# Website\n")

    onm.apply_okf_normalize(onm.plan_okf_normalize(install), backup_root=install.parent / "bk1")

    plan2 = onm.plan_okf_normalize(install)
    assert not plan2.has_changes()
    assert plan2.changed_files() == []
    assert plan2.changed_indexes() == []


# ── backups ──────────────────────────────────────────────────────


def test_apply_backs_up_changed_files(install):
    f = install / "people" / "sarah.md"
    original = "# Sarah\n"
    _write(f, original)

    backup_root = install.parent / "okf-backup"
    onm.apply_okf_normalize(onm.plan_okf_normalize(install), backup_root=backup_root)

    backed_up = backup_root / "people" / "sarah.md"
    assert backed_up.exists()
    assert backed_up.read_text(encoding="utf-8") == original  # pre-change copy


# ── index.md ─────────────────────────────────────────────────────


def test_index_md_generated_without_frontmatter(install):
    _write(install / "people" / "sarah-chen.md", "# Sarah Chen\n")
    _write(install / "people" / "mike.md", "# Mike Johnson\n")

    onm.apply_okf_normalize(onm.plan_okf_normalize(install), backup_root=install.parent / "bk")

    idx = install / "people" / "index.md"
    assert idx.exists()
    text = idx.read_text(encoding="utf-8")
    # Reserved index.md carries NO frontmatter (OKF §6).
    data, _ = okf.parse_frontmatter(text)
    assert data == {}
    assert "* [Sarah Chen](sarah-chen.md)" in text
    assert "* [Mike Johnson](mike.md)" in text
    # index.md is itself never listed / never normalized.
    assert "index.md" not in text.split("\n", 1)[1]


def test_reserved_and_non_md_and_dotclaude_are_skipped(install):
    _write(install / "people" / "index.md", "# People\n\n* existing\n")
    _write(install / "people" / "notes.txt", "not markdown\n")
    _write(install / ".claude" / "skills" / "x.md", "# skill config\n")

    plan = onm.plan_okf_normalize(install)
    touched = {f.rel for f in plan.files}
    assert not any("index.md" in t for t in touched)
    assert not any("notes.txt" in t for t in touched)
    assert not any(".claude" in t for t in touched)
