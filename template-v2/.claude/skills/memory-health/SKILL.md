---
name: memory-health
description: Check memory system health and data quality. Use when user asks "how's my memory?", "system health", "memory stats", "data quality", "how's my brain?", or for periodic self-diagnostics.
effort-level: medium
---

# Memory Health

Provide a dashboard view of the memory system's health, including entity counts, memory statistics, data quality indicators, and recommendations.

## Triggers

- User says "memory health", "memory stats", "brain check"
- User says "data quality", "how's my memory system?"
- User says "how much do you remember?", "what's in your brain?"
- Periodic self-check (weekly review, morning brief)

## Schema Reference

**Use these exact column names in all SQLite queries. Do NOT guess column names.**

**entities** table: `id`, `name`, `type`, `canonical_name`, `description`, `importance` (REAL), `created_at`, `updated_at`, `metadata`, `last_contact_at`, `contact_frequency_days`, `contact_trend`, `attention_tier`, `close_circle` (BOOLEAN), `close_circle_reason`, `deleted_at`, `deleted_reason`

**memories** table: `id`, `content`, `content_hash`, `type`, `importance` (REAL), `confidence` (REAL), `source`, `source_id`, `source_context`, `created_at`, `updated_at`, `last_accessed_at`, `access_count`, `verified_at`, `verification_status`, `metadata`, `source_channel`, `deadline_at`, `temporal_markers`, `lifecycle_tier`, `sacred_reason` (NOT `sacred`), `archived_at`, `fact_id`, `hash`, `prev_hash`, `workspace_id`, `corrected_at`, `corrected_from`, `invalidated_at`, `invalidated_reason`, `origin_type`

**relationships** table: `id`, `source_entity_id`, `target_entity_id`, `relationship_type`, `strength` (REAL), `origin_type`, `direction`, `valid_at`, `invalid_at` (NOT `invalidated_at`), `created_at`, `updated_at`, `metadata`, `lifecycle_tier`

**predictions** table: `id`, `content`, `prediction_type`, `priority` (REAL), `expires_at`, `is_shown`, `is_acted_on`, `created_at`, `shown_at`, `prediction_pattern_name`, `metadata`

**Important distinctions:**
- Embeddings are in SEPARATE tables (`entity_embeddings`, `memory_embeddings`), NOT columns on the main tables
- `memories.sacred_reason` exists, but there is no column called `sacred` or `critical`
- `relationships.invalid_at` (not `invalidated_at`) marks invalid relationships
- `memories.invalidated_at` marks invalidated memories (different column name than relationships)
- Always filter with `deleted_at IS NULL` on entities and `invalidated_at IS NULL` on memories

## Workflow

### Step 1: Gather Statistics

Use the `memory_system_health` MCP tool or direct SQLite queries with the schema above.

Alternatively, use the Claudia CLI to get current system state:

```bash
claudia memory session context --scope full --project-dir "$PWD"
```

This returns entity counts, memory counts, relationship counts, and predictions.

### Step 2: Calculate Health Indicators

From the session context, derive:

**Entity Health**
- Total entities by type (people, projects, organizations, topics)
- Entities with no associated memories (orphans)
- Entities not mentioned in 90+ days (stale)

**Memory Health**
- Total memories by type (fact, preference, observation, learning)
- Average importance score
- Invalidated vs. active memories
- Corrected memories count

**Relationship Health**
- Total active relationships
- Relationships marked as invalid
- Cooling relationships (no recent activity)

**Data Quality**
- Potential duplicate entities (fuzzy name match)
- Orphan memories (no entity links)
- Memories below importance threshold (0.3)

### Step 3: Present Dashboard

Format:

```
## Memory System Health Report

### Entities
| Type         | Count | Stale (90d) |
|--------------|-------|-------------|
| People       |    23 |           2 |
| Projects     |    12 |           5 |
| Organizations|     8 |           0 |
| Topics       |    15 |           3 |

### Memories
- **Total:** 847 active memories
- **Average importance:** 0.72
- **By type:** 412 facts, 198 preferences, 156 observations, 81 learnings
- **Corrected:** 12 memories have been corrected
- **Invalidated:** 34 memories marked as no longer true

### Relationships
- **Active:** 67 relationships
- **Cooling:** 8 relationships (no contact in 30+ days)

### Data Quality
- **Potential duplicates:** 3 entity pairs to review
- **Orphan memories:** 5 memories without entity links
- **Low importance:** 23 memories below 0.3 threshold

### Recommendations
1. Review potential duplicates: "John Smith" and "Jon Smith" may be the same person
2. Consider archiving 5 stale projects with no recent activity
3. 8 relationships are cooling - may want to reconnect
```

## Quick Stats Mode

If user just wants numbers:

```
Your memory at a glance:
- 58 people, 12 projects, 8 orgs
- 847 memories (avg importance: 0.72)
- 67 relationships tracked
- Last consolidation: 2 hours ago
```

## Troubleshooting Mode

When user reports memory issues ("you forgot X", "why don't you remember"):

1. Search for the specific topic/entity
2. Check if memories exist but are below recall threshold
3. Check if memories were invalidated
4. Report findings:

```
I searched for memories about "[topic]":
- Found 3 memories, but all below importance 0.4 (not surfacing in context)
- One memory was corrected on [date]
- Recommendation: I can boost the importance of these if they're still relevant
```

## Recommendations Engine

Based on health metrics, suggest:

- **Duplicates found:** "Run /fix-duplicates to clean up 3 potential duplicate entities"
- **Stale entities:** "Consider archiving [X] project - no activity in 120 days"
- **Cooling relationships:** "Haven't heard about [Name] in 45 days - want me to add a follow-up?"
- **Low memory count:** "I only have [N] memories about [Entity] - we could add more context"
- **High invalidation rate:** "12% of memories about [Entity] were invalidated - the situation may have changed significantly"

## Never

- Expose raw database IDs or technical details to user
- Make the user feel bad about "memory problems"
- Automatically delete or modify data based on health checks
- Claim perfect memory - always acknowledge limitations
