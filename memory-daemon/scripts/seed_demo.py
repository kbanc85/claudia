#!/usr/bin/env python3
"""
Seed Demo Database

Creates a realistic demo database showcasing Claudia's features:
- People with relationships and attributes
- Commitments (some overdue, some upcoming)
- Waiting items
- Patterns and predictions
- Dormant relationships for relationship health
- Introduction opportunities (shared attributes, no connection)

Run: python scripts/seed_demo.py [--db-path PATH]
Default: ~/.claudia/memory/demo.db
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from claudia_memory.database import Database
from claudia_memory.services.remember import content_hash


def days_ago(n: int) -> str:
    """Return ISO timestamp for n days ago."""
    return (datetime.utcnow() - timedelta(days=n)).isoformat()


def days_from_now(n: int) -> str:
    """Return ISO timestamp for n days from now."""
    return (datetime.utcnow() + timedelta(days=n)).isoformat()


def seed_database(db: Database):
    """Populate database with demo data."""

    print("🌱 Seeding demo database...")

    # =========================================================================
    # PEOPLE - A realistic startup founder network
    # =========================================================================

    people = [
        {
            "name": "Sarah Chen",
            "canonical_name": "sarah_chen",
            "type": "person",
            "description": "CEO at Meridian Ventures. Met at SaaStr 2025. Sharp, direct, interested in AI infrastructure.",
            "importance": 0.9,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["venture capital", "technology"],
                "role": "CEO",
                "company": "Meridian Ventures",
                "communities": ["YPO", "All Raise"]
            })
        },
        {
            "name": "Marcus Johnson",
            "canonical_name": "marcus_johnson",
            "type": "person",
            "description": "Founder of DataSync. Building in the data infrastructure space. Good energy, ships fast.",
            "importance": 0.8,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["technology", "data infrastructure"],
                "role": "Founder",
                "company": "DataSync",
                "communities": ["YC W24"]
            })
        },
        {
            "name": "Elena Rodriguez",
            "canonical_name": "elena_rodriguez",
            "type": "person",
            "description": "Head of Product at Stripe. Former Google PM. Incredibly thoughtful about user experience.",
            "importance": 0.85,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["fintech", "payments"],
                "role": "Head of Product",
                "company": "Stripe",
                "communities": []
            })
        },
        {
            "name": "David Park",
            "canonical_name": "david_park",
            "type": "person",
            "description": "Angel investor. Exited his last company to Salesforce. Writes checks $50-100k.",
            "importance": 0.75,
            "metadata": json.dumps({
                "geography": {"city": "Austin", "state": "TX", "country": "US"},
                "industry": ["venture capital", "SaaS"],
                "role": "Angel Investor",
                "company": "Independent",
                "communities": ["On Deck Angels"]
            })
        },
        {
            "name": "Jennifer Walsh",
            "canonical_name": "jennifer_walsh",
            "type": "person",
            "description": "VP Engineering at Notion. Deep technical chops. Helped scale from 10 to 200 engineers.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["technology", "productivity"],
                "role": "VP Engineering",
                "company": "Notion",
                "communities": []
            })
        },
        {
            "name": "Alex Kim",
            "canonical_name": "alex_kim",
            "type": "person",
            "description": "Freelance designer. Did the rebrand for three YC companies. Fast turnaround, fair prices.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "Los Angeles", "state": "CA", "country": "US"},
                "industry": ["design", "branding"],
                "role": "Freelance Designer",
                "company": "Independent",
                "communities": []
            })
        },
        {
            "name": "Rachel Torres",
            "canonical_name": "rachel_torres",
            "type": "person",
            "description": "Partner at Sequoia. Focuses on developer tools and infrastructure. Hard to get meetings with.",
            "importance": 0.95,
            "metadata": json.dumps({
                "geography": {"city": "Menlo Park", "state": "CA", "country": "US"},
                "industry": ["venture capital", "technology"],
                "role": "Partner",
                "company": "Sequoia Capital",
                "communities": []
            })
        },
        {
            "name": "Tom Bradley",
            "canonical_name": "tom_bradley",
            "type": "person",
            "description": "Co-founder at CloudBase. We collaborate on the API integration. Reliable, good communicator.",
            "importance": 0.8,
            "metadata": json.dumps({
                "geography": {"city": "Seattle", "state": "WA", "country": "US"},
                "industry": ["technology", "cloud infrastructure"],
                "role": "Co-founder",
                "company": "CloudBase",
                "communities": ["YC S23"]
            })
        },
        {
            "name": "Nina Patel",
            "canonical_name": "nina_patel",
            "type": "person",
            "description": "Legal counsel. Specializes in startup formation and VC deals. Responsive, reasonable rates.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["legal", "startups"],
                "role": "Attorney",
                "company": "Patel Law Group",
                "communities": []
            })
        },
        {
            "name": "Chris Morgan",
            "canonical_name": "chris_morgan",
            "type": "person",
            "description": "Former CTO at Uber. Advisor to several AI startups. Intros require warm referral.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["technology", "AI"],
                "role": "Advisor",
                "company": "Independent",
                "communities": ["YPO"]
            })
        },
        # People for introduction opportunities (shared attributes, no connection yet)
        {
            "name": "Lisa Chang",
            "canonical_name": "lisa_chang",
            "type": "person",
            "description": "Founder building in AI infrastructure. Haven't met yet but heard good things.",
            "importance": 0.5,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["technology", "AI infrastructure"],
                "role": "Founder",
                "company": "Synthex AI",
                "communities": ["YC W24"]
            })
        },
        {
            "name": "Ryan Foster",
            "canonical_name": "ryan_foster",
            "type": "person",
            "description": "Angel investor focused on developer tools. Austin-based. On David's radar.",
            "importance": 0.5,
            "metadata": json.dumps({
                "geography": {"city": "Austin", "state": "TX", "country": "US"},
                "industry": ["venture capital", "developer tools"],
                "role": "Angel Investor",
                "company": "Independent",
                "communities": ["On Deck Angels"]
            })
        },
    ]

    entity_ids = {}
    for person in people:
        eid = db.insert("entities", person)
        entity_ids[person["canonical_name"]] = eid
        print(f"  + {person['name']}")

    # =========================================================================
    # ORGANIZATIONS
    # =========================================================================

    orgs = [
        {
            "name": "Meridian Ventures",
            "canonical_name": "meridian_ventures",
            "type": "organization",
            "description": "Early-stage VC fund. $200M AUM. Focus on AI and infrastructure.",
            "importance": 0.8,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["venture capital"]
            })
        },
        {
            "name": "CloudBase",
            "canonical_name": "cloudbase",
            "type": "organization",
            "description": "Cloud infrastructure startup. YC S23. Building with them on API integration.",
            "importance": 0.75,
            "metadata": json.dumps({
                "geography": {"city": "Seattle", "state": "WA", "country": "US"},
                "industry": ["technology", "cloud infrastructure"]
            })
        },
        {
            "name": "Acme Corp",
            "canonical_name": "acme_corp",
            "type": "organization",
            "description": "Enterprise customer. 500 seats. Renewal coming up in Q2.",
            "importance": 0.85,
            "metadata": json.dumps({
                "geography": {"city": "Chicago", "state": "IL", "country": "US"},
                "industry": ["enterprise", "manufacturing"]
            })
        },
    ]

    for org in orgs:
        eid = db.insert("entities", org)
        entity_ids[org["canonical_name"]] = eid
        print(f"  + {org['name']} (org)")

    # =========================================================================
    # PROJECTS
    # =========================================================================

    projects = [
        {
            "name": "Series A Fundraise",
            "canonical_name": "series_a",
            "type": "project",
            "description": "Raising $8M Series A. Target close by end of Q1.",
            "importance": 0.95,
            "metadata": json.dumps({"status": "active", "target": "$8M", "timeline": "Q1 2026"})
        },
        {
            "name": "CloudBase Integration",
            "canonical_name": "cloudbase_integration",
            "type": "project",
            "description": "API integration partnership with CloudBase. Joint go-to-market.",
            "importance": 0.8,
            "metadata": json.dumps({"status": "active", "partner": "CloudBase"})
        },
        {
            "name": "Acme Renewal",
            "canonical_name": "acme_renewal",
            "type": "project",
            "description": "Acme Corp contract renewal. 500 seats, potential upsell to 800.",
            "importance": 0.85,
            "metadata": json.dumps({"status": "active", "current_seats": 500, "target_seats": 800})
        },
    ]

    for proj in projects:
        eid = db.insert("entities", proj)
        entity_ids[proj["canonical_name"]] = eid
        print(f"  + {proj['name']} (project)")

    # =========================================================================
    # RELATIONSHIPS
    # =========================================================================

    relationships = [
        # Active relationships (recent memories)
        ("sarah_chen", "meridian_ventures", "leads", 0.95, 5),
        ("sarah_chen", "series_a", "evaluating", 0.8, 3),
        ("marcus_johnson", "series_a", "advising", 0.6, 10),
        ("tom_bradley", "cloudbase", "co_founded", 0.95, 7),
        ("tom_bradley", "cloudbase_integration", "leads", 0.9, 7),
        ("elena_rodriguez", "series_a", "potential_advisor", 0.5, 14),
        ("nina_patel", "series_a", "legal_counsel", 0.85, 20),

        # Dormant relationships (old memories - for relationship health)
        ("david_park", "series_a", "interested", 0.6, 45),  # 45 days dormant
        ("jennifer_walsh", "cloudbase_integration", "consulting", 0.5, 65),  # 65 days dormant
        ("chris_morgan", "series_a", "advisor", 0.7, 95),  # 95 days dormant - at risk
        ("alex_kim", "acme_renewal", "design_work", 0.4, 35),

        # Cross connections
        ("sarah_chen", "marcus_johnson", "knows", 0.7, 12),
        ("sarah_chen", "rachel_torres", "knows", 0.5, 30),
        ("marcus_johnson", "tom_bradley", "collaborates", 0.8, 8),
        ("elena_rodriguez", "jennifer_walsh", "former_colleagues", 0.6, 60),
    ]

    print("\n📎 Creating relationships...")
    for source, target, rel_type, strength, days_since in relationships:
        db.insert("relationships", {
            "source_entity_id": entity_ids[source],
            "target_entity_id": entity_ids[target],
            "relationship_type": rel_type,
            "strength": strength,
            "created_at": days_ago(days_since),
            "updated_at": days_ago(days_since),
        })

    # =========================================================================
    # MEMORIES - Facts, commitments, observations
    # =========================================================================

    memories = [
        # Recent activity
        {
            "content": "Sarah Chen is very interested in the AI infrastructure angle. Wants to see the technical architecture doc.",
            "type": "fact",
            "importance": 0.85,
            "created_at": days_ago(3),
            "entities": ["sarah_chen", "series_a"]
        },
        {
            "content": "Call with Sarah went well. She's bringing in her technical partner for the next meeting.",
            "type": "observation",
            "importance": 0.8,
            "created_at": days_ago(5),
            "entities": ["sarah_chen"]
        },
        {
            "content": "Marcus introduced me to two other founders in the data space. Good network.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(10),
            "entities": ["marcus_johnson"]
        },
        {
            "content": "Tom confirmed the API spec is locked. Integration timeline is 6 weeks.",
            "type": "fact",
            "importance": 0.75,
            "created_at": days_ago(7),
            "entities": ["tom_bradley", "cloudbase_integration"]
        },
        {
            "content": "Elena mentioned she might be open to advising if the product roadmap aligns.",
            "type": "observation",
            "importance": 0.7,
            "created_at": days_ago(14),
            "entities": ["elena_rodriguez", "series_a"]
        },

        # Commitments - some overdue, some upcoming
        {
            "content": "Send updated pitch deck to Sarah by Friday",
            "type": "commitment",
            "importance": 0.9,
            "created_at": days_ago(5),
            "deadline": days_ago(2),  # OVERDUE
            "entities": ["sarah_chen", "series_a"]
        },
        {
            "content": "Follow up with David Park on angel check size",
            "type": "commitment",
            "importance": 0.7,
            "created_at": days_ago(10),
            "deadline": days_ago(7),  # OVERDUE
            "entities": ["david_park", "series_a"]
        },
        {
            "content": "Send Tom the integration test results",
            "type": "commitment",
            "importance": 0.8,
            "created_at": days_ago(3),
            "deadline": days_from_now(2),  # Due soon
            "entities": ["tom_bradley", "cloudbase_integration"]
        },
        {
            "content": "Review Acme renewal terms with Nina before sending",
            "type": "commitment",
            "importance": 0.85,
            "created_at": days_ago(7),
            "deadline": days_from_now(5),
            "entities": ["nina_patel", "acme_renewal"]
        },
        {
            "content": "Prepare board deck for Q1 review",
            "type": "commitment",
            "importance": 0.9,
            "created_at": days_ago(14),
            "deadline": days_from_now(10),
            "entities": []
        },

        # Waiting items (stored as facts with waiting context)
        {
            "content": "Waiting on Rachel Torres for intro to her LP network",
            "type": "fact",
            "importance": 0.8,
            "created_at": days_ago(12),
            "entities": ["rachel_torres", "series_a"]
        },
        {
            "content": "Waiting on Alex for the updated brand assets",
            "type": "fact",
            "importance": 0.5,
            "created_at": days_ago(20),
            "entities": ["alex_kim"]
        },
        {
            "content": "Waiting on Acme for their technical requirements doc",
            "type": "fact",
            "importance": 0.75,
            "created_at": days_ago(8),
            "entities": ["acme_corp", "acme_renewal"]
        },

        # Older memories for dormant relationships
        {
            "content": "David Park said he'd be interested in the round if we hit $1M ARR",
            "type": "fact",
            "importance": 0.7,
            "created_at": days_ago(45),
            "entities": ["david_park", "series_a"]
        },
        {
            "content": "Jennifer offered to review our engineering hiring plan",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(65),
            "entities": ["jennifer_walsh"]
        },
        {
            "content": "Chris Morgan connected me with two enterprise prospects",
            "type": "fact",
            "importance": 0.7,
            "created_at": days_ago(95),
            "entities": ["chris_morgan"]
        },

        # Preferences and learnings
        {
            "content": "Sarah prefers async updates over meetings. Send Loom videos.",
            "type": "preference",
            "importance": 0.6,
            "created_at": days_ago(20),
            "entities": ["sarah_chen"]
        },
        {
            "content": "Tom is most responsive early morning Pacific time",
            "type": "preference",
            "importance": 0.5,
            "created_at": days_ago(15),
            "entities": ["tom_bradley"]
        },
        {
            "content": "Always CC Nina's assistant when scheduling legal calls",
            "type": "preference",
            "importance": 0.5,
            "created_at": days_ago(25),
            "entities": ["nina_patel"]
        },
    ]

    print("\n🧠 Creating memories...")
    for mem in memories:
        entities = mem.pop("entities", [])
        deadline = mem.pop("deadline", None)

        # Add deadline to metadata if present
        if deadline:
            mem["metadata"] = json.dumps({"deadline": deadline})

        mem["content_hash"] = content_hash(mem["content"])
        mem_id = db.insert("memories", mem)

        # Link to entities
        for ent_key in entities:
            if ent_key in entity_ids:
                db.insert("memory_entities", {
                    "memory_id": mem_id,
                    "entity_id": entity_ids[ent_key]
                })

        print(f"  + {mem['type']}: {mem['content'][:50]}...")

    # =========================================================================
    # PATTERNS
    # =========================================================================

    patterns = [
        {
            "name": "Over-commitment tendency",
            "pattern_type": "behavioral",
            "description": "You tend to over-commit on deliverable timelines. Three missed deadlines this month.",
            "confidence": 0.8,
            "occurrences": 3,
            "first_observed_at": days_ago(30),
            "last_observed_at": days_ago(5),
        },
        {
            "name": "Metrics-first investor pitches",
            "pattern_type": "communication",
            "description": "Investor conversations go better when you lead with metrics, not vision.",
            "confidence": 0.7,
            "occurrences": 4,
            "first_observed_at": days_ago(45),
            "last_observed_at": days_ago(10),
        },
        {
            "name": "Tuesday/Thursday deep work",
            "pattern_type": "scheduling",
            "description": "Deep work sessions are most productive Tuesday and Thursday mornings.",
            "confidence": 0.75,
            "occurrences": 6,
            "first_observed_at": days_ago(60),
            "last_observed_at": days_ago(20),
        },
    ]

    print("\n🔍 Creating patterns...")
    for pattern in patterns:
        db.insert("patterns", pattern)
        print(f"  + {pattern['pattern_type']}: {pattern['description'][:50]}...")

    # =========================================================================
    # PREDICTIONS
    # =========================================================================

    predictions = [
        {
            "prediction_type": "warning",
            "content": "Chris Morgan relationship cooling - no contact in 95 days. Consider reaching out.",
            "priority": 0.8,
            "created_at": days_ago(1),
            "expires_at": days_from_now(7),
        },
        {
            "prediction_type": "warning",
            "content": "Pitch deck for Sarah is 2 days overdue. This could affect Series A momentum.",
            "priority": 0.95,
            "created_at": days_ago(0),
            "expires_at": days_from_now(3),
        },
        {
            "prediction_type": "suggestion",
            "content": "David Park and Ryan Foster are both Austin-based angels in On Deck. Intro opportunity?",
            "priority": 0.5,
            "created_at": days_ago(2),
            "expires_at": days_from_now(14),
        },
        {
            "prediction_type": "insight",
            "content": "Marcus and Lisa are both YC W24 building in AI infrastructure. They might know each other.",
            "priority": 0.4,
            "created_at": days_ago(3),
            "expires_at": days_from_now(14),
        },
        {
            "prediction_type": "reminder",
            "content": "Acme renewal conversation should happen this week - Q2 budget planning starts soon.",
            "priority": 0.85,
            "created_at": days_ago(1),
            "expires_at": days_from_now(5),
        },
    ]

    print("\n🔮 Creating predictions...")
    for pred in predictions:
        db.insert("predictions", pred)
        print(f"  + {pred['prediction_type']}: {pred['content'][:50]}...")

    # =========================================================================
    # EPISODES (past sessions)
    # =========================================================================

    episodes = [
        {
            "summary": "Morning planning session. Reviewed Series A progress, updated Sarah on technical architecture. Identified need to follow up with dormant investor relationships.",
            "started_at": days_ago(3) + "T09:00:00",
            "ended_at": days_ago(3) + "T09:45:00",
            "turn_count": 12,
        },
        {
            "summary": "Meeting prep for Tom Bradley call. Reviewed CloudBase integration timeline, prepared questions about API versioning strategy.",
            "started_at": days_ago(7) + "T14:00:00",
            "ended_at": days_ago(7) + "T14:30:00",
            "turn_count": 8,
        },
        {
            "summary": "Weekly review session. Processed 5 meeting notes, updated 3 people files, identified 2 overdue commitments.",
            "started_at": days_ago(10) + "T17:00:00",
            "ended_at": days_ago(10) + "T17:45:00",
            "turn_count": 15,
        },
    ]

    print("\n📅 Creating episodes...")
    for ep in episodes:
        db.insert("episodes", ep)
        print(f"  + {ep['summary'][:50]}...")

    print("\n✅ Demo database seeded successfully!")
    print(f"\n📊 Summary:")
    print(f"   - {len(people)} people")
    print(f"   - {len(orgs)} organizations")
    print(f"   - {len(projects)} projects")
    print(f"   - {len(relationships)} relationships")
    print(f"   - {len(memories)} memories")
    print(f"   - {len(patterns)} patterns")
    print(f"   - {len(predictions)} predictions")
    print(f"   - {len(episodes)} episodes")


def get_demo_db_path() -> Path:
    """Return the safe, isolated demo database path."""
    # Demo database ALWAYS goes in a dedicated demo directory
    # This prevents any possibility of overwriting real user data
    return Path(os.path.expanduser("~/.claudia/demo/claudia-demo.db"))


def main():
    parser = argparse.ArgumentParser(description="Seed Claudia demo database")
    parser.add_argument(
        "--workspace",
        help="Target workspace directory (creates workspace-specific demo db)"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing demo database"
    )
    args = parser.parse_args()

    # SAFETY: Demo database ALWAYS goes in isolated demo directory
    # Never in the main memory directory where real data lives
    if args.workspace:
        # For workspace-specific demo, still use demo subdirectory
        workspace_hash = hash(args.workspace) & 0xFFFFFFFF
        db_path = Path(os.path.expanduser(f"~/.claudia/demo/{workspace_hash:08x}.db"))
    else:
        db_path = get_demo_db_path()

    # Create demo directory if needed
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # SAFETY CHECK: Refuse to write to main memory directory
    if "memory" in str(db_path) and "demo" not in str(db_path):
        print("❌ SAFETY: Cannot write demo data to main memory directory")
        print("   Demo data is isolated in ~/.claudia/demo/")
        sys.exit(1)

    # Check for existing database
    if db_path.exists():
        if args.force:
            print(f"🗑️  Removing existing demo database: {db_path}")
            db_path.unlink()
        else:
            print(f"❌ Demo database already exists: {db_path}")
            print("   Use --force to overwrite")
            sys.exit(1)

    print(f"📁 Creating demo database: {db_path}")
    print("   (isolated in ~/.claudia/demo/ - your real data is safe)")

    # Create and seed database
    db = Database(db_path)
    try:
        # Initialize schema
        print("📋 Initializing schema...")
        db.initialize()
        seed_database(db)
    finally:
        db.close()

    print(f"\n🎉 Done! Demo database ready at: {db_path}")
    print(f"\n📋 To use the demo database:")
    print(f"   export CLAUDIA_DEMO_MODE=1")
    print(f"\n   Or copy to a test installation:")
    print(f"   cp {db_path} <your-test-install>/.claudia/memory/claudia.db")


if __name__ == "__main__":
    main()
