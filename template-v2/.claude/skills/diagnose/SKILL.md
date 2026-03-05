---
name: diagnose
description: Check memory system health and troubleshoot connectivity issues. Use when memory commands aren't working, at session start if something seems wrong, or when user asks about memory status.
effort-level: low
---

# Diagnose

System health check for Claudia's memory infrastructure. Run this when:
- Memory commands seem unavailable
- Session context isn't loading
- User asks "is my memory working?"
- Something feels off with persistence

## Process

### Step 1: Check .mcp.json Configuration

Read the project's `.mcp.json` file and verify:
- A `claudia-memory` entry exists under `mcpServers`
- The `command` field points to a real Python binary
- The `args` include `--project-dir` matching the current directory

```bash
cat .mcp.json 2>/dev/null || echo "No .mcp.json found"
```

If `.mcp.json` is missing or has no `claudia-memory` entry, the daemon was never configured. Fix:
```bash
npx get-claudia .
```

If the Python binary in the `command` field doesn't exist:
```bash
# Check if venv exists
ls -la ~/.claudia/daemon/venv/bin/python 2>/dev/null || echo "Daemon venv not found"
```

### Step 1b: Check Active MCP Servers

List all active MCP servers (entries without `_disabled` prefix):

```bash
python3 -c "
import json
c = json.load(open('.mcp.json'))
servers = c.get('mcpServers', {})
active = [k for k, v in servers.items() if not k.startswith('_')]
stdio = [k for k in active if servers[k].get('type', 'stdio') == 'stdio']
http = [k for k in active if servers[k].get('type') == 'http']
print(f'Active servers ({len(active)}): {chr(44).join(active)}')
print(f'  stdio: {chr(44).join(stdio) or \"none\"}')
print(f'  http: {chr(44).join(http) or \"none\"}')
"
```

### Step 2: Run Preflight Check

The daemon has a built-in preflight validator that tests all 11 startup steps:

```bash
# Extract the Python path from .mcp.json and run preflight
VENV_PYTHON=$(python3 -c "import json; c=json.load(open('.mcp.json')); print(c.get('mcpServers',{}).get('claudia-memory',{}).get('command',''))" 2>/dev/null)

if [[ -n "$VENV_PYTHON" && -x "$VENV_PYTHON" ]]; then
  "$VENV_PYTHON" -m claudia_memory --preflight --project-dir "$PWD"
else
  echo "Cannot find daemon Python binary. Re-run: npx get-claudia ."
fi
```

If the preflight file exists, read it for structured results:
```bash
cat ~/.claudia/daemon-preflight.json 2>/dev/null
```

### Step 3: Check Session Manifest

The daemon writes a manifest when it successfully enters the MCP loop:

```bash
cat ~/.claudia/daemon-session.json 2>/dev/null || echo "No session manifest (daemon never started)"
```

If the manifest exists, check whether the process is still alive:
```bash
PID=$(python3 -c "import json; print(json.load(open('$HOME/.claudia/daemon-session.json')).get('pid',''))" 2>/dev/null)
if [[ -n "$PID" ]]; then
  ps -p "$PID" > /dev/null 2>&1 && echo "Daemon running (PID $PID)" || echo "Daemon died (PID $PID no longer running)"
fi
```

### Step 4: Check Standalone Daemon

```bash
curl -s http://localhost:3848/status 2>/dev/null || echo "Standalone daemon not running (this is normal if using MCP-only mode)"
```

### Step 5: Check Database Directly

```bash
ls -la ~/.claudia/memory/*.db 2>/dev/null || echo "No database files found"

# If database exists, check record counts
for db_file in ~/.claudia/memory/*.db; do
  [[ -f "$db_file" ]] || continue
  echo "Database: $db_file"
  sqlite3 "$db_file" "SELECT 'memories: ' || COUNT(*) FROM memories; SELECT 'entities: ' || COUNT(*) FROM entities;" 2>/dev/null || echo "  Cannot query (may be locked)"
done
```

### Step 6: Check Embedding Model

```bash
ollama list 2>/dev/null | grep -E "minilm|nomic|mxbai" || echo "No embedding model found (memory works without it, but vector search is disabled)"
```

### Step 7: Report Results

Format the diagnosis as:

```
---
**Memory System Diagnosis**

| Component | Status | Details |
|-----------|--------|---------|
| .mcp.json config | ✅/❌ | [daemon entry present/missing] |
| Active MCP servers | ✅/⚠️ | [list of active servers] |
| Daemon Python binary | ✅/❌ | [path exists/missing] |
| Preflight | ✅/❌ | [all passed / N failures] |
| Session manifest | ✅/❌ | [running/died/never started] |
| Standalone daemon | ✅/❌/➖ | [healthy/not running] |
| Database | ✅/❌ | [path, record counts] |
| Embedding model | ✅/❌ | [model name or "not found"] |

**Overall:** [Healthy / Degraded / Not Connected]

[If issues found, show the specific fix from preflight results]
---
```

## Common Issues and Fixes

### Issue: "MCP server failed" in Claude Code

**Most likely cause:** The daemon crashes during startup before reaching the MCP handshake.

**Fix:** Run the preflight check to see exactly which step fails:
```bash
~/.claudia/daemon/venv/bin/python -m claudia_memory --preflight --project-dir "$PWD"
```

If preflight shows fixable issues, try auto-repair:
```bash
~/.claudia/daemon/venv/bin/python -m claudia_memory --repair --project-dir "$PWD"
```

### Issue: Tools not in palette but no error

**Cause:** Daemon started but exited before Claude Code could handshake, or Claude Code closed stdin too early.

**Fix:** Check the session manifest:
```bash
cat ~/.claudia/daemon-session.json
```
- If missing: daemon never reached the MCP loop (run preflight)
- If present with `exited_at`: daemon started and exited cleanly (check stdin_type, should be "pipe")
- If present without `exited_at` and PID is dead: daemon crashed after starting

### Issue: Preflight shows db_connect FAIL

**Cause:** Database is locked by another process.

**Fix:**
```bash
# Find processes using the database
lsof ~/.claudia/memory/*.db 2>/dev/null
# Or try auto-repair
~/.claudia/daemon/venv/bin/python -m claudia_memory --repair --project-dir "$PWD"
```

### Issue: Preflight shows schema_load FAIL

**Cause:** The claudia-memory package is corrupted or incompletely installed.

**Fix:**
```bash
~/.claudia/daemon/venv/bin/pip install --force-reinstall claudia-memory
```
Or re-run the installer:
```bash
npx get-claudia .
```

### Issue: Preflight shows sqlite_vec WARN

**Cause:** sqlite-vec extension not installed. Memory works without it, but vector search is disabled.

**Fix:**
```bash
~/.claudia/daemon/venv/bin/pip install sqlite-vec
```

### Issue: Daemon venv not found

**Cause:** Fresh install or venv was deleted.

**Fix:**
```bash
npx get-claudia .
```
This recreates the venv and installs the daemon.

### Issue: Wrong project directory

**Cause:** .mcp.json has a different --project-dir than expected.

**Fix:**
Check the args in `.mcp.json`:
```bash
python3 -c "import json; c=json.load(open('.mcp.json')); print(c['mcpServers']['claudia-memory']['args'])"
```
The `--project-dir` should match your current working directory. Re-run `npx get-claudia .` from the correct directory to fix it.

### Issue: Python 3.10+ not found

**Cause:** System Python is too old for the daemon.

**Fix:** Install Python 3.10+ from python.org, Homebrew (`brew install python@3.12`), or your package manager.
