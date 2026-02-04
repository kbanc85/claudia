---
name: ingest-sources
description: Process multiple source documents with Extract-Then-Aggregate discipline. Use when user shares multiple transcripts, emails, or documents for batch processing.
disable-model-invocation: true
argument-hint: [folder-path]
---

# Ingest Sources

Process multiple source documents (transcripts, emails, documents) using Extract-Then-Aggregate discipline to ensure no entity with dedicated sources gets lost.

## Trigger

- "Process these transcripts"
- "Here are my notes from [event]"
- Multiple files shared in sequence
- "Here's everything about [topic]"
- Folder path provided with multiple files
- `/ingest-sources`

## Why This Skill Exists

When processing many sources, the failure mode is jumping to aggregation and missing entities that have dedicated sources but aren't prominent in high-traffic threads. A person with 2 transcripts dedicated to them can get lost if they're not mentioned often in emails.

**The discipline:** Inventory before processing, extraction before synthesis.

## Input

User provides one of:
- Folder path containing multiple files
- List of file paths
- Multiple documents pasted in sequence
- Reference to previously shared content

## The Five-Phase Workflow

### Phase 1: Inventory

**Before reading any content**, create a manifest of all sources:

```
| # | Filename | Type | Date | Size | Likely Entities |
|---|----------|------|------|------|-----------------|
| 1 | call-with-sarah.md | transcript | 2026-01-15 | 4.2KB | Sarah Chen |
| 2 | jim-partnership-email.md | email | 2026-01-16 | 1.8KB | Jim Ferry |
| 3 | acme-contract.pdf | document | 2026-01-17 | 52KB | Acme Corp |
...

**Summary:**
- Total: 36 sources
- Date range: Jan 15 - Feb 1
- Types: 28 transcripts, 5 emails, 3 documents
```

Show inventory to user before proceeding. This prevents partial processing.

### Phase 2: File-Then-Extract (Per Document)

**CRITICAL:** For each document, file it BEFORE extracting. This ensures provenance.

```
For each source in inventory:
    1. READ the full content
    2. CALL memory.file immediately (do not skip!)
    3. THEN extract entities/facts/commitments
```

Process each document systematically. Use `IngestService` (via local Ollama) when available, or extract directly.

**Auto-detect source type:**
- `.md`, `.txt` with participant names → `meeting` mode
- Email headers detected → `email` mode
- `.pdf` or formal structure → `document` mode
- Mixed content → `general` mode

**Extraction schema per document:**

```
Source #1: call-with-sarah.md
├── entities[]
│   ├── name: "Sarah Chen"
│   ├── type: person
│   ├── mention_count: 47
│   └── first_context: "Product lead at Acme Corp"
├── facts[]
│   ├── content: "Sarah prefers async communication"
│   ├── about: ["Sarah Chen"]
│   └── importance: 0.7
├── commitments[]
│   ├── content: "Send proposal by Friday"
│   ├── who: "user"
│   ├── to: "Sarah Chen"
│   └── deadline: "2026-02-07"
├── relationships[]
│   ├── source: "Sarah Chen"
│   ├── target: "Acme Corp"
│   └── relationship: "works_at"
└── dedicated_to: "Sarah Chen"  ← CRITICAL: This source is primarily ABOUT Sarah
```

**Progress tracking:**
```
Extracting: [========>   ] 28/36 (78%)
```

**The `dedicated_to` field is essential.** If a source is primarily about a specific entity (not just mentioning them), mark it. This prevents the "missing entity" problem.

### Phase 3: Consolidation

After all extractions complete, merge by entity:

**Canonicalize names:**
- Check existing `entity_aliases` table for known aliases
- Fuzzy match "Sarah" vs "Sarah Chen" vs "S. Chen"
- Ask user to confirm ambiguous matches

**Merge semantically identical facts:**
- "Sarah prefers Slack" + "Sarah likes async comms" → single fact about communication preference
- Keep the more specific version

**Track source counts:**
```
Entity: Sarah Chen
├── Dedicated sources: 4 (#1, #5, #12, #18)
├── Total mentions: 12 sources
├── Facts extracted: 8
└── Commitments: 2
```

### Phase 4: Verification

**Before storing anything**, verify completeness:

```
### Entity Coverage

| Entity | Dedicated Sources | Total Mentions | Sources |
|--------|-------------------|----------------|---------|
| Sarah Chen | 4 | 12 | #1, #5, #12, #18, ... |
| Jim Ferry | 2 | 6 | #2, #15, ... |
| Acme Corp | 3 | 8 | #3, #7, #22, ... |
| Project Alpha | 0 | 4 | #4, #8, #11, #19 |

### Dedicated Source Rule

**Any entity with 2+ dedicated sources MUST appear proportionally in the final output.**

If Jim Ferry has 2 transcripts dedicated to him but doesn't show up in the entity coverage summary, that's a verification failure. Stop and investigate.

### Gaps Detected

- Source #14: No entities extracted (may need manual review)
- Source #22: References "the investor" without name

### Completeness Check

Before proceeding:
- [ ] Every dedicated source entity appears in coverage
- [ ] No sources skipped or failed
- [ ] Ambiguous entity names resolved
- [ ] Gaps acknowledged or explained
```

**User must confirm** before proceeding to storage. This is the checkpoint that catches the "missing entity" problem.

### Phase 5: Storage

After user confirms verification:

**1. Verify all sources filed:**
Sources were already filed during Phase 2 (File-Then-Extract). Verify the file count matches:
```
Confirm: [N] sources filed to ~/.claudia/files/
```

If any sources weren't filed in Phase 2, file them now before proceeding.

Files are auto-routed to entity folders:
- `people/sarah-chen/transcripts/...`
- `clients/acme-corp/documents/...`
- `projects/alpha/emails/...`

**2. Create/update entities:**
```
Call memory.batch with entity operations:
[
  { "op": "entity", "name": "Sarah Chen", "type": "person", "description": "Product lead at Acme Corp" },
  { "op": "entity", "name": "Jim Ferry", "type": "person", "description": "Partnership contact" },
  { "op": "entity", "name": "Acme Corp", "type": "organization", "description": "Client company" }
]
```

**3. Store facts and relationships:**
```
Call memory.batch with remember and relate operations:
[
  { "op": "remember", "content": "Sarah prefers async communication", "about": ["Sarah Chen"], "importance": 0.7 },
  { "op": "relate", "source": "Sarah Chen", "target": "Acme Corp", "relationship": "works_at", "strength": 0.9 }
]
```

**4. Link provenance:**
```
memory_sources table connects memories → source documents
entity_documents table connects documents → entities
```

This creates the chain: any fact can trace back to the exact document it came from.

## Output Format

```
**📥 Multi-Source Ingestion: [Topic/Event]**

### Phase 1: Inventory Complete
[Summary table shown above]

Proceed with extraction? [y/n]

---

### Phase 2: Extraction Complete
- Sources processed: 36/36
- Entities found: 12
- Facts extracted: 87
- Commitments detected: 14
- Relationships mapped: 23

---

### Phase 3: Consolidation Complete
- Unique entities: 9 (after deduplication)
- Canonical names resolved: 4 aliases merged

---

### Phase 4: Verification

[Coverage table shown above]

**Dedicated Source Check:**
✓ Sarah Chen: 4 dedicated sources, appears in 12 total
✓ Jim Ferry: 2 dedicated sources, appears in 6 total
✓ Acme Corp: 3 dedicated sources, appears in 8 total

**Gaps:**
⚠ Source #14: No entities extracted

Ready to store? [y/n]

---

### Phase 5: Storage Complete

**Files stored:** 36
**Entities created/updated:** 9
**Memories stored:** 87
**Relationships created:** 23

All sources linked to entities. Provenance chain complete.

**Query examples:**
- "What do I know about Jim Ferry?" → will surface all 6 source memories
- "Show me Sarah's transcripts" → will list all 4 dedicated files
- "Where did I learn about Acme's timeline?" → will cite exact source

---
```

## Judgment Points

Ask for confirmation on:
- Ambiguous entity matches (is "S. Chen" the same as "Sarah Chen"?)
- Sources with no extractable entities (manual review needed?)
- Importance scores for extracted facts
- Proceeding past verification phase
- Creating new entities vs linking to existing

## Quality Checklist

- [ ] **Inventory created before reading content**
- [ ] **Every source gets extraction record** (none skipped)
- [ ] **`dedicated_to` field populated** for sources primarily about an entity
- [ ] **Verification phase completed** with user confirmation
- [ ] **Dedicated source rule enforced** (2+ dedicated = must appear proportionally)
- [ ] **All sources filed** via memory.file
- [ ] **Provenance chain complete** (memories link to documents)
- [ ] **No entity lost** that had dedicated sources

## Error Handling

**If extraction fails for a source:**
- Log the failure
- Continue with other sources
- Surface in verification phase
- Offer manual review option

**If IngestService unavailable (no Ollama):**
- Fall back to direct Claude extraction
- Slower but still systematic
- Same extraction schema applies

**If verification fails:**
- Do NOT proceed to storage
- Show which entities are missing
- Offer to re-extract specific sources
- User must explicitly override to continue

## Extensibility

This workflow is schema-agnostic. Works for any source type:

| Data Type | Detection | Extraction Mode |
|-----------|-----------|-----------------|
| Meeting transcripts | `.md`, `.txt` with names | `meeting` |
| Email threads | Email headers | `email` |
| Documents/PDFs | `.pdf`, formal structure | `document` |
| Research notes | Mixed content | `general` |
| Slack exports | Message format | `general` |
| CRM exports | Structured records | `general` |

Add new extraction modes to `IngestService` if needed, or use `general` mode which extracts: facts, entities, relationships, summary.

## Tone

- Methodical: this is a systematic process
- Transparent: show progress at each phase
- Protective: catch errors before they become permanent
- Efficient: batch operations, clear status updates
