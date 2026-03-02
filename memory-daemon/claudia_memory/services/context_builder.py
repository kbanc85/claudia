"""
Context Builder (CRE) for Claudia Memory System

Builds optimized context windows for LLM consumption with:
- Sacred facts always included verbatim
- Token-budgeted hybrid recall
- Optional Ollama-powered compression
- Graceful truncation fallback
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ContextResult:
    """Result from context builder."""
    sacred: List[Dict[str, Any]]
    relevant: List[Dict[str, Any]]
    total_tokens: int
    sacred_count: int
    relevant_count: int
    truncated: bool = False
    compressed: bool = False


def _estimate_tokens(text: str) -> int:
    """Estimate token count using word-based heuristic (words * 1.3)."""
    if not text:
        return 0
    return int(len(text.split()) * 1.3)


def _facts_to_text(facts: List[Dict]) -> str:
    """Convert fact dicts to a readable text block."""
    lines = []
    for f in facts:
        prefix = "[sacred] " if f.get("lifecycle_tier") == "sacred" else ""
        entities = ", ".join(f.get("entities", [])[:3])
        entity_str = f" (about: {entities})" if entities else ""
        lines.append(f"- {prefix}{f['content']}{entity_str}")
    return "\n".join(lines)


def get_sacred_facts(entity_name: Optional[str] = None) -> List[Dict]:
    """Retrieve all sacred facts, optionally filtered to a specific entity."""
    from ..database import get_db
    db = get_db()

    if entity_name:
        # Normalize entity name for matching
        canonical = entity_name.strip().lower()
        rows = db.execute(
            """
            SELECT m.id, m.content, m.type, m.importance, m.created_at,
                   m.fact_id, m.lifecycle_tier, m.sacred_reason,
                   GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE m.lifecycle_tier = 'sacred'
              AND m.invalidated_at IS NULL
              AND e.canonical_name = ?
            GROUP BY m.id
            ORDER BY m.importance DESC
            """,
            (canonical,),
            fetch=True,
        ) or []
    else:
        rows = db.execute(
            """
            SELECT m.id, m.content, m.type, m.importance, m.created_at,
                   m.fact_id, m.lifecycle_tier, m.sacred_reason,
                   GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE m.lifecycle_tier = 'sacred'
              AND m.invalidated_at IS NULL
            GROUP BY m.id
            ORDER BY m.importance DESC
            """,
            fetch=True,
        ) or []

    return [
        {
            "id": row["id"],
            "content": row["content"],
            "type": row["type"],
            "importance": row["importance"],
            "created_at": row["created_at"],
            "fact_id": row["fact_id"],
            "lifecycle_tier": "sacred",
            "sacred_reason": row["sacred_reason"],
            "entities": [n.strip() for n in (row["entity_names"] or "").split(",") if n.strip()],
        }
        for row in rows
    ]


def _try_ollama_compress(facts: List[Dict], remaining_tokens: int, query: str) -> Optional[str]:
    """Attempt to compress facts using Ollama LLM. Returns None if unavailable."""
    try:
        from ..config import get_config
        config = get_config()
        if not config.language_model:
            return None

        import httpx
        facts_text = _facts_to_text(facts)
        prompt = (
            f"Compress the following facts into a concise summary that preserves all key information. "
            f"Stay under {remaining_tokens} tokens. Prioritize: names, dates, numbers, relationships. "
            f"Do NOT include any facts that are irrelevant to: {query}\n\n"
            f"Facts:\n{facts_text}"
        )

        response = httpx.post(
            f"{config.ollama_host}/api/generate",
            json={
                "model": config.language_model,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": remaining_tokens},
            },
            timeout=30.0,
        )
        if response.status_code == 200:
            result = response.json().get("response", "")
            if result.strip():
                return result.strip()
        return None
    except Exception as e:
        logger.debug(f"Ollama compression unavailable: {e}")
        return None


def truncate_to_budget(facts: List[Dict], token_budget: int) -> List[Dict]:
    """Take top-scored facts until budget is exhausted."""
    result = []
    used = 0
    for fact in facts:
        tokens = _estimate_tokens(fact.get("content", ""))
        if used + tokens > token_budget:
            break
        result.append(fact)
        used += tokens
    return result


def build_context(
    query: str,
    token_budget: Optional[int] = None,
    max_facts: Optional[int] = None,
    include_sacred: bool = True,
    entity: Optional[str] = None,
) -> ContextResult:
    """Build a token-budgeted context window.

    Args:
        query: Search query for relevant facts
        token_budget: Maximum tokens (default from config)
        max_facts: Maximum facts to include (default from config)
        include_sacred: Whether to include sacred facts (always verbatim)
        entity: Optional entity to scope sacred facts to

    Returns:
        ContextResult with sacred + relevant sections
    """
    from ..config import get_config
    from .recall import recall

    config = get_config()
    if token_budget is None:
        token_budget = config.context_builder_token_budget
    if max_facts is None:
        max_facts = config.context_builder_max_facts

    # 1. Load sacred facts (always verbatim, never compressed)
    sacred = []
    sacred_tokens = 0
    if include_sacred:
        sacred = get_sacred_facts(entity_name=entity)
        sacred_text = _facts_to_text(sacred)
        sacred_tokens = _estimate_tokens(sacred_text)

    # 2. Hybrid recall for relevant non-sacred facts
    remaining_budget = max(0, token_budget - sacred_tokens)
    try:
        relevant_raw = recall(
            query=query,
            limit=max_facts,
            include_low_importance=False,
        )
    except Exception as e:
        logger.debug(f"Recall failed in context builder: {e}")
        relevant_raw = []

    # Filter out sacred facts from relevant (avoid duplicates)
    sacred_ids = {f["id"] for f in sacred}
    relevant_filtered = [
        {
            "id": r.id,
            "content": r.content,
            "type": r.type,
            "importance": r.importance,
            "score": r.score,
            "created_at": r.created_at,
            "entities": r.entities,
            "fact_id": getattr(r, "fact_id", None),
            "lifecycle_tier": getattr(r, "lifecycle_tier", None),
        }
        for r in relevant_raw
        if r.id not in sacred_ids
    ]

    # 3. Compress or truncate
    compressed = False
    if remaining_budget > 0 and relevant_filtered:
        compressed_text = _try_ollama_compress(relevant_filtered, remaining_budget, query)
        if compressed_text:
            relevant_final = [{
                "content": compressed_text,
                "type": "compressed_summary",
                "id": 0,
                "entities": [],
                "importance": 0,
                "score": 0,
                "created_at": "",
                "fact_id": None,
                "lifecycle_tier": None,
            }]
            compressed = True
        else:
            # Graceful truncation: take top-scored facts until budget exhausted
            relevant_final = truncate_to_budget(relevant_filtered, remaining_budget)
    else:
        relevant_final = []

    total_tokens = sacred_tokens + _estimate_tokens(_facts_to_text(relevant_final))

    return ContextResult(
        sacred=sacred,
        relevant=relevant_final,
        total_tokens=total_tokens,
        sacred_count=len(sacred),
        relevant_count=len(relevant_final),
        truncated=len(relevant_final) < len(relevant_filtered),
        compressed=compressed,
    )
