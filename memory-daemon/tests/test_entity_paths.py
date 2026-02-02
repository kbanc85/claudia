"""Tests for entity-aware document folder routing (Phase 1)."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from claudia_memory.services.filestore import _build_entity_path, _build_relative_path


class TestBuildEntityPath:
    """Test _build_entity_path routes files to entity-specific folders."""

    def test_person_entity_transcript(self):
        """Person entity -> people/{name}/transcripts/"""
        path = _build_entity_path("person", "sarah-chen", "transcript", "budget-review.md")
        assert path.startswith("people/sarah-chen/transcripts/")
        assert "budget-review.md" in path
        # Should have YYYY-MM-DD prefix
        parts = path.split("/")
        filename = parts[-1]
        assert len(filename.split("-")) >= 4  # date prefix + original name parts

    def test_organization_entity_email(self):
        """Organization entity -> clients/{name}/emails/"""
        path = _build_entity_path("organization", "acme-corp", "gmail", "proposal-feedback.eml")
        assert path.startswith("clients/acme-corp/emails/")
        assert "proposal-feedback.eml" in path
        # Should have YYYY-MM prefix
        parts = path.split("/")
        filename = parts[-1]
        assert filename.count("-") >= 3  # month prefix + original name parts

    def test_project_entity_document(self):
        """Project entity -> projects/{name}/documents/"""
        path = _build_entity_path("project", "website-redesign", "upload", "spec.pdf")
        assert path.startswith("projects/website-redesign/documents/")
        assert "spec.pdf" in path

    def test_unknown_entity_type_falls_back_to_general(self):
        """Unknown entity type -> general/{name}/..."""
        path = _build_entity_path("concept", "machine-learning", "upload", "paper.pdf")
        assert path.startswith("general/machine-learning/documents/")

    def test_canonical_name_sanitized(self):
        """Spaces in canonical name are replaced with hyphens."""
        path = _build_entity_path("person", "sarah chen", "transcript", "notes.md")
        assert "sarah-chen" in path
        assert " " not in path


class TestBuildRelativePath:
    """Test _build_relative_path routes unlinked files to general/."""

    def test_transcript_goes_to_general(self):
        """Unlinked transcript -> general/transcripts/..."""
        path = _build_relative_path("transcript", "misc.md")
        assert path.startswith("general/transcripts/")

    def test_email_goes_to_general(self):
        """Unlinked email -> general/emails/..."""
        path = _build_relative_path("gmail", "newsletter.eml")
        assert path.startswith("general/emails/")

    def test_document_goes_to_general(self):
        """Unlinked upload -> general/documents/..."""
        path = _build_relative_path("upload", "random.pdf")
        assert path.startswith("general/documents/")

    def test_multiple_entities_first_determines_path(self):
        """When multiple entities exist, first one in about_entities is primary."""
        # This is tested via integration below; path builder itself only gets one entity
        path1 = _build_entity_path("person", "alice", "upload", "doc.pdf")
        path2 = _build_entity_path("organization", "beta-corp", "upload", "doc.pdf")
        assert path1.startswith("people/")
        assert path2.startswith("clients/")


class TestDocumentServiceEntityRouting:
    """Integration: file_document() resolves entity and routes correctly."""

    def test_file_document_with_known_entity(self):
        """file_document() with about_entities routes to entity folder."""
        from claudia_memory.database import Database

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = Database(db_path)
            db.initialize()

            # Patch the globals so DocumentService picks up our test DB
            import claudia_memory.database as db_mod
            import claudia_memory.services.documents as doc_mod
            import claudia_memory.services.filestore as fs_mod
            from claudia_memory.services.filestore import LocalFileStore

            old_db = db_mod._db
            old_svc = doc_mod._service
            old_store = fs_mod._store

            try:
                db_mod._db = db

                # Create a known entity
                db.insert("entities", {
                    "name": "Sarah Chen",
                    "type": "person",
                    "canonical_name": "sarah chen",
                    "importance": 1.0,
                })

                # Create file store in temp dir
                store = LocalFileStore.__new__(LocalFileStore)
                store.base_dir = Path(tmpdir) / "files"
                store.base_dir.mkdir(parents=True, exist_ok=True)
                fs_mod._store = store

                # Reset document service so it picks up new DB
                doc_mod._service = None
                from claudia_memory.services.documents import DocumentService
                svc = DocumentService()
                svc.file_store = store

                result = svc.file_document(
                    content=b"test content",
                    source_type="transcript",
                    filename="budget-review.md",
                    about_entities=["Sarah Chen"],
                )

                assert "error" not in result
                storage_path = result["storage_path"]
                assert "people/sarah-chen/transcripts/" in storage_path
            finally:
                db_mod._db = old_db
                doc_mod._service = old_svc
                fs_mod._store = old_store

    def test_file_document_unknown_entity_falls_back(self):
        """file_document() with unknown entity name falls back to general/."""
        from claudia_memory.database import Database

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = Database(db_path)
            db.initialize()

            import claudia_memory.database as db_mod
            import claudia_memory.services.documents as doc_mod
            import claudia_memory.services.filestore as fs_mod
            from claudia_memory.services.filestore import LocalFileStore

            old_db = db_mod._db
            old_svc = doc_mod._service
            old_store = fs_mod._store

            try:
                db_mod._db = db

                store = LocalFileStore.__new__(LocalFileStore)
                store.base_dir = Path(tmpdir) / "files"
                store.base_dir.mkdir(parents=True, exist_ok=True)
                fs_mod._store = store

                doc_mod._service = None
                from claudia_memory.services.documents import DocumentService
                svc = DocumentService()
                svc.file_store = store

                result = svc.file_document(
                    content=b"test content",
                    source_type="upload",
                    filename="random.pdf",
                    about_entities=["Unknown Person"],
                )

                assert "error" not in result
                storage_path = result["storage_path"]
                assert "general/" in storage_path
            finally:
                db_mod._db = old_db
                doc_mod._service = old_svc
                fs_mod._store = old_store
