# Claudia Craft Refactor: Design

**Date:** 2026-05-15
**Status:** Draft, pending implementation
**Target releases:** v1.59 (PR1), v1.60 (PR2), v1.61 (PR3), v1.61.x (PR4)
**Baseline:** v1.58.0 at commit `f1aa16d`. Local `HEAD` == `origin/main` == npm `latest`.

## Context

Claudia ships as `get-claudia` on npm. The repository at `kbanc85/claudia` is the source. Today the local tree, GitHub, and the npm tarball all point to the same commit. There is no drift to reconcile.

The codebase has accrued some inevitable cruft:

- Two services (`verify.py`, `metrics.py`) with zero production callers. Tests for both keep them alive.
- A 2,200-line installer monolith (`bin/index.js`) with roughly 30 top-level functions in one file.
- About 42 user-facing skills in `template-v2/.claude/skills/`, several with overlapping triggers.
- A stale "permanently deferred" list in `MEMORY.md` that contradicts the current source.

This refactor is craft-driven. The goal is a codebase that is a pleasure to read and contribute to. It is not a goal to ship more features, simplify install, or change Claudia's behavior toward users.

## Goal

A repository where:

1. A new contributor can find any subsystem in under five minutes.
2. No code exists "just because it always has."
3. Each shipped skill is a clear teaching example of how to write a Claudia skill.
4. Module boundaries match the reader's mental model of what the code does.

## Non-goals

- Adoption work or install-friction reduction.
- Memory daemon rewrite.
- MCP tool API changes. Tool names and signatures stay.
- Persona behavior changes. Greeting flow, onboarding flow, and the ten principles are unchanged.

## The stability contract

Every change must preserve, from a user's perspective:

1. CLI surface: `npx get-claudia <dir>`, `upgrade`, `google`. Flags `--skip-memory`, `--no-memory`, `--dev`, `--yes`/`-y`.
2. All MCP tool names beginning with `memory_`.
3. Skill names and trigger phrases in `template-v2/.claude/skills/`.
4. Behaviors documented in `template-v2/CLAUDE.md` and the rules under `template-v2/.claude/rules/`.
5. Memory daemon database schema. No migrations.
6. Vault PARA structure. Users may already have data in PARA folders.

Anything outside this list is fair game. Anything inside requires either zero change or a deprecation cycle, never silent removal.

---

## PR1: Dead code removal and MEMORY.md correction

**Target release:** v1.59.0

### What changes

Delete the following files. Caller-tracing confirmed zero production references; only their own tests import them.

- `memory-daemon/claudia_memory/services/verify.py`
- `memory-daemon/claudia_memory/services/metrics.py`
- `memory-daemon/tests/test_verify.py`
- `memory-daemon/tests/test_metrics.py`
- `memory-daemon/tests/test_prediction_*.py` (verify in PR which of these test the dead prediction feature vs. the live prediction-cleanup migration; only delete the former)

Edit the following files:

- `MEMORY.md`: rewrite the "Permanently deferred" entry. The current claim names nine features, six of which are demonstrably live (vault sync, canvas generator, briefing, TUI, health endpoint, daemon lifecycle). Replace with the small accurate list and a date stamp.
- `CONTRIBUTING.md`: add a short "verifying dead code" section that documents the audit method. Future contributors should be able to repeat it.

### Verification

- `cd memory-daemon && ./test.sh` passes end-to-end.
- `npm test` passes.
- `grep -r "verify_service\|MetricsService\|VerifyService\|get_metrics_service\|run_verification" memory-daemon/ bin/ template-v2/` returns no hits outside `_archived/` and `CHANGELOG.md`.

### Rollback

`git revert`. No external dependencies. Single PR commit ideally.

### Risk

Low. If a hidden dynamic-dispatch caller exists, revert and re-trace.

### PR description as artifact

The PR description documents the audit method itself: how to find callers, how to distinguish test-only references, how to confirm safe deletion. The PR becomes the worked example for "how do I propose a deletion in this codebase."

---

## PR2: Installer modularization

**Target release:** v1.60.0

### What changes

`bin/index.js` becomes a thin orchestrator. Focused modules absorb the rest. Internal split only. Zero behavior change.

Target module layout:

```
bin/
  index.js              CLI entry, arg parsing, dispatch
  installer.js          main install/upgrade flow, 5-step progress orchestration
  template-copy.js      template-v2 → target dir, conflict resolution wiring
  ollama.js             detect, install, start, ensureKey, restart
  python-env.js         venv creation, pip install for daemon
  mcp-config.js         ensureDaemonMcpConfig, restoreMcpServers, ensureGoogleMcpEntries
  launch-agent.js       macOS launchd integration
  changelog.js          extractChangelog, writeWhatsNewFile
  prompt.js             confirm, promptKey, prompt (input helpers)
  renderer.js           ProgressRenderer class, banner, wave frames
  visualizer.js         installVisualizer
  manifest-lib.js       unchanged (already extracted)
  google-setup.js       unchanged (already extracted)
```

The boundaries follow the install pipeline's natural phases, not arbitrary line counts.

### Verification (strict before/after parity)

1. Check out v1.58.0 in a sibling directory.
2. Run `node v1.58.0/bin/index.js ../test-old --skip-memory --yes`.
3. Run `node PR-branch/bin/index.js ../test-new --skip-memory --yes`.
4. `diff -r ../test-old ../test-new` must show only timestamp differences.
5. Repeat with full memory install. Use `diff` while excluding daemon log timestamps.
6. `npm test` passes (all 41 existing Node tests).
7. Add module-boundary tests where natural. For example, `ollama.js` exports become unit-testable in isolation.

### Side effect (intentional)

Add `bin/README.md` that walks the install pipeline top to bottom. Each phase points to its module. This is the contributor's map for `bin/`.

### Rollback

`git revert`. The orchestrator pattern means the monolith can be reconstructed by inlining if needed.

### Risk

Medium. A bad import path, a missed export, or a closure-captured variable becomes a silent install regression. The strict file-tree `diff` catches this. Add `test/installer-parity.test.js` snapshotting the install output if time permits.

### Boundary choices as teaching content

The PR description explains each boundary. Why is `prompt.js` separate from `renderer.js`? Because one handles input, the other output, and they have different testability profiles. Each split decision is a teachable moment.

---

## PR3: Skill cataloguing (not cutting)

**Target release:** v1.61.0

### Reframe

The original plan proposed cutting overlapping skills. Under the stability contract, that is a regression risk. Users have built habits around trigger phrases. PR3 becomes cataloguing and deprecation marking, not deletion.

### What changes

1. **Write `template-v2/.claude/skills/README.md`** as a contributor's guide:
   - How to write a Claudia skill (file structure, naming, triggers, when to use directory-style vs. single-file).
   - Anatomy of a good skill description: one sentence naming the trigger phrase plus when to use it.
   - How skills compose with rules and the persona.
   - Each remaining skill is referenced as an exemplar of a particular pattern.

2. **Audit each shipped skill** in `template-v2/.claude/skills/` for:
   - Clarity of trigger description.
   - Overlap with another skill. Known overlaps include `draft-reply` vs. `follow-up-draft`, `memory-audit` vs. `memory-health`, `morning-brief` vs. `weekly-review` vs. `growth-check`.
   - Whether the description matches actual behavior.

3. **Mark overlaps without deleting:**
   - Add a "see also" line to overlapping skills.
   - For genuine duplicates, pick one as canonical. Mark the other "kept for backward compatibility; prefer `[other]` for new use."
   - No skill name removed. No trigger phrase removed. No behavior change.

4. **Improve descriptions** that read as vague or aspirational. Test: a new contributor should be able to predict from the description alone when the skill fires.

5. **Reconcile root `CLAUDE.md` with `template-v2/CLAUDE.md`.** The root copy now has a developer-guide section (added in this session). Make synchronization explicit. A header note on both files states: "The persona content in this file must stay byte-identical between root and `template-v2/`. The developer guide section in the root copy is root-only."

### What does NOT change

- Any skill's name.
- Any skill's trigger phrase.
- Any skill's actual behavior.
- The persona's `## Skills` section that lists them.
- The principles.

### Verification

- Visual review only. No automated test for "skill clarity."
- `node bin/index.js ../test-fresh --skip-memory && cd ../test-fresh && claude` for a manual onboarding smoke test confirming the new README is reachable and skills still trigger.
- `git diff v1.58.0 template-v2/.claude/skills/` should show description edits, the new `README.md`, and zero file removals.

### Rollback

`git revert`. Pure docs and metadata change.

### Risk

Low. No behavior changes ship. The only risk is that "deprecation marking" confuses users; mitigated by careful phrasing run past the maintainer before merge.

---

## PR4: Documentation uplift

**Target release:** folded into PR1, PR2, PR3 plus a standalone v1.61.x patch for the remainder.

### Folded into earlier PRs

- PR1 adds the "verifying dead code" section to `CONTRIBUTING.md`.
- PR2 adds `bin/README.md`.
- PR3 adds `template-v2/.claude/skills/README.md`.

### Standalone work

1. **Verify `ARCHITECTURE.md` mermaid diagrams** against current source. The audit found them mostly accurate, but PR2 moves functions between files. Sanity-check after PR2 lands.
2. **Add one-paragraph README to each daemon subpackage:**
   - `memory-daemon/claudia_memory/services/README.md`
   - `memory-daemon/claudia_memory/daemon/README.md`
   - `memory-daemon/claudia_memory/extraction/README.md`
   - `memory-daemon/claudia_memory/mcp/README.md`

   Each names the public surface and points to the canonical "where to look first" file.

3. **Expand `CONTRIBUTING.md` with a "your first PR" walkthrough:** clone, install for development, run tests, find a starter issue, submit.

### Verification

Manual review. No markdown linting in the repo today; do not add it for this refactor.

### Risk

None. Documentation only.

---

## Cross-cutting decisions

### Versioning

| PR  | Version | Bump rationale                                              |
|-----|---------|-------------------------------------------------------------|
| PR1 | v1.59.0 | Minor. No API change. Internal cleanup and docs.            |
| PR2 | v1.60.0 | Minor. Internal refactor. User-visible behavior identical.  |
| PR3 | v1.61.0 | Minor. Documentation and skill description edits.           |
| PR4 | v1.61.x | Patch if standalone after PR3.                              |

No `v2.0` planned in this refactor. `v2.0` is reserved for the day actual skill removals happen, which is explicitly out of scope here.

### CHANGELOG

Each PR adds a `## [x.y.z] - YYYY-MM-DD` section. The installer's `extractChangelog(version)` pulls this into `context/whats-new.md` on user upgrade. Users see what changed.

### Test strategy

Existing test suites must pass after every PR:

- `npm test` (Node, 41 tests)
- `cd memory-daemon && ./test.sh` (Python, includes integration smoke)

No new test framework. PR2 adds one parity-snapshot test. That is the only test infrastructure change.

### Commit hygiene

- Each PR ships as a single squashed commit when review is clean. Two or three logical commits when discussion produces refinements.
- Conventional Commits: `chore:`, `refactor:`, `docs:`, `test:`. Use `feat:` only for genuinely new user-visible capability. None planned.
- Co-authored-by trailer on commits Claude wrote, per existing project convention.

### Branch model

Each PR off `main`. No stacking. After merge, the next PR rebases on the new `main`.

### Style

The repository's own writing style applies:

- No em dashes.
- Plain language. Direct sentences.
- Section headers with `##`.
- Markdown tables for structured comparisons.

---

## Open questions

1. **`tests/test_prediction_*.py`:** the audit named two test files but the trace must verify which are testing the (dead) prediction feature vs. the (live) prediction-cleanup migration. Confirm in PR1's first commit.
2. **PR3 deprecation phrasing.** A future `v2.0` might remove some of these skills. The deprecation line should make the future direction clear without forcing user action today. Draft the exact phrasing during PR3 and confirm with the maintainer before merge.
3. **`ARCHITECTURE.md` "commands" mention.** The document refers to `/morning-brief` etc. as "commands," but they are skills. Either correct the terminology in PR4 or accept the user-facing label "command" with a footnote explaining the implementation.

## Out of scope, explicitly

- Replacing Ollama with a different embedder.
- Porting the daemon to TypeScript or Node.
- Removing user-facing skills.
- MCP tool renames.
- Persona content reduction.
- Database schema changes.
- Vault layout changes.

These are real questions. They belong in a different refactor with a different goal. This refactor is craft, not product.

---

## Execution order

1. **PR1** today or next session. Two to three hours of focused work.
2. **PR2** after PR1 ships. Half day to one day.
3. **PR3** after PR2 ships. Half day to one day.
4. **PR4** folded into 1, 2, 3 with a small standalone v1.61.x patch for remaining items.

Total elapsed: roughly two to three days of focused work spread across separate sessions.

---

End of design.
