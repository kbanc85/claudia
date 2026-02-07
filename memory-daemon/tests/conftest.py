"""Shared test fixtures for memory daemon tests."""

import tempfile
from pathlib import Path

import pytest

from claudia_memory.database import Database


@pytest.fixture
def db():
    """Create a temporary test database, initialized with full schema + migrations."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()
        yield database
        database.close()
