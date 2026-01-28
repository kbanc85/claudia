"""
Remember Service for Claudia Memory System

Handles storing memories, processing conversation turns,
and auto-extracting entities and facts.
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..database import content_hash, get_db
from ..embeddings import embed_sync, get_embedding_service
from ..extraction.entity_extractor import (
    ExtractedEntity,
    ExtractedMemory,
    extract_all,
    get_extractor,
)

logger = logging.getLogger(__name__)


class RememberService:
    """Store and manage memories"""

    def __init__(self):
        self.db = get_db()
        self.embedding_service = get_embedding_service()
        self.extractor = get_extractor()

    def remember_message(
        self,
        content: str,
        role: str = "user",
        episode_id: Optional[int] = None,
        auto_extract: bool = True,
    ) -> Dict[str, Any]:
        """
        Process and store a conversation message.

        Args:
            content: The message content
            role: 'user', 'assistant', or 'system'
            episode_id: Optional episode to associate with
            auto_extract: Whether to auto-extract entities and memories

        Returns:
            Dict with message_id and any extracted entities/memories
        """
        # Create episode if needed
        if episode_id is None:
            episode_id = self._get_or_create_episode()

        # Store the message
        msg_hash = content_hash(content)
        message_id = self.db.insert(
            "messages",
            {
                "episode_id": episode_id,
                "role": role,
                "content": content,
                "content_hash": msg_hash,
                "created_at": datetime.utcnow().isoformat(),
            },
        )

        # Update episode message count
        self.db.execute(
            "UPDATE episodes SET message_count = message_count + 1 WHERE id = ?",
            (episode_id,),
        )

        # Generate and store embedding
        embedding = embed_sync(content)
        if embedding:
            try:
                self.db.execute(
                    "INSERT OR REPLACE INTO message_embeddings (message_id, embedding) VALUES (?, ?)",
                    (message_id, json.dumps(embedding)),
                )
            except Exception as e:
                logger.warning(f"Could not store message embedding: {e}")

        result = {
            "message_id": message_id,
            "episode_id": episode_id,
            "entities": [],
            "memories": [],
        }

        # Auto-extract entities and memories
        if auto_extract:
            entities, memories = extract_all(content)

            for entity in entities:
                entity_id = self._ensure_entity(entity)
                if entity_id:
                    result["entities"].append(
                        {"id": entity_id, "name": entity.name, "type": entity.type}
                    )

            for memory in memories:
                memory_id = self.remember_fact(
                    content=memory.content,
                    memory_type=memory.type,
                    about_entities=memory.entities,
                    importance=memory.confidence,
                    source="conversation",
                    source_id=str(message_id),
                )
                if memory_id:
                    result["memories"].append(
                        {"id": memory_id, "content": memory.content, "type": memory.type}
                    )

        return result

    def remember_fact(
        self,
        content: str,
        memory_type: str = "fact",
        about_entities: Optional[List[str]] = None,
        importance: float = 1.0,
        confidence: float = 1.0,
        source: Optional[str] = None,
        source_id: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> Optional[int]:
        """
        Store a discrete fact/memory.

        Args:
            content: The memory content
            memory_type: 'fact', 'preference', 'observation', 'learning', 'commitment', 'pattern'
            about_entities: List of entity names this memory relates to
            importance: Initial importance score (0.0-1.0)
            confidence: How confident we are (0.0-1.0)
            source: Where this came from
            source_id: Reference to source
            metadata: Additional metadata

        Returns:
            Memory ID or None if duplicate
        """
        # Check for duplicate
        mem_hash = content_hash(content)
        existing = self.db.get_one(
            "memories", where="content_hash = ?", where_params=(mem_hash,)
        )
        if existing:
            # Update access count and timestamp
            self.db.update(
                "memories",
                {
                    "last_accessed_at": datetime.utcnow().isoformat(),
                    "access_count": existing["access_count"] + 1,
                },
                "id = ?",
                (existing["id"],),
            )
            return existing["id"]

        # Insert new memory
        memory_id = self.db.insert(
            "memories",
            {
                "content": content,
                "content_hash": mem_hash,
                "type": memory_type,
                "importance": importance,
                "confidence": confidence,
                "source": source,
                "source_id": source_id,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "metadata": json.dumps(metadata) if metadata else None,
            },
        )

        # Generate and store embedding
        embedding = embed_sync(content)
        if embedding:
            try:
                self.db.execute(
                    "INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                    (memory_id, json.dumps(embedding)),
                )
            except Exception as e:
                logger.warning(f"Could not store memory embedding: {e}")

        # Link to entities
        if about_entities:
            for entity_name in about_entities:
                entity_id = self._find_or_create_entity(entity_name)
                if entity_id:
                    try:
                        self.db.insert(
                            "memory_entities",
                            {
                                "memory_id": memory_id,
                                "entity_id": entity_id,
                                "relationship": "about",
                            },
                        )
                    except Exception:
                        pass  # Duplicate link, ignore

        logger.debug(f"Remembered {memory_type}: {content[:50]}...")
        return memory_id

    def remember_entity(
        self,
        name: str,
        entity_type: str = "person",
        description: Optional[str] = None,
        aliases: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
    ) -> int:
        """
        Create or update an entity.

        Args:
            name: Entity name
            entity_type: 'person', 'organization', 'project', 'concept', 'location'
            description: Optional description
            aliases: Alternative names/spellings
            metadata: Additional metadata

        Returns:
            Entity ID
        """
        canonical = self.extractor.canonical_name(name)

        # Check for existing
        existing = self.db.get_one(
            "entities",
            where="canonical_name = ? AND type = ?",
            where_params=(canonical, entity_type),
        )

        if existing:
            # Update existing
            update_data = {"updated_at": datetime.utcnow().isoformat()}
            if description:
                update_data["description"] = description
            if metadata:
                existing_meta = json.loads(existing["metadata"] or "{}")
                existing_meta.update(metadata)
                update_data["metadata"] = json.dumps(existing_meta)

            self.db.update("entities", update_data, "id = ?", (existing["id"],))
            entity_id = existing["id"]
        else:
            # Create new
            entity_id = self.db.insert(
                "entities",
                {
                    "name": name,
                    "type": entity_type,
                    "canonical_name": canonical,
                    "description": description,
                    "importance": 1.0,
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat(),
                    "metadata": json.dumps(metadata) if metadata else None,
                },
            )

            # Generate and store embedding
            embed_text = f"{name}. {description or ''}"
            embedding = embed_sync(embed_text)
            if embedding:
                try:
                    self.db.execute(
                        "INSERT OR REPLACE INTO entity_embeddings (entity_id, embedding) VALUES (?, ?)",
                        (entity_id, json.dumps(embedding)),
                    )
                except Exception as e:
                    logger.warning(f"Could not store entity embedding: {e}")

        # Add aliases
        if aliases:
            for alias in aliases:
                canonical_alias = self.extractor.canonical_name(alias)
                try:
                    self.db.insert(
                        "entity_aliases",
                        {
                            "entity_id": entity_id,
                            "alias": alias,
                            "canonical_alias": canonical_alias,
                            "created_at": datetime.utcnow().isoformat(),
                        },
                    )
                except Exception:
                    pass  # Duplicate alias, ignore

        return entity_id

    def relate_entities(
        self,
        source_name: str,
        target_name: str,
        relationship_type: str,
        strength: float = 1.0,
        direction: str = "bidirectional",
        metadata: Optional[Dict] = None,
    ) -> Optional[int]:
        """
        Create or strengthen a relationship between entities.

        Args:
            source_name: Source entity name
            target_name: Target entity name
            relationship_type: Type of relationship (works_with, manages, etc.)
            strength: Relationship strength
            direction: 'forward', 'backward', or 'bidirectional'
            metadata: Additional metadata

        Returns:
            Relationship ID or None
        """
        source_id = self._find_or_create_entity(source_name)
        target_id = self._find_or_create_entity(target_name)

        if not source_id or not target_id:
            return None

        # Check for existing relationship
        existing = self.db.get_one(
            "relationships",
            where="source_entity_id = ? AND target_entity_id = ? AND relationship_type = ?",
            where_params=(source_id, target_id, relationship_type),
        )

        if existing:
            # Strengthen existing relationship
            new_strength = min(1.0, existing["strength"] + 0.1)
            self.db.update(
                "relationships",
                {
                    "strength": new_strength,
                    "updated_at": datetime.utcnow().isoformat(),
                },
                "id = ?",
                (existing["id"],),
            )
            return existing["id"]
        else:
            # Create new relationship
            return self.db.insert(
                "relationships",
                {
                    "source_entity_id": source_id,
                    "target_entity_id": target_id,
                    "relationship_type": relationship_type,
                    "strength": strength,
                    "direction": direction,
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat(),
                    "metadata": json.dumps(metadata) if metadata else None,
                },
            )

    def _ensure_entity(self, extracted: ExtractedEntity) -> Optional[int]:
        """Ensure an extracted entity exists in the database"""
        existing = self.db.get_one(
            "entities",
            where="canonical_name = ? AND type = ?",
            where_params=(extracted.canonical_name, extracted.type),
        )

        if existing:
            return existing["id"]

        # Also check aliases
        alias_match = self.db.get_one(
            "entity_aliases",
            where="canonical_alias = ?",
            where_params=(extracted.canonical_name,),
        )
        if alias_match:
            return alias_match["entity_id"]

        # Create new entity
        return self.remember_entity(
            name=extracted.name,
            entity_type=extracted.type,
        )

    def _find_or_create_entity(self, name: str, entity_type: str = "person") -> Optional[int]:
        """Find entity by name or create if not exists"""
        canonical = self.extractor.canonical_name(name)

        # Try exact match
        existing = self.db.get_one(
            "entities",
            where="canonical_name = ?",
            where_params=(canonical,),
        )
        if existing:
            return existing["id"]

        # Try alias match
        alias_match = self.db.get_one(
            "entity_aliases",
            where="canonical_alias = ?",
            where_params=(canonical,),
        )
        if alias_match:
            return alias_match["entity_id"]

        # Create new
        return self.remember_entity(name=name, entity_type=entity_type)

    def _get_or_create_episode(self) -> int:
        """Get current episode or create a new one"""
        # For now, create a new episode each time
        # In a more sophisticated implementation, we'd track session context
        session_id = str(uuid.uuid4())
        return self.db.insert(
            "episodes",
            {
                "session_id": session_id,
                "started_at": datetime.utcnow().isoformat(),
                "message_count": 0,
            },
        )


# Global service instance
_service: Optional[RememberService] = None


def get_remember_service() -> RememberService:
    """Get or create the global remember service"""
    global _service
    if _service is None:
        _service = RememberService()
    return _service


# Convenience functions
def remember_message(content: str, role: str = "user", **kwargs) -> Dict[str, Any]:
    """Store a conversation message"""
    return get_remember_service().remember_message(content, role, **kwargs)


def remember_fact(content: str, **kwargs) -> Optional[int]:
    """Store a discrete fact"""
    return get_remember_service().remember_fact(content, **kwargs)


def remember_entity(name: str, **kwargs) -> int:
    """Create or update an entity"""
    return get_remember_service().remember_entity(name, **kwargs)


def relate_entities(source: str, target: str, relationship: str, **kwargs) -> Optional[int]:
    """Create a relationship between entities"""
    return get_remember_service().relate_entities(source, target, relationship, **kwargs)
