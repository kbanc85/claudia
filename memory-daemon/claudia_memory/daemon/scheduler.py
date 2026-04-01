"""
Background Scheduler for Claudia Memory System

Runs scheduled consolidation tasks using APScheduler.
"""

import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from ..config import get_config
from ..services.consolidate import (
    detect_patterns,
    run_decay,
    run_full_consolidation,
)
from ..services.vault_sync import run_vault_sync

logger = logging.getLogger(__name__)


# Tools whose invocations are always relevant for Claudia's memory
RELEVANT_TOOL_PREFIXES = {
    "gmail", "google_workspace", "slack", "telegram",
    "SLACK_", "GMAIL_", "NOTION_", "CALENDAR_",
    "memory_file", "memory_remember",
}

COMMITMENT_RE = re.compile(
    r"(?:by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|end of|eod))"
    r"|(?:I'?ll\s+(?:send|get|follow|draft|prepare|deliver|share|review))"
    r"|(?:follow.?up|get back to|circle back|loop.?in|promised|committed)",
    re.IGNORECASE,
)

CLAUDIA_PATH_RE = re.compile(r"(?:context/|people/|workspaces/|projects/)")


def _is_relevant_observation(obs, config, known_entity_names=None):
    """Check if an observation passes the relevance filter.

    Returns True if at least one signal matches:
    1. Tool name matches a relevant tool pattern
    2. Input contains a Claudia file path
    3. Content mentions a known entity
    4. Content contains commitment language
    """
    if config.observation_capture_all:
        return True

    tool_name = obs.get("tool", "")
    combined_text = f"{obs.get('input', '')} {obs.get('output', '')}"

    # Check 1: Relevant tool
    for prefix in RELEVANT_TOOL_PREFIXES:
        if tool_name.startswith(prefix):
            return True
    for pattern in config.observation_relevant_tools:
        if pattern in tool_name:
            return True

    # Check 2: Claudia file path in input
    if CLAUDIA_PATH_RE.search(combined_text):
        return True
    for pattern in config.observation_relevant_paths:
        if pattern in combined_text:
            return True

    # Check 3: Known entity mention
    if known_entity_names:
        combined_lower = combined_text.lower()
        for name in known_entity_names:
            if name.lower() in combined_lower:
                return True

    # Check 4: Commitment language
    if COMMITMENT_RE.search(combined_text):
        return True

    return False


def _ingest_observations(db, config):
    """Poll ~/.claudia/observations.jsonl and ingest relevant entries.

    Uses atomic rename to prevent race conditions with the hook writer.
    Filters observations through the relevance filter before storing.
    """
    if not config.observation_capture_enabled:
        return

    obs_file = Path.home() / ".claudia" / "observations.jsonl"
    processing_file = obs_file.with_suffix(".jsonl.processing")

    if not obs_file.exists():
        return

    # Check file is non-empty
    try:
        if obs_file.stat().st_size == 0:
            return
    except OSError:
        return

    # Atomic rename to prevent race with hook writes
    try:
        os.rename(str(obs_file), str(processing_file))
    except OSError:
        return

    # Load known entity names for relevance checking (cached per batch)
    known_entity_names = set()
    try:
        rows = db.execute(
            "SELECT canonical_name FROM entities WHERE deleted_at IS NULL",
            fetch=True,
        ) or []
        known_entity_names = {row["canonical_name"] for row in rows}
    except Exception:
        pass

    ingested = 0
    try:
        with open(processing_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obs = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if not _is_relevant_observation(obs, config, known_entity_names):
                    continue

                # Ingest via buffer_turn
                try:
                    from ..services.remember import buffer_turn
                    summary = f"[{obs.get('tool', 'unknown')}] {obs.get('input', '')}"
                    if obs.get("output"):
                        summary += f" -> {obs['output']}"
                    buffer_turn(
                        assistant_content=summary[:500],
                        source="hook_capture",
                    )
                    ingested += 1
                except Exception as e:
                    logger.debug(f"Failed to ingest observation: {e}")

    except Exception as e:
        logger.debug(f"Error reading observations file: {e}")
    finally:
        # Clean up processing file
        try:
            processing_file.unlink(missing_ok=True)
        except Exception:
            pass

    if ingested > 0:
        logger.debug(f"Ingested {ingested} observations from hook capture")


class MemoryScheduler:
    """Manages scheduled memory maintenance tasks"""

    def __init__(self):
        self.scheduler = BackgroundScheduler(
            job_defaults={"misfire_grace_time": 14400, "coalesce": True}
        )
        self.config = get_config()
        self._started = False

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

        # Daily at 3am: Full consolidation
        self.scheduler.add_job(
            self._run_full_consolidation,
            CronTrigger(hour=3, minute=0),
            id="full_consolidation",
            name="Full overnight consolidation",
            replace_existing=True,
        )

        # Daily at 2:30am: Labeled daily backup (7-day retention)
        self.scheduler.add_job(
            self._run_daily_backup,
            CronTrigger(hour=2, minute=30),
            id="daily_backup",
            name="Daily backup",
            replace_existing=True,
        )

        # Weekly on Sunday at 2:45am: Labeled weekly backup (4-week retention)
        self.scheduler.add_job(
            self._run_weekly_backup,
            CronTrigger(day_of_week="sun", hour=2, minute=45),
            id="weekly_backup",
            name="Weekly backup",
            replace_existing=True,
        )

        # Daily at 3:15am: Vault sync (after consolidation)
        if self.config.vault_sync_enabled:
            self.scheduler.add_job(
                self._run_vault_sync,
                CronTrigger(hour=3, minute=15),
                id="vault_sync",
                name="Obsidian vault sync",
                replace_existing=True,
            )

        # Every N seconds: Observation ingestion from PostToolUse hook
        if self.config.observation_capture_enabled:
            self.scheduler.add_job(
                self._run_observation_ingest,
                IntervalTrigger(seconds=self.config.observation_ingest_interval),
                id="observation_ingest",
                name="Observation ingestion",
                replace_existing=True,
                misfire_grace_time=60,
            )

        self.scheduler.start()
        self._started = True
        logger.info("Memory scheduler started")

    def stop(self) -> None:
        """Stop the scheduler"""
        if self._started:
            self.scheduler.shutdown(wait=True)
            self._started = False
            logger.info("Memory scheduler stopped")

    def is_running(self) -> bool:
        """Check if scheduler is running"""
        return self._started and self.scheduler.running

    def get_jobs(self):
        """Get all scheduled jobs"""
        return self.scheduler.get_jobs()

    def trigger_job(self, job_id: str) -> bool:
        """Manually trigger a job"""
        job = self.scheduler.get_job(job_id)
        if job:
            job.modify(next_run_time=datetime.now())
            return True
        return False

    def _run_daily_decay(self) -> None:
        """Run importance decay daily"""
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

    def _run_daily_backup(self) -> None:
        """Create a labeled daily backup with 7-day retention."""
        try:
            from ..database import get_db
            backup_path = get_db().backup(label="daily")
            logger.info(f"Daily backup created: {backup_path}")
        except Exception as e:
            logger.exception("Error in daily backup")

    def _run_weekly_backup(self) -> None:
        """Create a labeled weekly backup with 4-week retention."""
        try:
            from ..database import get_db
            backup_path = get_db().backup(label="weekly")
            logger.info(f"Weekly backup created: {backup_path}")
        except Exception as e:
            logger.exception("Error in weekly backup")

    def _run_vault_sync(self) -> None:
        """Run Obsidian vault sync + canvas regeneration"""
        try:
            logger.info("[Safety-net full sync] Running after 4R Reweave inline in consolidation")
            logger.info("Running vault sync")
            from ..config import _project_id
            from ..services.vault_sync import get_vault_path
            from ..services.canvas_generator import CanvasGenerator

            result = run_vault_sync(project_id=_project_id)
            logger.info(f"Vault sync complete: {result}")

            # Regenerate canvases after sync
            vault_path = get_vault_path(_project_id)
            gen = CanvasGenerator(vault_path)
            canvas_result = gen.generate_all()
            logger.info(f"Canvas regeneration complete: {canvas_result}")
        except Exception as e:
            logger.exception("Error in vault sync")

    def _run_observation_ingest(self) -> None:
        """Ingest observations from PostToolUse hook captures."""
        try:
            from ..database import get_db
            _ingest_observations(get_db(), self.config)
        except Exception as e:
            logger.debug(f"Error in observation ingestion: {e}")


# Global scheduler instance
_scheduler: Optional[MemoryScheduler] = None


def get_scheduler() -> MemoryScheduler:
    """Get or create the global scheduler"""
    global _scheduler
    if _scheduler is None:
        _scheduler = MemoryScheduler()
    return _scheduler


def start_scheduler() -> None:
    """Start the global scheduler"""
    get_scheduler().start()


def stop_scheduler() -> None:
    """Stop the global scheduler"""
    if _scheduler:
        _scheduler.stop()
