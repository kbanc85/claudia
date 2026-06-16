"""
AUDN write helper for P1 ambient memory.

Before inserting an extracted fact, semantic-search top-k similar existing
memories and use the local LLM to choose: Add / Update / No-op.
Conservative: only Update on high confidence; otherwise Add with
verification_status='pending' (stored in metadata).

Delete is intentionally excluded from P1 (too risky without supervision).
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_AUDN_DECISION_PROMPT = """/no_think
You are deciding whether a new extracted fact duplicates or contradicts an existing memory.

New fact:
{new_fact}

Top similar existing memories:
{existing}

Return JSON with this exact schema:
{{"action": "add"|"update"|"noop", "target_id": null|integer, "reason": "string"}}

Rules:
- Use "update" ONLY when confidence > 0.85 that the new fact supersedes an existing one.
- Use "noop" ONLY when confidence > 0.85 that the new fact is already captured.
- Use "add" in all other cases (default to adding; false negatives are recoverable).
- "target_id" must be the integer id of the memory to update, or null for add/noop.
- Return ONLY valid JSON. No markdown, no explanation.
"""


async def audn_write(
    content: str,
    memory_type: str,
    about_entities: Optional[List[str]],
    importance: float,
    source: str,
    source_id: str,
    db,
    llm_service,
) -> Optional[int]:
    """Add/Update/No-op a fact using semantic dedup before inserting.

    Args:
        content: Fact text to store
        memory_type: 'fact', 'commitment', 'decision', etc.
        about_entities: List of entity names this fact is about
        importance: Importance score (0.0-1.0)
        source: Source label (e.g. 'session_transcript')
        source_id: Reference ID (e.g. session_id)
        db: Database instance
        llm_service: Language model service (may be unavailable)

    Returns:
        Memory ID if stored/updated, None if noop or error
    """
    try:
        return await _audn_write_inner(
            content, memory_type, about_entities, importance, source, source_id, db, llm_service
        )
    except Exception as e:
        logger.debug(f"AUDN write error, falling back to plain add: {e}")
        return _plain_add(content, memory_type, about_entities, importance, source, source_id)


async def _audn_write_inner(
    content: str,
    memory_type: str,
    about_entities: Optional[List[str]],
    importance: float,
    source: str,
    source_id: str,
    db,
    llm_service,
) -> Optional[int]:
    """Inner implementation with structured error propagation."""
    # Step 1: Semantic search for similar memories
    similar: List[Dict[str, Any]] = []
    try:
        from .recall import RecallService
        from ..database import get_db as _get_db

        # Use a fresh RecallService with the provided db if possible
        recall_svc = RecallService.__new__(RecallService)
        recall_svc.db = db
        from ..embeddings import get_embedding_service
        recall_svc.embedding_service = get_embedding_service()
        from ..extraction.entity_extractor import get_extractor
        recall_svc.extractor = get_extractor()
        from ..config import get_config
        recall_svc.config = get_config()

        results = recall_svc.recall(content, limit=3, min_importance=0.0)
        similar = [
            {"id": r.id, "content": r.content, "type": r.type}
            for r in results
        ]
    except Exception as e:
        logger.debug(f"AUDN: recall failed, adding without dedup: {e}")
        # No recall = safe to add without dedup
        return _plain_add(content, memory_type, about_entities, importance, source, source_id)

    # Step 2: If no similar memories found, add directly
    if not similar:
        return _plain_add(content, memory_type, about_entities, importance, source, source_id)

    # Step 3: Ask LLM to decide
    action = "add"
    target_id = None

    try:
        if llm_service is not None and await llm_service.is_available():
            existing_text = "\n".join(
                f"[id={m['id']}] ({m['type']}) {m['content']}"
                for m in similar
            )
            prompt = _AUDN_DECISION_PROMPT.format(
                new_fact=content,
                existing=existing_text,
            )
            raw = await llm_service.generate(
                prompt=content,
                system=prompt,
                temperature=0.0,
                format_json=True,
            )
            if raw:
                parsed = _parse_decision(raw)
                if parsed:
                    action = parsed.get("action", "add")
                    target_id = parsed.get("target_id")
    except Exception as e:
        logger.debug(f"AUDN: LLM decision failed, defaulting to add: {e}")
        action = "add"
        target_id = None

    # Step 4: Execute decision (validates target_id against the candidate set).
    return _apply_decision(
        action, target_id, similar, content, memory_type,
        about_entities, importance, source, source_id, db,
    )


def _apply_decision(
    action: str,
    target_id,
    similar: List[Dict[str, Any]],
    content: str,
    memory_type: str,
    about_entities: Optional[List[str]],
    importance: float,
    source: str,
    source_id: str,
    db,
) -> Optional[int]:
    """Execute an AUDN decision.

    Safety: an "update" is only honored when target_id is one of the candidate
    memories that were actually shown to the model. A hallucinated or out-of-set
    id can never overwrite an unrelated memory; it falls through to a safe add.
    The superseded content is preserved in metadata.corrected_from for provenance
    (Trust North Star).
    """
    similar_ids = {m.get("id") for m in similar}

    if action == "noop":
        logger.debug(f"AUDN: noop for fact: {content[:60]}")
        return None

    if action == "update":
        if target_id is None or int(target_id) not in similar_ids:
            logger.debug(
                f"AUDN: rejected update to non-candidate id {target_id}; adding instead"
            )
        else:
            try:
                now = datetime.utcnow().isoformat()
                # Preserve the superseded content for provenance before overwriting.
                existing = db.execute(
                    "SELECT content, metadata FROM memories WHERE id = ?",
                    (int(target_id),),
                    fetch=True,
                )
                meta = {}
                if existing:
                    try:
                        meta = json.loads(existing[0]["metadata"] or "{}")
                    except (json.JSONDecodeError, TypeError):
                        meta = {}
                    meta["corrected_from"] = existing[0]["content"]
                db.update(
                    "memories",
                    {"content": content, "updated_at": now, "metadata": json.dumps(meta)},
                    "id = ?",
                    (int(target_id),),
                )
                logger.debug(f"AUDN: updated memory {target_id}: {content[:60]}")
                return int(target_id)
            except Exception as e:
                logger.debug(f"AUDN: update failed, falling back to add: {e}")

    # Default: add
    return _plain_add(content, memory_type, about_entities, importance, source, source_id)


def _plain_add(
    content: str,
    memory_type: str,
    about_entities: Optional[List[str]],
    importance: float,
    source: str,
    source_id: str,
) -> Optional[int]:
    """Add a fact without dedup, with verification_status=pending in metadata."""
    try:
        from .remember import get_remember_service
        svc = get_remember_service()
        return svc.remember_fact(
            content=content,
            memory_type=memory_type,
            about_entities=about_entities,
            importance=importance,
            source=source,
            source_id=source_id,
            origin_type="extracted",
            metadata={"verification_status": "pending"},
        )
    except Exception as e:
        logger.debug(f"AUDN: plain_add failed: {e}")
        return None


def _parse_decision(text: str) -> Optional[Dict]:
    """Parse LLM decision JSON, handling common quirks."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown fences
    if text.startswith("```"):
        lines = [l for l in text.split("\n") if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Find first {...}
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    return None
