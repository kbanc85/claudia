"""Tests for audit logging service"""

import json
import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from claudia_memory.database import Database
from claudia_memory.services.audit import AuditService


@pytest.fixture
def db():
    """Create a temporary test database"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()


@pytest.fixture
def audit_service(db):
    """Create an audit service with the test database"""
    svc = AuditService.__new__(AuditService)
    svc.db = db
    return svc


def test_log_operation_basic(audit_service, db):
    """Basic audit log entry is created correctly"""
    entry_id = audit_service.log(
        operation="entity_merge",
        details={"source_id": 1, "target_id": 2},
    )

    assert entry_id > 0

    row = db.get_one("audit_log", where="id = ?", where_params=(entry_id,))
    assert row is not None
    assert row["operation"] == "entity_merge"
    assert json.loads(row["details"]) == {"source_id": 1, "target_id": 2}


def test_log_operation_with_session_id(audit_service, db):
    """Audit log can include session ID"""
    entry_id = audit_service.log(
        operation="memory_correct",
        session_id="test-session-123",
    )

    row = db.get_one("audit_log", where="id = ?", where_params=(entry_id,))
    assert row["session_id"] == "test-session-123"


def test_log_operation_user_initiated(audit_service, db):
    """Audit log tracks user-initiated flag"""
    entry_id = audit_service.log(
        operation="entity_delete",
        user_initiated=True,
    )

    row = db.get_one("audit_log", where="id = ?", where_params=(entry_id,))
    assert row["user_initiated"] == 1


def test_log_operation_with_entity_id(audit_service, db):
    """Audit log can reference entity ID"""
    entry_id = audit_service.log(
        operation="entity_update",
        entity_id=42,
    )

    row = db.get_one("audit_log", where="id = ?", where_params=(entry_id,))
    assert row["entity_id"] == 42


def test_log_operation_with_memory_id(audit_service, db):
    """Audit log can reference memory ID"""
    entry_id = audit_service.log(
        operation="memory_invalidate",
        memory_id=99,
    )

    row = db.get_one("audit_log", where="id = ?", where_params=(entry_id,))
    assert row["memory_id"] == 99


def test_get_recent_returns_newest_first(audit_service):
    """Recent audit entries are returned newest first"""
    audit_service.log(operation="op1")
    audit_service.log(operation="op2")
    audit_service.log(operation="op3")

    recent = audit_service.get_recent(limit=3)

    assert len(recent) == 3
    assert recent[0]["operation"] == "op3"
    assert recent[1]["operation"] == "op2"
    assert recent[2]["operation"] == "op1"


def test_get_recent_filter_by_operation(audit_service):
    """Can filter audit entries by operation type"""
    audit_service.log(operation="entity_merge")
    audit_service.log(operation="memory_correct")
    audit_service.log(operation="entity_merge")

    merges = audit_service.get_recent(operation="entity_merge")

    assert len(merges) == 2
    assert all(e["operation"] == "entity_merge" for e in merges)


def test_get_recent_filter_by_entity(audit_service):
    """Can filter audit entries by entity ID"""
    audit_service.log(operation="op1", entity_id=1)
    audit_service.log(operation="op2", entity_id=2)
    audit_service.log(operation="op3", entity_id=1)

    entity_1_entries = audit_service.get_recent(entity_id=1)

    assert len(entity_1_entries) == 2
    assert all(e["entity_id"] == 1 for e in entity_1_entries)


def test_get_entity_history(audit_service):
    """Entity history returns entries in chronological order"""
    audit_service.log(operation="entity_create", entity_id=5)
    audit_service.log(operation="entity_update", entity_id=5)
    audit_service.log(operation="other", entity_id=99)  # Different entity
    audit_service.log(operation="entity_merge", entity_id=5)

    history = audit_service.get_entity_history(entity_id=5)

    assert len(history) == 3
    assert history[0]["operation"] == "entity_create"
    assert history[1]["operation"] == "entity_update"
    assert history[2]["operation"] == "entity_merge"


def test_get_memory_history(audit_service):
    """Memory history returns entries in chronological order"""
    audit_service.log(operation="memory_create", memory_id=10)
    audit_service.log(operation="memory_correct", memory_id=10)
    audit_service.log(operation="other", memory_id=99)  # Different memory
    audit_service.log(operation="memory_invalidate", memory_id=10)

    history = audit_service.get_memory_history(memory_id=10)

    assert len(history) == 3
    assert history[0]["operation"] == "memory_create"
    assert history[1]["operation"] == "memory_correct"
    assert history[2]["operation"] == "memory_invalidate"


def test_details_parsed_as_json(audit_service):
    """Details are properly serialized and deserialized"""
    complex_details = {
        "nested": {"key": "value"},
        "list": [1, 2, 3],
        "null": None,
    }

    entry_id = audit_service.log(
        operation="test",
        details=complex_details,
    )

    recent = audit_service.get_recent(limit=1)
    assert recent[0]["details"] == complex_details


def test_log_without_details(audit_service):
    """Audit log works without details"""
    entry_id = audit_service.log(operation="simple_op")

    recent = audit_service.get_recent(limit=1)
    assert recent[0]["operation"] == "simple_op"
    assert recent[0]["details"] is None
