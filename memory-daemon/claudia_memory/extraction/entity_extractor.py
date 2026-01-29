"""
Entity extraction for Claudia Memory System

Extracts named entities (people, organizations, projects, locations) from text
using spaCy NLP and custom regex patterns.
"""

import logging
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Try to load spaCy, but gracefully degrade if not available
try:
    import spacy
    from spacy.language import Language

    _nlp: Optional[Language] = None

    def _get_nlp() -> Optional[Language]:
        """Lazy load spaCy model"""
        global _nlp
        if _nlp is None:
            try:
                _nlp = spacy.load("en_core_web_sm")
            except OSError:
                logger.warning(
                    "spaCy model 'en_core_web_sm' not found. "
                    "Install with: python -m spacy download en_core_web_sm"
                )
                return None
        return _nlp

    SPACY_AVAILABLE = True
except (ImportError, Exception) as e:
    SPACY_AVAILABLE = False
    logger.warning(f"spaCy not available ({type(e).__name__}: {e}). Entity extraction will use regex only.")

    def _get_nlp():
        return None


@dataclass
class ExtractedEntity:
    """An entity extracted from text"""

    name: str
    type: str  # person, organization, project, concept, location
    canonical_name: str  # Normalized for matching
    confidence: float  # 0.0 to 1.0
    span: Tuple[int, int]  # Start and end positions in text


@dataclass
class ExtractedMemory:
    """A memory/fact extracted from text"""

    content: str
    type: str  # fact, preference, observation, commitment
    entities: List[str]  # Entity names this memory is about
    confidence: float


class EntityExtractor:
    """Extract entities and memories from text"""

    # Regex patterns for entity detection
    PERSON_PATTERNS = [
        # Full names with titles
        r"\b(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b",
        # Possessive names (Sarah's, Mike's)
        r"\b([A-Z][a-z]+)'s\b",
        # Names in context
        r"\b(?:with|from|to|about|called|named|meet(?:ing)?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b",
    ]

    ORGANIZATION_PATTERNS = [
        # Common suffixes
        r"\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Inc\.?|Corp\.?|LLC|Ltd\.?|Co\.?|Company|Group|Partners|Consulting))\b",
        # All caps acronyms
        r"\b([A-Z]{2,5})\b(?:\s+(?:team|company|client|project))?",
    ]

    PROJECT_PATTERNS = [
        # Common project identifiers
        r"\b(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:project|initiative|proposal|deal)\b",
        # Q-prefixed (Q4 review, Q2 planning)
        r"\b(Q[1-4]\s+[A-Za-z]+)\b",
    ]

    COMMITMENT_PATTERNS = [
        # Explicit promises
        r"(?:I'll|I will|I'm going to|we'll|we will)\s+(.+?)(?:\.|$)",
        # By-date commitments
        r"(?:by|before|until)\s+(\w+day|\d+[/-]\d+|\w+\s+\d+)",
        # Send/deliver/complete
        r"(?:send|deliver|complete|finish|submit)\s+(?:the\s+)?(.+?)(?:\s+(?:by|to|before)|\.|$)",
    ]

    PREFERENCE_PATTERNS = [
        # Explicit preferences
        r"(?:I |he |she |they )(?:prefer|like|want|need)\s+(.+?)(?:\.|$)",
        # Better/best patterns
        r"(?:better|best|rather)\s+(?:to |if |when )?(.+?)(?:\.|$)",
    ]

    # Common non-entity words to filter out
    STOP_WORDS = {
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "today",
        "tomorrow",
        "yesterday",
        "morning",
        "afternoon",
        "evening",
        "night",
        "the",
        "this",
        "that",
        "these",
        "those",
        "here",
        "there",
        "where",
        "when",
        "what",
        "which",
        "who",
        "how",
        "just",
        "only",
        "also",
        "even",
        "still",
    }

    def __init__(self):
        self.nlp = _get_nlp()

    @staticmethod
    def canonical_name(name: str) -> str:
        """Normalize name for matching"""
        # Remove titles
        name = re.sub(r"^(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)\s*", "", name, flags=re.I)
        # Lowercase, strip whitespace
        return name.lower().strip()

    def extract_entities(self, text: str) -> List[ExtractedEntity]:
        """Extract all entities from text"""
        entities: List[ExtractedEntity] = []
        seen_canonical: Set[str] = set()

        # Use spaCy if available
        if self.nlp is not None:
            doc = self.nlp(text)
            for ent in doc.ents:
                entity_type = self._map_spacy_type(ent.label_)
                if entity_type:
                    canonical = self.canonical_name(ent.text)
                    if canonical and canonical not in seen_canonical and canonical not in self.STOP_WORDS:
                        entities.append(
                            ExtractedEntity(
                                name=ent.text,
                                type=entity_type,
                                canonical_name=canonical,
                                confidence=0.8,  # spaCy entities are fairly reliable
                                span=(ent.start_char, ent.end_char),
                            )
                        )
                        seen_canonical.add(canonical)

        # Supplement with regex patterns
        regex_entities = self._extract_with_regex(text)
        for entity in regex_entities:
            if entity.canonical_name not in seen_canonical:
                entities.append(entity)
                seen_canonical.add(entity.canonical_name)

        return entities

    def _map_spacy_type(self, spacy_label: str) -> Optional[str]:
        """Map spaCy entity labels to our types"""
        mapping = {
            "PERSON": "person",
            "ORG": "organization",
            "GPE": "location",
            "LOC": "location",
            "FAC": "location",
            "PRODUCT": "project",
            "EVENT": "project",
            "WORK_OF_ART": "project",
        }
        return mapping.get(spacy_label)

    def _extract_with_regex(self, text: str) -> List[ExtractedEntity]:
        """Extract entities using regex patterns"""
        entities = []

        # Extract persons
        for pattern in self.PERSON_PATTERNS:
            for match in re.finditer(pattern, text):
                name = match.group(1) if match.lastindex else match.group(0)
                canonical = self.canonical_name(name)
                if canonical and len(canonical) > 1 and canonical not in self.STOP_WORDS:
                    entities.append(
                        ExtractedEntity(
                            name=name,
                            type="person",
                            canonical_name=canonical,
                            confidence=0.6,
                            span=(match.start(), match.end()),
                        )
                    )

        # Extract organizations
        for pattern in self.ORGANIZATION_PATTERNS:
            for match in re.finditer(pattern, text):
                name = match.group(1) if match.lastindex else match.group(0)
                canonical = self.canonical_name(name)
                if canonical and len(canonical) > 1 and canonical not in self.STOP_WORDS:
                    entities.append(
                        ExtractedEntity(
                            name=name,
                            type="organization",
                            canonical_name=canonical,
                            confidence=0.5,
                            span=(match.start(), match.end()),
                        )
                    )

        # Extract projects
        for pattern in self.PROJECT_PATTERNS:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                name = match.group(1) if match.lastindex else match.group(0)
                canonical = self.canonical_name(name)
                if canonical and len(canonical) > 2 and canonical not in self.STOP_WORDS:
                    entities.append(
                        ExtractedEntity(
                            name=name,
                            type="project",
                            canonical_name=canonical,
                            confidence=0.5,
                            span=(match.start(), match.end()),
                        )
                    )

        return entities

    def extract_memories(self, text: str, entities: List[ExtractedEntity] = None) -> List[ExtractedMemory]:
        """Extract memories/facts from text"""
        if entities is None:
            entities = self.extract_entities(text)

        entity_names = [e.name for e in entities]
        memories = []

        # Extract commitments
        for pattern in self.COMMITMENT_PATTERNS:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                content = match.group(0).strip()
                if len(content) > 10:
                    related_entities = [e for e in entity_names if e.lower() in content.lower()]
                    memories.append(
                        ExtractedMemory(
                            content=content,
                            type="commitment",
                            entities=related_entities,
                            confidence=0.7,
                        )
                    )

        # Extract preferences
        for pattern in self.PREFERENCE_PATTERNS:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                content = match.group(0).strip()
                if len(content) > 10:
                    related_entities = [e for e in entity_names if e.lower() in content.lower()]
                    memories.append(
                        ExtractedMemory(
                            content=content,
                            type="preference",
                            entities=related_entities,
                            confidence=0.6,
                        )
                    )

        return memories

    def extract_all(self, text: str) -> Tuple[List[ExtractedEntity], List[ExtractedMemory]]:
        """Extract both entities and memories from text"""
        entities = self.extract_entities(text)
        memories = self.extract_memories(text, entities)
        return entities, memories


# Global extractor instance
_extractor: Optional[EntityExtractor] = None


def get_extractor() -> EntityExtractor:
    """Get or create the global entity extractor"""
    global _extractor
    if _extractor is None:
        _extractor = EntityExtractor()
    return _extractor


def extract_entities(text: str) -> List[ExtractedEntity]:
    """Convenience function for extracting entities"""
    return get_extractor().extract_entities(text)


def extract_memories(text: str) -> List[ExtractedMemory]:
    """Convenience function for extracting memories"""
    return get_extractor().extract_memories(text)


def extract_all(text: str) -> Tuple[List[ExtractedEntity], List[ExtractedMemory]]:
    """Convenience function for extracting both entities and memories"""
    return get_extractor().extract_all(text)
