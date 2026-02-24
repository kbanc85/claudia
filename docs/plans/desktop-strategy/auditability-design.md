# Auditability Design: How Claudia Tracks Decisions and Memories

*Where auditability lives, what the database handles vs. the application layer, and what could be improved.*

---

## Why Auditability Matters for Claudia

Claudia is a chief of staff. She makes claims about what you said, what you promised, who you know, and how your relationships are trending. If you can't verify where she got that information, you can't trust her.

Auditability answers three questions:
1. **How does Claudia know this?** (Origin tracking)
2. **Has this information changed?** (Correction history)
3. **Can I trace the full chain?** (Provenance)

---

## What Already Exists (Claudia v1)

The current memory system has strong auditability. Here's where it lives:

### In the Database (Schema Level)

**Origin tracking on every memory:**
- `origin_type` column: `user_stated`, `extracted`, `inferred`, `corrected`
- `source_channel` column: `"conversation"`, `"gmail"`, `"calendar"`, `"meeting"`, `"telegram"`
- `confidence` score (0.0-1.0) -- higher for user-stated, lower for inferred
- `verification_status`: `pending` -> `verified` -> `flagged` -> `contradicts`

**Correction chain on memories:**
- `corrected_at` timestamp -- when the memory was corrected
- `corrected_from` text -- what the memory said before correction
- `origin_type` set to `corrected` with `confidence = 1.0` after user correction

**Soft delete (never hard delete):**
- Memories: `invalidated_at` + reason (not `deleted_at` -- important distinction)
- Entities: `deleted_at` + `deleted_reason`
- Relationships: `invalid_at` timestamp for bi-temporal tracking

**Full audit log:**
- `audit_log` table records every write operation
- Columns: who (entity), what (operation type), when (timestamp), details (JSON of what changed)
- Retention: 90 days by default (configurable)

**Bi-temporal relationships:**
- `valid_at` -- when the relationship became true in reality
- `invalid_at` -- when the relationship stopped being true
- This means you can answer "Who was Sarah's manager in January?" even if the relationship has since changed

### In the Service Layer (Python Code)

**AuditService** (`services/audit.py`):
- Records every memory.remember, memory.correct, memory.invalidate operation
- Provides `memory.provenance` MCP tool for tracing a memory's full history
- Provides `memory.audit` for entity-level audit history

**Guards** (`services/guards.py`):
- Validates every write: content length limits, importance clamping, deadline detection
- Near-duplicate warning (cosine > 0.92)
- These guards create audit entries when they intervene

**Trust signaling** (personality layer):
- Claudia changes her language based on confidence:
  - High: "You mentioned that Sarah is VP Engineering"
  - Medium: "I think Sarah might have changed roles"
  - Low: "I'm not sure, but I noticed conflicting information"
- Contradiction surfacing: when two memories conflict, Claudia raises it explicitly

**Verification cascade** (`services/verify.py`):
- Background process that checks memory consistency
- Deterministic checks first (date conflicts, type mismatches), LLM fallback for semantic conflicts
- Updates `verification_status` field

---

## What the Database Handles vs. Application Layer

| Concern | Where it lives | Why |
|---------|---------------|-----|
| Origin tracking (how we know) | Database (`origin_type`, `source_channel`) | Structural -- part of every record |
| Confidence scoring | Database (`confidence` column) | Numerical -- queryable, sortable |
| Correction history | Database (`corrected_at`, `corrected_from`) | Must survive app restarts |
| Audit trail | Database (`audit_log` table) | Must be persistent, queryable |
| Temporal validity | Database (`valid_at`, `invalid_at`) | Must be queryable across time |
| Soft delete tracking | Database (`invalidated_at`, `deleted_at`) | Must be persistent |
| Trust signaling | Application (personality layer) | Behavioral -- how Claudia speaks |
| Contradiction detection | Application (consolidation service) | Semantic -- requires comparison logic |
| Verification cascade | Application (verify service) | Multi-step logic with LLM fallback |
| Guard validation | Application (guards service) | Business rules too complex for triggers |
| Provenance queries | Application (audit service) | Joins across multiple tables |

**Key insight:** The database stores the *facts* of the audit trail. The application layer provides the *intelligence* -- deciding what to audit, detecting contradictions, and presenting provenance in human-readable form. A database with more built-in features (change streams, event triggers) would automate some audit logging, but Claudia's explicit approach is actually better because it captures *semantic context* (why something changed, not just that it changed).

---

## What Could Be Improved

### 1. Version History on Memory Content

Currently, when a memory is corrected, `corrected_from` stores the previous value -- but only one level deep. If a memory is corrected twice, the original value is lost.

**Improvement:** A `memory_versions` table that stores every previous state of a memory:

```sql
CREATE TABLE memory_versions (
    id INTEGER PRIMARY KEY,
    memory_id INTEGER REFERENCES memories(id),
    content TEXT NOT NULL,
    origin_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by TEXT, -- 'user', 'consolidation', 'ingestion'
    change_reason TEXT
);
```

This gives full time-travel: "What did Claudia believe about Sarah's role on January 15th?"

### 2. Decision Tracking

Claudia detects commitments ("I'll send that by Friday") but doesn't explicitly track *decisions* ("We decided to go with vendor X"). Decisions are different from commitments:

- A commitment is something you owe someone
- A decision is a choice that was made, with context about why

**Improvement:** A dedicated `decisions` table or a `memory_type = 'decision'` classification:

```sql
-- Either a new table or a type filter
-- Decision-specific fields:
-- - alternatives_considered (what else was on the table)
-- - decision_maker (who made the call)
-- - rationale (why this option)
-- - stakeholders (who was involved)
-- - reversibility (easy/hard/irreversible)
```

This would let Claudia answer "Why did we choose vendor X?" or "What alternatives did we consider for the Q3 strategy?"

### 3. Source Document Linking

When a memory is extracted from an email or meeting transcript, the link to the original source document is indirect. The `source_channel` says "gmail" but doesn't link to the specific email.

**Improvement:** A `source_document_id` foreign key on memories that points to the `documents` table (which already exists). For connectors that produce files (Gmail sync, Fireflies), store a reference to the original artifact. This enables "show me the email where this fact came from."

### 4. Audit Log Enrichment

The current audit log stores operation details as JSON. For the desktop app, consider:

- **User-visible audit view** in the UI -- not just a developer tool
- **Diff visualization** -- show what changed between versions
- **Bulk operation tracking** -- when consolidation merges 5 near-duplicates, show the merge as one auditable event with all inputs visible

---

## Auditability in the Database Choice

Does the database technology matter for auditability? Somewhat, but less than you might think:

| Database feature | SQLite | MongoDB | SurrealDB |
|-----------------|--------|---------|-----------|
| Row-level versioning | No (application layer) | No (application layer) | No (application layer) |
| Change streams/events | No | Yes (change streams) | Yes (event system) |
| Temporal tables | No (application layer) | No | Partial (time-series model) |
| Audit triggers | Yes (CREATE TRIGGER) | No | No |
| ACID transactions | Yes (WAL mode) | Yes (multi-doc transactions) | Yes (MVCC) |
| Point-in-time recovery | Via backup + audit log | Via oplog | Via SurrealKV |

**MongoDB's change streams** could automate audit logging (fire on every insert/update/delete). But Claudia already does this explicitly with richer context.

**SurrealDB's event system** could trigger on record changes. But same issue -- application-level audit is richer.

**SQLite triggers** are what Claudia currently uses for FTS5 sync. They could be extended for audit logging, but the guards/audit services provide more flexibility.

**Bottom line:** Auditability is primarily an application-layer concern for Claudia. The database needs ACID transactions (so audit entries are atomic with the operations they track) and good query performance (so provenance queries are fast). SQLite provides both. No alternative database would meaningfully improve Claudia's audit capabilities.

---

## Recommendations for Claudia Desktop

1. **Keep the existing audit architecture.** It's well-designed and proven.
2. **Add memory versioning** (the `memory_versions` table) for full time-travel queries.
3. **Add decision tracking** as a first-class memory type.
4. **Add source document linking** for connector-sourced memories.
5. **Build a user-facing audit view** in the desktop UI -- not buried in developer tools. Users should be able to click any fact and see "Where did this come from? What was it before? When was it last verified?"
6. **The database choice does not significantly affect auditability.** SQLite handles this well. The intelligence is in the application layer.
