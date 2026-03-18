"""Tests for expanded STOP_WORDS and person min-word-count guard.

Verifies that common English words spaCy misidentifies as entities
are blocked by STOP_WORDS, and single-word regex person entities
are rejected.
"""

import pytest

from claudia_memory.extraction.entity_extractor import EntityExtractor


class TestExpandedStopWords:
    """Tests for the expanded STOP_WORDS set."""

    def test_drawn_not_extracted(self):
        """'drawn' is not extracted as an entity."""
        extractor = EntityExtractor()
        entities = extractor.extract_entities("He had drawn a picture of the landscape")
        names = [e.canonical_name for e in entities]
        assert "drawn" not in names

    def test_overall_not_extracted(self):
        """'overall' is not extracted as an entity."""
        extractor = EntityExtractor()
        entities = extractor.extract_entities("The overall result was good")
        names = [e.canonical_name for e in entities]
        assert "overall" not in names

    def test_recently_not_extracted(self):
        """'recently' is not extracted as an entity."""
        extractor = EntityExtractor()
        entities = extractor.extract_entities("I recently finished the project")
        names = [e.canonical_name for e in entities]
        assert "recently" not in names

    def test_several_not_extracted(self):
        """'several' is not extracted as an entity."""
        extractor = EntityExtractor()
        entities = extractor.extract_entities("Several people attended the meeting")
        names = [e.canonical_name for e in entities]
        assert "several" not in names

    def test_common_words_in_stopwords(self):
        """All the newly added stop words are in the STOP_WORDS set."""
        new_words = {
            "drawn", "overall", "recently", "several", "various",
            "another", "certain", "likely", "quite", "rather",
            "somewhat", "perhaps", "nearly", "almost", "already",
            "enough", "much", "many", "some", "most",
            "both", "each", "every", "other", "such",
            "same", "done", "made", "said", "went",
            "got", "set", "put", "run", "let",
            "get", "new", "old", "big", "long",
            "last", "next", "good", "well", "nice",
            "work", "part", "plan", "team", "data",
            "note", "time", "home", "call", "open",
        }
        assert new_words.issubset(EntityExtractor.STOP_WORDS)


class TestPersonMinWordCount:
    """Tests for minimum word count on regex-extracted person entities."""

    def test_single_word_person_rejected(self):
        """Single-word regex person entity like 'Metal' is rejected."""
        extractor = EntityExtractor()
        # Use regex extraction directly to test the filter
        entities = extractor._extract_with_regex("meeting with Metal about the deal")
        person_entities = [e for e in entities if e.type == "person"]
        person_names = [e.canonical_name for e in person_entities]
        assert "metal" not in person_names

    def test_two_word_person_accepted(self):
        """Two-word person 'Sarah Chen' is accepted."""
        extractor = EntityExtractor()
        entities = extractor._extract_with_regex("meeting with Sarah Chen about the deal")
        person_entities = [e for e in entities if e.type == "person"]
        person_names = [e.canonical_name for e in person_entities]
        assert "sarah chen" in person_names

    def test_spacy_single_word_org_allowed(self):
        """spaCy-identified single-word org like 'Apple' is still allowed."""
        extractor = EntityExtractor()
        # spaCy entities go through extract_entities, not _extract_with_regex
        # The min-word-count only applies to regex person extraction
        # This test verifies the STOP_WORDS don't block real company names
        assert "apple" not in EntityExtractor.STOP_WORDS
