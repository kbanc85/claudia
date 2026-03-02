#!/bin/bash
# PreCompact hook: Advisory checkpoint before context compaction
# Runs lightweight consolidation and injects advisory into compacted context

# Run lightweight decay if claudia is available
if command -v claudia &>/dev/null; then
  claudia memory consolidate --lightweight --project-dir "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true
fi

# Inject advisory into compacted context
cat <<EOF
{
  "additionalContext": "Context compaction advisory: If important information was discussed recently, ensure it has been stored. Check: (1) Commitments: run claudia memory save --type commitment for any promises not yet stored. (2) People: run claudia memory entities create for anyone discussed in detail. (3) Relationships: run claudia memory relate for connections mentioned. (4) Buffer: run claudia memory session buffer with a summary if recent exchanges weren't buffered. With 1M context, compaction is less frequent, but proactive capture remains good practice."
}
EOF
exit 0
