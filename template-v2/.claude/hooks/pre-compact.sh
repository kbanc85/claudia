#!/bin/bash
# PreCompact hook: Emergency checkpoint before context compaction
# Returns JSON with additionalContext to remind Claudia to persist critical data

# Signal daemon to flush WAL (ensures all buffered data is durable)
curl -s "http://localhost:3848/flush" 2>/dev/null || true

# Inject reminder into compacted context
cat <<EOF
{
  "additionalContext": "CONTEXT COMPACTION OCCURRED. Before continuing, check: (1) Were any commitments discussed? If so, call memory.remember for each with type='commitment' and importance=0.9. (2) Were new people discussed in detail? Call memory.entity for each. (3) Were relationships mentioned (X works with Y, X reports to Y)? Call memory.relate for each. (4) Call memory.buffer_turn with a summary of recent exchanges if not already buffered."
}
EOF
exit 0
