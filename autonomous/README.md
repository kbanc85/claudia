# Claudia Autonomous — tracking hub

This directory is the **tracking hub** for the Claudia Autonomous project: a 10-14 week fork-and-infuse effort that takes Hermes Agent v0.7.0, rebrands it completely as Claudia, and infuses it with Claudia's chief-of-staff intelligence. The final product ships as `npx get-claudia --agent`.

The hub is inside the main `claudia` repo on purpose. The executable work happens in a separate repo (`kbanc85/claudia-autonomous`), attached here as a git submodule at `fork/`. But the checklist, roadmap, phase files, decision log, risk register, and session journal all live here so that:

1. Any Claude Code session can orient itself quickly by reading just a few files.
2. State survives between sessions even though conversation context doesn't.
3. The Claudia v1 codebase (in this repo) and the Claudia Autonomous fork (in the submodule) share a single source of truth for what's done and what's next.

## Where to start

1. **Read [`CHECKLIST.md`](CHECKLIST.md)** — single view of all nine phases, with a status box per phase and links into detail files.
2. **Open the phase you're working on** in `phases/` — task-level checklist, success criteria, rollback, and a `Session handoff` block at the bottom.
3. **Read [`logs/session-log.md`](logs/session-log.md)** — newest entry at the top tells you what the previous session did and what you should do next.

## Layout

```
autonomous/
├── README.md                (this file)
├── CHECKLIST.md             master view
├── roadmap/
│   └── claudia-autonomous-roadmap-v3.md    immutable source of truth
├── phases/                  10 phase detail files
├── decisions/               ADRs (architecture decision records)
│   ├── README.md            how to log a decision
│   └── TEMPLATE.md          ADR skeleton
├── risks/
│   └── risk-register.md     live mutable risk tracker (seeded from roadmap)
├── logs/
│   └── session-log.md       chronological session journal
├── notes/                   free-form scratch pad
├── data/                    structured data artefacts (rebrand map, test reports)
│   ├── rebrand-map.csv      Phase 0.2 seed
│   └── rebrand-map.notes.md context the CSV can't hold
├── scripts/                 helper scripts (empty until needed)
└── fork/                    placeholder → becomes submodule in Phase 0.1
    └── README.md            submodule-add instructions
```

## How to work with this hub

### Starting a session

1. Read `CHECKLIST.md` top-to-bottom. One minute.
2. Open the phase file for the phase in progress (or the next one up if the current phase is complete).
3. Read the `Session handoff` block at the bottom of that file. That tells you exactly where to resume.
4. Check `logs/session-log.md` for anything the previous session captured that didn't make it into the phase file.

### During a session

- **Mark tasks as you complete them.** `- [ ]` → `- [x]`.
- **Surface blockers fast.** If something blocks progress, set the task to `- [!]` and write the blocker in the phase file's Blockers line.
- **Log decisions as they happen.** Don't batch them at the end of the session — copy `decisions/TEMPLATE.md` and fill it in immediately.
- **Update the risk register** whenever a risk's state changes (open → monitoring → fired → resolved).

### Ending a session

Mandatory, every session, no exceptions:

1. Update the `Session handoff` block at the bottom of the phase file you were working in.
2. Add a new entry to the top of `logs/session-log.md` using the template at the top of that file.
3. If any phase is fully complete, flip its top-level box in `CHECKLIST.md` from `[ ]` to `[x]`.
4. Commit with a message like `autonomous: [phase N] [short description]`.

### The `fork/` submodule

- **Until `kbanc85/claudia-autonomous` exists on GitHub**: `fork/` is a placeholder directory. No code work happens until the fork repo exists.
- **After Phase 0.1 creates the fork**: run the commands in `fork/README.md` to convert the placeholder into a real submodule.
- **All product code** lives in the submodule, not in the hub. The hub tracks; the fork does.

## Relationship to Claudia v1 (this repo)

The rest of this repo is **Claudia v1** — the chief-of-staff agent that runs in Claude Code, with memory-daemon, template-v2 skills, the npm installer, and the user-facing docs. Claudia Autonomous reuses the **identity and intelligence** from v1 but is a separate product running in its own repo.

Specifically, Claudia Autonomous will read from:
- `template-v2/` — 41 markdown skill files (12 get ported to MVP, 29 archived)
- `memory-daemon/` — the Python hybrid-memory system (ported into the fork as a v0.7.0 memory provider plugin)
- `assets/` — banner GIF, logos
- `bin/` — the `npx get-claudia` installer (extended with `--agent` flag in Phase 6)

And will **not** share:
- Configuration (`~/.claudia-desktop/` vs `~/.claudia/`)
- Running processes (Claudia v1 is a Claude Code integration; Claudia Autonomous is a standalone 24/7 agent)
- Documentation (Claudia v1 targets Claude Code users; Claudia Autonomous targets anyone who can run an npm CLI)

## What not to do in this hub

- **Don't edit `roadmap/claudia-autonomous-roadmap-v3.md`.** That file is the committed v3 snapshot. If the roadmap needs to change, write a new v4 file and regenerate the derived phase files from it.
- **Don't put product code here.** Product code lives in the `fork/` submodule.
- **Don't put secrets here.** API keys, bot tokens, deploy credentials — none of it, ever.
- **Don't batch ADRs.** Write them when the decision is made, not at the end of the phase.
- **Don't skip the session handoff block.** It is the single biggest cost-saver for multi-session work.

## Conventions

- Filenames: `kebab-case.md` for docs, `YYYY-MM-DD-topic.md` for ADRs.
- Dates: always absolute (`2026-04-10`), never relative (`last Thursday`).
- Status boxes: `[ ]` pending, `[~]` in progress, `[x]` done, `[!]` blocked.
- Commit messages: `autonomous: <what changed>`.
