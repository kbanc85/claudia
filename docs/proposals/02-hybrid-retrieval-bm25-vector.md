# Proposal 02: Hybrid retrieval — BM25 + vector + Reciprocal Rank Fusion

**Status**: Proposal · **Effort**: 3-5 days · **Batch**: Quality of memory (ship with #04)

## TL;DR

Add BM25 keyword search alongside the existing vector search and fuse both rankings via Reciprocal Rank Fusion. This is the single biggest accuracy improvement available to claudia-memory without schema changes. Graphiti measured an **18.5% accuracy improvement** on LongMemEval after adding hybrid retrieval; mem0g sees similar gains. Today claudia-memory is vector-only.

## The problem

Vector retrieval is strong for paraphrase and concept search but weak for keyword-precise queries: exact names, dates, IDs, code identifiers, rare tokens. A user asking *"what did Sarah Chen say about pricing in March"* benefits from an exact-match boost on `Sarah Chen` and `March` that pure cosine similarity doesn't provide. State-of-the-art memory systems (Graphiti, mem0g) hybridize both retrieval modalities and rerank.

## The fix

Add a BM25 index over `memories.content`, rebuilt cheaply at daemon startup (the corpus is short text, fast to index). On `memory_recall`:

1. Run BM25 against the query, take top K candidates
2. Run vector search against the query, take top K candidates
3. Fuse via Reciprocal Rank Fusion: `score(doc) = Σ 1 / (60 + rank_i)` summed over both rankers
4. Return top N by fused score

The 60 constant is the conventional RRF dampener and needs no tuning per-domain.

## Surface area

```
memory-daemon/claudia_memory/services/
  ├── hybrid_retrieval.py              # NEW: BM25 index + RRF fusion
  └── recall.py                        # add retrieval_mode parameter
memory-daemon/claudia_memory/config.py # add retrieval_mode config knob
memory-daemon/requirements.txt         # add rank-bm25
memory-daemon/tests/test_hybrid.py     # NEW: retrieval-quality fixtures
```

New dependency: `rank-bm25` (pure Python, 1 file, MIT license, ~1.5k stars, stable). No native compilation. No ML model.

Config knob in `~/.claudia/config.json`:

```json
{
  "retrieval_mode": "hybrid"
}
```

Valid values: `vector` (current behavior), `bm25` (keyword-only), `hybrid` (default after a release of opt-in).

## Why elegant

- Pure additive change. Vector retrieval path is unchanged for users who set `retrieval_mode: vector`.
- One small dependency, no native code.
- No schema migration. BM25 index lives in memory, rebuilt at startup.
- Feature-flagged for safe rollout.
- Measurable: each release can ship the LongMemEval-style benchmark delta in the changelog.

## Testing plan

- Unit tests: BM25 ranker on synthetic corpus; RRF fusion on hand-crafted rankings
- Integration: 20-fixture recall-quality test that asserts `hybrid > vector` on keyword-precise queries
- Performance: assert hybrid retrieval p95 latency < 2× vector-only on a 10k-memory corpus

## Open questions

- Should the daemon expose a benchmark CLI (`claudia memory benchmark`) that reports `recall@k` for each mode? Useful for users who want to verify the upgrade locally.
- Persist the BM25 index to disk on shutdown to avoid startup re-indexing? Saves a few seconds on big corpora, adds complexity.
- Should we also rerank the top-N hybrid results with a cross-encoder for the final ranking? Out of scope for v1; revisit if benchmark numbers justify the latency.

## Related

- Pairs with Proposal #04 (embedding backend fallback) as the Quality-of-Memory release.
- Lays groundwork for Proposal #05 (bi-temporal validity windows): once the hybrid retrieval path exists, adding a temporal filter to it is a small change.

## References

- [Graphiti paper (arXiv:2501.13956)](https://arxiv.org/abs/2501.13956)
- [State of AI Agent Memory 2026 (mem0)](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [rank-bm25 GitHub](https://github.com/dorianbrown/rank_bm25)
