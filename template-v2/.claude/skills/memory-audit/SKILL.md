---
name: memory-audit
description: Show everything Claudia knows with provenance tracing and entity counts. Triggers on "what do you know?", "show memories", "memory audit", "what do you remember about".
argument-hint: "[entity name]"
effort-level: medium
---

# Memory Audit

Show what Claudia knows. Verify claims trace to sources. Surface gaps.

## Usage

- `/memory-audit` -- Full system audit
- `/memory-audit [entity name]` -- Audit everything about a specific person, project, or entity

## Full Audit

When run without arguments, produce a system-level overview of everything in memory.

### 1. Summary Counts

Query the memory system for aggregate counts:

```
Call memory.search_entities with a broad query ("*" or "") to get total entity count.
Call memory.recall with compact=true, limit=1 to estimate memory volume.
Call memory.documents (no filters) to count documents.
```

Display:
```
## Memory Audit - [Date]

| Category       | Count |
|----------------|-------|
| Entities       | N     |
| Memories       | N     |
| Commitments    | N     |
| Documents      | N     |
| Relationships  | N     |
```

### 2. People (Top 10 by Importance)

```
Call memory.search_entities with types=["person"], limit=10
For each person:
  Call memory.about to get memory count, last mentioned, key facts
```

Display as a table:
```
### People

| Name | Memories | Last Mentioned | Key Fact |
|------|----------|----------------|----------|
| ...  | ...      | ...            | ...      |
```

### 3. Projects (Top 10)

Same pattern with types=["project"]:
```
Call memory.search_entities with types=["project"], limit=10
```

### 4. Active Patterns

```
Call memory.predictions to get active predictions/patterns
```

### 5. Provenance Sample

Pick the 3 most recent high-importance memories and trace them:
```
Call memory.recall with compact=true, limit=3
For each result, call memory.trace to get full provenance
```

Display:
```
### Provenance Check (3 recent memories)

**Memory:** "[content snippet]"
- Source: [episode/document/user_input]
- Document: [filename] (if linked)
- Entities: [linked entities]
- Verified: [yes/no/pending]
```

---

## Entity Audit

When run with an entity name (e.g., `/memory-audit Sarah Chen`):

### 1. Profile

```
Call memory.about with the entity name
```

Display:
```
## Audit: [Entity Name]

**Type:** person/project/organization
**Description:** [from entity record]
**Importance:** [score]
**First seen:** [created_at]
**Last mentioned:** [updated_at]
```

### 2. All Memories (grouped by type)

From the memory.about response, group memories:
```
### Facts (N)
- [content] (importance: X, created: date)

### Commitments (N)
- [content] (importance: X, created: date)

### Observations (N)
- [content] (importance: X, created: date)
```

### 3. Relationships

```
### Relationships (N)
- [relationship_type] with [other_entity] (strength: X)
```

### 4. Linked Documents

```
Call memory.documents with entity=[entity name]
```

Display:
```
### Documents (N)
- [filename] ([source_type], [date]) - [summary snippet]
```

### 5. Provenance Chains

For each commitment or high-importance memory (importance > 0.7):
```
Call memory.trace for the memory ID
```

Display:
```
### Provenance

**"[memory content]"** (commitment, importance: 0.9)
|- Source: session_summary (episode 42)
|- Episode: "Discussed Q2 goals with Sarah..."
|- Document: meeting-sarah-q2.md (transcript)
|- Verified: yes (2026-01-15)
```

---

## Output Rules

- Use the structured output format with emoji headers
- End structured output blocks with a markdown horizontal rule
- If the memory system is not available, say so clearly
- Keep entity audit focused: no padding, no speculation
- Provenance chains are the most important part: if a memory has no source, flag it

## Tone

- Factual and clean
- Like a database report, not a narrative
- Flag gaps honestly: "No source document linked" is useful information
