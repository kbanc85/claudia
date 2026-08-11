# Active Judgment Rules

Everything in `.claude/rules/` is read into every session, so this file is how
approved judgment rules actually reach Claudia. The archive lives in
`context/judgment.yaml`; this is the always-on view generated from it.

`/meditate` proposes rules, you approve them, and they are written to the
archive. A SessionStart hook regenerates the section below, so an approved rule
starts applying at the next session without anyone maintaining this file by hand.

**Sections above the generated heading are yours.** Write anything here that
should always load: standing context, a rule you want carried verbatim, notes to
yourself. The generator never touches it.

To see the full text and reasoning behind any rule:

```bash
python3 .claude/hooks/judgment-sync.py show <id>     # e.g. show esc-001
python3 .claude/hooks/judgment-sync.py              # what is loaded, and what drifted
```

---

# All Active Rules (generated)

*No judgment rules yet. Run `/meditate` at the end of a session and Claudia will
propose some based on what happened.*
