"""
Claudia Memory Daemon Entry Point

Starts the memory daemon with:
- MCP server for Claude Code communication
- Background scheduler for consolidation
- Health check HTTP endpoint
"""

import argparse
import asyncio
import hashlib
import logging
import os
import signal
import sys
from pathlib import Path

from .config import get_config, set_project_id
from .daemon.health import start_health_server, stop_health_server
from .daemon.scheduler import start_scheduler, stop_scheduler
from .database import get_db
from .mcp.server import run_server as run_mcp_server

logger = logging.getLogger(__name__)

# Flag for graceful shutdown
_shutdown_requested = False


def get_project_hash(project_dir: str) -> str:
    """Generate consistent short hash from project directory path.

    Uses SHA256 truncated to 12 characters for a good balance of:
    - Uniqueness (12 hex chars = 48 bits = ~281 trillion combinations)
    - Readability (short enough to see in file listings)
    - Determinism (same path always produces same hash)
    """
    return hashlib.sha256(project_dir.encode()).hexdigest()[:12]


def setup_logging(log_path: Path = None, debug: bool = False) -> None:
    """Configure logging"""
    config = get_config()
    log_path = log_path or config.log_path

    # Ensure log directory exists
    log_path.parent.mkdir(parents=True, exist_ok=True)

    level = logging.DEBUG if debug else logging.INFO

    # Configure root logger
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler(log_path),
            logging.StreamHandler(sys.stderr),
        ],
    )

    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    global _shutdown_requested
    logger.info(f"Received signal {signum}, initiating shutdown")
    _shutdown_requested = True


def run_daemon(mcp_mode: bool = True, debug: bool = False, project_id: str = None) -> None:
    """
    Run the Claudia Memory Daemon.

    Args:
        mcp_mode: If True, run as MCP server (stdio mode)
        debug: Enable debug logging
        project_id: Optional project identifier for database isolation
    """
    # Set project context before any config access
    if project_id:
        set_project_id(project_id)

    setup_logging(debug=debug)
    logger.info("Starting Claudia Memory Daemon")
    if project_id:
        logger.info(f"Project isolation enabled: {project_id}")

    # Set up signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    try:
        # Initialize database
        db = get_db()
        db.initialize()
        logger.info(f"Database initialized at {get_config().db_path}")

        # Start health server
        start_health_server()
        logger.info(f"Health server started on port {get_config().health_port}")

        # Start background scheduler
        start_scheduler()
        logger.info("Background scheduler started")

        if mcp_mode:
            # Run MCP server (blocks until stdin closes)
            logger.info("Starting MCP server (stdio mode)")
            asyncio.run(run_mcp_server())
        else:
            # Run as standalone daemon (for testing)
            logger.info("Running in standalone mode (no MCP)")
            import time
            while not _shutdown_requested:
                time.sleep(1)

    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    except Exception as e:
        logger.exception(f"Daemon error: {e}")
        sys.exit(1)
    finally:
        # Cleanup
        logger.info("Shutting down...")
        stop_scheduler()
        stop_health_server()
        # Close embedding service HTTP clients to avoid resource leak
        try:
            from .embeddings import get_embedding_service
            svc = get_embedding_service()
            if svc._sync_client:
                svc._sync_client.close()
                svc._sync_client = None
        except Exception:
            pass
        db = get_db()
        db.close()
        logger.info("Claudia Memory Daemon stopped")


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Claudia Memory Daemon - Superhuman memory for your AI assistant"
    )
    parser.add_argument(
        "--standalone",
        action="store_true",
        help="Run in standalone mode (without MCP server)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )
    parser.add_argument(
        "--consolidate",
        action="store_true",
        help="Run consolidation once and exit",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check system health and exit",
    )
    parser.add_argument(
        "--project-dir",
        type=str,
        help="Project directory for database isolation (creates project-specific database)",
    )
    parser.add_argument(
        "--tui",
        action="store_true",
        help="Launch the Brain Monitor terminal dashboard (requires: pip install claudia-memory[tui])",
    )

    args = parser.parse_args()

    # Compute project ID from directory path if provided
    project_id = None
    if args.project_dir:
        project_id = get_project_hash(args.project_dir)
        # Set project context early for commands that don't call run_daemon
        set_project_id(project_id)
        # Set workspace path environment variable for database metadata
        os.environ["CLAUDIA_WORKSPACE_PATH"] = args.project_dir

    if args.consolidate:
        # One-shot consolidation
        setup_logging(debug=args.debug)
        from .services.consolidate import run_full_consolidation

        db = get_db()
        db.initialize()
        result = run_full_consolidation()
        print(f"Consolidation complete: {result}")
        return

    if args.check:
        # Health check
        import httpx

        config = get_config()
        try:
            response = httpx.get(f"http://localhost:{config.health_port}/status", timeout=5)
            print(response.json())
        except Exception as e:
            print(f"Health check failed: {e}")
            sys.exit(1)
        return

    if args.tui:
        # Launch Brain Monitor TUI
        from .tui.app import run_brain_monitor

        run_brain_monitor(db_path=get_config().db_path)
        return

    # Run the daemon
    run_daemon(mcp_mode=not args.standalone, debug=args.debug, project_id=project_id)


if __name__ == "__main__":
    main()
