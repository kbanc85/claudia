# PR1 Remove Dead Services Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Delete two services (`verify.py`, `metrics.py`) and their orphan tests after confirming zero production callers. Correct a stale `MEMORY.md` entry that misidentifies live features as deferred. Add a "verifying dead code" note to `CONTRIBUTING.md`. Bump version to `1.59.0`.

**Architecture:** Single-commit refactor on branch `chore/pr1-remove-dead-services` (worktree: `.claude/worktrees/pr1-remove-dead-services/`). Verify caller-trace per deletion candidate, delete in small clusters, run full test suite after each cluster, then update docs. No shipped behavior change. No schema change. No MCP tool change.

**Tech Stack:** Python 3.10–3.13 (memory-daemon), Node ≥18 (installer), markdown docs.

**Design reference:** `docs/plans/2026-05-15-craft-refactor-design.md` (ships in PR #58 on branch `docs/refactor-plan`).

**Stability contract from design doc:**
- CLI surface unchanged
- All `memory_*` MCP tool names unchanged
- Skill names and trigger phrases unchanged
- Memory daemon database schema untouched
- No vault layout changes

---

## Task 1: Establish baseline (Python + Node tests green)

**Files:** none modified

**Step 1: Confirm worktree HEAD matches origin/main**

Run: `git rev-parse HEAD && git rev-parse origin/main`
Expected: both output `f1aa16d07e5086a351b06b76e43cbcc716ec6fa3`

**Step 2: Run the full Python integration suite**

Run: `cd memory-daemon && ./test.sh 2>&1 | tail -30`
Expected: "All Tests Passed!" banner. No FAILED lines anywhere.
Time: 3–6 minutes (creates a venv from scratch).

If FAILED appears: STOP. Report which test failed. Do not proceed.

**Step 3: Run the Node test suite**

Run: `cd .. && npm test 2>&1 | tail -10`
Expected: `# pass 25` and `# fail 0`.

**Step 4: Record the baseline**

No commit. Just confirm both suites green before any deletion.

---

## Task 2: Verify zero production callers for `verify.py`

**Files:** none modified

**Step 1: Search the entire shipped tree for VerifyService symbols**

Run:
```bash
grep -rn "VerifyService\|run_verification\|from .verify\|from claudia_memory.services.verify" \
  memory-daemon/claudia_memory/ \
  bin/ \
  template-v2/ \
  CLAUDE.md ARCHITECTURE.md README.md CHANGELOG.md \
  2>/dev/null
```

Expected: zero matches in `claudia_memory/`, `bin/`, `template-v2/`. Matches in `CHANGELOG.md` describing past changes are acceptable.

**Step 2: Confirm only test files reference the symbols**

Run:
```bash
grep -rln "VerifyService\|run_verification" memory-daemon/ 2>/dev/null
```

Expected: only `memory-daemon/claudia_memory/services/verify.py` and `memory-daemon/tests/test_verify.py`.

If any other file appears: STOP. Investigate before deletion.

---

## Task 3: Verify zero production callers for `metrics.py`

**Files:** none modified

**Step 1: Search for MetricsService symbols**

Run:
```bash
grep -rn "MetricsService\|get_metrics_service\|from .metrics\|from claudia_memory.services.metrics" \
  memory-daemon/claudia_memory/ \
  bin/ \
  template-v2/ \
  CLAUDE.md ARCHITECTURE.md README.md \
  2>/dev/null | grep -v "^memory-daemon/claudia_memory/services/metrics.py"
```

Expected: zero matches outside `services/metrics.py` itself.

**Step 2: Confirm only test files reference the symbols**

Run:
```bash
grep -rln "MetricsService" memory-daemon/ 2>/dev/null
```

Expected: only `memory-daemon/claudia_memory/services/metrics.py` and `memory-daemon/tests/test_metrics.py`.

---

## Task 4: Classify `test_prediction_*.py` files

**Files:** none modified (investigation only)

The audit flagged prediction tests as candidates but warned some test the *live* prediction-cleanup retention migration, not the *dead* prediction feature.

**Step 1: List all prediction test files**

Run: `ls memory-daemon/tests/test_prediction*.py`
Expected: prints one or more file names.

**Step 2: Inspect each file's imports and intent**

For each file printed in Step 1, run:
```bash
head -30 memory-daemon/tests/test_prediction_<name>.py
```

Classification rules:
- **DEAD-FEATURE test** (delete): imports prediction service / generators / handlers that no longer exist; asserts on prediction generation behavior.
- **LIVE-CLEANUP test** (keep): tests `consolidate.py` purging old prediction rows from the database; tests retention policy; asserts only on DB row counts after purge.

**Step 3: Record verdict per file**

Build a list. Mark each test file: `DELETE` or `KEEP`. If ambiguous, default to `KEEP` (safer — orphan tests don't break anything, but deleting a live test creates a gap).

If `cleanup` or `retention` or `purge` appears in the file's docstring or test names: KEEP.

**Step 4: No deletion yet**

Record the list. Use it in Task 7.

---

## Task 5: Delete `verify.py` and its test

**Files:**
- Delete: `memory-daemon/claudia_memory/services/verify.py`
- Delete: `memory-daemon/tests/test_verify.py`

**Step 1: Delete both files**

Run:
```bash
git rm memory-daemon/claudia_memory/services/verify.py memory-daemon/tests/test_verify.py
```

Expected: `rm 'memory-daemon/claudia_memory/services/verify.py'` and `rm 'memory-daemon/tests/test_verify.py'`.

**Step 2: Confirm Python package still imports cleanly**

Run:
```bash
cd memory-daemon
.test_venv/bin/python -c "import claudia_memory; import claudia_memory.services; print('OK')" 2>&1
```

Expected: `OK`. No `ImportError`, no `ModuleNotFoundError`.

**Step 3: Run a fast pytest subset to detect collection errors**

Run:
```bash
.test_venv/bin/pytest tests/ --collect-only -q 2>&1 | tail -10
```

Expected: collection completes. No errors about missing `verify` module. Total collected count is one file less than before.

---

## Task 6: Delete `metrics.py` and its test

**Files:**
- Delete: `memory-daemon/claudia_memory/services/metrics.py`
- Delete: `memory-daemon/tests/test_metrics.py`

**Step 1: Delete both files**

Run:
```bash
git rm memory-daemon/claudia_memory/services/metrics.py memory-daemon/tests/test_metrics.py
```

**Step 2: Confirm Python package still imports cleanly**

Run:
```bash
.test_venv/bin/python -c "import claudia_memory; from claudia_memory.mcp.server import *; print('OK')" 2>&1
```

Expected: `OK`. The MCP server is the most import-heavy module; if anything was indirectly depending on metrics it surfaces here.

**Step 3: Confirm pytest collection still works**

Run:
```bash
.test_venv/bin/pytest tests/ --collect-only -q 2>&1 | tail -5
```

Expected: collection completes cleanly.

---

## Task 7: Delete dead prediction tests (per Task 4 verdict)

**Files:** as classified in Task 4.

**Step 1: For each file marked DELETE in Task 4, run:**

Run:
```bash
git rm memory-daemon/tests/test_prediction_<name>.py
```

**Step 2: Pytest collection sanity check**

Run:
```bash
cd memory-daemon
.test_venv/bin/pytest tests/ --collect-only -q 2>&1 | tail -5
```

Expected: collection completes.

If Task 4 found all prediction tests are KEEP: skip this task. Note that finding in the commit message.

---

## Task 8: Full Python integration verification (gate)

**Files:** none modified

**Step 1: Run the full integration suite**

Run:
```bash
cd memory-daemon && ./test.sh 2>&1 | tail -30
```

Expected: "All Tests Passed!" banner. Same pass count as Task 1's baseline minus the number of deleted test files.
Time: 3–6 minutes.

**Step 2: If anything fails, STOP**

Diagnose. The deletions are atomic at this point: `git status` should show only `git rm` entries. To roll back: `git checkout HEAD -- memory-daemon/`.

**Step 3: Node tests**

Run: `cd .. && npm test 2>&1 | tail -5`
Expected: `# pass 25`, `# fail 0`. (Node tests don't touch the Python daemon so they should be unaffected.)

---

## Task 9: Correct the stale entry in MEMORY.md

**Files:**
- Modify: `MEMORY.md`

**Step 1: Find the stale text**

Run: `grep -n "Permanently deferred" MEMORY.md`
Expected: a single line number.

**Step 2: Read the surrounding context**

Read `MEMORY.md` lines 5 lines before to 5 lines after the match.

**Step 3: Replace the stale list**

The current text is:
```
Permanently deferred: vault sync, canvas generation, briefing service, TUI, daemon lifecycle, HTTP health, standalone scheduler, predictions, vec0.
```

Replace with:
```
Permanently removed (v1.59, 2026-05-15): VerifyService and MetricsService had no production callers and were deleted. Other features previously listed as deferred (vault sync, canvas generator, briefing, TUI, health endpoint, daemon lifecycle) are LIVE and shipping. See docs/plans/2026-05-15-craft-refactor-design.md for the audit method.
```

Use the Edit tool (not sed) so the exact match is enforced.

**Step 4: Confirm the file still parses**

Read the modified section to verify no broken markdown structure.

---

## Task 10: Add "Verifying dead code" section to CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md`

**Step 1: Find the right insertion point**

Read `CONTRIBUTING.md`. Find the section header "## Code Style" (or the last "##" section before it).

**Step 2: Insert the new section**

Insert this section above "## Code Style":

```markdown
## Verifying dead code

If you suspect code is unused, here is the method this project uses to confirm before proposing deletion. Apply it to any symbol or file:

1. **Search the shipped tree for callers.** Grep for the symbol across `memory-daemon/claudia_memory/`, `bin/`, `template-v2/`, and the top-level docs. Exclude the file that defines the symbol.
2. **Distinguish test-only references.** Run the same grep restricted to `memory-daemon/tests/`. If the only callers are in `test_<name>.py` for the same `<name>.py`, that is a strong signal of dead code.
3. **Confirm with package import sanity.** Delete the candidate file in a worktree, then run `python -c "import claudia_memory; from claudia_memory.mcp.server import *"`. Any import error means the code was wired in somewhere the grep missed.
4. **Run the full test suite.** `cd memory-daemon && ./test.sh` for Python; `npm test` for the installer. Pass count drops only by the number of tests you deleted with the candidate.
5. **Document the audit in the PR.** Include the grep commands you ran and their output, so the reviewer can replicate.

PR #59 (v1.59.0) is a worked example: see commit `<commit-hash>` for the audit-driven deletion of `verify.py` and `metrics.py`.
```

**Step 3: Verify markdown structure**

Run: `grep -c "^## " CONTRIBUTING.md`
Expected: section count increased by one.

---

## Task 11: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

**Step 1: Read the top of the file to learn the format**

Read `CHANGELOG.md` first 50 lines. Note the format of recent version blocks (heading style, date format, bullet structure).

**Step 2: Insert a new `## [1.59.0] - 2026-05-15` block**

Insert above the previous version block (do NOT touch the [Unreleased] heading if it exists; if it does, add the entry under it OR move the entry to a new versioned block, matching project convention).

Content:
```markdown
## [1.59.0] - 2026-05-15

### Removed
- `memory_daemon.services.verify.VerifyService` and the `run_verification` entry point. The module had no production callers since v1.35; only its own tests referenced it.
- `memory_daemon.services.metrics.MetricsService` and the `get_metrics_service` factory. The module was never wired into the scheduler, the MCP server, or any service. Only its own tests referenced it.
- Orphan test files for the above modules.

### Changed
- `MEMORY.md` corrected: the "permanently deferred" list misidentified six live features (vault sync, canvas generator, briefing, TUI, health endpoint, daemon lifecycle) as deferred. Replaced with accurate state.

### Documentation
- Added "Verifying dead code" section to `CONTRIBUTING.md` documenting the audit method used in this release.
- Refactor design plan: `docs/plans/2026-05-15-craft-refactor-design.md` (shipped in PR #58).

No user-visible behavior change. No CLI flag change. No MCP tool change. No database schema change.
```

**Step 3: Confirm the format matches existing blocks**

Read the new section in context with the version block above and below. Same heading depth. Same date format.

---

## Task 12: Bump version

**Files:**
- Modify: `package.json`
- Modify: `memory-daemon/pyproject.toml`

**Step 1: Bump `package.json` version**

Use Edit tool. Change:
```json
  "version": "1.58.0",
```
to:
```json
  "version": "1.59.0",
```

**Step 2: Bump `memory-daemon/pyproject.toml` version**

Change:
```toml
version = "1.0.0"
```

Wait. Check first. The Python package version may track separately. Read `memory-daemon/pyproject.toml` lines around `version =`.

If the Python version is "1.0.0" (independent of the npm version): leave it alone. The Python package is `claudia-memory` and is versioned independently per its release cadence.

If the project policy is to bump both: confirm by checking `CHANGELOG.md` for any mention of dual-versioning.

Default: bump only `package.json`. Note this decision in the commit message.

**Step 3: Verify version reads back correctly**

Run: `node -p "require('./package.json').version"`
Expected: `1.59.0`.

---

## Task 13: Integration smoke — install dry-run

**Files:** none modified

**Step 1: Dry-run the installer against a scratch directory**

The installer copies the shipped template. Confirm the new version of the daemon doesn't blow up at import time when copied.

Run:
```bash
node bin/index.js /tmp/claudia-pr1-smoke --skip-memory --yes 2>&1 | tail -20
```

Expected: completion with "Framework updated" or fresh install banner. No errors.

**Step 2: Confirm template-v2 was copied**

Run: `ls /tmp/claudia-pr1-smoke/.claude/skills/ | wc -l`
Expected: at least 40 (matches shipped skill count).

**Step 3: Clean up the scratch dir**

Run: `rm -rf /tmp/claudia-pr1-smoke`

---

## Task 14: Single commit

**Step 1: Confirm exactly the expected changes**

Run: `git status --short`
Expected output (file list only, no other changes):
```
 D memory-daemon/claudia_memory/services/verify.py
 D memory-daemon/claudia_memory/services/metrics.py
 D memory-daemon/tests/test_verify.py
 D memory-daemon/tests/test_metrics.py
 [possibly: D memory-daemon/tests/test_prediction_<name>.py]
 M MEMORY.md
 M CONTRIBUTING.md
 M CHANGELOG.md
 M package.json
 ?? docs/plans/2026-05-15-pr1-remove-dead-services.md
```

Plus the plan file (this document).

**Step 2: Stage the plan document**

Run: `git add docs/plans/2026-05-15-pr1-remove-dead-services.md`

**Step 3: Stage all changes**

Run: `git add -A`

**Step 4: Confirm the staged tree**

Run: `git diff --cached --stat`
Expected: roughly `-600 / +60` lines. Most changes are deletions in `memory-daemon/`.

**Step 5: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
chore(memory-daemon): remove dead VerifyService and MetricsService

Both services had no production callers and were kept alive only by their
own test files. Caller-trace verified across memory-daemon/, bin/, and
template-v2/.

Deletions:
- services/verify.py, tests/test_verify.py
- services/metrics.py, tests/test_metrics.py
[- tests/test_prediction_<name>.py per Task 4 verdict]

Docs:
- MEMORY.md: corrected "permanently deferred" list (six live features
  were falsely listed as deferred; replaced with accurate state).
- CONTRIBUTING.md: added "Verifying dead code" section documenting the
  audit method used here.
- CHANGELOG.md: 1.59.0 entry.

No user-visible behavior change. No CLI flag change. No MCP tool change.
No database schema change.

Refs: docs/plans/2026-05-15-craft-refactor-design.md (PR #58)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: single commit hash output.

---

## Task 15: Push branch + open draft PR

**Step 1: Push the branch**

Run: `git push -u origin chore/pr1-remove-dead-services`
Expected: `new branch` line.

**Step 2: Open the draft PR**

Run:
```bash
gh pr create --draft --base main --head chore/pr1-remove-dead-services \
  --title "chore(memory-daemon): remove dead VerifyService and MetricsService" \
  --body "$(cat <<'EOF'
## Summary

Deletes two services that had no production callers (only test-only references):
- \`memory_daemon.services.verify.VerifyService\` (~280 lines)
- \`memory_daemon.services.metrics.MetricsService\` (~290 lines)

Plus orphan tests. ~600 lines removed.

## Audit method

See \`CONTRIBUTING.md\` (added in this PR) for the full audit method. Summary:
1. Grep across \`memory-daemon/claudia_memory/\`, \`bin/\`, \`template-v2/\` for the symbol.
2. Confirm only test files reference it.
3. Delete in a worktree, then \`python -c "import claudia_memory; from claudia_memory.mcp.server import *"\` to catch dynamic imports.
4. Run \`./test.sh\` to confirm pass count drops only by the number of deleted tests.

## Stability contract

- CLI surface unchanged
- MCP tool names unchanged
- Skill names / triggers unchanged
- Database schema unchanged
- Vault layout unchanged

## Test plan

- [x] \`cd memory-daemon && ./test.sh\` passes
- [x] \`npm test\` passes (25/25)
- [x] \`node bin/index.js /tmp/scratch --skip-memory --yes\` succeeds
- [x] Python package imports clean after deletion

## Design reference

This PR is the first of four in the craft refactor. See \`docs/plans/2026-05-15-craft-refactor-design.md\` (shipped in #58).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: prints PR URL.

**Step 3: Record the PR URL**

Report the URL back. Mark all tasks complete.

---

## Rollback strategy

If any step after Task 5 reveals a problem:

| Stage | Rollback |
|-------|----------|
| Task 5–7 (deletions, uncommitted) | `git checkout HEAD -- memory-daemon/` |
| Task 8 (post-deletion test failure) | `git checkout HEAD -- memory-daemon/`; investigate which import broke |
| Task 14 (committed) | `git reset --soft HEAD~1` to unstage; fix; re-commit |
| Task 15 (pushed) | `git push origin --delete chore/pr1-remove-dead-services`; reopen worktree |
| Post-merge regression | `git revert <merge-commit>` on main; cut a patch release |

The single-commit structure makes every step trivially revertable.

---

## Out of scope for this PR (handled in PR2, PR3, PR4)

- Installer monolith split (PR2).
- Skill cataloguing (PR3).
- Subpackage READMEs (PR4).
- Persona content reduction (not in this refactor).
- Schema changes (not in this refactor).
- MCP tool renames (not in this refactor).
