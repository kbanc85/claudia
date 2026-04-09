# Data

Data artefacts that support roadmap execution. CSVs, JSON fixtures, test corpora, anything data-shaped that the phases reference.

## Current contents

- **`rebrand-map.csv`** — Phase 0 Task 0.2 seed. All known Hermes → Claudia renames and string replacements from the roadmap. Start-of-work state, not the final list; Phase 0.2 will add to it after running the full `grep` sweep.
- **`rebrand-map.notes.md`** — the "strings to NOT replace" list and per-row explanations that don't fit in a CSV.

## What belongs here

- CSVs with structured data (rebrand tables, skill audits, test matrices)
- JSON fixtures used by tests
- Compatibility reports from the model compatibility test script (Phase 3.2)
- Any other data artefact a phase produces or consumes

## What does not belong here

- Documentation → `../phases/`, `../decisions/`, `../notes/`
- Scripts → `../scripts/`
- Source code → the `fork/` submodule, not here
- Secrets / API keys → nowhere in this repo. Ever.
