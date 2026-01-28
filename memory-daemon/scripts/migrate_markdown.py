#!/usr/bin/env python3
"""
Migrate existing Claudia markdown files to the memory database.

This script imports data from:
- context/me.md - User profile
- context/learnings.md - Learned preferences and patterns
- context/patterns.md - Behavioral patterns
- context/commitments.md - Active commitments
- people/*.md - Relationship files
"""

import argparse
import logging
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from claudia_memory.database import get_db
from claudia_memory.services.remember import get_remember_service

logger = logging.getLogger(__name__)


def find_claudia_instances() -> List[Path]:
    """Find Claudia instances on the system"""
    instances = []

    # Common locations
    search_paths = [
        Path.home(),
        Path.home() / "Documents",
        Path.home() / "Projects",
        Path.home() / "Code",
        Path.home() / "work",
    ]

    for search_path in search_paths:
        if not search_path.exists():
            continue

        # Look for directories with CLAUDE.md and context/
        for root, dirs, files in os.walk(search_path, topdown=True):
            # Don't descend into hidden directories or node_modules
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]

            root_path = Path(root)
            if (root_path / "CLAUDE.md").exists() and (root_path / "context").exists():
                instances.append(root_path)

            # Don't go too deep
            if root_path.relative_to(search_path).parts and len(root_path.relative_to(search_path).parts) > 3:
                dirs.clear()

    return instances


def parse_markdown_sections(content: str) -> Dict[str, str]:
    """Parse markdown into sections by headers"""
    sections = {}
    current_header = None
    current_content = []

    for line in content.split("\n"):
        header_match = re.match(r"^(#{1,3})\s+(.+)$", line)
        if header_match:
            if current_header:
                sections[current_header] = "\n".join(current_content).strip()
            current_header = header_match.group(2).strip()
            current_content = []
        else:
            current_content.append(line)

    if current_header:
        sections[current_header] = "\n".join(current_content).strip()

    return sections


def parse_bullet_list(content: str) -> List[str]:
    """Parse bullet points from markdown"""
    items = []
    for line in content.split("\n"):
        match = re.match(r"^\s*[-*]\s+(.+)$", line)
        if match:
            items.append(match.group(1).strip())
    return items


def migrate_me_file(path: Path, service) -> int:
    """Migrate context/me.md"""
    me_path = path / "context" / "me.md"
    if not me_path.exists():
        return 0

    content = me_path.read_text()
    sections = parse_markdown_sections(content)

    count = 0

    # Extract user name if present
    name_match = re.search(r"Name:\s*(.+)|I'm\s+(\w+)|call me\s+(\w+)", content, re.IGNORECASE)
    if name_match:
        name = name_match.group(1) or name_match.group(2) or name_match.group(3)
        service.remember_entity(name=name.strip(), entity_type="person", description="The user")
        service.remember_fact(f"User's name is {name}", memory_type="fact", about_entities=[name])
        count += 1

    # Import each section as facts
    for section, text in sections.items():
        if text:
            # Parse as list if possible
            items = parse_bullet_list(text)
            if items:
                for item in items:
                    service.remember_fact(
                        content=item,
                        memory_type="fact" if "prefer" not in item.lower() else "preference",
                        importance=0.9,
                        source="migration",
                        source_id=str(me_path),
                    )
                    count += 1
            else:
                service.remember_fact(
                    content=f"{section}: {text[:500]}",
                    memory_type="fact",
                    importance=0.8,
                    source="migration",
                    source_id=str(me_path),
                )
                count += 1

    return count


def migrate_learnings_file(path: Path, service) -> int:
    """Migrate context/learnings.md"""
    learnings_path = path / "context" / "learnings.md"
    if not learnings_path.exists():
        return 0

    content = learnings_path.read_text()
    sections = parse_markdown_sections(content)

    count = 0

    for section, text in sections.items():
        section_lower = section.lower()

        # Determine memory type based on section
        if "preference" in section_lower:
            memory_type = "preference"
        elif "pattern" in section_lower:
            memory_type = "pattern"
        elif "avoid" in section_lower or "watch" in section_lower:
            memory_type = "observation"
        else:
            memory_type = "learning"

        items = parse_bullet_list(text)
        for item in items:
            service.remember_fact(
                content=item,
                memory_type=memory_type,
                importance=0.8,
                source="migration",
                source_id=str(learnings_path),
            )
            count += 1

    return count


def migrate_patterns_file(path: Path, service) -> int:
    """Migrate context/patterns.md"""
    patterns_path = path / "context" / "patterns.md"
    if not patterns_path.exists():
        return 0

    content = patterns_path.read_text()
    items = parse_bullet_list(content)

    count = 0
    for item in items:
        service.remember_fact(
            content=item,
            memory_type="pattern",
            importance=0.7,
            source="migration",
            source_id=str(patterns_path),
        )
        count += 1

    return count


def migrate_commitments_file(path: Path, service) -> int:
    """Migrate context/commitments.md"""
    commitments_path = path / "context" / "commitments.md"
    if not commitments_path.exists():
        return 0

    content = commitments_path.read_text()
    items = parse_bullet_list(content)

    count = 0
    for item in items:
        # Skip completed items
        if "[x]" in item.lower() or "✓" in item or "completed" in item.lower():
            continue

        service.remember_fact(
            content=item,
            memory_type="commitment",
            importance=0.9,
            source="migration",
            source_id=str(commitments_path),
        )
        count += 1

    return count


def migrate_people_files(path: Path, service) -> Tuple[int, int]:
    """Migrate people/*.md files"""
    people_dir = path / "people"
    if not people_dir.exists():
        return 0, 0

    entity_count = 0
    memory_count = 0

    for person_file in people_dir.glob("*.md"):
        content = person_file.read_text()
        sections = parse_markdown_sections(content)

        # Extract name from filename
        name = person_file.stem.replace("-", " ").replace("_", " ").title()

        # Create entity
        description = sections.get("About", sections.get("Overview", ""))[:500]
        service.remember_entity(
            name=name,
            entity_type="person",
            description=description if description else None,
        )
        entity_count += 1

        # Import sections as memories
        for section, text in sections.items():
            section_lower = section.lower()

            # Skip structural sections
            if any(
                skip in section_lower
                for skip in ["template", "last updated", "---", "contact"]
            ):
                continue

            items = parse_bullet_list(text)
            if items:
                for item in items:
                    service.remember_fact(
                        content=item,
                        memory_type="fact",
                        about_entities=[name],
                        importance=0.7,
                        source="migration",
                        source_id=str(person_file),
                    )
                    memory_count += 1
            elif text.strip():
                service.remember_fact(
                    content=f"{section}: {text[:300]}",
                    memory_type="fact",
                    about_entities=[name],
                    importance=0.6,
                    source="migration",
                    source_id=str(person_file),
                )
                memory_count += 1

    return entity_count, memory_count


def migrate_instance(path: Path, dry_run: bool = False) -> Dict[str, int]:
    """Migrate a single Claudia instance"""
    logger.info(f"Migrating: {path}")

    if dry_run:
        logger.info("(Dry run - no changes will be made)")

    service = get_remember_service()

    stats = {
        "me": 0,
        "learnings": 0,
        "patterns": 0,
        "commitments": 0,
        "people": 0,
        "memories": 0,
    }

    if not dry_run:
        stats["me"] = migrate_me_file(path, service)
        stats["learnings"] = migrate_learnings_file(path, service)
        stats["patterns"] = migrate_patterns_file(path, service)
        stats["commitments"] = migrate_commitments_file(path, service)
        people, memories = migrate_people_files(path, service)
        stats["people"] = people
        stats["memories"] = memories

    return stats


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Migrate Claudia markdown files to memory database"
    )
    parser.add_argument(
        "path",
        nargs="?",
        type=Path,
        help="Path to Claudia instance (or auto-detect if not specified)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be migrated without making changes",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Migrate all detected Claudia instances",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Non-interactive mode (for automated migration)",
    )

    args = parser.parse_args()

    if args.quiet:
        # Suppress all logging in quiet mode
        logging.basicConfig(level=logging.ERROR)
    else:
        logging.basicConfig(
            level=logging.DEBUG if args.debug else logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )

    # Initialize database
    db = get_db()
    db.initialize()

    if args.path:
        # Migrate specific instance
        if not args.path.exists():
            logger.error(f"Path not found: {args.path}")
            sys.exit(1)

        if not args.quiet:
            print(f"Migrating: {args.path}")

        stats = migrate_instance(args.path, args.dry_run)

        if args.quiet:
            # Quiet mode - minimal output for automated migration
            total = sum(stats.values())
            if total > 0:
                print(f"  - Migrated {stats['me']} items from context/me.md") if stats.get('me') else None
                print(f"  - Migrated {stats['learnings']} items from context/learnings.md") if stats.get('learnings') else None
                print(f"  - Migrated {stats['patterns']} items from context/patterns.md") if stats.get('patterns') else None
                print(f"  - Migrated {stats['commitments']} items from context/commitments.md") if stats.get('commitments') else None
                if stats.get('people'):
                    print(f"  - Migrated {stats['people']} people with {stats.get('memories', 0)} facts")
        else:
            print(f"\nMigrated: {stats}")

    elif args.all:
        # Migrate all instances
        instances = find_claudia_instances()
        if not instances:
            logger.info("No Claudia instances found")
            sys.exit(0)

        if not args.quiet:
            print(f"Found {len(instances)} Claudia instance(s):\n")
            for i, instance in enumerate(instances, 1):
                print(f"  {i}. {instance}")

        if not args.dry_run and not args.quiet:
            confirm = input("\nMigrate all? (y/n) ")
            if confirm.lower() != "y":
                sys.exit(0)

        total_stats = {}
        for instance in instances:
            stats = migrate_instance(instance, args.dry_run)
            for key, value in stats.items():
                total_stats[key] = total_stats.get(key, 0) + value

        print(f"\nTotal migrated: {total_stats}")

    else:
        # Auto-detect
        instances = find_claudia_instances()
        if not instances:
            logger.info("No Claudia instances found. Specify a path with --path")
            sys.exit(0)

        print(f"Found {len(instances)} Claudia instance(s):")
        for i, instance in enumerate(instances, 1):
            print(f"  {i}. {instance}")

        print("\nRun with --all to migrate all, or specify a path")


if __name__ == "__main__":
    main()
