# Proposal 03: Pre-write conflict gate

**Status**: Proposal · **Effort**: ~1 week + 2-3 days for resolution CLI · **Batch**: Architectural (ship with #05 and #07)

## TL;DR

Before `memory_remember` writes a fact, the daemon checks the new fact against existing memories about the same entity and flags contradictions. Today, conflicts surface only via post-hoc audit. This pattern is the core of mem0's quality story and is the single biggest trust improvement available.

## The problem

A user tells Claudia: *"Ford Perry is the CFO."* Two weeks later: *"Ford Perry is the COO."* Both get stored. On recall, both might surface, depending on importance/recency. The user thinks Claudia is confused; really, Claudia stored both and didn't notice they conflict.

The `corrected_from` column exists for explicit corrections but isn't a pre-write gate. It works only when the writer knows they're correcting something.

## The fix

Add a pre-write conflict-check step in `services/remember.py`. Before persisting a fact:

1. Run `memory_recall` on the entity to fetch existing related memories
2. Ask a small/local LLM (or rule-based pattern matcher for role/status changes): does the new fact contradict any existing one?
3. Outcomes:
   - `consistent` → write normally
   - `duplicate` → don't write; increment `access_count` on existing memory
   - `contradicts` → write the new one AND mark both with `verification_status='conflict'`, set `corrected_from` link

New MCP tool: `memory_conflicts(entity)` returns flagged pairs awaiting human review.

New CLI command: `claudia memory conflicts --resolve` walks through pairs interactively (keep new, keep old, both true, both false, merge).

## Surface area

```
memory-daemon/claudia_memory/services/
  ├── conflict_check.py                # NEW: LLM-driven contradiction detection
  └── remember.py                      # hook conflict_check into write path
memory-daemon/claudia_memory/mcp/server.py    # register memory_conflicts tool
claudia/bin/commands/conflicts.js             # interactive resolution CLI
docs/conflict-resolution.md
```

No schema changes — just a new value `conflict` in the existing `verification_status` enum.

## Why elegant

- No schema migration
- Makes the existing `corrected_from` and `verification_status` columns first-class citizens in a workflow rather than vestigial
- Plays well with `meditate` reflection review — same UX pattern
- Configurable: users can disable the LLM check and fall back to rule-based heuristics (role changes, location changes, status changes) for privacy or speed
- Failure-soft: if the conflict-check service is unavailable, fall through to a write with a `verification_status='unchecked'` flag and surface a count in `claudia daemon status`

## Testing plan

- Unit tests: hand-crafted fact pairs labeled `consistent`/`duplicate`/`contradicts`, verify the gate classifies correctly
- Integration: write `Ford Perry is CFO`, then write `Ford Perry is COO`, assert conflict is flagged and both surface in `memory_conflicts(Ford Perry)`
- Latency: assert pre-write check adds < 500ms on consumer hardware with a local LLM
- Privacy: confirm no fact content leaves the local machine when the rule-based heuristic mode is active

## Open questions

- **Which model for the LLM check?** Options: a local Ollama model (consistent with the embedding dependency), or a small remote API. Local default with API opt-in seems right.
- Should we skip the gate for `memory_type=observation` to avoid over-flagging?
- **Auto-resolution**: if the new fact has a much higher `confidence` and is explicitly framed as a correction (e.g., "Ford is now COO"), should the gate auto-supersede rather than flag?
- How does this interact with Proposal #05's `valid_from`/`valid_to` columns? Likely a clean compose: conflict resolution that says "both true but old one expired" sets `valid_to` on the older fact.

## Related

- Pairs with Proposal #05 (bi-temporal validity windows) and Proposal #07 (pattern review) as the Architectural release.
- Resolves a known failure mode where the same person gets stored with two conflicting titles, jobs, or relationships.

## References

- [mem0 2026 benchmark](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [mem0 paper (arXiv:2504.19413)](https://arxiv.org/abs/2504.19413)
