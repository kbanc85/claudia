#!/bin/bash
# Quick health check at session start
# Runs `claudia system-health` and returns JSON with additionalContext
# Falls back gracefully if claudia CLI is not installed

# Try claudia CLI first
if command -v claudia &>/dev/null; then
  HEALTH_JSON=$(claudia system-health --project-dir "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null)
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ] && [ -n "$HEALTH_JSON" ]; then
    # Parse status summary from system-health JSON output
    if command -v python3 &>/dev/null; then
      SUMMARY=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    db = d.get('database', {})
    emb = d.get('embedding', {})
    parts = []
    if db.get('memories') is not None:
        parts.append(f\"{db['memories']} memories, {db.get('entities', 0)} entities.\")
    if not emb.get('available', False):
        parts.append('WARNING: Embeddings unavailable. Semantic search will not work.')
    if parts:
        print(' '.join(parts))
    else:
        print('System ready.')
except Exception:
    print('System ready.')
" <<< "$HEALTH_JSON" 2>/dev/null)
      if [ -n "$SUMMARY" ]; then
        SUMMARY_ESC=$(echo "$SUMMARY" | sed 's/"/\\"/g')
        echo "{\"additionalContext\": \"Memory system healthy. $SUMMARY_ESC\"}"
      else
        echo '{"additionalContext": "Memory system healthy."}'
      fi
    else
      echo '{"additionalContext": "Memory system healthy."}'
    fi
    exit 0
  fi
fi

# claudia CLI not available or failed -- provide guidance
emit_with_profile() {
  local MSG="$1"
  local PROFILE=""
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -f "${CLAUDE_PROJECT_DIR}/context/me.md" ]; then
    PROFILE=$(head -c 2000 "${CLAUDE_PROJECT_DIR}/context/me.md" 2>/dev/null || true)
  fi
  if [ -n "$PROFILE" ] && command -v python3 &>/dev/null; then
    CLAUDIA_MSG="$MSG" CLAUDIA_PROFILE="$PROFILE" python3 -c "
import json, os
msg = os.environ.get('CLAUDIA_MSG', '')
profile = os.environ.get('CLAUDIA_PROFILE', '')
if profile:
    msg = msg + '\n\nUser profile (from context/me.md):\n' + profile
print(json.dumps({'additionalContext': msg}))"
  else
    MSG_ESC=$(echo "$MSG" | sed 's/"/\\"/g')
    echo "{\"additionalContext\": \"$MSG_ESC\"}"
  fi
}

# Check if claudia is installed at all
if ! command -v claudia &>/dev/null; then
  # Check if it's a local install (npx get-claudia puts it in node_modules/.bin)
  if [ -f "${CLAUDE_PROJECT_DIR:-}/node_modules/.bin/claudia" ]; then
    emit_with_profile "Memory CLI found at node_modules/.bin/claudia but not on PATH. Run: export PATH=\"\$PWD/node_modules/.bin:\$PATH\" or use npx claudia."
  else
    emit_with_profile "Claudia CLI not found. Memory system unavailable. Install with: npm install -g get-claudia && claudia setup. Reading context/ files as fallback."
  fi
else
  emit_with_profile "Claudia CLI found but system-health check failed. Try: claudia setup --project-dir \"${CLAUDE_PROJECT_DIR:-.}\" to diagnose. Reading context/ files as fallback."
fi

exit 0
