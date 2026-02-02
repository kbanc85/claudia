"""Tests for Document Storage and Provenance Tracking (Phase 2)"""

import hashlib
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.database import Database, content_hash
from claudia_memory.services.documents import DocumentService
from claudia_memory.services.filestore import LocalFileStore, _build_relative_path


def _make_db():
    """Create a fresh test database."""
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test.db"
    db = Database(db_path)
    db.initialize()
    return db, tmpdir


def _make_doc_service(db, tmpdir):
    """Create a DocumentService with a test file store."""
    svc = DocumentService.__new__(DocumentService)
    svc.db = db
    svc.config = type("Config", (), {
        "files_base_dir": Path(tmpdir) / "files",
        "document_dormant_days": 90,
        "document_archive_days": 180,
    })()
    # Use a fresh extractor (regex-based, no spacy needed)
    from claudia_memory.extraction.entity_extractor import get_extractor
    svc.extractor = get_extractor()
    # Create a local file store pointed at test dir
    store = LocalFileStore.__new__(LocalFileStore)
    store.base_dir = Path(tmpdir) / "files"
    store.base_dir.mkdir(parents=True, exist_ok=True)
    svc.file_store = store
    return svc


def _insert_entity(db, name, entity_type="person"):
    """Helper: insert a test entity."""
    canonical = name.lower().strip()
    return db.insert(
        "entities",
        {
            "name": name,
            "canonical_name": canonical,
            "type": entity_type,
            "importance": 1.0,
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T00:00:00",
        },
    )


def _insert_memory(db, content, memory_type="fact"):
    """Helper: insert a test memory."""
    return db.insert(
        "memories",
        {
            "content": content,
            "content_hash": content_hash(content),
            "type": memory_type,
            "importance": 1.0,
            "confidence": 1.0,
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T00:00:00",
        },
    )


# --------------------------------------------------------------------------
# Test 1: file_document creates file on disk and DB row
# --------------------------------------------------------------------------
def test_file_document_creates_file_and_row():
    db, tmpdir = _make_db()
    try:
        svc = _make_doc_service(db, tmpdir)
        result = svc.file_document_from_text(
            content="Meeting transcript: discussed Q2 goals",
            filename="meeting-sarah-q2.md",
            source_type="transcript",
            summary="Q2 planning meeting with Sarah",
        )

        assert result["document_id"] is not None
        assert result["deduplicated"] is False
        assert Path(result["storage_path"]).exists()

        # Verify DB row
        row = db.get_one("documents", where="id = ?", where_params=(result["document_id"],))
        assert row is not None
        assert row["filename"] == "meeting-sarah-q2.md"
        assert row["source_type"] == "transcript"
        assert row["summary"] == "Q2 planning meeting with Sarah"
        assert row["lifecycle"] == "active"
        assert row["file_size"] > 0
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 2: Deduplication via file_hash
# --------------------------------------------------------------------------
def test_deduplication_by_hash():
    db, tmpdir = _make_db()
    try:
        svc = _make_doc_service(db, tmpdir)
        content = "Same content for dedup test"

        result1 = svc.file_document_from_text(content, "file1.md")
        result2 = svc.file_document_from_text(content, "file2.md")

        assert result1["document_id"] == result2["document_id"]
        assert result1["deduplicated"] is False
        assert result2["deduplicated"] is True
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 3: Entity linking and retrieval
# --------------------------------------------------------------------------
def test_entity_linking():
    db, tmpdir = _make_db()
    try:
        svc = _make_doc_service(db, tmpdir)
        entity_id = _insert_entity(db, "Sarah Chen")

        result = svc.file_document_from_text(
            content="Email about project timeline",
            filename="email-sarah.md",
            source_type="gmail",
            about_entities=["Sarah Chen"],
        )

        docs = svc.get_entity_documents("Sarah Chen")
        assert len(docs) == 1
        assert docs[0]["filename"] == "email-sarah.md"
        assert docs[0]["relationship"] == "about"
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 4: Memory-to-document linking (provenance)
# --------------------------------------------------------------------------
def test_memory_provenance_linking():
    db, tmpdir = _make_db()
    try:
        svc = _make_doc_service(db, tmpdir)
        memory_id = _insert_memory(db, "Sarah prefers async communication")

        result = svc.file_document_from_text(
            content="Meeting notes where Sarah mentioned async preference",
            filename="meeting-notes.md",
            source_type="transcript",
            memory_ids=[memory_id],
        )

        docs = svc.get_memory_documents(memory_id)
        assert len(docs) == 1
        assert docs[0]["filename"] == "meeting-notes.md"
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 5: trace_memory includes document references
# --------------------------------------------------------------------------
@patch("claudia_memory.services.recall.embed_sync", return_value=None)
def test_trace_memory_includes_documents(mock_embed):
    db, tmpdir = _make_db()
    try:
        svc = _make_doc_service(db, tmpdir)
        memory_id = _insert_memory(db, "Jim committed to sending the contract")

        # File a document and link to the memory
        svc.file_document_from_text(
            content="Full transcript of Jim call",
            filename="jim-call-transcript.md",
            source_type="transcript",
            memory_ids=[memory_id],
        )

        # Now trace the memory
        from claudia_memory.services.recall import RecallService
        recall_svc = RecallService.__new__(RecallService)
        recall_svc.db = db
        recall_svc.config = type("Config", (), {
            "vector_weight": 0.50,
            "importance_weight": 0.25,
            "recency_weight": 0.10,
            "fts_weight": 0.15,
            "max_recall_results": 20,
        })()

        result = recall_svc.trace_memory(memory_id)
        assert result["memory"] is not None
        assert "documents" in result
        assert len(result["documents"]) == 1
        assert result["documents"][0]["filename"] == "jim-call-transcript.md"
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 6: Lifecycle transitions
# --------------------------------------------------------------------------
def test_lifecycle_transitions():
    db, tmpdir = _make_db()
    try:
        svc = _make_doc_service(db, tmpdir)
        result = svc.file_document_from_text("content", "test.md")
        doc_id = result["document_id"]

        # Initial state
        doc = svc.get_document(doc_id)
        assert doc["lifecycle"] == "active"

        # Transition: active -> dormant
        assert svc.transition_lifecycle(doc_id, "dormant") is True
        doc = svc.get_document(doc_id)
        assert doc["lifecycle"] == "dormant"

        # Transition: dormant -> archived
        assert svc.transition_lifecycle(doc_id, "archived") is True
        doc = svc.get_document(doc_id)
        assert doc["lifecycle"] == "archived"

        # Invalid state
        assert svc.transition_lifecycle(doc_id, "invalid") is False
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 7: Purge deletes file but keeps metadata
# --------------------------------------------------------------------------
def test_purge_keeps_metadata():
    db, tmpdir = _make_db()
    try:
        svc = _make_doc_service(db, tmpdir)
        result = svc.file_document_from_text("secret content", "secret.md")
        doc_id = result["document_id"]
        storage_path = result["storage_path"]

        # File exists before purge
        assert Path(storage_path).exists()

        # Purge
        purge_result = svc.purge_document(doc_id)
        assert purge_result["file_deleted"] is True
        assert purge_result["metadata_preserved"] is True

        # File gone from disk
        assert not Path(storage_path).exists()

        # Metadata still in DB
        row = db.get_one("documents", where="id = ?", where_params=(doc_id,))
        assert row is not None
        assert row["lifecycle"] == "purged"
        assert row["storage_path"] is None
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 8: Search by entity name
# --------------------------------------------------------------------------
def test_search_by_entity():
    db, tmpdir = _make_db()
    try:
        svc = _make_doc_service(db, tmpdir)
        _insert_entity(db, "Mike Johnson")

        svc.file_document_from_text("Doc about Mike", "mike-doc.md", about_entities=["Mike Johnson"])
        svc.file_document_from_text("Doc about other", "other-doc.md")

        results = svc.search_documents(entity_name="Mike Johnson")
        assert len(results) == 1
        assert results[0]["filename"] == "mike-doc.md"
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 9: Search by source_type
# --------------------------------------------------------------------------
def test_search_by_source_type():
    db, tmpdir = _make_db()
    try:
        svc = _make_doc_service(db, tmpdir)
        svc.file_document_from_text("Transcript 1", "t1.md", source_type="transcript")
        svc.file_document_from_text("Email 1", "e1.md", source_type="gmail")
        svc.file_document_from_text("Transcript 2", "t2.md", source_type="transcript")

        results = svc.search_documents(source_type="transcript")
        assert len(results) == 2
        assert all(r["source_type"] == "transcript" for r in results)
    finally:
        db.close()


# --------------------------------------------------------------------------
# Test 10: Backward compatibility with old save_source_material
# --------------------------------------------------------------------------
@patch("claudia_memory.services.remember.embed_sync", return_value=None)
def test_save_source_material_registers_document(mock_embed):
    db, tmpdir = _make_db()
    try:
        from claudia_memory.services.remember import RememberService
        svc = RememberService.__new__(RememberService)
        svc.db = db
        svc.embedding_service = None
        svc.extractor = get_extractor_helper()

        # Insert a memory to attach source material to
        memory_id = _insert_memory(db, "Important fact from email")

        # Save source material (old API)
        result_path = svc.save_source_material(
            memory_id,
            "Full email body text here",
            metadata={"source": "gmail", "source_context": "Email from Jim"},
        )

        # Legacy file should exist
        assert result_path is not None
        assert result_path.exists()

        # Should also be registered in documents table
        doc_rows = db.execute(
            "SELECT * FROM documents WHERE filename = ?",
            (f"{memory_id}.md",),
            fetch=True,
        ) or []
        assert len(doc_rows) >= 1

        # Should have memory_sources link
        link_rows = db.execute(
            "SELECT * FROM memory_sources WHERE memory_id = ?",
            (memory_id,),
            fetch=True,
        ) or []
        assert len(link_rows) >= 1
    finally:
        db.close()


def get_extractor_helper():
    """Get a regex-based extractor for tests."""
    from claudia_memory.extraction.entity_extractor import get_extractor
    return get_extractor()
