#!/bin/bash
# Quick health check at session start
# Returns JSON with additionalContext to inform Claudia of memory system status

if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
  echo '{"additionalContext": "Memory system healthy."}'
else
  echo '{"additionalContext": "Warning: Memory daemon not responding. Run /diagnose for details. Operating in fallback mode."}'
fi
exit 0
