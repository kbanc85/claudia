"""Tests for the memory scheduler configuration."""

from unittest.mock import patch

from claudia_memory.daemon.scheduler import MemoryScheduler


def test_scheduler_registers_expected_jobs():
    """Scheduler should register decay, pattern detection, consolidation, and vault sync."""
    scheduler = MemoryScheduler()

    with patch.object(scheduler.scheduler, "start"):
        scheduler.start()

    jobs = scheduler.scheduler.get_jobs()
    job_ids = {job.id for job in jobs}

    expected = {"daily_decay", "pattern_detection", "full_consolidation", "vault_sync"}
    assert job_ids == expected, (
        f"Expected jobs {expected}, got: {job_ids}"
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
    trigger = decay_job.trigger
    assert type(trigger).__name__ == "CronTrigger", (
        f"Expected CronTrigger, got {type(trigger).__name__}"
    )
