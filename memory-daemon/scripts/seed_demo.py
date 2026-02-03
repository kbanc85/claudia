#!/usr/bin/env python3
"""
Seed Demo Database

Creates a realistic demo database showcasing Claudia's features:
- 60 people across investor, founder, advisor, operator, and service provider networks
- 15 organizations (VC funds, startups, enterprises, agencies)
- 15 projects (fundraising, product, partnerships, operations, events)
- 70+ relationships with varying recency and strength
- 110+ memories (facts, commitments, observations, preferences, learnings)
- 15 patterns (behavioral, communication, scheduling, decision-making)
- 25 predictions (warnings, suggestions, insights, reminders)
- 15 episodes (various session types)

Run: python scripts/seed_demo.py [--force]
Default: ~/.claudia/demo/claudia-demo.db
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
    # PEOPLE - 60 total across multiple networks
    # =========================================================================

    people = [
        # =====================================================================
        # INVESTORS (12) - VCs, Angels, Family Office
        # =====================================================================
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
        {
            "name": "Michael Huang",
            "canonical_name": "michael_huang",
            "type": "person",
            "description": "Partner at Greylock. Deep enterprise SaaS background. Former Workday exec.",
            "importance": 0.9,
            "metadata": json.dumps({
                "geography": {"city": "Menlo Park", "state": "CA", "country": "US"},
                "industry": ["venture capital", "enterprise SaaS"],
                "role": "Partner",
                "company": "Greylock Partners",
                "communities": ["Kauffman Fellows"]
            })
        },
        {
            "name": "Priya Sharma",
            "canonical_name": "priya_sharma",
            "type": "person",
            "description": "Principal at Lightspeed. Rising star, focuses on AI/ML infrastructure. Very responsive.",
            "importance": 0.75,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["venture capital", "AI/ML"],
                "role": "Principal",
                "company": "Lightspeed Venture Partners",
                "communities": ["Kauffman Fellows"]
            })
        },
        {
            "name": "James Wilson",
            "canonical_name": "james_wilson",
            "type": "person",
            "description": "Family office investor. Tech background, patient capital. Prefers co-investing.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "Dallas", "state": "TX", "country": "US"},
                "industry": ["family office", "technology"],
                "role": "Principal",
                "company": "Wilson Family Office",
                "communities": []
            })
        },
        {
            "name": "Amanda Liu",
            "canonical_name": "amanda_liu",
            "type": "person",
            "description": "GP at Initialized Capital. Former Stripe PM. Loves product-led growth companies.",
            "importance": 0.85,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["venture capital", "fintech"],
                "role": "General Partner",
                "company": "Initialized Capital",
                "communities": ["All Raise"]
            })
        },
        {
            "name": "Kevin O'Brien",
            "canonical_name": "kevin_obrien",
            "type": "person",
            "description": "Seed investor at Founder Collective. Operator background. Good for early feedback.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "Boston", "state": "MA", "country": "US"},
                "industry": ["venture capital", "seed"],
                "role": "Partner",
                "company": "Founder Collective",
                "communities": []
            })
        },
        {
            "name": "Diana Martinez",
            "canonical_name": "diana_martinez",
            "type": "person",
            "description": "Angel investor. Former Google exec. Writes $25-50k checks. Quick decisions.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "Mountain View", "state": "CA", "country": "US"},
                "industry": ["angel investing", "technology"],
                "role": "Angel Investor",
                "company": "Independent",
                "communities": ["Tech Angels SF"]
            })
        },
        {
            "name": "Robert Chang",
            "canonical_name": "robert_chang",
            "type": "person",
            "description": "Partner at NEA. Growth stage investor. Looks for $5M+ ARR companies.",
            "importance": 0.8,
            "metadata": json.dumps({
                "geography": {"city": "Menlo Park", "state": "CA", "country": "US"},
                "industry": ["venture capital", "growth"],
                "role": "Partner",
                "company": "NEA",
                "communities": []
            })
        },
        {
            "name": "Jennifer Walsh",
            "canonical_name": "jennifer_walsh_investor",
            "type": "person",
            "description": "Partner at Index Ventures. European connections. Strong in fintech and SaaS.",
            "importance": 0.75,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["venture capital", "fintech"],
                "role": "Partner",
                "company": "Index Ventures",
                "communities": []
            })
        },

        # =====================================================================
        # FOUNDERS (15) - Various stages and industries
        # =====================================================================
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
            "name": "Daniel Kim",
            "canonical_name": "daniel_kim",
            "type": "person",
            "description": "CEO of NeuralPath. AI diagnostics for healthcare. Series A stage. Strong team.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "Boston", "state": "MA", "country": "US"},
                "industry": ["healthtech", "AI"],
                "role": "CEO",
                "company": "NeuralPath",
                "communities": ["Techstars Boston"]
            })
        },
        {
            "name": "Sophie Anderson",
            "canonical_name": "sophie_anderson",
            "type": "person",
            "description": "Founder of Bloom. B2B marketplace for sustainable goods. Seed stage.",
            "importance": 0.55,
            "metadata": json.dumps({
                "geography": {"city": "New York", "state": "NY", "country": "US"},
                "industry": ["marketplace", "sustainability"],
                "role": "Founder",
                "company": "Bloom",
                "communities": ["Climate Tech NYC"]
            })
        },
        {
            "name": "Alex Rivera",
            "canonical_name": "alex_rivera",
            "type": "person",
            "description": "Co-founder of FinFlow. CFO automation platform. Former Stripe engineer. YC S24.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["fintech", "automation"],
                "role": "Co-founder",
                "company": "FinFlow",
                "communities": ["YC S24"]
            })
        },
        {
            "name": "Emma Thompson",
            "canonical_name": "emma_thompson",
            "type": "person",
            "description": "Founder of DevSecure. Security tooling for developers. Pre-seed. Ex-Cloudflare.",
            "importance": 0.5,
            "metadata": json.dumps({
                "geography": {"city": "Austin", "state": "TX", "country": "US"},
                "industry": ["security", "developer tools"],
                "role": "Founder",
                "company": "DevSecure",
                "communities": []
            })
        },
        {
            "name": "Jason Patel",
            "canonical_name": "jason_patel",
            "type": "person",
            "description": "CEO of Metric Labs. PLG analytics platform. Series B. Growing fast.",
            "importance": 0.75,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["analytics", "SaaS"],
                "role": "CEO",
                "company": "Metric Labs",
                "communities": ["YC W22"]
            })
        },
        {
            "name": "Maya Roberts",
            "canonical_name": "maya_roberts",
            "type": "person",
            "description": "Founder of TalentAI. AI recruiting assistant. Seed stage. Strong vision.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["HR tech", "AI"],
                "role": "Founder",
                "company": "TalentAI",
                "communities": []
            })
        },
        {
            "name": "Chris Nakamura",
            "canonical_name": "chris_nakamura",
            "type": "person",
            "description": "Co-founder of EdgeML. ML at the edge for IoT. Deep technical. Pre-seed.",
            "importance": 0.5,
            "metadata": json.dumps({
                "geography": {"city": "Seattle", "state": "WA", "country": "US"},
                "industry": ["IoT", "machine learning"],
                "role": "Co-founder",
                "company": "EdgeML",
                "communities": []
            })
        },
        {
            "name": "Natalie Green",
            "canonical_name": "natalie_green",
            "type": "person",
            "description": "CEO of Productboard. Product management SaaS. Series C. Good potential customer.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["product management", "SaaS"],
                "role": "CEO",
                "company": "Productboard",
                "communities": []
            })
        },
        {
            "name": "Andrew Lee",
            "canonical_name": "andrew_lee",
            "type": "person",
            "description": "Founder of CodeReview AI. AI code review assistant. Seed stage. Good demo.",
            "importance": 0.55,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["developer tools", "AI"],
                "role": "Founder",
                "company": "CodeReview AI",
                "communities": ["YC W24"]
            })
        },
        {
            "name": "Rachel Kim",
            "canonical_name": "rachel_kim_founder",
            "type": "person",
            "description": "Co-founder of WorkspaceOS. Workspace management for remote teams. Series A.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "New York", "state": "NY", "country": "US"},
                "industry": ["remote work", "SaaS"],
                "role": "Co-founder",
                "company": "WorkspaceOS",
                "communities": []
            })
        },
        {
            "name": "Matt Chen",
            "canonical_name": "matt_chen",
            "type": "person",
            "description": "Founder of APIHub. API marketplace and management. Growing quickly. YC S23.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["developer tools", "API"],
                "role": "Founder",
                "company": "APIHub",
                "communities": ["YC S23"]
            })
        },
        {
            "name": "Olivia Wu",
            "canonical_name": "olivia_wu",
            "type": "person",
            "description": "CEO of DataVault. Data privacy compliance platform. Series A. Strong enterprise traction.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["data privacy", "compliance"],
                "role": "CEO",
                "company": "DataVault",
                "communities": []
            })
        },

        # =====================================================================
        # ADVISORS (8) - Domain experts, former execs
        # =====================================================================
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
        {
            "name": "Patricia Hayes",
            "canonical_name": "patricia_hayes",
            "type": "person",
            "description": "Former CMO at Salesforce. Go-to-market advisor. Expensive but worth it.",
            "importance": 0.75,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["marketing", "enterprise"],
                "role": "Advisor",
                "company": "Independent",
                "communities": ["Chief"]
            })
        },
        {
            "name": "David Chen",
            "canonical_name": "david_chen_advisor",
            "type": "person",
            "description": "Former VP Engineering at Stripe. Technical advisor. Very selective about who he works with.",
            "importance": 0.8,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["engineering", "fintech"],
                "role": "Advisor",
                "company": "Independent",
                "communities": []
            })
        },
        {
            "name": "Michelle Wong",
            "canonical_name": "michelle_wong",
            "type": "person",
            "description": "Former VP Product at Figma. Product strategy advisor. Amazing at positioning.",
            "importance": 0.75,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["product", "design tools"],
                "role": "Advisor",
                "company": "Independent",
                "communities": []
            })
        },
        {
            "name": "Robert Taylor",
            "canonical_name": "robert_taylor",
            "type": "person",
            "description": "Former CRO at Zoom. Sales advisor. Knows enterprise sales inside out.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "San Jose", "state": "CA", "country": "US"},
                "industry": ["sales", "enterprise"],
                "role": "Advisor",
                "company": "Independent",
                "communities": []
            })
        },
        {
            "name": "Sarah Mitchell",
            "canonical_name": "sarah_mitchell",
            "type": "person",
            "description": "Former COO at Slack. Operations advisor. Helped scale from 50 to 500.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["operations", "scaling"],
                "role": "Advisor",
                "company": "Independent",
                "communities": []
            })
        },
        {
            "name": "John Williams",
            "canonical_name": "john_williams",
            "type": "person",
            "description": "Former CFO at Dropbox. Financial advisor. Good for fundraising strategy.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["finance", "SaaS"],
                "role": "Advisor",
                "company": "Independent",
                "communities": []
            })
        },
        {
            "name": "Linda Garcia",
            "canonical_name": "linda_garcia",
            "type": "person",
            "description": "Former VP People at Netflix. Culture and org design advisor. Opinionated.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "Los Angeles", "state": "CA", "country": "US"},
                "industry": ["HR", "culture"],
                "role": "Advisor",
                "company": "Independent",
                "communities": []
            })
        },

        # =====================================================================
        # OPERATORS (12) - Engineering, Product, Sales leaders
        # =====================================================================
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
            "name": "Brian Mitchell",
            "canonical_name": "brian_mitchell",
            "type": "person",
            "description": "Head of Sales at Datadog. Enterprise sales expertise. Met at SaaStr.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "New York", "state": "NY", "country": "US"},
                "industry": ["observability", "enterprise"],
                "role": "Head of Sales",
                "company": "Datadog",
                "communities": []
            })
        },
        {
            "name": "Amy Zhang",
            "canonical_name": "amy_zhang",
            "type": "person",
            "description": "VP Product at Figma. Design tools background. Potential design partner.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["design", "productivity"],
                "role": "VP Product",
                "company": "Figma",
                "communities": []
            })
        },
        {
            "name": "Mike Santos",
            "canonical_name": "mike_santos",
            "type": "person",
            "description": "Director of Engineering at Airbnb. Platform expertise. Ex-Meta.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["marketplace", "platform"],
                "role": "Director of Engineering",
                "company": "Airbnb",
                "communities": []
            })
        },
        {
            "name": "Karen Lee",
            "canonical_name": "karen_lee",
            "type": "person",
            "description": "Head of Growth at Canva. Growth marketing expert. Great at PLG.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["design", "growth"],
                "role": "Head of Growth",
                "company": "Canva",
                "communities": []
            })
        },
        {
            "name": "Steven Park",
            "canonical_name": "steven_park",
            "type": "person",
            "description": "VP Customer Success at Twilio. Customer success pioneer. Very data-driven.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["communications", "customer success"],
                "role": "VP Customer Success",
                "company": "Twilio",
                "communities": []
            })
        },
        {
            "name": "Laura Chen",
            "canonical_name": "laura_chen",
            "type": "person",
            "description": "Head of Design at Airtable. Design systems expert. Potential advisor.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["design", "productivity"],
                "role": "Head of Design",
                "company": "Airtable",
                "communities": []
            })
        },
        {
            "name": "Mark Thompson",
            "canonical_name": "mark_thompson",
            "type": "person",
            "description": "VP Engineering at Snowflake. Data infrastructure background. Good technical sounding board.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "San Mateo", "state": "CA", "country": "US"},
                "industry": ["data", "cloud"],
                "role": "VP Engineering",
                "company": "Snowflake",
                "communities": []
            })
        },
        {
            "name": "Jessica Wu",
            "canonical_name": "jessica_wu",
            "type": "person",
            "description": "Director of Product at Shopify. E-commerce expertise. Potential partnership contact.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["e-commerce", "platform"],
                "role": "Director of Product",
                "company": "Shopify",
                "communities": []
            })
        },
        {
            "name": "Ryan Anderson",
            "canonical_name": "ryan_anderson",
            "type": "person",
            "description": "Head of Partnerships at HubSpot. BD and partnerships expert. Always has deals cooking.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "Boston", "state": "MA", "country": "US"},
                "industry": ["marketing tech", "partnerships"],
                "role": "Head of Partnerships",
                "company": "HubSpot",
                "communities": []
            })
        },
        {
            "name": "Nicole Kim",
            "canonical_name": "nicole_kim",
            "type": "person",
            "description": "VP Marketing at Asana. Brand and content marketing. Could help with positioning.",
            "importance": 0.55,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["productivity", "marketing"],
                "role": "VP Marketing",
                "company": "Asana",
                "communities": []
            })
        },

        # =====================================================================
        # SERVICE PROVIDERS (8) - Legal, Design, Recruiting, PR
        # =====================================================================
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
            "name": "Sam Rodriguez",
            "canonical_name": "sam_rodriguez",
            "type": "person",
            "description": "Tech recruiter specializing in engineering leadership. Placed CTO at three YC companies.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["recruiting", "technology"],
                "role": "Recruiter",
                "company": "Rodriguez Search",
                "communities": []
            })
        },
        {
            "name": "Emily Harris",
            "canonical_name": "emily_harris",
            "type": "person",
            "description": "PR consultant. Specializes in tech startups. Good media relationships.",
            "importance": 0.55,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["PR", "communications"],
                "role": "PR Consultant",
                "company": "Harris Communications",
                "communities": []
            })
        },
        {
            "name": "James Lee",
            "canonical_name": "james_lee",
            "type": "person",
            "description": "Accountant specializing in startups. R&D tax credits expert. Handles our books.",
            "importance": 0.55,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["accounting", "startups"],
                "role": "CPA",
                "company": "Lee & Associates",
                "communities": []
            })
        },
        {
            "name": "Maria Santos",
            "canonical_name": "maria_santos",
            "type": "person",
            "description": "UX researcher. Runs user testing for several startups. Methodical, insightful reports.",
            "importance": 0.5,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["UX research", "design"],
                "role": "UX Researcher",
                "company": "Independent",
                "communities": []
            })
        },
        {
            "name": "Tom Harrison",
            "canonical_name": "tom_harrison",
            "type": "person",
            "description": "Content writer. Tech blog expertise. Writes for several startup blogs.",
            "importance": 0.45,
            "metadata": json.dumps({
                "geography": {"city": "Austin", "state": "TX", "country": "US"},
                "industry": ["content", "marketing"],
                "role": "Content Writer",
                "company": "Independent",
                "communities": []
            })
        },
        {
            "name": "Lisa Brown",
            "canonical_name": "lisa_brown",
            "type": "person",
            "description": "Executive coach. Works with founders on leadership development. Highly recommended.",
            "importance": 0.5,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["coaching", "leadership"],
                "role": "Executive Coach",
                "company": "Independent",
                "communities": []
            })
        },

        # =====================================================================
        # ENTERPRISE CONTACTS (5) - Customer champions, buyers
        # =====================================================================
        {
            "name": "Michael Stevens",
            "canonical_name": "michael_stevens",
            "type": "person",
            "description": "VP Engineering at Acme Corp. Champion for our product. Driving the renewal.",
            "importance": 0.8,
            "metadata": json.dumps({
                "geography": {"city": "Chicago", "state": "IL", "country": "US"},
                "industry": ["enterprise", "manufacturing"],
                "role": "VP Engineering",
                "company": "Acme Corp",
                "communities": []
            })
        },
        {
            "name": "Susan Park",
            "canonical_name": "susan_park",
            "type": "person",
            "description": "Director of IT at TechCorp. Evaluating us for enterprise deployment. Price sensitive.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "Seattle", "state": "WA", "country": "US"},
                "industry": ["enterprise", "technology"],
                "role": "Director of IT",
                "company": "TechCorp",
                "communities": []
            })
        },
        {
            "name": "David Brown",
            "canonical_name": "david_brown",
            "type": "person",
            "description": "CTO at GlobalFinance. Major prospect. Very security focused.",
            "importance": 0.85,
            "metadata": json.dumps({
                "geography": {"city": "New York", "state": "NY", "country": "US"},
                "industry": ["finance", "enterprise"],
                "role": "CTO",
                "company": "GlobalFinance",
                "communities": []
            })
        },
        {
            "name": "Jennifer Adams",
            "canonical_name": "jennifer_adams",
            "type": "person",
            "description": "Head of Procurement at MegaRetail. Handles vendor relationships. Process oriented.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "Minneapolis", "state": "MN", "country": "US"},
                "industry": ["retail", "enterprise"],
                "role": "Head of Procurement",
                "company": "MegaRetail",
                "communities": []
            })
        },
        {
            "name": "Robert Wilson",
            "canonical_name": "robert_wilson",
            "type": "person",
            "description": "IT Manager at HealthSys. Pilot customer. Very engaged, provides great feedback.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "Boston", "state": "MA", "country": "US"},
                "industry": ["healthcare", "enterprise"],
                "role": "IT Manager",
                "company": "HealthSys",
                "communities": []
            })
        },
    ]

    entity_ids = {}
    print("\n👥 Creating people...")
    for person in people:
        eid = db.insert("entities", person)
        entity_ids[person["canonical_name"]] = eid

    print(f"   Created {len(people)} people")

    # =========================================================================
    # ORGANIZATIONS (15 total)
    # =========================================================================

    orgs = [
        # VC Funds (4)
        {
            "name": "Meridian Ventures",
            "canonical_name": "meridian_ventures",
            "type": "organization",
            "description": "Early-stage VC fund. $200M AUM. Focus on AI and infrastructure.",
            "importance": 0.8,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["venture capital"],
                "org_type": "VC fund",
                "stage": "Seed to Series A"
            })
        },
        {
            "name": "Lightspeed Venture Partners",
            "canonical_name": "lightspeed",
            "type": "organization",
            "description": "Multi-stage VC. Strong enterprise portfolio. Have done our last two rounds.",
            "importance": 0.85,
            "metadata": json.dumps({
                "geography": {"city": "Menlo Park", "state": "CA", "country": "US"},
                "industry": ["venture capital"],
                "org_type": "VC fund",
                "stage": "Seed to Growth"
            })
        },
        {
            "name": "Founder Collective",
            "canonical_name": "founder_collective",
            "type": "organization",
            "description": "Seed-stage fund. Operator-led. Good for early feedback.",
            "importance": 0.7,
            "metadata": json.dumps({
                "geography": {"city": "Boston", "state": "MA", "country": "US"},
                "industry": ["venture capital"],
                "org_type": "VC fund",
                "stage": "Seed"
            })
        },
        {
            "name": "Index Ventures",
            "canonical_name": "index_ventures",
            "type": "organization",
            "description": "Global VC. Strong European connections. Known for supporting founders.",
            "importance": 0.75,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["venture capital"],
                "org_type": "VC fund",
                "stage": "Seed to Growth"
            })
        },

        # Startups (5)
        {
            "name": "CloudBase",
            "canonical_name": "cloudbase",
            "type": "organization",
            "description": "Cloud infrastructure startup. YC S23. Building with them on API integration.",
            "importance": 0.75,
            "metadata": json.dumps({
                "geography": {"city": "Seattle", "state": "WA", "country": "US"},
                "industry": ["technology", "cloud infrastructure"],
                "org_type": "startup",
                "stage": "Series A"
            })
        },
        {
            "name": "DataSync",
            "canonical_name": "datasync",
            "type": "organization",
            "description": "Data infrastructure company. Marcus's company. Potential integration partner.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["technology", "data infrastructure"],
                "org_type": "startup",
                "stage": "Seed"
            })
        },
        {
            "name": "FinFlow",
            "canonical_name": "finflow",
            "type": "organization",
            "description": "CFO automation platform. Alex's company. YC S24. Good referral partner.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["fintech", "automation"],
                "org_type": "startup",
                "stage": "Seed"
            })
        },
        {
            "name": "APIHub",
            "canonical_name": "apihub",
            "type": "organization",
            "description": "API marketplace. Matt's company. Integration in progress.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["developer tools", "API"],
                "org_type": "startup",
                "stage": "Series A"
            })
        },
        {
            "name": "Metric Labs",
            "canonical_name": "metric_labs",
            "type": "organization",
            "description": "PLG analytics platform. Jason's company. Potential customer and partner.",
            "importance": 0.6,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["analytics", "SaaS"],
                "org_type": "startup",
                "stage": "Series B"
            })
        },

        # Enterprises (4)
        {
            "name": "Acme Corp",
            "canonical_name": "acme_corp",
            "type": "organization",
            "description": "Enterprise customer. 500 seats. Renewal coming up in Q2.",
            "importance": 0.85,
            "metadata": json.dumps({
                "geography": {"city": "Chicago", "state": "IL", "country": "US"},
                "industry": ["enterprise", "manufacturing"],
                "org_type": "enterprise",
                "contract_value": "$150k ARR"
            })
        },
        {
            "name": "TechCorp",
            "canonical_name": "techcorp",
            "type": "organization",
            "description": "Major prospect. 2000 employees. In late-stage evaluation.",
            "importance": 0.8,
            "metadata": json.dumps({
                "geography": {"city": "Seattle", "state": "WA", "country": "US"},
                "industry": ["enterprise", "technology"],
                "org_type": "enterprise",
                "deal_size": "$300k ARR potential"
            })
        },
        {
            "name": "GlobalFinance",
            "canonical_name": "globalfinance",
            "type": "organization",
            "description": "Financial services enterprise. High security requirements. Huge potential deal.",
            "importance": 0.9,
            "metadata": json.dumps({
                "geography": {"city": "New York", "state": "NY", "country": "US"},
                "industry": ["finance", "enterprise"],
                "org_type": "enterprise",
                "deal_size": "$500k ARR potential"
            })
        },
        {
            "name": "HealthSys",
            "canonical_name": "healthsys",
            "type": "organization",
            "description": "Healthcare IT company. Pilot customer. Good case study potential.",
            "importance": 0.65,
            "metadata": json.dumps({
                "geography": {"city": "Boston", "state": "MA", "country": "US"},
                "industry": ["healthcare", "enterprise"],
                "org_type": "enterprise",
                "contract_value": "$50k ARR"
            })
        },

        # Agencies (2)
        {
            "name": "Pixel Perfect Studio",
            "canonical_name": "pixel_perfect",
            "type": "organization",
            "description": "Design agency. Did our product redesign. Alex works here part-time.",
            "importance": 0.55,
            "metadata": json.dumps({
                "geography": {"city": "Los Angeles", "state": "CA", "country": "US"},
                "industry": ["design", "agency"],
                "org_type": "agency"
            })
        },
        {
            "name": "Harris Communications",
            "canonical_name": "harris_comms",
            "type": "organization",
            "description": "PR agency. Emily's firm. Handles our media relations.",
            "importance": 0.5,
            "metadata": json.dumps({
                "geography": {"city": "San Francisco", "state": "CA", "country": "US"},
                "industry": ["PR", "communications"],
                "org_type": "agency"
            })
        },
    ]

    print("\n🏢 Creating organizations...")
    for org in orgs:
        eid = db.insert("entities", org)
        entity_ids[org["canonical_name"]] = eid

    print(f"   Created {len(orgs)} organizations")

    # =========================================================================
    # PROJECTS (15 total)
    # =========================================================================

    projects = [
        # Fundraising (3)
        {
            "name": "Series A Fundraise",
            "canonical_name": "series_a",
            "type": "project",
            "description": "Raising $8M Series A. Target close by end of Q1.",
            "importance": 0.95,
            "metadata": json.dumps({
                "status": "active",
                "target": "$8M",
                "timeline": "Q1 2026",
                "category": "fundraising"
            })
        },
        {
            "name": "Bridge Round",
            "canonical_name": "bridge_round",
            "type": "project",
            "description": "$500k bridge from existing investors. Extend runway to Series A.",
            "importance": 0.8,
            "metadata": json.dumps({
                "status": "active",
                "target": "$500k",
                "timeline": "February 2026",
                "category": "fundraising"
            })
        },
        {
            "name": "SAFE Notes - Angels",
            "canonical_name": "safe_angels",
            "type": "project",
            "description": "Collecting $200k in SAFE notes from angel investors.",
            "importance": 0.65,
            "metadata": json.dumps({
                "status": "active",
                "target": "$200k",
                "committed": "$125k",
                "category": "fundraising"
            })
        },

        # Product (4)
        {
            "name": "CloudBase Integration",
            "canonical_name": "cloudbase_integration",
            "type": "project",
            "description": "API integration partnership with CloudBase. Joint go-to-market.",
            "importance": 0.8,
            "metadata": json.dumps({
                "status": "active",
                "partner": "CloudBase",
                "timeline": "6 weeks",
                "category": "product"
            })
        },
        {
            "name": "V2 Launch",
            "canonical_name": "v2_launch",
            "type": "project",
            "description": "Major product update. New UI, AI features, enterprise capabilities.",
            "importance": 0.9,
            "metadata": json.dumps({
                "status": "active",
                "timeline": "March 2026",
                "category": "product"
            })
        },
        {
            "name": "APIHub Integration",
            "canonical_name": "apihub_integration",
            "type": "project",
            "description": "Integration with APIHub marketplace. Distribution channel.",
            "importance": 0.7,
            "metadata": json.dumps({
                "status": "active",
                "partner": "APIHub",
                "timeline": "4 weeks",
                "category": "product"
            })
        },
        {
            "name": "Mobile App MVP",
            "canonical_name": "mobile_mvp",
            "type": "project",
            "description": "Mobile companion app. MVP for enterprise customers.",
            "importance": 0.6,
            "metadata": json.dumps({
                "status": "planning",
                "timeline": "Q2 2026",
                "category": "product"
            })
        },

        # Partnerships (3)
        {
            "name": "Metric Labs Co-Marketing",
            "canonical_name": "metric_labs_comarketing",
            "type": "project",
            "description": "Joint marketing campaign with Metric Labs. Webinar and content.",
            "importance": 0.6,
            "metadata": json.dumps({
                "status": "active",
                "partner": "Metric Labs",
                "category": "partnership"
            })
        },
        {
            "name": "FinFlow Referral Program",
            "canonical_name": "finflow_referral",
            "type": "project",
            "description": "Mutual referral agreement with FinFlow.",
            "importance": 0.55,
            "metadata": json.dumps({
                "status": "active",
                "partner": "FinFlow",
                "category": "partnership"
            })
        },
        {
            "name": "Reseller Partnership - Enterprise",
            "canonical_name": "reseller_enterprise",
            "type": "project",
            "description": "Exploring reseller partnerships for enterprise distribution.",
            "importance": 0.65,
            "metadata": json.dumps({
                "status": "exploration",
                "category": "partnership"
            })
        },

        # Operations (3)
        {
            "name": "Acme Renewal",
            "canonical_name": "acme_renewal",
            "type": "project",
            "description": "Acme Corp contract renewal. 500 seats, potential upsell to 800.",
            "importance": 0.85,
            "metadata": json.dumps({
                "status": "active",
                "current_seats": 500,
                "target_seats": 800,
                "category": "operations"
            })
        },
        {
            "name": "Engineering Hiring",
            "canonical_name": "eng_hiring",
            "type": "project",
            "description": "Hiring 3 senior engineers. Focus on backend and ML.",
            "importance": 0.75,
            "metadata": json.dumps({
                "status": "active",
                "roles": ["Senior Backend", "ML Engineer", "Platform Engineer"],
                "category": "operations"
            })
        },
        {
            "name": "SOC2 Compliance",
            "canonical_name": "soc2_compliance",
            "type": "project",
            "description": "SOC2 Type II certification. Required for enterprise deals.",
            "importance": 0.8,
            "metadata": json.dumps({
                "status": "active",
                "deadline": "Q2 2026",
                "category": "operations"
            })
        },

        # Events (2)
        {
            "name": "SaaStr Conference",
            "canonical_name": "saastr_conf",
            "type": "project",
            "description": "SaaStr Annual 2026. Speaking slot, booth, investor meetings.",
            "importance": 0.7,
            "metadata": json.dumps({
                "status": "active",
                "date": "March 2026",
                "category": "events"
            })
        },
        {
            "name": "Customer Summit",
            "canonical_name": "customer_summit",
            "type": "project",
            "description": "Annual customer event. Virtual format. Product roadmap and networking.",
            "importance": 0.6,
            "metadata": json.dumps({
                "status": "planning",
                "date": "April 2026",
                "category": "events"
            })
        },
    ]

    print("\n📁 Creating projects...")
    for proj in projects:
        eid = db.insert("entities", proj)
        entity_ids[proj["canonical_name"]] = eid

    print(f"   Created {len(projects)} projects")

    # =========================================================================
    # RELATIONSHIPS (70+ connections)
    # =========================================================================

    relationships = [
        # Investor relationships
        ("sarah_chen", "meridian_ventures", "leads", 0.95, 5),
        ("sarah_chen", "series_a", "evaluating", 0.8, 3),
        ("rachel_torres", "series_a", "potential_lead", 0.6, 15),
        ("michael_huang", "series_a", "passed", 0.3, 30),
        ("priya_sharma", "series_a", "interested", 0.7, 8),
        ("amanda_liu", "series_a", "evaluating", 0.75, 5),
        ("kevin_obrien", "bridge_round", "committed", 0.85, 10),
        ("david_park", "safe_angels", "committed", 0.8, 20),
        ("ryan_foster", "safe_angels", "interested", 0.5, 25),
        ("diana_martinez", "safe_angels", "committed", 0.75, 15),
        ("james_wilson", "series_a", "interested", 0.5, 40),
        ("robert_chang", "series_a", "too_early", 0.2, 45),
        ("jennifer_walsh_investor", "series_a", "evaluating", 0.6, 12),
        ("priya_sharma", "lightspeed", "works_at", 0.95, 1),

        # Founder connections
        ("marcus_johnson", "datasync", "founded", 0.95, 1),
        ("marcus_johnson", "series_a", "advising", 0.6, 10),
        ("tom_bradley", "cloudbase", "co_founded", 0.95, 1),
        ("tom_bradley", "cloudbase_integration", "leads", 0.9, 7),
        ("lisa_chang", "series_a", "intro_pending", 0.4, 20),
        ("daniel_kim", "series_a", "referred", 0.5, 25),
        ("alex_rivera", "finflow", "co_founded", 0.95, 1),
        ("alex_rivera", "finflow_referral", "leads", 0.8, 12),
        ("jason_patel", "metric_labs", "founded", 0.95, 1),
        ("jason_patel", "metric_labs_comarketing", "leads", 0.85, 8),
        ("matt_chen", "apihub", "founded", 0.95, 1),
        ("matt_chen", "apihub_integration", "leads", 0.85, 5),
        ("olivia_wu", "soc2_compliance", "advising", 0.6, 15),
        ("andrew_lee", "v2_launch", "beta_tester", 0.5, 10),

        # Advisor relationships
        ("chris_morgan", "series_a", "advisor", 0.7, 95),  # Dormant
        ("patricia_hayes", "v2_launch", "advising", 0.65, 30),
        ("david_chen_advisor", "eng_hiring", "advising", 0.75, 20),
        ("michelle_wong", "v2_launch", "advising", 0.8, 15),
        ("robert_taylor", "acme_renewal", "advising", 0.6, 25),
        ("sarah_mitchell", "eng_hiring", "advising", 0.55, 40),
        ("john_williams", "series_a", "advising", 0.7, 35),
        ("linda_garcia", "eng_hiring", "advising", 0.5, 50),

        # Operator connections
        ("elena_rodriguez", "series_a", "potential_advisor", 0.5, 14),
        ("jennifer_walsh", "cloudbase_integration", "consulting", 0.5, 65),  # Dormant
        ("amy_zhang", "v2_launch", "design_feedback", 0.6, 18),
        ("brian_mitchell", "saastr_conf", "speaking", 0.5, 20),
        ("karen_lee", "metric_labs_comarketing", "collaborating", 0.55, 12),
        ("steven_park", "customer_summit", "speaking", 0.5, 15),
        ("laura_chen", "v2_launch", "design_review", 0.55, 22),
        ("mark_thompson", "cloudbase_integration", "technical_review", 0.6, 10),
        ("jessica_wu", "reseller_enterprise", "exploring", 0.45, 30),
        ("ryan_anderson", "reseller_enterprise", "exploring", 0.5, 25),
        ("nicole_kim", "v2_launch", "marketing_input", 0.4, 35),

        # Service provider relationships
        ("nina_patel", "series_a", "legal_counsel", 0.85, 20),
        ("nina_patel", "soc2_compliance", "legal_counsel", 0.8, 15),
        ("alex_kim", "v2_launch", "design_work", 0.7, 12),
        ("alex_kim", "pixel_perfect", "works_at", 0.8, 1),
        ("sam_rodriguez", "eng_hiring", "recruiting", 0.75, 10),
        ("emily_harris", "saastr_conf", "pr_support", 0.65, 18),
        ("emily_harris", "harris_comms", "leads", 0.95, 1),
        ("james_lee", "soc2_compliance", "accounting", 0.7, 20),
        ("maria_santos", "v2_launch", "user_research", 0.6, 25),
        ("tom_harrison", "metric_labs_comarketing", "content", 0.5, 15),
        ("lisa_brown", "series_a", "coaching", 0.55, 45),

        # Enterprise contacts
        ("michael_stevens", "acme_corp", "works_at", 0.95, 1),
        ("michael_stevens", "acme_renewal", "champion", 0.9, 5),
        ("susan_park", "techcorp", "works_at", 0.95, 1),
        ("susan_park", "reseller_enterprise", "evaluating", 0.65, 12),
        ("david_brown", "globalfinance", "works_at", 0.95, 1),
        ("david_brown", "soc2_compliance", "requires", 0.8, 10),
        ("jennifer_adams", "acme_renewal", "procurement", 0.7, 8),
        ("robert_wilson", "healthsys", "works_at", 0.95, 1),
        ("robert_wilson", "customer_summit", "attending", 0.6, 15),

        # Cross-network connections
        ("sarah_chen", "marcus_johnson", "invested_in", 0.7, 12),
        ("sarah_chen", "rachel_torres", "knows", 0.5, 30),
        ("marcus_johnson", "tom_bradley", "collaborates", 0.8, 8),
        ("elena_rodriguez", "jennifer_walsh", "former_colleagues", 0.6, 60),
        ("david_park", "ryan_foster", "co_invests", 0.7, 35),
        ("priya_sharma", "amanda_liu", "knows", 0.6, 20),
        ("jason_patel", "alex_rivera", "yc_peers", 0.65, 15),
        ("matt_chen", "tom_bradley", "yc_peers", 0.7, 18),
        ("chris_morgan", "david_chen_advisor", "former_colleagues", 0.5, 100),
        ("patricia_hayes", "robert_taylor", "knows", 0.55, 45),
    ]

    print("\n📎 Creating relationships...")
    for source, target, rel_type, strength, days_since in relationships:
        if source not in entity_ids:
            print(f"   ⚠️  Skipping: {source} not found")
            continue
        if target not in entity_ids:
            print(f"   ⚠️  Skipping: {target} not found")
            continue
        db.insert("relationships", {
            "source_entity_id": entity_ids[source],
            "target_entity_id": entity_ids[target],
            "relationship_type": rel_type,
            "strength": strength,
            "created_at": days_ago(days_since),
            "updated_at": days_ago(days_since),
        })

    print(f"   Created {len(relationships)} relationships")

    # =========================================================================
    # MEMORIES - 110+ facts, commitments, observations, preferences, learnings
    # =========================================================================

    memories = [
        # =====================================================================
        # Series A / Fundraising memories
        # =====================================================================
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
            "content": "Send updated pitch deck to Sarah by Friday",
            "type": "commitment",
            "importance": 0.9,
            "created_at": days_ago(5),
            "deadline": days_ago(2),  # OVERDUE
            "entities": ["sarah_chen", "series_a"]
        },
        {
            "content": "Rachel Torres wants warm intro from existing Sequoia portfolio founder. Reach out to Jason.",
            "type": "fact",
            "importance": 0.8,
            "created_at": days_ago(15),
            "entities": ["rachel_torres", "jason_patel", "series_a"]
        },
        {
            "content": "Waiting on Rachel Torres for intro to her LP network",
            "type": "fact",
            "importance": 0.8,
            "created_at": days_ago(12),
            "entities": ["rachel_torres", "series_a"]
        },
        {
            "content": "Priya at Lightspeed is very engaged. Scheduled partner meeting for next week.",
            "type": "observation",
            "importance": 0.85,
            "created_at": days_ago(8),
            "entities": ["priya_sharma", "series_a", "lightspeed"]
        },
        {
            "content": "Michael Huang passed on Series A. Thinks we're too early for his stage. Maybe Series B.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(30),
            "entities": ["michael_huang", "series_a"]
        },
        {
            "content": "Prepare data room materials for Amanda",
            "type": "commitment",
            "importance": 0.85,
            "created_at": days_ago(3),
            "deadline": days_from_now(2),  # Due soon
            "entities": ["amanda_liu", "series_a"]
        },
        {
            "content": "Amanda Liu loves the product-led growth motion. Connected immediately with our metrics.",
            "type": "observation",
            "importance": 0.75,
            "created_at": days_ago(5),
            "entities": ["amanda_liu"]
        },
        {
            "content": "Kevin committed $150k to the bridge. Quick decision maker.",
            "type": "fact",
            "importance": 0.8,
            "created_at": days_ago(10),
            "entities": ["kevin_obrien", "bridge_round"]
        },
        {
            "content": "Follow up with David Park on angel check size",
            "type": "commitment",
            "importance": 0.7,
            "created_at": days_ago(10),
            "deadline": days_ago(7),  # OVERDUE
            "entities": ["david_park", "safe_angels"]
        },
        {
            "content": "David Park said he'd be interested in the round if we hit $1M ARR",
            "type": "fact",
            "importance": 0.7,
            "created_at": days_ago(45),
            "entities": ["david_park", "series_a"]
        },
        {
            "content": "Diana Martinez committed $50k. Very fast turnaround - reached out Thursday, committed Monday.",
            "type": "fact",
            "importance": 0.65,
            "created_at": days_ago(15),
            "entities": ["diana_martinez", "safe_angels"]
        },
        {
            "content": "James Wilson might co-invest with other angels if we can get lead committed.",
            "type": "fact",
            "importance": 0.55,
            "created_at": days_ago(40),
            "entities": ["james_wilson", "series_a"]
        },
        {
            "content": "Robert Chang thinks we need more ARR for his fund's stage. Suggested reconnecting at $3M ARR.",
            "type": "fact",
            "importance": 0.5,
            "created_at": days_ago(45),
            "entities": ["robert_chang", "series_a"]
        },
        {
            "content": "Jennifer at Index wants to see European expansion plans before engaging further.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(12),
            "entities": ["jennifer_walsh_investor", "series_a", "index_ventures"]
        },

        # =====================================================================
        # Product / Integration memories
        # =====================================================================
        {
            "content": "Tom confirmed the API spec is locked. Integration timeline is 6 weeks.",
            "type": "fact",
            "importance": 0.75,
            "created_at": days_ago(7),
            "entities": ["tom_bradley", "cloudbase_integration"]
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
            "content": "CloudBase wants joint case study after integration completes. Good for marketing.",
            "type": "fact",
            "importance": 0.65,
            "created_at": days_ago(10),
            "entities": ["cloudbase", "cloudbase_integration"]
        },
        {
            "content": "V2 design review with Amy went great. She suggested simplifying the onboarding flow.",
            "type": "observation",
            "importance": 0.7,
            "created_at": days_ago(18),
            "entities": ["amy_zhang", "v2_launch"]
        },
        {
            "content": "Michelle Wong recommends we position V2 as 'infrastructure upgrade' not 'new version' to reduce churn fear.",
            "type": "learning",
            "importance": 0.75,
            "created_at": days_ago(15),
            "entities": ["michelle_wong", "v2_launch"]
        },
        {
            "content": "Finalize V2 feature list by end of week",
            "type": "commitment",
            "importance": 0.85,
            "created_at": days_ago(4),
            "deadline": days_from_now(3),
            "entities": ["v2_launch"]
        },
        {
            "content": "Matt Chen offered APIHub beta access for our integration. Could accelerate timeline.",
            "type": "fact",
            "importance": 0.7,
            "created_at": days_ago(5),
            "entities": ["matt_chen", "apihub_integration", "apihub"]
        },
        {
            "content": "Review APIHub API documentation and provide integration estimate",
            "type": "commitment",
            "importance": 0.7,
            "created_at": days_ago(5),
            "deadline": days_from_now(5),
            "entities": ["apihub_integration"]
        },
        {
            "content": "Mobile MVP deprioritized until after V2 launch. Enterprise customers want desktop-first.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(20),
            "entities": ["mobile_mvp"]
        },
        {
            "content": "Alex delivered the V2 mockups. Great work, fast turnaround. Will use him again.",
            "type": "observation",
            "importance": 0.6,
            "created_at": days_ago(12),
            "entities": ["alex_kim", "v2_launch"]
        },
        {
            "content": "Maria's user research surfaced confusion around our pricing page. Need to simplify.",
            "type": "fact",
            "importance": 0.65,
            "created_at": days_ago(25),
            "entities": ["maria_santos", "v2_launch"]
        },

        # =====================================================================
        # Partnership memories
        # =====================================================================
        {
            "content": "Metric Labs webinar scheduled for next month. Jason will co-present on PLG metrics.",
            "type": "fact",
            "importance": 0.65,
            "created_at": days_ago(8),
            "entities": ["jason_patel", "metric_labs_comarketing", "metric_labs"]
        },
        {
            "content": "Draft co-marketing content with Karen for webinar",
            "type": "commitment",
            "importance": 0.6,
            "created_at": days_ago(8),
            "deadline": days_from_now(10),
            "entities": ["karen_lee", "metric_labs_comarketing"]
        },
        {
            "content": "Alex at FinFlow referred 3 customers last quarter. Referral agreement working well.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(12),
            "entities": ["alex_rivera", "finflow_referral", "finflow"]
        },
        {
            "content": "HubSpot partnership could give us enterprise distribution. Ryan is initial contact.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(25),
            "entities": ["ryan_anderson", "reseller_enterprise"]
        },
        {
            "content": "Jessica at Shopify interested in integration. Could open e-commerce vertical.",
            "type": "fact",
            "importance": 0.55,
            "created_at": days_ago(30),
            "entities": ["jessica_wu", "reseller_enterprise"]
        },

        # =====================================================================
        # Enterprise / Customer memories
        # =====================================================================
        {
            "content": "Review Acme renewal terms with Nina before sending",
            "type": "commitment",
            "importance": 0.85,
            "created_at": days_ago(7),
            "deadline": days_from_now(5),
            "entities": ["nina_patel", "acme_renewal"]
        },
        {
            "content": "Michael Stevens pushing for 800 seat expansion. Needs VP approval.",
            "type": "fact",
            "importance": 0.8,
            "created_at": days_ago(5),
            "entities": ["michael_stevens", "acme_renewal", "acme_corp"]
        },
        {
            "content": "Waiting on Acme for their technical requirements doc",
            "type": "fact",
            "importance": 0.75,
            "created_at": days_ago(8),
            "entities": ["acme_corp", "acme_renewal"]
        },
        {
            "content": "Jennifer Adams at Acme procurement needs 3 reference calls before approval.",
            "type": "fact",
            "importance": 0.7,
            "created_at": days_ago(8),
            "entities": ["jennifer_adams", "acme_renewal"]
        },
        {
            "content": "Schedule reference calls for Acme procurement",
            "type": "commitment",
            "importance": 0.75,
            "created_at": days_ago(8),
            "deadline": days_from_now(7),
            "entities": ["jennifer_adams", "acme_renewal"]
        },
        {
            "content": "TechCorp eval going well. Susan wants security questionnaire completed.",
            "type": "fact",
            "importance": 0.75,
            "created_at": days_ago(12),
            "entities": ["susan_park", "techcorp"]
        },
        {
            "content": "Complete TechCorp security questionnaire",
            "type": "commitment",
            "importance": 0.8,
            "created_at": days_ago(12),
            "deadline": days_from_now(3),
            "entities": ["susan_park", "techcorp"]
        },
        {
            "content": "David Brown at GlobalFinance requires SOC2 before they can proceed. High priority.",
            "type": "fact",
            "importance": 0.85,
            "created_at": days_ago(10),
            "entities": ["david_brown", "globalfinance", "soc2_compliance"]
        },
        {
            "content": "GlobalFinance deal is $500k+ ARR. Worth accelerating SOC2 for this.",
            "type": "observation",
            "importance": 0.8,
            "created_at": days_ago(10),
            "entities": ["globalfinance", "soc2_compliance"]
        },
        {
            "content": "Robert at HealthSys is our most engaged pilot customer. Great feedback on every release.",
            "type": "observation",
            "importance": 0.6,
            "created_at": days_ago(15),
            "entities": ["robert_wilson", "healthsys"]
        },
        {
            "content": "HealthSys wants to be featured at customer summit. Good case study potential.",
            "type": "fact",
            "importance": 0.55,
            "created_at": days_ago(15),
            "entities": ["healthsys", "customer_summit"]
        },

        # =====================================================================
        # Operations memories
        # =====================================================================
        {
            "content": "Sam Rodriguez has 2 strong backend candidates. Scheduling final rounds.",
            "type": "fact",
            "importance": 0.7,
            "created_at": days_ago(10),
            "entities": ["sam_rodriguez", "eng_hiring"]
        },
        {
            "content": "Schedule final round interviews for backend candidates",
            "type": "commitment",
            "importance": 0.75,
            "created_at": days_ago(10),
            "deadline": days_from_now(4),
            "entities": ["sam_rodriguez", "eng_hiring"]
        },
        {
            "content": "David Chen recommends hiring a platform engineer before ML engineer. Infra first.",
            "type": "observation",
            "importance": 0.7,
            "created_at": days_ago(20),
            "entities": ["david_chen_advisor", "eng_hiring"]
        },
        {
            "content": "Linda Garcia suggests we document culture values before next hiring wave.",
            "type": "observation",
            "importance": 0.55,
            "created_at": days_ago(50),
            "entities": ["linda_garcia", "eng_hiring"]
        },
        {
            "content": "James Lee found $80k in R&D tax credits. Nice surprise.",
            "type": "fact",
            "importance": 0.65,
            "created_at": days_ago(20),
            "entities": ["james_lee"]
        },
        {
            "content": "SOC2 audit scheduled for April. James coordinating documentation.",
            "type": "fact",
            "importance": 0.8,
            "created_at": days_ago(15),
            "entities": ["james_lee", "soc2_compliance"]
        },
        {
            "content": "Complete SOC2 evidence collection by end of February",
            "type": "commitment",
            "importance": 0.85,
            "created_at": days_ago(15),
            "deadline": days_from_now(25),
            "entities": ["soc2_compliance"]
        },
        {
            "content": "Nina reviewing new employment contracts. Should have redlines by Friday.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(5),
            "entities": ["nina_patel", "eng_hiring"]
        },
        {
            "content": "Olivia Wu advised on our data retention policy. Recommended 90-day default.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(15),
            "entities": ["olivia_wu", "soc2_compliance"]
        },

        # =====================================================================
        # Events memories
        # =====================================================================
        {
            "content": "SaaStr speaking slot confirmed. 30-minute session on AI in B2B.",
            "type": "fact",
            "importance": 0.75,
            "created_at": days_ago(18),
            "entities": ["saastr_conf"]
        },
        {
            "content": "Prepare SaaStr presentation deck",
            "type": "commitment",
            "importance": 0.7,
            "created_at": days_ago(18),
            "deadline": days_from_now(20),
            "entities": ["saastr_conf"]
        },
        {
            "content": "Emily coordinating PR around SaaStr. Wants to pitch 3 tech publications.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(18),
            "entities": ["emily_harris", "saastr_conf"]
        },
        {
            "content": "Brian Mitchell offered to intro me to conference organizers. Might get better slot.",
            "type": "fact",
            "importance": 0.5,
            "created_at": days_ago(20),
            "entities": ["brian_mitchell", "saastr_conf"]
        },
        {
            "content": "Customer summit agenda: product roadmap, customer panels, networking. Virtual format.",
            "type": "fact",
            "importance": 0.55,
            "created_at": days_ago(15),
            "entities": ["customer_summit"]
        },
        {
            "content": "Invite top 20 customers to summit",
            "type": "commitment",
            "importance": 0.6,
            "created_at": days_ago(15),
            "deadline": days_from_now(30),
            "entities": ["customer_summit"]
        },
        {
            "content": "Steven Park might speak at customer summit on CS best practices.",
            "type": "fact",
            "importance": 0.5,
            "created_at": days_ago(15),
            "entities": ["steven_park", "customer_summit"]
        },

        # =====================================================================
        # Dormant relationship memories
        # =====================================================================
        {
            "content": "Chris Morgan connected me with two enterprise prospects",
            "type": "fact",
            "importance": 0.7,
            "created_at": days_ago(95),
            "entities": ["chris_morgan"]
        },
        {
            "content": "Jennifer offered to review our engineering hiring plan",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(65),
            "entities": ["jennifer_walsh"]
        },
        {
            "content": "Lisa Brown coaching sessions very helpful. Should schedule more.",
            "type": "observation",
            "importance": 0.55,
            "created_at": days_ago(45),
            "entities": ["lisa_brown"]
        },
        {
            "content": "Sarah Mitchell offered to intro us to her Slack contacts.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(40),
            "entities": ["sarah_mitchell"]
        },

        # =====================================================================
        # Founder network memories
        # =====================================================================
        {
            "content": "Marcus introduced me to two other founders in the data space. Good network.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(10),
            "entities": ["marcus_johnson"]
        },
        {
            "content": "Tom and Matt know each other from YC. Both helpful for intro requests.",
            "type": "observation",
            "importance": 0.5,
            "created_at": days_ago(18),
            "entities": ["tom_bradley", "matt_chen"]
        },
        {
            "content": "Daniel Kim at NeuralPath might be good customer. Healthcare AI angle.",
            "type": "fact",
            "importance": 0.55,
            "created_at": days_ago(25),
            "entities": ["daniel_kim"]
        },
        {
            "content": "Sophie at Bloom has great sustainable brand. Could do co-marketing.",
            "type": "observation",
            "importance": 0.45,
            "created_at": days_ago(35),
            "entities": ["sophie_anderson"]
        },
        {
            "content": "Emma at DevSecure might integrate with us. Security + our platform.",
            "type": "fact",
            "importance": 0.5,
            "created_at": days_ago(40),
            "entities": ["emma_thompson"]
        },
        {
            "content": "Maya's TalentAI has similar ICP. Potential referral partner.",
            "type": "observation",
            "importance": 0.5,
            "created_at": days_ago(30),
            "entities": ["maya_roberts"]
        },
        {
            "content": "Chris at EdgeML has deep technical expertise. Good for ML questions.",
            "type": "observation",
            "importance": 0.45,
            "created_at": days_ago(45),
            "entities": ["chris_nakamura"]
        },
        {
            "content": "Andrew beta testing our V2. Very thorough feedback on code review features.",
            "type": "fact",
            "importance": 0.55,
            "created_at": days_ago(10),
            "entities": ["andrew_lee", "v2_launch"]
        },
        {
            "content": "Rachel Kim interested in joint content about remote work tools.",
            "type": "fact",
            "importance": 0.45,
            "created_at": days_ago(35),
            "entities": ["rachel_kim_founder"]
        },
        {
            "content": "Natalie at Productboard could be a design partner. Their PM tool complements ours.",
            "type": "observation",
            "importance": 0.55,
            "created_at": days_ago(28),
            "entities": ["natalie_green"]
        },

        # =====================================================================
        # Preferences and learnings
        # =====================================================================
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
        {
            "content": "Rachel Torres prefers in-person meetings. Rare for a VC.",
            "type": "preference",
            "importance": 0.5,
            "created_at": days_ago(30),
            "entities": ["rachel_torres"]
        },
        {
            "content": "Priya is most responsive on Slack, not email.",
            "type": "preference",
            "importance": 0.5,
            "created_at": days_ago(12),
            "entities": ["priya_sharma"]
        },
        {
            "content": "Michael Stevens prefers detailed technical specs. Don't send him marketing materials.",
            "type": "preference",
            "importance": 0.55,
            "created_at": days_ago(10),
            "entities": ["michael_stevens"]
        },
        {
            "content": "David Brown is very security conscious. Lead with compliance in all communications.",
            "type": "preference",
            "importance": 0.6,
            "created_at": days_ago(15),
            "entities": ["david_brown"]
        },
        {
            "content": "Amanda likes to see customer testimonials early in the diligence process.",
            "type": "preference",
            "importance": 0.55,
            "created_at": days_ago(8),
            "entities": ["amanda_liu"]
        },
        {
            "content": "Kevin O'Brien appreciates brevity. Keep emails under 3 paragraphs.",
            "type": "preference",
            "importance": 0.5,
            "created_at": days_ago(15),
            "entities": ["kevin_obrien"]
        },
        {
            "content": "Elena responds faster to Twitter DMs than email.",
            "type": "preference",
            "importance": 0.45,
            "created_at": days_ago(20),
            "entities": ["elena_rodriguez"]
        },

        # =====================================================================
        # General learnings
        # =====================================================================
        {
            "content": "Investor meetings go better when we lead with metrics, not vision.",
            "type": "learning",
            "importance": 0.7,
            "created_at": days_ago(45),
            "entities": ["series_a"]
        },
        {
            "content": "Enterprise deals move faster when we engage procurement early.",
            "type": "learning",
            "importance": 0.65,
            "created_at": days_ago(30),
            "entities": ["acme_renewal"]
        },
        {
            "content": "YC founders are great for intros. Most respond to warm outreach.",
            "type": "learning",
            "importance": 0.55,
            "created_at": days_ago(20),
            "entities": []
        },
        {
            "content": "Demo requests from the blog convert at 3x the rate of paid ads.",
            "type": "learning",
            "importance": 0.6,
            "created_at": days_ago(35),
            "entities": []
        },
        {
            "content": "Partnerships work best when there's genuine product overlap, not just marketing.",
            "type": "learning",
            "importance": 0.55,
            "created_at": days_ago(25),
            "entities": []
        },
        {
            "content": "Prepare board deck for Q1 review",
            "type": "commitment",
            "importance": 0.9,
            "created_at": days_ago(14),
            "deadline": days_from_now(10),
            "entities": []
        },
        {
            "content": "Waiting on Alex for the updated brand assets",
            "type": "fact",
            "importance": 0.5,
            "created_at": days_ago(20),
            "entities": ["alex_kim"]
        },

        # =====================================================================
        # Additional memories for network density
        # =====================================================================
        {
            "content": "John Williams suggested we get term sheet from lead investor before approaching him.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(38),
            "entities": ["john_williams", "series_a"]
        },
        {
            "content": "Mark Thompson offered to review our infrastructure architecture. Good for scaling advice.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(12),
            "entities": ["mark_thompson", "cloudbase_integration"]
        },
        {
            "content": "Nicole Kim has ideas for V2 launch messaging. Schedule brainstorm session.",
            "type": "observation",
            "importance": 0.5,
            "created_at": days_ago(35),
            "entities": ["nicole_kim", "v2_launch"]
        },
        {
            "content": "Mike Santos could intro us to Airbnb platform team if we have relevant use case.",
            "type": "fact",
            "importance": 0.5,
            "created_at": days_ago(40),
            "entities": ["mike_santos"]
        },
        {
            "content": "Laura Chen's design system approach could inspire our component library.",
            "type": "observation",
            "importance": 0.45,
            "created_at": days_ago(25),
            "entities": ["laura_chen", "v2_launch"]
        },
        {
            "content": "Review design system documentation with Laura",
            "type": "commitment",
            "importance": 0.5,
            "created_at": days_ago(22),
            "deadline": days_from_now(14),
            "entities": ["laura_chen"]
        },
        {
            "content": "Patricia Hayes charges $10k/month for advisory. Worth it for go-to-market strategy.",
            "type": "fact",
            "importance": 0.65,
            "created_at": days_ago(28),
            "entities": ["patricia_hayes"]
        },
        {
            "content": "Robert Taylor knows the Acme executive team. Could help with renewal escalation if needed.",
            "type": "fact",
            "importance": 0.6,
            "created_at": days_ago(22),
            "entities": ["robert_taylor", "acme_renewal"]
        },
        {
            "content": "Sophie at Bloom has strong sustainability angle. Good for ESG-focused enterprise prospects.",
            "type": "observation",
            "importance": 0.45,
            "created_at": days_ago(35),
            "entities": ["sophie_anderson"]
        },
        {
            "content": "Tom Harrison wrote great thought leadership piece for Metric Labs. Could do same for us.",
            "type": "observation",
            "importance": 0.5,
            "created_at": days_ago(18),
            "entities": ["tom_harrison", "metric_labs_comarketing"]
        },
        {
            "content": "Commission blog post from Tom about our category",
            "type": "commitment",
            "importance": 0.45,
            "created_at": days_ago(15),
            "deadline": days_from_now(21),
            "entities": ["tom_harrison"]
        },
        {
            "content": "Pixel Perfect Studio rates are reasonable. $150/hour for senior designer time.",
            "type": "fact",
            "importance": 0.45,
            "created_at": days_ago(30),
            "entities": ["pixel_perfect"]
        },
        {
            "content": "Harris Communications has connections at TechCrunch and Wired. Could be valuable for launch.",
            "type": "fact",
            "importance": 0.55,
            "created_at": days_ago(20),
            "entities": ["harris_comms", "saastr_conf"]
        },
        {
            "content": "Index Ventures has strong European network. Important for future expansion.",
            "type": "observation",
            "importance": 0.55,
            "created_at": days_ago(15),
            "entities": ["index_ventures", "series_a"]
        },
        {
            "content": "Founder Collective does hands-off investing. Good for founders who want autonomy.",
            "type": "observation",
            "importance": 0.5,
            "created_at": days_ago(25),
            "entities": ["founder_collective"]
        },
        {
            "content": "DataSync integration could unlock data pipeline use cases. Explore with Marcus.",
            "type": "fact",
            "importance": 0.55,
            "created_at": days_ago(12),
            "entities": ["marcus_johnson", "datasync"]
        },
        {
            "content": "Explore DataSync integration opportunity",
            "type": "commitment",
            "importance": 0.5,
            "created_at": days_ago(10),
            "deadline": days_from_now(14),
            "entities": ["marcus_johnson", "datasync"]
        },
        {
            "content": "FinFlow and our product have complementary personas. CFOs use both.",
            "type": "observation",
            "importance": 0.55,
            "created_at": days_ago(15),
            "entities": ["finflow", "alex_rivera"]
        },
        {
            "content": "MegaRetail procurement process takes 90 days minimum. Plan accordingly.",
            "type": "fact",
            "importance": 0.5,
            "created_at": days_ago(35),
            "entities": ["jennifer_adams"]
        },
        {
            "content": "Michael at Acme has monthly budget review. Best to align asks with that cycle.",
            "type": "preference",
            "importance": 0.55,
            "created_at": days_ago(8),
            "entities": ["michael_stevens", "acme_corp"]
        },
        {
            "content": "Susan Park is more responsive on LinkedIn than email.",
            "type": "preference",
            "importance": 0.45,
            "created_at": days_ago(15),
            "entities": ["susan_park"]
        },
        {
            "content": "David Brown needs at least 2 weeks notice for any security review meetings.",
            "type": "preference",
            "importance": 0.55,
            "created_at": days_ago(12),
            "entities": ["david_brown", "globalfinance"]
        },
        {
            "content": "Follow up with Robert Wilson on pilot feedback",
            "type": "commitment",
            "importance": 0.6,
            "created_at": days_ago(8),
            "deadline": days_from_now(7),
            "entities": ["robert_wilson", "healthsys"]
        },
        {
            "content": "Sam Rodriguez's candidates expect responses within 48 hours or they lose interest.",
            "type": "learning",
            "importance": 0.6,
            "created_at": days_ago(15),
            "entities": ["sam_rodriguez", "eng_hiring"]
        },
        {
            "content": "Enterprise prospects respond better to ROI calculators than feature lists.",
            "type": "learning",
            "importance": 0.6,
            "created_at": days_ago(25),
            "entities": ["techcorp", "globalfinance"]
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

    print(f"   Created {len(memories)} memories")

    # =========================================================================
    # PATTERNS (15 behavioral, communication, scheduling, decision-making)
    # =========================================================================

    patterns = [
        # Behavioral patterns
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
            "name": "Context switching cost",
            "pattern_type": "behavioral",
            "description": "Productivity drops significantly after more than 3 meetings in a day.",
            "confidence": 0.75,
            "occurrences": 5,
            "first_observed_at": days_ago(45),
            "last_observed_at": days_ago(10),
        },
        {
            "name": "Late follow-ups",
            "pattern_type": "behavioral",
            "description": "Investor follow-up emails often delayed 2-3 days past optimal window.",
            "confidence": 0.7,
            "occurrences": 4,
            "first_observed_at": days_ago(40),
            "last_observed_at": days_ago(8),
        },

        # Communication patterns
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
            "name": "Async updates effective",
            "pattern_type": "communication",
            "description": "Loom videos get higher engagement than written updates for investors.",
            "confidence": 0.75,
            "occurrences": 6,
            "first_observed_at": days_ago(50),
            "last_observed_at": days_ago(12),
        },
        {
            "name": "Technical depth with engineers",
            "pattern_type": "communication",
            "description": "Engineering candidates respond better to deep technical discussions.",
            "confidence": 0.65,
            "occurrences": 3,
            "first_observed_at": days_ago(35),
            "last_observed_at": days_ago(15),
        },
        {
            "name": "Customer success stories",
            "pattern_type": "communication",
            "description": "Enterprise sales accelerate when customer stories shared early.",
            "confidence": 0.8,
            "occurrences": 5,
            "first_observed_at": days_ago(60),
            "last_observed_at": days_ago(8),
        },

        # Scheduling patterns
        {
            "name": "Tuesday/Thursday deep work",
            "pattern_type": "scheduling",
            "description": "Deep work sessions are most productive Tuesday and Thursday mornings.",
            "confidence": 0.75,
            "occurrences": 6,
            "first_observed_at": days_ago(60),
            "last_observed_at": days_ago(20),
        },
        {
            "name": "Friday investor meetings",
            "pattern_type": "scheduling",
            "description": "Investor meetings on Fridays have lower energy and engagement.",
            "confidence": 0.6,
            "occurrences": 3,
            "first_observed_at": days_ago(40),
            "last_observed_at": days_ago(25),
        },
        {
            "name": "Morning customer calls",
            "pattern_type": "scheduling",
            "description": "Enterprise customer calls work best 9-11am their time.",
            "confidence": 0.7,
            "occurrences": 4,
            "first_observed_at": days_ago(30),
            "last_observed_at": days_ago(7),
        },
        {
            "name": "End-of-week planning",
            "pattern_type": "scheduling",
            "description": "Weekly planning on Friday afternoons sets up better Mondays.",
            "confidence": 0.65,
            "occurrences": 4,
            "first_observed_at": days_ago(50),
            "last_observed_at": days_ago(15),
        },

        # Decision-making patterns
        {
            "name": "Hire slow tendency",
            "pattern_type": "decision_making",
            "description": "Tendency to over-deliberate on hiring decisions. Average 45 days to offer.",
            "confidence": 0.7,
            "occurrences": 4,
            "first_observed_at": days_ago(90),
            "last_observed_at": days_ago(20),
        },
        {
            "name": "Partnership optimism",
            "pattern_type": "decision_making",
            "description": "Tend to overestimate partnership ROI. 3 of last 5 underdelivered.",
            "confidence": 0.65,
            "occurrences": 3,
            "first_observed_at": days_ago(70),
            "last_observed_at": days_ago(30),
        },
        {
            "name": "Feature creep risk",
            "pattern_type": "decision_making",
            "description": "Product scope tends to expand mid-sprint. Happened in V2 planning.",
            "confidence": 0.6,
            "occurrences": 2,
            "first_observed_at": days_ago(25),
            "last_observed_at": days_ago(10),
        },
        {
            "name": "Quick angel decisions",
            "pattern_type": "decision_making",
            "description": "Angel investor outreach yields results within 2 weeks or not at all.",
            "confidence": 0.75,
            "occurrences": 5,
            "first_observed_at": days_ago(55),
            "last_observed_at": days_ago(15),
        },
    ]

    print("\n🔍 Creating patterns...")
    for pattern in patterns:
        db.insert("patterns", pattern)

    print(f"   Created {len(patterns)} patterns")

    # =========================================================================
    # PREDICTIONS (25 warnings, suggestions, insights, reminders)
    # =========================================================================

    predictions = [
        # Warnings (high priority)
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
            "prediction_type": "warning",
            "content": "David Park follow-up is overdue by 7 days. Angel momentum fading.",
            "priority": 0.75,
            "created_at": days_ago(0),
            "expires_at": days_from_now(5),
        },
        {
            "prediction_type": "warning",
            "content": "Jennifer Walsh hasn't been contacted in 65 days. Engineering help offer expiring.",
            "priority": 0.7,
            "created_at": days_ago(1),
            "expires_at": days_from_now(7),
        },
        {
            "prediction_type": "warning",
            "content": "TechCorp security questionnaire due in 3 days. High-value deal at risk.",
            "priority": 0.85,
            "created_at": days_ago(0),
            "expires_at": days_from_now(3),
        },
        {
            "prediction_type": "warning",
            "content": "SOC2 evidence deadline approaching. GlobalFinance deal depends on it.",
            "priority": 0.8,
            "created_at": days_ago(0),
            "expires_at": days_from_now(14),
        },

        # Suggestions (medium priority)
        {
            "prediction_type": "suggestion",
            "content": "David Park and Ryan Foster are both Austin-based angels in On Deck. Intro opportunity?",
            "priority": 0.5,
            "created_at": days_ago(2),
            "expires_at": days_from_now(14),
        },
        {
            "prediction_type": "suggestion",
            "content": "Marcus and Lisa are both YC W24 building in AI infrastructure. They might know each other.",
            "priority": 0.4,
            "created_at": days_ago(3),
            "expires_at": days_from_now(14),
        },
        {
            "prediction_type": "suggestion",
            "content": "Jason Patel could intro you to Rachel Torres - they're both Sequoia connected.",
            "priority": 0.6,
            "created_at": days_ago(1),
            "expires_at": days_from_now(10),
        },
        {
            "prediction_type": "suggestion",
            "content": "Consider inviting Maya Roberts to customer summit - TalentAI has similar ICP.",
            "priority": 0.45,
            "created_at": days_ago(2),
            "expires_at": days_from_now(21),
        },
        {
            "prediction_type": "suggestion",
            "content": "Emma at DevSecure could be integration partner. Security + your platform = strong combo.",
            "priority": 0.5,
            "created_at": days_ago(3),
            "expires_at": days_from_now(14),
        },
        {
            "prediction_type": "suggestion",
            "content": "Schedule Lisa Brown coaching session - you mentioned it was helpful.",
            "priority": 0.4,
            "created_at": days_ago(1),
            "expires_at": days_from_now(14),
        },

        # Insights
        {
            "prediction_type": "insight",
            "content": "Priya and Amanda have similar investment thesis. One commitment might accelerate the other.",
            "priority": 0.6,
            "created_at": days_ago(2),
            "expires_at": days_from_now(14),
        },
        {
            "prediction_type": "insight",
            "content": "3 of your YC founder contacts (Marcus, Tom, Matt) could all provide warm intros to investors.",
            "priority": 0.55,
            "created_at": days_ago(1),
            "expires_at": days_from_now(21),
        },
        {
            "prediction_type": "insight",
            "content": "Metric Labs and APIHub integrations together could open distribution channel.",
            "priority": 0.5,
            "created_at": days_ago(2),
            "expires_at": days_from_now(14),
        },
        {
            "prediction_type": "insight",
            "content": "V2 launch timing aligns with SaaStr. Could maximize PR impact.",
            "priority": 0.6,
            "created_at": days_ago(1),
            "expires_at": days_from_now(21),
        },
        {
            "prediction_type": "insight",
            "content": "Kevin's quick bridge commitment pattern suggests other angels might follow fast.",
            "priority": 0.5,
            "created_at": days_ago(2),
            "expires_at": days_from_now(14),
        },

        # Reminders
        {
            "prediction_type": "reminder",
            "content": "Acme renewal conversation should happen this week - Q2 budget planning starts soon.",
            "priority": 0.85,
            "created_at": days_ago(1),
            "expires_at": days_from_now(5),
        },
        {
            "prediction_type": "reminder",
            "content": "Data room for Amanda needs to be ready for partner meeting next week.",
            "priority": 0.8,
            "created_at": days_ago(0),
            "expires_at": days_from_now(5),
        },
        {
            "prediction_type": "reminder",
            "content": "Engineering hiring - final rounds need scheduling before Sam's candidates lose interest.",
            "priority": 0.7,
            "created_at": days_ago(0),
            "expires_at": days_from_now(4),
        },
        {
            "prediction_type": "reminder",
            "content": "SaaStr presentation deck should be started soon - event in 3 weeks.",
            "priority": 0.6,
            "created_at": days_ago(1),
            "expires_at": days_from_now(14),
        },
        {
            "prediction_type": "reminder",
            "content": "Co-marketing content with Karen is due before the Metric Labs webinar.",
            "priority": 0.55,
            "created_at": days_ago(0),
            "expires_at": days_from_now(10),
        },
        {
            "prediction_type": "reminder",
            "content": "Customer summit invites should go out 30 days before event.",
            "priority": 0.5,
            "created_at": days_ago(1),
            "expires_at": days_from_now(21),
        },
        {
            "prediction_type": "reminder",
            "content": "Board deck Q1 review is in 10 days - start gathering metrics.",
            "priority": 0.75,
            "created_at": days_ago(0),
            "expires_at": days_from_now(7),
        },
        {
            "prediction_type": "suggestion",
            "content": "Laura Chen's design expertise could help with V2 launch. Schedule review session.",
            "priority": 0.45,
            "created_at": days_ago(1),
            "expires_at": days_from_now(14),
        },
    ]

    print("\n🔮 Creating predictions...")
    for pred in predictions:
        db.insert("predictions", pred)

    print(f"   Created {len(predictions)} predictions")

    # =========================================================================
    # EPISODES (15 past sessions of various types)
    # =========================================================================

    episodes = [
        # Morning planning sessions
        {
            "summary": "Morning planning session. Reviewed Series A progress, updated Sarah on technical architecture. Identified need to follow up with dormant investor relationships.",
            "started_at": days_ago(3) + "T09:00:00",
            "ended_at": days_ago(3) + "T09:45:00",
            "turn_count": 12,
        },
        {
            "summary": "Morning standup review. Prioritized V2 launch tasks, scheduled CloudBase integration sync. Flagged TechCorp questionnaire deadline.",
            "started_at": days_ago(1) + "T08:30:00",
            "ended_at": days_ago(1) + "T09:00:00",
            "turn_count": 8,
        },
        {
            "summary": "Weekly planning session. Set goals for investor outreach, product milestones, and customer renewals.",
            "started_at": days_ago(7) + "T09:00:00",
            "ended_at": days_ago(7) + "T10:00:00",
            "turn_count": 15,
        },

        # Meeting prep sessions
        {
            "summary": "Meeting prep for Tom Bradley call. Reviewed CloudBase integration timeline, prepared questions about API versioning strategy.",
            "started_at": days_ago(7) + "T14:00:00",
            "ended_at": days_ago(7) + "T14:30:00",
            "turn_count": 8,
        },
        {
            "summary": "Prep for Sarah Chen Series A call. Gathered metrics, prepared technical architecture overview, rehearsed key points.",
            "started_at": days_ago(5) + "T10:00:00",
            "ended_at": days_ago(5) + "T10:45:00",
            "turn_count": 12,
        },
        {
            "summary": "Prep for Priya Sharma Lightspeed meeting. Compiled competitive analysis, prepared growth projections.",
            "started_at": days_ago(8) + "T15:00:00",
            "ended_at": days_ago(8) + "T15:30:00",
            "turn_count": 10,
        },
        {
            "summary": "Prep for Acme renewal conversation with Michael Stevens. Gathered usage data, prepared upsell pitch.",
            "started_at": days_ago(4) + "T11:00:00",
            "ended_at": days_ago(4) + "T11:30:00",
            "turn_count": 9,
        },

        # Weekly review sessions
        {
            "summary": "Weekly review session. Processed 5 meeting notes, updated 3 people files, identified 2 overdue commitments.",
            "started_at": days_ago(10) + "T17:00:00",
            "ended_at": days_ago(10) + "T17:45:00",
            "turn_count": 15,
        },
        {
            "summary": "End of week review. Summarized fundraising progress, updated pipeline, planned next week's investor outreach.",
            "started_at": days_ago(4) + "T16:30:00",
            "ended_at": days_ago(4) + "T17:15:00",
            "turn_count": 14,
        },
        {
            "summary": "Weekly metrics review. Analyzed conversion rates, customer engagement, churn indicators.",
            "started_at": days_ago(11) + "T14:00:00",
            "ended_at": days_ago(11) + "T14:45:00",
            "turn_count": 11,
        },

        # Task-focused sessions
        {
            "summary": "Drafted investor update email. Compiled Q4 metrics, product milestones, and hiring progress.",
            "started_at": days_ago(6) + "T13:00:00",
            "ended_at": days_ago(6) + "T13:45:00",
            "turn_count": 10,
        },
        {
            "summary": "Worked on V2 launch plan. Defined release timeline, marketing coordination, customer communication.",
            "started_at": days_ago(9) + "T10:00:00",
            "ended_at": days_ago(9) + "T11:00:00",
            "turn_count": 16,
        },
        {
            "summary": "SOC2 compliance planning session. Listed required evidence, assigned owners, set collection deadlines.",
            "started_at": days_ago(15) + "T14:00:00",
            "ended_at": days_ago(15) + "T15:00:00",
            "turn_count": 13,
        },
        {
            "summary": "Hiring strategy session. Prioritized roles, reviewed candidate pipeline, scheduled interviews.",
            "started_at": days_ago(12) + "T11:00:00",
            "ended_at": days_ago(12) + "T11:45:00",
            "turn_count": 12,
        },
        {
            "summary": "Partnership planning session. Evaluated APIHub and Metric Labs opportunities, defined integration priorities.",
            "started_at": days_ago(8) + "T16:00:00",
            "ended_at": days_ago(8) + "T16:30:00",
            "turn_count": 8,
        },
    ]

    print("\n📅 Creating episodes...")
    for ep in episodes:
        db.insert("episodes", ep)

    print(f"   Created {len(episodes)} episodes")

    # =========================================================================
    # SUMMARY
    # =========================================================================

    total_entities = len(people) + len(orgs) + len(projects)
    total_all = total_entities + len(relationships) + len(memories) + len(patterns) + len(predictions) + len(episodes)

    print("\n" + "=" * 60)
    print("✅ Demo database seeded successfully!")
    print("=" * 60)
    print(f"\n📊 Summary:")
    print(f"   - {len(people)} people")
    print(f"   - {len(orgs)} organizations")
    print(f"   - {len(projects)} projects")
    print(f"   - {len(relationships)} relationships")
    print(f"   - {len(memories)} memories")
    print(f"   - {len(patterns)} patterns")
    print(f"   - {len(predictions)} predictions")
    print(f"   - {len(episodes)} episodes")
    print(f"\n   Total: {total_all} entities and connections")


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
