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
    generate_predictions,
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

        # Hourly: Light decay
        self.scheduler.add_job(
            self._run_hourly_decay,
            IntervalTrigger(hours=1),
            id="hourly_decay",
            name="Hourly importance decay",
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

        # Daily at 6am: Generate predictions for the day
        self.scheduler.add_job(
            self._run_prediction_generation,
            CronTrigger(hour=6, minute=0),
            id="daily_predictions",
            name="Daily prediction generation",
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

    def _run_hourly_decay(self) -> None:
        """Run light decay every hour"""
        try:
            logger.debug("Running hourly decay")
            result = run_decay()
            logger.debug(f"Hourly decay complete: {result}")
        except Exception as e:
            logger.exception("Error in hourly decay")

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

    def _run_prediction_generation(self) -> None:
        """Generate daily predictions"""
        try:
            logger.debug("Running prediction generation")
            predictions = generate_predictions()
            logger.info(f"Prediction generation complete: {len(predictions)} predictions")
        except Exception as e:
            logger.exception("Error in prediction generation")


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
