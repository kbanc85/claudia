# Proposal 04: Embedding backend abstraction with graceful fallback

**Status**: Proposal · **Effort**: 1-2 weeks · **Batch**: Quality of memory (ship with #02)

## TL;DR

Today claudia-memory hard-depends on Ollama + `nomic-embed-text`. If Ollama is down, the model is pulled, or the user upgrades and breaks something, the entire embedding pipeline fails and writes start erroring. Abstract embedding into a backend interface with a primary/fallback chain and a queue-for-later for outages. mem0's flagship architectural feature is 19 vector backends; we don't need 19, but we need more than one.

## The problem

The `embeddings.py` module today is a thin wrapper around a single Ollama client. A single point of failure for both writes (can't embed → can't store) and reads (can't embed query → can't search).

## The fix

Restructure embeddings into a router that tries primary → fallback → queues-for-retry:

```
embeddings/
  ├── __init__.py                  # router
  ├── base.py                      # EmbeddingBackend ABC
  └── backends/
      ├── ollama.py                # current implementation, refactored
      ├── sentence_transformers.py # local fallback (all-MiniLM-L6-v2)
      ├── openai.py                # optional API backend
      ├── voyage.py                # optional API backend
      └── cohere.py                # optional API backend
```

Behavior:
1. Try the configured primary backend
2. If unavailable (timeout, model not loaded, API down), try the configured fallback
3. If all fail and the operation is a write, persist the memory anyway and queue the embedding in a new `embedding_queue` table; daemon retries when any backend recovers
4. Reads always require a backend; if none is available, surface a clear error (don't fall back to BM25-only silently — that violates user trust)

Config:

```json
{
  "embedding_backends": {
    "primary": "ollama:nomic-embed-text",
    "fallback": ["sentence_transformers:all-MiniLM-L6-v2"]
  }
}
```

## Surface area

```
memory-daemon/claudia_memory/
  ├── embeddings/                  # NEW: replaces embeddings.py
  │   ├── __init__.py
  │   ├── base.py
  │   ├── router.py
  │   └── backends/
  ├── embeddings.py                # DELETE (moved to embeddings/__init__.py)
  └── schema.sql                   # add embedding_queue table
memory-daemon/claudia_memory/daemon/scheduler.py  # add embedding_queue drain job
memory-daemon/requirements.txt    # add sentence-transformers as optional extra
```

Schema migration: add `embedding_queue (id, memory_id, content, attempts, last_error, created_at)`.

## Why elegant

- Writes never fail because of an embedding outage — they degrade to "stored, not yet searchable"
- Optional backends are pluggable via Python entry-points (`pip install claudia-memory[openai]`)
- Each backend is a small file with two methods; community contributions are trivial
- Drains automatically when a backend comes back

## Testing plan

- Unit tests per backend: mock the underlying client, verify shape of returned vectors
- Integration: kill Ollama mid-write, assert memory is persisted and queued, restart Ollama, assert queue drains within one scheduler cycle
- Compatibility: ensure existing `*_embeddings` tables work with all backend output (consistent dimension or per-backend dim-tracking)

## Open questions

- **Cross-backend dimension mismatch**: Ollama's nomic-embed-text is 768d, sentence-transformers MiniLM is 384d, OpenAI text-embedding-3-small is 1536d. Two options:
  1. Reject backends with different dim than the existing column (simpler)
  2. Add `embedding_dim` column to each `*_embeddings` table and route searches by dim (more flexible)
  Recommend option 1 for v1, option 2 for v2.
- Per-backend rate limiting / cost tracking?
- Should we maintain a backend health-check job that pings each configured backend hourly and surfaces results in `claudia daemon status`?

## Related

- Pairs with Proposal #02 (hybrid retrieval) as the Quality-of-Memory release. Hybrid retrieval already provides a partial fallback (BM25 keeps working without embeddings) but that's not equivalent to having a second embedding backend.
- Mitigates a known failure mode where Ollama updates break the daemon silently.

## References

- [mem0 vector backends list](https://docs.mem0.ai/components/vectordbs/overview)
- [sentence-transformers all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
