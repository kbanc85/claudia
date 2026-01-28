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
from typing import Any, Callable, Dict, Optional

from ..config import get_config
from ..database import get_db
from ..embeddings import get_embedding_service
from .scheduler import get_scheduler

logger = logging.getLogger(__name__)


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
            # Check database
            db = get_db()
            db_ok = False
            try:
                db.execute("SELECT 1", fetch=True)
                db_ok = True
            except Exception:
                pass

            # Check embeddings
            embeddings = get_embedding_service()
            embeddings_ok = embeddings.is_available_sync()

            # Check scheduler
            scheduler = get_scheduler()
            scheduler_ok = scheduler.is_running()

            status = {
                "status": "healthy" if all([db_ok, scheduler_ok]) else "degraded",
                "timestamp": datetime.utcnow().isoformat(),
                "components": {
                    "database": "ok" if db_ok else "error",
                    "embeddings": "ok" if embeddings_ok else "unavailable",
                    "scheduler": "running" if scheduler_ok else "stopped",
                },
            }

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
        except Exception as e:
            logger.exception(f"Failed to start health server: {e}")

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
