# Claudia Memory Diagnostic Tool (Windows)
# Run this to check all components of the memory system

$ESC = [char]27
$RED = "$ESC[0;31m"
$GREEN = "$ESC[0;32m"
$YELLOW = "$ESC[1;33m"
$CYAN = "$ESC[0;36m"
$BOLD = "$ESC[1m"
$DIM = "$ESC[2m"
$NC = "$ESC[0m"

$CLAUDIA_DIR = Join-Path $env:USERPROFILE ".claudia"
$VENV_PYTHON = Join-Path (Join-Path (Join-Path (Join-Path $CLAUDIA_DIR "daemon") "venv") "Scripts") "python.exe"

Write-Host ""
Write-Host "${BOLD}Claudia Memory System Diagnostics${NC}"
Write-Host "${DIM}===================================${NC}"
Write-Host ""

$ISSUES_FOUND = 0

# Check 1: Daemon health
Write-Host -NoNewline "1. Daemon health check... "
try {
    $health = Invoke-WebRequest -Uri "http://localhost:3848/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($health.Content -match "healthy") {
        Write-Host "${GREEN}✓ Running${NC}"
    } else {
        throw "unhealthy"
    }
} catch {
    Write-Host "${RED}✗ Not running${NC}"
    Write-Host "   ${DIM}Fix: Start-ScheduledTask -TaskName ClaudiaMemoryDaemon${NC}"
    Write-Host "   ${DIM}Or:  $VENV_PYTHON -m claudia_memory --standalone${NC}"
    $ISSUES_FOUND++
}

# Check 2: Virtual environment exists
Write-Host -NoNewline "2. Virtual environment... "
$venvDir = Join-Path (Join-Path $CLAUDIA_DIR "daemon") "venv"
if (Test-Path $venvDir) {
    Write-Host "${GREEN}✓ OK${NC}"
} else {
    Write-Host "${RED}✗ Missing${NC}"
    Write-Host "   ${DIM}Fix: Re-run the memory installer${NC}"
    $ISSUES_FOUND++
}

# Check 3: Python module
Write-Host -NoNewline "3. Python module installed... "
if ((Test-Path $VENV_PYTHON)) {
    try {
        & $VENV_PYTHON -c "import claudia_memory" 2>&1 | Out-Null
        Write-Host "${GREEN}✓ OK${NC}"
    } catch {
        Write-Host "${RED}✗ Missing${NC}"
        $pipPath = Join-Path (Join-Path (Join-Path (Join-Path $CLAUDIA_DIR "daemon") "venv") "Scripts") "pip.exe"
        $daemonDir = Join-Path $CLAUDIA_DIR "daemon"
        Write-Host "   ${DIM}Fix: $pipPath install -e $daemonDir${NC}"
        $ISSUES_FOUND++
    }
} else {
    Write-Host "${RED}✗ Virtual environment missing${NC}"
    $ISSUES_FOUND++
}

# Check 4: MCP server module
Write-Host -NoNewline "4. MCP server module... "
if ((Test-Path $VENV_PYTHON)) {
    try {
        & $VENV_PYTHON -c "from claudia_memory.mcp import server" 2>&1 | Out-Null
        Write-Host "${GREEN}✓ OK${NC}"
    } catch {
        Write-Host "${RED}✗ Failed to import${NC}"
        $logPath = Join-Path $CLAUDIA_DIR "daemon-stderr.log"
        Write-Host "   ${DIM}Check: $logPath for errors${NC}"
        $ISSUES_FOUND++
    }
} else {
    Write-Host "${RED}✗ Virtual environment missing${NC}"
    $ISSUES_FOUND++
}

# Check 5: .mcp.json configured
Write-Host -NoNewline "5. .mcp.json configured... "
$MCP_FOUND = $false
$MCP_LOCATION = ""

if ((Test-Path ".mcp.json") -and (Get-Content ".mcp.json" -Raw | Select-String "claudia-memory" -Quiet)) {
    $MCP_FOUND = $true
    $MCP_LOCATION = "current directory"
} elseif ((Test-Path (Join-Path $CLAUDIA_DIR ".mcp.json")) -and (Get-Content (Join-Path $CLAUDIA_DIR ".mcp.json") -Raw | Select-String "claudia-memory" -Quiet)) {
    $MCP_FOUND = $true
    $MCP_LOCATION = "$CLAUDIA_DIR"
}

if ($MCP_FOUND) {
    Write-Host "${GREEN}✓ Found in ${MCP_LOCATION}${NC}"
} else {
    Write-Host "${YELLOW}○ Not found${NC}"
    Write-Host "   ${DIM}The npx installer should have created this automatically.${NC}"
    Write-Host "   ${DIM}Add claudia-memory to your project's .mcp.json if needed.${NC}"
    $ISSUES_FOUND++
}

# Check 6: Database exists
Write-Host -NoNewline "6. Database file... "
$dbPath = Join-Path (Join-Path $CLAUDIA_DIR "memory") "claudia.db"
if (Test-Path $dbPath) {
    $dbSize = (Get-Item $dbPath).Length
    $dbSizeKB = [math]::Round($dbSize / 1KB, 1)
    Write-Host "${GREEN}✓ OK${NC} ${DIM}(${dbSizeKB}KB)${NC}"
} else {
    Write-Host "${YELLOW}○ Not created yet${NC}"
    Write-Host "   ${DIM}Database will be created on first use.${NC}"
}

# Check 7: Ollama installed
Write-Host -NoNewline "7. Ollama installed... "
try {
    $null = & ollama --version 2>&1
    Write-Host "${GREEN}✓ OK${NC}"
} catch {
    Write-Host "${YELLOW}○ Not installed (keyword search will be used)${NC}"
    Write-Host "   ${DIM}Optional: Install from https://ollama.com/download/windows${NC}"
}

# Check 8: Ollama running
Write-Host -NoNewline "8. Ollama running... "
try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    Write-Host "${GREEN}✓ Running${NC}"
} catch {
    Write-Host "${YELLOW}○ Not running${NC}"
    Write-Host "   ${DIM}Start with: ollama serve${NC}"
    $ISSUES_FOUND++
}

# Check 9: Task Scheduler auto-start
Write-Host -NoNewline "9. Auto-start (Task Scheduler)... "
$task = Get-ScheduledTask -TaskName "ClaudiaMemoryDaemon" -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "${GREEN}✓ Task configured ($($task.State))${NC}"
} else {
    Write-Host "${YELLOW}○ No scheduled task${NC}"
    Write-Host "   ${DIM}Re-run memory installer to configure auto-start.${NC}"
}

# Check 10: Embedding model
Write-Host -NoNewline "10. Embedding model... "
try {
    $modelList = & ollama list 2>&1
    if ($modelList -match "minilm") {
        Write-Host "${GREEN}✓ all-minilm model available${NC}"
    } else {
        Write-Host "${YELLOW}○ No embedding model${NC}"
        Write-Host "   ${DIM}Run: ollama pull all-minilm:l6-v2${NC}"
        $ISSUES_FOUND++
    }
} catch {
    Write-Host "${DIM}○ Skipped (Ollama not installed)${NC}"
}

# Check 11: sqlite-vec
Write-Host -NoNewline "11. Vector search (sqlite-vec)... "
if (Test-Path $VENV_PYTHON) {
    try {
        $result = & $VENV_PYTHON -c "import sqlite_vec; print('ok')" 2>&1
        if ($result -match "ok") {
            Write-Host "${GREEN}✓ sqlite-vec available${NC}"
        } else {
            throw "not available"
        }
    } catch {
        Write-Host "${YELLOW}○ sqlite-vec not working${NC}"
        $pipPath = Join-Path (Join-Path (Join-Path (Join-Path $CLAUDIA_DIR "daemon") "venv") "Scripts") "pip.exe"
        Write-Host "   ${DIM}Fix: $pipPath install sqlite-vec${NC}"
        $ISSUES_FOUND++
    }
} else {
    Write-Host "${RED}✗ Virtual environment missing${NC}"
}

# Summary
Write-Host ""
Write-Host "${DIM}-----------------------------------${NC}"
Write-Host ""

if ($ISSUES_FOUND -eq 0) {
    Write-Host "${GREEN}${BOLD}All checks passed!${NC}"
    Write-Host ""
    Write-Host "If memory.* tools still don't appear in Claude Code:"
    Write-Host ""
    Write-Host "  ${YELLOW}${BOLD}→ Close this terminal and run 'claude' in a NEW terminal${NC}"
    Write-Host ""
    Write-Host "  ${DIM}Claude Code only reads .mcp.json at startup.${NC}"
    Write-Host "  ${DIM}A restart is required to pick up new MCP servers.${NC}"
} else {
    Write-Host "${YELLOW}${BOLD}Found $ISSUES_FOUND issue(s) above.${NC}"
    Write-Host ""
    Write-Host "Fix the issues and run this diagnostic again."
}

Write-Host ""
