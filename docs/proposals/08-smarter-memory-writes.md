# Proposal 08: Smarter memory writes — auto-entity extraction, type inference, proper linking

**Status**: Proposal · **Effort**: 1-2 weeks · **Batch**: Memory intelligence (with #09 and #10)

## TL;DR

Today's `memory.remember` with an `entities` field does not actually create or link entities. The string labels are silently ignored at the entity-table layer. `memory.relate` does auto-create entities but assigns the default type `person` to everything, so organisations and projects get mistyped. The result is that the entity graph grows much slower than the fact graph, and `memory.about` returns empty for people the agent has clearly been talking about for sessions.

## The problem (concrete repro from 2026-05-13)

During the AIAC sponsorship work, three `memory.remember` calls saved facts about Matt Blumberg (CEO Markup AI), Holly (Head of Marketing Markup AI), and Markup AI itself. Each call included an `entities` array naming the relevant entities. After all three saves:

```
memory.about(entity="Matt Blumberg")    → {entity: null, memories: [], relationships: []}
memory.entities(query="Matt Blumberg")  → []
memory.entities(query="Holly")          → []
memory.entities(query="Markup AI")      → []
```

The entities did not exist. The three facts were stored as floating memories with string labels that referenced nothing.

Only when `memory.relate` was called to link Matt Blumberg to Markup AI did entity records get created — and Markup AI was created with `type: "person"` because that's the default for `memory.relate`'s auto-create path. The entity was misclassified the moment it came into being.

Same pattern almost certainly applies across the existing memory store. Probable thousands of facts have entity-label references that never made it into the entity graph.

## The fix

Three changes to the write path:

### 1. `memory.remember` actually creates/links entities

When `memory.remember` receives an `entities` array:

- For each name in the array, run a fuzzy match against the existing entities table
- If a match exists, use that entity ID
- If no match exists, create a new entity record with type inferred (see #2 below) from the fact content
- Write rows to `memory_entities` linking the memory to each entity ID
- Bump each entity's `last_mentioned_at` and `mention_count`

### 2. Type inference on auto-created entities

When an entity is created on the fly (from `memory.remember`'s entities field or from `memory.relate`'s source/target), infer the type from context rather than defaulting to `person`:

- LLM-based: small classifier (local Ollama call or rule-based heuristic) examines the entity name and the calling memory's content. "Markup AI" in a sentence about "AI content-quality tooling company" gets typed `organization`.
- Heuristic fallback: corporate suffixes (Inc., LLC, AI, Corp, Co.) → organization; capitalised multi-word phrases that look like project names → project; first-name + last-name patterns → person; single-word recognisable nouns → concept.
- Always recoverable: existing tool `memory.modify` (or a new `memory.entity.update` if it doesn't exist) can correct mistypes.

### 3. Automatic entity extraction from memory content (opt-in)

For memories that don't supply an `entities` array, optionally run named-entity recognition on the content text:

```python
content = "Matt Blumberg said the placement angle should be ..."
# NER extracts: ["Matt Blumberg"]
# auto-links the memory to Matt Blumberg entity (creating if missing)
```

Off by default; opt in via config flag `entity_auto_extract: true`. This protects users who want full control but enables the convenience for users (like Kamil) who write many memories about named people without remembering to populate the `entities` field manually.

## Surface area

```
memory-daemon/claudia_memory/services/
  ├── remember.py              # add entity-resolution + memory_entities linking
  ├── entities.py              # NEW: fuzzy match, type inference, NER extraction
  └── relate.py                # use entities.create_or_get with type inference
memory-daemon/claudia_memory/schema.sql
  # no schema changes — memory_entities table already exists, just being underused
memory-daemon/claudia_memory/config.py
  # add entity_auto_extract flag (default: false)
memory-daemon/tests/test_entity_resolution.py    # NEW
docs/memory-write-semantics.md                    # NEW
```

## Why elegant

- **Backward-compatible.** Existing callers that pass `entities` keep working; they just start producing useful entity records too.
- **No schema migration required.** The `entities` and `memory_entities` tables already exist; this PR makes them used correctly.
- **Type inference is failure-soft.** Wrong type is correctable via `memory.modify`; the value is in having entities at all.
- **NER opt-in.** Users who want zero magic can stay at zero magic. Users who want auto-linking flip a flag.

## Testing plan

- Unit tests: each type-inference heuristic against labeled fixtures (organisations with Inc/LLC/AI suffixes, person first-last patterns, project multi-word capitals, concept single-words)
- Integration: write a fact with `entities=["Matt Blumberg", "Markup AI"]` → both entities are created with correct types → `memory.about("Matt Blumberg")` returns the linked memory
- Regression: existing memories that were written with `entities` arrays before this PR get a backfill pass on first daemon startup post-deploy

## Open questions

- **Backfill scope.** Should the migration backfill ALL existing memories' entities fields against the entity table, or only new writes going forward? Recommend backfill as a one-shot job triggered by `claudia memory backfill-entities` rather than auto-on-startup, so the user controls the timing.
- **NER model choice.** spaCy `en_core_web_sm` is the obvious choice (small, fast, MIT-licensed). Local Ollama call is an alternative but slower. Default to spaCy if users opt in.
- **Fuzzy match threshold.** "Matt" vs "Matt Blumberg" vs "Matt B." — should these collapse? Recommend a separate `memory.entity.merge` tool for explicit merging rather than auto-collapse, which is risky.

## Related

- Pairs with Proposal #09 (read-discipline) and Proposal #10 (proactive surfacing) as the Memory Intelligence release. Together they turn the memory system from write-only-storage into a live graph the agent can use.
- Resolves a confirmed bug: entity records for people the agent has been actively writing about can be empty even after dozens of writes.
