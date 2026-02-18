#!/bin/bash
# PreCompact hook: Advisory checkpoint before context compaction
# Returns JSON with additionalContext to help Claudia recover gracefully

# Signal daemon to flush WAL (ensures all buffered data is durable)
curl -s "http://localhost:3848/flush" 2>/dev/null || true

# Inject advisory into compacted context
cat <<EOF
{
  "additionalContext": "Context compaction advisory: If important information was discussed recently, ensure it has been stored. Check: (1) Commitments: call memory.remember with type='commitment' for any promises not yet stored. (2) People: call memory.entities (operation='create') for anyone discussed in detail. (3) Relationships: call memory.relate for connections mentioned. (4) Buffer: call memory.session (operation='buffer') with a summary if recent exchanges weren't buffered. With 1M context, compaction is less frequent, but proactive capture remains good practice."
}
EOF
exit 0
