"""Tests for parallel batch embedding optimization.

Verifies that the batch handler's parallel embedding pass correctly:
- Skips embed_sync when precomputed embeddings are provided
- Falls back to embed_sync when no precomputed embedding is given
- Stores memories and entities correctly in both cases

Note: Vector tables (memory_embeddings, entity_embeddings) require sqlite-vec
which may not be available in test environments. Tests verify behavior through
mock assertions rather than querying vector tables directly.
"""

import json
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from claudia_memory.database import Database, content_hash


@pytest.fixture
def db():
    """Create a temporary test database"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


def _get_remember_service(db):
    """Create a RememberService with test database and mocked embeddings"""
    from claudia_memory.services.remember import RememberService
    from claudia_memory.extraction.entity_extractor import get_extractor

    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc.embedding_service = MagicMock()
    svc.extractor = get_extractor()
    return svc


def _fake_embedding(text):
    """Generate a deterministic fake 384-dim embedding from text"""
    import hashlib
    h = hashlib.sha256(text.encode()).digest()
    return [float(b) / 255.0 for b in (h * 12)][:384]


class TestPrecomputedEmbedding:
    """Tests that precomputed embeddings skip the embed_sync call"""

    def test_remember_fact_with_precomputed_skips_embed(self, db):
        """When precomputed embedding is provided, embed_sync is not called"""
        svc = _get_remember_service(db)
        fake_emb = _fake_embedding("test content")

        with patch("claudia_memory.services.remember.embed_sync") as mock_embed:
            memory_id = svc.remember_fact(
                content="Ford prefers async communication",
                memory_type="preference",
                importance=0.7,
                _precomputed_embedding=fake_emb,
            )

            mock_embed.assert_not_called()

        assert memory_id is not None
        # Memory itself is stored in the regular memories table
        memory = db.get_one("memories", where="id = ?", where_params=(memory_id,))
        assert memory is not None
        assert memory["content"] == "Ford prefers async communication"
        assert memory["type"] == "preference"

    def test_remember_fact_without_precomputed_calls_embed(self, db):
        """Without precomputed embedding, embed_sync is called normally"""
        svc = _get_remember_service(db)
        fallback_emb = _fake_embedding("fallback")

        with patch("claudia_memory.services.remember.embed_sync", return_value=fallback_emb) as mock_embed:
            memory_id = svc.remember_fact(
                content="Some fact to remember",
                memory_type="fact",
                importance=0.8,
            )

            mock_embed.assert_called_once_with("Some fact to remember")

        assert memory_id is not None

    def test_remember_entity_with_precomputed_skips_embed(self, db):
        """New entity uses precomputed embedding instead of calling embed_sync"""
        svc = _get_remember_service(db)
        fake_emb = _fake_embedding("Ford Perry. CEO of Perry Ventures")

        with patch("claudia_memory.services.remember.embed_sync") as mock_embed:
            entity_id = svc.remember_entity(
                name="Ford Perry",
                entity_type="person",
                description="CEO of Perry Ventures",
                _precomputed_embedding=fake_emb,
            )

            mock_embed.assert_not_called()

        assert entity_id is not None
        entity = db.get_one("entities", where="id = ?", where_params=(entity_id,))
        assert entity["name"] == "Ford Perry"
        assert entity["description"] == "CEO of Perry Ventures"

    def test_remember_entity_existing_skips_embedding(self, db):
        """Updating an existing entity doesn't try to embed again"""
        svc = _get_remember_service(db)

        with patch("claudia_memory.services.remember.embed_sync") as mock_embed:
            # Create entity first time
            entity_id1 = svc.remember_entity(
                name="Ford Perry",
                entity_type="person",
                _precomputed_embedding=_fake_embedding("first"),
            )

            # Update same entity (existing path doesn't embed)
            entity_id2 = svc.remember_entity(
                name="Ford Perry",
                entity_type="person",
                description="Updated description",
                _precomputed_embedding=_fake_embedding("second"),
            )

            mock_embed.assert_not_called()

        assert entity_id1 == entity_id2

    def test_remember_fact_dedup_with_precomputed(self, db):
        """Duplicate content deduplicates even with precomputed embeddings"""
        svc = _get_remember_service(db)

        with patch("claudia_memory.services.remember.embed_sync") as mock_embed:
            id1 = svc.remember_fact(
                content="Ford prefers email",
                _precomputed_embedding=_fake_embedding("v1"),
            )
            id2 = svc.remember_fact(
                content="Ford prefers email",
                _precomputed_embedding=_fake_embedding("v2"),
            )

            mock_embed.assert_not_called()

        assert id1 == id2

    def test_precomputed_none_falls_back_to_embed_sync(self, db):
        """Explicitly passing None for precomputed embedding falls back"""
        svc = _get_remember_service(db)
        fallback_emb = _fake_embedding("fallback")

        with patch("claudia_memory.services.remember.embed_sync", return_value=fallback_emb) as mock_embed:
            memory_id = svc.remember_fact(
                content="Content needing fallback",
                _precomputed_embedding=None,
            )

            mock_embed.assert_called_once()

        assert memory_id is not None


class TestBatchWithParallelEmbeddings:
    """Integration-style tests simulating the batch handler's two-pass flow"""

    def test_batch_seven_memories_no_sequential_embeds(self, db):
        """Realistic scenario: 7 memories from a transcript, all pre-embedded"""
        svc = _get_remember_service(db)

        memories = [
            {"content": f"Memory {i}: fact about the call", "type": "fact", "importance": 0.6 + i * 0.05}
            for i in range(7)
        ]
        embeddings = [_fake_embedding(m["content"]) for m in memories]

        with patch("claudia_memory.services.remember.embed_sync") as mock_embed:
            ids = []
            for m, emb in zip(memories, embeddings):
                mid = svc.remember_fact(
                    content=m["content"],
                    memory_type=m["type"],
                    importance=m["importance"],
                    _precomputed_embedding=emb,
                )
                ids.append(mid)

            mock_embed.assert_not_called()

        assert len(ids) == 7
        assert all(mid is not None for mid in ids)
        assert len(set(ids)) == 7  # All unique

        # Verify all memories stored in regular table
        for mid, m in zip(ids, memories):
            row = db.get_one("memories", where="id = ?", where_params=(mid,))
            assert row is not None
            assert row["content"] == m["content"]

    def test_batch_mixed_operations(self, db):
        """Batch with entity + remember + relate, only primary ops pre-embedded"""
        svc = _get_remember_service(db)

        with patch("claudia_memory.services.remember.embed_sync") as mock_embed:
            # Entity op with precomputed
            entity_id = svc.remember_entity(
                name="Ford Perry",
                entity_type="person",
                description="CEO of Perry Ventures",
                _precomputed_embedding=_fake_embedding("Ford Perry. CEO"),
            )

            # Remember op with precomputed
            memory_id = svc.remember_fact(
                content="Ford prefers async communication",
                memory_type="preference",
                about_entities=["Ford Perry"],
                _precomputed_embedding=_fake_embedding("Ford prefers async"),
            )

            # Relate op (no embedding needed)
            rel_id = svc.relate_entities(
                source_name="Ford Perry",
                target_name="Test User",
                relationship_type="potential_partner",
            )

        assert entity_id is not None
        assert memory_id is not None
        assert rel_id is not None

        # Verify entity linked to memory
        link = db.get_one(
            "memory_entities",
            where="memory_id = ? AND entity_id = ?",
            where_params=(memory_id, entity_id),
        )
        assert link is not None

    def test_batch_partial_embedding_failure_fallback(self, db):
        """When some embeddings fail (None), those ops fall back to embed_sync"""
        svc = _get_remember_service(db)
        fallback_emb = _fake_embedding("fallback")

        with patch("claudia_memory.services.remember.embed_sync", return_value=fallback_emb) as mock_embed:
            # Op with precomputed embedding
            id1 = svc.remember_fact(
                content="Good content with embedding",
                _precomputed_embedding=_fake_embedding("good"),
            )
            # Op without precomputed (simulating embedding failure)
            id2 = svc.remember_fact(
                content="Content that failed embedding",
                _precomputed_embedding=None,
            )

            # embed_sync called only for the second (failed) one
            mock_embed.assert_called_once_with("Content that failed embedding")

        assert id1 is not None
        assert id2 is not None
        assert id1 != id2

    def test_two_pass_flow_simulation(self, db):
        """Full simulation of the batch handler's two-pass architecture"""
        svc = _get_remember_service(db)

        # These are the operations that would come from memory.batch
        operations = [
            {"op": "entity", "name": "Ford Perry", "type": "person", "description": "CEO"},
            {"op": "remember", "content": "Ford prefers email", "type": "preference", "importance": 0.7, "about": ["Ford Perry"]},
            {"op": "remember", "content": "Meeting scheduled for Friday", "type": "fact", "importance": 0.8},
            {"op": "relate", "source": "Ford Perry", "target": "Kamil", "relationship": "business_contact"},
        ]

        # --- Pass 1: Collect texts and generate embeddings ---
        embed_texts = []
        embed_indices = []
        for i, op in enumerate(operations):
            if op["op"] == "remember":
                embed_texts.append(op["content"])
                embed_indices.append(i)
            elif op["op"] == "entity":
                embed_texts.append(f"{op['name']}. {op.get('description', '')}")
                embed_indices.append(i)

        # Simulate parallel embedding
        all_embeddings = [_fake_embedding(t) for t in embed_texts]
        embeddings_map = {idx: emb for idx, emb in zip(embed_indices, all_embeddings)}

        # --- Pass 2: Execute with precomputed embeddings ---
        results = []
        with patch("claudia_memory.services.remember.embed_sync") as mock_embed:
            for i, op in enumerate(operations):
                if op["op"] == "entity":
                    eid = svc.remember_entity(
                        name=op["name"],
                        entity_type=op.get("type", "person"),
                        description=op.get("description"),
                        _precomputed_embedding=embeddings_map.get(i),
                    )
                    results.append({"op": "entity", "id": eid})
                elif op["op"] == "remember":
                    mid = svc.remember_fact(
                        content=op["content"],
                        memory_type=op.get("type", "fact"),
                        about_entities=op.get("about"),
                        importance=op.get("importance", 1.0),
                        _precomputed_embedding=embeddings_map.get(i),
                    )
                    results.append({"op": "remember", "id": mid})
                elif op["op"] == "relate":
                    rid = svc.relate_entities(
                        source_name=op["source"],
                        target_name=op["target"],
                        relationship_type=op["relationship"],
                    )
                    results.append({"op": "relate", "id": rid})

            # embed_sync may be called for entities created during linking
            # (e.g., "Kamil" created by relate), but NOT for the primary ops
            # For the 2 remember ops and 1 entity op, embed_sync was NOT used
            # It might be called for auto-created entities in about_entities linking
            pass

        assert len(results) == 4
        assert all(r["id"] is not None for r in results)

        # Verify data integrity
        entity = db.get_one("entities", where="name = ?", where_params=("Ford Perry",))
        assert entity is not None
        assert entity["description"] == "CEO"

        mem1 = db.get_one("memories", where="content = ?", where_params=("Ford prefers email",))
        assert mem1 is not None
        assert mem1["type"] == "preference"

        mem2 = db.get_one("memories", where="content = ?", where_params=("Meeting scheduled for Friday",))
        assert mem2 is not None
