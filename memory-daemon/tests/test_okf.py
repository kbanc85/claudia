"""Tests for the shared OKF schema module (claudia_memory.okf).

OKF = Google's Open Knowledge Format v0.1 (draft). This module is the single
place all OKF field logic lives, so the spec (which will churn) is absorbed by
exactly one file. See docs/okf-conventions.md.
"""

import pytest

from claudia_memory import okf


def test_spec_version_marker():
    assert okf.OKF_SPEC_VERSION == "0.1"


# ── build_frontmatter ────────────────────────────────────────────


def test_build_minimal_type_first_and_fenced():
    fm = okf.build_frontmatter(type="person")
    lines = fm.splitlines()
    assert lines[0] == "---"
    assert lines[1].startswith("type:")
    assert lines[-1] == "---"
    data, body = okf.parse_frontmatter(fm)
    assert data == {"type": "person"}
    assert body == ""


def test_build_omits_empty_fields():
    fm = okf.build_frontmatter(
        type="person", title="Sarah", description=None, tags=[], timestamp=""
    )
    data, _ = okf.parse_frontmatter(fm)
    assert data == {"type": "person", "title": "Sarah"}


def test_build_core_field_order_is_deterministic():
    kwargs = dict(
        type="project",
        title="X",
        description="d",
        resource="https://example.com/x",
        tags=["a", "b"],
        timestamp="2026-01-01T00:00:00Z",
    )
    fm1 = okf.build_frontmatter(**kwargs)
    fm2 = okf.build_frontmatter(**kwargs)
    assert fm1 == fm2  # deterministic (stable for sync hashing)
    top_keys = [
        ln.split(":", 1)[0]
        for ln in fm1.splitlines()
        if ln and not ln.startswith((" ", "-", "#")) and ":" in ln
    ]
    assert top_keys[:6] == [
        "type",
        "title",
        "description",
        "resource",
        "tags",
        "timestamp",
    ]


def test_build_round_trips_through_parse():
    fm = okf.build_frontmatter(
        type="meeting",
        title="Kickoff: Q3",
        description='He said "go"',
        tags=["x", "y"],
        timestamp="2026-05-28T14:30:00Z",
    )
    data, body = okf.parse_frontmatter(fm + "\n# Body\ncontent\n")
    assert data["type"] == "meeting"
    assert data["title"] == "Kickoff: Q3"
    assert data["description"] == 'He said "go"'
    assert data["tags"] == ["x", "y"]
    assert data["timestamp"] == "2026-05-28T14:30:00Z"
    assert "# Body" in body


def test_build_escapes_colons_and_quotes():
    fm = okf.build_frontmatter(
        type="concept", title="Ratio 3:1", description='Quote: "yes"'
    )
    data, _ = okf.parse_frontmatter(fm)
    assert data["title"] == "Ratio 3:1"
    assert data["description"] == 'Quote: "yes"'


def test_build_does_not_wrap_long_urls():
    long_url = "https://console.example.com/path?a=1&b=2&c=3&d=4&e=5&f=6&g=7&h=8&i=9&j=10&k=verylongvalue"
    fm = okf.build_frontmatter(type="concept", title="T", resource=long_url)
    data, _ = okf.parse_frontmatter(fm)
    assert data["resource"] == long_url  # URL integrity: never line-wrapped


def test_extra_fields_appended_after_core_and_preserve_zero():
    fm = okf.build_frontmatter(
        type="person",
        title="Sarah",
        extra={"claudia_id": 42, "importance": 0, "sync_hash": "abc123def456"},
    )
    data, _ = okf.parse_frontmatter(fm)
    assert data["type"] == "person"
    assert data["claudia_id"] == 42
    assert data["importance"] == 0  # falsy-but-meaningful value preserved
    assert data["sync_hash"] == "abc123def456"
    top_keys = [
        ln.split(":", 1)[0]
        for ln in fm.splitlines()
        if ln and not ln.startswith((" ", "-", "#")) and ":" in ln
    ]
    assert top_keys.index("type") < top_keys.index("claudia_id")
    assert top_keys.index("title") < top_keys.index("claudia_id")


def test_extra_none_values_skipped():
    fm = okf.build_frontmatter(type="person", extra={"a": None, "b": "keep"})
    data, _ = okf.parse_frontmatter(fm)
    assert "a" not in data
    assert data["b"] == "keep"


def test_build_no_bare_dash_fence_inside_block():
    # A value containing --- must not emit a bare '---' line that would corrupt
    # split("---", 2)-style body extraction used by vault_sync.
    fm = okf.build_frontmatter(
        type="concept", title="a---b", description="x --- y"
    )
    inner = fm.splitlines()[1:-1]
    assert all(ln.strip() != "---" for ln in inner)
    data, _ = okf.parse_frontmatter(fm)
    assert data["title"] == "a---b"
    assert data["description"] == "x --- y"


# ── parse_frontmatter (lenient) ──────────────────────────────────


def test_parse_no_block_returns_empty_and_full_text():
    text = "# Just a heading\n\nSome body.\n"
    data, body = okf.parse_frontmatter(text)
    assert data == {}
    assert body == text


def test_parse_malformed_yaml_never_raises():
    text = "---\ntype: person\n bad: : : indent\n\t- broken: [\n---\n# Body\n"
    data, body = okf.parse_frontmatter(text)  # must not raise
    assert isinstance(data, dict)
    assert "# Body" in body


def test_parse_tolerates_unknown_fields():
    text = "---\ntype: widget\nfoo_bar: 99\nnested:\n  - a\n  - b\n---\nbody\n"
    data, body = okf.parse_frontmatter(text)
    assert data["type"] == "widget"
    assert data["foo_bar"] == 99
    assert data["nested"] == ["a", "b"]
    assert body.strip() == "body"


def test_parse_no_closing_fence_is_lenient():
    text = "---\ntype: person\nstill going\nand going\n"
    data, body = okf.parse_frontmatter(text)
    assert data == {}
    assert body == text


def test_parse_preserves_body_byte_for_byte():
    body_in = "# Title\n\nLine 1\nLine 2 with trailing spaces   \n\n---\nHR below\n"
    fm = okf.build_frontmatter(type="concept", title="T")
    full = fm + body_in
    _, body_out = okf.parse_frontmatter(full)
    assert body_out == body_in


def test_parse_non_dict_frontmatter_is_lenient():
    text = "---\n- just\n- a\n- list\n---\nbody\n"
    data, body = okf.parse_frontmatter(text)
    assert data == {}
    assert "body" in body


# ── normalize (additive) ─────────────────────────────────────────


def test_normalize_adds_missing_core_keeps_extensions():
    existing = {"name": "Sarah", "claudia_id": 7, "importance": 3}
    out = okf.normalize(
        existing, type="person", title="Sarah", timestamp="2026-01-01T00:00:00Z"
    )
    assert out["type"] == "person"
    assert out["title"] == "Sarah"
    assert out["timestamp"] == "2026-01-01T00:00:00Z"
    assert out["name"] == "Sarah"
    assert out["claudia_id"] == 7
    assert out["importance"] == 3


def test_normalize_does_not_overwrite_existing_core():
    existing = {"type": "custom-type", "title": "Original"}
    out = okf.normalize(
        existing, type="person", title="New", timestamp="2026-01-01T00:00:00Z"
    )
    assert out["type"] == "custom-type"
    assert out["title"] == "Original"
    assert out["timestamp"] == "2026-01-01T00:00:00Z"


def test_normalize_does_not_mutate_input():
    existing = {"name": "Sarah"}
    okf.normalize(existing, type="person", title="Sarah", timestamp=None)
    assert existing == {"name": "Sarah"}


# ── vocabulary ───────────────────────────────────────────────────


def test_type_vocabulary_has_house_types():
    for t in [
        "person",
        "project",
        "organization",
        "concept",
        "location",
        "context",
        "meeting",
        "deliverable",
        "pattern",
        "reflection",
        "session-log",
        "moc",
        "wiki-page",
        "commitment-ledger",
    ]:
        assert t in okf.TYPE_VOCABULARY


def test_type_vocabulary_has_workspace_types():
    for t in [
        "workspace-agreement",
        "workspace-dashboard",
        "workspace-deliverable",
        "workspace-interview",
        "workspace-invoice",
        "workspace-meeting",
        "workspace-pipeline",
        "workspace-theme",
        "workspace-timeline",
    ]:
        assert t in okf.TYPE_VOCABULARY
