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
    get_recall_service,
    recall,
    recall_about,
    search_entities,
)
from ..services.remember import (
    get_remember_service,
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
                },
                "required": ["content"],
            },
        ),
        Tool(
            name="memory.recall",
            description="Search Claudia's memory for relevant information. Uses semantic similarity to find related memories.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to search for",
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
                },
                "required": ["query"],
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
            results = recall(
                query=arguments["query"],
                limit=arguments.get("limit", 10),
                memory_types=arguments.get("types"),
                about_entity=arguments.get("about"),
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
    main()
