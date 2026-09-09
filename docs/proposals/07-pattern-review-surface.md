# Proposal 07: Pattern review surface

**Status**: Proposal · **Effort**: ~1 week · **Batch**: Architectural (ship with #03 and #05)

## TL;DR

Auto-detected patterns accumulate without review (a few hundred in a moderate-sized DB is typical). Add a `claudia patterns review` CLI command plus a weekly digest auto-memory that surface un-reviewed patterns for accept / dismiss / promote-importance. Same UX shape as `meditate` reflection review.

## The problem

The daemon's `pattern_detection` job runs on an interval and auto-creates patterns from accumulated memories. Useful for surfacing trends, but unreviewed patterns become noise in recall. The user has no surface to see what was detected, accept what's true, dismiss what isn't, or promote what's important.

The existing `predictions` table is similar in spirit and also lacks a review surface.

## The fix

Schema additions:

```sql
ALTER TABLE patterns ADD COLUMN reviewed_at TIMESTAMP;
ALTER TABLE patterns ADD COLUMN review_status TEXT;
-- 'pending', 'accepted', 'dismissed', 'promoted'

CREATE INDEX idx_patterns_review ON patterns(review_status, reviewed_at);
```

New MCP tool: `memory_patterns_review(limit, since)` returns un-reviewed patterns with their supporting evidence (memories and entity links).

New CLI command:

```
claudia patterns review
```

Interactive: walks through un-reviewed patterns, shows evidence, asks accept / dismiss / promote / skip. Promoted patterns get `importance` bumped to a configured high band so they surface prominently in recall.

Weekly digest: at Sunday 09:00 the daemon writes a low-importance auto-memory listing un-reviewed patterns from the past week. Shows up in Kamil's morning brief; he can run `claudia patterns review` when ready.

## Surface area

```
memory-daemon/claudia_memory/schema.sql                          # schema migration
memory-daemon/claudia_memory/services/patterns.py                # add review_status filter
memory-daemon/claudia_memory/mcp/server.py                       # register memory_patterns_review
memory-daemon/claudia_memory/daemon/scheduler.py                 # add weekly digest job
claudia/bin/commands/patterns-review.js                          # interactive CLI
docs/patterns-review.md
```

## Why elegant

- Mirrors the existing `meditate` reflection review workflow (proven UX in this repo)
- Backwards-compatible: existing pattern queries filter to `review_status IN ('accepted', 'promoted')` OR `review_status IS NULL` by default; dismissed patterns are excluded but preserved
- One new scheduler job, one new CLI command, one schema migration with two columns
- Lays groundwork for similar review surfaces on `predictions` and `reflections`

## Testing plan

- Migration test on existing pattern table completes without errors
- Interactive CLI: keyboard-navigable, supports "go back" within a session
- Verify dismissed patterns no longer surface in `memory_recall` results
- Verify promoted patterns rank higher than equivalent un-promoted ones

## Open questions

- Should `dismissed` patterns be hard-deleted after some retention period? Soft-delete preserves audit but accumulates over time. Recommend soft-delete with a 12-month retention.
- Should the daemon use the existing `meditate` UX (a presented batch with one approval) instead of a separate review surface? Faster to ship, but patterns are typically more numerous than meditation reflections, so the per-pattern workflow is better.
- Slack/Discord delivery of the weekly digest? Out of scope for v1; surface only via morning brief auto-memory.

## Related

- Pairs with Proposal #03 (conflict gate) and Proposal #05 (bi-temporal validity windows) as the Architectural release. Together they form a "memory that knows it's wrong sometimes" feature set.
- Independent enough to ship standalone if the others are delayed.

## References

- The existing `meditate` skill flow for reflection approval is the closest internal analog. See `meditate/SKILL.md` for the per-item approval UX.
