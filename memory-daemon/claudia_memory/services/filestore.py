"""
File Storage Abstraction for Claudia Memory System

Handles physical file storage on disk. Provides a clean interface
so the DocumentService doesn't need to know about file system details.
"""

import logging
import shutil
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..config import get_config

logger = logging.getLogger(__name__)


class FileStore(ABC):
    """Abstract base class for file storage backends."""

    @abstractmethod
    def store(self, content: bytes, relative_path: str) -> str:
        """Store file content and return the resolved storage path."""
        ...

    @abstractmethod
    def retrieve(self, storage_path: str) -> Optional[bytes]:
        """Retrieve file content by storage path."""
        ...

    @abstractmethod
    def delete(self, storage_path: str) -> bool:
        """Delete a file. Returns True if successful."""
        ...

    @abstractmethod
    def exists(self, storage_path: str) -> bool:
        """Check if a file exists at the given path."""
        ...


class LocalFileStore(FileStore):
    """
    Stores files on the local filesystem.

    Layout:
        ~/.claudia/files/{workspace_hash}/
        +-- documents/YYYY/MM/filename.pdf
        +-- transcripts/YYYY-MM-DD-person-topic.md
        +-- emails/YYYY/MM/sender-subject.eml
    """

    def __init__(self, workspace_id: Optional[str] = None):
        config = get_config()
        self.base_dir = config.files_base_dir
        if workspace_id:
            self.base_dir = self.base_dir / workspace_id
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def store(self, content: bytes, relative_path: str) -> str:
        """Store file content at relative_path under the base directory."""
        full_path = self.base_dir / relative_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(content)
        logger.debug(f"Stored file at {full_path}")
        return str(full_path)

    def store_text(self, content: str, relative_path: str) -> str:
        """Convenience: store text content (UTF-8 encoded)."""
        return self.store(content.encode("utf-8"), relative_path)

    def retrieve(self, storage_path: str) -> Optional[bytes]:
        """Retrieve file content by absolute path."""
        path = Path(storage_path)
        if path.exists():
            return path.read_bytes()
        return None

    def retrieve_text(self, storage_path: str) -> Optional[str]:
        """Convenience: retrieve text content."""
        data = self.retrieve(storage_path)
        if data is not None:
            return data.decode("utf-8")
        return None

    def delete(self, storage_path: str) -> bool:
        """Delete a file from disk."""
        path = Path(storage_path)
        try:
            if path.exists():
                path.unlink()
                logger.debug(f"Deleted file at {path}")
                return True
            return False
        except OSError as e:
            logger.warning(f"Could not delete {path}: {e}")
            return False

    def exists(self, storage_path: str) -> bool:
        """Check if a file exists."""
        return Path(storage_path).exists()


def _build_relative_path(source_type: str, filename: str) -> str:
    """Build a date-partitioned relative path for a file.

    Unlinked documents go under general/ so they don't collide with
    entity-aware folders (people/, clients/, projects/).

    Examples:
        transcript -> general/transcripts/2026-02-02-filename.md
        gmail      -> general/emails/2026/02/filename.eml
        upload     -> general/documents/2026/02/filename.pdf
        capture    -> general/documents/2026/02/filename
        session    -> general/documents/2026/02/filename
    """
    now = datetime.utcnow()
    year = now.strftime("%Y")
    month = now.strftime("%m")
    date_prefix = now.strftime("%Y-%m-%d")

    if source_type == "transcript":
        return f"general/transcripts/{date_prefix}-{filename}"
    elif source_type == "gmail":
        return f"general/emails/{year}/{month}/{filename}"
    else:
        return f"general/documents/{year}/{month}/{filename}"


# Mapping from entity type to top-level folder name
_ENTITY_TYPE_FOLDERS = {
    "person": "people",
    "organization": "clients",
    "project": "projects",
}


def _build_entity_path(
    entity_type: str,
    entity_canonical_name: str,
    source_type: str,
    filename: str,
) -> str:
    """Build an entity-aware relative path for a file.

    Routes documents into entity-specific folders based on entity type
    and canonical name.

    Examples:
        person/sarah-chen + transcript -> people/sarah-chen/transcripts/2026-02-02-filename.md
        organization/acme-corp + gmail -> clients/acme-corp/emails/2026-02-filename.eml
        project/website-redesign + upload -> projects/website-redesign/documents/2026-02-filename.pdf
    """
    top = _ENTITY_TYPE_FOLDERS.get(entity_type, "general")
    now = datetime.utcnow()
    date_prefix = now.strftime("%Y-%m-%d")
    month_prefix = now.strftime("%Y-%m")

    # Sanitize canonical name for filesystem use (replace spaces with hyphens)
    safe_name = entity_canonical_name.replace(" ", "-").lower()

    if source_type == "transcript":
        return f"{top}/{safe_name}/transcripts/{date_prefix}-{filename}"
    elif source_type == "gmail":
        return f"{top}/{safe_name}/emails/{month_prefix}-{filename}"
    else:
        return f"{top}/{safe_name}/documents/{month_prefix}-{filename}"


# Global instance
_store: Optional[LocalFileStore] = None


def get_file_store(workspace_id: Optional[str] = None) -> LocalFileStore:
    """Get or create the global file store instance."""
    global _store
    if _store is None:
        _store = LocalFileStore(workspace_id)
    return _store
