"""
Background Scheduler for Claudia Memory System

Runs scheduled consolidation tasks using APScheduler.
"""

import asyncio
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
from ..loops.job_wrapper import run_with_status

logger = logging.getLogger(__name__)


def _file_nonempty(path) -> "tuple[bool, str]":
    """Invariant: a backup path must exist and be a non-empty file."""
    try:
        p = Path(path)
        if not p.exists():
            return False, f"backup file missing: {p}"
        if p.stat().st_size == 0:
            return False, f"backup file is empty: {p}"
        return True, ""
    except Exception as e:  # noqa: BLE001
        return False, f"could not stat backup: {e!r}"


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


def _parse_transcript(transcript_path: str, max_chars: int = 4000) -> str:
    """Parse a Claude Code JSONL transcript and extract readable conversation text.

    Tolerates truncated last lines. Skips tool_use/tool_result entries.
    Returns up to max_chars of concatenated human/assistant text.
    """
    path = Path(transcript_path)
    if not path.exists():
        return ""

    # Skip very large files
    try:
        if path.stat().st_size > 50 * 1024 * 1024:  # 50MB
            return ""
    except OSError:
        return ""

    text_parts = []
    total_chars = 0

    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if total_chars >= max_chars:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    turn = json.loads(line)
                except json.JSONDecodeError:
                    # Tolerate truncated last line silently
                    continue

                # Skip tool use entries
                turn_type = turn.get("type", "")
                if turn_type in ("tool_use", "tool_result"):
                    continue

                role = turn.get("role") or turn.get("type", "")
                if role not in ("user", "human", "assistant"):
                    continue

                content = turn.get("content") or turn.get("text") or ""
                if isinstance(content, list):
                    # Extract text blocks, skip tool_use blocks
                    parts = []
                    for block in content:
                        if isinstance(block, dict):
                            if block.get("type") == "tool_use" or block.get("type") == "tool_result":
                                continue
                            if block.get("type") == "text":
                                parts.append(block.get("text", ""))
                    content = " ".join(parts)
                elif not isinstance(content, str):
                    continue

                content = content.strip()
                if not content:
                    continue

                prefix = "User: " if role in ("user", "human") else "Assistant: "
                chunk = prefix + content[:500] + "\n"
                text_parts.append(chunk)
                total_chars += len(chunk)

    except OSError:
        return ""

    return "".join(text_parts)[:max_chars]


def _process_sessions(db, config):
    """Poll ~/.claudia/sessions_pending.jsonl and ingest sessions into memory.

    Mirrors _ingest_observations() exactly in structure:
    - Atomic rename to prevent race conditions with hook writers
    - Skips sessions already ingested (ingested_at IS NOT NULL in episodes)
    - Extracts text from transcript JSONL
    - Files raw source material first (Source Preservation)
    - Runs LLM extraction via ingest service
    - Uses AUDN write helper for semantic dedup
    - Marks episode as ingested when done
    """
    if not getattr(config, "session_capture_enabled", True):
        return

    queue_file = Path.home() / ".claudia" / "sessions_pending.jsonl"
    processing_file = queue_file.with_suffix(".jsonl.processing")

    if not queue_file.exists():
        return

    try:
        if queue_file.stat().st_size == 0:
            return
    except OSError:
        return

    # Atomic rename to prevent race with hook writes
    try:
        os.rename(str(queue_file), str(processing_file))
    except OSError:
        return

    processed = 0

    try:
        with open(processing_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                session_id = entry.get("session_id", "")
                transcript_path = entry.get("transcript_path", "")

                if not session_id:
                    continue

                # Skip if already ingested
                try:
                    row = db.execute(
                        "SELECT id, ingested_at FROM episodes WHERE session_id = ?",
                        (session_id,),
                        fetch=True,
                    )
                    if row and row[0]["ingested_at"] is not None:
                        logger.debug(f"Session {session_id} already ingested, skipping")
                        continue
                    episode_id = row[0]["id"] if row else None
                except Exception as e:
                    logger.debug(f"Could not check episode for {session_id}: {e}")
                    episode_id = None

                # Parse transcript
                raw_text = ""
                if transcript_path:
                    try:
                        raw_text = _parse_transcript(transcript_path)
                    except Exception as e:
                        logger.debug(f"Transcript parse error for {session_id}: {e}")

                # Create or reuse episode
                try:
                    if episode_id is None:
                        now = datetime.utcnow().isoformat()
                        episode_id = db.insert(
                            "episodes",
                            {
                                "session_id": session_id,
                                "started_at": now,
                                "message_count": 0,
                                "is_summarized": 0,
                            },
                        )
                except Exception as e:
                    logger.debug(f"Could not create episode for {session_id}: {e}")
                    continue

                now_iso = datetime.utcnow().isoformat()

                # If transcript is empty, mark as ingested and continue
                if not raw_text.strip():
                    try:
                        db.update(
                            "episodes",
                            {"ingested_at": now_iso, "is_summarized": 1},
                            "id = ?",
                            (episode_id,),
                        )
                    except Exception:
                        pass
                    processed += 1
                    continue

                # Source Preservation: file raw transcript first
                try:
                    from ..services.remember import get_remember_service
                    remember_svc = get_remember_service()
                    # Store a stub memory to link to source material
                    stub_id = remember_svc.remember_fact(
                        content=f"Session transcript: {session_id}",
                        memory_type="observation",
                        importance=0.3,
                        source="session_transcript",
                        source_id=session_id,
                        origin_type="extracted",
                        metadata={"verification_status": "pending", "is_source_stub": True},
                    )
                    if stub_id:
                        remember_svc.save_source_material(
                            stub_id,
                            raw_text,
                            metadata={
                                "source": "session_transcript",
                                "session_id": session_id,
                            },
                        )
                except Exception as e:
                    logger.debug(f"Source preservation failed for {session_id}: {e}")

                # LLM extraction
                try:
                    from ..services.ingest import get_ingest_service
                    from ..language_model import get_language_model_service
                    from ..services.audn import audn_write

                    ingest_svc = get_ingest_service()
                    llm_svc = get_language_model_service()

                    result = asyncio.run(ingest_svc.ingest(raw_text, source_type="session"))

                    if result["status"] == "llm_unavailable":
                        # Mark as ingested so we don't re-queue; no data to store
                        logger.debug(f"LLM unavailable for session {session_id}, marking as processed")
                        db.update(
                            "episodes",
                            {"ingested_at": now_iso, "is_summarized": 0},
                            "id = ?",
                            (episode_id,),
                        )
                        processed += 1
                        continue

                    if result["status"] == "extracted" and result.get("data"):
                        data = result["data"]

                        # Write facts via AUDN
                        for fact in data.get("facts", []):
                            try:
                                asyncio.run(audn_write(
                                    content=fact.get("content", ""),
                                    memory_type=fact.get("type", "fact"),
                                    about_entities=fact.get("about", []),
                                    importance=fact.get("importance", 0.6),
                                    source="session_transcript",
                                    source_id=session_id,
                                    db=db,
                                    llm_service=llm_svc,
                                ))
                            except Exception as e:
                                logger.debug(f"AUDN write failed for fact: {e}")

                        # Write commitments via AUDN
                        for commitment in data.get("commitments", []):
                            try:
                                asyncio.run(audn_write(
                                    content=commitment.get("content", ""),
                                    memory_type="commitment",
                                    about_entities=[commitment["who"]] if commitment.get("who") else [],
                                    importance=commitment.get("importance", 0.7),
                                    source="session_transcript",
                                    source_id=session_id,
                                    db=db,
                                    llm_service=llm_svc,
                                ))
                            except Exception as e:
                                logger.debug(f"AUDN write failed for commitment: {e}")

                        # Write decisions via AUDN
                        for decision in data.get("decisions", []):
                            try:
                                asyncio.run(audn_write(
                                    content=decision.get("content", ""),
                                    memory_type="fact",
                                    about_entities=[],
                                    importance=decision.get("importance", 0.7),
                                    source="session_transcript",
                                    source_id=session_id,
                                    db=db,
                                    llm_service=llm_svc,
                                ))
                            except Exception as e:
                                logger.debug(f"AUDN write failed for decision: {e}")

                        # Store narrative and structured data via end_session
                        try:
                            from ..services.remember import get_remember_service
                            remember_svc = get_remember_service()
                            narrative = data.get("summary", f"Session {session_id} processed from transcript.")
                            remember_svc.end_session(
                                episode_id=episode_id,
                                narrative=narrative,
                                entities=data.get("entities", []),
                                relationships=data.get("relationships", []),
                                key_topics=data.get("key_topics", []),
                            )
                        except Exception as e:
                            logger.debug(f"end_session failed for {session_id}: {e}")

                except Exception as e:
                    logger.debug(f"Extraction failed for session {session_id}: {e}")

                # Mark as ingested regardless of extraction outcome
                try:
                    db.update(
                        "episodes",
                        {"ingested_at": now_iso},
                        "id = ?",
                        (episode_id,),
                    )
                    processed += 1
                except Exception as e:
                    logger.debug(f"Could not mark session {session_id} as ingested: {e}")

    except Exception as e:
        logger.debug(f"Error reading sessions_pending file: {e}")
    finally:
        try:
            processing_file.unlink(missing_ok=True)
        except Exception:
            pass

    if processed > 0:
        logger.debug(f"Processed {processed} sessions from session capture queue")


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

        # Every 60 seconds: Session ingestion from SessionEnd/SessionStart hooks
        if getattr(self.config, "session_capture_enabled", True):
            self.scheduler.add_job(
                self._run_session_ingest,
                IntervalTrigger(seconds=60),
                id="session_ingest",
                name="Session ingestion",
                replace_existing=True,
                misfire_grace_time=300,
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
            result = run_with_status(
                "daily_decay",
                run_decay,
                invariants=[("completed", lambda r: (r is not None, "decay returned no result"))],
            )
            logger.debug(f"Daily decay complete: {result}")
        except Exception:
            logger.exception("Error in daily decay")

    def _run_pattern_detection(self) -> None:
        """Run pattern detection"""
        try:
            logger.debug("Running pattern detection")
            patterns = run_with_status(
                "pattern_detection",
                detect_patterns,
                invariants=[("is_list", lambda r: (isinstance(r, (list, tuple)), "patterns not a list"))],
            )
            logger.info(f"Pattern detection complete: {len(patterns)} patterns detected")
        except Exception:
            logger.exception("Error in pattern detection")

    def _run_full_consolidation(self) -> None:
        """Run full overnight consolidation"""
        try:
            logger.info("Running full consolidation")
            result = run_with_status(
                "full_consolidation",
                run_full_consolidation,
                invariants=[("completed", lambda r: (r is not None, "consolidation returned no result"))],
            )
            logger.info(f"Full consolidation complete: {result}")
        except Exception:
            logger.exception("Error in full consolidation")

    def _run_daily_backup(self) -> None:
        """Create a labeled daily backup with 7-day retention."""
        try:
            from ..database import get_db
            backup_path = run_with_status(
                "daily_backup",
                lambda: get_db().backup(label="daily"),
                invariants=[("backup_nonempty", lambda p: _file_nonempty(p))],
            )
            logger.info(f"Daily backup created: {backup_path}")
        except Exception:
            logger.exception("Error in daily backup")

    def _run_weekly_backup(self) -> None:
        """Create a labeled weekly backup with 4-week retention."""
        try:
            from ..database import get_db
            backup_path = run_with_status(
                "weekly_backup",
                lambda: get_db().backup(label="weekly"),
                invariants=[("backup_nonempty", lambda p: _file_nonempty(p))],
            )
            logger.info(f"Weekly backup created: {backup_path}")
        except Exception:
            logger.exception("Error in weekly backup")

    def _run_vault_sync(self) -> None:
        """Run Obsidian vault sync + canvas regeneration"""
        try:
            logger.info("Running vault sync")
            from ..config import _project_id
            from ..services.vault_sync import get_vault_path
            from ..services.canvas_generator import CanvasGenerator

            def _sync_and_canvas():
                result = run_vault_sync(project_id=_project_id)
                logger.info(f"Vault sync complete: {result}")
                vault_path = get_vault_path(_project_id)
                canvas_result = CanvasGenerator(vault_path).generate_all()
                logger.info(f"Canvas regeneration complete: {canvas_result}")
                return result

            run_with_status(
                "vault_sync",
                _sync_and_canvas,
                invariants=[("completed", lambda r: (r is not None, "vault sync returned no result"))],
            )
        except Exception:
            logger.exception("Error in vault sync")

    def _run_observation_ingest(self) -> None:
        """Ingest observations from PostToolUse hook captures."""
        try:
            from ..database import get_db
            run_with_status(
                "observation_ingest",
                lambda: _ingest_observations(get_db(), self.config),
            )
        except Exception as e:
            logger.debug(f"Error in observation ingestion: {e}")

    def _run_session_ingest(self) -> None:
        """Ingest sessions from SessionEnd/SessionStart hook queue."""
        try:
            from ..database import get_db
            run_with_status(
                "session_ingest",
                lambda: _process_sessions(get_db(), self.config),
            )
        except Exception as e:
            logger.debug(f"Error in session ingestion: {e}")


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
