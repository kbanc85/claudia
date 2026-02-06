#!/bin/bash
# Quick health check at session start
# Returns JSON with additionalContext to inform Claudia of memory system status
# Provides actionable guidance when daemon is down

# Try curl first, fall back to PowerShell for Windows environments without curl
if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
  echo '{"additionalContext": "Memory system healthy."}'
  exit 0
elif command -v powershell.exe &>/dev/null && \
     powershell.exe -Command "(Invoke-WebRequest -Uri 'http://localhost:3848/health' -UseBasicParsing -TimeoutSec 5).Content" 2>/dev/null | grep -q "healthy"; then
  echo '{"additionalContext": "Memory system healthy."}'
  exit 0
fi

# Daemon is NOT healthy. Figure out why and provide actionable guidance.
CONTEXT="IMPORTANT: Memory daemon is NOT running. Without it, you lose semantic search, pattern detection, cross-session learning, and proactive predictions. You MUST surface this to the user and offer to help fix it."

# Check if daemon is installed
if [[ "$OSTYPE" == "darwin"* ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.claudia.memory.plist"
  if [ -f "$PLIST" ]; then
    CONTEXT="$CONTEXT Daemon is installed (LaunchAgent exists) but not running. Suggest: 'Your memory daemon is installed but stopped. Want me to try starting it? I can run: launchctl load ~/Library/LaunchAgents/com.claudia.memory.plist'"
  else
    CONTEXT="$CONTEXT Daemon is NOT installed. Suggest: 'The memory daemon hasn\u0027t been set up yet. Want me to install it? I can run the installer for you.'"
  fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  SERVICE="$HOME/.config/systemd/user/claudia-memory.service"
  if [ -f "$SERVICE" ]; then
    CONTEXT="$CONTEXT Daemon is installed (systemd service exists) but not running. Suggest: 'Your memory daemon is installed but stopped. Want me to try starting it? I can run: systemctl --user start claudia-memory'"
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
