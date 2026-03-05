---
name: deep-context
description: Full-context deep analysis for meeting prep, relationship analysis, or strategic planning. Pulls up to 180 memories across multiple dimensions for comprehensive synthesis. Use when "deep dive", "full context", "everything about", "strategic analysis", or when preparing for important meetings.
effort-level: max
---

# Deep Context

Comprehensive deep analysis that leverages the full context window. Pulls memories across multiple dimensions and synthesizes them into an actionable intelligence brief.

## When to Use

- **Deep meeting prep** - "I need everything about Sarah Chen before tomorrow's board meeting"
- **Relationship analysis** - "What's the full picture with Acme Corp?"
- **Strategic planning** - "Deep dive on all our investor relationships"
- **Pattern synthesis** - "What patterns have emerged in the last quarter?"
- **Decision support** - "I need full context before making this call"

## The Deep Pull

Call the `memory.deep_context` MCP tool with the target entity or topic. This compound tool executes the full pipeline server-side in a single call:

1. **Entity core** (limit=50): Everything known about the target (memories, relationships, metadata)
2. **Semantic recall** (limit=50): Broad search to catch indirect references and related topics
3. **Connected entities** (top 3 by strength, limit=10 each): Network context around the target
4. **Temporal sweep** (limit=30): Observations, learnings, and commitments for time-sensitive items
5. **Episode context** (limit=20): Session narratives mentioning the target

All results are deduplicated by memory ID across steps. The tool returns structured JSON with sections for each step plus aggregate stats.

### Parameters

All limits are configurable via the tool's input:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `target` | (required) | Entity name or topic |
| `entity_limit` | 50 | Max memories from entity lookup |
| `recall_limit` | 50 | Max from broad semantic search |
| `connected_limit` | 10 | Max per connected entity |
| `max_connections` | 3 | How many connected entities to pull |
| `temporal_limit` | 30 | Max temporal items |
| `episode_limit` | 20 | Max episodes |

### Fallback (when memory daemon is unavailable)

If the MCP tool is not available, execute these queries manually using `memory.about` and `memory.recall` MCP tools sequentially:

1. `memory.about` with the target (limit=50)
2. `memory.recall` with the target (limit=50)
3. `memory.about` for each of the top 3 connected entities (limit=10)
4. `memory.recall` with types=["observation","learning","commitment"] (limit=30)
5. `memory.recall` for "session with [target]" (limit=20)
6. Deduplicate by memory ID across all steps

If the memory daemon itself is down, fall back to reading `context/` files and `people/*.md` directly. Note degraded mode in output.

## Edge Cases

- **Entity not found**: If Step 1 returns 0 results, return early: "No memories about [entity]. Try a different name or spelling."
- **Sparse connections**: If fewer than 3 connections exist, pull all available. Skip Step 3 entirely if 0 connections.
- **CLI unavailable**: Fall back to reading `context/` files and `people/*.md` directly. Note degraded mode in output.
- **Contradictions**: When Step 1 and Step 2 return conflicting data, include both with `origin_type` labels so the user can resolve.

## Synthesis Format

After gathering all data, synthesize into this structure:

```
**🔍 Deep Context: [Entity Name]**

### Executive Summary
[2-3 sentence overview: who they are, current status, why they matter]

### Key Facts
- [Most important facts, ordered by recency and importance]

### Relationships & Network
- [Entity] → [Connected Person]: [Nature of relationship, strength, recent activity]
- [Map of key connections with context]

### Timeline
- [Chronological view of significant events, decisions, milestones]
- [When relationship started, key inflection points]

### Patterns & Observations
- [Recurring themes across interactions]
- [Communication style observations]
- [Behavioral patterns worth noting]

### Open Items
- **Active commitments**: [What's promised, by whom, when]
- **Waiting on**: [What we're expecting from them]
- **Unresolved**: [Questions, tensions, or decisions pending]

### Strategic Implications
- [What this context means for upcoming decisions]
- [Risks to watch]
- [Opportunities to consider]

---
*Deep context assembled from [N] memories across [M] entities. Data spans [date range].*
```

## Guardrails

- **Don't fabricate connections.** If the data doesn't show a pattern, say so. "Insufficient data" is a valid finding.
- **Signal confidence levels.** Use the Trust North Star principles: cite whether information is user_stated, extracted, or inferred.
- **Surface contradictions.** If different memories disagree, present both sides rather than picking one.
- **Respect recency.** More recent information generally supersedes older data, but flag the change.
- **Cap at 200 total memories.** Even with 1M context, synthesis quality degrades beyond 200 data points. Focus on the most relevant.

## Performance Notes

This skill makes 6-8 CLI calls (Steps 1-5 plus up to 3 connected entity lookups). Total memory budget: ~180 max (50+50+30+30+20). Designed for the 1M context window where pulling this many memories is practical without compaction risk. For quick lookups, use `claudia memory about` directly. Reserve `/deep-context` for when you need the full picture.
