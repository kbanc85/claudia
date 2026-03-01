#!/usr/bin/env python3
"""
Standalone Legacy Database Migration Script

Migrates data from a legacy claudia.db (pre-project-hash era) into
the active project-specific database. Supports --dry-run for previewing.

Usage:
    python3 scripts/migrate-legacy-db.py                                # Auto-detect
    python3 scripts/migrate-legacy-db.py --dry-run                      # Preview only
    python3 scripts/migrate-legacy-db.py --legacy-db /path/to/old.db    # Custom source
    python3 scripts/migrate-legacy-db.py --project-dir /path/to/project # By project
    python3 scripts/migrate-legacy-db.py --legacy-db old.db --active-db new.db
"""

import argparse
import hashlib
import sys
from pathlib import Path

# Add parent directory to path so we can import claudia_memory
sys.path.insert(0, str(Path(__file__).parent.parent))

from claudia_memory.migration import (
    check_legacy_database,
    is_migration_completed,
    mark_migration_completed,
    migrate_legacy_database,
)
from claudia_memory.database import Database


def get_project_hash(project_dir: str) -> str:
    """Generate consistent short hash from project directory path."""
    return hashlib.sha256(project_dir.encode()).hexdigest()[:12]


def main():
    parser = argparse.ArgumentParser(
        description="Migrate data from legacy claudia.db to project-specific database"
    )
    parser.add_argument(
        "--legacy-db",
        type=str,
        help="Path to legacy database (default: ~/.claudia/memory/claudia.db)",
    )
    parser.add_argument(
        "--active-db",
        type=str,
        help="Path to target/active database",
    )
    parser.add_argument(
        "--project-dir",
        type=str,
        help="Project directory (used to compute target database path)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview migration without making changes",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Run migration even if already completed",
    )

    args = parser.parse_args()

    # Resolve legacy path
    legacy_path = Path(args.legacy_db) if args.legacy_db else (
        Path.home() / ".claudia" / "memory" / "claudia.db"
    )

    if not legacy_path.exists():
        print(f"Error: Legacy database not found: {legacy_path}")
        sys.exit(1)

    # Resolve active path
    if args.active_db:
        active_path = Path(args.active_db)
    elif args.project_dir:
        project_hash = get_project_hash(args.project_dir)
        active_path = Path.home() / ".claudia" / "memory" / f"{project_hash}.db"
    else:
        # Try to find any project-hash database
        memory_dir = Path.home() / ".claudia" / "memory"
        candidates = [
            p for p in memory_dir.glob("*.db")
            if p.name != "claudia.db"
            and not p.name.startswith("claudia.db.")
            and len(p.stem) == 12  # SHA256[:12]
        ]

        if len(candidates) == 1:
            active_path = candidates[0]
        elif len(candidates) > 1:
            print("Multiple project databases found:")
            for i, c in enumerate(candidates, 1):
                print(f"  {i}) {c.name}")
            print("\nUse --active-db or --project-dir to specify the target.")
            sys.exit(1)
        else:
            print("No project-specific database found.")
            print("Use --active-db or --project-dir to specify the target.")
            sys.exit(1)

    if str(legacy_path.resolve()) == str(active_path.resolve()):
        print("Error: Legacy and active databases are the same file.")
        sys.exit(1)

    # Check legacy data
    legacy_stats = check_legacy_database(legacy_path)
    if not legacy_stats:
        print(f"Legacy database at {legacy_path} has no data to migrate.")
        sys.exit(0)

    print(f"\nLegacy database: {legacy_path}")
    print(f"Active database: {active_path}")
    print(f"\n  Entities:      {legacy_stats.get('entities', 0)}")
    print(f"  Memories:      {legacy_stats.get('memories', 0)}")
    print(f"  Links:         {legacy_stats.get('links', 0)}")
    print(f"  Relationships: {legacy_stats.get('relationships', 0)}")
    if legacy_stats.get("earliest"):
        print(f"  Date range:    {legacy_stats['earliest']} to {legacy_stats['latest']}")

    # Initialize active database if needed
    if not active_path.exists():
        print(f"\nActive database doesn't exist yet. It will be created.")

    db = Database(active_path)
    db.initialize()

    if is_migration_completed(db) and not args.force:
        print("\nMigration was already completed previously.")
        print("Use --force to run again.")
        sys.exit(0)

    if args.dry_run:
        print("\n--- DRY RUN MODE (no changes will be made) ---\n")
        results = migrate_legacy_database(legacy_path, active_path, dry_run=True)
    else:
        # Backup active database
        if active_path.exists() and active_path.stat().st_size > 0:
            backup_path = db.backup(label="pre-migration")
            print(f"\nBackup created: {backup_path}")

        confirm = input("\nProceed with migration? (y/N): ").strip().lower()
        if confirm != "y":
            print("Cancelled.")
            sys.exit(0)

        print("\nMigrating...")
        results = migrate_legacy_database(legacy_path, active_path)
        mark_migration_completed(db, results)

        # Rename legacy database
        from datetime import datetime
        date_suffix = datetime.now().strftime("%Y-%m-%d")
        migrated_path = legacy_path.with_suffix(f".db.migrated-{date_suffix}")
        try:
            legacy_path.rename(migrated_path)
            print(f"\nRenamed: {legacy_path.name} -> {migrated_path.name}")
        except OSError as e:
            print(f"Warning: Could not rename legacy database: {e}")

    print(f"\nResults:")
    for key, value in sorted(results.items()):
        if value > 0:
            print(f"  {key}: {value}")

    db.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
