---
name: diagnose
description: Check memory daemon health and troubleshoot connectivity issues. Use when memory tools aren't working, at session start if something seems wrong, or when user asks about memory status.
effort-level: low
---

# Diagnose

System health check for Claudia's memory infrastructure. Run this when:
- Memory tools seem unavailable
- Session context isn't loading
- User asks "is my memory working?"
- Something feels off with persistence

## Process

### Step 1: Check MCP Tool Availability

First, verify what memory tools are available:

```
List your available tools that start with "memory."
```

**Expected tools:**
- `memory.session_context`
- `memory.remember`
- `memory.recall`
- `memory.about`
- `memory.entity`
- `memory.relate`
- `memory.file`
- `memory.batch`
- `memory.end_session`
- `memory.buffer_turn`
- `memory.reflections`
- `memory.predictions`
- `memory.consolidate`

If NO memory tools appear, the daemon isn't connected via MCP.

### Step 2: Test Memory Connection

If tools are available, try a simple operation:

```
Call memory.session_context with no arguments
```

**Possible outcomes:**
- Success with context: Memory system fully operational
- Success but empty: Working but no data yet (new install)
- Error/timeout: Daemon running but unhealthy
- Tool not found: MCP connection broken

### Step 2.5: Detect Platform

Run: `uname -s 2>/dev/null || echo Windows`

Use the appropriate command set below (macOS/Linux or Windows).

### Step 3: Check Daemon Process

**macOS/Linux:**

```bash
# Check if daemon process is running
ps aux | grep claudia_memory | grep -v grep

# Check health endpoint
curl -s http://localhost:3848/health || echo "Health endpoint not responding"

# Check recent daemon logs
tail -20 ~/.claudia/daemon-stderr.log 2>/dev/null || echo "No daemon log found"

# Check database exists and has data
ls -la ~/.claudia/memory/*.db 2>/dev/null || echo "No database found"
sqlite3 ~/.claudia/memory/claudia.db "SELECT COUNT(*) as memories FROM memories; SELECT COUNT(*) as entities FROM entities;" 2>/dev/null || echo "Cannot query database"
```

**Windows (PowerShell):**

```powershell
# Check if daemon process is running
Get-Process python* | Where-Object { $_.CommandLine -like '*claudia_memory*' } 2>$null
# Fallback if CommandLine isn't available:
tasklist /FI "IMAGENAME eq python.exe" /V 2>$null | findstr claudia

# Check health endpoint
try { (Invoke-WebRequest -Uri 'http://localhost:3848/health' -UseBasicParsing -TimeoutSec 5).Content } catch { "Health endpoint not responding" }

# Check recent daemon logs
Get-Content -Tail 20 "$env:USERPROFILE\.claudia\daemon-stderr.log" 2>$null

# Check database exists and has data
dir "$env:USERPROFILE\.claudia\memory\*.db" 2>$null
& "$env:USERPROFILE\.claudia\daemon\venv\Scripts\python.exe" -c "import sqlite3; conn = sqlite3.connect('$env:USERPROFILE\.claudia\memory\claudia.db'); print('memories:', conn.execute('SELECT COUNT(*) FROM memories').fetchone()[0]); print('entities:', conn.execute('SELECT COUNT(*) FROM entities').fetchone()[0])"

# Check Task Scheduler status
Get-ScheduledTask -TaskName 'ClaudiaMemoryDaemon' -ErrorAction SilentlyContinue | Select-Object State
```

### Step 4: Report Results

Format the diagnosis as:

```
---
**Memory System Diagnosis**

| Component | Status | Details |
|-----------|--------|---------|
| MCP Tools | ✅/❌ | [count] tools available |
| Daemon Process | ✅/❌ | [PID or "not running"] |
| Health Endpoint | ✅/❌ | [response or error] |
| Database | ✅/❌ | [path, size, record counts] |
| Session Context | ✅/❌ | [loaded or error] |

**Overall:** [Healthy / Degraded / Not Connected]

[If issues found, provide specific fix instructions]
---
```

## Common Issues and Fixes

### Issue: No memory tools available

**Cause:** MCP server not configured or not started

**Fix:**
1. Check `.mcp.json` exists and has claudia_memory configured
2. Restart Claude Code to reload MCP configuration
3. Check `~/.claudia/daemon-stderr.log` for startup errors

### Issue: Daemon not running

**Cause:** Daemon crashed or was never started

**Fix (macOS/Linux):**
```bash
# Start the daemon manually
cd ~/.claudia/daemon && source venv/bin/activate
python -m claudia_memory &

# Or reinstall
cd [claudia-install-dir] && ./memory-daemon/scripts/install.sh
```

**Fix (Windows PowerShell):**
```powershell
# Start the daemon manually
& "$env:USERPROFILE\.claudia\daemon\venv\Scripts\Activate.ps1"
python -m claudia_memory

# Or reinstall
cd [claudia-install-dir]
powershell -ExecutionPolicy Bypass -File memory-daemon\scripts\install.ps1
```

### Issue: Health endpoint not responding

**Cause:** Python 3.14 compatibility issue (fixed in v1.21.1+) or daemon crashed after startup

**Fix:**
1. Check daemon logs: `tail -50 ~/.claudia/daemon-stderr.log`
2. Look for "RuntimeError" or "event loop" errors
3. Update to latest Claudia version: `npx get-claudia .`

### Issue: Database empty or missing

**Cause:** Fresh install or database corruption

**Fix:**
1. If fresh install: Normal, database populates as you use Claudia
2. If was working before: Check for database file, may need to restore from backup

### Issue: MCP tools available but calls fail

**Cause:** Daemon process exists but is unhealthy

**Fix (macOS/Linux):**
1. Kill the old process: `pkill -f claudia_memory`
2. Restart Claude Code (this restarts the MCP server)
3. Check logs for specific errors

**Fix (Windows):**
1. Kill the old process: `taskkill /F /FI "IMAGENAME eq python.exe"` (or use Task Manager)
2. Restart Claude Code (this restarts the MCP server)
3. Check logs: `Get-Content -Tail 50 "$env:USERPROFILE\.claudia\daemon-stderr.log"`

### Issue: .mcp.json uses wrong entry point

**Detection:** Check the `args` array in `.mcp.json` for the `claudia-memory` server. If it says `claudia_memory.mcp.server` instead of `claudia_memory`, it bypasses project isolation, the health server, and background scheduling.

**Fix:** Update the args in `.mcp.json` to:
```json
"args": ["-m", "claudia_memory", "--project-dir", "${workspaceFolder}"]
```
Then restart Claude Code.

## Automatic Recovery

If the daemon needs restart and user confirms:

**macOS/Linux:**
```bash
# Kill any existing daemon
pkill -f claudia_memory 2>/dev/null

# Wait for cleanup
sleep 2

# Verify it's stopped
ps aux | grep claudia_memory | grep -v grep && echo "Still running, may need manual kill"
```

**Windows (PowerShell):**
```powershell
# Kill any existing daemon
Get-Process python* -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*claudia_memory*' } | Stop-Process -Force

# Wait for cleanup
Start-Sleep -Seconds 2

# Verify it's stopped
Get-Process python* -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*claudia_memory*' }
```

Then instruct user to restart Claude Code, which will spawn a fresh daemon via MCP.
