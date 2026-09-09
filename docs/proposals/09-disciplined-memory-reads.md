# Proposal 09: Disciplined memory reads — briefing-first protocol, recall-before-draft hook, API consistency

**Status**: Proposal · **Effort**: 1 week · **Batch**: Memory intelligence (with #08 and #10)

## TL;DR

Today the memory MCP is effectively write-only from the agent's side. The agent writes memories diligently and queries them rarely — `memory.briefing` is skipped at session start despite being prescribed in `CLAUDE.md`, `memory.about` is not called before drafting entity-specific work, and `memory.recall` is not called before recurring patterns even when the canonical rule is already in memory. This PR makes the read discipline structural rather than aspirational, and cleans up the inconsistent parameter names across read-side tools.

## The problem (concrete repro from 2026-05-13)

Across a five-day session arc (May 7-12, 2026) the agent produced four newsletter editions, three carousel formats, seven public-repo PRs, and a complete sponsorship-conversation thread. Memory writes during the session: ~22 new memory records. Memory reads: 1 `memory.briefing`, 0 `memory.about`, 0 `memory.recall` before drafting tasks.

When a `memory.recall("AIAC carousel writing voice cold scroller rule")` was finally run at the end of the session, it returned five high-importance memories that were directly relevant to each carousel draft I'd made earlier. The rules were already in memory the whole time. The agent rediscovered them through user correction instead of through recall.

Plus an API-surface inconsistency:

| Tool | Parameter shape |
|---|---|
| `memory.remember` | `entities: ["name1", "name2"]` |
| `memory.about` | `entity: "name1"` |
| `memory.relate` | `source: "name1", target: "name2", relationship: "type"` |
| `memory.entities` | `operation: "search", query: "name1"` |

Four read-adjacent tools, four different conventions. Each one a small learning cost; together they meaningfully slow agent fluency on the MCP.

## The fix

Three changes:

### 1. Hard rule + session-start hook

Create `claudia/.claude/rules/memory-usage-discipline.md` that codifies the protocol:

- **Session start**: `memory.briefing` MUST be the first action of every session. If the daemon is unavailable, disclose to the user immediately (existing `memory-availability.md` rule covers this).
- **Before entity-specific work**: when a named person, organisation, or project is the subject of a draft (email, document, brief, edit), call `memory.about` on that entity first. If the entity doesn't exist, create it as part of the work.
- **Before recurring-pattern work**: when the task matches a known pattern (newsletter edition, carousel build, PDF generation, sponsor pitch, meeting prep), call `memory.recall` with the canonical pattern term first. Surface what's already saved before drafting.

Pair the rule with a `SessionStart` hook (`.claude/hooks/session-start-briefing.py`) that automatically fires `memory.briefing` and emits the result as a system message. The hook closes the "I forgot to call briefing" failure mode by making it impossible to miss.

### 2. `UserPromptSubmit` hook for entity-aware pre-fetch

Add `.claude/hooks/entity-prefetch.py`. Before each user prompt is processed:

- Extract candidate entity names from the prompt (regex for capitalised multi-word phrases + the existing entity dictionary from `memory.entities`)
- For each candidate, fire `memory.about` in parallel
- Inject the results into the agent's context as a `<memory-context>` block before the prompt reaches the model

The agent never has to remember to call `memory.about` — the system pre-fetches based on whose name is in the user's message. Failure mode is silent (if no entity matches, the block is empty; the prompt proceeds unchanged).

### 3. API parameter consistency cleanup (additive)

Without breaking existing callers, accept consistent parameter names across all read-side tools:

| Tool | Current | Add as alias |
|---|---|---|
| `memory.about` | `entity` | `entity_name`, `name` |
| `memory.relate` | `source`, `target`, `relationship` | `source_entity`, `target_entity`, `relationship_type` |
| `memory.recall` | `query` | `q`, `search` |

The MCP server normalises whichever variant arrives. Existing integrations keep working; agents fluent in any reasonable convention can call cleanly. A v2 of the MCP can deprecate aliases later if desired.

## Surface area

```
claudia/.claude/rules/memory-usage-discipline.md    # NEW: the protocol
claudia/.claude/hooks/session-start-briefing.py     # NEW: auto-briefing
claudia/.claude/hooks/entity-prefetch.py            # NEW: prompt-side pre-fetch
claudia/.claude/settings.json                       # register both hooks
memory-daemon/claudia_memory/mcp/server.py          # accept aliased parameter names
docs/memory-usage-discipline.md                     # user-facing docs
```

## Why elegant

- **The rule plus the hooks are belt-and-braces.** The rule tells the agent what to do; the hook makes it impossible to forget. Either alone is fragile; together they're durable.
- **Pre-fetch is failure-soft.** No entity match → no context injection → prompt proceeds unchanged. Nothing breaks if the daemon is offline or the entity table is empty.
- **API aliases are additive.** Zero risk of breaking existing scripts. Cleanup of the inconsistency without a coordinated upgrade.
- **Pairs with proposal #08.** The smarter writes from #08 make the read path actually useful — entities exist to be queried, recall actually surfaces relevant material.

## Testing plan

- Unit: hook scripts produce expected `<memory-context>` blocks given fixture prompts and a stub daemon
- Integration: simulate a session that mentions "Matt Blumberg" → verify the pre-fetch fires and the about-result is injected before the agent generates a reply
- Regression: existing callers using `entity=`/`source=`/`relationship=` continue to work; new callers using `entity_name=`/`source_entity=`/`relationship_type=` also work
- Manual: write a sample session that drafts a newsletter and verify `memory.recall` fires before the draft prompt reaches the model

## Open questions

- **Hook latency budget.** `entity-prefetch.py` adds round-trip time to every user prompt. Cap at e.g. 300ms with timeout; if the daemon doesn't respond in time, skip and let the prompt through.
- **What counts as a "named entity" for pre-fetch?** Conservative: only names that already exist in the entity table (cheap lookup). Aggressive: NER on the prompt to find new candidates (slower, higher recall). Recommend conservative for v1 because it's bounded; #08 already handles entity creation on the write side.
- **Hook failure visibility.** If the hook fails (daemon offline, exception), should the agent know? Recommend yes — emit a brief warning to the agent's context so it can disclose to the user that recall is degraded.

## Related

- Pairs with Proposal #08 (smarter writes) and Proposal #10 (proactive surfacing) as the Memory Intelligence release.
- Implements the read discipline the existing `CLAUDE.md` session-start protocol prescribes but doesn't enforce.
