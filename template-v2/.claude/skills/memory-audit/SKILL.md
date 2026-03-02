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
claudia memory entities search --query "*" --project-dir "$PWD"
claudia memory recall "*" --compact --limit 1 --project-dir "$PWD"
claudia memory document search --project-dir "$PWD"
```
Parse the JSON output from each command to get counts.

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
claudia memory entities search --types "person" --limit 10 --project-dir "$PWD"
For each person:
  claudia memory about "[person name]" --project-dir "$PWD"
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
claudia memory entities search --types "project" --limit 10 --project-dir "$PWD"
```

### 4. Active Patterns

```
claudia memory session context --project-dir "$PWD"
```

### 5. Provenance Sample

Pick the 3 most recent high-importance memories and trace them:
```
claudia memory recall "*" --compact --limit 3 --project-dir "$PWD"
For each result, run:
  claudia memory provenance trace --memory-id "[id]" --project-dir "$PWD"
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
claudia memory about "[entity name]" --project-dir "$PWD"
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

From the `claudia memory about` JSON response, group memories:
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
claudia memory document search --entity "[entity name]" --project-dir "$PWD"
```

Display:
```
### Documents (N)
- [filename] ([source_type], [date]) - [summary snippet]
```

### 5. Provenance Chains

For each commitment or high-importance memory (importance > 0.7):
```
claudia memory provenance trace --memory-id "[memory ID]" --project-dir "$PWD"
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
