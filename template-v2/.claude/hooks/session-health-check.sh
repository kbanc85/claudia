#!/bin/bash
# Quick health check at session start
# Returns JSON with additionalContext to inform Claudia of memory system status
# Provides actionable guidance when daemon is down

# Try curl first, fall back to PowerShell for Windows environments without curl
HEALTH_OK=false
if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
  HEALTH_OK=true
elif command -v powershell.exe &>/dev/null && \
     powershell.exe -Command "(Invoke-WebRequest -Uri 'http://localhost:3848/health' -UseBasicParsing -TimeoutSec 5).Content" 2>/dev/null | grep -q "healthy"; then
  HEALTH_OK=true
fi

if [ "$HEALTH_OK" = true ]; then
  # Health OK - try to get richer status data from /status endpoint
  STATUS_JSON=""
  if command -v curl &>/dev/null; then
    STATUS_JSON=$(curl -s "http://localhost:3848/status" 2>/dev/null)
  elif command -v powershell.exe &>/dev/null; then
    STATUS_JSON=$(powershell.exe -Command "(Invoke-WebRequest -Uri 'http://localhost:3848/status' -UseBasicParsing -TimeoutSec 5).Content" 2>/dev/null)
  fi

  if [ -n "$STATUS_JSON" ] && command -v python3 &>/dev/null; then
    STATUS_SUMMARY=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    c = d.get('counts', {})
    parts = [f\"{c.get('memories',0)} memories, {c.get('entities',0)} entities, {c.get('patterns',0)} active patterns.\"]
    comp = d.get('components', {})
    es = comp.get('embeddings', 'ok')
    if es in ('unavailable', 'error'):
        parts.append(f\"WARNING: Embeddings component is '{es}'. Semantic search may not work.\")
    if d.get('embedding_model_mismatch', False):
        parts.append('WARNING: Embedding model mismatch detected. Consider running /diagnose.')
    print(' '.join(parts))
except Exception:
    pass
" <<< "$STATUS_JSON" 2>/dev/null)
  fi

  if [ -n "$STATUS_SUMMARY" ]; then
    # Escape for JSON
    STATUS_SUMMARY_ESC=$(echo "$STATUS_SUMMARY" | sed 's/"/\\"/g')
    echo "{\"additionalContext\": \"Memory system healthy. $STATUS_SUMMARY_ESC\"}"
  else
    echo '{"additionalContext": "Memory system healthy."}'
  fi
  exit 0
fi

# Daemon is NOT healthy. Figure out why and provide actionable guidance.
CONTEXT="IMPORTANT: Memory daemon is NOT running. Without it, you lose semantic search, pattern detection, cross-session learning, and proactive predictions. You MUST surface this to the user and offer to help fix it."

# Check if daemon is installed
if [[ "$OSTYPE" == "darwin"* ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.claudia.memory.plist"
  if [ -f "$PLIST" ]; then
    # Attempt silent auto-restart before falling through to manual suggestion
    RESTARTED=false
    if launchctl unload "$PLIST" 2>/dev/null; sleep 0.5; launchctl load "$PLIST" 2>/dev/null; then
      sleep 3
      if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
        RESTARTED=true
      fi
    fi
    if [ "$RESTARTED" = true ]; then
      STATUS_JSON=$(curl -s "http://localhost:3848/status" 2>/dev/null)
      STATUS_SUMMARY=""
      if [ -n "$STATUS_JSON" ] && command -v python3 &>/dev/null; then
        STATUS_SUMMARY=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    c = d.get('counts', {})
    print(f\"{c.get('memories',0)} memories, {c.get('entities',0)} entities, {c.get('patterns',0)} active patterns.\")
except Exception:
    pass
" <<< "$STATUS_JSON" 2>/dev/null)
      fi
      MSG="Memory daemon was stopped but has been restarted automatically."
      if [ -n "$STATUS_SUMMARY" ]; then
        MSG="$MSG $STATUS_SUMMARY"
      fi
      STATUS_ESC=$(echo "$MSG" | sed 's/"/\\"/g')
      echo "{\"additionalContext\": \"$STATUS_ESC\"}"
      exit 0
    fi
    CONTEXT="$CONTEXT Daemon is installed (LaunchAgent exists) but could not be auto-restarted. Suggest: 'Your memory daemon is stopped. Please run: launchctl load ~/Library/LaunchAgents/com.claudia.memory.plist'"
  else
    CONTEXT="$CONTEXT Daemon is NOT installed. Suggest: 'The memory daemon hasn\u0027t been set up yet. Want me to install it? I can run the installer for you.'"
  fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  SERVICE="$HOME/.config/systemd/user/claudia-memory.service"
  if [ -f "$SERVICE" ]; then
    # Attempt silent auto-restart before falling through to manual suggestion
    RESTARTED=false
    if systemctl --user restart claudia-memory 2>/dev/null; then
      sleep 3
      if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
        RESTARTED=true
      fi
    fi
    if [ "$RESTARTED" = true ]; then
      STATUS_JSON=$(curl -s "http://localhost:3848/status" 2>/dev/null)
      STATUS_SUMMARY=""
      if [ -n "$STATUS_JSON" ] && command -v python3 &>/dev/null; then
        STATUS_SUMMARY=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    c = d.get('counts', {})
    print(f\"{c.get('memories',0)} memories, {c.get('entities',0)} entities, {c.get('patterns',0)} active patterns.\")
except Exception:
    pass
" <<< "$STATUS_JSON" 2>/dev/null)
      fi
      MSG="Memory daemon was stopped but has been restarted automatically."
      if [ -n "$STATUS_SUMMARY" ]; then
        MSG="$MSG $STATUS_SUMMARY"
      fi
      STATUS_ESC=$(echo "$MSG" | sed 's/"/\\"/g')
      echo "{\"additionalContext\": \"$STATUS_ESC\"}"
      exit 0
    fi
    CONTEXT="$CONTEXT Daemon is installed (systemd service exists) but could not be auto-restarted. Suggest: 'Your memory daemon is stopped. Please run: systemctl --user restart claudia-memory'"
  else
    CONTEXT="$CONTEXT Daemon is NOT installed. Suggest: 'The memory daemon hasn\u0027t been set up yet. Want me to install it? I can run the installer for you.'"
  fi
elif [[ "$OSTYPE" == msys* ]] || [[ "$OSTYPE" == cygwin* ]] || [[ "$OSTYPE" == MINGW* ]]; then
  # Windows via Git Bash
  TASK_STATUS=""
  if command -v powershell.exe &>/dev/null; then
    TASK_STATUS=$(powershell.exe -Command "(Get-ScheduledTask -TaskName 'ClaudiaMemoryDaemon' -ErrorAction SilentlyContinue).State" 2>/dev/null)
  fi
  if [ -n "$TASK_STATUS" ]; then
    CONTEXT="$CONTEXT Daemon is installed (Task Scheduler, state: $TASK_STATUS). Suggest: 'Your memory daemon is installed but not responding. Want me to check the logs and try restarting it?'"
  else
    CONTEXT="$CONTEXT Daemon is NOT installed as a scheduled task. Suggest: 'The memory daemon hasn\u0027t been set up yet. Want me to install it? I can run the installer for you.'"
  fi
fi

# Check for recent crash logs
if [ -f "$HOME/.claudia/daemon-stderr.log" ]; then
  LAST_ERROR=$(tail -5 "$HOME/.claudia/daemon-stderr.log" 2>/dev/null | head -3)
  if [ -n "$LAST_ERROR" ]; then
    CONTEXT="$CONTEXT Recent daemon log: $LAST_ERROR"
  fi
fi

echo "{\"additionalContext\": \"$CONTEXT\"}"
exit 0
