# services/

Business logic for the memory daemon. One module per concern. Every MCP tool exposed by `mcp/server.py` ultimately calls into a function here.

## Where to look first

| Concern | File | Public entry points |
|---------|------|--------------------|
| Write a memory, entity, or relationship | `remember.py` | `remember_fact`, `remember_entity`, `relate_entities`, `invalidate_memory` |
| Recall memories or find entities | `recall.py` | `recall`, `recall_about`, `search_entities`, `deep_recall` |
| Background decay + dedup + pattern detection | `consolidate.py` | `run_full_consolidation`, decay/dedup helpers, prediction lifecycle |
| Entity type inference and naming | `entities.py` | `infer_entity_type` |
| Memory and input validation rules | `guards.py` | `validate_memory`, `validate_entity`, `validate_relationship` |
| File storage for filed source material | `filestore.py`, `documents.py` | `LocalFileStore`, document filing pipeline |
| Provenance and audit trail | `audit.py` | source links, correction history |
| Bulk historical fixes | `backfill.py` | one-shot maintenance utilities |
| Compact session summaries for greeting | `context_builder.py` | `build_briefing_context` and friends |
| Multi-document intake pipeline | `ingest.py` | the Extract-Then-Aggregate flow |
| Obsidian vault projection | `vault_sync.py`, `canvas_generator.py` | PARA-layout write of entities, MOC canvases |

## Conventions

- **Soft-delete columns differ by table.** `memories.invalidated_at` vs. `entities.deleted_at`. Always check the schema before writing recall queries that filter "active" rows.
- **Embedding storage is JSON text** (via `json.dumps`), not binary `struct.pack` blobs. Match this when writing new embedding paths.
- Functions exported from a service module are the unit of testability. Tests for `recall.py` live at `tests/test_recall*.py` and call the module's public functions directly. Don't add internal coupling that bypasses those entry points.
