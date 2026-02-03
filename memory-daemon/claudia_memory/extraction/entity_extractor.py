"""
Entity extraction for Claudia Memory System

Extracts named entities (people, organizations, projects, locations) from text
using spaCy NLP and custom regex patterns.
"""

import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple

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
    attributes: Optional[Dict] = None  # Geography, industry, role, communities


@dataclass
class ExtractedAttributes:
    """Structured attributes extracted from text about an entity"""

    geography: Optional[Dict] = None  # {city, state, country}
    industries: Optional[List[str]] = None
    role: Optional[str] = None
    company: Optional[str] = None
    communities: Optional[List[str]] = None


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

    # Geography patterns for attribute extraction
    GEOGRAPHY_PATTERNS = [
        # "based in [City]", "from [City]", "lives in [City]"
        r"(?:based in|from|lives in|located in|residing in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
        # "[City], [State]" pattern
        r"\b([A-Z][a-z]+),\s*([A-Z]{2})\b",
        # "[City], [State/Country]" with full names
        r"\b([A-Z][a-z]+),\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b",
    ]

    # Major US cities for recognition
    MAJOR_CITIES = {
        "new york", "los angeles", "chicago", "houston", "phoenix",
        "philadelphia", "san antonio", "san diego", "dallas", "san jose",
        "austin", "jacksonville", "fort worth", "columbus", "charlotte",
        "san francisco", "indianapolis", "seattle", "denver", "boston",
        "el paso", "nashville", "detroit", "portland", "las vegas",
        "miami", "atlanta", "palm beach", "west palm beach", "tampa",
        "orlando", "sarasota", "naples", "fort lauderdale",
    }

    # US State abbreviations
    US_STATES = {
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
        "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
        "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
        "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
        "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
    }

    # Role patterns
    ROLE_PATTERNS = [
        # "CEO of", "founder of", "advisor to"
        r"\b(CEO|CFO|CTO|COO|CMO|CIO|VP|President|Director|Manager|Partner|Founder|Co-founder|Chairman|Board Member|Advisor|Consultant|Principal|Associate|Analyst|Engineer|Developer)\s*(?:of|at|for)?\b",
        # "works as [role]"
        r"(?:works as|serves as|role is|position is|title is)\s+(?:a\s+)?([A-Za-z\s]+?)(?:\s+at|\s+for|\.|,|$)",
    ]

    # Industry keywords
    INDUSTRY_KEYWORDS = {
        "real estate": ["real estate", "property", "housing", "commercial real estate", "residential", "realty"],
        "finance": ["finance", "investment", "banking", "financial", "hedge fund", "private equity", "venture capital", "vc"],
        "technology": ["technology", "tech", "software", "saas", "ai", "artificial intelligence", "machine learning", "startup"],
        "healthcare": ["healthcare", "health", "medical", "pharma", "pharmaceutical", "biotech", "hospital"],
        "consulting": ["consulting", "advisory", "strategy", "management consulting"],
        "legal": ["legal", "law", "attorney", "lawyer", "law firm"],
        "marketing": ["marketing", "advertising", "media", "digital marketing", "branding"],
        "retail": ["retail", "e-commerce", "ecommerce", "consumer goods"],
        "manufacturing": ["manufacturing", "industrial", "production"],
        "energy": ["energy", "oil", "gas", "renewable", "solar", "utilities"],
        "education": ["education", "edtech", "university", "school", "academic"],
        "hospitality": ["hospitality", "hotel", "restaurant", "food service"],
    }

    # Known communities and groups
    KNOWN_COMMUNITIES = {
        "ypo", "eo", "entrepreneurs organization", "vistage",
        "young presidents organization", "rotary", "lions club",
        "chamber of commerce", "bni", "business network international",
    }

    COMMUNITY_PATTERNS = [
        # "member of [Group]"
        r"(?:member of|part of|belongs to|joined|active in)\s+(?:the\s+)?([A-Za-z\s]+?)(?:\s+(?:chapter|group|club|organization|network))?(?:\.|,|$)",
        # "on the board of [Org]"
        r"(?:on the board of|board member of|serves on)\s+(?:the\s+)?([A-Za-z\s]+?)(?:\.|,|$)",
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

    def extract_attributes(self, text: str) -> ExtractedAttributes:
        """
        Extract structured attributes from text.

        Used to enrich entity profiles with geography, industry, role, and community data.

        Args:
            text: Text to extract attributes from

        Returns:
            ExtractedAttributes with populated fields
        """
        geography = self._extract_geography(text)
        industries = self._extract_industries(text)
        role = self._extract_role(text)
        company = self._extract_company(text)
        communities = self._extract_communities(text)

        return ExtractedAttributes(
            geography=geography,
            industries=industries if industries else None,
            role=role,
            company=company,
            communities=communities if communities else None,
        )

    def _extract_geography(self, text: str) -> Optional[Dict]:
        """Extract geography information from text."""
        text_lower = text.lower()

        # Check for major cities first
        for city in self.MAJOR_CITIES:
            if city in text_lower:
                # Try to find state
                city_title = city.title()
                state_match = re.search(
                    rf"{re.escape(city_title)},?\s*([A-Z]{{2}})\b",
                    text,
                    re.IGNORECASE,
                )
                if state_match:
                    state = state_match.group(1).upper()
                    if state in self.US_STATES:
                        return {"city": city_title, "state": state, "country": "US"}
                return {"city": city_title, "country": "US"}

        # Try explicit patterns
        for pattern in self.GEOGRAPHY_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                groups = match.groups()
                if len(groups) >= 2 and groups[1]:
                    city = groups[0].strip()
                    state_or_country = groups[1].strip()
                    if state_or_country.upper() in self.US_STATES:
                        return {"city": city, "state": state_or_country.upper(), "country": "US"}
                    return {"city": city, "state": state_or_country}
                elif groups[0]:
                    return {"city": groups[0].strip()}

        return None

    def _extract_industries(self, text: str) -> List[str]:
        """Extract industry keywords from text."""
        text_lower = text.lower()
        industries = []

        for industry, keywords in self.INDUSTRY_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text_lower:
                    if industry not in industries:
                        industries.append(industry)
                    break

        return industries

    def _extract_role(self, text: str) -> Optional[str]:
        """Extract professional role from text."""
        for pattern in self.ROLE_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                role = match.group(1).strip()
                if len(role) > 1 and role.lower() not in self.STOP_WORDS:
                    return role.title()
        return None

    def _extract_company(self, text: str) -> Optional[str]:
        """Extract company/organization from text."""
        # Look for "at [Company]", "works at [Company]", etc.
        company_patterns = [
            r"(?:works at|employed by|CEO of|founder of|partner at|director at)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)",
            r"\bat\s+([A-Z][A-Za-z]+(?:\s+(?:Inc|Corp|LLC|Ltd|Co|Company|Group|Partners))?\.?)\b",
        ]

        for pattern in company_patterns:
            match = re.search(pattern, text)
            if match:
                company = match.group(1).strip()
                if len(company) > 1 and company.lower() not in self.STOP_WORDS:
                    return company

        return None

    def _extract_communities(self, text: str) -> List[str]:
        """Extract community/group memberships from text."""
        text_lower = text.lower()
        communities = []

        # Check known communities
        for community in self.KNOWN_COMMUNITIES:
            if community in text_lower:
                # Normalize to title case
                communities.append(community.upper() if len(community) <= 3 else community.title())

        # Try patterns
        for pattern in self.COMMUNITY_PATTERNS:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                group_name = match.group(1).strip()
                if len(group_name) > 2 and group_name.lower() not in self.STOP_WORDS:
                    # Check it's not already captured
                    if group_name.lower() not in [c.lower() for c in communities]:
                        communities.append(group_name.title())

        return communities

    def extract_entity_with_attributes(self, text: str, entity_name: str) -> Tuple[Optional[ExtractedEntity], ExtractedAttributes]:
        """
        Extract a specific entity and its attributes from text.

        Useful for processing a person file where the entity name is known.

        Args:
            text: Text content (e.g., from a people/ file)
            entity_name: The known entity name

        Returns:
            Tuple of (ExtractedEntity or None, ExtractedAttributes)
        """
        canonical = self.canonical_name(entity_name)
        attributes = self.extract_attributes(text)

        # Create entity with attributes
        entity = ExtractedEntity(
            name=entity_name,
            type="person",  # Default, caller can override
            canonical_name=canonical,
            confidence=1.0,  # High confidence since name is known
            span=(0, 0),  # Not meaningful when name is provided
            attributes=attributes.__dict__ if attributes else None,
        )

        return entity, attributes


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


def extract_attributes(text: str) -> ExtractedAttributes:
    """Convenience function for extracting attributes from text"""
    return get_extractor().extract_attributes(text)


def extract_entity_with_attributes(text: str, entity_name: str) -> Tuple[Optional[ExtractedEntity], ExtractedAttributes]:
    """Convenience function for extracting a known entity with attributes"""
    return get_extractor().extract_entity_with_attributes(text, entity_name)
