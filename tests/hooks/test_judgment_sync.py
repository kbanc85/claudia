"""Tests for judgment-sync.py hook.

WHY THIS SUITE IS SHAPED THIS WAY
---------------------------------
The judgment system's failure mode is silence. A rule that stops being applied
produces no error, no warning, and no visible symptom: the only way anyone found
out was an unrelated audit that discovered 27 approved rules had never been
loaded into a single session. So the tests here are weighted toward invariants
("no rule can vanish") rather than formatting.

Scenarios covered:

- P1  Every rule reaches the generated file at some tier. This is THE invariant.
- P2  No third-party import is required; the stdlib fallback parser agrees with
      PyYAML on the same input, including folded block scalars.
- P3  Growth is measurable: token estimate is reported and budget is enforced.
- P4  Failure is loud, never silent, and never fatal to a session start.
- S   Schema tolerance: the format meditate actually writes (rule/context) and
      the format judgment-awareness.md documents (when/action/condition) both
      parse. These diverged in the wild.
- T   Tier assignment is fail-safe: safety sections are never demoted, and an
      unclassified rule is indexed rather than dropped.

Run: ``python3 tests/hooks/test_judgment_sync.py``
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HOOKS_DIR = REPO_ROOT / "template-v2" / ".claude" / "hooks"
HOOK = HOOKS_DIR / "judgment-sync.py"


def load_module():
    """Import the hook despite the hyphen in its filename."""
    spec = importlib.util.spec_from_file_location("judgment_sync", HOOK)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# A fixture that deliberately contains every hard shape found in a real
# judgment.yaml: double-quoted scalars with internal punctuation, folded block
# scalars in both `>` and `>-` form, inline lists, a bare scalar, and both rule
# schemas. If the parser survives this it survives the real file.
FIXTURE = textwrap.dedent('''\
    version: 1

    # A comment that must not be parsed as a rule.

    meta:
      - id: meta-001
        rule: "Meta rules resolve conflicts between other rules; they always load in full."
        source: meditate/2026-05-22
        context: "Written after two rules fired in the same session."
        governs: [esc-001, del-007]

    escalation:
      - id: esc-001
        rule: >-
          Before any externally-visible action, verify prerequisites against a
          primary source and warn about any mismatch BEFORE taking the action.
        source: meditate/2026-04-07
        context: >
          An action went out before its prerequisites were checked, twice in
          one session.
      - id: esc-002
        rule: "Never echo a live secret into chat, even when asked directly."
        source: meditate/2026-06-02

    overrides:
      - id: ov-001
        rule: "Single-page gesture-based sites for anything framed as viral."
        source: meditate/2026-04-08
        domain: design

    process:
      - id: proc-012
        rule: "First introductory calls get conversational talking points, not frameworks."
        source: meditate/2026-05-20
        domain: client
      - id: esc-010
        rule: "An id whose prefix does not match its section. This is real and must not break anything."
        source: meditate/2026-07-01

    delegation:
      - id: del-001
        when: "Multi-system features"
        action: "Execute the full pipeline in one session"
        condition: "User expects end-to-end delivery"
        source: manual
''')

DUPLICATE_FIXTURE = FIXTURE + textwrap.dedent('''\

    surfacing:
      - id: esc-001
        rule: "A second rule answering to an id that already exists."
        source: meditate/2026-08-01
''')


class ParserTests(unittest.TestCase):
    """P2: no third-party dependency, and the fallback must not lose data."""

    def setUp(self):
        self.m = load_module()

    def test_parses_all_sections_and_rules(self):
        sections = self.m.parse_judgment(FIXTURE)
        ids = [r["id"] for rules in sections.values() for r in rules]
        self.assertEqual(len(ids), 7, f"expected 7 rules, parsed {ids}")
        self.assertIn("meta-001", ids, "the meta section must be parsed")

    def test_fallback_parser_agrees_with_pyyaml(self):
        """The stdlib path is not a lesser path. It must agree exactly."""
        try:
            import yaml  # noqa: F401
        except ImportError:
            self.skipTest("PyYAML absent, nothing to compare against")

        via_yaml = self.m._parse_with_pyyaml(FIXTURE)
        via_stdlib = self.m._parse_fallback(FIXTURE)

        self.assertEqual(
            sorted(via_yaml), sorted(via_stdlib), "section names differ"
        )
        for section in via_yaml:
            y = {r["id"]: r for r in via_yaml[section]}
            s = {r["id"]: r for r in via_stdlib[section]}
            self.assertEqual(sorted(y), sorted(s), f"ids differ in {section}")
            for rid in y:
                for field in ("rule", "when", "action", "source"):
                    if field in y[rid]:
                        self.assertEqual(
                            " ".join(str(y[rid][field]).split()),
                            " ".join(str(s.get(rid, {}).get(field, "")).split()),
                            f"{rid}.{field} differs between parsers",
                        )

    def test_malformed_but_recoverable_yaml_is_reported(self):
        """A file the fallback can read but PyYAML cannot is still broken.

        Found the hard way: a mis-indented field was inserted into a real
        judgment.yaml, PyYAML rejected the file, the forgiving fallback read all
        132 rules anyway, and this script cheerfully reported everything fine.
        Resilience that hides corruption is worse than a clean failure, because
        every OTHER tool touching that file will break and nothing said so."""
        bad = FIXTURE.replace(
            '    rule: "Never echo', '      rule: "Never echo'
        )
        try:
            import yaml
            yaml.safe_load(bad)
            self.skipTest("mangled fixture still parses; test is not exercising the path")
        except ImportError:
            self.skipTest("PyYAML absent, nothing to disagree with")
        except Exception:
            pass

        sections, status = self.m.parse_with_status(bad)
        self.assertTrue(
            any(sections.values()), "fallback should still recover the rules"
        )
        self.assertEqual(
            status, "recovered",
            "silently rescued a file that PyYAML rejects",
        )

    def test_clean_yaml_reports_no_recovery(self):
        _sections, status = self.m.parse_with_status(FIXTURE)
        self.assertIsNone(status)

    def test_folded_block_scalars_are_folded_to_one_line(self):
        sections = self.m._parse_fallback(FIXTURE)
        esc = next(r for r in sections["escalation"] if r["id"] == "esc-001")
        self.assertNotIn("\n", esc["rule"].strip())
        self.assertIn("primary source", esc["rule"])

    def test_comments_are_not_rules(self):
        sections = self.m._parse_fallback(FIXTURE)
        for rules in sections.values():
            for r in rules:
                self.assertFalse(str(r.get("id", "")).startswith("#"))

    def test_works_without_pyyaml(self):
        """Simulate a machine with no PyYAML: import must not be required."""
        script = (
            "import sys; sys.modules['yaml'] = None\n"
            f"import importlib.util as u\n"
            f"s = u.spec_from_file_location('js', {str(HOOK)!r})\n"
            "m = u.module_from_spec(s); s.loader.exec_module(m)\n"
            "secs = m.parse_judgment(open(sys.argv[1]).read())\n"
            "print(sum(len(v) for v in secs.values()))\n"
        )
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
            f.write(FIXTURE)
            path = f.name
        out = subprocess.run(
            [sys.executable, "-c", script, path],
            capture_output=True, text=True,
        )
        os.unlink(path)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), "7")


class SchemaTests(unittest.TestCase):
    """S: both schemas that exist in the wild must normalise."""

    def setUp(self):
        self.m = load_module()
        self.sections = self.m.parse_judgment(FIXTURE)

    def test_rule_context_schema(self):
        r = self.m.normalise(
            next(x for x in self.sections["escalation"] if x["id"] == "esc-002")
        )
        self.assertEqual(r["id"], "esc-002")
        self.assertIn("secret", r["text"])

    def test_when_action_schema(self):
        """judgment-awareness.md documents when/action/condition. Support it."""
        r = self.m.normalise(self.sections["delegation"][0])
        self.assertEqual(r["id"], "del-001")
        self.assertTrue(r["text"].strip(), "when/action rule produced empty text")
        self.assertIn("pipeline", r["text"])


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.m = load_module()

    def test_duplicate_ids_detected_across_sections(self):
        sections = self.m.parse_judgment(DUPLICATE_FIXTURE)
        dupes = self.m.duplicate_ids(sections)
        self.assertIn("esc-001", dupes)
        self.assertEqual(sorted(dupes["esc-001"]), ["escalation", "surfacing"])

    def test_no_false_duplicates(self):
        self.assertEqual(self.m.duplicate_ids(self.m.parse_judgment(FIXTURE)), {})

    def test_next_free_id_spans_whole_file_not_section(self):
        """esc-010 lives under `process`. Next esc id must still be esc-011."""
        nxt = self.m.next_free_ids(self.m.parse_judgment(FIXTURE))
        self.assertEqual(nxt["esc"], "esc-011")

    def test_meta_ids_are_validated(self):
        """Regression: the first implementation omitted `meta` entirely."""
        nxt = self.m.next_free_ids(self.m.parse_judgment(FIXTURE))
        self.assertIn("meta", nxt, "meta rules were not seen by the validator")


class TierTests(unittest.TestCase):
    """T: misclassification must cost detail, never awareness."""

    def setUp(self):
        self.m = load_module()

    def test_safety_sections_are_always_full(self):
        for section in ("meta", "escalation"):
            self.assertEqual(
                self.m.tier_of(section, {"id": "x-001"}),
                self.m.TIER_FULL,
                f"{section} must never be demoted below full text",
            )

    def test_safety_sections_cannot_be_demoted_by_a_domain_tag(self):
        """A stray domain tag must not silently downgrade a safety rule."""
        self.assertEqual(
            self.m.tier_of("escalation", {"id": "esc-001", "domain": "video"}),
            self.m.TIER_FULL,
        )

    def test_safety_id_prefix_is_full_even_when_misfiled(self):
        """29 rules in a real judgment.yaml sit under the wrong section, and one
        of them (esc-010) is a safety gate parked in `process`. Tiering on the
        section alone would silently demote it, which is the exact failure this
        design exists to prevent. The id prefix is the more reliable signal."""
        self.assertEqual(
            self.m.tier_of("process", {"id": "esc-010"}), self.m.TIER_FULL
        )
        self.assertEqual(
            self.m.tier_of("overrides", {"id": "meta-006"}), self.m.TIER_FULL
        )

    def test_misfiled_safety_rule_cannot_be_demoted_by_a_domain_tag(self):
        self.assertEqual(
            self.m.tier_of("process", {"id": "esc-010", "domain": "video"}),
            self.m.TIER_FULL,
        )

    def test_untagged_rule_defaults_to_index_not_dropped(self):
        self.assertEqual(
            self.m.tier_of("process", {"id": "proc-001"}), self.m.TIER_INDEX
        )

    def test_domain_tagged_rule_demotes_to_id_only(self):
        self.assertEqual(
            self.m.tier_of("process", {"id": "proc-012", "domain": "client"}),
            self.m.TIER_ID,
        )


class GistTests(unittest.TestCase):
    def setUp(self):
        self.m = load_module()

    def test_gist_is_bounded(self):
        long = "A directive that runs on. " + ("padding words " * 200)
        self.assertLessEqual(len(self.m.gist(long)), self.m.GIST_CAP)

    def test_gist_is_deterministic(self):
        text = "Do the thing; then do the other thing. And a third."
        self.assertEqual(self.m.gist(text), self.m.gist(text))

    def test_gist_keeps_the_directive(self):
        text = "Never echo a live secret into chat; point at the file instead. Extends esc-001."
        self.assertIn("Never echo a live secret", self.m.gist(text))

    def test_truncated_gist_is_marked_as_incomplete(self):
        """Progressive disclosure only works if the index admits it is partial."""
        long = "A directive that runs on and on " + ("padding words " * 200)
        self.assertTrue(
            self.m.gist(long).endswith(self.m.TRUNCATION_MARK),
            "a shortened gist must advertise that more text exists",
        )


class RenderTests(unittest.TestCase):
    def setUp(self):
        self.m = load_module()
        self.sections = self.m.parse_judgment(FIXTURE)
        self.rendered = self.m.render(self.sections)

    def test_P1_every_rule_appears_somewhere(self):
        """THE invariant. Tiering may reduce detail; it may never lose a rule."""
        for rules in self.sections.values():
            for r in rules:
                self.assertIn(
                    r["id"], self.rendered,
                    f"{r['id']} vanished from the generated file",
                )

    def test_full_tier_rules_appear_in_full(self):
        self.assertIn("primary source and warn about any mismatch", self.rendered)

    def test_id_only_rules_are_grouped_by_domain(self):
        self.assertIn("client", self.rendered)
        self.assertIn("proc-012", self.rendered)

    def test_retrieval_instruction_is_present(self):
        """An index is useless if the reader does not know how to expand it."""
        self.assertIn("judgment-sync.py", self.rendered)
        self.assertIn("show", self.rendered)

    def test_render_is_idempotent(self):
        self.assertEqual(self.rendered, self.m.render(self.sections))

    def test_token_estimate_reported(self):
        self.assertGreater(self.m.estimate_tokens(self.rendered), 0)


class DriftTests(unittest.TestCase):
    def setUp(self):
        self.m = load_module()
        self.sections = self.m.parse_judgment(FIXTURE)

    def test_missing_rules_detected(self):
        missing = self.m.missing_from("only mentions esc-001 here", self.sections)
        self.assertIn("meta-001", missing)
        self.assertNotIn("esc-001", missing)

    def test_prose_mentions_do_not_count_as_loaded(self):
        """Drift is measured against the GENERATED section only.

        The shipped scaffold happens to mention `esc-001` in a usage example.
        Scanning the whole file let that example mask a genuinely unloaded rule,
        so a real drift of 2 was reported as 1. A safety net that under-reports
        is worse than one that is merely noisy."""
        active = (
            "See `judgment-sync.py show esc-001` for an example.\n\n"
            + self.m.GENERATED_HEADING
            + "\n\n- **meta-001** something\n"
        )
        missing = self.m.missing_from(active, self.sections)
        self.assertIn(
            "esc-001", missing,
            "a rule named only in hand-written prose was counted as loaded",
        )
        self.assertNotIn("meta-001", missing)

    def test_no_drift_against_own_output(self):
        self.assertEqual(
            self.m.missing_from(self.m.render(self.sections), self.sections), []
        )

    def test_legacy_generated_heading_is_replaced_not_appended(self):
        """A file whose generated section carries an older heading must be
        REPLACED, not appended to.

        The install this was built from used `# All Active Rules (Abbreviated)`.
        Matching only the current heading would leave the old section in place
        and add a second one below it, silently doubling the context cost of the
        exact file this change exists to shrink."""
        existing = (
            "# Active Judgment Rules\n\nMy own notes.\n\n"
            "# All Active Rules (Abbreviated)\n\n- **stale-001** from the old generator\n"
        )
        out = self.m.regenerate(existing, self.sections)
        self.assertIn("My own notes.", out)
        self.assertNotIn("stale-001", out)
        self.assertEqual(
            len([l for l in out.splitlines() if l.startswith("# All Active Rules")]),
            1, "left two generated sections in the file",
        )

    def test_handcurated_prefix_is_preserved_byte_for_byte(self):
        prefix = "# Hand written\n\nSomething a human wrote.\n\n"
        existing = prefix + self.m.GENERATED_HEADING + "\n\nold junk\n"
        out = self.m.regenerate(existing, self.sections)
        self.assertTrue(out.startswith(prefix), "hand-curated text was clobbered")
        self.assertNotIn("old junk", out)


class BudgetTests(unittest.TestCase):
    """P3: growth must be visible and bounded, or this regresses in six months."""

    def setUp(self):
        self.m = load_module()

    def test_under_budget_is_quiet(self):
        report = self.m.budget_report("tiny", budget=10_000)
        self.assertTrue(report["ok"])
        self.assertEqual(report["over_by"], 0)

    def test_over_budget_is_flagged_with_the_worst_offenders(self):
        sections = self.m.parse_judgment(FIXTURE)
        report = self.m.budget_report(
            self.m.render(sections), budget=10, sections=sections
        )
        self.assertFalse(report["ok"])
        self.assertGreater(report["over_by"], 0)
        self.assertTrue(report["worst"], "must name what to demote")


class HookContractTests(unittest.TestCase):
    """P4: loud on failure, never fatal, never silently a no-op."""

    def _run(self, args, yaml_text, active_text="", env=None):
        tmp = Path(tempfile.mkdtemp())
        (tmp / "context").mkdir()
        (tmp / ".claude" / "rules").mkdir(parents=True)
        if yaml_text is not None:
            (tmp / "context" / "judgment.yaml").write_text(yaml_text)
        (tmp / ".claude" / "rules" / "judgment-active.md").write_text(
            active_text or (load_module().GENERATED_HEADING + "\n")
        )
        e = dict(os.environ, CLAUDE_PROJECT_DIR=str(tmp))
        e.update(env or {})
        return subprocess.run(
            [sys.executable, str(HOOK)] + args,
            capture_output=True, text=True, env=e,
        ), tmp

    def test_hook_emits_valid_json(self):
        out, _ = self._run(["--hook"], FIXTURE)
        self.assertEqual(out.returncode, 0, out.stderr)
        if out.stdout.strip():
            json.loads(out.stdout)

    def test_hook_survives_broken_yaml_and_says_so(self):
        out, _ = self._run(["--hook"], "version: 1\n  : : broken\n   - [[[\n")
        self.assertEqual(out.returncode, 0, "a session start must never be blocked")
        self.assertTrue(out.stdout.strip(), "a failure must not be silent")
        payload = json.loads(out.stdout)
        ctx = payload["hookSpecificOutput"]["additionalContext"].lower()
        self.assertTrue(
            any(w in ctx for w in ("could not", "problem", "duplicate", "not")),
            f"failure was not reported clearly: {ctx}",
        )

    def test_recovered_file_still_generates_and_warns(self):
        """A recoverable syntax error must not be treated as a fatal one.

        The first fix for silent rescue overcorrected: `check` treated any
        non-clean status as unparseable, so a file that WAS readable stopped
        generating entirely. Recovery and failure are different outcomes.
        """
        bad = FIXTURE.replace('    rule: "Never echo', '      rule: "Never echo')
        try:
            import yaml
            yaml.safe_load(bad)
            self.skipTest("mangled fixture still parses")
        except ImportError:
            self.skipTest("PyYAML absent")
        except Exception:
            pass

        out, tmp = self._run(["--write"], bad)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("not valid YAML", out.stderr + out.stdout)
        text = (tmp / ".claude" / "rules" / "judgment-active.md").read_text()
        self.assertIn("esc-001", text, "stopped generating from a readable file")

    def test_hook_survives_missing_yaml(self):
        out, _ = self._run(["--hook"], None)
        self.assertEqual(out.returncode, 0)

    def test_hook_survives_empty_yaml(self):
        out, _ = self._run(["--hook"], "")
        self.assertEqual(out.returncode, 0)

    def test_hook_refuses_to_write_on_duplicate_ids(self):
        out, tmp = self._run(["--hook"], DUPLICATE_FIXTURE)
        self.assertEqual(out.returncode, 0)
        text = (tmp / ".claude" / "rules" / "judgment-active.md").read_text()
        self.assertNotIn(
            "A second rule answering", text,
            "wrote a file while two rules shared one id",
        )
        self.assertIn("esc-001", json.loads(out.stdout)["hookSpecificOutput"]["additionalContext"])

    def test_broken_yaml_leaves_previous_file_intact(self):
        """Degrade to last-known-good, never to nothing."""
        m = load_module()
        good = m.GENERATED_HEADING + "\n\n- **esc-001** previously generated\n"
        out, tmp = self._run(["--hook"], ":::broken:::", active_text=good)
        self.assertEqual(out.returncode, 0)
        self.assertIn(
            "previously generated",
            (tmp / ".claude" / "rules" / "judgment-active.md").read_text(),
        )

    def test_show_returns_the_full_rule(self):
        out, _ = self._run(["show", "esc-001"], FIXTURE)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("primary source", out.stdout)
        self.assertIn("2026-04-07", out.stdout, "provenance must come with the rule")

    def test_show_unknown_id_fails_clearly(self):
        out, _ = self._run(["show", "nope-999"], FIXTURE)
        self.assertNotEqual(out.returncode, 0)

    def test_next_reports_free_ids(self):
        out, _ = self._run(["next"], FIXTURE)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("esc-011", out.stdout)

    def test_check_does_not_write(self):
        m = load_module()
        sentinel = m.GENERATED_HEADING + "\n\nSENTINEL\n"
        out, tmp = self._run([], FIXTURE, active_text=sentinel)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn(
            "SENTINEL",
            (tmp / ".claude" / "rules" / "judgment-active.md").read_text(),
            "default mode must be read-only",
        )

    def test_write_then_check_is_clean(self):
        out, tmp = self._run(["--write"], FIXTURE)
        self.assertEqual(out.returncode, 0, out.stderr)
        text = (tmp / ".claude" / "rules" / "judgment-active.md").read_text()
        for rid in ("meta-001", "esc-001", "esc-002", "ov-001", "proc-012", "del-001"):
            self.assertIn(rid, text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
