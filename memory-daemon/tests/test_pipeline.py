"""
End-to-end pipeline integration test for the Claudia memory system.

If this test passes, the core memory system works: entity creation,
memory storage, relationships, decay, pattern detection, session
lifecycle, and deduplication all function correctly together.
"""

import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from claudia_memory.config import MemoryConfig
from claudia_memory.database import Database
from claudia_memory.extraction.entity_extractor import EntityExtractor


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db():
    """Create a temporary test database, initialized with full schema + migrations."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


@pytest.fixture
def extractor():
    """Create a standalone EntityExtractor (no globals)."""
    return EntityExtractor()


@pytest.fixture
def config():
    """Return a default MemoryConfig (no file I/O)."""
    return MemoryConfig()


@pytest.fixture
def remember_svc(db, extractor):
    """Build a RememberService wired to the test database."""
    from claudia_memory.services.remember import RememberService

    svc = RememberService.__new__(RememberService)
    svc.db = db
    svc.embedding_service = None
    svc.extractor = extractor
    return svc


@pytest.fixture
def recall_svc(db, extractor, config):
    """Build a RecallService wired to the test database."""
    from claudia_memory.services.recall import RecallService

    svc = RecallService.__new__(RecallService)
    svc.db = db
    svc.embedding_service = None
    svc.extractor = extractor
    svc.config = config
    return svc


@pytest.fixture
def consolidate_svc(db, config):
    """Build a ConsolidateService wired to the test database."""
    from claudia_memory.services.consolidate import ConsolidateService

    svc = ConsolidateService.__new__(ConsolidateService)
    svc.db = db
    svc.config = config
    return svc


# ---------------------------------------------------------------------------
# 1. Entity creation and retrieval
# ---------------------------------------------------------------------------

def test_entity_creation_and_retrieval(remember_svc, recall_svc):
    """Create an entity via RememberService, retrieve it via RecallService.recall_about."""
    entity_id = remember_svc.remember_entity(
        name="Alice Chen",
        entity_type="person",
        description="VP of Engineering at Acme",
    )
    assert isinstance(entity_id, int)
    assert entity_id > 0

    result = recall_svc.recall_about("Alice Chen")
    assert result["entity"] is not None
    assert result["entity"]["name"] == "Alice Chen"
    assert result["entity"]["type"] == "person"
    assert result["entity"]["description"] == "VP of Engineering at Acme"


# ---------------------------------------------------------------------------
# 2. Memory storage and search
# ---------------------------------------------------------------------------

def test_memory_storage_and_search(remember_svc, recall_svc):
    """Store a fact via remember_fact, search via recall (keyword fallback)."""
    mem_id = remember_svc.remember_fact(
        content="The quarterly board meeting is on March 15",
        memory_type="fact",
        importance=0.9,
        source="test",
    )
    assert mem_id is not None

    # The recall method falls back to keyword/FTS search when there are no
    # embeddings.  The keyword search uses LIKE, so a substring match works.
    results = recall_svc.recall(
        "board meeting",
        include_low_importance=True,
    )
    assert len(results) >= 1
    assert any("board meeting" in r.content.lower() for r in results)


# ---------------------------------------------------------------------------
# 3. Relationship creation
# ---------------------------------------------------------------------------

def test_relationship_creation(remember_svc, recall_svc):
    """Create two entities, relate them, verify via recall_about."""
    remember_svc.remember_entity(name="Bob Lee", entity_type="person")
    remember_svc.remember_entity(name="Acme Corp", entity_type="organization")

    rel_id = remember_svc.relate_entities(
        source_name="Bob Lee",
        target_name="Acme Corp",
        relationship_type="works_at",
        strength=0.9,
    )
    assert rel_id is not None

    about = recall_svc.recall_about("Bob Lee")
    assert len(about["relationships"]) >= 1
    rel_types = [r["type"] for r in about["relationships"]]
    assert "works_at" in rel_types


# ---------------------------------------------------------------------------
# 4. Decay reduces importance
# ---------------------------------------------------------------------------

def test_decay_reduces_importance(remember_svc, consolidate_svc, db):
    """Store a memory, run decay, verify importance decreased."""
    mem_id = remember_svc.remember_fact(
        content="Important meeting next Tuesday",
        memory_type="fact",
        importance=0.8,
        source="test",
    )

    before = db.get_one("memories", where="id = ?", where_params=(mem_id,))
    original_importance = before["importance"]

    consolidate_svc.run_decay()

    after = db.get_one("memories", where="id = ?", where_params=(mem_id,))
    assert after["importance"] < original_importance


# ---------------------------------------------------------------------------
# 5. Pattern detection runs without crashing
# ---------------------------------------------------------------------------

def test_pattern_detection_runs_without_crashing(remember_svc, consolidate_svc):
    """Create entities and relationships, run detect_patterns without error."""
    remember_svc.remember_entity(name="Carol Davis", entity_type="person")
    remember_svc.remember_entity(name="Dave Wilson", entity_type="person")
    remember_svc.relate_entities(
        source_name="Carol Davis",
        target_name="Dave Wilson",
        relationship_type="works_with",
    )

    # Should not raise
    patterns = consolidate_svc.detect_patterns()
    assert isinstance(patterns, list)


# ---------------------------------------------------------------------------
# 6. Full consolidation completes
# ---------------------------------------------------------------------------

def test_full_consolidation_completes(remember_svc, consolidate_svc):
    """Add data, run run_full_consolidation, check result structure."""
    remember_svc.remember_entity(name="Eve Martin", entity_type="person")
    remember_svc.remember_fact(
        content="Eve is leading the API redesign project",
        memory_type="fact",
        about_entities=["Eve Martin"],
        importance=0.7,
        source="test",
    )

    result = consolidate_svc.run_full_consolidation()

    # Must have decay and patterns_detected keys
    assert "decay" in result
    assert "patterns_detected" in result
    # run_full_consolidation does NOT call generate_predictions or
    # run_llm_consolidation, so predictions_generated should be absent.
    assert "predictions_generated" not in result


# ---------------------------------------------------------------------------
# 7. Session lifecycle
# ---------------------------------------------------------------------------

def test_session_lifecycle(remember_svc, db):
    """Call end_session with narrative, facts, entities, relationships."""
    # Create an episode via buffer_turn
    turn_result = remember_svc.buffer_turn(
        user_content="Let's discuss the product roadmap",
        assistant_content="Sure, what areas would you like to cover?",
    )
    episode_id = turn_result["episode_id"]
    assert episode_id > 0

    # End the session
    result = remember_svc.end_session(
        episode_id=episode_id,
        narrative="Discussed the product roadmap. Decided to prioritize mobile.",
        facts=[
            {
                "content": "Mobile is top priority for Q2",
                "type": "fact",
                "about": ["Product"],
                "importance": 0.9,
            }
        ],
        entities=[
            {
                "name": "Product Team",
                "type": "organization",
                "description": "Internal product group",
            }
        ],
        relationships=[
            {
                "source": "Product Team",
                "target": "Product",
                "relationship": "owns",
            }
        ],
    )

    assert result["narrative_stored"] is True
    assert result["facts_stored"] >= 1
    assert result["entities_stored"] >= 1
    assert result["relationships_stored"] >= 1

    # Verify episode was finalized
    episode = db.get_one("episodes", where="id = ?", where_params=(episode_id,))
    assert episode["is_summarized"] == 1
    assert episode["narrative"] is not None


# ---------------------------------------------------------------------------
# 8. Deduplication prevents duplicates
# ---------------------------------------------------------------------------

def test_deduplication_prevents_duplicates(remember_svc):
    """Store the same content twice, verify same ID returned."""
    content = "The annual company retreat is in September"

    first_id = remember_svc.remember_fact(
        content=content,
        memory_type="fact",
        importance=0.7,
        source="test",
    )
    second_id = remember_svc.remember_fact(
        content=content,
        memory_type="fact",
        importance=0.7,
        source="test",
    )

    assert first_id == second_id
