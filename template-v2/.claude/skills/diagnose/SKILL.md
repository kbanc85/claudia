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

### Step 1: Check CLI Availability

First, verify the `claudia` CLI is available:

```bash
which claudia 2>/dev/null || echo "claudia CLI not found on PATH"
claudia --version 2>/dev/null || echo "claudia CLI not responding"
```

If the `claudia` command is not found, the CLI is not installed or not on PATH.

### Step 2: Test Memory Connection

If the CLI is available, try a simple operation:

```bash
claudia system-health --project-dir "$PWD"
```

**Possible outcomes:**
- Success with health data: Memory system fully operational
- Success but empty: Working but no data yet (new install)
- Error/timeout: CLI installed but database or system unhealthy
- Command not found: CLI not installed

### Step 2.5: Detect Platform

Run: `uname -s 2>/dev/null || echo Windows`

Use the appropriate command set below (macOS/Linux or Windows).

### Step 3: Check System Components

**macOS/Linux:**

```bash
# Check if claudia CLI is on PATH
which claudia

# Check system health
claudia system-health --project-dir "$PWD"

# Check database exists and has data
ls -la ~/.claudia/memory/*.db 2>/dev/null || echo "No database found"
sqlite3 ~/.claudia/memory/claudia.db "SELECT COUNT(*) as memories FROM memories; SELECT COUNT(*) as entities FROM entities;" 2>/dev/null || echo "Cannot query database"

# Check for embedding model
ollama list 2>/dev/null | grep minilm || echo "Embedding model not found"
```

**Windows (PowerShell):**

```powershell
# Check if claudia CLI is available
Get-Command claudia -ErrorAction SilentlyContinue

# Check system health
claudia system-health --project-dir "$PWD"

# Check database exists and has data
dir "$env:USERPROFILE\.claudia\memory\*.db" 2>$null

# Check for embedding model
ollama list 2>$null | Select-String minilm
```

### Step 4: Report Results

Format the diagnosis as:

```
---
**Memory System Diagnosis**

| Component | Status | Details |
|-----------|--------|---------|
| Claudia CLI | ✅/❌ | [version or "not found"] |
| Database | ✅/❌ | [path, size, record counts] |
| System Health | ✅/❌ | [response or error] |
| Embedding Model | ✅/❌ | [model name or "not found"] |

**Overall:** [Healthy / Degraded / Not Connected]

[If issues found, provide specific fix instructions]
---
```

## Common Issues and Fixes

### Issue: Claudia CLI not found

**Cause:** CLI not installed or not on PATH

**Fix:**
```bash
npm install -g get-claudia
claudia setup
```

If installed via npx but not globally, the binary may not be on PATH. Either install globally or use the full path.

### Issue: Database empty or missing

**Cause:** Fresh install or database corruption

**Fix:**
1. If fresh install: Normal, database populates as you use Claudia
2. If was working before: Check for database file, may need to restore from backup

### Issue: CLI installed but commands fail

**Cause:** Database corruption, missing dependencies, or version mismatch

**Fix:**
1. Update to latest Claudia version: `npm install -g get-claudia`
2. Run setup again: `claudia setup`
3. Check Node.js version is 18+: `node --version`

### Issue: Embedding model not available

**Cause:** Ollama not installed or model not pulled

**Fix:**
```bash
# Install Ollama (if not installed)
# See https://ollama.ai for installation

# Pull the embedding model
ollama pull all-minilm:l6-v2
```

Note: Memory still works without Ollama, but semantic search and vector-based recall will be unavailable. Basic keyword search and explicit lookups still function.

### Issue: Wrong project directory

**Cause:** CLI is using a different project hash than expected

**Fix:**
Ensure you're passing the correct project directory:
```bash
claudia system-health --project-dir "$PWD"
```

The CLI uses the project directory to determine which database to use. Each project gets its own isolated database based on a hash of the directory path.
