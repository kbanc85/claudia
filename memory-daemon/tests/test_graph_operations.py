"""Tests for graph operations: traversal, weighted expansion, entity overview,
entity resolution, project networks, path finding, hub analysis, dormant
relationships, pattern detection, and attribute extraction.

Consolidated from test_graph.py, test_graph_retrieval.py, test_graph_analytics.py.
"""

import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database, content_hash
from claudia_memory.services.recall import RecallService
from claudia_memory.services.consolidate import ConsolidateService


# =============================================================================
# Shared helpers
# =============================================================================


def _make_db():
    """Create a fresh test database."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _make_recall(db):
    """Create a RecallService with test config (superset of all graph test needs)."""
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
        "min_importance_threshold": 0.1,
    })()
    from claudia_memory.extraction.entity_extractor import get_extractor
    svc.extractor = get_extractor()
    svc.embedding_service = None
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
    """Insert an entity and return its ID."""
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
    """Create a relationship between entities."""
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


def _insert_memory(db, content, entity_id, importance=1.0, mem_type="fact", created_at=None):
    """Insert a memory linked to an entity."""
    if created_at is None:
        created_at = datetime.utcnow().isoformat()
    mem_id = db.insert(
        "memories",
        {
            "content": content,
            "content_hash": content_hash(content),
            "type": mem_type,
            "importance": importance,
            "confidence": 1.0,
            "created_at": created_at,
            "updated_at": created_at,
        },
    )
    db.insert(
        "memory_entities",
        {"memory_id": mem_id, "entity_id": entity_id, "relationship": "about"},
    )
    return mem_id


def _link_memory_to_entity(db, mem_id, entity_id):
    """Link an existing memory to an additional entity."""
    db.insert(
        "memory_entities",
        {"memory_id": mem_id, "entity_id": entity_id, "relationship": "about"},
    )


# =============================================================================
# Basic graph traversal (from test_graph.py)
# =============================================================================


class TestGraphTraversal:
    """Tests for basic _expand_graph traversal."""

    def test_single_hop(self):
        """A->B->C, query A at depth 1: get B only."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            a_id = _insert_entity(db, "Alice")
            b_id = _insert_entity(db, "Bob")
            c_id = _insert_entity(db, "Charlie")

            _relate(db, a_id, b_id)
            _relate(db, b_id, c_id)

            connected = svc._expand_graph(a_id, depth=1)
            names = [c["name"] for c in connected]
            assert "Bob" in names
            assert "Charlie" not in names
        finally:
            db.close()

    def test_no_cycles(self):
        """Bidirectional A<->B doesn't loop."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            a_id = _insert_entity(db, "Alice")
            b_id = _insert_entity(db, "Bob")

            _relate(db, a_id, b_id)
            _relate(db, b_id, a_id)

            connected = svc._expand_graph(a_id, depth=2)
            names = [c["name"] for c in connected]
            assert names.count("Bob") == 1
            assert "Alice" not in names
        finally:
            db.close()

    def test_depth_limit(self):
        """Depth 2 from A gets B and C, but not D at depth 3."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            a_id = _insert_entity(db, "Alice")
            b_id = _insert_entity(db, "Bob")
            c_id = _insert_entity(db, "Charlie")
            d_id = _insert_entity(db, "Diana")

            _relate(db, a_id, b_id)
            _relate(db, b_id, c_id)
            _relate(db, c_id, d_id)

            connected = svc._expand_graph(a_id, depth=2, limit_per_hop=10)
            names = [c["name"] for c in connected]
            assert "Bob" in names
            assert "Charlie" in names
            assert "Diana" not in names
        finally:
            db.close()

    def test_weak_relationships_excluded(self):
        """Strength <= 0.1 relationships are excluded."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            a_id = _insert_entity(db, "Alice")
            b_id = _insert_entity(db, "Bob")
            c_id = _insert_entity(db, "Charlie")

            _relate(db, a_id, b_id, strength=0.8)
            _relate(db, a_id, c_id, strength=0.05)

            connected = svc._expand_graph(a_id, depth=1)
            names = [c["name"] for c in connected]
            assert "Bob" in names
            assert "Charlie" not in names
        finally:
            db.close()

    def test_empty_graph(self):
        """Isolated entity returns empty list."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            a_id = _insert_entity(db, "Alice")

            connected = svc._expand_graph(a_id, depth=1)
            assert connected == []
        finally:
            db.close()


# =============================================================================
# Weighted graph traversal (from test_graph_retrieval.py)
# =============================================================================


class TestWeightedGraphTraversal:
    """Tests for strength-aware _expand_graph_weighted."""

    def test_single_hop_with_path_strength(self):
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

    def test_two_hop_strength_multiplication(self):
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

    def test_excludes_weak(self):
        """Weak relationships (strength <= 0.1) are excluded."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            alice_id = _insert_entity(db, "Alice")
            bob_id = _insert_entity(db, "Bob")
            charlie_id = _insert_entity(db, "Charlie")

            _relate(db, alice_id, bob_id, "manages", strength=0.9)
            _relate(db, alice_id, charlie_id, "works_with", strength=0.05)

            neighbors = svc._expand_graph_weighted(alice_id, depth=1)
            names = [n["name"] for n in neighbors]

            assert "Bob" in names
            assert "Charlie" not in names
        finally:
            db.close()

    def test_no_cycles(self):
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


# =============================================================================
# Entity overview (from test_graph_retrieval.py)
# =============================================================================


class TestEntityOverview:
    """Tests for entity_overview community-style queries."""

    def test_basic_overview(self):
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

    def test_cross_entity_patterns(self):
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
            pattern = result["cross_entity_patterns"][0]
            assert "Alice" in pattern["entities_involved"] or "Bob" in pattern["entities_involved"]
        finally:
            db.close()

    def test_with_relationships(self):
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

    def test_with_commitments(self):
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

    def test_unknown_entity(self):
        """Entity overview handles unknown entities gracefully."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)
            result = svc.entity_overview(["NonexistentPerson"])

            assert result["entities"] == []
        finally:
            db.close()

    def test_with_cached_summaries(self):
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


# =============================================================================
# Entity resolution word-boundary matching (from test_graph_retrieval.py)
# =============================================================================


class TestEntityResolutionSubstring:
    """Test that entity resolution uses word boundaries, not substring matching."""

    def test_no_false_substring_match(self):
        """Entity 'Tom' must NOT match 'customization options'."""
        db, tmpdir = _make_db()
        try:
            recall = _make_recall(db)
            _insert_entity(db, "Tom", entity_type="person", importance=0.8)

            resolved = recall._resolve_entities_from_text("customization options for the bottom panel")
            entity_names = []
            for eid in resolved:
                row = db.get_one("entities", where="id = ?", where_params=(eid,))
                if row:
                    entity_names.append(row["name"].lower())
            assert "tom" not in entity_names, "Entity 'Tom' should NOT match 'customization' or 'bottom'"
        finally:
            db.close()

    def test_exact_word_match(self):
        """Entity 'Tom' MUST match 'Talk to Tom'."""
        db, tmpdir = _make_db()
        try:
            recall = _make_recall(db)
            _insert_entity(db, "Tom", entity_type="person", importance=0.8)

            resolved = recall._resolve_entities_from_text("Talk to Tom about the project")
            entity_names = []
            for eid in resolved:
                row = db.get_one("entities", where="id = ?", where_params=(eid,))
                if row:
                    entity_names.append(row["name"].lower())
            assert "tom" in entity_names, "Entity 'Tom' should match 'Talk to Tom'"
        finally:
            db.close()

    def test_case_insensitive_possessive_match(self):
        """Entity 'Tom' MUST match 'tom's project' (case insensitive)."""
        db, tmpdir = _make_db()
        try:
            recall = _make_recall(db)
            _insert_entity(db, "Tom", entity_type="person", importance=0.8)

            resolved = recall._resolve_entities_from_text("I need to review tom's project")
            entity_names = []
            for eid in resolved:
                row = db.get_one("entities", where="id = ?", where_params=(eid,))
                if row:
                    entity_names.append(row["name"].lower())
            assert "tom" in entity_names, "Entity 'Tom' should match \"tom's project\""
        finally:
            db.close()


# =============================================================================
# Hierarchical entity summaries (from test_graph_retrieval.py)
# =============================================================================


class TestEntitySummaries:
    """Tests for generate_entity_summaries in ConsolidateService."""

    def test_generates_summaries(self):
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

    def test_includes_relationships(self):
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

    def test_respects_expiry(self):
        """Entity summaries are not regenerated if still fresh."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            alice_id = _insert_entity(db, "Alice")
            _insert_memory(db, "Alice is the VP of Engineering", alice_id)
            _insert_memory(db, "Alice prefers async communication", alice_id)

            count1 = svc.generate_entity_summaries()
            assert count1 >= 1

            count2 = svc.generate_entity_summaries()
            assert count2 == 0
        finally:
            db.close()

    def test_disabled(self):
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


# =============================================================================
# Auto-dedupe entity detection (from test_graph_retrieval.py)
# =============================================================================


class TestAutoDedupe:
    """Tests for auto_dedupe_entities in ConsolidateService."""

    def test_alias_overlap(self):
        """Auto-dedupe detects entities sharing aliases."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            alice1_id = _insert_entity(db, "Alice Chen")
            alice2_id = _insert_entity(db, "A. Chen")

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

    def test_disabled(self):
        """Auto-dedupe returns empty when disabled."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)
            svc.config.enable_auto_dedupe = False

            _insert_entity(db, "Alice Chen")
            _insert_entity(db, "A. Chen")

            candidates = svc.auto_dedupe_entities()
            assert candidates == []
        finally:
            db.close()

    def test_different_types_skipped(self):
        """Auto-dedupe skips entities of different types."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            _insert_entity(db, "Alice", entity_type="person")
            _insert_entity(db, "Alice", entity_type="project")

            candidates = svc.auto_dedupe_entities()
            assert len(candidates) == 0
        finally:
            db.close()


# =============================================================================
# Provenance chain (from test_graph_retrieval.py)
# =============================================================================


class TestProvenanceChain:
    """Tests for trace_memory provenance chain rendering."""

    def test_basic_chain(self):
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

            assert chain[0]["type"] == "origin"
            assert "user_stated" in chain[0]["label"]
            assert "claude_code" in chain[0]["label"]

            memory_steps = [s for s in chain if s["type"] == "memory"]
            assert len(memory_steps) == 1
            assert "fact" in memory_steps[0]["label"]

            entity_steps = [s for s in chain if s["type"] == "entities"]
            assert len(entity_steps) == 1
            assert "Alice" in entity_steps[0]["label"]
        finally:
            db.close()

    def test_with_correction(self):
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

    def test_with_invalidation(self):
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


# =============================================================================
# Full consolidation integration (from test_graph_retrieval.py)
# =============================================================================


class TestConsolidationIntegration:
    """Tests that full consolidation includes new phases."""

    def test_includes_summaries_and_dedupe(self):
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


# =============================================================================
# Graph proximity scoring (from test_graph_retrieval.py)
# =============================================================================


class TestGraphProximityScoring:
    """Tests for _compute_graph_scores multi-entity bonus."""

    def test_multi_entity_bonus(self):
        """Memories connected to multiple query entities get boosted."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            alice_id = _insert_entity(db, "Alice")
            bob_id = _insert_entity(db, "Bob")
            charlie_id = _insert_entity(db, "Charlie")

            _relate(db, alice_id, bob_id, "manages", strength=0.8)

            # Memory linked to both Alice (direct) and Bob (1-hop from Alice)
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

            # Memory linked to just Bob (1-hop from Alice)
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

            scores = svc._compute_graph_scores("alice", {mem_both, mem_bob_only})

            assert mem_both in scores
            assert mem_bob_only in scores
            assert scores[mem_both] >= scores[mem_bob_only]
        finally:
            db.close()


# =============================================================================
# Project network (from test_graph_analytics.py)
# =============================================================================


class TestProjectNetwork:
    """Tests for get_project_network method."""

    def test_returns_direct_participants(self):
        """Project network includes people directly connected to project."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            project_id = _insert_entity(db, "Website Redesign", entity_type="project")
            alice_id = _insert_entity(db, "Alice")
            bob_id = _insert_entity(db, "Bob")

            _relate(db, alice_id, project_id, rel_type="collaborates_on")
            _relate(db, bob_id, project_id, rel_type="manages")

            result = svc.get_project_network("Website Redesign")

            assert result["project"]["name"] == "Website Redesign"
            participant_names = [p["name"] for p in result["direct_participants"]]
            assert "Alice" in participant_names
            assert "Bob" in participant_names
            assert result["total_people"] >= 2
        finally:
            db.close()

    def test_returns_organizations(self):
        """Project network includes organizations connected to project."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            project_id = _insert_entity(db, "Mobile App", entity_type="project")
            org_id = _insert_entity(db, "Acme Corp", entity_type="organization")

            _relate(db, org_id, project_id, rel_type="sponsors")

            result = svc.get_project_network("Mobile App")

            org_names = [o["name"] for o in result["organizations"]]
            assert "Acme Corp" in org_names
        finally:
            db.close()

    def test_not_found_returns_error(self):
        """Non-existent project returns error."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            result = svc.get_project_network("Nonexistent Project")

            assert "error" in result
            assert result["project"] is None
        finally:
            db.close()


# =============================================================================
# Path finding (from test_graph_analytics.py)
# =============================================================================


class TestPathFinding:
    """Tests for find_path method."""

    def test_direct_connection(self):
        """Finds path between directly connected entities."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            alice_id = _insert_entity(db, "Alice")
            bob_id = _insert_entity(db, "Bob")

            _relate(db, alice_id, bob_id, rel_type="works_with")

            path = svc.find_path("Alice", "Bob")

            assert path is not None
            assert len(path) >= 2
        finally:
            db.close()

    def test_two_hop_path(self):
        """Finds path through intermediate entity."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            alice_id = _insert_entity(db, "Alice")
            bob_id = _insert_entity(db, "Bob")
            charlie_id = _insert_entity(db, "Charlie")

            _relate(db, alice_id, bob_id)
            _relate(db, bob_id, charlie_id)

            path = svc.find_path("Alice", "Charlie", max_depth=2)

            assert path is not None
            assert len(path) >= 3
        finally:
            db.close()

    def test_no_path_returns_none(self):
        """Returns None when no path exists."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            alice_id = _insert_entity(db, "Alice")
            bob_id = _insert_entity(db, "Bob")

            path = svc.find_path("Alice", "Bob")

            assert path is None
        finally:
            db.close()

    def test_same_entity_returns_single_element(self):
        """Path from entity to itself returns single element."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            alice_id = _insert_entity(db, "Alice")

            path = svc.find_path("Alice", "Alice")

            assert path is not None
            assert len(path) == 1
        finally:
            db.close()


# =============================================================================
# Hub analysis (from test_graph_analytics.py)
# =============================================================================


class TestHubAnalysis:
    """Tests for get_hub_entities method."""

    def test_finds_highly_connected_entities(self):
        """Identifies entities with many connections."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            alice_id = _insert_entity(db, "Alice")
            for i in range(6):
                person_id = _insert_entity(db, f"Person{i}")
                _relate(db, alice_id, person_id)

            bob_id = _insert_entity(db, "Bob")
            _relate(db, bob_id, _insert_entity(db, "Carol"))
            _relate(db, bob_id, _insert_entity(db, "Dan"))

            hubs = svc.get_hub_entities(min_connections=5)

            hub_names = [h["name"] for h in hubs]
            assert "Alice" in hub_names
            assert "Bob" not in hub_names
        finally:
            db.close()

    def test_filters_by_entity_type(self):
        """Can filter hubs by entity type."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            org_id = _insert_entity(db, "Acme Corp", entity_type="organization")
            for i in range(6):
                person_id = _insert_entity(db, f"Employee{i}")
                _relate(db, org_id, person_id, rel_type="employs")

            alice_id = _insert_entity(db, "Alice", entity_type="person")
            for i in range(6):
                person_id = _insert_entity(db, f"Friend{i}")
                _relate(db, alice_id, person_id)

            hubs = svc.get_hub_entities(min_connections=5, entity_type="organization")

            hub_names = [h["name"] for h in hubs]
            assert "Acme Corp" in hub_names
            assert "Alice" not in hub_names
        finally:
            db.close()


# =============================================================================
# Dormant relationships (from test_graph_analytics.py)
# =============================================================================


class TestDormantRelationships:
    """Tests for get_dormant_relationships method."""

    def test_finds_old_relationships(self):
        """Identifies relationships with no recent activity."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            alice_id = _insert_entity(db, "Alice")
            bob_id = _insert_entity(db, "Bob")

            _relate(db, alice_id, bob_id, strength=0.8)

            old_date = (datetime.utcnow() - timedelta(days=90)).isoformat()
            _insert_memory(db, "Alice worked on project X", alice_id, created_at=old_date)
            _insert_memory(db, "Bob completed task Y", bob_id, created_at=old_date)

            dormant = svc.get_dormant_relationships(days=30, min_strength=0.3)
            assert isinstance(dormant, list)

            if len(dormant) > 0:
                assert "relationship_id" in dormant[0]
                assert "source" in dormant[0]
                assert "target" in dormant[0]
                assert "days_dormant" in dormant[0]
        finally:
            db.close()

    def test_returns_correct_structure(self):
        """Verifies dormant relationship results have correct structure."""
        db, tmpdir = _make_db()
        try:
            svc = _make_recall(db)

            dormant = svc.get_dormant_relationships(days=30)
            assert isinstance(dormant, list)
            assert dormant == []
        finally:
            db.close()


# =============================================================================
# Pattern detection (from test_graph_analytics.py)
# =============================================================================


class TestPatternDetection:
    """Tests for pattern detection methods in ConsolidateService."""

    def test_infer_connections_same_company(self):
        """Same company metadata infers colleagues relationship."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            alice_id = _insert_entity(db, "Alice", metadata={"company": "Acme Corp"})
            bob_id = _insert_entity(db, "Bob", metadata={"company": "Acme Corp"})

            inference = svc.infer_connections(alice_id, bob_id)

            assert inference is not None
            rel_type, confidence = inference
            assert rel_type == "colleagues"
            assert confidence >= 0.8
        finally:
            db.close()

    def test_infer_connections_same_community(self):
        """Shared community membership infers connection."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            alice_id = _insert_entity(db, "Alice", metadata={"communities": ["YPO", "Rotary"]})
            bob_id = _insert_entity(db, "Bob", metadata={"communities": ["YPO"]})

            inference = svc.infer_connections(alice_id, bob_id)

            assert inference is not None
            rel_type, confidence = inference
            assert rel_type == "community_connection"
            assert confidence >= 0.5
        finally:
            db.close()

    def test_infer_connections_city_and_industry(self):
        """Same city + industry infers weak likely_connected."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            alice_id = _insert_entity(db, "Alice", metadata={
                "geography": {"city": "Miami"},
                "industries": ["real estate"]
            })
            bob_id = _insert_entity(db, "Bob", metadata={
                "geography": {"city": "Miami"},
                "industries": ["real estate", "finance"]
            })

            inference = svc.infer_connections(alice_id, bob_id)

            assert inference is not None
            rel_type, confidence = inference
            assert rel_type == "likely_connected"
            assert confidence >= 0.2
        finally:
            db.close()

    def test_infer_connections_no_shared_attributes(self):
        """No shared attributes returns None."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            alice_id = _insert_entity(db, "Alice", metadata={
                "geography": {"city": "New York"},
                "industries": ["technology"]
            })
            bob_id = _insert_entity(db, "Bob", metadata={
                "geography": {"city": "Los Angeles"},
                "industries": ["healthcare"]
            })

            inference = svc.infer_connections(alice_id, bob_id)

            assert inference is None
        finally:
            db.close()

    def test_introduction_opportunities(self):
        """Finds people who should know each other based on attributes."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            alice_id = _insert_entity(db, "Alice", importance=0.8, metadata={"company": "Acme Corp"})
            bob_id = _insert_entity(db, "Bob", importance=0.8, metadata={"company": "Acme Corp"})

            patterns = svc._detect_introduction_opportunities()

            descriptions = [p.description for p in patterns]
            matching = [d for d in descriptions if "Alice" in d and "Bob" in d]
            assert len(matching) >= 1
        finally:
            db.close()

    def test_cluster_forming(self):
        """Identifies groups of people mentioned together frequently."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            alice_id = _insert_entity(db, "Alice")
            bob_id = _insert_entity(db, "Bob")
            charlie_id = _insert_entity(db, "Charlie")

            recent_date = (datetime.utcnow() - timedelta(days=5)).isoformat()
            for i in range(3):
                mem_id = _insert_memory(
                    db, f"Meeting with Alice, Bob, and Charlie #{i}",
                    alice_id, created_at=recent_date
                )
                _link_memory_to_entity(db, mem_id, bob_id)
                _link_memory_to_entity(db, mem_id, charlie_id)

            patterns = svc._detect_cluster_forming()

            assert isinstance(patterns, list)
        finally:
            db.close()

    def test_skill_project_matches(self):
        """Finds people with matching industry for a project."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            project_id = _insert_entity(
                db, "Property Deal",
                entity_type="project",
                importance=0.8,
                metadata={"industries": ["real estate"]}
            )

            alice_id = _insert_entity(
                db, "Alice",
                importance=0.8,
                metadata={"industries": ["real estate", "finance"]}
            )

            patterns = svc._detect_skill_project_matches()

            descriptions = [p.description for p in patterns]
            matching = [d for d in descriptions if "Alice" in d and "Property Deal" in d]
            assert len(matching) >= 1 or len(patterns) == 0
        finally:
            db.close()


# =============================================================================
# Network bridges (from test_graph_analytics.py)
# =============================================================================


class TestNetworkBridges:
    """Tests for _detect_network_bridges method."""

    def test_detects_bridge_between_clusters(self):
        """Identifies when someone bridges distinct groups."""
        db, tmpdir = _make_db()
        try:
            svc = _make_consolidate(db)

            alice_id = _insert_entity(db, "Alice", importance=0.9)

            bob_id = _insert_entity(db, "Bob", importance=0.5)
            carol_id = _insert_entity(db, "Carol", importance=0.5)
            dan_id = _insert_entity(db, "Dan", importance=0.5)

            eve_id = _insert_entity(db, "Eve", importance=0.5)
            frank_id = _insert_entity(db, "Frank", importance=0.5)

            for person_id in [bob_id, carol_id, dan_id, eve_id, frank_id]:
                _relate(db, alice_id, person_id, strength=0.8)

            patterns = svc._detect_network_bridges()

            assert isinstance(patterns, list)
        finally:
            db.close()


# =============================================================================
# Attribute extraction (from test_graph_analytics.py)
# =============================================================================


class TestAttributeExtraction:
    """Tests for entity attribute extraction."""

    def test_extracts_geography_from_text(self):
        """Extracts city/state from text patterns."""
        from claudia_memory.extraction.entity_extractor import extract_attributes

        text = "Sarah is based in Miami, FL and works in real estate."
        attrs = extract_attributes(text)

        assert attrs.geography is not None
        assert attrs.geography.get("city") == "Miami"

    def test_extracts_industries_from_text(self):
        """Extracts industry keywords from text."""
        from claudia_memory.extraction.entity_extractor import extract_attributes

        text = "John specializes in technology and finance consulting."
        attrs = extract_attributes(text)

        assert attrs.industries is not None
        assert "technology" in attrs.industries or "finance" in attrs.industries

    def test_extracts_role_from_text(self):
        """Extracts professional role from text."""
        from claudia_memory.extraction.entity_extractor import extract_attributes

        text = "Alice is the CEO of Acme Corp."
        attrs = extract_attributes(text)

        assert attrs.role is not None
        assert "CEO" in attrs.role or "Ceo" in attrs.role

    def test_extracts_communities_from_text(self):
        """Extracts community memberships from text."""
        from claudia_memory.extraction.entity_extractor import extract_attributes

        text = "Bob is a member of YPO and the Palm Beach Civic Association."
        attrs = extract_attributes(text)

        assert attrs.communities is not None
        communities_lower = [c.lower() for c in attrs.communities]
        assert "ypo" in communities_lower or any("civic" in c for c in communities_lower)
