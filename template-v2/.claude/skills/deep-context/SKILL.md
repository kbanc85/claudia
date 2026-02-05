---
name: deep-context
description: Full-context deep analysis for meeting prep, relationship analysis, or strategic planning. Pulls 100-200 memories across multiple dimensions for comprehensive synthesis. Use when "deep dive", "full context", "everything about", "strategic analysis", or when preparing for important meetings.
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

Execute these memory queries to build a comprehensive picture:

### Step 1: Entity Core (limit=50)

```
memory.about(entity=[target], limit=50)
```

Get everything known about the primary entity: memories, relationships, metadata, recent sessions.

### Step 2: Semantic Recall (limit=50)

```
memory.recall(query=[target + context], limit=50)
```

Broad semantic search to catch memories that reference the entity indirectly or discuss related topics.

### Step 3: Connected Entities (limit=20 each, top 5 connections)

From the relationships returned in Step 1, identify the top 5 connected entities and pull context on each:

```
For each of top 5 related entities:
  memory.about(entity=[connected], limit=20)
```

This surfaces the network around the target: who they work with, what those people are doing, shared context.

### Step 4: Temporal Sweep (limit=50)

```
memory.recall(query=[target], limit=50, types=["observation", "learning", "commitment"])
```

Pull time-sensitive items: observations that reveal trends, learnings that inform approach, commitments that need tracking.

### Step 5: Episode Context

```
memory.recall(query="session with [target]", limit=20)
```

Find session narratives that mention the target to understand the arc of the relationship over time.

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

This skill makes 8-12 memory calls. It's designed for the 1M context window where pulling 100-200 memories is practical without compaction risk. For quick lookups, use `memory.about` directly. Reserve `/deep-context` for when you need the full picture.
