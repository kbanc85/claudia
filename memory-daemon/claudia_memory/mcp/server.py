"""
MCP Server for Claudia Memory System

Exposes memory tools via the Model Context Protocol for use by Claude Code.
"""

import asyncio
import json
import logging
import sys
from typing import Any, Dict, List, Optional

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolResult,
    ListToolsResult,
    TextContent,
    Tool,
)

from ..database import get_db
from ..services.consolidate import (
    get_consolidate_service,
    get_predictions,
    run_full_consolidation,
)
from ..services.recall import (
    fetch_by_ids,
    get_recall_service,
    recall,
    recall_about,
    recall_episodes,
    search_entities,
    trace_memory,
)
from ..services.ingest import get_ingest_service
from ..services.remember import (
    buffer_turn,
    end_session,
    get_remember_service,
    get_unsummarized_turns,
    relate_entities,
    remember_entity,
    remember_fact,
    remember_message,
)

logger = logging.getLogger(__name__)

# Initialize the MCP server
server = Server("claudia-memory")


@server.list_tools()
async def list_tools() -> ListToolsResult:
    """List all available memory tools"""
    tools = [
        Tool(
            name="memory.remember",
            description="Store information in Claudia's memory. Use for facts, preferences, observations, or learnings about people, projects, or the user.",
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The information to remember (fact, preference, observation, etc.)",
                    },
                    "type": {
                        "type": "string",
                        "enum": ["fact", "preference", "observation", "learning", "commitment"],
                        "description": "Type of memory",
                        "default": "fact",
                    },
                    "about": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Entity names this memory relates to (people, projects, etc.)",
                    },
                    "importance": {
                        "type": "number",
                        "description": "Importance score from 0.0 to 1.0",
                        "default": 1.0,
                    },
                    "source": {
                        "type": "string",
                        "description": "Source type: email, transcript, document, conversation, user_input",
                    },
                    "source_context": {
                        "type": "string",
                        "description": "One-line breadcrumb describing origin (e.g., 'Email from Jim Ferry re: Forum V+, 2025-01-28')",
                    },
                    "source_material": {
                        "type": "string",
                        "description": "Full raw text of the source (email body, transcript, etc.). Saved to disk, not stored in DB.",
                    },
                },
                "required": ["content"],
            },
        ),
        Tool(
            name="memory.recall",
            description=(
                "Search Claudia's memory for relevant information. Uses hybrid vector + full-text "
                "similarity. Use compact=true for lightweight browsing (snippets), then fetch full "
                "content with ids=[...] for the interesting results."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to search for (required unless ids is provided)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results",
                        "default": 10,
                    },
                    "types": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by memory types (fact, preference, observation, learning, commitment)",
                    },
                    "about": {
                        "type": "string",
                        "description": "Filter to memories about a specific entity",
                    },
                    "compact": {
                        "type": "boolean",
                        "description": "Return compact results: {id, snippet (80 chars), type, score, entities (max 3)}",
                        "default": False,
                    },
                    "ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "Fetch specific memories by ID (skips search). Use after a compact search to get full content.",
                    },
                },
            },
        ),
        Tool(
            name="memory.about",
            description="Get all context about a specific person, project, or entity. Returns memories, relationships, and metadata.",
            inputSchema={
                "type": "object",
                "properties": {
                    "entity": {
                        "type": "string",
                        "description": "Name of the person, project, or entity",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of memories to return",
                        "default": 20,
                    },
                },
                "required": ["entity"],
            },
        ),
        Tool(
            name="memory.relate",
            description="Create or strengthen a relationship between two entities (people, projects, etc.)",
            inputSchema={
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "description": "Source entity name",
                    },
                    "target": {
                        "type": "string",
                        "description": "Target entity name",
                    },
                    "relationship": {
                        "type": "string",
                        "description": "Type of relationship (works_with, manages, client_of, etc.)",
                    },
                    "strength": {
                        "type": "number",
                        "description": "Relationship strength from 0.0 to 1.0",
                        "default": 1.0,
                    },
                },
                "required": ["source", "target", "relationship"],
            },
        ),
        Tool(
            name="memory.predictions",
            description="Get proactive suggestions, reminders, and insights generated by pattern analysis.",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of predictions",
                        "default": 5,
                    },
                    "types": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by type (reminder, suggestion, warning, insight)",
                    },
                },
            },
        ),
        Tool(
            name="memory.consolidate",
            description="Manually trigger memory consolidation (decay, pattern detection, prediction generation). Usually runs automatically.",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="memory.entity",
            description="Create or update information about an entity (person, organization, project, etc.)",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Entity name",
                    },
                    "type": {
                        "type": "string",
                        "enum": ["person", "organization", "project", "concept", "location"],
                        "description": "Type of entity",
                        "default": "person",
                    },
                    "description": {
                        "type": "string",
                        "description": "Description of the entity",
                    },
                    "aliases": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Alternative names or spellings",
                    },
                },
                "required": ["name"],
            },
        ),
        Tool(
            name="memory.search_entities",
            description="Search for entities (people, projects, organizations) by name or description.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query",
                    },
                    "types": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by entity types",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results",
                        "default": 10,
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="memory.buffer_turn",
            description="Buffer a conversation turn for end-of-session summarization. Call this after each meaningful exchange. Lightweight -- no embedding generation or extraction, just raw storage. Returns an episode_id to reuse on subsequent calls within the same session.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_content": {
                        "type": "string",
                        "description": "What the user said in this turn",
                    },
                    "assistant_content": {
                        "type": "string",
                        "description": "What the assistant said in this turn",
                    },
                    "episode_id": {
                        "type": "integer",
                        "description": "Episode ID from a previous buffer_turn call (omit on first call to create new episode)",
                    },
                },
                "required": [],
            },
        ),
        Tool(
            name="memory.end_session",
            description=(
                "Finalize a session with a narrative summary and structured extractions. "
                "Call at session end. The narrative should ENHANCE stored information -- capture "
                "tone, emotional context, unresolved threads, reasons behind decisions, half-formed "
                "ideas, and anything that doesn't fit structured categories. The structured fields "
                "(facts, commitments, entities, relationships) are stored alongside the narrative, "
                "not replaced by it. Both are searchable in future sessions."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "episode_id": {
                        "type": "integer",
                        "description": "Episode ID from buffer_turn calls during the session",
                    },
                    "narrative": {
                        "type": "string",
                        "description": (
                            "Free-form narrative summary of the session. Capture the texture: "
                            "what was discussed, what felt important, what was unresolved, "
                            "emotional undercurrents, reasons behind decisions, context that "
                            "enriches the structured data. This is NOT a compression -- it adds "
                            "dimensions that structured fields cannot capture."
                        ),
                    },
                    "facts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "content": {"type": "string"},
                                "type": {
                                    "type": "string",
                                    "enum": ["fact", "preference", "observation", "learning", "pattern"],
                                    "default": "fact",
                                },
                                "about": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Entity names this fact relates to",
                                },
                                "importance": {"type": "number", "default": 1.0},
                                "source": {
                                    "type": "string",
                                    "description": "Override source type (default: session_summary)",
                                },
                                "source_context": {
                                    "type": "string",
                                    "description": "One-line breadcrumb describing origin",
                                },
                                "source_material": {
                                    "type": "string",
                                    "description": "Full raw source text, saved to disk",
                                },
                            },
                            "required": ["content"],
                        },
                        "description": "Structured facts, preferences, observations, learnings extracted from the session",
                    },
                    "commitments": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "content": {"type": "string"},
                                "about": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "importance": {"type": "number", "default": 1.0},
                                "source": {
                                    "type": "string",
                                    "description": "Override source type (default: session_summary)",
                                },
                                "source_context": {
                                    "type": "string",
                                    "description": "One-line breadcrumb describing origin",
                                },
                                "source_material": {
                                    "type": "string",
                                    "description": "Full raw source text, saved to disk",
                                },
                            },
                            "required": ["content"],
                        },
                        "description": "Commitments or promises made during the session",
                    },
                    "entities": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {
                                    "type": "string",
                                    "enum": ["person", "organization", "project", "concept", "location"],
                                    "default": "person",
                                },
                                "description": {"type": "string"},
                                "aliases": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                            "required": ["name"],
                        },
                        "description": "New or updated entities mentioned during the session",
                    },
                    "relationships": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "source": {"type": "string"},
                                "target": {"type": "string"},
                                "relationship": {"type": "string"},
                                "strength": {"type": "number", "default": 1.0},
                            },
                            "required": ["source", "target", "relationship"],
                        },
                        "description": "Relationships between entities observed during the session",
                    },
                    "key_topics": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Main topics discussed in the session",
                    },
                },
                "required": ["episode_id", "narrative"],
            },
        ),
        Tool(
            name="memory.unsummarized",
            description=(
                "Check for previous sessions that ended without a summary. "
                "Call at session start. If results are returned, Claude should "
                "review the buffered turns and generate a retroactive summary "
                "by calling memory.end_session for each orphaned episode."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="memory.batch",
            description=(
                "Execute multiple memory operations in a single call. Use this for mid-session "
                "entity creation when processing a new person, meeting transcript, or topic that "
                "requires entity creation, multiple memories, and relationships. Much more efficient "
                "than calling memory.entity, memory.remember, and memory.relate separately. "
                "For end-of-session summaries, use memory.end_session instead."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "operations": {
                        "type": "array",
                        "description": "Array of operations to execute in order",
                        "items": {
                            "type": "object",
                            "properties": {
                                "op": {
                                    "type": "string",
                                    "enum": ["entity", "remember", "relate"],
                                    "description": "Operation type",
                                },
                                "name": {
                                    "type": "string",
                                    "description": "Entity name (for 'entity' op)",
                                },
                                "type": {
                                    "type": "string",
                                    "description": "Entity type or memory type",
                                },
                                "description": {
                                    "type": "string",
                                    "description": "Entity description (for 'entity' op)",
                                },
                                "aliases": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Entity aliases (for 'entity' op)",
                                },
                                "content": {
                                    "type": "string",
                                    "description": "Memory content (for 'remember' op)",
                                },
                                "about": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Entity names this relates to (for 'remember' op)",
                                },
                                "importance": {
                                    "type": "number",
                                    "description": "Importance score 0.0-1.0 (for 'remember' op)",
                                },
                                "source": {
                                    "type": "string",
                                    "description": "Source entity (for 'relate' op) or source type (for 'remember' op)",
                                },
                                "source_context": {
                                    "type": "string",
                                    "description": "One-line breadcrumb (for 'remember' op)",
                                },
                                "source_material": {
                                    "type": "string",
                                    "description": "Full raw source text, saved to disk (for 'remember' op)",
                                },
                                "target": {
                                    "type": "string",
                                    "description": "Target entity (for 'relate' op)",
                                },
                                "relationship": {
                                    "type": "string",
                                    "description": "Relationship type (for 'relate' op)",
                                },
                                "strength": {
                                    "type": "number",
                                    "description": "Relationship strength 0.0-1.0 (for 'relate' op)",
                                },
                            },
                            "required": ["op"],
                        },
                    },
                },
                "required": ["operations"],
            },
        ),
        Tool(
            name="memory.trace",
            description=(
                "Reconstruct full provenance for a memory. Returns the memory with all fields, "
                "the source episode narrative and archived conversation turns (if applicable), "
                "related entities, and a preview of any source material file saved on disk. "
                "Zero cost until invoked -- use when asked 'where did that come from?'"
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "memory_id": {
                        "type": "integer",
                        "description": "The memory ID to trace provenance for",
                    },
                },
                "required": ["memory_id"],
            },
        ),
        Tool(
            name="memory.session_context",
            description=(
                "Load relevant context at session start. Call this FIRST at the beginning of every session "
                "(after confirming context/me.md exists). Returns a pre-formatted context block with: "
                "unsummarized sessions needing catch-up, recent memories (48h), active predictions, "
                "active commitments, and recent episode narratives. If unsummarized sessions are "
                "reported, generate retroactive summaries using memory.end_session."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "token_budget": {
                        "type": "string",
                        "enum": ["brief", "normal", "full"],
                        "description": "How much context to load. brief=minimal, normal=standard, full=comprehensive",
                        "default": "normal",
                    },
                },
            },
        ),
        Tool(
            name="memory.morning_context",
            description=(
                "Curated morning digest: stale commitments, cooling relationships, "
                "cross-entity connections, active predictions, and recent activity (72h). "
                "Use this when generating the morning brief to get all relevant data in one call."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="memory.prediction_feedback",
            description="Provide feedback on a prediction -- mark whether the user acted on it. This trains future prediction priority.",
            inputSchema={
                "type": "object",
                "properties": {
                    "prediction_id": {
                        "type": "integer",
                        "description": "The prediction ID to provide feedback for",
                    },
                    "acted_on": {
                        "type": "boolean",
                        "description": "Whether the user acted on this prediction",
                    },
                },
                "required": ["prediction_id", "acted_on"],
            },
        ),
        Tool(
            name="cognitive.ingest",
            description=(
                "Extract structured data from raw text using a local language model. "
                "Use this when the user pastes a meeting transcript, email, document, or "
                "any large block of text that needs entity extraction, fact identification, "
                "and commitment detection. Returns structured JSON with entities, facts, "
                "commitments, action items, and relationships. If no local language model "
                "is available, returns the raw text so Claude can process it directly."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "The raw text to extract structured data from",
                    },
                    "source_type": {
                        "type": "string",
                        "enum": ["meeting", "email", "document", "general"],
                        "description": "Type of source text (affects extraction schema)",
                        "default": "general",
                    },
                    "context": {
                        "type": "string",
                        "description": (
                            "Optional context about the text "
                            "(e.g., 'Call between user and their investor Sarah')"
                        ),
                    },
                },
                "required": ["text"],
            },
        ),
    ]
    return ListToolsResult(tools=tools)


@server.call_tool()
async def call_tool(name: str, arguments: Dict[str, Any]) -> CallToolResult:
    """Handle tool calls"""
    try:
        if name == "memory.remember":
            memory_id = remember_fact(
                content=arguments["content"],
                memory_type=arguments.get("type", "fact"),
                about_entities=arguments.get("about"),
                importance=arguments.get("importance", 1.0),
                source=arguments.get("source"),
                source_context=arguments.get("source_context"),
            )
            # Save source material to disk if provided
            if memory_id and arguments.get("source_material"):
                svc = get_remember_service()
                svc.save_source_material(
                    memory_id,
                    arguments["source_material"],
                    metadata={
                        "source": arguments.get("source"),
                        "source_context": arguments.get("source_context"),
                    },
                )
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({"success": True, "memory_id": memory_id}),
                    )
                ]
            )

        elif name == "memory.recall":
            # Direct fetch by IDs (skip search)
            if "ids" in arguments and arguments["ids"]:
                results = fetch_by_ids(arguments["ids"])
                return CallToolResult(
                    content=[
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {
                                    "results": [
                                        {
                                            "id": r.id,
                                            "content": r.content,
                                            "type": r.type,
                                            "score": r.score,
                                            "importance": r.importance,
                                            "entities": r.entities,
                                            "created_at": r.created_at,
                                            "source": r.source,
                                            "source_id": r.source_id,
                                            "source_context": r.source_context,
                                        }
                                        for r in results
                                    ]
                                }
                            ),
                        )
                    ]
                )

            # Search mode
            query = arguments.get("query", "")
            if not query:
                return CallToolResult(
                    content=[
                        TextContent(
                            type="text",
                            text=json.dumps({"error": "Either 'query' or 'ids' is required"}),
                        )
                    ],
                    isError=True,
                )

            results = recall(
                query=query,
                limit=arguments.get("limit", 10),
                memory_types=arguments.get("types"),
                about_entity=arguments.get("about"),
            )

            compact = arguments.get("compact", False)
            if compact:
                return CallToolResult(
                    content=[
                        TextContent(
                            type="text",
                            text=json.dumps(
                                {
                                    "results": [
                                        {
                                            "id": r.id,
                                            "snippet": r.content[:80] + ("..." if len(r.content) > 80 else ""),
                                            "type": r.type,
                                            "score": round(r.score, 3),
                                            "entities": r.entities[:3],
                                        }
                                        for r in results
                                    ]
                                }
                            ),
                        )
                    ]
                )

            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(
                            {
                                "results": [
                                    {
                                        "id": r.id,
                                        "content": r.content,
                                        "type": r.type,
                                        "score": r.score,
                                        "importance": r.importance,
                                        "entities": r.entities,
                                        "created_at": r.created_at,
                                        "source": r.source,
                                        "source_id": r.source_id,
                                        "source_context": r.source_context,
                                    }
                                    for r in results
                                ]
                            }
                        ),
                    )
                ]
            )

        elif name == "memory.about":
            result = recall_about(
                entity_name=arguments["entity"],
                limit=arguments.get("limit", 20),
            )

            # Convert RecallResult objects to dicts
            if result.get("memories"):
                result["memories"] = [
                    {
                        "id": m.id,
                        "content": m.content,
                        "type": m.type,
                        "importance": m.importance,
                        "created_at": m.created_at,
                        "source": m.source,
                        "source_id": m.source_id,
                        "source_context": m.source_context,
                    }
                    for m in result["memories"]
                ]

            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(result),
                    )
                ]
            )

        elif name == "memory.relate":
            relationship_id = relate_entities(
                source=arguments["source"],
                target=arguments["target"],
                relationship=arguments["relationship"],
                strength=arguments.get("strength", 1.0),
            )
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({"success": True, "relationship_id": relationship_id}),
                    )
                ]
            )

        elif name == "memory.predictions":
            predictions = get_predictions(
                limit=arguments.get("limit", 5),
                prediction_types=arguments.get("types"),
            )
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({"predictions": predictions}),
                    )
                ]
            )

        elif name == "memory.consolidate":
            result = run_full_consolidation()
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(result),
                    )
                ]
            )

        elif name == "memory.entity":
            entity_id = remember_entity(
                name=arguments["name"],
                entity_type=arguments.get("type", "person"),
                description=arguments.get("description"),
                aliases=arguments.get("aliases"),
            )
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({"success": True, "entity_id": entity_id}),
                    )
                ]
            )

        elif name == "memory.search_entities":
            results = search_entities(
                query=arguments["query"],
                entity_types=arguments.get("types"),
                limit=arguments.get("limit", 10),
            )
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(
                            {
                                "entities": [
                                    {
                                        "id": e.id,
                                        "name": e.name,
                                        "type": e.type,
                                        "description": e.description,
                                        "importance": e.importance,
                                        "memory_count": e.memory_count,
                                        "relationship_count": e.relationship_count,
                                    }
                                    for e in results
                                ]
                            }
                        ),
                    )
                ]
            )

        elif name == "memory.buffer_turn":
            result = buffer_turn(
                user_content=arguments.get("user_content"),
                assistant_content=arguments.get("assistant_content"),
                episode_id=arguments.get("episode_id"),
            )
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(result),
                    )
                ]
            )

        elif name == "memory.end_session":
            result = end_session(
                episode_id=arguments["episode_id"],
                narrative=arguments["narrative"],
                facts=arguments.get("facts"),
                commitments=arguments.get("commitments"),
                entities=arguments.get("entities"),
                relationships=arguments.get("relationships"),
                key_topics=arguments.get("key_topics"),
            )
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(result),
                    )
                ]
            )

        elif name == "memory.unsummarized":
            results = get_unsummarized_turns()
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({
                            "unsummarized_sessions": results,
                            "count": len(results),
                        }),
                    )
                ]
            )

        elif name == "memory.batch":
            operations = arguments.get("operations", [])
            results = []
            for i, op in enumerate(operations):
                op_type = op.get("op")
                op_result = {"index": i, "op": op_type}
                try:
                    if op_type == "entity":
                        entity_id = remember_entity(
                            name=op["name"],
                            entity_type=op.get("type", "person"),
                            description=op.get("description"),
                            aliases=op.get("aliases"),
                        )
                        op_result["success"] = True
                        op_result["entity_id"] = entity_id
                    elif op_type == "remember":
                        memory_id = remember_fact(
                            content=op["content"],
                            memory_type=op.get("type", "fact"),
                            about_entities=op.get("about"),
                            importance=op.get("importance", 1.0),
                            source=op.get("source"),
                            source_context=op.get("source_context"),
                        )
                        op_result["success"] = True
                        op_result["memory_id"] = memory_id
                        # Save source material to disk if provided
                        if memory_id and op.get("source_material"):
                            svc = get_remember_service()
                            svc.save_source_material(
                                memory_id,
                                op["source_material"],
                                metadata={
                                    "source": op.get("source"),
                                    "source_context": op.get("source_context"),
                                },
                            )
                    elif op_type == "relate":
                        relationship_id = relate_entities(
                            source=op["source"],
                            target=op["target"],
                            relationship=op["relationship"],
                            strength=op.get("strength", 1.0),
                        )
                        op_result["success"] = True
                        op_result["relationship_id"] = relationship_id
                    else:
                        op_result["success"] = False
                        op_result["error"] = f"Unknown operation: {op_type}"
                except Exception as e:
                    logger.warning(f"Batch operation {i} ({op_type}) failed: {e}")
                    op_result["success"] = False
                    op_result["error"] = str(e)
                results.append(op_result)

            succeeded = sum(1 for r in results if r.get("success"))
            failed = len(results) - succeeded
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({
                            "success": failed == 0,
                            "total": len(results),
                            "succeeded": succeeded,
                            "failed": failed,
                            "results": results,
                        }),
                    )
                ]
            )

        elif name == "memory.session_context":
            budget = arguments.get("token_budget", "normal")
            context_text = _build_session_context(budget)
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=context_text,
                    )
                ]
            )

        elif name == "memory.morning_context":
            morning_text = _build_morning_context()
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=morning_text,
                    )
                ]
            )

        elif name == "cognitive.ingest":
            svc = get_ingest_service()
            result = await svc.ingest(
                text=arguments["text"],
                source_type=arguments.get("source_type", "general"),
                context=arguments.get("context"),
            )
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(result),
                    )
                ]
            )

        elif name == "memory.prediction_feedback":
            svc = get_consolidate_service()
            svc.mark_prediction_acted_on(
                prediction_id=arguments["prediction_id"],
                acted_on=arguments["acted_on"],
            )
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({"success": True, "prediction_id": arguments["prediction_id"]}),
                    )
                ]
            )

        elif name == "memory.trace":
            result = trace_memory(memory_id=arguments["memory_id"])
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps(result),
                    )
                ]
            )

        else:
            return CallToolResult(
                content=[
                    TextContent(
                        type="text",
                        text=json.dumps({"error": f"Unknown tool: {name}"}),
                    )
                ],
                isError=True,
            )

    except Exception as e:
        logger.exception(f"Error in tool {name}")
        return CallToolResult(
            content=[
                TextContent(
                    type="text",
                    text=json.dumps({"error": str(e)}),
                )
            ],
            isError=True,
        )


def _build_session_context(token_budget: str = "normal") -> str:
    """
    Assemble a pre-formatted session context block for session start.

    Token budget tiers control how much data is returned:
    - brief:  5 memories, 3 predictions, 2 episodes, 3 commitments
    - normal: 10 memories, 5 predictions, 3 episodes, 5 commitments
    - full:   20 memories, 10 predictions, 5 episodes, 10 commitments
    """
    budgets = {
        "brief":  {"memories": 5,  "predictions": 3,  "episodes": 2, "commitments": 3},
        "normal": {"memories": 10, "predictions": 5,  "episodes": 3, "commitments": 5},
        "full":   {"memories": 20, "predictions": 10, "episodes": 5, "commitments": 10},
    }
    limits = budgets.get(token_budget, budgets["normal"])

    sections = []
    sections.append("# Session Context\n")

    # 1. Unsummarized sessions
    try:
        unsummarized = get_unsummarized_turns()
        if unsummarized:
            sections.append(f"## Unsummarized Sessions ({len(unsummarized)})\n")
            sections.append("**Action needed:** Generate retroactive summaries using `memory.end_session` for each.\n")
            for session in unsummarized:
                ep_id = session.get("episode_id", "?")
                turn_count = session.get("turn_count", 0)
                started = session.get("started_at", "unknown")
                sections.append(f"- Episode {ep_id}: {turn_count} turns (started {started})")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not fetch unsummarized sessions: {e}")

    # 2. Recent memories (48h)
    try:
        recall_svc = get_recall_service()
        recent = recall_svc.get_recent_memories(
            limit=limits["memories"],
            hours=48,
        )
        if recent:
            sections.append(f"## Recent Context (48h) — {len(recent)} memories\n")
            for m in recent:
                entities_str = ", ".join(m.entities[:3]) if m.entities else ""
                prefix = f"[{m.type}]"
                if entities_str:
                    prefix += f" [{entities_str}]"
                sections.append(f"- {prefix} {m.content}")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not fetch recent memories: {e}")

    # 3. Active predictions
    try:
        predictions = get_predictions(limit=limits["predictions"])
        if predictions:
            sections.append(f"## Predictions & Insights\n")
            for p in predictions:
                ptype = p.get("prediction_type", "insight")
                content = p.get("content", "")
                sections.append(f"- **{ptype}**: {content}")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not fetch predictions: {e}")

    # 4. Active commitments (7 days)
    try:
        commitments = recall_svc.get_recent_memories(
            limit=limits["commitments"],
            memory_types=["commitment"],
            hours=168,  # 7 days
        )
        if commitments:
            sections.append(f"## Active Commitments (7d)\n")
            for c in commitments:
                entities_str = ", ".join(c.entities[:3]) if c.entities else ""
                prefix = f"[{entities_str}]" if entities_str else ""
                sections.append(f"- {prefix} {c.content} (created {c.created_at[:10]})")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not fetch commitments: {e}")

    # 5. Recent episode narratives
    try:
        db = get_db()
        episode_rows = db.execute(
            """
            SELECT id, session_id, narrative, started_at, key_topics
            FROM episodes
            WHERE is_summarized = 1
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (limits["episodes"],),
            fetch=True,
        ) or []
        if episode_rows:
            sections.append(f"## Recent Sessions\n")
            for ep in episode_rows:
                narrative = ep["narrative"] or ""
                preview = narrative[:150] + "..." if len(narrative) > 150 else narrative
                topics = json.loads(ep["key_topics"]) if ep["key_topics"] else []
                topic_str = ", ".join(topics[:4]) if topics else "no topics"
                sections.append(f"- **Session {ep['id']}** ({ep['started_at'][:10]}) [{topic_str}]")
                if preview:
                    sections.append(f"  {preview}")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not fetch episodes: {e}")

    if len(sections) <= 1:
        sections.append("No context available yet. This appears to be a fresh workspace.\n")

    return "\n".join(sections)


def _build_morning_context() -> str:
    """
    Build a curated morning digest with stale commitments, cooling relationships,
    cross-entity connections, predictions, and recent activity.
    """
    from datetime import datetime, timedelta

    sections = []
    sections.append("# Morning Context Digest\n")

    consolidate_svc = get_consolidate_service()
    recall_svc = get_recall_service()
    db = get_db()

    # 1. Stale commitments (importance > 0.3, created > 3 days ago)
    try:
        cutoff = (datetime.utcnow() - timedelta(days=3)).isoformat()
        stale = db.execute(
            """
            SELECT m.id, m.content, m.importance, m.created_at,
                   GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE m.type = 'commitment' AND m.importance > 0.3 AND m.created_at < ?
            GROUP BY m.id
            ORDER BY m.created_at ASC
            LIMIT 10
            """,
            (cutoff,),
            fetch=True,
        ) or []

        if stale:
            sections.append(f"## Stale Commitments ({len(stale)})\n")
            for c in stale:
                days_old = (datetime.utcnow() - datetime.fromisoformat(c["created_at"])).days
                entities = c["entity_names"] or ""
                prefix = f"[{entities}] " if entities else ""
                sections.append(f"- {prefix}{c['content'][:100]} ({days_old}d old, importance: {c['importance']:.1f})")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not fetch stale commitments: {e}")

    # 2. Cooling relationships
    try:
        cooling = consolidate_svc._detect_cooling_relationships()
        if cooling:
            sections.append(f"## Cooling Relationships ({len(cooling)})\n")
            for p in cooling:
                sections.append(f"- {p.description} (confidence: {p.confidence:.1f})")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not detect cooling relationships: {e}")

    # 3. Cross-entity connections
    try:
        cross = consolidate_svc._detect_cross_entity_patterns()
        if cross:
            sections.append(f"## Potential Connections ({len(cross)})\n")
            for p in cross:
                sections.append(f"- {p.description} (confidence: {p.confidence:.1f})")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not detect cross-entity patterns: {e}")

    # 4. Active predictions
    try:
        predictions = get_predictions(limit=10)
        if predictions:
            sections.append(f"## Predictions & Insights\n")
            for p in predictions:
                ptype = p.get("prediction_type", "insight")
                sections.append(f"- **{ptype}**: {p.get('content', '')}")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not fetch predictions: {e}")

    # 5. Recent activity (72h)
    try:
        recent = recall_svc.get_recent_memories(limit=15, hours=72)
        if recent:
            sections.append(f"## Recent Activity (72h) - {len(recent)} memories\n")
            for m in recent:
                entities_str = ", ".join(m.entities[:3]) if m.entities else ""
                prefix = f"[{m.type}]"
                if entities_str:
                    prefix += f" [{entities_str}]"
                sections.append(f"- {prefix} {m.content[:100]}")
            sections.append("")
    except Exception as e:
        logger.debug(f"Could not fetch recent activity: {e}")

    if len(sections) <= 1:
        sections.append("No data available yet. Start by telling me about your work and the people you interact with.\n")

    return "\n".join(sections)


async def run_server():
    """Run the MCP server"""
    # Initialize database
    db = get_db()
    db.initialize()

    logger.info("Starting Claudia Memory MCP server")

    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


def main():
    """Entry point for the MCP server"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stderr)],
    )

    asyncio.run(run_server())


if __name__ == "__main__":
    # Quick startup test mode for diagnostics
    if "--test" in sys.argv:
        # Verify we can import all required modules and list tools
        try:
            # Test that server is properly configured
            assert server is not None
            print("MCP server OK")
            sys.exit(0)
        except Exception as e:
            print(f"MCP server ERROR: {e}")
            sys.exit(1)

    main()
