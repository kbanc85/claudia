#!/usr/bin/env python3
"""
Keep the judgment rules Claudia actually applies in step with the ones she was
given, at a context cost that does not grow without bound.

THE PROBLEM
-----------
`/meditate` writes approved rules to `context/judgment.yaml`. Nothing read them.
The `judgment-awareness` skill claimed to "activate at session start", but skills
load only when invoked, and nothing invoked it. So the default experience was:
the user approves a rule, watches it be written to a file, and it never
influences another session. The writing half worked, which made the system look
like it worked.

In the install where this was found, `judgment.yaml` had reached 132 rules before
anyone noticed. 27 had never been loaded. Two ids had been silently reused,
because the only way to pick the next id was to read a hand-maintained summary
that was itself missing rules.

Putting every rule in `.claude/rules/` fixes the loading half and creates a new
problem: that directory is read into every session, so 132 rules became ~9,500
tokens of permanent overhead, growing by roughly one rule per session.

THE APPROACH
------------
Rules are not equally expensive to miss, so they should not be equally expensive
to carry. Three tiers, assigned by consequence:

  full   Missing it is expensive, silent, or irreversible: safety gates and the
         meta-rules that resolve conflicts between other rules. Verbatim.
  index  One line. Enough to act on when the rule is simple, enough to know you
         need to look when it is not. The default.
  id     Bound to a recognisable activity (video, newsletter, deploy). Only the
         id is resident, grouped under its domain, so the always-on context
         still says "there are 12 rules about video" and how to fetch them.

The tiers are chosen so that misclassification costs detail, never awareness.
Nothing is ever fully absent, and safety sections cannot be demoted at all.
Deliberately NOT built on skill triggers: skills fire when the model judges them
relevant, which is exactly the mechanism that failed above.

Usage:
    judgment-sync.py                # check and report, writes nothing
    judgment-sync.py --write        # regenerate the always-on view
    judgment-sync.py --hook         # SessionStart mode, JSON out, never fatal
    judgment-sync.py show <id>      # full text + provenance for one rule
    judgment-sync.py show <domain>  # every rule in one activity, e.g. `show video`
    judgment-sync.py next           # next free id per prefix, for /meditate
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

try:  # PyYAML is used when present, but is never required.
    import yaml
except ImportError:  # pragma: no cover - exercised via subprocess in tests
    yaml = None


# --------------------------------------------------------------------------
# Layout
# --------------------------------------------------------------------------

def project_root() -> Path:
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env)
    # <root>/.claude/hooks/judgment-sync.py
    return Path(__file__).resolve().parent.parent.parent


def yaml_path() -> Path:
    return project_root() / "context" / "judgment.yaml"


def active_path() -> Path:
    return project_root() / ".claude" / "rules" / "judgment-active.md"


GENERATED_HEADING = "# All Active Rules (generated)"

# Any heading the generator has ever used. Matching only the current one would
# append a second section below an older one instead of replacing it, silently
# doubling the cost of the file this exists to shrink.
_GENERATED_HEADING_RE = re.compile(r"^# All Active Rules\b.*$", re.MULTILINE)

# Sections whose whole purpose is to fire when you are NOT looking for them.
# These load verbatim and are never demoted, whatever else the rule says.
SAFETY_SECTIONS = ("meta", "escalation")

# ...but sections lie. In a real 132-rule file, 29 rules sat under the wrong
# section, including a safety gate (esc-010) filed under `process`. The id
# prefix survives that misfiling, so both signals are checked and the more
# protective one wins.
SAFETY_PREFIXES = ("meta", "esc")

SECTION_ORDER = [
    ("meta", "Meta Judgments"),
    ("priorities", "Priorities"),
    ("escalation", "Escalation"),
    ("overrides", "Overrides"),
    ("surfacing", "Surfacing"),
    ("delegation", "Delegation"),
    ("process", "Process"),
]

TIER_FULL, TIER_INDEX, TIER_ID = "full", "index", "id"

GIST_CAP = 150
TRUNCATION_MARK = " ..."

# Budget for the generated section only. Not a hard failure: going over prints
# which rules to demote. Without a number here this file silently regrows.
DEFAULT_BUDGET = 5000


# --------------------------------------------------------------------------
# Parsing
#
# Two parsers on purpose. Every other hook in this template is stdlib-only, and
# a SessionStart hook that dies on a missing pip package would take the judgment
# system down on exactly the machines least able to diagnose it.
# --------------------------------------------------------------------------

def parse_judgment(text: str) -> dict:
    """Parse judgment.yaml. Prefers PyYAML, falls back to the stdlib reader."""
    return parse_with_status(text)[0]


def parse_with_status(text: str):
    """
    Parse, and say whether the file was merely SURVIVED rather than read cleanly.

    The fallback reader is deliberately forgiving, which turned out to be a way
    to hide damage: a mis-indented field once made a real judgment.yaml invalid
    YAML, the fallback read all 132 rules regardless, and this script reported
    everything healthy. Every other tool touching that file would have failed
    and nothing would have said why. So a recovery is reported, not swallowed.

    Returns (sections, status) where status is None for a clean parse or
    "recovered" when PyYAML rejected the file and the fallback rescued it.
    """
    if yaml is not None and hasattr(yaml, "safe_load"):
        try:
            return _parse_with_pyyaml(text), None
        except Exception:
            recovered = _parse_fallback(text)
            return recovered, ("recovered" if any(recovered.values()) else None)
    return _parse_fallback(text), None


def _sections_from_mapping(data) -> dict:
    if not isinstance(data, dict):
        return {}
    out = {}
    for key, value in data.items():
        if isinstance(value, list):
            rules = [r for r in value if isinstance(r, dict) and r.get("id")]
            if rules:
                out[str(key)] = rules
    return out


def _parse_with_pyyaml(text: str) -> dict:
    return _sections_from_mapping(yaml.safe_load(text))


_SECTION_RE = re.compile(r"^([A-Za-z_][\w-]*):\s*$")
_ITEM_RE = re.compile(r"^(\s*)-\s+([\w-]+):\s*(.*)$")
_FIELD_RE = re.compile(r"^(\s+)([\w-]+):\s*(.*)$")


def _scalar(raw: str):
    """Unwrap a YAML scalar: quotes, inline lists, bare values."""
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
        body = raw[1:-1]
        return body.replace('\\"', '"') if raw[0] == '"' else body
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1].strip()
        return [p.strip().strip("\"'") for p in inner.split(",") if p.strip()]
    return raw


def _parse_fallback(text: str) -> dict:
    """
    A reader for the subset of YAML this file actually uses.

    Handles: top-level section keys, list items, quoted and bare scalars,
    inline lists, and folded/literal block scalars (`>`, `>-`, `|`, `|-`),
    which real judgment files do use. Block bodies are consumed by indentation
    rather than by pattern, so prose containing a colon is not mistaken for a
    new field.
    """
    sections: dict = {}
    current_section = None
    current_rule = None
    lines = text.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            i += 1
            continue

        m = _SECTION_RE.match(line)
        if m:
            current_section = m.group(1)
            sections.setdefault(current_section, [])
            current_rule = None
            i += 1
            continue

        if current_section is None:
            i += 1
            continue

        item = _ITEM_RE.match(line)
        field = None if item else _FIELD_RE.match(line)
        if not item and not field:
            i += 1
            continue

        if item:
            indent, key, raw = item.group(1), item.group(2), item.group(3)
            key_indent = len(indent) + 2  # past the "- "
            current_rule = {}
            sections[current_section].append(current_rule)
        else:
            indent, key, raw = field.group(1), field.group(2), field.group(3)
            key_indent = len(indent)
            if current_rule is None:
                i += 1
                continue

        if raw.strip() and raw.strip()[0] in "|>":
            fold = raw.strip()[0] == ">"
            body, i = _consume_block(lines, i + 1, key_indent)
            current_rule[key] = (" ".join(body) if fold else "\n".join(body)).strip()
            continue

        current_rule[key] = _scalar(raw)
        i += 1

    return {k: [r for r in v if r.get("id")] for k, v in sections.items()
            if any(r.get("id") for r in v)}


def _consume_block(lines, start: int, key_indent: int):
    """Collect a block scalar body: every line indented past its key."""
    body = []
    i = start
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            body.append("")
            i += 1
            continue
        if len(line) - len(line.lstrip()) <= key_indent:
            break
        body.append(line.strip())
        i += 1
    return body, i


# --------------------------------------------------------------------------
# Normalising
#
# Two schemas exist in the wild: the one /meditate writes (rule/context) and the
# one judgment-awareness.md documents (when/action/condition). Both are read, so
# an install that followed either doc keeps working.
# --------------------------------------------------------------------------

def normalise(rule: dict) -> dict:
    text = str(rule.get("rule") or "").strip()
    if not text:
        when = str(rule.get("when") or rule.get("trigger") or "").strip()
        action = str(rule.get("action") or rule.get("what") or "").strip()
        cond = str(rule.get("condition") or "").strip()
        parts = []
        if when:
            parts.append(f"When {when.rstrip('.')}")
        if cond:
            parts.append(f"({cond.rstrip('.')})")
        if action:
            parts.append(f": {action}" if parts else action)
        text = " ".join(parts).replace(" :", ":").strip()

    return {
        "id": str(rule.get("id") or "").strip(),
        "text": " ".join(text.split()),
        "rationale": " ".join(str(
            rule.get("context") or rule.get("why") or rule.get("note") or ""
        ).split()),
        "source": str(rule.get("source") or "").strip(),
        "domain": str(rule.get("domain") or "").strip().lower(),
        "governs": rule.get("governs") or [],
        "promoted": bool(rule.get("promoted")),
    }


# --------------------------------------------------------------------------
# Tiering
# --------------------------------------------------------------------------

def is_safety(section: str, rule: dict) -> bool:
    """A rule is a safety gate if EITHER its section or its id says so."""
    if section in SAFETY_SECTIONS:
        return True
    return str(rule.get("id") or "").split("-")[0].strip().lower() in SAFETY_PREFIXES


def tier_of(section: str, rule: dict) -> str:
    """
    Fail-safe by construction.

    A safety rule is always full, even if someone tags it with a domain or files
    it in the wrong section, so neither a stray tag nor a filing slip can quietly
    downgrade an escalation gate. Everything else defaults to `index`: a rule
    nobody classified is still named and still readable, just not verbatim. Only
    an explicit domain tag demotes to id-only, which makes demotion a decision
    someone made rather than a default.
    """
    if is_safety(section, rule):
        return TIER_FULL
    if str(rule.get("tier") or "").strip().lower() in (TIER_FULL, TIER_INDEX, TIER_ID):
        explicit = str(rule["tier"]).strip().lower()
        return explicit
    if str(rule.get("domain") or "").strip():
        return TIER_ID
    return TIER_INDEX


def gist(text: str, cap: int = GIST_CAP) -> str:
    """
    The directive, without the elaboration.

    Rules are written as "Directive. Elaboration; caveats; cross-references", so
    cutting at the first sentence end or semicolon past the opening clause keeps
    the instruction and drops the commentary. A shortened gist always ends in a
    visible mark: an index that does not admit it is partial invites the reader
    to treat it as the whole rule.
    """
    t = " ".join(str(text).split())
    cuts = [m.start() for m in re.finditer(r'(?<=[a-z0-9\)\]"\'])[.;](?:\s|$)', t)
            if m.start() > 40]
    if cuts:
        t = t[:cuts[0]]
    if len(t) > cap:
        t = t[:cap - len(TRUNCATION_MARK)].rstrip() + TRUNCATION_MARK
    return t


def estimate_tokens(text: str) -> int:
    return len(text) // 4


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------

def _all_rules(sections: dict):
    for section, _label in SECTION_ORDER:
        for rule in sections.get(section) or []:
            yield section, rule
    known = {s for s, _ in SECTION_ORDER}
    for section, rules in sections.items():
        if section not in known:
            for rule in rules:
                yield section, rule


def duplicate_ids(sections: dict) -> dict:
    """Two rules answering to one id is a correctness bug in a file whose
    entire purpose is being looked up by id."""
    seen = defaultdict(list)
    for section, rule in _all_rules(sections):
        rid = str(rule.get("id") or "").strip()
        if rid:
            seen[rid].append(section)
    return {rid: where for rid, where in seen.items() if len(where) > 1}


def next_free_ids(sections: dict) -> dict:
    """
    Computed across the WHOLE file, never per section.

    Ids do not respect section boundaries in practice (proc-012 filed under
    overrides, esc-010 under process), so "next id in this category" reads the
    wrong set and collides with a rule sitting somewhere else.
    """
    highest = defaultdict(int)
    for _section, rule in _all_rules(sections):
        m = re.match(r"^([a-z]+)-(\d+)$", str(rule.get("id") or "").strip())
        if m:
            highest[m.group(1)] = max(highest[m.group(1)], int(m.group(2)))
    return {p: f"{p}-{n + 1:03d}" for p, n in sorted(highest.items())}


def missing_from(active_text: str, sections: dict) -> list:
    """
    Which approved rules are absent from the always-on view.

    Only the generated section counts. The hand-curated prefix is user prose and
    may mention an id in passing (the shipped scaffold uses `show esc-001` as an
    example), which would otherwise mask a rule that genuinely is not loaded.
    """
    text = active_text or ""
    m = _GENERATED_HEADING_RE.search(text)
    if m:
        text = text[m.start():]
    listed = set(re.findall(r"\b([a-z]+-\d+)\b", text))
    return sorted(
        str(r.get("id")).strip()
        for _s, r in _all_rules(sections)
        if str(r.get("id") or "").strip() and str(r["id"]).strip() not in listed
    )


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

def render(sections: dict) -> str:
    out = [GENERATED_HEADING, ""]
    out.append(
        "> Generated by `.claude/hooks/judgment-sync.py` from `context/judgment.yaml`. "
        "Do not hand-edit below this heading; rerun the script instead, or the two "
        "drift and approved rules stop being applied."
    )
    out.append("")
    out.append(
        "A judgment rule NEVER overrides `claudia-principles.md` or "
        "`trust-north-star.md`: it cannot skip approval for an external action, "
        "reduce a provenance requirement, or override Safety First. Where a rule "
        "conflicts with a principle, the principle wins silently."
    )
    out.append("")
    out.append(
        "Expand any rule with `python3 .claude/hooks/judgment-sync.py show <id>`, "
        "or a whole domain at once with `show <domain>` (e.g. `show video`). "
        "Lines ending in `...` are shortened. Ids under Activity-scoped have no "
        "text here at all: run `show <domain>` BEFORE working in that area."
    )
    out.append("")

    buckets = {TIER_FULL: [], TIER_INDEX: [], TIER_ID: []}
    for section, raw in _all_rules(sections):
        rule = normalise(raw)
        if rule["id"]:
            buckets[tier_of(section, raw)].append((section, rule))

    labels = dict(SECTION_ORDER)

    def date_of(rule):
        return (rule["source"] or "").replace("meditate/", "") or "undated"

    if buckets[TIER_FULL]:
        out.append("## Always resident")
        out.append("")
        out.append(
            "These fire when you are not looking for them, so they are carried "
            "in full."
        )
        out.append("")
        for section, _label in SECTION_ORDER:
            group = [r for s, r in buckets[TIER_FULL] if s == section]
            if not group:
                continue
            out.append(f"### {labels.get(section, section.title())}")
            out.append("")
            for rule in group:
                out.append(f"- **{rule['id']}** ({date_of(rule)}): {rule['text']}")
            out.append("")

    if buckets[TIER_INDEX]:
        out.append("## Indexed")
        out.append("")
        out.append("One line each. Expand any of them with `show <id>`.")
        out.append("")
        for section, _label in SECTION_ORDER:
            group = [r for s, r in buckets[TIER_INDEX] if s == section]
            if not group:
                continue
            out.append(f"### {labels.get(section, section.title())}")
            out.append("")
            for rule in group:
                mark = " *(promoted)*" if rule["promoted"] else ""
                out.append(
                    f"- **{rule['id']}** ({date_of(rule)}): {gist(rule['text'])}{mark}"
                )
            out.append("")

    if buckets[TIER_ID]:
        out.append("## Activity-scoped")
        out.append("")
        out.append(
            "Ids only. Before working in one of these areas, expand that "
            "domain's rules; do not assume the heading tells you enough."
        )
        out.append("")
        by_domain = defaultdict(list)
        for _section, rule in buckets[TIER_ID]:
            by_domain[rule["domain"] or "unsorted"].append(rule["id"])
        for domain in sorted(by_domain):
            ids = " ".join(sorted(by_domain[domain]))
            out.append(f"- **{domain}** ({len(by_domain[domain])}): {ids}")
        out.append("")

    return "\n".join(out).rstrip() + "\n"


def regenerate(existing: str, sections: dict) -> str:
    """Replace the generated section, preserving hand-curated text above it."""
    existing = existing or ""
    m = _GENERATED_HEADING_RE.search(existing)
    if m:
        prefix = existing[:m.start()]
    else:
        prefix = existing.rstrip() + "\n\n" if existing.strip() else ""
    return prefix + render(sections)


def budget_report(rendered: str, budget: int = DEFAULT_BUDGET, sections: dict | None = None) -> dict:
    """
    Growth is the failure this system regresses into. A budget that is measured
    and reported every session is the only thing that keeps 132 rules from
    quietly becoming 400.
    """
    used = estimate_tokens(rendered)
    over = max(0, used - budget)
    worst = []
    if over and sections:
        candidates = []
        for section, raw in _all_rules(sections):
            if tier_of(section, raw) in (TIER_FULL, TIER_INDEX) and not is_safety(section, raw):
                rule = normalise(raw)
                candidates.append((estimate_tokens(rule["text"]), rule["id"]))
        worst = [rid for _cost, rid in sorted(candidates, reverse=True)[:8]]
        if not worst:
            worst = [rid for _c, rid in sorted(
                ((estimate_tokens(normalise(r)["text"]), normalise(r)["id"])
                 for _s, r in _all_rules(sections)), reverse=True)[:8]]
    return {"ok": over == 0, "used": used, "budget": budget,
            "over_by": over, "worst": worst}


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------

def _load() -> tuple:
    path = yaml_path()
    if not path.exists():
        return {}, "", None
    raw = path.read_text(encoding="utf-8", errors="replace")
    sections, status = parse_with_status(raw)
    # Non-empty source that yields no rules means the file did not parse.
    # Reporting that beats overwriting a good generated file with nothing.
    if raw.strip() and not any(sections.values()):
        return {}, raw, "unparseable"
    return sections, raw, status


def _print_rule(section: str, raw: dict) -> None:
    rule = normalise(raw)
    print(f"{rule['id']}  [{section}]  {rule['source'] or 'undated'}")
    print()
    print(rule["text"])
    if rule["rationale"]:
        print()
        print(f"Why: {rule['rationale']}")
    if rule["governs"]:
        print()
        print(f"Governs: {', '.join(map(str, rule['governs']))}")


def cmd_show(rid: str) -> int:
    """
    Expand one rule by id, or a whole domain in a single command.

    The domain form is what makes the activity-scoped tier honest. The always-on
    file says "build (23)" and tells you to read those before working there; if
    that cost 23 lookups nobody would, and deferring rules would quietly become
    losing them.
    """
    sections, _raw, err = _load()
    if err == "unparseable" or not sections:
        print(f"Could not read {yaml_path()}", file=sys.stderr)
        return 1

    wanted = rid.strip().lower()
    if not re.match(r"^[a-z]+-\d+$", wanted):
        group = [(s, r) for s, r in _all_rules(sections)
                 if str(r.get("domain") or "").strip().lower() == wanted]
        if group:
            print(f"{len(group)} rule(s) in domain {wanted!r}:\n")
            for i, (section, raw) in enumerate(group):
                if i:
                    print("\n" + "-" * 60 + "\n")
                _print_rule(section, raw)
            return 0

    for section, raw in _all_rules(sections):
        if str(raw.get("id") or "").strip() == rid:
            _print_rule(section, raw)
            return 0
    print(f"No rule or domain {rid!r} in {yaml_path()}", file=sys.stderr)
    return 1


def cmd_next() -> int:
    sections, _raw, err = _load()
    if err == "unparseable":
        print(f"Could not parse {yaml_path()}", file=sys.stderr)
        return 1
    for prefix, nxt in next_free_ids(sections).items():
        print(f"{prefix}: {nxt}")
    return 0


def cmd_check(write: bool) -> int:
    sections, _raw, err = _load()
    if err == "unparseable":
        print(f"Could not parse {yaml_path()}.", file=sys.stderr)
        return 1

    if err == "recovered":
        print("WARNING: context/judgment.yaml is not valid YAML. It was read with "
              "the fallback parser, so rules below are correct, but other tools "
              "will fail on this file. Fix the syntax.", file=sys.stderr)

    total = sum(len(v) for v in sections.values())
    active = active_path().read_text(encoding="utf-8") if active_path().exists() else ""
    missing = missing_from(active, sections)
    dupes = duplicate_ids(sections)
    rendered = render(sections)
    budget = budget_report(rendered, sections=sections)

    print(f"rules in judgment.yaml       : {total}")
    print(f"written but never loaded     : {len(missing)}")
    if missing:
        print("  " + ", ".join(missing))
    tiers = defaultdict(int)
    for section, raw in _all_rules(sections):
        tiers[tier_of(section, raw)] += 1
    print(f"tiers                        : {tiers[TIER_FULL]} full, "
          f"{tiers[TIER_INDEX]} indexed, {tiers[TIER_ID]} activity-scoped")
    print(f"generated size               : {budget['used']} tokens "
          f"(budget {budget['budget']})")
    if not budget["ok"]:
        print(f"  OVER BUDGET by {budget['over_by']} tokens. Consider tagging a "
              f"domain: on {', '.join(budget['worst'][:5])}")
    print("next free id per prefix      : " +
          ", ".join(next_free_ids(sections).values()))

    if dupes:
        print("\nDUPLICATE RULE IDS:", file=sys.stderr)
        for rid, where in sorted(dupes.items()):
            print(f"  {rid} appears in: {', '.join(where)}", file=sys.stderr)
        print("Refusing to write while duplicate ids exist.", file=sys.stderr)
        return 1

    if not write:
        print("\n(check only; pass --write to regenerate)")
        return 0

    active_path().parent.mkdir(parents=True, exist_ok=True)
    active_path().write_text(regenerate(active, sections), encoding="utf-8")
    print(f"\nRewrote {active_path()} with all {total} rules.")
    return 0


def _emit(context: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "SessionStart", "additionalContext": context}}))


def cmd_hook() -> int:
    """
    SessionStart mode.

    Regenerates, then reports anything the user needs to know as
    additionalContext. The report matters because `.claude/rules/` may already
    have been read by the time this runs, so a regeneration alone could take
    effect a session late; naming the missing rules closes that gap now.

    Exits 0 in every path. A broken judgment file must never stop a session
    starting, but it must never pass silently either.
    """
    path = yaml_path()
    if not path.exists():
        return 0

    sections, raw, err = _load()
    if err == "unparseable":
        _emit(
            "context/judgment.yaml could not be parsed, so judgment-active.md was "
            "NOT regenerated and may be stale: some approved rules may not be "
            "loaded this session. Run `python3 .claude/hooks/judgment-sync.py` to "
            "see the problem."
        )
        return 0
    if not sections:
        return 0

    dupes = duplicate_ids(sections)
    if dupes:
        _emit(
            "context/judgment.yaml has DUPLICATE rule ids "
            f"({', '.join(sorted(dupes))}) and was NOT regenerated. Two rules "
            "answer to one id, so lookups are ambiguous until this is fixed."
        )
        return 0

    active = active_path().read_text(encoding="utf-8") if active_path().exists() else ""
    missing = missing_from(active, sections)
    try:
        active_path().parent.mkdir(parents=True, exist_ok=True)
        active_path().write_text(regenerate(active, sections), encoding="utf-8")
    except OSError as exc:
        _emit(f"Judgment rules could not be written: {exc}. "
              "judgment-active.md may be stale.")
        return 0

    notes = []
    if err == "recovered":
        notes.append(
            "context/judgment.yaml is NOT valid YAML and was only read by the "
            "fallback parser. The rules loaded correctly, but any other tool "
            "reading that file will fail. Worth fixing the syntax."
        )
    if missing:
        shown = ", ".join(missing[:12]) + ("..." if len(missing) > 12 else "")
        notes.append(
            f"judgment-active.md had drifted and was regenerated: {len(missing)} "
            f"approved rule(s) were in context/judgment.yaml but not loaded "
            f"({shown}). They apply from now on."
        )
    budget = budget_report(render(sections), sections=sections)
    if not budget["ok"]:
        notes.append(
            f"Judgment rules are {budget['over_by']} tokens over budget "
            f"({budget['used']}/{budget['budget']}). Mention at the next "
            f"/meditate that these could take a `domain:` tag to become "
            f"activity-scoped: {', '.join(budget['worst'][:5])}."
        )
    if notes:
        _emit(" ".join(notes))
    return 0


def main(argv) -> int:
    args = [a for a in argv[1:]]
    if args and args[0] == "show":
        return cmd_show(args[1]) if len(args) > 1 else 1
    if args and args[0] == "next":
        return cmd_next()
    if "--hook" in args:
        return cmd_hook()
    return cmd_check(write="--write" in args)


def hook_safe(argv) -> int:
    """
    Never break a session, never fail silently.

    The shell wrapper ends in `|| true`, which is right for a SessionStart hook
    but means a corrupted file would otherwise stop the rules updating with
    nobody the wiser. additionalContext is only text, so reporting the failure
    is always safe.
    """
    try:
        return main(argv)
    except Exception as exc:  # noqa: BLE001 - a session start must survive anything
        _emit(
            f"Judgment rules could NOT be synced: {type(exc).__name__}: {exc}. "
            "judgment-active.md may be stale, so some approved rules may not be "
            "loaded. Run `python3 .claude/hooks/judgment-sync.py` to see the state."
        )
        return 0


if __name__ == "__main__":
    sys.exit(hook_safe(sys.argv) if "--hook" in sys.argv else main(sys.argv))
