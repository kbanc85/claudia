"""
Document Service for Claudia Memory System

Manages document storage, entity/memory linking, lifecycle transitions,
and provenance tracking. Documents are the physical files (transcripts,
emails, uploads) that back Claudia's memories.
"""

import hashlib
import json
import logging
import mimetypes
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..config import get_config
from ..database import get_db
from ..extraction.entity_extractor import get_extractor
from .filestore import LocalFileStore, _build_entity_path, _build_relative_path, get_file_store

logger = logging.getLogger(__name__)


class DocumentService:
    """Store, link, search, and manage documents."""

    def __init__(self):
        self.db = get_db()
        self.config = get_config()
        self.extractor = get_extractor()
        self.file_store: Optional[LocalFileStore] = None

    def _get_store(self) -> LocalFileStore:
        if self.file_store is None:
            self.file_store = get_file_store()
        return self.file_store

    def file_document(
        self,
        file_path: Optional[str] = None,
        content: Optional[bytes] = None,
        source_type: str = "upload",
        filename: Optional[str] = None,
        summary: Optional[str] = None,
        about_entities: Optional[List[str]] = None,
        memory_ids: Optional[List[int]] = None,
        source_ref: Optional[str] = None,
        entity_relationships: Optional[Dict[str, str]] = None,
        metadata: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Store a document and register it in the database.

        Accepts either a file_path (copies from disk) or raw content bytes.
        Links to entities and memories if provided.

        Args:
            file_path: Path to existing file on disk (copies it into managed storage)
            content: Raw file content bytes (alternative to file_path)
            source_type: gmail, transcript, upload, capture, session
            filename: Display name for the document
            summary: Brief summary of the document
            about_entities: Entity names to link (default relationship: 'about')
            memory_ids: Memory IDs to link as sources (provenance)
            source_ref: External reference (email ID, URL, etc.)
            entity_relationships: Dict of {entity_name: relationship} for specific relationships
            metadata: Additional metadata JSON

        Returns:
            Dict with document_id, storage_path, deduplicated (bool)
        """
        # Resolve content
        if file_path:
            path = Path(file_path)
            if not path.exists():
                return {"error": f"File not found: {file_path}"}
            raw = path.read_bytes()
            if not filename:
                filename = path.name
        elif content is not None:
            raw = content
            if not filename:
                filename = f"document-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
        else:
            return {"error": "Either file_path or content is required"}

        # Compute file hash for deduplication
        file_hash = hashlib.sha256(raw).hexdigest()

        # Check for duplicate
        existing = self.db.get_one(
            "documents", where="file_hash = ?", where_params=(file_hash,)
        )
        if existing:
            doc_id = existing["id"]
            # Still link new entities/memories even if file is duplicate
            self._link_entities(doc_id, about_entities, entity_relationships)
            self._link_memories(doc_id, memory_ids)
            return {
                "document_id": doc_id,
                "storage_path": existing["storage_path"],
                "deduplicated": True,
            }

        # Detect mime type
        mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

        # Resolve primary entity for path routing (if any)
        entity_path_info = None
        if about_entities:
            canonical = self.extractor.canonical_name(about_entities[0])
            entity_row = self.db.get_one(
                "entities",
                where="canonical_name = ?",
                where_params=(canonical,),
            )
            if entity_row:
                entity_path_info = (entity_row["type"], entity_row["canonical_name"])

        # Store file on disk
        store = self._get_store()
        if entity_path_info:
            relative_path = _build_entity_path(
                entity_path_info[0], entity_path_info[1], source_type, filename
            )
        else:
            relative_path = _build_relative_path(source_type, filename)
        storage_path = store.store(raw, relative_path)

        # Insert DB row
        doc_id = self.db.insert(
            "documents",
            {
                "file_hash": file_hash,
                "filename": filename,
                "mime_type": mime_type,
                "file_size": len(raw),
                "storage_provider": "local",
                "storage_path": storage_path,
                "source_type": source_type,
                "source_ref": source_ref,
                "summary": summary,
                "lifecycle": "active",
                "last_accessed_at": datetime.utcnow().isoformat(),
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "metadata": json.dumps(metadata) if metadata else None,
            },
        )

        # Link entities and memories
        self._link_entities(doc_id, about_entities, entity_relationships)
        self._link_memories(doc_id, memory_ids)

        logger.info(f"Filed document '{filename}' (id={doc_id}) at {storage_path}")
        return {
            "document_id": doc_id,
            "storage_path": storage_path,
            "deduplicated": False,
        }

    def file_document_from_text(
        self,
        content: str,
        filename: str,
        source_type: str = "capture",
        **kwargs,
    ) -> Dict[str, Any]:
        """Convenience: create a document from raw text content."""
        return self.file_document(
            content=content.encode("utf-8"),
            source_type=source_type,
            filename=filename,
            **kwargs,
        )

    def get_document(self, document_id: int) -> Optional[Dict[str, Any]]:
        """Fetch document metadata and resolved path."""
        row = self.db.get_one(
            "documents", where="id = ?", where_params=(document_id,)
        )
        if not row:
            return None

        # Update last_accessed_at
        self.db.update(
            "documents",
            {"last_accessed_at": datetime.utcnow().isoformat()},
            "id = ?",
            (document_id,),
        )

        return {
            "id": row["id"],
            "filename": row["filename"],
            "mime_type": row["mime_type"],
            "file_size": row["file_size"],
            "storage_path": row["storage_path"],
            "source_type": row["source_type"],
            "source_ref": row["source_ref"],
            "summary": row["summary"],
            "lifecycle": row["lifecycle"],
            "created_at": row["created_at"],
            "metadata": json.loads(row["metadata"]) if row["metadata"] else None,
        }

    def search_documents(
        self,
        query: Optional[str] = None,
        source_type: Optional[str] = None,
        entity_name: Optional[str] = None,
        lifecycle: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Search documents by text, entity, source type, or lifecycle."""
        sql = "SELECT DISTINCT d.* FROM documents d"
        params: list = []
        joins = []
        wheres = []

        if entity_name:
            canonical = self.extractor.canonical_name(entity_name)
            joins.append("JOIN entity_documents ed ON d.id = ed.document_id")
            joins.append("JOIN entities e ON ed.entity_id = e.id")
            wheres.append("e.canonical_name = ?")
            params.append(canonical)

        if query:
            wheres.append("(d.filename LIKE ? OR d.summary LIKE ?)")
            params.extend([f"%{query}%", f"%{query}%"])

        if source_type:
            wheres.append("d.source_type = ?")
            params.append(source_type)

        if lifecycle:
            wheres.append("d.lifecycle = ?")
            params.append(lifecycle)
        else:
            # Default: exclude purged documents
            wheres.append("d.lifecycle != 'purged'")

        for j in joins:
            sql += f" {j}"
        if wheres:
            sql += " WHERE " + " AND ".join(wheres)

        sql += " ORDER BY d.created_at DESC LIMIT ?"
        params.append(limit)

        rows = self.db.execute(sql, tuple(params), fetch=True) or []
        return [
            {
                "id": r["id"],
                "filename": r["filename"],
                "mime_type": r["mime_type"],
                "file_size": r["file_size"],
                "source_type": r["source_type"],
                "summary": r["summary"],
                "lifecycle": r["lifecycle"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def link_to_entity(
        self, document_id: int, entity_name: str, relationship: str = "about"
    ) -> bool:
        """Link a document to an entity."""
        canonical = self.extractor.canonical_name(entity_name)
        entity = self.db.get_one(
            "entities", where="canonical_name = ?", where_params=(canonical,)
        )
        if not entity:
            return False
        try:
            self.db.insert(
                "entity_documents",
                {
                    "entity_id": entity["id"],
                    "document_id": document_id,
                    "relationship": relationship,
                    "created_at": datetime.utcnow().isoformat(),
                },
            )
            return True
        except Exception:
            return False  # Duplicate link

    def link_to_memory(
        self, document_id: int, memory_id: int, excerpt: Optional[str] = None
    ) -> bool:
        """Link a document to a memory (provenance)."""
        try:
            self.db.insert(
                "memory_sources",
                {
                    "memory_id": memory_id,
                    "document_id": document_id,
                    "excerpt": excerpt,
                    "created_at": datetime.utcnow().isoformat(),
                },
            )
            return True
        except Exception:
            return False  # Duplicate link

    def get_entity_documents(
        self, entity_name: str, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Get all documents linked to an entity."""
        canonical = self.extractor.canonical_name(entity_name)
        rows = self.db.execute(
            """
            SELECT d.*, ed.relationship as entity_relationship
            FROM documents d
            JOIN entity_documents ed ON d.id = ed.document_id
            JOIN entities e ON ed.entity_id = e.id
            WHERE e.canonical_name = ? AND d.lifecycle != 'purged'
            ORDER BY d.created_at DESC
            LIMIT ?
            """,
            (canonical, limit),
            fetch=True,
        ) or []

        return [
            {
                "id": r["id"],
                "filename": r["filename"],
                "source_type": r["source_type"],
                "summary": r["summary"],
                "relationship": r["entity_relationship"],
                "created_at": r["created_at"],
                "lifecycle": r["lifecycle"],
            }
            for r in rows
        ]

    def get_memory_documents(self, memory_id: int) -> List[Dict[str, Any]]:
        """Get all documents sourcing a memory (provenance chain)."""
        rows = self.db.execute(
            """
            SELECT d.*, ms.excerpt
            FROM documents d
            JOIN memory_sources ms ON d.id = ms.document_id
            WHERE ms.memory_id = ?
            ORDER BY d.created_at DESC
            """,
            (memory_id,),
            fetch=True,
        ) or []

        return [
            {
                "id": r["id"],
                "filename": r["filename"],
                "source_type": r["source_type"],
                "summary": r["summary"],
                "excerpt": r["excerpt"],
                "storage_path": r["storage_path"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def transition_lifecycle(
        self, document_id: int, new_state: str
    ) -> bool:
        """Transition a document to a new lifecycle state."""
        valid = {"active", "dormant", "archived", "purged"}
        if new_state not in valid:
            return False

        count = self.db.update(
            "documents",
            {
                "lifecycle": new_state,
                "updated_at": datetime.utcnow().isoformat(),
            },
            "id = ?",
            (document_id,),
        )
        return count > 0

    def purge_document(self, document_id: int) -> Dict[str, Any]:
        """Delete file from disk but keep metadata as tombstone."""
        doc = self.db.get_one(
            "documents", where="id = ?", where_params=(document_id,)
        )
        if not doc:
            return {"error": "Document not found"}

        # Delete file from disk
        file_deleted = False
        if doc["storage_path"]:
            store = self._get_store()
            file_deleted = store.delete(doc["storage_path"])

        # Mark as purged (keep metadata)
        self.db.update(
            "documents",
            {
                "lifecycle": "purged",
                "storage_path": None,
                "updated_at": datetime.utcnow().isoformat(),
            },
            "id = ?",
            (document_id,),
        )

        return {
            "document_id": document_id,
            "file_deleted": file_deleted,
            "metadata_preserved": True,
        }

    def run_lifecycle_maintenance(self) -> Dict[str, int]:
        """
        Transition documents through lifecycle stages based on age.

        active (>dormant_days) -> dormant (>archive_days) -> archived
        Called by the scheduler.
        """
        now = datetime.utcnow()
        dormant_cutoff = (now - timedelta(days=self.config.document_dormant_days)).isoformat()
        archive_cutoff = (now - timedelta(days=self.config.document_archive_days)).isoformat()

        # Dormant -> Archived
        archived = self.db.execute(
            """
            UPDATE documents SET lifecycle = 'archived', updated_at = ?
            WHERE lifecycle = 'dormant' AND last_accessed_at < ?
            """,
            (now.isoformat(), archive_cutoff),
        )

        # Active -> Dormant
        dormanted = self.db.execute(
            """
            UPDATE documents SET lifecycle = 'dormant', updated_at = ?
            WHERE lifecycle = 'active' AND last_accessed_at < ?
            """,
            (now.isoformat(), dormant_cutoff),
        )

        result = {"dormanted": 0, "archived": 0}
        logger.info(f"Document lifecycle maintenance complete: {result}")
        return result

    def _link_entities(
        self,
        doc_id: int,
        about_entities: Optional[List[str]],
        entity_relationships: Optional[Dict[str, str]] = None,
    ) -> None:
        """Link a document to entities."""
        if about_entities:
            for name in about_entities:
                rel = "about"
                if entity_relationships and name in entity_relationships:
                    rel = entity_relationships[name]
                self.link_to_entity(doc_id, name, rel)

    def _link_memories(
        self, doc_id: int, memory_ids: Optional[List[int]]
    ) -> None:
        """Link a document to memories."""
        if memory_ids:
            for mid in memory_ids:
                self.link_to_memory(doc_id, mid)


# Global service instance
_service: Optional[DocumentService] = None


def get_document_service() -> DocumentService:
    """Get or create the global document service."""
    global _service
    if _service is None:
        _service = DocumentService()
    return _service
