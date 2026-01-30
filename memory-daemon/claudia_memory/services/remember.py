"""
Remember Service for Claudia Memory System

Handles storing memories, processing conversation turns,
and auto-extracting entities and facts.
"""

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
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
        source_context: Optional[str] = None,
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
            source_context: One-line breadcrumb describing the source material
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
        insert_data = {
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
        }
        if source_context:
            insert_data["source_context"] = source_context

        memory_id = self.db.insert("memories", insert_data)

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

    def buffer_turn(
        self,
        user_content: Optional[str] = None,
        assistant_content: Optional[str] = None,
        episode_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Buffer a conversation turn for later summarization.

        This is lightweight storage -- no embeddings, no extraction, no processing.
        The raw exchange is held in turn_buffer until Claude summarizes the session.

        Args:
            user_content: What the user said
            assistant_content: What the assistant said
            episode_id: Episode to append to (creates one if None)

        Returns:
            Dict with episode_id and turn_number
        """
        if episode_id is None:
            episode_id = self._get_or_create_episode()

        # Get next turn number
        row = self.db.execute(
            "SELECT COALESCE(MAX(turn_number), 0) as max_turn FROM turn_buffer WHERE episode_id = ?",
            (episode_id,),
            fetch=True,
        )
        next_turn = (row[0]["max_turn"] + 1) if row else 1

        self.db.insert(
            "turn_buffer",
            {
                "episode_id": episode_id,
                "turn_number": next_turn,
                "user_content": user_content,
                "assistant_content": assistant_content,
                "created_at": datetime.utcnow().isoformat(),
            },
        )

        # Update episode turn count
        self.db.execute(
            "UPDATE episodes SET turn_count = turn_count + 1 WHERE id = ?",
            (episode_id,),
        )

        logger.debug(f"Buffered turn {next_turn} for episode {episode_id}")
        return {"episode_id": episode_id, "turn_number": next_turn}

    def end_session(
        self,
        episode_id: int,
        narrative: str,
        facts: Optional[List[Dict]] = None,
        commitments: Optional[List[Dict]] = None,
        entities: Optional[List[Dict]] = None,
        relationships: Optional[List[Dict]] = None,
        key_topics: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Finalize a session with Claude's narrative summary and structured extractions.

        The narrative captures session texture that structured fields cannot:
        tone, emotional undercurrents, half-formed ideas, reasons behind decisions,
        unresolved threads, and context that enriches the structured data.

        Args:
            episode_id: The session episode to finalize
            narrative: Free-form narrative summary written by Claude
            facts: List of {"content": str, "type": str, "about": [str], "importance": float}
            commitments: List of {"content": str, "about": [str], "importance": float}
            entities: List of {"name": str, "type": str, "description": str, "aliases": [str]}
            relationships: List of {"source": str, "target": str, "relationship": str}
            key_topics: List of topic strings for the episode

        Returns:
            Dict with counts of what was stored
        """
        result = {
            "episode_id": episode_id,
            "narrative_stored": False,
            "facts_stored": 0,
            "commitments_stored": 0,
            "entities_stored": 0,
            "relationships_stored": 0,
        }

        # 1. Store narrative in episode
        update_data = {
            "narrative": narrative,
            "ended_at": datetime.utcnow().isoformat(),
            "is_summarized": 1,
        }
        if key_topics:
            update_data["key_topics"] = json.dumps(key_topics)

        self.db.update("episodes", update_data, "id = ?", (episode_id,))
        result["narrative_stored"] = True

        # 2. Generate and store embedding for narrative (for semantic search)
        embedding = embed_sync(narrative)
        if embedding:
            try:
                self.db.execute(
                    "INSERT OR REPLACE INTO episode_embeddings (episode_id, embedding) VALUES (?, ?)",
                    (episode_id, json.dumps(embedding)),
                )
            except Exception as e:
                logger.warning(f"Could not store episode embedding: {e}")

        # 3. Store structured facts
        if facts:
            for fact in facts:
                memory_id = self.remember_fact(
                    content=fact["content"],
                    memory_type=fact.get("type", "fact"),
                    about_entities=fact.get("about"),
                    importance=fact.get("importance", 1.0),
                    source=fact.get("source", "session_summary"),
                    source_id=str(episode_id),
                    source_context=fact.get("source_context"),
                )
                if memory_id:
                    result["facts_stored"] += 1
                    # Save source material to disk if provided
                    if fact.get("source_material"):
                        self.save_source_material(
                            memory_id,
                            fact["source_material"],
                            metadata={
                                "source": fact.get("source", "session_summary"),
                                "source_context": fact.get("source_context"),
                            },
                        )

        # 4. Store commitments
        if commitments:
            for commitment in commitments:
                memory_id = self.remember_fact(
                    content=commitment["content"],
                    memory_type="commitment",
                    about_entities=commitment.get("about"),
                    importance=commitment.get("importance", 1.0),
                    source=commitment.get("source", "session_summary"),
                    source_id=str(episode_id),
                    source_context=commitment.get("source_context"),
                )
                if memory_id:
                    result["commitments_stored"] += 1
                    if commitment.get("source_material"):
                        self.save_source_material(
                            memory_id,
                            commitment["source_material"],
                            metadata={
                                "source": commitment.get("source", "session_summary"),
                                "source_context": commitment.get("source_context"),
                            },
                        )

        # 5. Store entities
        if entities:
            for entity in entities:
                entity_id = self.remember_entity(
                    name=entity["name"],
                    entity_type=entity.get("type", "person"),
                    description=entity.get("description"),
                    aliases=entity.get("aliases"),
                )
                if entity_id:
                    result["entities_stored"] += 1

        # 6. Store relationships
        if relationships:
            for rel in relationships:
                rel_id = self.relate_entities(
                    source_name=rel["source"],
                    target_name=rel["target"],
                    relationship_type=rel["relationship"],
                    strength=rel.get("strength", 1.0),
                )
                if rel_id:
                    result["relationships_stored"] += 1

        # 7. Archive turn buffer for this episode (preserve for provenance tracing)
        self.db.execute(
            "UPDATE turn_buffer SET is_archived = 1 WHERE episode_id = ?",
            (episode_id,),
        )

        logger.info(
            f"Session {episode_id} summarized: {result['facts_stored']} facts, "
            f"{result['commitments_stored']} commitments, "
            f"{result['entities_stored']} entities, "
            f"{result['relationships_stored']} relationships"
        )
        return result

    def get_unsummarized_turns(self) -> List[Dict[str, Any]]:
        """
        Find episodes with buffered turns that were never summarized.

        Called at session start to catch sessions where the user exited
        without Claude generating a summary.

        Returns:
            List of dicts with episode_id, session_id, turn_count, turns, started_at
        """
        # Find episodes that have buffered turns but are not summarized
        episodes = self.db.execute(
            """
            SELECT e.id, e.session_id, e.turn_count, e.started_at
            FROM episodes e
            WHERE e.is_summarized = 0
              AND e.turn_count > 0
            ORDER BY e.started_at DESC
            """,
            fetch=True,
        ) or []

        results = []
        for ep in episodes:
            turns = self.db.execute(
                """
                SELECT turn_number, user_content, assistant_content, created_at
                FROM turn_buffer
                WHERE episode_id = ? AND (is_archived = 0 OR is_archived IS NULL)
                ORDER BY turn_number ASC
                """,
                (ep["id"],),
                fetch=True,
            ) or []

            if turns:
                results.append({
                    "episode_id": ep["id"],
                    "session_id": ep["session_id"],
                    "started_at": ep["started_at"],
                    "turn_count": ep["turn_count"],
                    "turns": [
                        {
                            "turn_number": t["turn_number"],
                            "user": t["user_content"],
                            "assistant": t["assistant_content"],
                            "timestamp": t["created_at"],
                        }
                        for t in turns
                    ],
                })

        return results

    def save_source_material(
        self,
        memory_id: int,
        content: str,
        metadata: Optional[Dict] = None,
    ) -> Optional[Path]:
        """
        Save raw source material (email, transcript, document) to disk.

        Files are plain markdown with a YAML frontmatter header, stored at
        ~/.claudia/memory/sources/{memory_id}.md. The directory is created
        lazily on first write.

        Args:
            memory_id: The memory this source material belongs to
            content: Full raw text of the source material
            metadata: Optional dict with source, source_context, etc.

        Returns:
            Path to the saved file, or None on failure
        """
        try:
            sources_dir = self.db.db_path.parent / "sources"
            sources_dir.mkdir(parents=True, exist_ok=True)

            file_path = sources_dir / f"{memory_id}.md"

            # Build frontmatter
            header_lines = ["---"]
            header_lines.append(f"memory_id: {memory_id}")
            if metadata:
                for key, value in metadata.items():
                    if value is not None:
                        # Quote strings that might contain YAML-special chars
                        header_lines.append(f'{key}: "{value}"')
            header_lines.append(f"saved_at: {datetime.utcnow().isoformat()}")
            header_lines.append("---")
            header_lines.append("")

            file_content = "\n".join(header_lines) + content

            file_path.write_text(file_content, encoding="utf-8")
            logger.debug(f"Saved source material for memory {memory_id} to {file_path}")
            return file_path

        except Exception as e:
            logger.warning(f"Could not save source material for memory {memory_id}: {e}")
            return None

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


def buffer_turn(user_content: str = None, assistant_content: str = None, **kwargs) -> Dict[str, Any]:
    """Buffer a conversation turn for later summarization"""
    return get_remember_service().buffer_turn(user_content, assistant_content, **kwargs)


def end_session(episode_id: int, narrative: str, **kwargs) -> Dict[str, Any]:
    """Finalize a session with narrative summary and structured extractions"""
    return get_remember_service().end_session(episode_id, narrative, **kwargs)


def get_unsummarized_turns() -> List[Dict[str, Any]]:
    """Find episodes with buffered turns that were never summarized"""
    return get_remember_service().get_unsummarized_turns()
