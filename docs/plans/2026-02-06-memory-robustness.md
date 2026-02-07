# Memory System Robustness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken components, remove premature features, add observability and integration testing to make the memory daemon reliable for all users.

**Architecture:** The memory daemon has 8 scheduled jobs (3 broken, 2 unknown), 34+ MCP tools (some for features that never worked), and a migration integrity gap that causes hourly crashes. This plan fixes the integrity gap, slims the scheduler from 8 jobs to 3, removes 3 MCP tools for deferred features, enhances the health check with real diagnostics, and adds a pipeline integration test. No features that currently work are removed.

**Tech Stack:** Python 3.10+, SQLite, pytest (asyncio_mode=auto), APScheduler

---

## Context for the Implementing Engineer

### Repository layout
- Memory daemon source: `memory-daemon/claudia_memory/`
- Tests: `memory-daemon/tests/` (26 files, no shared conftest.py)
- Template (Claudia's personality/skills): `template-v2/`

### Key files you will modify
| File | What it does |
|------|-------------|
| `claudia_memory/database.py` | SQLite init, migrations v2-v14, integrity checks |
| `claudia_memory/daemon/scheduler.py` | APScheduler job registration (8 jobs currently) |
| `claudia_memory/daemon/health.py` | HTTP health check server on port 3848 |
| `claudia_memory/mcp/server.py` | MCP tool definitions + handlers (34+ tools) |
| `claudia_memory/services/consolidate.py` | Decay, patterns, predictions, merging |

### Running tests
```bash
cd memory-daemon
python3 -m pytest tests/ -v
```
Use `python3` not `python`. pytest asyncio_mode is `auto` (in pyproject.toml), so async tests do not need decorators.

### What NOT to touch
- `claudia_memory/services/verify.py` - Keep the code, just stop scheduling it
- `claudia_memory/services/metrics.py` - Keep the code, just stop scheduling it
- `claudia_memory/services/documents.py` - Keep lifecycle_maintenance(), just stop scheduling it
- All existing test files - They should continue to pass unchanged

---

## Task 1: Create shared test conftest.py

The same `db` fixture is copy-pasted across 12+ test files. Extract it to a shared conftest.py so all tests use one consistent database setup.

**Files:**
- Create: `memory-daemon/tests/conftest.py`

**Step 1: Write conftest.py**

```python
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
```

**Step 2: Run all tests to verify nothing breaks**

```bash
cd memory-daemon && python3 -m pytest tests/ -v
```

Expected: All existing tests pass. The local `db` fixtures in individual test files take precedence over conftest.py (pytest scoping rules), so no conflicts.

**Step 3: Commit**

```bash
git add tests/conftest.py
git commit -m "test: add shared conftest.py with db fixture"
```

---

## Task 2: Fix migration integrity check for verification_status

The `_check_migration_integrity()` method in `database.py` (line 806) checks migrations 8, 10, 12, 13, 14 but NOT migration 5. If migration 5 failed silently (which it did on the author's live DB), the `verification_status` column is missing and `verify.py` crashes every hour querying it.

The fix: add a check for migration 5 columns. If missing, return version 4 so migration 5 re-runs on next daemon startup.

**Files:**
- Modify: `memory-daemon/claudia_memory/database.py:806-857`
- Test: `memory-daemon/tests/test_database.py`

**Step 1: Write the failing test**

Add to the bottom of `memory-daemon/tests/test_database.py`:

```python
def test_migration_integrity_detects_missing_verification_status():
    """Migration 5 added verification_status. Integrity check should catch if it is missing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        database = Database(db_path)
        database.initialize()

        conn = database._get_connection()

        # Simulate a DB where migration 5 column is missing
        # Create a new table without verification_status, copy data, swap
        conn.execute("ALTER TABLE memories RENAME TO memories_old")
        # Get columns excluding verification_status and verified_at
        cols = database._get_table_columns(conn, "memories_old")
        cols.discard("verification_status")
        cols.discard("verified_at")
        col_list = ", ".join(sorted(cols))

        # Create memories table without verification columns
        conn.execute(f"""
            CREATE TABLE memories AS
            SELECT {col_list} FROM memories_old WHERE 0
        """)
        conn.execute("DROP TABLE memories_old")
        conn.commit()

        # Integrity check should detect the missing column
        effective_version = database._check_migration_integrity(conn)
        assert effective_version is not None, "Should detect missing verification_status"
        assert effective_version <= 4, f"Should return version <= 4 to re-run migration 5, got {effective_version}"

        database.close()
```

Note: You may need to add `import tempfile` and `from pathlib import Path` at the top of `test_database.py` if not already present. `from claudia_memory.database import Database` should already be there.

**Step 2: Run the test to verify it fails**

```bash
cd memory-daemon && python3 -m pytest tests/test_database.py::test_migration_integrity_detects_missing_verification_status -v
```

Expected: FAIL because `_check_migration_integrity()` does not check for verification_status yet.

**Step 3: Add the integrity check**

In `memory-daemon/claudia_memory/database.py`, in the `_check_migration_integrity` method, add the migration 5 check BEFORE the existing migration 8 check (before line 813). The method should now start:

```python
    def _check_migration_integrity(self, conn: sqlite3.Connection) -> Optional[int]:
        """Check if migrations completed properly by verifying expected columns exist.

        Returns the effective schema version based on what actually exists,
        which may be lower than what schema_migrations claims.
        Returns None if all migrations completed properly.
        """
        # Migration 5 added verification_status, verified_at to memories
        memory_cols = self._get_table_columns(conn, "memories")
        if "verification_status" not in memory_cols or "verified_at" not in memory_cols:
            logger.warning("Migration 5 incomplete: memories missing verification columns")
            return 4  # Force re-run from migration 5

        # Migration 8 added valid_at, invalid_at to relationships
        rel_cols = self._get_table_columns(conn, "relationships")
```

Note: The existing code at line 837 also calls `self._get_table_columns(conn, "memories")` for migration 12 checks. After this change, that call can reuse the `memory_cols` variable from above instead of calling `_get_table_columns` again. Replace line 837 `memory_cols = self._get_table_columns(conn, "memories")` since the variable is already defined earlier.

**Step 4: Run test to verify it passes**

```bash
cd memory-daemon && python3 -m pytest tests/test_database.py::test_migration_integrity_detects_missing_verification_status -v
```

Expected: PASS

**Step 5: Run all tests**

```bash
cd memory-daemon && python3 -m pytest tests/ -v
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add claudia_memory/database.py tests/test_database.py
git commit -m "fix(memory): add migration 5 integrity check for verification_status column"
```

---

## Task 3: Slim the scheduler

Remove 5 scheduled jobs that are either broken, premature, or not earning their complexity. Change decay from hourly to daily. Keep pattern detection and full consolidation (minus predictions).

### Jobs to REMOVE:
| Job | Why |
|-----|-----|
| `memory_verification` (hourly) | Crashes on missing column; replaced by integrity check fix + future write-time checks |
| `daily_predictions` (6 AM) | Never generated a single prediction; deferred |
| `llm_consolidation` (3:30 AM) | Requires local Ollama LLM most users will not have; deferred |
| `daily_metrics` (5 AM) | Collects data nobody reads; no dashboard or alerting |
| `document_lifecycle` (Sunday 4 AM) | 4 documents do not need lifecycle management |

### Jobs to KEEP (modified):
| Job | Schedule | Change |
|-----|----------|--------|
| `daily_decay` | Daily at 2 AM | Was hourly, now daily (same effect, 24x fewer runs) |
| `pattern_detection` | Every 6 hours | Unchanged |
| `full_consolidation` | Daily at 3 AM | Remove `generate_predictions()` call from consolidation |

**Files:**
- Modify: `memory-daemon/claudia_memory/daemon/scheduler.py:36-218`
- Modify: `memory-daemon/claudia_memory/services/consolidate.py:1580-1624`
- Test: `memory-daemon/tests/test_scheduler.py` (new file)

**Step 1: Write the failing test**

Create `memory-daemon/tests/test_scheduler.py`:

```python
"""Tests for the memory scheduler configuration."""

from unittest.mock import patch

from claudia_memory.daemon.scheduler import MemoryScheduler


def test_scheduler_registers_exactly_three_jobs():
    """Scheduler should only register decay, pattern detection, and full consolidation."""
    scheduler = MemoryScheduler()

    with patch.object(scheduler.scheduler, "start"):
        scheduler.start()

    jobs = scheduler.scheduler.get_jobs()
    job_ids = {job.id for job in jobs}

    assert job_ids == {"daily_decay", "pattern_detection", "full_consolidation"}, (
        f"Expected exactly 3 jobs, got: {job_ids}"
    )


def test_scheduler_does_not_register_removed_jobs():
    """Verify removed jobs are not registered."""
    scheduler = MemoryScheduler()

    with patch.object(scheduler.scheduler, "start"):
        scheduler.start()

    job_ids = {job.id for job in scheduler.scheduler.get_jobs()}

    removed_jobs = {
        "hourly_decay",
        "daily_predictions",
        "memory_verification",
        "llm_consolidation",
        "daily_metrics",
        "document_lifecycle",
    }
    assert job_ids.isdisjoint(removed_jobs), (
        f"Found removed jobs still registered: {job_ids & removed_jobs}"
    )


def test_decay_is_daily_not_hourly():
    """Decay should run daily at 2 AM, not hourly."""
    scheduler = MemoryScheduler()

    with patch.object(scheduler.scheduler, "start"):
        scheduler.start()

    decay_job = scheduler.scheduler.get_job("daily_decay")
    assert decay_job is not None, "daily_decay job should exist"
    # CronTrigger for daily at 2 AM
    trigger = decay_job.trigger
    # Check it is a CronTrigger (not IntervalTrigger)
    assert type(trigger).__name__ == "CronTrigger", (
        f"Expected CronTrigger, got {type(trigger).__name__}"
    )
```

**Step 2: Run test to verify it fails**

```bash
cd memory-daemon && python3 -m pytest tests/test_scheduler.py -v
```

Expected: FAIL (scheduler currently registers 8 jobs, test expects 3)

**Step 3: Modify the scheduler**

Replace the `start()` method and remove unused handler methods in `memory-daemon/claudia_memory/daemon/scheduler.py`.

The new `start()` method (replacing lines 36-116):

```python
    def start(self) -> None:
        """Start the scheduler with all jobs"""
        if self._started:
            logger.warning("Scheduler already started")
            return

        # Daily at 2am: Importance decay
        self.scheduler.add_job(
            self._run_daily_decay,
            CronTrigger(hour=2, minute=0),
            id="daily_decay",
            name="Daily importance decay",
            replace_existing=True,
        )

        # Every 6 hours: Pattern detection
        self.scheduler.add_job(
            self._run_pattern_detection,
            IntervalTrigger(hours=self.config.consolidation_interval_hours),
            id="pattern_detection",
            name="Pattern detection",
            replace_existing=True,
        )

        # Daily at 3am: Full consolidation (decay + merge + patterns)
        self.scheduler.add_job(
            self._run_full_consolidation,
            CronTrigger(hour=3, minute=0),
            id="full_consolidation",
            name="Full overnight consolidation",
            replace_existing=True,
        )

        self.scheduler.start()
        self._started = True
        logger.info("Memory scheduler started with 3 jobs: decay, patterns, consolidation")
```

Replace the handler methods section (lines 141-218) with just the 3 active handlers:

```python
    def _run_daily_decay(self) -> None:
        """Run importance decay once per day"""
        try:
            logger.debug("Running daily decay")
            result = run_decay()
            logger.debug(f"Daily decay complete: {result}")
        except Exception as e:
            logger.exception("Error in daily decay")

    def _run_pattern_detection(self) -> None:
        """Run pattern detection"""
        try:
            logger.debug("Running pattern detection")
            patterns = detect_patterns()
            logger.info(f"Pattern detection complete: {len(patterns)} patterns detected")
        except Exception as e:
            logger.exception("Error in pattern detection")

    def _run_full_consolidation(self) -> None:
        """Run full overnight consolidation"""
        try:
            logger.info("Running full consolidation")
            result = run_full_consolidation()
            logger.info(f"Full consolidation complete: {result}")
        except Exception as e:
            logger.exception("Error in full consolidation")
```

Also clean up the imports at the top of scheduler.py. Remove unused imports for verify and documents if they are imported at module level. Check the top of the file -- the handlers for the removed jobs used lazy imports (e.g. `from ..services.consolidate import get_consolidate_service` inside the handler body), so the module-level imports may only include `run_verification` from verify.py. Remove that import.

**Step 4: Remove predictions from full consolidation**

In `memory-daemon/claudia_memory/services/consolidate.py`, modify `run_full_consolidation()` (line 1580-1624). Remove the prediction generation phase (lines 1616-1621).

Replace the current Phase 3 block (lines 1608-1621) with just pattern detection:

```python
        # Phase 3: Detection (read-heavy, writes new pattern rows)
        try:
            patterns = self.detect_patterns()
            results["patterns_detected"] = len(patterns)
        except Exception as e:
            logger.warning(f"Pattern detection failed: {e}")
            results["patterns_detected"] = 0

        logger.info(f"Consolidation complete: {results}")
        return results
```

This removes the `generate_predictions()` call while keeping `detect_patterns()`.

**Step 5: Run scheduler tests**

```bash
cd memory-daemon && python3 -m pytest tests/test_scheduler.py -v
```

Expected: PASS

**Step 6: Run all tests**

```bash
cd memory-daemon && python3 -m pytest tests/ -v
```

Expected: All tests pass. Existing tests for verify.py, metrics.py, prediction_feedback.py should still pass because they test the service code directly, not through the scheduler.

**Step 7: Commit**

```bash
git add claudia_memory/daemon/scheduler.py claudia_memory/services/consolidate.py tests/test_scheduler.py
git commit -m "refactor(memory): slim scheduler from 8 jobs to 3, defer premature features

Remove scheduled jobs for: verification (crashes hourly), predictions (never
generated), LLM consolidation (requires local LLM), metrics (no consumer),
document lifecycle (4 documents). Change decay from hourly to daily at 2 AM.
Keep: pattern detection (6h), full consolidation (3 AM). Service code retained
for future re-enablement."
```

---

## Task 4: Remove deferred MCP tools

Remove 3 MCP tools for features that have been deferred: `memory.predictions`, `memory.prediction_feedback`, `memory.agent_dispatch`. Update `memory.consolidate` description.

**Files:**
- Modify: `memory-daemon/claudia_memory/mcp/server.py`

**Step 1: Remove tool definitions from list_tools()**

In `server.py`, remove these Tool() entries from the `list_tools()` function:

1. `memory.predictions` (lines 247-265) - Remove the entire Tool() block
2. `memory.prediction_feedback` (lines 722-739) - Remove the entire Tool() block
3. `memory.agent_dispatch` (lines 1127-1175) - Remove the entire Tool() block

Update `memory.consolidate` description (line 268):
```python
        Tool(
            name="memory.consolidate",
            description="Manually trigger memory consolidation (decay, merging, pattern detection). Usually runs automatically at 3 AM.",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
```

**Step 2: Remove tool handlers from call_tool()**

In the `call_tool()` function, remove these handler blocks:

1. `memory.predictions` handler (lines 1368-1381) - Remove the entire `elif` block
2. `memory.prediction_feedback` handler (lines 1764-1777) - Remove the entire `elif` block
3. `memory.agent_dispatch` handler (lines 2018-2045) - Remove the entire `elif` block

**Step 3: Run all tests**

```bash
cd memory-daemon && python3 -m pytest tests/ -v
```

Expected: All tests pass. The test files `test_prediction_feedback.py` and `test_metrics.py` test the service layer directly, not through MCP tools.

**Step 4: Commit**

```bash
git add claudia_memory/mcp/server.py
git commit -m "refactor(memory): remove deferred MCP tools (predictions, agent_dispatch)

Remove memory.predictions, memory.prediction_feedback, memory.agent_dispatch
tools. These features are deferred until core data pipeline is reliable.
Service code retained in consolidate.py for future re-enablement."
```

---

## Task 5: Enhance /status health check

The current `/status` endpoint returns basic component status (database: ok, embeddings: ok, scheduler: running). Enhance it with actionable diagnostics: schema version, last consolidation, active job list, embedding model status.

Also create the `memory.system_health` MCP tool that was documented but never implemented.

**Files:**
- Modify: `memory-daemon/claudia_memory/daemon/health.py:56-93`
- Modify: `memory-daemon/claudia_memory/mcp/server.py` (add tool)
- Test: `memory-daemon/tests/test_health.py` (new file)

**Step 1: Write the failing test**

Create `memory-daemon/tests/test_health.py`:

```python
"""Tests for the health check diagnostics."""

import json
import tempfile
from pathlib import Path

from claudia_memory.database import Database
from claudia_memory.daemon.health import build_status_report


def test_status_report_includes_schema_version(db):
    """Status report should include the current schema migration version."""
    report = build_status_report()
    assert "schema_version" in report, "Status should include schema_version"
    assert isinstance(report["schema_version"], int)


def test_status_report_includes_components(db):
    """Status report should include component health checks."""
    report = build_status_report()
    assert "components" in report
    assert "database" in report["components"]


def test_status_report_includes_job_list(db):
    """Status report should list active scheduled jobs."""
    report = build_status_report()
    assert "scheduled_jobs" in report
    assert isinstance(report["scheduled_jobs"], list)


def test_status_report_includes_counts(db):
    """Status report should include memory/entity counts."""
    report = build_status_report()
    assert "counts" in report
    assert "memories" in report["counts"]
    assert "entities" in report["counts"]
```

Note: these tests use the shared `db` fixture from conftest.py (Task 1).

**Step 2: Run test to verify it fails**

```bash
cd memory-daemon && python3 -m pytest tests/test_health.py -v
```

Expected: FAIL because `build_status_report` does not exist yet.

**Step 3: Implement build_status_report()**

In `memory-daemon/claudia_memory/daemon/health.py`, add this function before the `HealthCheckHandler` class:

```python
def build_status_report() -> dict:
    """Build a comprehensive status report for the memory system.

    Returns a dict with schema version, component health, job list, and counts.
    Used by both the HTTP /status endpoint and the MCP system_health tool.
    """
    report = {
        "timestamp": datetime.utcnow().isoformat(),
        "status": "healthy",
        "schema_version": 0,
        "components": {},
        "scheduled_jobs": [],
        "counts": {},
    }

    # Database check + schema version
    try:
        db = get_db()
        db.execute("SELECT 1", fetch=True)
        report["components"]["database"] = "ok"

        # Schema version
        try:
            rows = db.execute(
                "SELECT MAX(version) as v FROM schema_migrations", fetch=True
            )
            report["schema_version"] = rows[0]["v"] if rows and rows[0]["v"] else 0
        except Exception:
            report["schema_version"] = 0

        # Counts
        for table, query in [
            ("memories", "SELECT COUNT(*) as c FROM memories"),
            ("entities", "SELECT COUNT(*) as c FROM entities WHERE deleted_at IS NULL"),
            ("relationships", "SELECT COUNT(*) as c FROM relationships"),
            ("episodes", "SELECT COUNT(*) as c FROM episodes"),
            ("patterns", "SELECT COUNT(*) as c FROM patterns WHERE is_active = 1"),
            ("reflections", "SELECT COUNT(*) as c FROM reflections"),
        ]:
            try:
                rows = db.execute(query, fetch=True)
                report["counts"][table] = rows[0]["c"] if rows else 0
            except Exception:
                report["counts"][table] = -1  # Table may not exist

    except Exception:
        report["components"]["database"] = "error"
        report["status"] = "degraded"

    # Embeddings check
    try:
        embeddings = get_embedding_service()
        is_available = embeddings.is_available_sync()
        report["components"]["embeddings"] = "ok" if is_available else "unavailable"
        report["components"]["embedding_model"] = getattr(
            embeddings, "model", "unknown"
        )
    except Exception:
        report["components"]["embeddings"] = "error"

    # Scheduler check
    try:
        scheduler = get_scheduler()
        is_running = scheduler.is_running()
        report["components"]["scheduler"] = "running" if is_running else "stopped"
        if is_running:
            report["scheduled_jobs"] = [
                {"id": job.id, "name": job.name, "next_run": str(job.next_run_time)}
                for job in scheduler.get_jobs()
            ]
        if not is_running:
            report["status"] = "degraded"
    except Exception:
        report["components"]["scheduler"] = "error"

    return report
```

**Step 4: Update _send_status_response to use build_status_report**

Replace `_send_status_response` in the `HealthCheckHandler` class (lines 56-93):

```python
    def _send_status_response(self):
        """Send detailed status response"""
        try:
            status = build_status_report()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(status).encode())
        except Exception as e:
            logger.exception("Error in status check")
            self.send_error(500, str(e))
```

**Step 5: Add memory.system_health MCP tool**

In `memory-daemon/claudia_memory/mcp/server.py`:

Add to `list_tools()` (in the tools list, before the closing `]`):

```python
        Tool(
            name="memory.system_health",
            description=(
                "Get comprehensive system health: schema version, component status, "
                "scheduled job list, and memory/entity counts. Use this to diagnose "
                "issues or verify the memory system is working correctly."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
```

Add to `call_tool()` (before the final `else` clause that handles unknown tools):

```python
        elif name == "memory.system_health":
            from ..daemon.health import build_status_report
            report = build_status_report()
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(report, indent=2),
                    )
                ]
            )
```

**Step 6: Run tests**

```bash
cd memory-daemon && python3 -m pytest tests/test_health.py -v
```

Expected: PASS

```bash
cd memory-daemon && python3 -m pytest tests/ -v
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add claudia_memory/daemon/health.py claudia_memory/mcp/server.py tests/test_health.py
git commit -m "feat(memory): enhanced health check with schema version, jobs, and counts

Add build_status_report() for comprehensive diagnostics. Implement
memory.system_health MCP tool (was documented but never created).
/status endpoint now shows schema version, active jobs, and data counts."
```

---

## Task 6: Create pipeline integration test

This is the most important test in the plan. It verifies the complete data pipeline: store entities and facts, create relationships, run decay, detect patterns, and verify everything is retrievable.

If this test passes, the core system works end-to-end.

**Files:**
- Create: `memory-daemon/tests/test_pipeline.py`

**Step 1: Write the integration test**

Create `memory-daemon/tests/test_pipeline.py`:

```python
"""End-to-end pipeline integration test.

Tests the complete data flow: entities -> memories -> relationships ->
decay -> pattern detection -> retrieval. If this test passes, the core
memory system works.
"""

import tempfile
from pathlib import Path

import pytest

from claudia_memory.database import Database
from claudia_memory.services.remember import RememberService
from claudia_memory.services.recall import RecallService
from claudia_memory.services.consolidate import ConsolidateService


@pytest.fixture
def services():
    """Create a full service stack with a temporary database."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        db = Database(db_path)
        db.initialize()

        remember = RememberService()
        remember.db = db
        recall = RecallService()
        recall.db = db
        consolidate = ConsolidateService()
        consolidate.db = db

        yield {"db": db, "remember": remember, "recall": recall, "consolidate": consolidate}
        db.close()


class TestCorePipeline:
    """Test the complete data pipeline end-to-end."""

    def test_entity_creation_and_retrieval(self, services):
        """Entities created via remember should be retrievable."""
        svc = services["remember"]
        entity_id = svc.remember_entity(
            name="Sarah Chen",
            entity_type="person",
            description="VP of Engineering at Acme Corp",
        )
        assert entity_id is not None

        # Retrieve via recall
        result = services["recall"].recall_about("Sarah Chen")
        assert result is not None

    def test_memory_storage_and_search(self, services):
        """Memories stored via remember should be searchable."""
        svc = services["remember"]

        # Store a fact
        memory_id = svc.remember_fact(
            content="Sarah Chen is leading the Q1 platform migration project",
            memory_type="fact",
            importance=0.9,
            about_entities=["Sarah Chen"],
        )
        assert memory_id is not None

        # Search for it
        results = services["recall"].recall("platform migration")
        assert len(results) > 0

    def test_relationship_creation(self, services):
        """Relationships between entities should be storable and retrievable."""
        svc = services["remember"]

        # Create two entities
        svc.remember_entity(name="Sarah Chen", entity_type="person")
        svc.remember_entity(name="Acme Corp", entity_type="organization")

        # Relate them
        rel_id = svc.relate_entities(
            source_name="Sarah Chen",
            target_name="Acme Corp",
            relationship="works_at",
            strength=0.9,
        )
        assert rel_id is not None

    def test_decay_reduces_importance(self, services):
        """Decay should reduce importance scores over time."""
        svc = services["remember"]
        db = services["db"]

        # Store a memory with known importance
        memory_id = svc.remember_fact(
            content="Test decay fact",
            memory_type="fact",
            importance=1.0,
        )

        # Get initial importance
        row = db.get_one("memories", where="id = ?", where_params=(memory_id,))
        initial_importance = row["importance"]

        # Run decay
        services["consolidate"].run_decay()

        # Check importance decreased
        row = db.get_one("memories", where="id = ?", where_params=(memory_id,))
        assert row["importance"] < initial_importance, "Decay should reduce importance"

    def test_pattern_detection_runs_without_crashing(self, services):
        """Pattern detection should work without errors."""
        svc = services["remember"]

        # Create entities and relationships to give detection something to work with
        svc.remember_entity(name="Alice", entity_type="person")
        svc.remember_entity(name="Bob", entity_type="person")
        svc.relate_entities(
            source_name="Alice",
            target_name="Bob",
            relationship="collaborates_with",
            strength=0.8,
        )

        # Pattern detection should not crash
        patterns = services["consolidate"].detect_patterns()
        assert isinstance(patterns, list)

    def test_full_consolidation_completes(self, services):
        """Full consolidation should complete without errors."""
        svc = services["remember"]

        # Add some data
        svc.remember_entity(name="Test Person", entity_type="person")
        svc.remember_fact(
            content="Test fact for consolidation",
            memory_type="fact",
            importance=0.8,
        )

        # Run full consolidation - should not raise
        result = services["consolidate"].run_full_consolidation()
        assert "decay" in result
        assert "patterns_detected" in result
        # Predictions should NOT be in result (deferred)
        assert "predictions_generated" not in result

    def test_session_lifecycle(self, services):
        """Session end should create a summarized episode."""
        svc = services["remember"]

        # End a session with structured data
        result = svc.end_session(
            narrative="Discussed Q1 roadmap with Sarah Chen. She is concerned about timeline.",
            facts=[
                {
                    "content": "Q1 roadmap timeline is at risk",
                    "type": "fact",
                    "importance": 0.8,
                }
            ],
            entities=[
                {"name": "Sarah Chen", "type": "person", "description": "VP Engineering"},
            ],
            relationships=[
                {
                    "source": "Sarah Chen",
                    "target": "Q1 Roadmap",
                    "relationship": "responsible_for",
                },
            ],
        )
        assert result is not None

    def test_deduplication_prevents_duplicates(self, services):
        """Storing the same content twice should not create duplicates."""
        svc = services["remember"]

        id1 = svc.remember_fact(
            content="Sarah Chen works at Acme Corp",
            memory_type="fact",
            importance=0.9,
        )
        id2 = svc.remember_fact(
            content="Sarah Chen works at Acme Corp",
            memory_type="fact",
            importance=0.9,
        )

        # Should return the same ID (dedup by content hash)
        assert id1 == id2
```

**Step 2: Run the integration test**

```bash
cd memory-daemon && python3 -m pytest tests/test_pipeline.py -v
```

Expected: All tests PASS. These test the currently-working parts of the system. If any fail, it reveals a real bug that needs fixing.

**Step 3: Commit**

```bash
git add tests/test_pipeline.py
git commit -m "test(memory): add end-to-end pipeline integration test

Tests complete data flow: entity creation, memory storage, relationships,
decay, pattern detection, session lifecycle, and deduplication. If this
test passes, the core memory system works."
```

---

## Task 7: Update template references

The template files reference tools we have removed. Update them to avoid confusing Claudia (and users).

**Files:**
- Modify: `template-v2/.claude/skills/memory-manager.md` (remove references to memory.predictions, memory.prediction_feedback, memory.agent_dispatch)
- Modify: `template-v2/CLAUDE.md` (update tool list if predictions/agent_dispatch are mentioned)

**Step 1: Search for references to removed tools**

Search for `memory.predictions`, `memory.prediction_feedback`, `memory.agent_dispatch` in template-v2/. These references should be removed or updated.

In `memory-manager.md`:
- Remove `memory.predictions` from the tool reference section
- Remove `memory.prediction_feedback` from the tool reference section
- Remove `memory.agent_dispatch` from the tool reference section
- Remove any workflow sections that instruct Claudia to call `memory.predictions` at session start
- The `memory.morning_context` and `memory.briefing` tools still exist and provide session-start context without predictions

In the main `CLAUDE.md` (inside `claudia/` not `template-v2/`):
- Update the MCP tools list to remove: `memory.predictions`, `memory.prediction_feedback`, `memory.agent_dispatch`
- Add: `memory.system_health` -- Current system health and diagnostics
- Update the scheduler description to reflect 3 jobs instead of 8

**Step 2: Commit**

```bash
git add template-v2/.claude/skills/memory-manager.md CLAUDE.md
git commit -m "docs(template): remove references to deferred MCP tools

Update memory-manager.md and CLAUDE.md to remove predictions,
prediction_feedback, and agent_dispatch tool references. Add
memory.system_health tool reference. Update scheduler description."
```

---

## Task 8: Update project memory

After all changes are implemented and tests pass, update the project MEMORY.md with what changed.

**Step 1: Update MEMORY.md**

Add under Testing section:
- Pipeline integration test in `tests/test_pipeline.py`
- Shared conftest.py with db fixture
- Scheduler test in `tests/test_scheduler.py`
- Health check test in `tests/test_health.py`

Add a new section:
```
## Robustness Refactor (Feb 2026)
- Scheduler slimmed from 8 jobs to 3: daily_decay (2 AM), pattern_detection (6h), full_consolidation (3 AM)
- Removed scheduled: verification, predictions, LLM consolidation, metrics, document lifecycle
- Removed MCP tools: memory.predictions, memory.prediction_feedback, memory.agent_dispatch
- Added MCP tool: memory.system_health (was documented, now implemented)
- Migration integrity check now covers migration 5 (verification_status column)
- run_full_consolidation() no longer calls generate_predictions()
- Service code for all deferred features retained in source files for future re-enablement
```

**Step 2: Commit**

```bash
git commit -m "docs: update memory with robustness refactor notes"
```

---

## Summary

| Task | What it does | Files changed |
|------|-------------|---------------|
| 1 | Shared test conftest.py | +1 new file |
| 2 | Fix migration integrity for verification_status | 2 files |
| 3 | Slim scheduler from 8 to 3 jobs | 3 files |
| 4 | Remove 3 deferred MCP tools | 1 file |
| 5 | Enhanced health check + system_health tool | 3 files |
| 6 | Pipeline integration test | +1 new file |
| 7 | Update template references | 2 files |
| 8 | Update memory notes | 1 file |

**Total: ~8 files modified, ~3 new files created, 8 commits**

After all tasks complete, run the full test suite one final time:
```bash
cd memory-daemon && python3 -m pytest tests/ -v
```

All tests should pass, including the new ones.
