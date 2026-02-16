"""Tests for Enhanced Graph Retrieval features.

Tests the following enhancements:
1. Strength-aware graph proximity scoring (_expand_graph_weighted, _compute_graph_scores)
2. Hierarchical entity summaries (generate_entity_summaries)
3. Entity overview / community-style queries (entity_overview)
4. Auto-dedupe entity detection (auto_dedupe_entities)
5. Provenance chain rendering (_build_provenance_chain)
"""

import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from claudia_memory.database import Database, content_hash
from claudia_memory.services.recall import RecallService
from claudia_memory.services.consolidate import ConsolidateService


def _make_db():
    """Create a fresh test database."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _make_recall(db):
    """Create a RecallService with test config."""
    svc = RecallService.__new__(RecallService)
    svc.db = db
    svc.config = type("Config", (), {
        "vector_weight": 0.50,
        "importance_weight": 0.25,
        "recency_weight": 0.10,
        "fts_weight": 0.15,
        "max_recall_results": 20,
        "graph_proximity_enabled": True,
        "enable_rrf": True,
        "rrf_k": 60,
        "graph_proximity_weight": 0.15,
    })()
    from claudia_memory.extraction.entity_extractor import get_extractor
    svc.extractor = get_extractor()
    return svc


def _make_consolidate(db):
    """Create a ConsolidateService with test config."""
    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db
    svc.config = type("Config", (), {
        "decay_rate_daily": 0.995,
        "min_importance_threshold": 0.1,
        "enable_memory_merging": True,
        "similarity_merge_threshold": 0.92,
        "enable_entity_summaries": True,
        "entity_summary_min_memories": 2,  # Lower for tests
        "entity_summary_max_age_days": 7,
        "enable_auto_dedupe": True,
        "auto_dedupe_threshold": 0.90,
        "enable_pre_consolidation_backup": False,
        "enable_llm_consolidation": False,
        "audit_log_retention_days": 90,
        "prediction_retention_days": 30,
        "turn_buffer_retention_days": 60,
        "metrics_retention_days": 90,
        "pattern_detection_interval_hours": 24,
    })()
    return svc


def _insert_entity(db, name, entity_type="person", importance=1.0, metadata=None):
    canonical = name.lower().strip()
    data = {
        "name": name,
        "canonical_name": canonical,
        "type": entity_type,
        "importance": importance,
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
    }
    if metadata:
        data["metadata"] = json.dumps(metadata)
    return db.insert("entities", data)


def _relate(db, src_id, tgt_id, rel_type="works_with", strength=1.0, origin_type="extracted"):
    return db.insert(
        "relationships",
        {
            "source_entity_id": src_id,
            "target_entity_id": tgt_id,
            "relationship_type": rel_type,
            "strength": strength,
            "origin_type": origin_type,
            "direction": "bidirectional",
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T00:00:00",
        },
    )


def _insert_memory(db, content, entity_id, importance=1.0, mem_type="fact"):
    mem_id = db.insert(
        "memories",
        {
            "content": content,
            "content_hash": content_hash(content),
            "type": mem_type,
            "importance": importance,
            "confidence": 1.0,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        },
    )
    db.insert(
        "memory_entities",
        {"memory_id": mem_id, "entity_id": entity_id, "relationship": "about"},
    )
    return mem_id


# ═══════════════════════════════════════════════════════════════════
# TEST 1: Strength-aware graph traversal
# ═══════════════════════════════════════════════════════════════════

def test_expand_graph_weighted_single_hop():
    """Weighted traversal returns neighbors with path_strength."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        alice_id = _insert_entity(db, "Alice")
        bob_id = _insert_entity(db, "Bob")
        charlie_id = _insert_entity(db, "Charlie")

        _relate(db, alice_id, bob_id, "manages", strength=0.9)
        _relate(db, alice_id, charlie_id, "works_with", strength=0.3)

        neighbors = svc._expand_graph_weighted(alice_id, depth=1)
        names = {n["name"]: n for n in neighbors}

        assert "Bob" in names
        assert "Charlie" in names
        assert names["Bob"]["path_strength"] == 0.9
        assert names["Charlie"]["path_strength"] == 0.3
        assert names["Bob"]["distance"] == 1
    finally:
        db.close()


def test_expand_graph_weighted_two_hop():
    """Two-hop traversal multiplies edge strengths."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        alice_id = _insert_entity(db, "Alice")
        bob_id = _insert_entity(db, "Bob")
        charlie_id = _insert_entity(db, "Charlie")

        _relate(db, alice_id, bob_id, "manages", strength=0.8)
        _relate(db, bob_id, charlie_id, "works_with", strength=0.6)

        neighbors = svc._expand_graph_weighted(alice_id, depth=2)
        names = {n["name"]: n for n in neighbors}

        assert "Bob" in names
        assert "Charlie" in names
        assert names["Bob"]["distance"] == 1
        assert names["Charlie"]["distance"] == 2
        # Path strength is product: 0.8 * 0.6 = 0.48
        assert abs(names["Charlie"]["path_strength"] - 0.48) < 0.01
    finally:
        db.close()


def test_expand_graph_weighted_excludes_weak():
    """Weak relationships (strength <= 0.1) are excluded."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        alice_id = _insert_entity(db, "Alice")
        bob_id = _insert_entity(db, "Bob")
        charlie_id = _insert_entity(db, "Charlie")

        _relate(db, alice_id, bob_id, "manages", strength=0.9)
        _relate(db, alice_id, charlie_id, "works_with", strength=0.05)  # Too weak

        neighbors = svc._expand_graph_weighted(alice_id, depth=1)
        names = [n["name"] for n in neighbors]

        assert "Bob" in names
        assert "Charlie" not in names
    finally:
        db.close()


def test_expand_graph_weighted_no_cycles():
    """Weighted traversal doesn't visit the same node twice."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        a = _insert_entity(db, "Alice")
        b = _insert_entity(db, "Bob")

        _relate(db, a, b, strength=0.8)
        _relate(db, b, a, "reports_to", strength=0.7)

        neighbors = svc._expand_graph_weighted(a, depth=2)
        names = [n["name"] for n in neighbors]
        assert names.count("Bob") == 1
        assert "Alice" not in names
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 2: Entity overview / community-style queries
# ═══════════════════════════════════════════════════════════════════

def test_entity_overview_basic():
    """Entity overview returns structured data for a single entity."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        alice_id = _insert_entity(db, "Alice")
        _insert_memory(db, "Alice is the VP of Engineering", alice_id)
        _insert_memory(db, "Alice prefers async communication", alice_id, mem_type="preference")

        result = svc.entity_overview(["Alice"], include_network=False, include_summaries=False)

        assert len(result["entities"]) == 1
        assert result["entities"][0]["name"] == "Alice"
        assert result["entities"][0]["type"] == "person"
    finally:
        db.close()


def test_entity_overview_cross_entity_patterns():
    """Entity overview surfaces co-mentioned memories."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        alice_id = _insert_entity(db, "Alice")
        bob_id = _insert_entity(db, "Bob")

        # Memory mentioning both Alice and Bob
        mem_id = db.insert(
            "memories",
            {
                "content": "Alice and Bob are working on the Q1 proposal together",
                "content_hash": content_hash("Alice and Bob are working on the Q1 proposal together"),
                "type": "fact",
                "importance": 0.9,
                "confidence": 1.0,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            },
        )
        db.insert("memory_entities", {"memory_id": mem_id, "entity_id": alice_id, "relationship": "about"})
        db.insert("memory_entities", {"memory_id": mem_id, "entity_id": bob_id, "relationship": "about"})

        result = svc.entity_overview(["Alice", "Bob"], include_network=False)

        assert len(result["entities"]) == 2
        assert len(result["cross_entity_patterns"]) >= 1
        # The cross-entity pattern should include both entities
        pattern = result["cross_entity_patterns"][0]
        assert "Alice" in pattern["entities_involved"] or "Bob" in pattern["entities_involved"]
    finally:
        db.close()


def test_entity_overview_with_relationships():
    """Entity overview includes relationship map."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        alice_id = _insert_entity(db, "Alice")
        bob_id = _insert_entity(db, "Bob")
        _relate(db, alice_id, bob_id, "manages", strength=0.9)

        result = svc.entity_overview(["Alice", "Bob"], include_network=False)

        assert len(result["relationship_map"]) >= 1
        rel = result["relationship_map"][0]
        assert rel["type"] == "manages"
        assert rel["strength"] == 0.9
    finally:
        db.close()


def test_entity_overview_with_commitments():
    """Entity overview surfaces open commitments."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        alice_id = _insert_entity(db, "Alice")
        _insert_memory(db, "Alice promised to review the PR by Friday", alice_id, mem_type="commitment")

        result = svc.entity_overview(["Alice"], include_network=False)

        assert len(result["open_commitments"]) == 1
        assert "review the PR" in result["open_commitments"][0]["content"]
    finally:
        db.close()


def test_entity_overview_unknown_entity():
    """Entity overview handles unknown entities gracefully."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)
        result = svc.entity_overview(["NonexistentPerson"])

        assert result["entities"] == []
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 3: Hierarchical entity summaries
# ═══════════════════════════════════════════════════════════════════

def test_generate_entity_summaries():
    """Entity summaries are generated for entities with enough memories."""
    db, tmpdir = _make_db()
    try:
        svc = _make_consolidate(db)

        alice_id = _insert_entity(db, "Alice", metadata={"company": "Acme"})
        bob_id = _insert_entity(db, "Bob")

        # Alice has enough memories (min is 2 for tests)
        _insert_memory(db, "Alice is the VP of Engineering", alice_id)
        _insert_memory(db, "Alice prefers async communication", alice_id)
        _insert_memory(db, "Alice manages the backend team", alice_id)

        # Bob has only 1 memory (not enough)
        _insert_memory(db, "Bob works at Acme", bob_id)

        count = svc.generate_entity_summaries()
        assert count >= 1

        # Check that Alice has a summary
        summary = db.get_one(
            "entity_summaries",
            where="entity_id = ? AND summary_type = 'overview'",
            where_params=(alice_id,),
        )
        assert summary is not None
        assert "Alice" in summary["summary"]
        assert summary["memory_count"] >= 2

        # Bob should NOT have a summary (not enough memories)
        bob_summary = db.get_one(
            "entity_summaries",
            where="entity_id = ? AND summary_type = 'overview'",
            where_params=(bob_id,),
        )
        assert bob_summary is None
    finally:
        db.close()


def test_entity_summary_includes_relationships():
    """Entity summaries include relationship information."""
    db, tmpdir = _make_db()
    try:
        svc = _make_consolidate(db)

        alice_id = _insert_entity(db, "Alice")
        bob_id = _insert_entity(db, "Bob")
        _relate(db, alice_id, bob_id, "manages", strength=0.9)

        _insert_memory(db, "Alice is the VP of Engineering", alice_id)
        _insert_memory(db, "Alice leads the platform team", alice_id)

        count = svc.generate_entity_summaries()
        assert count >= 1

        summary = db.get_one(
            "entity_summaries",
            where="entity_id = ? AND summary_type = 'overview'",
            where_params=(alice_id,),
        )
        assert summary is not None
        assert "Relationships" in summary["summary"] or "manages" in summary["summary"]
    finally:
        db.close()


def test_entity_summary_respects_expiry():
    """Entity summaries are not regenerated if still fresh."""
    db, tmpdir = _make_db()
    try:
        svc = _make_consolidate(db)

        alice_id = _insert_entity(db, "Alice")
        _insert_memory(db, "Alice is the VP of Engineering", alice_id)
        _insert_memory(db, "Alice prefers async communication", alice_id)

        # First generation
        count1 = svc.generate_entity_summaries()
        assert count1 >= 1

        # Second generation (should skip since summary is fresh)
        count2 = svc.generate_entity_summaries()
        assert count2 == 0
    finally:
        db.close()


def test_entity_summary_disabled():
    """Entity summaries are skipped when disabled."""
    db, tmpdir = _make_db()
    try:
        svc = _make_consolidate(db)
        svc.config.enable_entity_summaries = False

        alice_id = _insert_entity(db, "Alice")
        _insert_memory(db, "Alice is the VP of Engineering", alice_id)
        _insert_memory(db, "Alice prefers async communication", alice_id)

        count = svc.generate_entity_summaries()
        assert count == 0
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 4: Auto-dedupe entity detection
# ═══════════════════════════════════════════════════════════════════

def test_auto_dedupe_alias_overlap():
    """Auto-dedupe detects entities sharing aliases."""
    db, tmpdir = _make_db()
    try:
        svc = _make_consolidate(db)

        alice1_id = _insert_entity(db, "Alice Chen")
        alice2_id = _insert_entity(db, "A. Chen")

        # Both have the same alias
        db.insert("entity_aliases", {
            "entity_id": alice1_id,
            "alias": "alice",
            "canonical_alias": "alice",
        })
        db.insert("entity_aliases", {
            "entity_id": alice2_id,
            "alias": "alice",
            "canonical_alias": "alice",
        })

        candidates = svc.auto_dedupe_entities()
        assert len(candidates) >= 1
        pair = candidates[0]
        ids = {pair["entity_1"]["id"], pair["entity_2"]["id"]}
        assert ids == {alice1_id, alice2_id}
        assert pair["method"] == "alias_overlap"
    finally:
        db.close()


def test_auto_dedupe_disabled():
    """Auto-dedupe returns empty when disabled."""
    db, tmpdir = _make_db()
    try:
        svc = _make_consolidate(db)
        svc.config.enable_auto_dedupe = False

        alice1_id = _insert_entity(db, "Alice Chen")
        alice2_id = _insert_entity(db, "A. Chen")

        candidates = svc.auto_dedupe_entities()
        assert candidates == []
    finally:
        db.close()


def test_auto_dedupe_different_types_skipped():
    """Auto-dedupe skips entities of different types."""
    db, tmpdir = _make_db()
    try:
        svc = _make_consolidate(db)

        _insert_entity(db, "Alice", entity_type="person")
        _insert_entity(db, "Alice", entity_type="project")

        # These share a name but are different types -- should not be flagged
        # (The UNIQUE constraint on canonical_name+type allows both)
        candidates = svc.auto_dedupe_entities()
        # No alias overlap, no embedding similarity without embeddings
        assert len(candidates) == 0
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 5: Provenance chain rendering
# ═══════════════════════════════════════════════════════════════════

def test_provenance_chain_basic():
    """Trace memory returns a provenance chain."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        alice_id = _insert_entity(db, "Alice")
        mem_id = db.insert(
            "memories",
            {
                "content": "Alice is the VP of Engineering",
                "content_hash": content_hash("Alice is the VP of Engineering"),
                "type": "fact",
                "importance": 0.9,
                "confidence": 1.0,
                "origin_type": "user_stated",
                "source_channel": "claude_code",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            },
        )
        db.insert("memory_entities", {"memory_id": mem_id, "entity_id": alice_id, "relationship": "about"})

        result = svc.trace_memory(mem_id)

        assert result["memory"] is not None
        assert "provenance_chain" in result
        chain = result["provenance_chain"]
        assert len(chain) >= 2

        # First step should be origin
        assert chain[0]["type"] == "origin"
        assert "user_stated" in chain[0]["label"]
        assert "claude_code" in chain[0]["label"]

        # Should have a memory step
        memory_steps = [s for s in chain if s["type"] == "memory"]
        assert len(memory_steps) == 1
        assert "fact" in memory_steps[0]["label"]

        # Should have an entities step
        entity_steps = [s for s in chain if s["type"] == "entities"]
        assert len(entity_steps) == 1
        assert "Alice" in entity_steps[0]["label"]
    finally:
        db.close()


def test_provenance_chain_with_correction():
    """Provenance chain includes correction history."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        mem_id = db.insert(
            "memories",
            {
                "content": "Alice is the CTO of Acme",
                "content_hash": content_hash("Alice is the CTO of Acme"),
                "type": "fact",
                "importance": 0.9,
                "confidence": 1.0,
                "origin_type": "corrected",
                "corrected_at": datetime.utcnow().isoformat(),
                "corrected_from": "Alice is the VP of Engineering at Acme",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            },
        )

        result = svc.trace_memory(mem_id)
        chain = result["provenance_chain"]

        correction_steps = [s for s in chain if s["type"] == "correction"]
        assert len(correction_steps) == 1
        assert "VP of Engineering" in correction_steps[0]["label"]
    finally:
        db.close()


def test_provenance_chain_with_invalidation():
    """Provenance chain includes invalidation."""
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        mem_id = db.insert(
            "memories",
            {
                "content": "Alice works at Acme",
                "content_hash": content_hash("Alice works at Acme"),
                "type": "fact",
                "importance": 0.1,
                "confidence": 0.5,
                "origin_type": "extracted",
                "invalidated_at": datetime.utcnow().isoformat(),
                "invalidated_reason": "Alice left Acme in January",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            },
        )

        result = svc.trace_memory(mem_id)
        chain = result["provenance_chain"]

        invalidation_steps = [s for s in chain if s["type"] == "invalidation"]
        assert len(invalidation_steps) == 1
        assert "left Acme" in invalidation_steps[0]["label"]
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 6: Full consolidation includes new phases
# ═══════════════════════════════════════════════════════════════════

def test_full_consolidation_includes_summaries_and_dedupe():
    """Full consolidation runs entity summary generation and auto-dedupe."""
    db, tmpdir = _make_db()
    try:
        svc = _make_consolidate(db)

        alice_id = _insert_entity(db, "Alice")
        _insert_memory(db, "Alice is the VP of Engineering", alice_id)
        _insert_memory(db, "Alice prefers async communication", alice_id)
        _insert_memory(db, "Alice manages the backend team", alice_id)

        results = svc.run_full_consolidation()

        assert "entity_summaries_generated" in results
        assert "dedupe_candidates_found" in results
        assert results["entity_summaries_generated"] >= 1
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 7: Graph proximity multi-entity bonus
# ═══════════════════════════════════════════════════════════════════

def test_graph_scores_multi_entity_bonus():
    """Memories connected to multiple query entities get boosted via multi-entity bonus.

    When both entities are directly mentioned (distance=0, score=1.0), the
    multi-entity bonus is capped at 1.0. To test the bonus, we use a setup
    where one entity is a direct match and the other is reachable via graph
    traversal (distance=1), so base scores are below 1.0 for the neighbor.
    """
    db, tmpdir = _make_db()
    try:
        svc = _make_recall(db)

        alice_id = _insert_entity(db, "Alice")
        bob_id = _insert_entity(db, "Bob")
        charlie_id = _insert_entity(db, "Charlie")

        # Alice -> Bob via relationship (Bob is reachable at distance 1 from Alice)
        _relate(db, alice_id, bob_id, "manages", strength=0.8)

        # Memory linked to both Alice (direct) and Bob (1-hop from query entity)
        mem_both = db.insert(
            "memories",
            {
                "content": "Alice and Bob discussed the roadmap",
                "content_hash": content_hash("Alice and Bob discussed the roadmap"),
                "type": "fact",
                "importance": 0.8,
                "confidence": 1.0,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            },
        )
        db.insert("memory_entities", {"memory_id": mem_both, "entity_id": alice_id, "relationship": "about"})
        db.insert("memory_entities", {"memory_id": mem_both, "entity_id": bob_id, "relationship": "about"})

        # Memory linked to just Bob (1-hop from alice)
        mem_bob_only = db.insert(
            "memories",
            {
                "content": "Bob prefers morning meetings",
                "content_hash": content_hash("Bob prefers morning meetings"),
                "type": "preference",
                "importance": 0.5,
                "confidence": 1.0,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            },
        )
        db.insert("memory_entities", {"memory_id": mem_bob_only, "entity_id": bob_id, "relationship": "about"})

        # Query mentions only Alice -- Bob is reachable via graph expansion
        scores = svc._compute_graph_scores("alice", {mem_both, mem_bob_only})

        # Both should have scores (alice is direct, bob is 1-hop)
        assert mem_both in scores
        assert mem_bob_only in scores
        # mem_both is linked to Alice (direct=1.0) AND Bob (1-hop), so it should
        # get the multi-entity bonus. mem_bob_only is only linked to Bob (1-hop).
        assert scores[mem_both] >= scores[mem_bob_only]
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════
# TEST 8: Entity overview with cached summaries
# ═══════════════════════════════════════════════════════════════════

def test_entity_overview_with_cached_summaries():
    """Entity overview includes cached summaries when available."""
    db, tmpdir = _make_db()
    try:
        recall_svc = _make_recall(db)
        consolidate_svc = _make_consolidate(db)

        alice_id = _insert_entity(db, "Alice")
        _insert_memory(db, "Alice is the VP of Engineering", alice_id)
        _insert_memory(db, "Alice prefers async communication", alice_id)
        _insert_memory(db, "Alice manages the backend team", alice_id)

        # Generate summaries first
        consolidate_svc.generate_entity_summaries()

        # Now query with summaries
        result = recall_svc.entity_overview(["Alice"], include_network=False, include_summaries=True)

        assert len(result["entities"]) == 1
        entity = result["entities"][0]
        assert "summary" in entity
        assert "Alice" in entity["summary"]
    finally:
        db.close()
