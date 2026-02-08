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
from .guards import validate_entity, validate_memory, validate_relationship

logger = logging.getLogger(__name__)


def _audit_log(operation: str, **kwargs) -> None:
    """Lazy import and call audit logging to avoid circular imports."""
    try:
        from .audit import audit_log
        audit_log(operation, **kwargs)
    except Exception as e:
        logger.debug(f"Could not log audit entry: {e}")


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
        origin_type: Optional[str] = None,
        source_channel: Optional[str] = None,
        _precomputed_embedding: Optional[List[float]] = None,
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
            origin_type: 'user_stated', 'extracted', 'inferred', 'corrected' (Trust North Star)
            source_channel: Origin channel: claude_code, telegram, slack

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

        # Run deterministic guards
        guard_result = validate_memory(content, memory_type, importance, metadata)
        if guard_result.warnings:
            for w in guard_result.warnings:
                logger.warning(f"Memory guard: {w}")
        if "content" in guard_result.adjustments:
            content = guard_result.adjustments["content"]
        if "importance" in guard_result.adjustments:
            importance = guard_result.adjustments["importance"]

        # Determine origin_type (Trust North Star)
        # Auto-detect if not provided: high-importance from conversation = user_stated
        if origin_type is None:
            if source == "conversation" and importance >= 0.9:
                origin_type = "user_stated"
            elif source in ("transcript", "email", "document", "session_summary"):
                origin_type = "extracted"
            else:
                origin_type = "inferred"

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
            "origin_type": origin_type,
        }
        if source_context:
            insert_data["source_context"] = source_context
        if source_channel:
            insert_data["source_channel"] = source_channel

        memory_id = self.db.insert("memories", insert_data)

        # Store embedding (use precomputed if available, otherwise generate)
        embedding = _precomputed_embedding or embed_sync(content)
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

        # Audit log
        _audit_log(
            "memory_create",
            details={"type": memory_type, "source": source, "importance": importance},
            memory_id=memory_id,
        )

        return memory_id

    def remember_entity(
        self,
        name: str,
        entity_type: str = "person",
        description: Optional[str] = None,
        aliases: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
        _precomputed_embedding: Optional[List[float]] = None,
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
        # Run deterministic guards
        existing_names = [
            row["canonical_name"]
            for row in self.db.query("entities", columns=["canonical_name"])
        ]
        guard_result = validate_entity(name, entity_type, existing_names)
        if guard_result.warnings:
            for w in guard_result.warnings:
                logger.warning(f"Entity guard: {w}")
        if "entity_type" in guard_result.adjustments:
            entity_type = guard_result.adjustments["entity_type"]

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

            # Store embedding (use precomputed if available, otherwise generate)
            embed_text = f"{name}. {description or ''}"
            embedding = _precomputed_embedding or embed_sync(embed_text)
            if embedding:
                try:
                    self.db.execute(
                        "INSERT OR REPLACE INTO entity_embeddings (entity_id, embedding) VALUES (?, ?)",
                        (entity_id, json.dumps(embedding)),
                    )
                except Exception as e:
                    logger.warning(f"Could not store entity embedding: {e}")

            # Audit log for new entity
            _audit_log(
                "entity_create",
                details={"name": name, "type": entity_type},
                entity_id=entity_id,
            )

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
        valid_at: Optional[str] = None,
        supersedes: bool = False,
        origin_type: str = "extracted",
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
            valid_at: When this relationship became true (ISO string, defaults to now)
            supersedes: If True, invalidate existing relationship of same type
                        between same entities before creating a new one
            origin_type: How this was learned: user_stated, extracted, inferred, corrected

        Returns:
            Relationship ID or None
        """
        from .guards import ORIGIN_STRENGTH_CEILING, REINFORCEMENT_BY_ORIGIN

        # Run deterministic guards (origin-aware)
        guard_result = validate_relationship(strength, origin_type=origin_type)
        if guard_result.warnings:
            for w in guard_result.warnings:
                logger.warning(f"Relationship guard: {w}")
        if "strength" in guard_result.adjustments:
            strength = guard_result.adjustments["strength"]

        source_id = self._find_or_create_entity(source_name)
        target_id = self._find_or_create_entity(target_name)

        if not source_id or not target_id:
            return None

        now = datetime.utcnow().isoformat()
        effective_valid_at = valid_at or now

        if supersedes:
            # Invalidate existing relationship of same type between same entities (atomic)
            existing_to_supersede = self.db.get_one(
                "relationships",
                where="source_entity_id = ? AND target_entity_id = ? AND relationship_type = ? AND invalid_at IS NULL",
                where_params=(source_id, target_id, relationship_type),
            )
            if existing_to_supersede:
                with self.db.transaction() as conn:
                    # Invalidate the old relationship (mark when it ended)
                    conn.execute(
                        "UPDATE relationships SET invalid_at = ?, updated_at = ? WHERE id = ?",
                        (now, now, existing_to_supersede["id"]),
                    )
                    # Rename the type to free the UNIQUE constraint slot
                    old_meta = json.loads(existing_to_supersede["metadata"] or "{}")
                    old_meta["superseded_by_at"] = now
                    conn.execute(
                        "UPDATE relationships SET relationship_type = ?, metadata = ? WHERE id = ?",
                        (
                            f"{relationship_type}__superseded_{existing_to_supersede['id']}",
                            json.dumps(old_meta),
                            existing_to_supersede["id"],
                        ),
                    )

                # Audit log for supersede
                _audit_log(
                    "relationship_supersede",
                    details={
                        "old_id": existing_to_supersede["id"],
                        "source": source_name,
                        "target": target_name,
                        "type": relationship_type,
                    },
                )

            # Supersede always sets origin_type to 'corrected' (user is correcting the record)
            supersede_origin = "corrected"
            ceiling = ORIGIN_STRENGTH_CEILING.get(supersede_origin, 0.5)
            capped_strength = min(strength, ceiling)

            # Create new relationship
            new_id = self.db.insert(
                "relationships",
                {
                    "source_entity_id": source_id,
                    "target_entity_id": target_id,
                    "relationship_type": relationship_type,
                    "strength": capped_strength,
                    "origin_type": supersede_origin,
                    "direction": direction,
                    "valid_at": effective_valid_at,
                    "created_at": now,
                    "updated_at": now,
                    "metadata": json.dumps(metadata) if metadata else None,
                },
            )

            # Audit log for create
            _audit_log(
                "relationship_create",
                details={
                    "id": new_id,
                    "source": source_name,
                    "target": target_name,
                    "type": relationship_type,
                    "origin_type": supersede_origin,
                    "strength": capped_strength,
                },
            )

            return new_id

        # Check for existing current relationship (non-supersede path)
        existing = self.db.get_one(
            "relationships",
            where="source_entity_id = ? AND target_entity_id = ? AND relationship_type = ? AND invalid_at IS NULL",
            where_params=(source_id, target_id, relationship_type),
        )

        if existing:
            # Determine ceiling: if new origin is higher-authority, upgrade
            existing_origin = existing["origin_type"] if "origin_type" in existing.keys() else "extracted"
            effective_origin = existing_origin

            # Origin upgrade: user_stated/corrected outrank extracted, which outranks inferred
            origin_rank = {"inferred": 0, "extracted": 1, "user_stated": 2, "corrected": 2}
            if origin_rank.get(origin_type, 0) > origin_rank.get(existing_origin, 0):
                effective_origin = origin_type

            ceiling = ORIGIN_STRENGTH_CEILING.get(effective_origin, 0.5)
            increment = REINFORCEMENT_BY_ORIGIN.get(origin_type, 0.1)
            new_strength = min(ceiling, existing["strength"] + increment)

            update_data = {
                "strength": new_strength,
                "updated_at": now,
                "origin_type": effective_origin,
            }
            # Ensure valid_at is set on existing relationships
            row_keys = existing.keys()
            if "valid_at" in row_keys and not existing["valid_at"]:
                update_data["valid_at"] = existing["created_at"]
            self.db.update(
                "relationships",
                update_data,
                "id = ?",
                (existing["id"],),
            )
            return existing["id"]
        else:
            # Create new relationship
            new_id = self.db.insert(
                "relationships",
                {
                    "source_entity_id": source_id,
                    "target_entity_id": target_id,
                    "relationship_type": relationship_type,
                    "strength": strength,
                    "origin_type": origin_type,
                    "direction": direction,
                    "valid_at": effective_valid_at,
                    "created_at": now,
                    "updated_at": now,
                    "metadata": json.dumps(metadata) if metadata else None,
                },
            )

            # Audit log
            _audit_log(
                "relationship_create",
                details={
                    "id": new_id,
                    "source": source_name,
                    "target": target_name,
                    "type": relationship_type,
                    "origin_type": origin_type,
                    "strength": strength,
                },
            )

            return new_id

    def invalidate_relationship(
        self,
        source_name: str,
        target_name: str,
        relationship_type: str,
        reason: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Invalidate a relationship without creating a replacement.

        Finds the active relationship by source + target + type, marks it with
        invalid_at, and renames the type to free the UNIQUE constraint. Atomic.

        Args:
            source_name: Source entity name
            target_name: Target entity name
            relationship_type: Type of relationship to invalidate
            reason: Why this relationship is being invalidated

        Returns:
            Dict with invalidated relationship info, or None if not found
        """
        source_id = self._find_or_create_entity(source_name)
        target_id = self._find_or_create_entity(target_name)

        if not source_id or not target_id:
            return None

        existing = self.db.get_one(
            "relationships",
            where="source_entity_id = ? AND target_entity_id = ? AND relationship_type = ? AND invalid_at IS NULL",
            where_params=(source_id, target_id, relationship_type),
        )

        if not existing:
            return None

        now = datetime.utcnow().isoformat()

        with self.db.transaction() as conn:
            # Invalidate and rename type atomically
            old_meta = json.loads(existing["metadata"] or "{}")
            old_meta["invalidated_reason"] = reason
            old_meta["invalidated_at"] = now

            conn.execute(
                "UPDATE relationships SET invalid_at = ?, updated_at = ?, "
                "relationship_type = ?, metadata = ? WHERE id = ?",
                (
                    now,
                    now,
                    f"{relationship_type}__invalidated_{existing['id']}",
                    json.dumps(old_meta),
                    existing["id"],
                ),
            )

        # Audit log
        _audit_log(
            "relationship_invalidate",
            details={
                "id": existing["id"],
                "source": source_name,
                "target": target_name,
                "type": relationship_type,
                "reason": reason,
            },
        )

        logger.info(
            f"Invalidated relationship {existing['id']}: "
            f"{source_name} -> {relationship_type} -> {target_name}"
            + (f" ({reason})" if reason else "")
        )

        return {
            "relationship_id": existing["id"],
            "source": source_name,
            "target": target_name,
            "relationship_type": relationship_type,
            "invalidated_at": now,
            "reason": reason,
        }

    def merge_entities(
        self,
        source_id: int,
        target_id: int,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Merge source entity into target entity.

        Updates all references to point to target, adds source name as alias of target,
        then soft-deletes the source entity. Preserves full history.

        Args:
            source_id: Entity ID to merge FROM (will be deleted)
            target_id: Entity ID to merge INTO (will be kept)
            reason: Optional reason for the merge

        Returns:
            Dict with merge statistics
        """
        now = datetime.utcnow().isoformat()
        result = {
            "source_id": source_id,
            "target_id": target_id,
            "aliases_moved": 0,
            "memories_moved": 0,
            "relationships_moved": 0,
            "reflections_moved": 0,
            "success": False,
        }

        # Verify both entities exist
        source = self.db.get_one("entities", where="id = ?", where_params=(source_id,))
        target = self.db.get_one("entities", where="id = ?", where_params=(target_id,))

        if not source:
            result["error"] = f"Source entity {source_id} not found"
            return result
        if not target:
            result["error"] = f"Target entity {target_id} not found"
            return result

        # 1. Add source name as alias of target
        try:
            self.db.insert(
                "entity_aliases",
                {
                    "entity_id": target_id,
                    "alias": source["name"],
                    "canonical_alias": source["canonical_name"],
                    "created_at": now,
                },
            )
            result["aliases_moved"] += 1
        except Exception:
            pass  # Duplicate alias, ignore

        # 2. Move source's aliases to target
        source_aliases = self.db.execute(
            "SELECT * FROM entity_aliases WHERE entity_id = ?",
            (source_id,),
            fetch=True,
        ) or []
        for alias in source_aliases:
            try:
                self.db.insert(
                    "entity_aliases",
                    {
                        "entity_id": target_id,
                        "alias": alias["alias"],
                        "canonical_alias": alias["canonical_alias"],
                        "created_at": now,
                    },
                )
                result["aliases_moved"] += 1
            except Exception:
                pass  # Duplicate alias, ignore
        # Delete moved aliases from source
        self.db.execute("DELETE FROM entity_aliases WHERE entity_id = ?", (source_id,))

        # 3. Update memory_entities references
        memories_updated = self.db.execute(
            """
            UPDATE memory_entities SET entity_id = ?
            WHERE entity_id = ?
              AND NOT EXISTS (
                SELECT 1 FROM memory_entities me2
                WHERE me2.memory_id = memory_entities.memory_id
                  AND me2.entity_id = ?
              )
            """,
            (target_id, source_id, target_id),
        )
        # Delete any remaining duplicates
        self.db.execute(
            "DELETE FROM memory_entities WHERE entity_id = ?", (source_id,)
        )
        result["memories_moved"] = memories_updated or 0

        # 4. Update relationships (both source and target directions)
        # Update where source entity is the source
        rels_source = self.db.execute(
            """
            UPDATE relationships SET source_entity_id = ?, updated_at = ?
            WHERE source_entity_id = ?
              AND NOT EXISTS (
                SELECT 1 FROM relationships r2
                WHERE r2.source_entity_id = ?
                  AND r2.target_entity_id = relationships.target_entity_id
                  AND r2.relationship_type = relationships.relationship_type
              )
            """,
            (target_id, now, source_id, target_id),
        )
        # Update where source entity is the target
        rels_target = self.db.execute(
            """
            UPDATE relationships SET target_entity_id = ?, updated_at = ?
            WHERE target_entity_id = ?
              AND NOT EXISTS (
                SELECT 1 FROM relationships r2
                WHERE r2.source_entity_id = relationships.source_entity_id
                  AND r2.target_entity_id = ?
                  AND r2.relationship_type = relationships.relationship_type
              )
            """,
            (target_id, now, source_id, target_id),
        )
        # Delete any remaining duplicates
        self.db.execute(
            "DELETE FROM relationships WHERE source_entity_id = ? OR target_entity_id = ?",
            (source_id, source_id),
        )
        result["relationships_moved"] = (rels_source or 0) + (rels_target or 0)

        # 5. Update reflections about_entity_id
        reflections_updated = self.db.execute(
            "UPDATE reflections SET about_entity_id = ? WHERE about_entity_id = ?",
            (target_id, source_id),
        )
        result["reflections_moved"] = reflections_updated or 0

        # 6. Merge attributes (target wins on conflicts, but preserve metadata)
        if source["description"] and not target["description"]:
            self.db.update(
                "entities",
                {"description": source["description"]},
                "id = ?",
                (target_id,),
            )

        source_meta = json.loads(source["metadata"] or "{}")
        target_meta = json.loads(target["metadata"] or "{}")
        # Merge: source values fill in target gaps
        merged_meta = {**source_meta, **target_meta}
        merged_meta["merged_from"] = merged_meta.get("merged_from", [])
        merged_meta["merged_from"].append({
            "entity_id": source_id,
            "name": source["name"],
            "merged_at": now,
            "reason": reason,
        })
        self.db.update(
            "entities",
            {"metadata": json.dumps(merged_meta), "updated_at": now},
            "id = ?",
            (target_id,),
        )

        # 7. Soft-delete source entity
        self.db.update(
            "entities",
            {
                "deleted_at": now,
                "deleted_reason": f"Merged into entity {target_id}" + (f": {reason}" if reason else ""),
            },
            "id = ?",
            (source_id,),
        )

        result["success"] = True
        logger.info(f"Merged entity {source_id} ({source['name']}) into {target_id} ({target['name']})")

        # Audit log
        _audit_log(
            "entity_merge",
            details={
                "source_name": source["name"],
                "target_name": target["name"],
                "reason": reason,
                "aliases_moved": result["aliases_moved"],
                "memories_moved": result["memories_moved"],
                "relationships_moved": result["relationships_moved"],
            },
            entity_id=target_id,
            user_initiated=True,
        )

        return result

    def delete_entity(
        self,
        entity_id: int,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Soft-delete an entity.

        Sets deleted_at timestamp. Does NOT remove references (memories, relationships)
        as they may have historical value.

        Args:
            entity_id: Entity to delete
            reason: Optional reason for deletion

        Returns:
            Dict with deletion status
        """
        entity = self.db.get_one("entities", where="id = ?", where_params=(entity_id,))
        if not entity:
            return {"success": False, "error": f"Entity {entity_id} not found"}

        now = datetime.utcnow().isoformat()
        self.db.update(
            "entities",
            {
                "deleted_at": now,
                "deleted_reason": reason or "User requested deletion",
            },
            "id = ?",
            (entity_id,),
        )

        logger.info(f"Soft-deleted entity {entity_id} ({entity['name']}): {reason}")

        # Audit log
        _audit_log(
            "entity_delete",
            details={"name": entity["name"], "reason": reason},
            entity_id=entity_id,
            user_initiated=True,
        )

        return {
            "success": True,
            "entity_id": entity_id,
            "name": entity["name"],
            "deleted_at": now,
        }

    def correct_memory(
        self,
        memory_id: int,
        correction: str,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Correct a memory's content, preserving history.

        Stores original content in corrected_from, updates content,
        and sets corrected_at timestamp for audit trail.

        Args:
            memory_id: Memory to correct
            correction: New corrected content
            reason: Optional reason for the correction

        Returns:
            Dict with correction status
        """
        memory = self.db.get_one("memories", where="id = ?", where_params=(memory_id,))
        if not memory:
            return {"success": False, "error": f"Memory {memory_id} not found"}

        now = datetime.utcnow().isoformat()
        original_content = memory["content"]

        # Build metadata with correction history
        existing_meta = json.loads(memory["metadata"] or "{}")
        corrections_history = existing_meta.get("corrections", [])
        corrections_history.append({
            "original": original_content,
            "corrected_to": correction,
            "reason": reason,
            "corrected_at": now,
        })
        existing_meta["corrections"] = corrections_history

        # Update the memory
        new_hash = content_hash(correction)
        self.db.update(
            "memories",
            {
                "content": correction,
                "content_hash": new_hash,
                "corrected_at": now,
                "corrected_from": original_content,
                "updated_at": now,
                "metadata": json.dumps(existing_meta),
                "origin_type": "corrected",  # Trust North Star: user corrections are canonical
                "confidence": 1.0,  # User corrections have maximum confidence
            },
            "id = ?",
            (memory_id,),
        )

        # Re-generate embedding for new content
        embedding = embed_sync(correction)
        if embedding:
            try:
                self.db.execute(
                    "INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                    (memory_id, json.dumps(embedding)),
                )
            except Exception as e:
                logger.warning(f"Could not update memory embedding: {e}")

        logger.info(f"Corrected memory {memory_id}: '{original_content[:50]}...' -> '{correction[:50]}...'")

        # Audit log
        _audit_log(
            "memory_correct",
            details={
                "original_content": original_content[:200],
                "corrected_content": correction[:200],
                "reason": reason,
            },
            memory_id=memory_id,
            user_initiated=True,
        )

        return {
            "success": True,
            "memory_id": memory_id,
            "original_content": original_content,
            "corrected_content": correction,
            "corrected_at": now,
        }

    def invalidate_memory(
        self,
        memory_id: int,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mark a memory as no longer true (soft delete).

        Sets invalidated_at timestamp but preserves the memory for
        historical queries. Use when facts become outdated or were wrong.

        Args:
            memory_id: Memory to invalidate
            reason: Why the memory is no longer valid

        Returns:
            Dict with invalidation status
        """
        memory = self.db.get_one("memories", where="id = ?", where_params=(memory_id,))
        if not memory:
            return {"success": False, "error": f"Memory {memory_id} not found"}

        now = datetime.utcnow().isoformat()

        # Build metadata with invalidation reason
        existing_meta = json.loads(memory["metadata"] or "{}")
        existing_meta["invalidation"] = {
            "reason": reason or "User requested invalidation",
            "invalidated_at": now,
        }

        self.db.update(
            "memories",
            {
                "invalidated_at": now,
                "invalidated_reason": reason or "User requested invalidation",
                "updated_at": now,
                "metadata": json.dumps(existing_meta),
            },
            "id = ?",
            (memory_id,),
        )

        logger.info(f"Invalidated memory {memory_id} ({memory['content'][:50]}...): {reason}")

        # Audit log
        _audit_log(
            "memory_invalidate",
            details={
                "content": memory["content"][:200],
                "reason": reason or "User requested invalidation",
            },
            memory_id=memory_id,
            user_initiated=True,
        )

        return {
            "success": True,
            "memory_id": memory_id,
            "content": memory["content"],
            "invalidated_at": now,
            "reason": reason,
        }

    def buffer_turn(
        self,
        user_content: Optional[str] = None,
        assistant_content: Optional[str] = None,
        episode_id: Optional[int] = None,
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Buffer a conversation turn for later summarization.

        This is lightweight storage -- no embeddings, no extraction, no processing.
        The raw exchange is held in turn_buffer until Claude summarizes the session.

        Args:
            user_content: What the user said
            assistant_content: What the assistant said
            episode_id: Episode to append to (creates one if None)
            source: Origin channel ('claude_code', 'telegram', 'slack', etc.)

        Returns:
            Dict with episode_id and turn_number
        """
        if episode_id is None:
            episode_id = self._get_or_create_episode(source=source)

        # Get next turn number
        row = self.db.execute(
            "SELECT COALESCE(MAX(turn_number), 0) as max_turn FROM turn_buffer WHERE episode_id = ?",
            (episode_id,),
            fetch=True,
        )
        next_turn = (row[0]["max_turn"] + 1) if row else 1

        insert_data = {
            "episode_id": episode_id,
            "turn_number": next_turn,
            "user_content": user_content,
            "assistant_content": assistant_content,
            "created_at": datetime.utcnow().isoformat(),
        }
        if source:
            insert_data["source"] = source

        self.db.insert("turn_buffer", insert_data)

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

        # Validate episode exists before any DB operations
        episode = self.db.get_one("episodes", where="id = ?", where_params=(episode_id,))
        if not episode:
            result["error"] = f"Episode {episode_id} not found. Call memory.buffer_turn first to create an episode."
            logger.warning(f"end_session called with non-existent episode_id={episode_id}")
            return result

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

    def store_reflection(
        self,
        content: str,
        reflection_type: str,
        episode_id: Optional[int] = None,
        about_entity: Optional[str] = None,
        importance: float = 0.7,
        confidence: float = 0.8,
    ) -> Optional[int]:
        """
        Store a reflection (observation, pattern, learning, question) from /meditate.

        Reflections are user-approved persistent learnings that decay very slowly
        (0.999 daily vs 0.995 for regular memories). They capture cross-session
        patterns that inform future interactions.

        Args:
            content: The reflection text
            reflection_type: 'observation', 'pattern', 'learning', 'question'
            episode_id: Optional episode this reflection came from
            about_entity: Optional entity name this reflection is about
            importance: Starting importance (default 0.7, higher than regular memories)
            confidence: How confident we are (default 0.8, user-approved = high)

        Returns:
            Reflection ID or None if duplicate
        """
        # Check for near-duplicate
        ref_hash = content_hash(content)
        existing = self.db.get_one(
            "reflections", where="content_hash = ?", where_params=(ref_hash,)
        )
        if existing:
            # Duplicate content - confirm the existing one instead of creating new
            self.db.update(
                "reflections",
                {
                    "last_confirmed_at": datetime.utcnow().isoformat(),
                    "aggregation_count": existing["aggregation_count"] + 1,
                    "confidence": min(1.0, existing["confidence"] + 0.05),
                    "updated_at": datetime.utcnow().isoformat(),
                },
                "id = ?",
                (existing["id"],),
            )
            logger.debug(f"Confirmed existing reflection {existing['id']}")
            return existing["id"]

        # Find entity if specified
        entity_id = None
        if about_entity:
            entity_id = self._find_or_create_entity(about_entity)

        # Insert new reflection
        now = datetime.utcnow().isoformat()
        reflection_id = self.db.insert(
            "reflections",
            {
                "episode_id": episode_id,
                "reflection_type": reflection_type,
                "content": content,
                "content_hash": ref_hash,
                "about_entity_id": entity_id,
                "importance": importance,
                "confidence": confidence,
                "decay_rate": 0.999,  # Very slow decay
                "aggregation_count": 1,
                "first_observed_at": now,
                "last_confirmed_at": now,
                "created_at": now,
            },
        )

        # Generate and store embedding
        embedding = embed_sync(content)
        if embedding:
            try:
                self.db.execute(
                    "INSERT OR REPLACE INTO reflection_embeddings (reflection_id, embedding) VALUES (?, ?)",
                    (reflection_id, json.dumps(embedding)),
                )
            except Exception as e:
                logger.warning(f"Could not store reflection embedding: {e}")

        logger.debug(f"Stored reflection [{reflection_type}]: {content[:50]}...")
        return reflection_id

    def update_reflection(
        self,
        reflection_id: int,
        content: Optional[str] = None,
        importance: Optional[float] = None,
    ) -> bool:
        """
        Update an existing reflection (for natural language editing).

        Args:
            reflection_id: The reflection to update
            content: New content (if changing)
            importance: New importance (if changing)

        Returns:
            True if updated, False if not found
        """
        existing = self.db.get_one(
            "reflections", where="id = ?", where_params=(reflection_id,)
        )
        if not existing:
            return False

        update_data = {"updated_at": datetime.utcnow().isoformat()}

        if content is not None:
            update_data["content"] = content
            update_data["content_hash"] = content_hash(content)
            # Re-generate embedding
            embedding = embed_sync(content)
            if embedding:
                try:
                    self.db.execute(
                        "INSERT OR REPLACE INTO reflection_embeddings (reflection_id, embedding) VALUES (?, ?)",
                        (reflection_id, json.dumps(embedding)),
                    )
                except Exception as e:
                    logger.warning(f"Could not update reflection embedding: {e}")

        if importance is not None:
            update_data["importance"] = importance

        self.db.update("reflections", update_data, "id = ?", (reflection_id,))
        logger.debug(f"Updated reflection {reflection_id}")
        return True

    def delete_reflection(self, reflection_id: int) -> bool:
        """
        Delete a reflection.

        Args:
            reflection_id: The reflection to delete

        Returns:
            True if deleted, False if not found
        """
        count = self.db.delete("reflections", "id = ?", (reflection_id,))
        if count > 0:
            # Also delete embedding
            try:
                self.db.execute(
                    "DELETE FROM reflection_embeddings WHERE reflection_id = ?",
                    (reflection_id,),
                )
            except Exception:
                pass
            logger.debug(f"Deleted reflection {reflection_id}")
            return True
        return False

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

        Also registers the file in the documents table and creates a
        memory_sources link for provenance tracking (if the documents table
        exists in this database version).

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

            # Register in documents table for provenance (graceful if table doesn't exist)
            self._register_document_provenance(memory_id, content, file_path, metadata)

            return file_path

        except Exception as e:
            logger.warning(f"Could not save source material for memory {memory_id}: {e}")
            return None

    def _register_document_provenance(
        self,
        memory_id: int,
        content: str,
        file_path: Path,
        metadata: Optional[Dict] = None,
    ) -> None:
        """Register a source material file in the documents table and link to memory."""
        try:
            import hashlib

            file_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
            source_type = (metadata or {}).get("source", "session")
            source_context = (metadata or {}).get("source_context")

            doc_id = self.db.insert(
                "documents",
                {
                    "file_hash": file_hash,
                    "filename": file_path.name,
                    "mime_type": "text/markdown",
                    "file_size": len(content.encode("utf-8")),
                    "storage_provider": "local",
                    "storage_path": str(file_path),
                    "source_type": source_type if source_type in (
                        "gmail", "transcript", "upload", "capture", "session"
                    ) else "session",
                    "source_ref": source_context,
                    "lifecycle": "active",
                    "last_accessed_at": datetime.utcnow().isoformat(),
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )

            # Create provenance link
            self.db.insert(
                "memory_sources",
                {
                    "memory_id": memory_id,
                    "document_id": doc_id,
                    "created_at": datetime.utcnow().isoformat(),
                },
            )
            logger.debug(f"Registered document {doc_id} for memory {memory_id}")
        except Exception as e:
            # Graceful degradation: documents table may not exist on older schemas
            logger.debug(f"Could not register document provenance: {e}")

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

    def _get_or_create_episode(self, source: Optional[str] = None) -> int:
        """Get current episode or create a new one"""
        # For now, create a new episode each time
        # In a more sophisticated implementation, we'd track session context
        session_id = str(uuid.uuid4())
        insert_data = {
            "session_id": session_id,
            "started_at": datetime.utcnow().isoformat(),
            "message_count": 0,
        }
        if source:
            insert_data["source"] = source
        return self.db.insert("episodes", insert_data)


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
    """Store a discrete fact. Pass _precomputed_embedding to skip Ollama call."""
    return get_remember_service().remember_fact(content, **kwargs)


def remember_entity(name: str, **kwargs) -> int:
    """Create or update an entity. Pass _precomputed_embedding to skip Ollama call."""
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


def store_reflection(content: str, reflection_type: str, **kwargs) -> Optional[int]:
    """Store a reflection from /meditate"""
    return get_remember_service().store_reflection(content, reflection_type, **kwargs)


def update_reflection(reflection_id: int, **kwargs) -> bool:
    """Update an existing reflection"""
    return get_remember_service().update_reflection(reflection_id, **kwargs)


def delete_reflection(reflection_id: int) -> bool:
    """Delete a reflection"""
    return get_remember_service().delete_reflection(reflection_id)


def merge_entities(source_id: int, target_id: int, reason: Optional[str] = None) -> Dict[str, Any]:
    """Merge source entity into target entity"""
    return get_remember_service().merge_entities(source_id, target_id, reason)


def delete_entity(entity_id: int, reason: Optional[str] = None) -> Dict[str, Any]:
    """Soft-delete an entity"""
    return get_remember_service().delete_entity(entity_id, reason)


def correct_memory(memory_id: int, correction: str, reason: Optional[str] = None) -> Dict[str, Any]:
    """Correct a memory, preserving history"""
    return get_remember_service().correct_memory(memory_id, correction, reason)


def invalidate_memory(memory_id: int, reason: Optional[str] = None) -> Dict[str, Any]:
    """Mark a memory as no longer true"""
    return get_remember_service().invalidate_memory(memory_id, reason)


def invalidate_relationship(
    source: str, target: str, relationship: str, reason: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Invalidate a relationship without creating a replacement"""
    return get_remember_service().invalidate_relationship(source, target, relationship, reason)
