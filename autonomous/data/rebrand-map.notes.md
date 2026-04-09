# rebrand-map notes

Companion file to `rebrand-map.csv`. Holds the context that doesn't fit in CSV rows.

## Strings that must NOT be replaced

The `grep` sweep in Phase 0 Task 0.2 will turn up these, and they must be skipped:

- **`hermetic`** — not related to Hermes. Common in Nix and build-system vocabulary.
- **Local `hermes` variables inside function bodies** — some code uses `hermes = ...` as a local reference. Review manually before any automated replacement.
- **Binary files** (`.png`, `.gif`, `.jpg`, etc.) — never run `sed` on binaries. If a binary has `hermes` in metadata, replace the whole file from the Claudia `assets/` set.
- **Lock files** (`package-lock.json`, `pnpm-lock.yaml`, `uv.lock`, `Cargo.lock`, etc.) — do not hand-edit. Regenerate after the source files are updated.

## Per-row notes

### `RELEASE_v0.2.0.md` and `RELEASE_v0.3.0.md`
These are historical Hermes release notes. Delete outright — Claudia Autonomous will start its own release note history at `v0.1.0-beta`.

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
