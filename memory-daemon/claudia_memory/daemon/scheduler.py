"""
Background Scheduler for Claudia Memory System

Runs scheduled consolidation tasks using APScheduler.
"""

import logging
from datetime import datetime
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

logger = logging.getLogger(__name__)


class MemoryScheduler:
    """Manages scheduled memory maintenance tasks"""

    def __init__(self):
        self.scheduler = BackgroundScheduler()
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
