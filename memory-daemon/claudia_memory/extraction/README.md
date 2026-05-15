# extraction/

Pulling structured signal out of free-form text. Used by the remember pipeline (to identify which entities a memory is about) and by the ingest flow (to extract entities, commitments, and dates from longer documents).

## Where to look first

| Concern | File | Notes |
|---------|------|-------|
| Named-entity recognition | `entity_extractor.py` | Detects people, organizations, projects, concepts. Uses spaCy when the optional `[nlp]` extra is installed; falls back to pattern-based heuristics otherwise. |
| Date and time parsing | `temporal.py` | Resolves relative phrases (e.g., "next Thursday") to absolute dates in the user's timezone. Used by commitment detection and event extraction. |

## Conventions

- **spaCy is optional.** Anything in `extraction/` must work without it. Test the no-spaCy path. If you require it, gate behind a clear `ImportError` message that tells the user to install `claudia-memory[nlp]`.
- **Return structured results, never raw text.** Extractors emit typed dicts or dataclasses; the caller decides how to render them. This keeps the boundary clean and the call sites testable.
- **Idempotent on re-extraction.** If a document is re-ingested, extractors must produce the same result. No hidden state.
