"""
Consolidation Service for Claudia Memory System

Handles memory decay, pattern detection, and prediction generation.
Runs on a schedule (typically overnight) to maintain memory health.
"""

import json
import logging
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from ..config import get_config
from ..database import get_db

logger = logging.getLogger(__name__)


def _cosine_similarity(a: list, b: list) -> float:
    """Pure Python cosine similarity between two vectors."""
    if len(a) != len(b) or len(a) == 0:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


@dataclass
class DetectedPattern:
    """A pattern detected in the user's behavior or data"""

    name: str
    description: str
    pattern_type: str  # behavioral, communication, scheduling, relationship
    confidence: float
    evidence: List[str]


@dataclass
class Prediction:
    """A proactive suggestion or warning"""

    content: str
    prediction_type: str  # reminder, suggestion, warning, insight
    priority: float
    expires_at: Optional[datetime]
    metadata: Optional[Dict] = None
    pattern_name: Optional[str] = None


class ConsolidateService:
    """Memory consolidation and analysis"""

    def __init__(self):
        self.db = get_db()
        self.config = get_config()

    def run_decay(self) -> Dict[str, int]:
        """
        Apply importance decay to memories and entities.
        Never deletes, just reduces importance over time.

        Returns:
            Dict with counts of affected records
        """
        decay_rate = self.config.decay_rate_daily

        # Decay memories
        self.db.execute(
            """
            UPDATE memories
            SET importance = importance * ?,
                updated_at = ?
            WHERE importance > ?
            """,
            (decay_rate, datetime.utcnow().isoformat(), self.config.min_importance_threshold / 10),
        )
        # Capture changes() immediately after the UPDATE -- it resets on next statement
        memories_result = self.db.execute("SELECT changes()", fetch=True)
        memories_decayed = memories_result[0][0] if memories_result else 0

        # Decay entities
        self.db.execute(
            """
            UPDATE entities
            SET importance = importance * ?,
                updated_at = ?
            WHERE importance > ?
            """,
            (decay_rate, datetime.utcnow().isoformat(), self.config.min_importance_threshold / 10),
        )

        # Decay relationship strengths
        self.db.execute(
            """
            UPDATE relationships
            SET strength = strength * ?,
                updated_at = ?
            WHERE strength > 0.01
            """,
            (decay_rate, datetime.utcnow().isoformat()),
        )

        # Decay reflections using per-row decay_rate
        # Reflections decay very slowly by default (0.999)
        # Aggregated reflections (3+) decay even slower (0.9995)
        try:
            self.db.execute(
                """
                UPDATE reflections
                SET importance = importance * decay_rate,
                    updated_at = ?
                WHERE importance > 0.01
                """,
                (datetime.utcnow().isoformat(),),
            )
            reflections_result = self.db.execute("SELECT changes()", fetch=True)
            reflections_decayed = reflections_result[0][0] if reflections_result else 0
        except Exception as e:
            logger.debug(f"Reflection decay skipped (table may not exist): {e}")
            reflections_decayed = 0

        logger.info(
            f"Decay applied: decay_rate={decay_rate}"
        )

        return {
            "memories_decayed": memories_decayed,
            "reflections_decayed": reflections_decayed,
        }

    def boost_accessed_memories(self) -> int:
        """
        Boost importance of recently accessed memories (rehearsal effect).
        Memories accessed in the last 24 hours get a small importance boost.
        """
        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        boost_factor = 1.05  # 5% boost per access

        self.db.execute(
            """
            UPDATE memories
            SET importance = MIN(1.0, importance * ?),
                updated_at = ?
            WHERE last_accessed_at >= ?
            """,
            (boost_factor, datetime.utcnow().isoformat(), cutoff),
        )

        result = self.db.execute("SELECT changes()", fetch=True)
        count = result[0][0] if result else 0
        logger.debug(f"Boosted {count} recently accessed memories")
        return count

    def detect_patterns(self) -> List[DetectedPattern]:
        """
        Analyze memories and entities to detect behavioral patterns.

        Returns:
            List of newly detected or updated patterns
        """
        patterns = []

        # Detect relationship cooling
        cooling = self._detect_cooling_relationships()
        patterns.extend(cooling)

        # Detect commitment patterns
        commitment_patterns = self._detect_commitment_patterns()
        patterns.extend(commitment_patterns)

        # Detect communication patterns
        comm_patterns = self._detect_communication_patterns()
        patterns.extend(comm_patterns)

        # Detect cross-entity patterns (co-mentioned people without explicit relationships)
        cross_patterns = self._detect_cross_entity_patterns()
        patterns.extend(cross_patterns)

        # Detect inferred connections (attribute-based: same city, industry, community)
        inferred_patterns = self.detect_inferred_connections()
        patterns.extend(inferred_patterns)

        # Detect introduction opportunities (people who should know each other)
        intro_patterns = self._detect_introduction_opportunities()
        patterns.extend(intro_patterns)

        # Detect forming clusters (3+ people mentioned together frequently)
        cluster_patterns = self._detect_cluster_forming()
        patterns.extend(cluster_patterns)

        # Detect opportunities (skill-project matches, network bridges)
        opportunity_patterns = self.detect_opportunities()
        patterns.extend(opportunity_patterns)

        # Store detected patterns
        for pattern in patterns:
            self._store_pattern(pattern)

        logger.info(f"Detected {len(patterns)} patterns")
        return patterns

    def _detect_cooling_relationships(self) -> List[DetectedPattern]:
        """Detect relationships that haven't been mentioned recently"""
        patterns = []

        # Find entities that were important but haven't been mentioned in 30+ days
        cutoff_30 = (datetime.utcnow() - timedelta(days=30)).isoformat()
        cutoff_60 = (datetime.utcnow() - timedelta(days=60)).isoformat()

        sql = """
            SELECT e.id, e.name, e.type, e.importance,
                   MAX(m.created_at) as last_mention
            FROM entities e
            LEFT JOIN memory_entities me ON e.id = me.entity_id
            LEFT JOIN memories m ON me.memory_id = m.id
            WHERE e.type = 'person'
            AND e.importance > 0.3
            GROUP BY e.id
            HAVING last_mention < ? OR last_mention IS NULL
            ORDER BY e.importance DESC
            LIMIT 20
        """

        rows = self.db.execute(sql, (cutoff_30,), fetch=True) or []

        for row in rows:
            days_since = None
            if row["last_mention"]:
                last_dt = datetime.fromisoformat(row["last_mention"])
                days_since = (datetime.utcnow() - last_dt).days

            severity = "warning" if days_since and days_since > 60 else "observation"

            patterns.append(
                DetectedPattern(
                    name=f"cooling_relationship_{row['id']}",
                    description=f"No contact with {row['name']} in {days_since or 'many'} days",
                    pattern_type="relationship",
                    confidence=min(0.9, 0.5 + (days_since or 30) / 100),
                    evidence=[f"Last mention: {row['last_mention'] or 'never'}"],
                )
            )

        return patterns

    def _detect_commitment_patterns(self) -> List[DetectedPattern]:
        """Detect patterns in commitments (overdue, frequently delayed, etc.)"""
        patterns = []

        # Find overdue commitments
        now = datetime.utcnow().isoformat()

        overdue = self.db.execute(
            """
            SELECT COUNT(*) as count FROM memories
            WHERE type = 'commitment'
            AND importance > 0.5
            AND created_at < ?
            """,
            ((datetime.utcnow() - timedelta(days=7)).isoformat(),),
            fetch=True,
        )

        if overdue and overdue[0]["count"] > 3:
            patterns.append(
                DetectedPattern(
                    name="overdue_commitments",
                    description=f"{overdue[0]['count']} commitments older than 7 days may be overdue",
                    pattern_type="behavioral",
                    confidence=0.7,
                    evidence=["Multiple old commitments detected"],
                )
            )

        return patterns

    def infer_connections(self, entity_a_id: int, entity_b_id: int) -> Optional[Tuple[str, float]]:
        """
        Infer a likely connection between two entities based on shared attributes.

        Uses entity metadata (geography, industry, company, communities) to suggest
        likely connections that aren't explicitly stated.

        Args:
            entity_a_id: First entity ID
            entity_b_id: Second entity ID

        Returns:
            Tuple of (relationship_type, confidence) or None if no inference possible
        """
        try:
            entity_a = self.db.get_one("entities", where="id = ?", where_params=(entity_a_id,))
            entity_b = self.db.get_one("entities", where="id = ?", where_params=(entity_b_id,))

            if not entity_a or not entity_b:
                return None

            # Safely extract metadata from database row
            a_meta_raw = entity_a["metadata"] if "metadata" in entity_a.keys() else None
            b_meta_raw = entity_b["metadata"] if "metadata" in entity_b.keys() else None
            a_meta = json.loads(a_meta_raw) if a_meta_raw else {}
            b_meta = json.loads(b_meta_raw) if b_meta_raw else {}

            # Same company = definitely connected (colleagues)
            a_company = a_meta.get("company")
            b_company = b_meta.get("company")
            if a_company and b_company and a_company.lower() == b_company.lower():
                return ("colleagues", 0.9)

            # Same community = probably know each other
            a_communities = set(c.lower() for c in a_meta.get("communities", []))
            b_communities = set(c.lower() for c in b_meta.get("communities", []))
            if a_communities & b_communities:
                shared = a_communities & b_communities
                return ("community_connection", 0.6)

            # Same city + same industry = might know each other
            a_geo = a_meta.get("geography", {})
            b_geo = b_meta.get("geography", {})
            a_city = a_geo.get("city", "").lower() if a_geo else ""
            b_city = b_geo.get("city", "").lower() if b_geo else ""

            a_industries = set(i.lower() for i in a_meta.get("industries", []))
            b_industries = set(i.lower() for i in b_meta.get("industries", []))

            if a_city and a_city == b_city and a_industries & b_industries:
                return ("likely_connected", 0.3)

            # Same industry alone = weak inference
            if a_industries & b_industries and len(a_industries & b_industries) >= 1:
                return ("industry_peers", 0.2)

            return None

        except Exception as e:
            logger.debug(f"Connection inference failed: {e}")
            return None

    def detect_inferred_connections(self) -> List[DetectedPattern]:
        """
        Detect potential connections between entities based on shared attributes.

        Scans person entities for shared geography, industry, or communities
        and suggests relationships that don't yet exist.

        Returns:
            List of DetectedPattern for potential connections
        """
        patterns = []

        try:
            # Get person entities with metadata
            entities = self.db.execute(
                """
                SELECT id, name, metadata FROM entities
                WHERE type = 'person' AND importance > 0.2 AND metadata IS NOT NULL
                ORDER BY importance DESC
                LIMIT 100
                """,
                fetch=True,
            ) or []

            # Compare pairs
            for i in range(len(entities)):
                for j in range(i + 1, len(entities)):
                    entity_a = entities[i]
                    entity_b = entities[j]

                    # Check if relationship already exists
                    existing = self.db.get_one(
                        "relationships",
                        where="(source_entity_id = ? AND target_entity_id = ?) OR (source_entity_id = ? AND target_entity_id = ?)",
                        where_params=(entity_a["id"], entity_b["id"], entity_b["id"], entity_a["id"]),
                    )
                    if existing:
                        continue

                    # Try to infer connection
                    inference = self.infer_connections(entity_a["id"], entity_b["id"])
                    if inference:
                        rel_type, confidence = inference
                        patterns.append(
                            DetectedPattern(
                                name=f"inferred_connection_{entity_a['id']}_{entity_b['id']}",
                                description=f"{entity_a['name']} and {entity_b['name']} may be connected ({rel_type})",
                                pattern_type="relationship",
                                confidence=confidence,
                                evidence=[f"Inferred relationship type: {rel_type}"],
                            )
                        )

        except Exception as e:
            logger.debug(f"Inferred connection detection failed: {e}")

        return patterns

    def _detect_cross_entity_patterns(self) -> List[DetectedPattern]:
        """Detect person entities that co-occur in memories but have no explicit relationship."""
        patterns = []

        try:
            # Find pairs of person entities that appear together in 2+ memories
            co_mentions = self.db.execute(
                """
                SELECT
                    e1.id as id1, e1.name as name1,
                    e2.id as id2, e2.name as name2,
                    COUNT(DISTINCT me1.memory_id) as co_count
                FROM memory_entities me1
                JOIN memory_entities me2 ON me1.memory_id = me2.memory_id AND me1.entity_id < me2.entity_id
                JOIN entities e1 ON me1.entity_id = e1.id AND e1.type = 'person'
                JOIN entities e2 ON me2.entity_id = e2.id AND e2.type = 'person'
                GROUP BY me1.entity_id, me2.entity_id
                HAVING co_count >= 2
                ORDER BY co_count DESC
                LIMIT 20
                """,
                fetch=True,
            ) or []

            for row in co_mentions:
                # Check if a relationship already exists between them
                existing = self.db.get_one(
                    "relationships",
                    where="(source_entity_id = ? AND target_entity_id = ?) OR (source_entity_id = ? AND target_entity_id = ?)",
                    where_params=(row["id1"], row["id2"], row["id2"], row["id1"]),
                )
                if existing:
                    continue

                co_count = row["co_count"]
                confidence = min(0.9, 0.4 + co_count * 0.1)

                patterns.append(
                    DetectedPattern(
                        name=f"cross_entity_{row['id1']}_{row['id2']}",
                        description=f"{row['name1']} and {row['name2']} appear together in {co_count} memories. Are they connected?",
                        pattern_type="relationship",
                        confidence=confidence,
                        evidence=[f"Co-mentioned in {co_count} memories"],
                    )
                )

        except Exception as e:
            logger.debug(f"Cross-entity detection failed: {e}")

        return patterns

    def _detect_introduction_opportunities(self) -> List[DetectedPattern]:
        """
        Detect pairs of people who share attributes but aren't directly connected.

        Uses the infer_connections logic to find people who likely should know
        each other based on shared geography, industry, or communities.

        Returns:
            List of DetectedPattern for introduction opportunities
        """
        patterns = []

        try:
            # Get person entities with metadata
            entities = self.db.execute(
                """
                SELECT id, name, metadata FROM entities
                WHERE type = 'person' AND importance > 0.3 AND metadata IS NOT NULL
                ORDER BY importance DESC
                LIMIT 50
                """,
                fetch=True,
            ) or []

            for i in range(len(entities)):
                for j in range(i + 1, len(entities)):
                    entity_a = entities[i]
                    entity_b = entities[j]

                    # Check if relationship already exists
                    existing = self.db.get_one(
                        "relationships",
                        where="(source_entity_id = ? AND target_entity_id = ?) OR (source_entity_id = ? AND target_entity_id = ?)",
                        where_params=(entity_a["id"], entity_b["id"], entity_b["id"], entity_a["id"]),
                    )
                    if existing:
                        continue

                    # Try to infer connection
                    inference = self.infer_connections(entity_a["id"], entity_b["id"])
                    if inference and inference[1] >= 0.5:  # Only strong inferences
                        rel_type, confidence = inference
                        a_meta_raw = entity_a["metadata"] if "metadata" in entity_a.keys() else None
                        b_meta_raw = entity_b["metadata"] if "metadata" in entity_b.keys() else None
                        a_meta = json.loads(a_meta_raw) if a_meta_raw else {}
                        b_meta = json.loads(b_meta_raw) if b_meta_raw else {}

                        # Build reason
                        reason_parts = []
                        if rel_type == "colleagues":
                            reason_parts.append(f"both at {a_meta.get('company', 'same company')}")
                        elif rel_type == "community_connection":
                            shared_communities = set(a_meta.get("communities", [])) & set(b_meta.get("communities", []))
                            if shared_communities:
                                reason_parts.append(f"both in {list(shared_communities)[0]}")

                        reason = " and ".join(reason_parts) if reason_parts else rel_type

                        patterns.append(
                            DetectedPattern(
                                name=f"intro_opportunity_{entity_a['id']}_{entity_b['id']}",
                                description=f"{entity_a['name']} and {entity_b['name']} might benefit from meeting ({reason})",
                                pattern_type="relationship",
                                confidence=confidence,
                                evidence=[f"Shared attributes suggest connection: {rel_type}"],
                            )
                        )

        except Exception as e:
            logger.debug(f"Introduction opportunity detection failed: {e}")

        return patterns[:10]  # Limit to top 10

    def _detect_cluster_forming(self) -> List[DetectedPattern]:
        """
        Detect when 3+ people are mentioned together frequently.

        Identifies emerging collaboration groups that might benefit from
        being formalized as a project or team.

        Returns:
            List of DetectedPattern for forming clusters
        """
        patterns = []

        try:
            # Find memories with 3+ person entities in the last 30 days
            cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()

            cluster_rows = self.db.execute(
                """
                SELECT
                    m.id as memory_id,
                    GROUP_CONCAT(e.name) as people,
                    COUNT(DISTINCT e.id) as person_count
                FROM memories m
                JOIN memory_entities me ON m.id = me.memory_id
                JOIN entities e ON me.entity_id = e.id AND e.type = 'person'
                WHERE m.created_at >= ?
                GROUP BY m.id
                HAVING person_count >= 3
                ORDER BY m.created_at DESC
                LIMIT 50
                """,
                (cutoff,),
                fetch=True,
            ) or []

            # Count co-occurrence frequency
            cluster_counts = Counter()
            for row in cluster_rows:
                people = tuple(sorted(row["people"].split(",")))
                cluster_counts[people] += 1

            # Report clusters appearing 2+ times
            for people, count in cluster_counts.most_common(5):
                if count >= 2:
                    people_str = ", ".join(people[:3])
                    if len(people) > 3:
                        people_str += f" and {len(people) - 3} others"

                    patterns.append(
                        DetectedPattern(
                            name=f"cluster_forming_{'_'.join(p.split()[0].lower() for p in people[:3])}",
                            description=f"You're frequently mentioning {people_str} together ({count} times recently)",
                            pattern_type="behavioral",
                            confidence=min(0.9, 0.5 + count * 0.1),
                            evidence=[f"Co-mentioned in {count} memories in the last 30 days"],
                        )
                    )

        except Exception as e:
            logger.debug(f"Cluster detection failed: {e}")

        return patterns

    def _detect_communication_patterns(self) -> List[DetectedPattern]:
        """Detect communication style patterns"""
        patterns = []

        # Analyze message lengths and types
        recent_messages = self.db.execute(
            """
            SELECT role, LENGTH(content) as msg_length
            FROM messages
            WHERE created_at >= ?
            ORDER BY created_at DESC
            LIMIT 100
            """,
            ((datetime.utcnow() - timedelta(days=7)).isoformat(),),
            fetch=True,
        ) or []

        if len(recent_messages) >= 20:
            user_msgs = [m for m in recent_messages if m["role"] == "user"]
            if user_msgs:
                avg_length = sum(m["msg_length"] for m in user_msgs) / len(user_msgs)

                if avg_length < 50:
                    patterns.append(
                        DetectedPattern(
                            name="brief_communication_style",
                            description="User tends to communicate in brief messages",
                            pattern_type="communication",
                            confidence=0.6,
                            evidence=[f"Average message length: {avg_length:.0f} characters"],
                        )
                    )
                elif avg_length > 200:
                    patterns.append(
                        DetectedPattern(
                            name="detailed_communication_style",
                            description="User tends to provide detailed context",
                            pattern_type="communication",
                            confidence=0.6,
                            evidence=[f"Average message length: {avg_length:.0f} characters"],
                        )
                    )

        return patterns

    def _store_pattern(self, pattern: DetectedPattern) -> int:
        """Store or update a detected pattern"""
        existing = self.db.get_one(
            "patterns", where="name = ?", where_params=(pattern.name,)
        )

        if existing:
            # Update existing pattern
            new_occurrences = existing["occurrences"] + 1
            new_confidence = min(1.0, (existing["confidence"] + pattern.confidence) / 2)

            self.db.update(
                "patterns",
                {
                    "occurrences": new_occurrences,
                    "confidence": new_confidence,
                    "last_observed_at": datetime.utcnow().isoformat(),
                    "evidence": json.dumps(pattern.evidence),
                },
                "id = ?",
                (existing["id"],),
            )
            return existing["id"]
        else:
            # Create new pattern
            return self.db.insert(
                "patterns",
                {
                    "name": pattern.name,
                    "description": pattern.description,
                    "pattern_type": pattern.pattern_type,
                    "occurrences": 1,
                    "confidence": pattern.confidence,
                    "first_observed_at": datetime.utcnow().isoformat(),
                    "last_observed_at": datetime.utcnow().isoformat(),
                    "evidence": json.dumps(pattern.evidence),
                    "is_active": 1,
                },
            )

    def generate_predictions(self) -> List[Prediction]:
        """
        Generate proactive suggestions based on patterns and data.

        Returns:
            List of predictions/suggestions
        """
        predictions = []

        # Generate relationship reconnection suggestions
        reconnect = self._generate_reconnect_predictions()
        predictions.extend(reconnect)

        # Generate commitment reminders
        reminders = self._generate_commitment_reminders()
        predictions.extend(reminders)

        # Generate pattern-based insights
        insights = self._generate_pattern_insights()
        predictions.extend(insights)

        # Store predictions
        for pred in predictions:
            self._store_prediction(pred)

        logger.info(f"Generated {len(predictions)} predictions")
        return predictions

    def detect_opportunities(self) -> List[DetectedPattern]:
        """
        Detect cross-network patterns that surface business/relationship opportunities.

        Includes:
        - Skill-project matches: Person has skills matching a project they're not on
        - Network bridges: User bridges distinct clusters
        - Timing alignment: Related entities have upcoming events

        Returns:
            List of DetectedPattern for opportunities
        """
        patterns = []

        # 1. Skill-project matches
        skill_matches = self._detect_skill_project_matches()
        patterns.extend(skill_matches)

        # 2. Network bridges
        bridges = self._detect_network_bridges()
        patterns.extend(bridges)

        return patterns

    def _detect_skill_project_matches(self) -> List[DetectedPattern]:
        """
        Find people with skills/interests that match projects they're not connected to.

        Uses entity metadata (industries, role) and project descriptions to find matches.
        """
        patterns = []

        try:
            # Get projects with descriptions
            projects = self.db.execute(
                """
                SELECT id, name, description, metadata FROM entities
                WHERE type = 'project' AND importance > 0.2
                ORDER BY importance DESC
                LIMIT 20
                """,
                fetch=True,
            ) or []

            # Get people with attributes
            people = self.db.execute(
                """
                SELECT id, name, metadata FROM entities
                WHERE type = 'person' AND importance > 0.3 AND metadata IS NOT NULL
                ORDER BY importance DESC
                LIMIT 50
                """,
                fetch=True,
            ) or []

            for project in projects:
                proj_desc = (project["description"] or "").lower()
                proj_meta = json.loads(project["metadata"] or "{}") if project.get("metadata") else {}
                proj_industries = set(proj_meta.get("industries", []))

                # Keywords from project description
                proj_keywords = set()
                for keyword_list in self.config.__dict__.get("industry_keywords", {}).values():
                    for kw in keyword_list if isinstance(keyword_list, list) else []:
                        if kw in proj_desc:
                            proj_keywords.add(kw)

                for person in people:
                    # Check if person is already connected to project
                    existing = self.db.get_one(
                        "relationships",
                        where="(source_entity_id = ? AND target_entity_id = ?) OR (source_entity_id = ? AND target_entity_id = ?)",
                        where_params=(person["id"], project["id"], project["id"], person["id"]),
                    )
                    if existing:
                        continue

                    person_meta = json.loads(person["metadata"] or "{}") if person.get("metadata") else {}
                    person_industries = set(person_meta.get("industries", []))
                    person_role = person_meta.get("role", "").lower()

                    # Check for industry match
                    shared_industries = proj_industries & person_industries
                    if shared_industries:
                        patterns.append(
                            DetectedPattern(
                                name=f"skill_project_match_{person['id']}_{project['id']}",
                                description=f"{person['name']} might be valuable for {project['name']} (shares {', '.join(shared_industries)} expertise)",
                                pattern_type="opportunity",
                                confidence=0.6,
                                evidence=[f"Shared industries: {', '.join(shared_industries)}"],
                            )
                        )
                        continue

                    # Check for role match in description
                    if person_role and person_role in proj_desc:
                        patterns.append(
                            DetectedPattern(
                                name=f"skill_project_match_{person['id']}_{project['id']}",
                                description=f"{person['name']} ({person_role}) might be valuable for {project['name']}",
                                pattern_type="opportunity",
                                confidence=0.5,
                                evidence=[f"Role '{person_role}' mentioned in project description"],
                            )
                        )

        except Exception as e:
            logger.debug(f"Skill-project matching failed: {e}")

        return patterns[:10]  # Limit to top 10

    def _detect_network_bridges(self) -> List[DetectedPattern]:
        """
        Detect when the user bridges distinct clusters in their network.

        Uses community detection heuristics to find groups of densely connected
        entities that are only connected through a single hub.
        """
        patterns = []

        try:
            # Find people with high connection counts
            hubs = self.db.execute(
                """
                SELECT e.id, e.name,
                       COUNT(DISTINCT r.id) as connection_count
                FROM entities e
                LEFT JOIN relationships r ON (e.id = r.source_entity_id OR e.id = r.target_entity_id)
                    AND r.strength > 0.2 AND r.invalid_at IS NULL
                WHERE e.type = 'person' AND e.importance > 0.4
                GROUP BY e.id
                HAVING connection_count >= 5
                ORDER BY connection_count DESC
                LIMIT 10
                """,
                fetch=True,
            ) or []

            for hub in hubs:
                # Get all neighbors of this hub
                neighbors = self.db.execute(
                    """
                    SELECT DISTINCT
                        CASE WHEN r.source_entity_id = ? THEN r.target_entity_id ELSE r.source_entity_id END as neighbor_id,
                        e.name as neighbor_name
                    FROM relationships r
                    JOIN entities e ON e.id = CASE WHEN r.source_entity_id = ? THEN r.target_entity_id ELSE r.source_entity_id END
                    WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
                      AND r.strength > 0.2 AND r.invalid_at IS NULL
                      AND e.type = 'person'
                    """,
                    (hub["id"], hub["id"], hub["id"], hub["id"]),
                    fetch=True,
                ) or []

                if len(neighbors) < 4:
                    continue

                # Check how many neighbors are connected to each other (not through hub)
                neighbor_ids = [n["neighbor_id"] for n in neighbors]
                interconnections = self.db.execute(
                    f"""
                    SELECT COUNT(*) as cnt FROM relationships
                    WHERE source_entity_id IN ({','.join('?' for _ in neighbor_ids)})
                      AND target_entity_id IN ({','.join('?' for _ in neighbor_ids)})
                      AND strength > 0.2 AND invalid_at IS NULL
                    """,
                    tuple(neighbor_ids) + tuple(neighbor_ids),
                    fetch=True,
                )

                inter_count = interconnections[0]["cnt"] if interconnections else 0
                max_possible = len(neighbor_ids) * (len(neighbor_ids) - 1) / 2

                # If few interconnections relative to possible, this is a bridge
                if max_possible > 0 and inter_count / max_possible < 0.2:
                    # Find distinct groups
                    group_a = neighbors[:len(neighbors)//2]
                    group_b = neighbors[len(neighbors)//2:]

                    patterns.append(
                        DetectedPattern(
                            name=f"network_bridge_{hub['id']}",
                            description=f"{hub['name']} bridges distinct groups ({len(group_a)} and {len(group_b)} people who don't know each other)",
                            pattern_type="opportunity",
                            confidence=0.7,
                            evidence=[f"Only {inter_count} connections among {len(neighbor_ids)} neighbors"],
                        )
                    )

        except Exception as e:
            logger.debug(f"Network bridge detection failed: {e}")

        return patterns

    def _generate_reconnect_predictions(self) -> List[Prediction]:
        """Suggest people to reconnect with"""
        predictions = []

        # Find cooling relationships from patterns
        cooling_patterns = self.db.query(
            "patterns",
            where="pattern_type = ? AND is_active = 1 AND confidence > 0.5",
            where_params=("relationship",),
            order_by="confidence DESC",
            limit=5,
        )

        for pattern in cooling_patterns:
            feedback = self._get_pattern_feedback("suggestion", pattern["name"])
            predictions.append(
                Prediction(
                    content=pattern["description"],
                    prediction_type="suggestion",
                    priority=pattern["confidence"] * feedback,
                    expires_at=datetime.utcnow() + timedelta(days=7),
                    metadata={"pattern_id": pattern["id"]},
                    pattern_name=pattern["name"],
                )
            )

        return predictions

    def _generate_commitment_reminders(self) -> List[Prediction]:
        """Generate reminders for commitments"""
        predictions = []

        # Find old commitments that might need attention
        old_commitments = self.db.query(
            "memories",
            where="type = 'commitment' AND importance > 0.3",
            order_by="created_at ASC",
            limit=5,
        )

        for commitment in old_commitments:
            created = datetime.fromisoformat(commitment["created_at"])
            days_old = (datetime.utcnow() - created).days

            if days_old > 3:
                pattern_name = f"commitment_reminder_{commitment['id']}"
                feedback = self._get_pattern_feedback("reminder", pattern_name)
                predictions.append(
                    Prediction(
                        content=f"Commitment from {days_old} days ago: {commitment['content'][:100]}",
                        prediction_type="reminder",
                        priority=min(1.0, 0.5 + days_old / 14) * feedback,
                        expires_at=datetime.utcnow() + timedelta(days=2),
                        metadata={"memory_id": commitment["id"]},
                        pattern_name=pattern_name,
                    )
                )

        return predictions

    def _generate_pattern_insights(self) -> List[Prediction]:
        """Generate insights from detected patterns"""
        predictions = []

        # Find high-confidence active patterns
        patterns = self.db.query(
            "patterns",
            where="is_active = 1 AND confidence > 0.7 AND occurrences > 2",
            order_by="confidence DESC",
            limit=3,
        )

        for pattern in patterns:
            if pattern["pattern_type"] == "behavioral":
                feedback = self._get_pattern_feedback("insight", pattern["name"])
                predictions.append(
                    Prediction(
                        content=f"Pattern noticed: {pattern['description']}",
                        prediction_type="insight",
                        priority=pattern["confidence"] * 0.8 * feedback,
                        expires_at=datetime.utcnow() + timedelta(days=14),
                        metadata={"pattern_id": pattern["id"]},
                        pattern_name=pattern["name"],
                    )
                )

        return predictions

    def _store_prediction(self, prediction: Prediction) -> int:
        """Store a prediction in the database"""
        data = {
            "content": prediction.content,
            "prediction_type": prediction.prediction_type,
            "priority": prediction.priority,
            "expires_at": prediction.expires_at.isoformat() if prediction.expires_at else None,
            "is_shown": 0,
            "is_acted_on": 0,
            "created_at": datetime.utcnow().isoformat(),
            "metadata": json.dumps(prediction.metadata) if prediction.metadata else None,
        }
        if prediction.pattern_name:
            data["prediction_pattern_name"] = prediction.pattern_name
        return self.db.insert("predictions", data)

    def get_predictions(
        self,
        limit: int = 10,
        prediction_types: Optional[List[str]] = None,
        include_shown: bool = False,
    ) -> List[Dict]:
        """
        Get active predictions for display.

        Args:
            limit: Maximum predictions to return
            prediction_types: Filter by types
            include_shown: Include already-shown predictions

        Returns:
            List of prediction dicts
        """
        sql = """
            SELECT * FROM predictions
            WHERE (expires_at IS NULL OR expires_at > ?)
        """
        params = [datetime.utcnow().isoformat()]

        if not include_shown:
            sql += " AND is_shown = 0"

        if prediction_types:
            placeholders = ", ".join(["?" for _ in prediction_types])
            sql += f" AND prediction_type IN ({placeholders})"
            params.extend(prediction_types)

        sql += " ORDER BY priority DESC, created_at DESC LIMIT ?"
        params.append(limit)

        rows = self.db.execute(sql, tuple(params), fetch=True) or []

        return [dict(row) for row in rows]

    def mark_prediction_shown(self, prediction_id: int) -> None:
        """Mark a prediction as shown to the user"""
        self.db.update(
            "predictions",
            {"is_shown": 1, "shown_at": datetime.utcnow().isoformat()},
            "id = ?",
            (prediction_id,),
        )

    def mark_prediction_acted_on(self, prediction_id: int, acted_on: bool) -> None:
        """Mark a prediction as acted on (or not) by the user"""
        self.db.update(
            "predictions",
            {"is_acted_on": 1 if acted_on else 0},
            "id = ?",
            (prediction_id,),
        )

    def _get_pattern_feedback(self, prediction_type: str, pattern_name: str) -> float:
        """
        Return a priority multiplier based on past user engagement with similar predictions.

        Rules:
        - <5 shown predictions for this type: return 1.0 (insufficient data)
        - act_ratio < 0.1: return 0.5 (user ignores these, halve priority)
        - act_ratio > 0.5: return 1.25 (user values these, boost priority)
        - Otherwise: return 1.0 (neutral)
        """
        try:
            rows = self.db.execute(
                """
                SELECT COUNT(*) as total,
                       SUM(CASE WHEN is_acted_on = 1 THEN 1 ELSE 0 END) as acted
                FROM predictions
                WHERE prediction_type = ? AND is_shown = 1
                """,
                (prediction_type,),
                fetch=True,
            )
            if not rows:
                return 1.0

            total = rows[0]["total"] or 0
            acted = rows[0]["acted"] or 0

            if total < 5:
                return 1.0

            act_ratio = acted / total
            if act_ratio < 0.1:
                return 0.5
            elif act_ratio > 0.5:
                return 1.25
            return 1.0
        except Exception as e:
            logger.debug(f"Feedback lookup failed: {e}")
            return 1.0

    def merge_similar_memories(self) -> int:
        """
        Merge semantically similar memories during consolidation.
        Uses existing stored embeddings -- no new Ollama calls.

        Returns:
            Count of merged memory pairs
        """
        if not self.config.enable_memory_merging:
            return 0

        threshold = self.config.similarity_merge_threshold
        merged_count = 0

        try:
            # Find entities with 5+ linked memories (high-memory entities first)
            entity_rows = self.db.execute(
                """
                SELECT me.entity_id, COUNT(DISTINCT me.memory_id) as mem_count
                FROM memory_entities me
                GROUP BY me.entity_id
                HAVING mem_count >= 5
                ORDER BY mem_count DESC
                LIMIT 50
                """,
                fetch=True,
            ) or []

            for entity_row in entity_rows:
                entity_id = entity_row["entity_id"]

                # Load memory IDs and embeddings for this entity
                mem_rows = self.db.execute(
                    """
                    SELECT me.memory_id, m.importance, m.access_count,
                           emb.embedding
                    FROM memory_entities me
                    JOIN memories m ON me.memory_id = m.id
                    LEFT JOIN memory_embeddings emb ON m.id = emb.memory_id
                    WHERE me.entity_id = ?
                      AND m.importance > 0.01
                    ORDER BY m.importance DESC
                    """,
                    (entity_id,),
                    fetch=True,
                ) or []

                # Parse embeddings
                memories_with_emb = []
                for row in mem_rows:
                    if row["embedding"]:
                        try:
                            emb = json.loads(row["embedding"]) if isinstance(row["embedding"], str) else row["embedding"]
                            memories_with_emb.append({
                                "id": row["memory_id"],
                                "importance": row["importance"],
                                "access_count": row["access_count"] or 0,
                                "embedding": emb,
                            })
                        except (json.JSONDecodeError, TypeError):
                            continue

                if len(memories_with_emb) < 2:
                    continue

                # Pairwise cosine similarity
                already_merged = set()
                for i in range(len(memories_with_emb)):
                    if memories_with_emb[i]["id"] in already_merged:
                        continue
                    for j in range(i + 1, len(memories_with_emb)):
                        if memories_with_emb[j]["id"] in already_merged:
                            continue

                        sim = _cosine_similarity(
                            memories_with_emb[i]["embedding"],
                            memories_with_emb[j]["embedding"],
                        )
                        if sim >= threshold:
                            # Keep the one with higher importance * (1 + access_count)
                            score_i = memories_with_emb[i]["importance"] * (1 + memories_with_emb[i]["access_count"])
                            score_j = memories_with_emb[j]["importance"] * (1 + memories_with_emb[j]["access_count"])

                            if score_i >= score_j:
                                primary_id = memories_with_emb[i]["id"]
                                duplicate_id = memories_with_emb[j]["id"]
                            else:
                                primary_id = memories_with_emb[j]["id"]
                                duplicate_id = memories_with_emb[i]["id"]

                            self._merge_memory_pair(primary_id, duplicate_id)
                            already_merged.add(duplicate_id)
                            merged_count += 1

        except Exception as e:
            logger.warning(f"Memory merging failed: {e}")

        if merged_count > 0:
            logger.info(f"Merged {merged_count} near-duplicate memory pairs")
        return merged_count

    def _merge_memory_pair(self, primary_id: int, duplicate_id: int) -> None:
        """
        Merge a duplicate memory into the primary.

        - Transfers entity links from duplicate to primary
        - Adds merged_from to primary's metadata
        - Sets duplicate importance to 0.001
        """
        # Transfer entity links
        dup_links = self.db.execute(
            "SELECT entity_id, relationship FROM memory_entities WHERE memory_id = ?",
            (duplicate_id,),
            fetch=True,
        ) or []

        for link in dup_links:
            try:
                self.db.insert(
                    "memory_entities",
                    {
                        "memory_id": primary_id,
                        "entity_id": link["entity_id"],
                        "relationship": link["relationship"],
                    },
                )
            except Exception:
                pass  # Duplicate link, ignore

        # Update primary's metadata with merge info
        primary = self.db.get_one("memories", where="id = ?", where_params=(primary_id,))
        if primary:
            meta = json.loads(primary["metadata"] or "{}")
            merged_from = meta.get("merged_from", [])
            merged_from.append(duplicate_id)
            meta["merged_from"] = merged_from
            self.db.update(
                "memories",
                {"metadata": json.dumps(meta), "updated_at": datetime.utcnow().isoformat()},
                "id = ?",
                (primary_id,),
            )

        # Suppress duplicate (don't delete, just minimize importance)
        self.db.update(
            "memories",
            {"importance": 0.001, "updated_at": datetime.utcnow().isoformat()},
            "id = ?",
            (duplicate_id,),
        )

        logger.debug(f"Merged memory {duplicate_id} into {primary_id}")

    def run_llm_consolidation(self) -> Dict[str, Any]:
        """
        Run LLM-powered memory consolidation (sleep-time processing).

        Uses the local language model to:
        1. Improve memory summaries for clarity
        2. Generate richer predictions from recent memories

        Gracefully degrades when no LLM is available.

        Returns:
            Dict with counts of improvements made, or {"skipped": True}
        """
        from ..language_model import get_language_model_service

        lm = get_language_model_service()
        if not lm.is_available_sync():
            logger.info("LLM consolidation skipped: no language model available")
            return {"skipped": True}

        if not self.config.enable_llm_consolidation:
            logger.info("LLM consolidation skipped: disabled in config")
            return {"skipped": True}

        results = {}

        try:
            improved = self._improve_memory_summaries(lm)
            results["memories_improved"] = improved
        except Exception as e:
            logger.warning(f"Memory summary improvement failed: {e}")
            results["memories_improved"] = 0

        try:
            predicted = self._generate_llm_predictions(lm)
            results["predictions_generated"] = predicted
        except Exception as e:
            logger.warning(f"LLM prediction generation failed: {e}")
            results["predictions_generated"] = 0

        logger.info(f"LLM consolidation complete: {results}")
        return results

    def _improve_memory_summaries(self, lm) -> int:
        """
        Rewrite high-importance memories for clarity using the local LLM.

        Processes batch_size memories per run. Skips already-improved memories
        (checked via metadata.llm_improved flag).

        Returns:
            Count of memories improved
        """
        batch_size = self.config.llm_consolidation_batch_size
        improved = 0

        # Find high-importance memories not yet improved
        rows = self.db.execute(
            """
            SELECT id, content, metadata FROM memories
            WHERE importance > 0.3
            ORDER BY importance DESC, created_at DESC
            LIMIT ?
            """,
            (batch_size * 3,),  # Fetch extra to account for already-improved
            fetch=True,
        ) or []

        for row in rows:
            if improved >= batch_size:
                break

            # Check if already improved
            meta = json.loads(row["metadata"] or "{}")
            if meta.get("llm_improved"):
                continue

            # Improve the memory
            prompt = (
                f"Rewrite this memory to be more concise and clear. "
                f"Keep all facts. Return only the rewritten text, nothing else.\n\n"
                f"Original: {row['content']}"
            )
            result = lm.generate_sync(prompt, temperature=0.1)

            if result and len(result.strip()) > 10:
                # Preserve original and mark as improved
                meta["original_content"] = row["content"]
                meta["llm_improved"] = True

                self.db.update(
                    "memories",
                    {
                        "content": result.strip(),
                        "metadata": json.dumps(meta),
                        "updated_at": datetime.utcnow().isoformat(),
                    },
                    "id = ?",
                    (row["id"],),
                )
                improved += 1

        return improved

    def _generate_llm_predictions(self, lm) -> int:
        """
        Use the local LLM to reason about recent memories and generate predictions.

        Gathers recent high-importance memories with entity context, asks the LLM
        to generate actionable suggestions, and stores them as predictions.

        Returns:
            Count of predictions generated
        """
        # Gather recent high-importance memories
        rows = self.db.execute(
            """
            SELECT m.content, m.type, m.importance,
                   GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE m.importance > 0.3
            GROUP BY m.id
            ORDER BY m.created_at DESC
            LIMIT 20
            """,
            fetch=True,
        ) or []

        if not rows:
            return 0

        # Build context for the LLM
        memory_lines = []
        for row in rows:
            entities = row["entity_names"] or "none"
            memory_lines.append(
                f"- [{row['type']}] {row['content']} (entities: {entities})"
            )

        memories_text = "\n".join(memory_lines)
        prompt = (
            f"Based on these recent memories, generate 1-3 actionable suggestions "
            f"for the user. Each suggestion should be something they should do, "
            f"follow up on, or be aware of.\n\n"
            f"Memories:\n{memories_text}\n\n"
            f"Return a JSON array of objects with 'content' (string) and "
            f"'priority' (float 0-1) fields. Example:\n"
            f'[{{"content": "Follow up with Sarah about the proposal", "priority": 0.8}}]\n\n'
            f"JSON:"
        )

        result = lm.generate_sync(prompt, temperature=0.3, format_json=True)
        if not result:
            return 0

        # Parse JSON response
        try:
            predictions = json.loads(result.strip())
            if not isinstance(predictions, list):
                return 0
        except (json.JSONDecodeError, ValueError):
            logger.debug("LLM returned invalid JSON for predictions")
            return 0

        # Store predictions
        count = 0
        for pred in predictions:
            if not isinstance(pred, dict) or "content" not in pred:
                continue

            self._store_prediction(Prediction(
                content=pred["content"],
                prediction_type="suggestion",
                priority=min(1.0, max(0.0, float(pred.get("priority", 0.5)))),
                expires_at=datetime.utcnow() + timedelta(days=7),
                metadata={"source": "llm_consolidation"},
                pattern_name=None,
            ))
            count += 1

        return count

    def aggregate_reflections(self) -> int:
        """
        Aggregate semantically similar reflections during consolidation.

        Finds reflection pairs with high cosine similarity (>0.85) and
        merges them while preserving timeline information. The merged
        reflection gets:
        - Combined aggregation_count
        - Earliest first_observed_at
        - Latest last_confirmed_at
        - Slower decay rate if aggregation_count >= 3

        Returns:
            Count of reflection pairs merged
        """
        threshold = 0.85  # High threshold since reflections are already curated
        merged_count = 0

        try:
            # Find reflections with embeddings
            rows = self.db.execute(
                """
                SELECT r.id, r.content, r.reflection_type, r.importance,
                       r.aggregation_count, r.first_observed_at, r.last_confirmed_at,
                       re.embedding
                FROM reflections r
                JOIN reflection_embeddings re ON r.id = re.reflection_id
                WHERE r.importance > 0.1
                ORDER BY r.importance DESC
                """,
                fetch=True,
            ) or []

            if len(rows) < 2:
                return 0

            # Parse embeddings
            reflections_with_emb = []
            for row in rows:
                if row["embedding"]:
                    try:
                        emb = json.loads(row["embedding"]) if isinstance(row["embedding"], str) else row["embedding"]
                        reflections_with_emb.append({
                            "id": row["id"],
                            "content": row["content"],
                            "type": row["reflection_type"],
                            "importance": row["importance"],
                            "aggregation_count": row["aggregation_count"],
                            "first_observed_at": row["first_observed_at"],
                            "last_confirmed_at": row["last_confirmed_at"],
                            "embedding": emb,
                        })
                    except (json.JSONDecodeError, TypeError):
                        continue

            # Pairwise similarity, same type only
            already_merged = set()
            for i in range(len(reflections_with_emb)):
                if reflections_with_emb[i]["id"] in already_merged:
                    continue
                for j in range(i + 1, len(reflections_with_emb)):
                    if reflections_with_emb[j]["id"] in already_merged:
                        continue

                    # Only merge same type
                    if reflections_with_emb[i]["type"] != reflections_with_emb[j]["type"]:
                        continue

                    sim = _cosine_similarity(
                        reflections_with_emb[i]["embedding"],
                        reflections_with_emb[j]["embedding"],
                    )
                    if sim >= threshold:
                        # Keep the one with higher aggregation_count * importance
                        score_i = reflections_with_emb[i]["aggregation_count"] * reflections_with_emb[i]["importance"]
                        score_j = reflections_with_emb[j]["aggregation_count"] * reflections_with_emb[j]["importance"]

                        if score_i >= score_j:
                            primary = reflections_with_emb[i]
                            duplicate = reflections_with_emb[j]
                        else:
                            primary = reflections_with_emb[j]
                            duplicate = reflections_with_emb[i]

                        self._merge_reflection_pair(primary, duplicate)
                        already_merged.add(duplicate["id"])
                        merged_count += 1

        except Exception as e:
            logger.debug(f"Reflection aggregation skipped (table may not exist): {e}")

        if merged_count > 0:
            logger.info(f"Aggregated {merged_count} similar reflection pairs")
        return merged_count

    def _merge_reflection_pair(self, primary: Dict, duplicate: Dict) -> None:
        """
        Merge a duplicate reflection into the primary.

        Preserves timeline: earliest first_observed_at, latest last_confirmed_at.
        Combines aggregation counts. Adjusts decay rate for well-confirmed reflections.
        """
        # Calculate merged values
        new_aggregation_count = primary["aggregation_count"] + duplicate["aggregation_count"]
        new_first_observed = min(primary["first_observed_at"], duplicate["first_observed_at"])
        new_last_confirmed = max(primary["last_confirmed_at"], duplicate["last_confirmed_at"])

        # Slow decay for well-confirmed reflections
        new_decay_rate = 0.9995 if new_aggregation_count >= 3 else 0.999

        # Boost importance slightly for confirmed patterns
        new_importance = min(1.0, primary["importance"] + 0.05)

        # Track which reflections were merged
        existing = self.db.get_one("reflections", where="id = ?", where_params=(primary["id"],))
        aggregated_from = json.loads(existing["aggregated_from"] or "[]") if existing else []
        aggregated_from.append(duplicate["id"])

        # Update primary
        self.db.update(
            "reflections",
            {
                "aggregation_count": new_aggregation_count,
                "first_observed_at": new_first_observed,
                "last_confirmed_at": new_last_confirmed,
                "decay_rate": new_decay_rate,
                "importance": new_importance,
                "aggregated_from": json.dumps(aggregated_from),
                "updated_at": datetime.utcnow().isoformat(),
            },
            "id = ?",
            (primary["id"],),
        )

        # Suppress duplicate (don't delete, minimize importance)
        self.db.update(
            "reflections",
            {"importance": 0.001, "updated_at": datetime.utcnow().isoformat()},
            "id = ?",
            (duplicate["id"],),
        )

        logger.debug(f"Merged reflection {duplicate['id']} into {primary['id']}")

    def run_full_consolidation(self) -> Dict[str, Any]:
        """
        Run complete consolidation: decay, patterns, predictions.
        Typically called overnight. Wraps each phase in a transaction
        so partial failures don't leave the database in an inconsistent state.
        """
        logger.info("Starting full consolidation")

        results = {}

        # Phase 1: Decay + boost (modifies importance scores)
        try:
            results["decay"] = self.run_decay()
            results["boosted"] = self.boost_accessed_memories()
        except Exception as e:
            logger.warning(f"Decay phase failed: {e}")
            results["decay"] = {"error": str(e)}
            results["boosted"] = 0

        # Phase 2: Merging (modifies memory content)
        try:
            results["merged"] = self.merge_similar_memories()
            results["reflections_aggregated"] = self.aggregate_reflections()
        except Exception as e:
            logger.warning(f"Merge phase failed: {e}")
            results["merged"] = 0
            results["reflections_aggregated"] = 0

        # Phase 3: Detection (read-heavy, writes new pattern rows)
        try:
            patterns = self.detect_patterns()
            results["patterns_detected"] = len(patterns)
        except Exception as e:
            logger.warning(f"Pattern detection failed: {e}")
            results["patterns_detected"] = 0

        logger.info(f"Consolidation complete: {results}")
        return results


# Global service instance
_service: Optional[ConsolidateService] = None


def get_consolidate_service() -> ConsolidateService:
    """Get or create the global consolidate service"""
    global _service
    if _service is None:
        _service = ConsolidateService()
    return _service


# Convenience functions
def run_decay() -> Dict[str, int]:
    """Apply importance decay"""
    return get_consolidate_service().run_decay()


def detect_patterns() -> List[DetectedPattern]:
    """Detect behavioral patterns"""
    return get_consolidate_service().detect_patterns()


def generate_predictions() -> List[Prediction]:
    """Generate proactive suggestions"""
    return get_consolidate_service().generate_predictions()


def get_predictions(**kwargs) -> List[Dict]:
    """Get active predictions"""
    return get_consolidate_service().get_predictions(**kwargs)


def run_full_consolidation() -> Dict[str, Any]:
    """Run complete consolidation"""
    return get_consolidate_service().run_full_consolidation()


def aggregate_reflections() -> int:
    """Aggregate similar reflections"""
    return get_consolidate_service().aggregate_reflections()
