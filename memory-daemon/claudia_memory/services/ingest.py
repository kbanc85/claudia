"""
Ingest Service for Claudia Memory System

Uses a local language model (via Ollama) to extract structured data from
raw text: meeting transcripts, emails, documents, notes. Returns structured
JSON that Claude can review and store via memory tools.

When no language model is available, returns a fallback response indicating
the text should be processed by Claude directly (preserving current behavior).
"""

import json
import logging
from typing import Any, Dict, Optional

from ..language_model import get_language_model_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Extraction prompts
# ---------------------------------------------------------------------------

# Qwen3 supports /no_think for fast deterministic output. We prepend it to
# every system prompt so the model skips chain-of-thought reasoning and
# returns structured JSON directly.

_SYSTEM_BASE = """/no_think
You are a structured data extraction assistant. You receive raw text and
extract entities, facts, commitments, and action items into JSON.

RULES:
- Return ONLY valid JSON. No markdown, no commentary, no explanation.
- Use the exact schema provided.
- If a field has no matches, use an empty array [].
- For importance scores: 1.0 = critical, 0.7 = notable, 0.4 = minor.
- For entity types: person, organization, project, concept, location.
- For memory types: fact, preference, observation, commitment, learning.
"""

PROMPTS: Dict[str, str] = {
    "meeting": _SYSTEM_BASE + """
You are extracting structured data from a MEETING TRANSCRIPT.

Return JSON with this exact schema:
{
  "participants": [{"name": "string", "role": "string or null"}],
  "key_decisions": [{"decision": "string", "made_by": "string or null"}],
  "action_items": [{"task": "string", "owner": "string or null", "deadline": "string or null"}],
  "commitments": [{"content": "string", "who": "string", "importance": number}],
  "facts": [{"content": "string", "type": "string", "about": ["string"], "importance": number}],
  "entities": [{"name": "string", "type": "string", "description": "string or null"}],
  "relationships": [{"source": "string", "target": "string", "relationship": "string"}],
  "topics": ["string"],
  "sentiment_summary": "string"
}
""",

    "email": _SYSTEM_BASE + """
You are extracting structured data from an EMAIL.

Return JSON with this exact schema:
{
  "from": "string or null",
  "to": ["string"],
  "cc": ["string"],
  "date": "string or null",
  "subject": "string or null",
  "action_items": [{"task": "string", "owner": "string or null", "deadline": "string or null"}],
  "commitments": [{"content": "string", "who": "string", "importance": number}],
  "facts": [{"content": "string", "type": "string", "about": ["string"], "importance": number}],
  "entities": [{"name": "string", "type": "string", "description": "string or null"}],
  "relationships": [{"source": "string", "target": "string", "relationship": "string"}],
  "tone": "string",
  "summary": "string"
}
""",

    "document": _SYSTEM_BASE + """
You are extracting structured data from a DOCUMENT or article.

Return JSON with this exact schema:
{
  "title": "string or null",
  "author": "string or null",
  "facts": [{"content": "string", "type": "string", "about": ["string"], "importance": number}],
  "entities": [{"name": "string", "type": "string", "description": "string or null"}],
  "relationships": [{"source": "string", "target": "string", "relationship": "string"}],
  "key_points": ["string"],
  "topics": ["string"],
  "summary": "string"
}
""",

    "general": _SYSTEM_BASE + """
You are extracting structured data from RAW TEXT.

Return JSON with this exact schema:
{
  "facts": [{"content": "string", "type": "string", "about": ["string"], "importance": number}],
  "commitments": [{"content": "string", "who": "string or null", "importance": number}],
  "action_items": [{"task": "string", "owner": "string or null", "deadline": "string or null"}],
  "entities": [{"name": "string", "type": "string", "description": "string or null"}],
  "relationships": [{"source": "string", "target": "string", "relationship": "string"}],
  "topics": ["string"],
  "summary": "string"
}
""",
}


# ---------------------------------------------------------------------------
# Ingest service
# ---------------------------------------------------------------------------

class IngestService:
    """Extract structured data from raw text using a local language model."""

    def __init__(self):
        self.llm = get_language_model_service()

    async def ingest(
        self,
        text: str,
        source_type: str = "general",
        context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Extract structured data from raw text.

        Args:
            text: The raw text to process (transcript, email, document, etc.)
            source_type: One of "meeting", "email", "document", "general"
            context: Optional extra context for the extraction
                     (e.g., "This is a call between the user and their investor")

        Returns:
            Dict with:
              - "status": "extracted" | "llm_unavailable" | "parse_error"
              - "source_type": the type used
              - "data": the structured extraction (if successful)
              - "raw_text": the original text (always included for fallback)
        """
        system_prompt = PROMPTS.get(source_type, PROMPTS["general"])

        # Build the user prompt
        prompt = text
        if context:
            prompt = f"Context: {context}\n\n---\n\n{text}"

        # Check availability before attempting generation
        if not await self.llm.is_available():
            logger.info("Language model unavailable; returning fallback.")
            return {
                "status": "llm_unavailable",
                "source_type": source_type,
                "data": None,
                "raw_text": text,
            }

        # Generate structured extraction
        raw_output = await self.llm.generate(
            prompt=prompt,
            system=system_prompt,
            temperature=0.1,
            format_json=True,
        )

        if raw_output is None:
            return {
                "status": "llm_unavailable",
                "source_type": source_type,
                "data": None,
                "raw_text": text,
            }

        # Parse JSON response
        parsed = _parse_json_response(raw_output)
        if parsed is None:
            logger.warning("LLM returned unparseable output for ingest.")
            return {
                "status": "parse_error",
                "source_type": source_type,
                "data": None,
                "raw_text": text,
                "raw_output": raw_output,
            }

        return {
            "status": "extracted",
            "source_type": source_type,
            "data": parsed,
            "raw_text": text,
        }


def _parse_json_response(text: str) -> Optional[Dict]:
    """Try to parse JSON from LLM output, handling common quirks."""
    text = text.strip()

    # Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last lines (```json and ```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Try to find the first { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    return None


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------
_service: Optional[IngestService] = None


def get_ingest_service() -> IngestService:
    global _service
    if _service is None:
        _service = IngestService()
    return _service


async def ingest(text: str, **kwargs) -> Dict[str, Any]:
    """Convenience wrapper."""
    return await get_ingest_service().ingest(text, **kwargs)
