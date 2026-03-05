# Common Issues and Fixes

Reference guide for the diagnose skill. Extracted from the main SKILL.md for progressive disclosure.

---

## Issue: "MCP server failed" in Claude Code

**Most likely cause:** The daemon crashes during startup before reaching the MCP handshake.

**Fix:** Run the preflight check to see exactly which step fails:
```bash
~/.claudia/daemon/venv/bin/python -m claudia_memory --preflight --project-dir "$PWD"
```

If preflight shows fixable issues, try auto-repair:
```bash
~/.claudia/daemon/venv/bin/python -m claudia_memory --repair --project-dir "$PWD"
```

---

## Issue: Tools not in palette but no error

**Cause:** Daemon started but exited before Claude Code could handshake, or Claude Code closed stdin too early.

**Fix:** Check the session manifest:
```bash
cat ~/.claudia/daemon-session.json
```
- If missing: daemon never reached the MCP loop (run preflight)
- If present with `exited_at`: daemon started and exited cleanly (check stdin_type, should be "pipe")
- If present without `exited_at` and PID is dead: daemon crashed after starting

---

## Issue: Preflight shows db_connect FAIL

**Cause:** Database is locked by another process.

**Fix:**
```bash
# Find processes using the database
lsof ~/.claudia/memory/*.db 2>/dev/null
# Or try auto-repair
~/.claudia/daemon/venv/bin/python -m claudia_memory --repair --project-dir "$PWD"
```

---

## Issue: Preflight shows schema_load FAIL

**Cause:** The claudia-memory package is corrupted or incompletely installed.

**Fix:**
```bash
~/.claudia/daemon/venv/bin/pip install --force-reinstall claudia-memory
```
Or re-run the installer:
```bash
npx get-claudia .
```

---

## Issue: Preflight shows sqlite_vec WARN

**Cause:** sqlite-vec extension not installed. Memory works without it, but vector search is disabled.

**Fix:**
```bash
~/.claudia/daemon/venv/bin/pip install sqlite-vec
```

---

## Issue: Daemon venv not found

**Cause:** Fresh install or venv was deleted.

**Fix:**
```bash
npx get-claudia .
```
This recreates the venv and installs the daemon.

---

## Issue: Wrong project directory

**Cause:** .mcp.json has a different --project-dir than expected.

**Fix:** Check the args in `.mcp.json`:
```bash
python3 -c "import json; c=json.load(open('.mcp.json')); print(c['mcpServers']['claudia-memory']['args'])"
```
The `--project-dir` should match your current working directory. Re-run `npx get-claudia .` from the correct directory to fix it.

---

## Issue: Python 3.10+ not found

**Cause:** System Python is too old for the daemon.

**Fix:** Install Python 3.10+ from python.org, Homebrew (`brew install python@3.12`), or your package manager.

---

## Windows-Specific Issues

### Python path in .mcp.json uses Unix separators

**Fix:** On Windows, the venv Python binary is at:
```
%USERPROFILE%\.claudia\daemon\venv\Scripts\python.exe
```
Not `venv/bin/python`. Re-run `npx get-claudia .` on Windows to fix the path.

### sqlite-vec DLL loading fails

**Fix:** The daemon's `database.py` handles Windows DLL paths automatically. If sqlite-vec still fails:
```powershell
pip install --force-reinstall sqlite-vec
```

### PowerShell equivalents

| Unix Command | PowerShell Equivalent |
|---|---|
| `cat .mcp.json` | `Get-Content .mcp.json` |
| `ls -la ~/.claudia/memory/*.db` | `Get-ChildItem "$env:USERPROFILE\.claudia\memory\*.db"` |
| `curl -s http://localhost:3848/status` | `Invoke-RestMethod http://localhost:3848/status` |
| `lsof file.db` | `Get-Process \| Where-Object { $_.Modules.FileName -like "*file.db*" }` |
