# rebrand-map notes

Companion file to `rebrand-map.csv`. Holds the context that doesn't fit in CSV rows.

## Strings that must NOT be replaced

The `grep` sweep in Phase 0 Task 0.2 will turn up these, and they must be skipped:

- **`hermetic`** — not related to Hermes. Common in Nix and build-system vocabulary.
- **Local `hermes` variables inside function bodies** — some code uses `hermes = ...` as a local reference. Review manually before any automated replacement.
- **Binary files** (`.png`, `.gif`, `.jpg`, etc.) — never run `sed` on binaries. If a binary has `hermes` in metadata, replace the whole file from the Claudia `assets/` set.
- **Lock files** (`package-lock.json`, `pnpm-lock.yaml`, `uv.lock`, `Cargo.lock`, etc.) — do not hand-edit. Regenerate after the source files are updated.

## Keep-as-is decisions (do NOT rename or rebrand)

These files/names contain `hermes` but refer to something other than Hermes Agent. Flagged during the C1 inventory; keep untouched in all rebrand passes.

- _(none at present; `environments/tool_call_parsers/hermes_parser.py` was initially flagged as a keep-candidate because "Hermes" is also a public tool-call format name from Nous Research's Hermes-2-Pro models, but the entire `environments/` directory was subsequently deleted as Atropos RL research tooling, so this is moot.)_

## Scope deletions (not rebrand, out of scope for Claudia)

These were deleted in C1 because they're research tooling unrelated to Claudia's chief-of-staff purpose, not because of naming:

- **`environments/`** — Atropos RL training infrastructure (per the directory's own README). The real execution backends Claudia actually uses live at `tools/environments/` (`local.py`, `docker.py`, `modal.py`, `ssh.py`, `daytona.py`, `singularity.py`). The roadmap's "keep environments/" list conflated the two paths.
- **`optional-skills/mlops/hermes-atropos-environments/`** — skill documenting Atropos usage, with nothing to document after the deletion above.
- **`mini_swe_runner.py`** — SWE-Bench runner orphaned from the removed `mini-swe-agent/` submodule.
- **`RELEASE_v0.4.0.md` through `v0.7.0.md`** — historical Hermes release notes beyond the roadmap's listed v0.2/v0.3. Claudia starts its own release history at v0.1.0-beta.
- **Atropos-dependent tests**: `tests/test_agent_loop.py`, `test_agent_loop_tool_calling.py`, `test_agent_loop_vllm.py`, `test_managed_server_tool_support.py`, `test_tool_call_parsers.py`.

## Per-row notes

### `RELEASE_v0.2.0.md` through `RELEASE_v0.7.0.md`
Historical Hermes release notes. Deleted in C1. Claudia Autonomous starts its own release note history at `v0.1.0-beta` in Phase 7.

### `AGENTS.md`
This is Hermes's "agent definition" file. It must be fully rewritten for Claudia, not just find/replaced. Track the rewrite as part of Task 1.5 (docs rewrite).

### `hermes claw` → `claudia migrate`
This is not a simple rename. Hermes's `claw migrate` imports from OpenClaw. Claudia's `migrate` will import from both Hermes and OpenClaw. The command name changes, the import logic expands (Phase 6 Task 6.6).

### `NousResearch` → `kbanc85`
Only in URLs (GitHub repo refs). Leave textual attribution to `Nous Research` for prose contexts where crediting the upstream authors is appropriate — use `Nous Research` → `Kamil Banc` only in the primary-author sense, not when Hermes itself is being credited.

### `nousresearch.com`
Case-by-case review. Sometimes these are legitimate links to Hermes documentation (keep), sometimes they're landing-page redirects that no longer apply (remove).

## Process reminder

From the roadmap:

> Run `grep -rn "hermes" --include="*.py" --include="*.yaml" --include="*.md" --include="*.sh" --include="*.toml" --include="*.json" --include="*.nix" --include="*.txt" .` to build the complete list. Apply with targeted sed per file, not global. Review each change. Budget a full day.

**Global sed is tempting and wrong.** Every hit needs human review. The CSV is the starting set, not the finishing set.

## Success criterion (from Phase 0.2)

> `grep -ri "hermes" --include="*.py" --include="*.yaml" --include="*.md" --include="*.sh"` returns zero results in user-facing files. Internal comments may retain historical references with a `# Originally from Hermes Agent (MIT)` note.
