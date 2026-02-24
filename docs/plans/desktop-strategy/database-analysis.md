# Database Analysis: What Should Claudia Desktop Use?

*Evaluating every viable embedded database for a personal AI chief of staff.*

---

## Claudia's Database Requirements

The database needs to support six distinct workloads:

1. **Relational data** -- 19 tables (entities, memories, relationships, audit trails, patterns, episodes, reflections, metrics). Foreign keys, triggers, migrations.
2. **Vector search** -- Semantic similarity for memory recall. Currently 384-dimensional embeddings via sqlite-vec.
3. **Full-text search** -- Keyword search across memory content. Currently FTS5.
4. **Graph-like queries** -- Find paths between entities, detect hub nodes, visualize relationship networks. Currently recursive CTEs.
5. **Temporal queries** -- Bi-temporal tracking (valid_at/invalid_at), upcoming deadlines, timeline views. Standard SQL date math.
6. **Audit trails** -- Full provenance on every memory: who said it, how it was learned, when it was corrected, why it was invalidated.

Plus hard requirements:
- **Embedded (no server process).** A consumer desktop app cannot require users to run database servers.
- **Single file (or close to it).** "Your data is yours" means a file you can copy, back up, or delete.
- **Cross-platform.** macOS, Windows, Linux.
- **Python SDK.** The memory daemon is Python.
- **Mature.** This stores a person's relationships and life context. Data loss is unacceptable.

---

## The Candidates

### 1. SQLite + sqlite-vec + FTS5 (Current)

**What's new in 2025-2026:**
- JSONB is mature (since 3.45). Binary JSON with `jsonb_each()` and `jsonb_tree()`. Several times faster than text JSON. Useful for flexible metadata columns.
- FTS5 trigram tokenizer is stable. 50-100x speedup on substring searches.
- sqlite-vec is actively maintained, Mozilla-sponsored, pure C, zero dependencies.
- Newer sqlite-vector extension (SQLiteAI, v0.9.70 Jan 2026) stores vectors in ordinary columns instead of virtual tables. Supports Float16/Int8/1-bit quantization.
- sqlite-vss is deprecated. sqlite-vec is the correct choice.

**Scores:**

| Requirement | Score | Notes |
|-------------|-------|-------|
| Relational data | 10/10 | 25+ years, billions of deployments. Triggers, migrations, WAL mode. |
| Vector search | 7/10 | sqlite-vec works but brute-force (no ANN indexing). Fine for <10K vectors. |
| Full-text search | 9/10 | FTS5 is best-in-class for embedded databases. |
| Graph queries | 5/10 | Recursive CTEs work but are awkward and slow for multi-hop paths. |
| Temporal queries | 8/10 | Standard SQL with indexes on valid_at/invalid_at. |
| Auditability | 9/10 | Audit trails are just tables. Application layer populates them. |
| Embedded | 10/10 | The gold standard. |
| Single file | 10/10 | One .db file. |
| Cross-platform | 10/10 | Everywhere. |
| Python SDK | 10/10 | stdlib `sqlite3`. Zero dependencies. |
| Maturity | 10/10 | Most deployed database in history. |

**Verdict:** Strongest overall. Weaknesses are graph traversal (recursive CTEs are clunky) and vector search at scale (brute-force without ANN). Both are manageable at Claudia's expected scale.

---

### 2. MongoDB + Qdrant + Redis (Rowboat's Current Stack)

This is what Rowboat ships with. Deserves a fair evaluation.

**MongoDB:**
- Pro: Rowboat's entire data model is already built on it. Zero migration work.
- Pro: Flexible schema. Fast iteration on data model changes.
- Pro: Aggregation pipeline is powerful for analytical queries.
- Con: **Server process.** Users must install and run `mongod`. Homebrew on macOS, MSI on Windows. Significant onboarding friction.
- Con: Data lives in a `mongod` data directory, not a portable file. "Your data is yours" is harder to pitch.
- Con: Idles at ~100-200MB RAM. Heavy for a desktop app.
- Con: No vector search in community edition.

**Qdrant:**
- Pro: Purpose-built for vector search. HNSW indexing, filtered search, payload storage.
- Pro: Rich filtering (combine vector similarity with metadata filters).
- Con: **Another server process** (port 6333). Now users need Electron + MongoDB + Qdrant.
- Con: Idles at ~50-100MB RAM.
- Con: Overkill for Claudia's scale. Thousands of memories, not millions.

**Redis:**
- Pro: Rowboat uses BullMQ for job queuing. Fast, proven.
- Con: **Yet another server process.** Electron + MongoDB + Qdrant + Redis = four processes.
- Con: Redis's job queue is completely replaceable. APScheduler + SQLite state handles 3 scheduled jobs.

**Combined assessment:**

| Requirement | Score | Notes |
|-------------|-------|-------|
| Relational data | 6/10 | MongoDB is document-store. No foreign keys, triggers, or relational integrity. |
| Vector search | 9/10 | Qdrant is excellent for this. |
| Full-text search | 7/10 | MongoDB Atlas Search or Qdrant payload search. Neither is FTS5-level. |
| Graph queries | 4/10 | MongoDB $graphLookup exists but is limited. No real graph model. |
| Temporal queries | 6/10 | Aggregation pipeline works but verbose compared to SQL. |
| Auditability | 7/10 | Change streams can automate audit logging. But no built-in provenance model. |
| Embedded | 1/10 | **Three server processes.** This is the killer. |
| Single file | 1/10 | Data spread across MongoDB data dir, Qdrant storage dir, Redis RDB/AOF. |
| Cross-platform | 7/10 | All run on Mac/Win/Linux but installation is non-trivial. |
| Python SDK | 8/10 | pymongo, qdrant-client, redis-py are all mature. |
| Maturity | 9/10 | All three are production-proven at scale. |

**Verdict: Wrong architecture for a personal desktop app.** MongoDB + Qdrant + Redis makes sense for a cloud service or team product with a server. For a consumer app where the pitch is "everything runs locally, you own your data" -- three server processes is a non-starter. Every extra daemon is a port conflict, a crash to debug, a thing the user has to understand.

**Recommendation:** Remove all three during the fork. Rowboat's data models (agents, conversations, knowledge) are not complex. They map to SQLite tables. Claudia's memory daemon already proves SQLite handles this workload with 503 passing tests.

---

### 3. libSQL (SQLite Fork by Turso)

**What it adds over SQLite:**
- **Native vector search.** `VECTOR(dims)` column type with DiskANN-based ANN indexing. No extension needed.
- **Drop-in compatible** with SQLite file format.
- Inherits FTS5.
- Embedded replicas (can optionally sync to remote Turso).
- Concurrent writes coming (Rust rewrite "Limbo" -- experimental, not production-ready).

**Scores:**

| Requirement | Score | Notes |
|-------------|-------|-------|
| Relational data | 10/10 | Full SQLite compatibility. |
| Vector search | 9/10 | Native, DiskANN ANN indexing, no extension dependency. |
| Full-text search | 8/10 | Inherits FTS5. |
| Graph queries | 5/10 | Same recursive CTE situation as SQLite. |
| Temporal queries | 8/10 | Same as SQLite. |
| Auditability | 9/10 | Same as SQLite. |
| Embedded | 9/10 | Same as SQLite. |
| Single file | 9/10 | Same file format. |
| Cross-platform | 8/10 | macOS/Linux solid. Windows has had Python binding build issues. |
| Python SDK | 6/10 | `libsql` package exists but has gone through deprecation cycles (libsql-client and libsql-experimental both deprecated). Windows build failures reported. |
| Maturity | 7/10 | C fork is production-ready. Rust rewrite is experimental. |

**Verdict:** The most natural migration path from SQLite. The native vector search alone is compelling -- eliminates the sqlite-vec extension and adds ANN indexing. **But the Python SDK is not ready.** Deprecation churn and Windows build issues make it risky for a cross-platform desktop app today.

**Recommendation:** Test the `libsql` Python package quarterly on macOS, Windows, and Linux. When it passes all 503 tests as a drop-in replacement for `sqlite3`, migrate. This could be a Phase 6+ improvement.

A real-world precedent: Kin (a local-first AI assistant) uses libSQL with Turso for exactly this use case -- on-device native vector search for personal AI memory.

---

### 4. SurrealDB (v2.2)

**The most architecturally interesting option.**

Multi-model database in Rust: relational + document + graph + vector + time-series in one system.

**Key features for Claudia:**
- **Native graph model.** `RELATE` statement creates typed edges between records. Graph edges are full records with metadata. Record links are first-class. SurrealDB 2.2 added graph path algorithms: shortest path, all paths, collect all unique nodes.
- **Native vector search.** Define vector fields, create HNSW indexes, similarity queries.
- **BM25 full-text search.** Configurable analyzers with tokenizers and filters.
- **Embeddable in Python.** `surrealkv://` for persistent on-disk storage. Python SDK v1.0.8 (Jan 2026).
- **SurrealQL.** SQL-like with graph traversal syntax (`->`, `<-` for following edges).
- **Foreign key constraints** (added in 2.2).

**Scores:**

| Requirement | Score | Notes |
|-------------|-------|-------|
| Relational data | 7/10 | Tables + foreign keys (2.2). But no triggers, limited migration tooling. |
| Vector search | 8/10 | Native, HNSW indexing. |
| Full-text search | 7/10 | BM25 with configurable analyzers. Not FTS5-mature. |
| Graph queries | 9/10 | First-class: RELATE, record links, path algorithms, shortest path. Best in class for embedded. |
| Temporal queries | 6/10 | Time-series model exists but less proven than SQL date math. |
| Auditability | 6/10 | Event system can trigger on changes. But no built-in audit trail model. |
| Embedded | 8/10 | SurrealKV storage engine, single directory. |
| Single file | 7/10 | Directory-based storage, not single file. |
| Cross-platform | 8/10 | Rust binary. Python wheel availability varies. |
| Python SDK | 6/10 | v1.0.8, embedded mode works. Young ecosystem. Recursion limit gotcha with deeply nested objects. |
| Maturity | 5/10 | v2.2. Promising but young. Sparse independent benchmarks. |

**Verdict:** SurrealDB is the only option that natively handles *all* of Claudia's data models. The graph capabilities are genuinely superior: `RELATE person:alice->knows->person:bob SET since='2024-01-15', strength=0.8` is far more natural than recursive CTEs. Path algorithms (shortest path, all paths) are built in.

But the maturity gap is real. No triggers (Claudia uses triggers for FTS5 sync and dispatch_tier validation). Migration tooling is minimal. The Python SDK has gotchas. If SurrealDB has a breaking change or loses momentum, migrating 19 tables out of SurrealQL would be painful. SQLite data is trivially portable.

**Recommendation:** Don't migrate the entire database to SurrealDB today. Consider a **dual-store architecture** later if graph features become central:
- SQLite remains the system of record (memories, entities, audit trails).
- SurrealDB runs as a graph projection layer, materialized during overnight consolidation.
- Graph traversal queries hit SurrealDB. Everything else hits SQLite.
- SurrealDB graph can be rebuilt from SQLite at any time (it's a projection, not source of truth).

---

### 5. DuckDB

Embedded OLAP database. Columnar storage, vectorized execution.

**Verdict: Wrong tool.** DuckDB is optimized for scanning large datasets analytically. Claudia's workload is OLTP-shaped: frequent small writes (remembering facts), point lookups (recall by entity), transactional updates (decay, invalidation). DuckDB's experimental VSS and FTS extensions are not mature. Its improved recursive CTEs (USING KEY in v1.3) are interesting for graph algorithms but the core engine is not designed for Claudia's access patterns.

Could be useful as a *secondary* engine for overnight batch analytics (pattern detection across large memory sets), but not as a primary store.

---

### 6. LanceDB

Embedded vector database on Apache Arrow's Lance format.

**Verdict: Too specialized.** Best pure vector database in the list. Native ANN with IVF-PQ indexing, hybrid search, BM25 FTS. But no relational model -- no JOINs, no foreign keys, no triggers, no ACID transactions. Would need SQLite alongside it. At Claudia's scale (<50K memories), sqlite-vec's brute-force search is fast enough without a separate vector database.

---

### 7. Milvus Lite

Embedded mode of the Milvus vector database.

**Verdict: Too specialized.** Vector-only store with no relational capabilities, no FTS, no graph support. Documented as suitable for small-scale use only. Same problem as LanceDB -- would need SQLite alongside, adding complexity without benefit.

---

### 8. PGlite

WASM build of PostgreSQL (~3MB) for browser/Node.js.

**Verdict: Non-starter.** No Python SDK. Claudia's memory daemon is Python. Requiring a bridge between Python and WASM Postgres adds unacceptable complexity.

---

### 9. Chroma

Open-source vector database with Rust core.

**Verdict: Redundant.** Vector-only with basic metadata. Internally uses SQLite for metadata and FTS. You'd end up with two SQLite databases (one explicit, one hidden inside Chroma). Architecturally wasteful.

---

## Comparative Matrix

| Feature | SQLite+vec | Mongo+Qdrant+Redis | libSQL | SurrealDB | DuckDB | LanceDB |
|---------|-----------|-------------------|--------|-----------|--------|---------|
| Relational | 10 | 6 | 10 | 7 | 5 | 3 |
| Vector search | 7 | 9 | 9 | 8 | 6 | 10 |
| FTS | 9 | 7 | 8 | 7 | 6 | 7 |
| Graph | 5 | 4 | 5 | **9** | 7 | 1 |
| Temporal | 8 | 6 | 8 | 6 | 7 | 4 |
| Auditability | 9 | 7 | 9 | 6 | 5 | 3 |
| Embedded | **10** | 1 | 9 | 8 | 9 | 8 |
| Single file | **10** | 1 | 9 | 7 | 9 | 8 |
| Cross-platform | **10** | 7 | 8 | 8 | 9 | 8 |
| Python SDK | **10** | 8 | 6 | 6 | 9 | 8 |
| Maturity | **10** | 9 | 7 | 5 | 7 | 6 |
| **Total** | **98** | **65** | **88** | **77** | **79** | **66** |

---

## Recommendation

### Now: SQLite + sqlite-vec + FTS5

For Claudia Desktop's current scale (thousands of memories, not millions), SQLite is the right choice.

- 19-table schema with triggers, FTS5 sync, and migrations works. 503 tests prove it.
- Python stdlib `sqlite3` has zero dependencies. Every alternative adds binary dependencies with cross-platform risk.
- Single-file, user-owns-their-data is SQLite's defining property.
- Replace MongoDB/Qdrant/Redis entirely during the fork. One database file.

### Near-term: Evaluate sqlite-vector (SQLiteAI)

The newer sqlite-vector extension stores vectors in ordinary columns (no virtual table indirection), supports quantized formats. Available on PyPI as `sqliteai-vector` (v0.9.70). Worth evaluating as a drop-in improvement over sqlite-vec.

### Medium-term: libSQL

When the Python SDK stabilizes (quarterly testing cadence), libSQL is the natural upgrade:
- Drop-in compatible with existing SQLite databases.
- Native vector search eliminates the sqlite-vec extension.
- DiskANN indexing will matter when memory grows past 10K+ vectors.

### If graph features become central: SurrealDB as projection layer

If relationship path-finding, multi-hop traversal, and network analysis become primary features, add SurrealDB as a graph projection alongside SQLite. SQLite stays source of truth. SurrealDB graph is materialized during consolidation and can be rebuilt from SQLite at any time.

### What NOT to do

- **Do not keep MongoDB/Qdrant/Redis.** Three server processes is the wrong architecture for a personal desktop app.
- **Do not adopt DuckDB as primary.** OLAP-shaped; Claudia's workload is OLTP.
- **Do not adopt LanceDB/Milvus/Chroma as replacements.** Vector-only stores need SQLite alongside, adding complexity.
- **Do not rewrite for SurrealDB today.** Maturity gap (no triggers, limited migration tooling) creates too much risk.
