#!/bin/bash
# PreCompact hook: Advisory checkpoint before context compaction
# Injects advisory into compacted context so Claude knows to preserve important information via MCP tools.
# Note: Shell scripts cannot call MCP tools directly. The advisory tells Claude what to do after compaction.

# Inject advisory into compacted context
cat <<EOF
{
  "additionalContext": "Context compaction advisory: If important information was discussed recently, ensure it has been stored via MCP tools. Check: (1) Commitments: call the memory.remember MCP tool for any promises not yet stored. (2) People: call the memory.entity MCP tool for anyone discussed in detail. (3) Relationships: call the memory.relate MCP tool for connections mentioned. (4) Buffer: call the memory.buffer_turn MCP tool with a summary if recent exchanges were not buffered. With 1M context, compaction is less frequent, but proactive capture remains good practice."
}
EOF
exit 0
