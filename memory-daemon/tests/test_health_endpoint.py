"""Tests for the HealthServer HTTP endpoints."""

import json
import socket
import threading
import time
from http.server import HTTPServer
from unittest.mock import MagicMock, patch

import pytest

from claudia_memory.daemon.health import HealthCheckHandler, HealthServer, build_status_report


def _free_port() -> int:
    """Find a free TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("localhost", 0))
        return s.getsockname()[1]


@pytest.fixture()
def health_server():
    """Start a HealthServer on an ephemeral port; stop it after the test."""
    port = _free_port()
    server = HealthServer(port=port)
    server.start()
    # Give the background thread a moment to bind
    time.sleep(0.05)
    yield server, port
    server.stop()


def _get(port: int, path: str) -> tuple[int, dict]:
    """Make a GET request and return (status_code, parsed_json)."""
    import http.client
    conn = http.client.HTTPConnection("localhost", port, timeout=5)
    conn.request("GET", path)
    resp = conn.getresponse()
    body = resp.read()
    conn.close()
    return resp.status, json.loads(body)


class TestHealthEndpoint:
    """Tests for GET /health."""

    def test_health_returns_200(self, health_server):
        server, port = health_server
        status, _ = _get(port, "/health")
        assert status == 200

    def test_health_returns_json(self, health_server):
        server, port = health_server
        _, data = _get(port, "/health")
        assert isinstance(data, dict)

    def test_health_status_is_healthy(self, health_server):
        server, port = health_server
        _, data = _get(port, "/health")
        assert data.get("status") == "healthy"

    def test_health_has_service_field(self, health_server):
        server, port = health_server
        _, data = _get(port, "/health")
        assert "service" in data
        assert data["service"] == "claudia-memory"

    def test_health_has_timestamp(self, health_server):
        server, port = health_server
        _, data = _get(port, "/health")
        assert "timestamp" in data

    def test_root_path_also_returns_health(self, health_server):
        server, port = health_server
        status, data = _get(port, "/")
        assert status == 200
        assert data.get("status") == "healthy"


class TestHealthEndpointNotFound:
    """Tests for unknown paths."""

    def test_unknown_path_returns_404(self, health_server):
        server, port = health_server
        import http.client
        conn = http.client.HTTPConnection("localhost", port, timeout=5)
        conn.request("GET", "/nonexistent")
        resp = conn.getresponse()
        resp.read()
        conn.close()
        assert resp.status == 404


class TestBuildStatusReport:
    """Tests for the build_status_report() helper (unit tests, no HTTP)."""

    def test_returns_dict(self):
        mock_db = MagicMock()
        mock_db.execute.return_value = [{"v": 5}]
        with patch("claudia_memory.daemon.health.get_db", return_value=mock_db), \
             patch("claudia_memory.daemon.health.get_embedding_service") as mock_emb, \
             patch("claudia_memory.daemon.health.get_scheduler") as mock_sched:
            mock_emb.return_value.is_available_sync.return_value = False
            mock_sched.return_value.is_running.return_value = False
            report = build_status_report(db=mock_db)
        assert isinstance(report, dict)

    def test_has_status_field(self):
        mock_db = MagicMock()
        mock_db.execute.return_value = [{"v": 1, "c": 0}]
        with patch("claudia_memory.daemon.health.get_db", return_value=mock_db), \
             patch("claudia_memory.daemon.health.get_embedding_service") as mock_emb, \
             patch("claudia_memory.daemon.health.get_scheduler") as mock_sched:
            mock_emb.return_value.is_available_sync.return_value = False
            mock_sched.return_value.is_running.return_value = False
            report = build_status_report(db=mock_db)
        assert "status" in report

    def test_healthy_when_db_ok(self):
        mock_db = MagicMock()
        mock_db.execute.return_value = [{"v": 1, "c": 0}]
        with patch("claudia_memory.daemon.health.get_db", return_value=mock_db), \
             patch("claudia_memory.daemon.health.get_embedding_service") as mock_emb, \
             patch("claudia_memory.daemon.health.get_scheduler") as mock_sched:
            mock_emb.return_value.is_available_sync.return_value = True
            mock_sched.return_value.is_running.return_value = True
            mock_sched.return_value.get_jobs.return_value = []
            report = build_status_report(db=mock_db)
        assert report["components"]["database"] == "ok"

    def test_degraded_when_db_fails(self):
        mock_db = MagicMock()
        mock_db.execute.side_effect = Exception("DB error")
        with patch("claudia_memory.daemon.health.get_db", return_value=mock_db), \
             patch("claudia_memory.daemon.health.get_embedding_service") as mock_emb, \
             patch("claudia_memory.daemon.health.get_scheduler") as mock_sched:
            mock_emb.return_value.is_available_sync.return_value = False
            mock_sched.return_value.is_running.return_value = False
            report = build_status_report(db=mock_db)
        assert report["status"] == "degraded"
        assert report["components"]["database"] == "error"

    def test_has_timestamp(self):
        mock_db = MagicMock()
        mock_db.execute.return_value = [{"v": 1, "c": 0}]
        with patch("claudia_memory.daemon.health.get_db", return_value=mock_db), \
             patch("claudia_memory.daemon.health.get_embedding_service") as mock_emb, \
             patch("claudia_memory.daemon.health.get_scheduler") as mock_sched:
            mock_emb.return_value.is_available_sync.return_value = False
            mock_sched.return_value.is_running.return_value = False
            report = build_status_report(db=mock_db)
        assert "timestamp" in report
