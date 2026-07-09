"""OKF template conformance gate.

This test is what makes "OKF is mandatory for what Claudia writes" enforceable
rather than aspirational. It walks an EXPLICIT allowlist of the template surfaces
Claudia authors from and asserts each OKF frontmatter block is conformant.

Two bars, matching the spec and the plan:

- **Mandatory (all templates):** a non-empty ``type`` drawn from the house
  vocabulary (``okf.TYPE_VOCABULARY``). This is OKF's only hard requirement (§9).
- **House standard (skill-layer templates Claudia authors fresh):** a ``title``
  key present (a real value or an explicit ``[placeholder]``). The 9
  ``workspaces/_templates`` reference files are held to the mandatory bar only;
  per the v1.67 plan they are the reference implementation and are left as-is
  apart from ``type``/timestamp.

Heuristic discovery of every fenced block over-matches (skill config
frontmatter, chat-output examples), so the allowlist is a file -> expected-count
map. That catches BOTH malformed frontmatter (conformance assertions) and
removed frontmatter (the count drops below the expected number). Intentionally
adding or removing a template means updating the count here, on purpose.

Run: ``python3 -m unittest tests.okf.test_template_conventions``
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "memory-daemon"))

from claudia_memory import okf  # noqa: E402

SKILLS = REPO_ROOT / "template-v2" / ".claude" / "skills"
WORKSPACES = REPO_ROOT / "template-v2" / "workspaces" / "_templates"

# Skill-layer files whose fenced (```markdown / ```yaml) blocks that begin with
# `---` are OKF templates Claudia authors. Value = exact expected block count.
FENCED_TEMPLATE_FILES = {
    SKILLS / "structure-generator.md": 24,
    SKILLS / "new-person" / "SKILL.md": 1,
    SKILLS / "capture-meeting" / "SKILL.md": 1,
    SKILLS / "wiki" / "SKILL.md": 1,
    SKILLS / "wiki" / "references" / "page-template.md": 1,
    SKILLS / "archetypes" / "consultant.md": 1,
    SKILLS / "archetypes" / "executive.md": 1,
    SKILLS / "archetypes" / "founder.md": 1,
    SKILLS / "archetypes" / "solo.md": 1,
    SKILLS / "archetypes" / "creator.md": 1,
}

# Whole-file OKF templates: the workspace reference implementation.
WORKSPACE_TEMPLATES = [
    "Agreement.md",
    "Dashboard.md",
    "Deliverable.md",
    "Interview.md",
    "Invoice.md",
    "Meeting.md",
    "Pipeline.md",
    "Theme.md",
    "Timeline.md",
]

_FENCE_RE = re.compile(r"```(?:markdown|yaml)\n(.*?)```", re.DOTALL)


def _fenced_frontmatter_blocks(text):
    """Fenced markdown/yaml blocks whose inner content starts with `---`."""
    out = []
    for inner in _FENCE_RE.findall(text):
        stripped = inner.lstrip("\n")
        if stripped.startswith("---"):
            out.append(stripped)
    return out


class TestTemplateConventions(unittest.TestCase):
    # ── shared assertions ────────────────────────────────────────
    def assert_type_conformant(self, block, where):
        data, _ = okf.parse_frontmatter(block)
        self.assertTrue(data, f"{where}: frontmatter did not parse")
        t = data.get("type")
        self.assertTrue(
            okf.is_conformant(data),
            f"{where}: missing/empty required `type`",
        )
        self.assertIn(
            t,
            okf.TYPE_VOCABULARY,
            f"{where}: type {t!r} not in the house vocabulary",
        )
        return data

    def assert_title_present(self, data, where):
        # "title or an explicit placeholder": the key must be present. An empty
        # string is an explicit placeholder to fill; a `[bracketed]` value too.
        self.assertIn("title", data, f"{where}: no title key (or placeholder)")

    # ── skill-layer templates (type + title) ─────────────────────
    def test_fenced_template_files_conform(self):
        for path, expected in FENCED_TEMPLATE_FILES.items():
            self.assertTrue(path.exists(), f"missing template file: {path}")
            blocks = _fenced_frontmatter_blocks(path.read_text(encoding="utf-8"))
            self.assertEqual(
                len(blocks),
                expected,
                f"{path.name}: expected {expected} OKF frontmatter block(s), "
                f"found {len(blocks)}. If you added/removed a template on "
                f"purpose, update the count in FENCED_TEMPLATE_FILES.",
            )
            for i, block in enumerate(blocks):
                where = f"{path.name}#block{i}"
                data = self.assert_type_conformant(block, where)
                self.assert_title_present(data, where)

    # ── workspace reference implementation (type only) ───────────
    def test_workspace_templates_conform(self):
        for name in WORKSPACE_TEMPLATES:
            path = WORKSPACES / name
            self.assertTrue(path.exists(), f"missing workspace template: {path}")
            self.assert_type_conformant(
                path.read_text(encoding="utf-8"), f"workspaces/_templates/{name}"
            )

    # ── the vocabulary is real ───────────────────────────────────
    def test_vocabulary_covers_authored_and_workspace_types(self):
        for t in ("person", "project", "context", "meeting", "wiki-page"):
            self.assertIn(t, okf.TYPE_VOCABULARY)
        for t in ("workspace-deliverable", "workspace-dashboard"):
            self.assertIn(t, okf.TYPE_VOCABULARY)


if __name__ == "__main__":
    unittest.main()
