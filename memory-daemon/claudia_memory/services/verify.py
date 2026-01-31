"""
Background Verification Service for Claudia Memory System

Async background verification of recently stored memories.
Never blocks conversation. Runs on a schedule via the daemon scheduler.

Verification cascade (cheapest to most expensive):
1. Commitment deadline check (deterministic, reuses guards)
2. Entity duplicate check (deterministic, reuses guards)
3. Fact contradiction check (LLM, only if available)
4. Commitment completeness check (LLM, only if available)
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..config import get_config
from ..database import get_db
from .guards import DEADLINE_PATTERNS, validate_entity

logger = logging.getLogger(__name__)


class VerifyService:
    """Background memory verification"""

    _instance: Optional["VerifyService"] = None

    def __init__(self):
        self.db = get_db()
        self.config = get_config()

    @classmethod
    def get_instance(cls) -> "VerifyService":
        """Singleton accessor"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def run_verification(self) -> Dict[str, Any]:
        """
        Verify recently stored memories that have passed the 5-minute buffer.

        Returns:
            Dict with verification stats
        """
        batch_size = self.config.verify_batch_size

        # Query pending memories older than 5 minutes (buffer prevents mid-session verification)
        # Use REPLACE to normalize T-separator from Python's isoformat() for comparison
        pending = self.db.execute(
            """
            SELECT id, content, type, importance, metadata
            FROM memories
            WHERE verification_status = 'pending'
              AND julianday(REPLACE(created_at, 'T', ' ')) < julianday('now', '-5 minutes')
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (batch_size,),
            fetch=True,
        ) or []

        if not pending:
            return {"verified": 0, "flagged": 0, "contradicts": 0, "skipped": 0}

        stats = {"verified": 0, "flagged": 0, "contradicts": 0, "skipped": 0}

        for memory in pending:
            try:
                result = self._verify_single(memory)
                self._apply_result(memory["id"], result)
                stats[result["status"]] = stats.get(result["status"], 0) + 1
            except Exception as e:
                logger.warning(f"Verification failed for memory {memory['id']}: {e}")
                stats["skipped"] += 1

        logger.info(f"Verification batch complete: {stats}")
        return stats

    def _verify_single(self, memory: dict) -> Dict[str, Any]:
        """
        Run verification cascade on a single memory.

        Returns:
            Dict with status ('verified', 'flagged', 'contradicts') and reasons
        """
        reasons = []
        memory_type = memory["type"]
        content = memory["content"]
        memory_id = memory["id"]

        # Check 1: Commitment deadline (deterministic)
        if memory_type == "commitment":
            has_deadline = any(p.search(content) for p in DEADLINE_PATTERNS)
            if not has_deadline:
                reasons.append("Commitment has no detected deadline")

        # Check 2: Entity duplicate (deterministic)
        entity_links = self.db.execute(
            """
            SELECT e.name, e.canonical_name
            FROM memory_entities me
            JOIN entities e ON me.entity_id = e.id
            WHERE me.memory_id = ?
            """,
            (memory_id,),
            fetch=True,
        ) or []

        if entity_links:
            all_canonical = [
                row["canonical_name"]
                for row in self.db.query("entities", columns=["canonical_name"])
            ]
            for linked in entity_links:
                result = validate_entity(
                    linked["name"],
                    entity_type="person",
                    existing_canonical_names=[
                        n for n in all_canonical if n != linked["canonical_name"]
                    ],
                )
                for w in result.warnings:
                    if "near-duplicate" in w.lower():
                        reasons.append(w)

        # Check 3: Fact contradiction (LLM, only if available)
        if memory_type == "fact" and self._has_language_model():
            contradiction = self._check_fact_contradiction(memory_id, content, entity_links)
            if contradiction:
                return {"status": "contradicts", "reasons": [contradiction]}

        # Check 4: Commitment completeness (LLM, only if available)
        if memory_type == "commitment" and self._has_language_model():
            completeness = self._check_commitment_completeness(content)
            if completeness:
                reasons.append(completeness)

        # Determine final status
        if reasons:
            return {"status": "flagged", "reasons": reasons}
        return {"status": "verified", "reasons": []}

    def _apply_result(self, memory_id: int, result: Dict[str, Any]) -> None:
        """Apply verification result to the database"""
        status = result["status"]
        update_data = {
            "verification_status": status,
            "verified_at": datetime.utcnow().isoformat(),
        }

        # Flagged/contradicting memories get importance reduced
        if status in ("flagged", "contradicts"):
            update_data["importance"] = 0.1

        # Store reasons in metadata
        if result.get("reasons"):
            memory = self.db.get_one("memories", where="id = ?", where_params=(memory_id,))
            if memory:
                meta = json.loads(memory["metadata"] or "{}")
                meta["verification_reasons"] = result["reasons"]
                update_data["metadata"] = json.dumps(meta)

        self.db.update("memories", update_data, "id = ?", (memory_id,))

    def _has_language_model(self) -> bool:
        """Check if a language model is configured"""
        return bool(self.config.language_model)

    def _check_fact_contradiction(
        self, memory_id: int, content: str, entity_links: list
    ) -> Optional[str]:
        """
        Check if a new fact contradicts existing verified facts about the same entities.
        Uses LLM to assess contradiction.

        Returns:
            Contradiction description or None
        """
        if not entity_links:
            return None

        try:
            from ..language_model import get_language_model_service

            lm = get_language_model_service()
            if not lm.is_available():
                return None

            # Get existing verified facts about the same entities
            entity_ids = []
            for link in entity_links:
                entity = self.db.get_one(
                    "entities",
                    where="canonical_name = ?",
                    where_params=(link["canonical_name"],),
                )
                if entity:
                    entity_ids.append(entity["id"])

            if not entity_ids:
                return None

            placeholders = ", ".join(["?" for _ in entity_ids])
            existing_facts = self.db.execute(
                f"""
                SELECT DISTINCT m.content
                FROM memories m
                JOIN memory_entities me ON m.id = me.memory_id
                WHERE me.entity_id IN ({placeholders})
                  AND m.type = 'fact'
                  AND m.verification_status = 'verified'
                  AND m.id != ?
                  AND m.importance > 0.1
                ORDER BY m.importance DESC
                LIMIT 10
                """,
                tuple(entity_ids) + (memory_id,),
                fetch=True,
            ) or []

            if not existing_facts:
                return None

            facts_text = "\n".join(f"- {f['content']}" for f in existing_facts)
            prompt = (
                f"Existing verified facts:\n{facts_text}\n\n"
                f"New fact: {content}\n\n"
                f"Does the new fact directly contradict any existing fact? "
                f"Answer ONLY 'no' or describe the specific contradiction in one sentence."
            )

            response = lm.generate_sync(prompt)
            if response and response.strip().lower() != "no":
                return f"Potential contradiction: {response.strip()[:200]}"

        except Exception as e:
            logger.debug(f"Fact contradiction check failed: {e}")

        return None

    def _check_commitment_completeness(self, content: str) -> Optional[str]:
        """
        Check if a commitment has a clear owner and deadline using LLM.

        Returns:
            Incompleteness description or None
        """
        try:
            from ..language_model import get_language_model_service

            lm = get_language_model_service()
            if not lm.is_available():
                return None

            prompt = (
                f"Commitment: {content}\n\n"
                f"Does this commitment have a clear owner (who is responsible) "
                f"and a clear deadline (when it should be done)? "
                f"Answer ONLY 'yes' or describe what is missing in one sentence."
            )

            response = lm.generate_sync(prompt)
            if response and response.strip().lower() != "yes":
                return f"Incomplete commitment: {response.strip()[:200]}"

        except Exception as e:
            logger.debug(f"Commitment completeness check failed: {e}")

        return None


# Convenience function
def run_verification() -> Dict[str, Any]:
    """Run background verification"""
    return VerifyService.get_instance().run_verification()
