"""Tests for scheduler misfire grace time configuration.

Verifies that BackgroundScheduler is configured with a 4-hour misfire
grace time so overnight jobs fire when the machine wakes from sleep.
"""

import pytest


class TestSchedulerMisfireGraceTime:
    """Tests for APScheduler misfire_grace_time configuration."""

    def test_misfire_grace_time_is_4_hours(self):
        """BackgroundScheduler has misfire_grace_time=14400 (4 hours)."""
        from claudia_memory.daemon.scheduler import MemoryScheduler

        scheduler = MemoryScheduler()
        job_defaults = scheduler.scheduler._job_defaults
        assert job_defaults.get("misfire_grace_time") == 14400

    def test_coalesce_is_true(self):
        """BackgroundScheduler has coalesce=True to collapse missed runs."""
        from claudia_memory.daemon.scheduler import MemoryScheduler

        scheduler = MemoryScheduler()
        job_defaults = scheduler.scheduler._job_defaults
        assert job_defaults.get("coalesce") is True
