# Proposal 05: Bi-temporal validity windows on memory edges

**Status**: Proposal · **Effort**: 2-3 weeks · **Batch**: Architectural (ship with #03 and #07)

## TL;DR

Add `valid_from` and `valid_to` columns to `memories` (and to `relationships`). When a fact is corrected or expires, close the old fact's window with `valid_to = now()` rather than marking it `corrected_from`. This is Graphiti's core architectural idea, unlocking temporal queries (*"what did I believe about X in March?"*) and making correction history queryable.

## The problem

Claudia-memory has a `corrected_from` column that points the new fact at the one it superseded. That's fine for "what's the current correct fact?" but doesn't answer "what was true at time T?" — a query category that becomes useful as the memory ages.

Today's model is also asymmetric: facts that become invalid because the world changed (someone changed jobs, a project ended, a company rebranded) are handled the same way as facts that were always wrong (a typo, a misremembered date). Bi-temporal models distinguish these cleanly.

## The fix

Borrow Graphiti's pattern. Two time axes on every fact:
- **event time** (the world): `valid_from`, `valid_to`. When was this fact true in reality?
- **ingestion time** (the system): `created_at`, `updated_at`. When did we learn it?

Schema migration:

```sql
ALTER TABLE memories ADD COLUMN valid_from TIMESTAMP;
ALTER TABLE memories ADD COLUMN valid_to TIMESTAMP;
ALTER TABLE relationships ADD COLUMN valid_from TIMESTAMP;
ALTER TABLE relationships ADD COLUMN valid_to TIMESTAMP;

UPDATE memories SET valid_from = created_at WHERE valid_from IS NULL;
UPDATE relationships SET valid_from = created_at WHERE valid_from IS NULL;

CREATE INDEX idx_memories_validity ON memories(valid_from, valid_to);
CREATE INDEX idx_relationships_validity ON relationships(valid_from, valid_to);
```

Recall changes:
- Default queries filter by `valid_to IS NULL OR valid_to > now()` (currently-valid only)
- New MCP tool: `memory_as_of(entity, timestamp)` returns the memory graph valid at that timestamp
- When a fact is corrected via the gate (Proposal #03), the old fact gets `valid_to = now()` instead of being orphaned

## Surface area

```
memory-daemon/claudia_memory/schema.sql              # schema migration
memory-daemon/claudia_memory/migration.py            # auto-apply on startup
memory-daemon/claudia_memory/services/recall.py      # add validity filter
memory-daemon/claudia_memory/services/remember.py    # set valid_from on write
memory-daemon/claudia_memory/mcp/server.py           # register memory_as_of tool
docs/temporal-memory.md
```

## Why elegant

- Backwards-compatible: existing tools see only currently-valid memories by default
- Unlocks a query class that isn't possible today
- Makes the relationship between "fact changed" and "fact was wrong" structural rather than implicit
- Plays well with the conflict gate (#03) — when conflict is resolved as "both true but the old one expired," the gate sets `valid_to` on the older fact
- Plays well with consolidation — temporal windows make pattern detection more precise

## Testing plan

- Migration test: backfill on a representative DB (~2k memories) completes within a sensible time budget and without errors
- Unit: `memory_as_of(entity, T)` returns the expected snapshot at T
- Integration: write fact A at t1, supersede with fact B at t2, assert `recall` returns B; assert `as_of(t1.5)` returns A
- Sanity: ensure the validity filter doesn't break existing recall queries that don't know about the new columns

## Open questions

- How to handle the case where the user doesn't know `valid_from` (most common). Default: `valid_from = created_at`. But for facts about historical events, `valid_from` may be earlier. Should `memory_remember` accept an optional `valid_from` argument?
- What about facts with no end date and no expectation of one (e.g., "I was born on June 15"). These have `valid_from = 1985-06-15` but should never get a `valid_to`. Default `valid_to = NULL` handles this fine.
- Should the visualizer expose a "history" view per entity (timeline of when each fact was learned and when it expired)?
- Naming: `valid_from`/`valid_to` (PostgreSQL convention) vs `effective_from`/`effective_to` (warehouse convention). Recommend the former.

## Related

- Pairs with Proposal #03 (conflict gate) and Proposal #07 (pattern review) as the Architectural release.
- Unlocks future work: temporal pattern detection ("preferences that changed in 2026"), entity-state timelines, audit reports.

## References

- [Graphiti paper (arXiv:2501.13956)](https://arxiv.org/abs/2501.13956)
- [Graphiti GitHub](https://github.com/getzep/graphiti)
- [Zep + Neo4j blog](https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/)
