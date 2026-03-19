"""Tests for entity type inference from name keywords.

Fix 2 (Discussion #25): Entities default to type "person" regardless of
content. When no type is specified, _infer_entity_type should detect
organizational, project, concept, and location keywords in the name.
"""

from datetime import datetime

import pytest


class TestInferEntityType:
    """Unit tests for _infer_entity_type keyword detection."""

    def _infer(self, name):
        from claudia_memory.services.remember import _infer_entity_type
        return _infer_entity_type(name)

    # --- Organization keywords ---

    def test_inc_suffix(self):
        assert self._infer("Acme Inc") == "organization"

    def test_llc_suffix(self):
        assert self._infer("Smith & Partners LLC") == "organization"

    def test_corp_suffix(self):
        assert self._infer("Acme Corp") == "organization"

    def test_foundation(self):
        assert self._infer("Gates Foundation") == "organization"

    def test_university(self):
        assert self._infer("Stanford University") == "organization"

    def test_lab(self):
        assert self._infer("DeepMind Lab") == "organization"

    def test_ltd(self):
        assert self._infer("Acme Ltd") == "organization"

    def test_gmbh(self):
        assert self._infer("Siemens GmbH") == "organization"

    # --- Project keywords ---

    def test_project_prefix(self):
        assert self._infer("Project Alpha") == "project"

    def test_sprint_keyword(self):
        assert self._infer("Sprint 42") == "project"

    def test_mvp_keyword(self):
        assert self._infer("MVP Launch") == "project"

    # --- Concept keywords ---

    def test_methodology(self):
        assert self._infer("Agile Methodology") == "concept"

    def test_framework(self):
        assert self._infer("React Framework") == "concept"

    # --- Location keywords ---

    def test_office(self):
        assert self._infer("New York Office") == "location"

    def test_hq(self):
        assert self._infer("Company HQ") == "location"

    # --- Person fallback ---

    def test_plain_name_is_person(self):
        assert self._infer("Sarah Johnson") == "person"

    def test_single_name_is_person(self):
        assert self._infer("Kamil") == "person"


class TestInferEntityTypeCaseInsensitive:
    """Keyword matching should be case-insensitive."""

    def _infer(self, name):
        from claudia_memory.services.remember import _infer_entity_type
        return _infer_entity_type(name)

    def test_lowercase_inc(self):
        assert self._infer("acme inc") == "organization"

    def test_uppercase_project(self):
        assert self._infer("PROJECT PHOENIX") == "project"

    def test_mixed_case_university(self):
        assert self._infer("harvard UNIVERSITY") == "organization"


class TestEntityTypeInferenceIntegration:
    """Integration: remember_entity with empty type uses inference."""

    def _get_remember_service(self, db):
        from claudia_memory.services.remember import RememberService
        svc = RememberService.__new__(RememberService)
        svc.db = db
        svc._embedder = None
        from claudia_memory.extraction.entity_extractor import get_extractor
        svc.extractor = get_extractor()
        svc.embedding_service = None
        return svc

    def test_remember_entity_infers_org(self, db):
        """remember_entity with empty type infers 'organization' for 'Acme Inc'."""
        svc = self._get_remember_service(db)
        entity_id = svc.remember_entity("Acme Inc", entity_type="")

        entity = db.get_one("entities", where="id = ?", where_params=(entity_id,))
        assert entity["type"] == "organization"

    def test_remember_entity_infers_project(self, db):
        """remember_entity with empty type infers 'project' for 'Project Phoenix'."""
        svc = self._get_remember_service(db)
        entity_id = svc.remember_entity("Project Phoenix", entity_type="")

        entity = db.get_one("entities", where="id = ?", where_params=(entity_id,))
        assert entity["type"] == "project"

    def test_explicit_type_not_overridden(self, db):
        """Explicitly passed type is never overridden by inference."""
        svc = self._get_remember_service(db)
        entity_id = svc.remember_entity("Acme Inc", entity_type="concept")

        entity = db.get_one("entities", where="id = ?", where_params=(entity_id,))
        assert entity["type"] == "concept"

    def test_existing_entity_keeps_type(self, db):
        """Existing entities found by name keep their original type."""
        svc = self._get_remember_service(db)
        # Create with explicit type
        first_id = svc.remember_entity("Acme Inc", entity_type="organization")
        # Call again with empty type -- should find existing, not re-infer
        second_id = svc.remember_entity("Acme Inc", entity_type="")

        assert first_id == second_id
        entity = db.get_one("entities", where="id = ?", where_params=(first_id,))
        assert entity["type"] == "organization"

    def test_find_or_create_uses_inference(self, db):
        """_find_or_create_entity with empty type uses inference for new entities."""
        svc = self._get_remember_service(db)
        entity_id = svc._find_or_create_entity("Stanford University", entity_type="")

        entity = db.get_one("entities", where="id = ?", where_params=(entity_id,))
        assert entity["type"] == "organization"
