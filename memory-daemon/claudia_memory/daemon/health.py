"""
Health Check HTTP Server for Claudia Memory System

Provides a simple HTTP endpoint to check daemon status.
"""

import asyncio
import json
import logging
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from ..config import get_config
from ..database import get_db
from ..embeddings import get_embedding_service
from .scheduler import get_scheduler

logger = logging.getLogger(__name__)


def build_status_report(*, db=None) -> dict:
    """Build a comprehensive status report for the memory system.

    Returns a dict with schema version, component health, job list, and counts.
    Used by both the HTTP /status endpoint and the MCP system_health tool.

    Args:
        db: Optional database instance. If None, uses the global get_db() singleton.
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
        _db = db or get_db()
        _db.execute("SELECT 1", fetch=True)
        report["components"]["database"] = "ok"

        # Schema version
        try:
            rows = _db.execute(
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
                rows = _db.execute(query, fetch=True)
                report["counts"][table] = rows[0]["c"] if rows else 0
            except Exception:
                report["counts"][table] = -1

        # Backup status
        try:
            import glob
            db_path = str(get_config().db_path)
            pattern = f"{db_path}.backup-*.db"
            backups = sorted(glob.glob(pattern))
            if backups:
                latest = Path(backups[-1])
                report["backup"] = {
                    "count": len(backups),
                    "latest_path": str(latest),
                    "latest_size_bytes": latest.stat().st_size if latest.exists() else 0,
                }
            else:
                report["backup"] = {"count": 0}
        except Exception:
            report["backup"] = {"count": -1, "error": "unable to check"}

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

    # Vault sync status
    try:
        from ..services.vault_sync import get_vault_path, get_vault_sync_service
        from ..config import _project_id
        vault_path = get_vault_path(_project_id)
        if vault_path.exists():
            svc = get_vault_sync_service(_project_id, db=_db if '_db' in dir() else None)
            vault_status = svc.get_status()
            report["vault"] = {
                "path": str(vault_path),
                "synced": vault_status.get("synced", False),
                "last_sync": vault_status.get("last_sync"),
            }
        else:
            report["vault"] = {"path": str(vault_path), "synced": False}
    except Exception:
        report["vault"] = {"synced": False, "error": "unable to check"}

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


class HealthCheckHandler(BaseHTTPRequestHandler):
    """HTTP request handler for health checks"""

    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

    def do_GET(self):
        """Handle GET requests"""
        if self.path == "/health" or self.path == "/":
            self._send_health_response()
        elif self.path == "/status":
            self._send_status_response()
        elif self.path == "/stats":
            self._send_stats_response()
        elif self.path == "/flush":
            self._send_flush_response()
        else:
            self.send_error(404, "Not Found")

    def _send_health_response(self):
        """Send basic health check response"""
        health = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "service": "claudia-memory",
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(health).encode())

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

    def _send_stats_response(self):
        """Send memory statistics"""
        try:
            db = get_db()

            # Get counts
            memories = db.execute("SELECT COUNT(*) as c FROM memories", fetch=True)
            entities = db.execute("SELECT COUNT(*) as c FROM entities", fetch=True)
            relationships = db.execute("SELECT COUNT(*) as c FROM relationships", fetch=True)
            episodes = db.execute("SELECT COUNT(*) as c FROM episodes", fetch=True)
            patterns = db.execute("SELECT COUNT(*) as c FROM patterns WHERE is_active = 1", fetch=True)
            predictions = db.execute(
                "SELECT COUNT(*) as c FROM predictions WHERE is_shown = 0", fetch=True
            )

            stats = {
                "timestamp": datetime.utcnow().isoformat(),
                "counts": {
                    "memories": memories[0]["c"] if memories else 0,
                    "entities": entities[0]["c"] if entities else 0,
                    "relationships": relationships[0]["c"] if relationships else 0,
                    "episodes": episodes[0]["c"] if episodes else 0,
                    "active_patterns": patterns[0]["c"] if patterns else 0,
                    "pending_predictions": predictions[0]["c"] if predictions else 0,
                },
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(stats).encode())

        except Exception as e:
            logger.exception("Error getting stats")
            self.send_error(500, str(e))

    def _send_flush_response(self):
        """Force WAL checkpoint and return status.

        Called by the PreCompact hook to ensure all buffered data is durably
        written before context compaction occurs.
        """
        try:
            db = get_db()
            # TRUNCATE mode: checkpoint and reset WAL to zero length
            db.execute("PRAGMA wal_checkpoint(TRUNCATE)", fetch=False)

            response = {
                "status": "flushed",
                "timestamp": datetime.utcnow().isoformat(),
                "message": "WAL checkpoint complete",
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

        except Exception as e:
            logger.exception("Error flushing WAL")
            self.send_error(500, str(e))


class HealthServer:
    """HTTP server for health checks"""

    def __init__(self, port: int = None):
        self.port = port or get_config().health_port
        self.server: Optional[HTTPServer] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False

    def start(self) -> None:
        """Start the health check server in a background thread"""
        if self._running:
            logger.warning("Health server already running")
            return

        try:
            self.server = HTTPServer(("localhost", self.port), HealthCheckHandler)
            self._thread = threading.Thread(target=self._serve, daemon=True)
            self._thread.start()
            self._running = True
            logger.info(f"Health server started on port {self.port}")
        except OSError as e:
            import errno as _errno
            if e.errno == _errno.EADDRINUSE:
                logger.error(
                    f"Port {self.port} is already in use. "
                    "Another Claudia daemon is likely running -- this causes database corruption. "
                    "Stop the existing daemon before starting a new one."
                )
            else:
                logger.error(f"Failed to start health server on port {self.port}: {e}")
            raise
        except Exception as e:
            logger.exception(f"Failed to start health server: {e}")
            raise

    def _serve(self) -> None:
        """Serve requests"""
        if self.server:
            self.server.serve_forever()

    def stop(self) -> None:
        """Stop the health check server"""
        if self.server:
            self.server.shutdown()
            self.server = None
        self._running = False
        logger.info("Health server stopped")

    def is_running(self) -> bool:
        """Check if server is running"""
        return self._running


# Global health server instance
_health_server: Optional[HealthServer] = None


def get_health_server() -> HealthServer:
    """Get or create the global health server"""
    global _health_server
    if _health_server is None:
        _health_server = HealthServer()
    return _health_server


def start_health_server() -> None:
    """Start the global health server"""
    get_health_server().start()


def stop_health_server() -> None:
    """Stop the global health server"""
    if _health_server:
        _health_server.stop()
