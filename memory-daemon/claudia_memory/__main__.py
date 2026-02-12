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
import sqlite3
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
    parser.add_argument(
        "--backfill-embeddings",
        action="store_true",
        help="Generate embeddings for all memories that don't have them yet, then exit",
    )
    parser.add_argument(
        "--migrate-embeddings",
        action="store_true",
        help="Migrate embeddings to a new model/dimensions (drop and recreate vec0 tables, re-embed all data)",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Create a database backup and exit",
    )
    parser.add_argument(
        "--vault-sync",
        action="store_true",
        help="Export memory to Obsidian vault and exit (full rebuild)",
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

    if args.backfill_embeddings:
        # One-shot: generate embeddings for memories missing them
        setup_logging(debug=args.debug)
        from .embeddings import get_embedding_service

        db = get_db()
        db.initialize()
        config = get_config()

        # Fail fast if dimensions mismatch (user needs --migrate-embeddings instead)
        stored_dims = db.execute(
            "SELECT value FROM _meta WHERE key = 'embedding_dimensions'",
            fetch=True,
        )
        if stored_dims and int(stored_dims[0]["value"]) != config.embedding_dimensions:
            print(
                f"Error: Dimension mismatch detected. "
                f"Database has {stored_dims[0]['value']}D embeddings, "
                f"config specifies {config.embedding_dimensions}D. "
                f"Run --migrate-embeddings first."
            )
            sys.exit(1)

        # Find memories not in the memory_embeddings table
        missing = db.execute(
            "SELECT m.id, m.content FROM memories m "
            "LEFT JOIN memory_embeddings me ON m.id = me.memory_id "
            "WHERE me.memory_id IS NULL",
            fetch=True,
        )

        if not missing:
            print("All memories already have embeddings. Nothing to do.")
            return

        print(f"Found {len(missing)} memories without embeddings. Generating...")
        svc = get_embedding_service()
        if not svc.is_available_sync():
            print("Error: Ollama is not available. Start Ollama and try again.")
            sys.exit(1)

        success = 0
        failed = 0
        for i, row in enumerate(missing, 1):
            embedding = svc.embed_sync(row["content"])
            if embedding:
                import json as _json
                db.execute(
                    "INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                    (row["id"], _json.dumps(embedding)),
                )
                success += 1
            else:
                failed += 1
            if i % 10 == 0 or i == len(missing):
                print(f"  Progress: {i}/{len(missing)} (success={success}, failed={failed})")

        # Update stored embedding model to match current config (clears mismatch warning)
        db.execute(
            "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', ?)",
            (svc.model,),
        )

        print(f"Backfill complete: {success} embedded, {failed} failed, {len(missing)} total.")
        return

    if args.migrate_embeddings:
        # Full embedding migration: change model and/or dimensions
        setup_logging(debug=args.debug)
        import json as _json

        from .database import Database
        from .embeddings import get_embedding_service

        db = get_db()
        db.initialize()
        config = get_config()
        svc = get_embedding_service()

        new_model = config.embedding_model
        new_dim = config.embedding_dimensions

        # Read current state from _meta
        old_model_row = db.execute(
            "SELECT value FROM _meta WHERE key = 'embedding_model'",
            fetch=True,
        )
        old_dims_row = db.execute(
            "SELECT value FROM _meta WHERE key = 'embedding_dimensions'",
            fetch=True,
        )
        old_model = old_model_row[0]["value"] if old_model_row else "unknown"
        old_dim = int(old_dims_row[0]["value"]) if old_dims_row else 384

        if old_model == new_model and old_dim == new_dim:
            # No mismatch -- offer interactive model selection
            print(f"\nCurrent embedding model: {old_model} ({old_dim}D)")
            print()
            print("Available models:")
            models_info = [
                ("1", "all-minilm:l6-v2", 384, "  23MB", "Fast, good baseline"),
                ("2", "nomic-embed-text", 768, " 274MB", "Better retrieval (+6%)"),
                ("3", "mxbai-embed-large", 1024, " 669MB", "Best accuracy, larger"),
            ]
            for num, name, dim, size, desc in models_info:
                current = " (current)" if name == old_model else ""
                print(f"  {num}) {name:<20s} {dim}D  {size}   {desc}{current}")
            print("  4) Cancel")
            print()
            choice = input("Switch to [1-4, default=4]: ").strip()

            model_map = {
                "1": ("all-minilm:l6-v2", 384),
                "2": ("nomic-embed-text", 768),
                "3": ("mxbai-embed-large", 1024),
            }

            if choice not in model_map:
                print("No changes made.")
                return

            new_model, new_dim = model_map[choice]

            if new_model == old_model and new_dim == old_dim:
                print(f"Already using {new_model}. No changes needed.")
                return

            # Update config.json with the user's choice
            config_path = Path.home() / ".claudia" / "config.json"
            try:
                if config_path.exists():
                    with open(config_path) as f:
                        cfg_data = _json.load(f)
                else:
                    cfg_data = {}
                cfg_data["embedding_model"] = new_model
                cfg_data["embedding_dimensions"] = new_dim
                with open(config_path, "w") as f:
                    _json.dump(cfg_data, f, indent=2)
                print(f"\nConfig updated: {new_model} ({new_dim}D)")
            except Exception as e:
                print(f"Warning: Could not update config.json: {e}")

            # Reinitialize embedding service with new model
            svc.model = new_model
            svc.dimensions = new_dim
            svc._available = None  # Force re-check

        # Pre-flight: verify Ollama is running and model is available
        if not svc.is_available_sync():
            # Distinguish: Ollama not running vs model not pulled
            import subprocess
            import httpx

            ollama_running = False
            try:
                resp = httpx.get(f"{svc.host}/api/tags", timeout=5)
                ollama_running = resp.status_code == 200
            except Exception:
                pass

            if not ollama_running:
                print(f"Error: Ollama is not running.")
                print(f"Please start Ollama and try again.")
                sys.exit(1)

            # Ollama is running but model is missing -- offer to pull it
            print(f"\nThe model '{new_model}' is not installed in Ollama.")
            pull_choice = input(f"Download it now? (Y/n): ").strip().lower()
            if pull_choice in ("", "y", "yes"):
                print(f"Downloading {new_model}... (this may take a minute)")
                try:
                    result = subprocess.run(
                        ["ollama", "pull", new_model],
                        capture_output=False,
                        text=True,
                    )
                    if result.returncode != 0:
                        print(f"Error: Failed to pull {new_model}.")
                        sys.exit(1)
                except FileNotFoundError:
                    print("Error: 'ollama' command not found. Please install Ollama.")
                    sys.exit(1)

                # Re-check availability after pull
                svc._available = None
                if not svc.is_available_sync():
                    print(f"Error: Model still not available after pull.")
                    sys.exit(1)
                print(f"Model '{new_model}' ready.")
            else:
                print("Migration cancelled.")
                return

        # Count embeddings across all tables
        embedding_counts = {}
        for table, pk in Database.VEC0_TABLES:
            try:
                rows = db.execute(f"SELECT COUNT(*) as cnt FROM {table}", fetch=True)
                embedding_counts[table] = rows[0]["cnt"] if rows else 0
            except Exception:
                embedding_counts[table] = 0
        total_embeddings = sum(embedding_counts.values())

        # Show migration summary
        print(f"\nEmbedding Migration")
        print(f"  Current: {old_model} ({old_dim}D)")
        print(f"  Target:  {new_model} ({new_dim}D)")
        print(f"  Embeddings to regenerate: {total_embeddings}")
        print()

        # Count source data to re-embed
        mem_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM memories WHERE invalidated_at IS NULL",
            fetch=True,
        )
        ent_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM entities WHERE deleted_at IS NULL",
            fetch=True,
        )
        ep_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM episodes WHERE summary IS NOT NULL AND summary != ''",
            fetch=True,
        )
        msg_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM messages",
            fetch=True,
        )
        ref_count_rows = db.execute(
            "SELECT COUNT(*) as cnt FROM reflections",
            fetch=True,
        )
        mem_count = mem_count_rows[0]["cnt"] if mem_count_rows else 0
        ent_count = ent_count_rows[0]["cnt"] if ent_count_rows else 0
        ep_count = ep_count_rows[0]["cnt"] if ep_count_rows else 0
        msg_count = msg_count_rows[0]["cnt"] if msg_count_rows else 0
        ref_count = ref_count_rows[0]["cnt"] if ref_count_rows else 0
        total_to_embed = mem_count + ent_count + ep_count + msg_count + ref_count

        print(f"  Source data to re-embed:")
        print(f"    Memories:    {mem_count}")
        print(f"    Entities:    {ent_count}")
        print(f"    Episodes:    {ep_count}")
        print(f"    Messages:    {msg_count}")
        print(f"    Reflections: {ref_count}")
        print(f"    Total:       {total_to_embed}")
        print()

        # Pre-flight: verify sqlite-vec is available
        try:
            db.execute("SELECT vec_version()", fetch=True)
        except Exception:
            print("Error: sqlite-vec extension not available. Cannot migrate embeddings.")
            print("Install with: pip install sqlite-vec")
            sys.exit(1)

        # Confirmation
        confirm = input("Proceed with migration? (y/N): ").strip().lower()
        if confirm != "y":
            print("Migration cancelled.")
            return

        # Step 1: Backup
        print("\nStep 1/4: Creating backup...")
        backup_path = db.backup()
        print(f"  Backup at: {backup_path}")

        # Step 2: Drop and recreate vec0 tables with new dimensions
        print("\nStep 2/4: Recreating vector tables...")
        with db.transaction() as conn:
            for table, pk in Database.VEC0_TABLES:
                try:
                    conn.execute(f"DROP TABLE IF EXISTS {table}")
                    conn.execute(f"""
                        CREATE VIRTUAL TABLE {table} USING vec0(
                            {pk} INTEGER PRIMARY KEY,
                            embedding FLOAT[{new_dim}]
                        )
                    """)
                    print(f"  Recreated {table} ({new_dim}D)")
                except sqlite3.OperationalError as e:
                    if "no such module: vec0" in str(e):
                        print(f"  Warning: sqlite-vec not available, skipping {table}")
                    else:
                        print(f"  Error recreating {table}: {e}")
                        print("Aborting. Restore from backup to recover.")
                        sys.exit(1)

        # Step 3: Re-embed everything
        print("\nStep 3/4: Re-embedding all data...")
        results = {}

        # 3a. Memory embeddings (largest, most important)
        if mem_count > 0:
            memories = db.execute(
                "SELECT id, content FROM memories WHERE invalidated_at IS NULL",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(memories or [], 1):
                embedding = svc.embed_sync(row["content"])
                if embedding:
                    db.execute(
                        "INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == mem_count:
                    print(f"  Memories:    {i}/{mem_count}")
            results["memories"] = success
        else:
            results["memories"] = 0

        # 3b. Entity embeddings
        if ent_count > 0:
            entities = db.execute(
                "SELECT id, name, description FROM entities WHERE deleted_at IS NULL",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(entities or [], 1):
                text = f"{row['name']}: {row['description'] or ''}"
                embedding = svc.embed_sync(text)
                if embedding:
                    db.execute(
                        "INSERT INTO entity_embeddings (entity_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == ent_count:
                    print(f"  Entities:    {i}/{ent_count}")
            results["entities"] = success
        else:
            results["entities"] = 0

        # 3c. Episode embeddings (from summaries)
        if ep_count > 0:
            episodes = db.execute(
                "SELECT id, summary FROM episodes WHERE summary IS NOT NULL AND summary != ''",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(episodes or [], 1):
                embedding = svc.embed_sync(row["summary"])
                if embedding:
                    db.execute(
                        "INSERT INTO episode_embeddings (episode_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == ep_count:
                    print(f"  Episodes:    {i}/{ep_count}")
            results["episodes"] = success
        else:
            results["episodes"] = 0

        # 3d. Message embeddings
        if msg_count > 0:
            messages = db.execute(
                "SELECT id, content FROM messages",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(messages or [], 1):
                embedding = svc.embed_sync(row["content"])
                if embedding:
                    db.execute(
                        "INSERT INTO message_embeddings (message_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == msg_count:
                    print(f"  Messages:    {i}/{msg_count}")
            results["messages"] = success
        else:
            results["messages"] = 0

        # 3e. Reflection embeddings
        if ref_count > 0:
            reflections = db.execute(
                "SELECT id, content FROM reflections",
                fetch=True,
            )
            success = 0
            for i, row in enumerate(reflections or [], 1):
                embedding = svc.embed_sync(row["content"])
                if embedding:
                    db.execute(
                        "INSERT INTO reflection_embeddings (reflection_id, embedding) VALUES (?, ?)",
                        (row["id"], _json.dumps(embedding)),
                    )
                    success += 1
                if i % 25 == 0 or i == ref_count:
                    print(f"  Reflections: {i}/{ref_count}")
            results["reflections"] = success
        else:
            results["reflections"] = 0

        # Step 4: Update _meta
        print("\nStep 4/4: Updating metadata...")
        db.execute(
            "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', ?)",
            (new_model,),
        )
        db.execute(
            "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_dimensions', ?)",
            (str(new_dim),),
        )

        # Clear embedding cache (old-dimension entries)
        svc._cache.clear()
        svc._model_mismatch = False

        # Summary
        print(f"\nMigration complete:")
        print(f"  Model: {new_model} ({new_dim}D)")
        print(f"  Memories re-embedded:    {results['memories']}/{mem_count}")
        print(f"  Entities re-embedded:    {results['entities']}/{ent_count}")
        print(f"  Episodes re-embedded:    {results['episodes']}/{ep_count}")
        print(f"  Messages re-embedded:    {results['messages']}/{msg_count}")
        print(f"  Reflections re-embedded: {results['reflections']}/{ref_count}")
        print(f"  Backup at: {backup_path}")
        print(f"\n  To rollback: restore the backup file.")
        return

    if args.backup:
        setup_logging(debug=args.debug)
        db = get_db()
        db.initialize()
        backup_path = db.backup()
        print(f"Backup created: {backup_path}")
        return

    if args.vault_sync:
        setup_logging(debug=args.debug)
        from .services.vault_sync import get_vault_path, get_vault_sync_service

        db = get_db()
        db.initialize()
        vault_path = get_vault_path(project_id)
        print(f"Exporting memory to vault: {vault_path}")
        svc = get_vault_sync_service(project_id)
        stats = svc.export_all()
        print(f"Vault sync complete:")
        for key, value in stats.items():
            print(f"  {key}: {value}")
        print(f"\nVault at: {vault_path}")
        print("Open this folder in Obsidian to browse your memory graph.")
        return

    # Run the daemon
    run_daemon(mcp_mode=not args.standalone, debug=args.debug, project_id=project_id)


if __name__ == "__main__":
    main()
