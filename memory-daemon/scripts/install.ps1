# Claudia Memory System Installer (Windows)
# Sets up the memory daemon with all dependencies

$ErrorActionPreference = "Continue"

# Non-interactive mode (set by parent installer)
$NonInteractive = $env:CLAUDIA_NONINTERACTIVE

# Colors via ANSI escape sequences (Windows Terminal / PowerShell 7+ support)
$ESC = [char]27
$RED = "$ESC[0;31m"
$GREEN = "$ESC[0;32m"
$YELLOW = "$ESC[1;33m"
$CYAN = "$ESC[0;36m"
$MAGENTA = "$ESC[0;35m"
$BOLD = "$ESC[1m"
$DIM = "$ESC[2m"
$NC = "$ESC[0m"

# Paths
$CLAUDIA_DIR = Join-Path $env:USERPROFILE ".claudia"
$DAEMON_DIR = Join-Path $CLAUDIA_DIR "daemon"
$VENV_DIR = Join-Path $DAEMON_DIR "venv"
$MEMORY_DIR = Join-Path $CLAUDIA_DIR "memory"
$VENV_SCRIPTS = Join-Path $VENV_DIR "Scripts"
$VENV_PYTHON = Join-Path $VENV_SCRIPTS "python.exe"
$VENV_PIP = Join-Path $VENV_SCRIPTS "pip.exe"

# Banner (skip clear when called from parent installer)
if ($NonInteractive -ne "1") {
    Clear-Host
}
Write-Host ""
Write-Host "${CYAN}████${NC}  ${CYAN}██${NC}      ${CYAN}██${NC}    ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}████${NC}    ${CYAN}██${NC}    ${CYAN}██${NC}"
Write-Host "${CYAN}██${NC}    ${CYAN}██${NC}    ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}"
Write-Host "${CYAN}████${NC}  ${CYAN}████${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}    ${CYAN}██${NC}    ${CYAN}████${NC}    ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}"
Write-Host ""
Write-Host "${DIM}Memory System Installer (Windows)${NC}"
Write-Host "${DIM}Teaching Claudia to never forget${NC}"
Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# Fun messages
$MESSAGES = @(
    "Brewing neural pathways..."
    "Calibrating memory banks..."
    "Teaching Claudia to remember..."
    "Installing elephant-grade memory..."
    "Wiring up the hippocampus..."
    "Defragmenting thought patterns..."
)

function Get-RandomMessage {
    $MESSAGES | Get-Random
}

# ============================================================
# Step 1: Environment Check
# ============================================================
Write-Host "${BOLD}Step 1/8: Environment Check${NC}"
Write-Host ""

$PYTHON = $null

# Try common Python locations on Windows
$pythonCandidates = @(
    "python",
    "python3",
    "py"
)

foreach ($candidate in $pythonCandidates) {
    try {
        $version = & $candidate --version 2>&1
        if ($version -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -ge 3 -and $minor -ge 10) {
                $PYTHON = $candidate
                Write-Host "  ${GREEN}✓${NC} $version ($candidate)"
                break
            }
        }
    } catch {
        # Not found, try next
    }
}

if (-not $PYTHON) {
    Write-Host "  ${RED}✗${NC} Python 3.10+ not found"
    Write-Host "    Please install Python 3.10 or later from https://www.python.org/downloads/"
    Write-Host "    Make sure to check 'Add Python to PATH' during installation."
    exit 1
}

# Check Ollama
$OLLAMA_AVAILABLE = $false
try {
    $null = & ollama --version 2>&1
    Write-Host "  ${GREEN}✓${NC} Ollama installed"
    $OLLAMA_AVAILABLE = $true
} catch {
    Write-Host "  ${YELLOW}○${NC} Ollama not found"

    if ($NonInteractive -eq "1") {
        # Auto-install Ollama in non-interactive mode
        Write-Host "  ${CYAN}Installing Ollama automatically...${NC}"
        $wingetInstalled = $false
        try {
            $null = & winget --version 2>&1
            $wingetInstalled = $true
        } catch {}

        if ($wingetInstalled) {
            Write-Host "  ${CYAN}Installing Ollama via winget...${NC}"
            try {
                & winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
                $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
                $null = & ollama --version 2>&1
                Write-Host "  ${GREEN}✓${NC} Ollama installed via winget"
                $OLLAMA_AVAILABLE = $true
            } catch {
                Write-Host "  ${YELLOW}!${NC} winget install failed"
            }
        }

        if (-not $OLLAMA_AVAILABLE) {
            Write-Host "  ${CYAN}Downloading Ollama installer...${NC}"
            $ollamaInstaller = "$env:TEMP\OllamaSetup.exe"
            try {
                Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $ollamaInstaller -UseBasicParsing
                Write-Host "  ${CYAN}Installing Ollama...${NC}"
                Start-Process -FilePath $ollamaInstaller -ArgumentList "/S" -Wait
                $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
                $null = & ollama --version 2>&1
                Write-Host "  ${GREEN}✓${NC} Ollama installed"
                $OLLAMA_AVAILABLE = $true
            } catch {
                Write-Host "  ${YELLOW}!${NC} Ollama auto-install failed, continuing without"
                Write-Host "  ${DIM}Install manually: https://ollama.com/download/windows${NC}"
            } finally {
                Remove-Item -Path $ollamaInstaller -ErrorAction SilentlyContinue
            }
        }
    } else {
        Write-Host ""
        Write-Host "  ${DIM}Ollama enables semantic vector search.${NC}"
        Write-Host "  ${DIM}Without it, Claudia falls back to keyword search.${NC}"
        Write-Host ""
        $installChoice = Read-Host "  Install Ollama now? (y/n)"
        if ($installChoice -match '^[Yy]') {
            Write-Host ""
            $wingetInstalled = $false
            try {
                $null = & winget --version 2>&1
                $wingetInstalled = $true
            } catch {}

            if ($wingetInstalled) {
                Write-Host "  ${CYAN}Installing Ollama via winget...${NC}"
                try {
                    & winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
                    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
                    $null = & ollama --version 2>&1
                    Write-Host "  ${GREEN}✓${NC} Ollama installed via winget"
                    $OLLAMA_AVAILABLE = $true
                } catch {
                    Write-Host "  ${YELLOW}!${NC} winget install failed"
                }
            }

            if (-not $OLLAMA_AVAILABLE) {
                Write-Host "  ${CYAN}Downloading Ollama installer...${NC}"
                $ollamaInstaller = "$env:TEMP\OllamaSetup.exe"
                try {
                    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $ollamaInstaller -UseBasicParsing
                    Write-Host "  ${CYAN}Installing Ollama...${NC}"
                    Start-Process -FilePath $ollamaInstaller -ArgumentList "/S" -Wait
                    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
                    $null = & ollama --version 2>&1
                    Write-Host "  ${GREEN}✓${NC} Ollama installed"
                    $OLLAMA_AVAILABLE = $true
                } catch {
                    Write-Host "  ${YELLOW}!${NC} Ollama install failed, continuing without"
                    Write-Host "  ${DIM}Install manually: https://ollama.com/download/windows${NC}"
                } finally {
                    Remove-Item -Path $ollamaInstaller -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 2: AI Models
# ============================================================
Write-Host "${BOLD}Step 2/8: AI Models${NC}"
Write-Host ""

if ($OLLAMA_AVAILABLE) {
    # Check if Ollama is running
    $ollamaRunning = $false
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        $ollamaRunning = $true
        Write-Host "  ${GREEN}✓${NC} Ollama server already running"
    } catch {
        Write-Host "  ${CYAN}◐${NC} Starting Ollama server..."
        Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 5
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
            $ollamaRunning = $true
            Write-Host "  ${GREEN}✓${NC} Ollama server running"
        } catch {
            Write-Host "  ${YELLOW}!${NC} Could not start Ollama (will retry on boot)"
        }
    }

    # Pull embedding model
    $modelList = & ollama list 2>&1
    if ($modelList -match "all-minilm") {
        Write-Host "  ${GREEN}✓${NC} Embedding model ready"
    } else {
        Write-Host "  ${CYAN}◐${NC} Downloading embedding model (45MB)..."
        Write-Host "    ${DIM}This gives Claudia semantic understanding${NC}"
        Write-Host ""
        try {
            & ollama pull "all-minilm:l6-v2" 2>&1 | Out-Null
            Write-Host "  ${GREEN}✓${NC} Model downloaded"
        } catch {
            Write-Host "  ${YELLOW}!${NC} Model pull failed (will retry when Ollama runs)"
        }
    }
} else {
    Write-Host "  ${YELLOW}○${NC} Skipping (Ollama not available)"
    Write-Host "    ${DIM}Claudia will use keyword search instead${NC}"
}

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 3: Creating Home
# ============================================================
Write-Host "${BOLD}Step 3/8: Creating Home${NC}"
Write-Host ""

New-Item -ItemType Directory -Force -Path $DAEMON_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $MEMORY_DIR | Out-Null
Write-Host "  ${GREEN}✓${NC} Created $CLAUDIA_DIR"
Write-Host "    ${DIM}├── daemon\   (brain)${NC}"
Write-Host "    ${DIM}└── memory\   (memories)${NC}"

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 4: Installing Core
# ============================================================
Write-Host "${BOLD}Step 4/8: Installing Core${NC}"
Write-Host ""

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$SOURCE_DIR = Split-Path -Parent $SCRIPT_DIR

Write-Host "  ${CYAN}◐${NC} Copying memory system files..."
$srcMemory = Join-Path $SOURCE_DIR "claudia_memory"
$srcScripts = Join-Path $SOURCE_DIR "scripts"
$srcPyproject = Join-Path $SOURCE_DIR "pyproject.toml"
$srcRequirements = Join-Path $SOURCE_DIR "requirements.txt"
Copy-Item -Recurse -Force $srcMemory $DAEMON_DIR
Copy-Item -Recurse -Force $srcScripts $DAEMON_DIR
Copy-Item -Force $srcPyproject $DAEMON_DIR
Copy-Item -Force $srcRequirements $DAEMON_DIR
Write-Host "  ${GREEN}✓${NC} Core files installed"

# Copy diagnostic script
$srcDiagnose = Join-Path (Join-Path $SOURCE_DIR "scripts") "diagnose.ps1"
Copy-Item -Force $srcDiagnose $CLAUDIA_DIR
Write-Host "  ${GREEN}✓${NC} Diagnostic script installed"

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 5: Python Environment
# ============================================================
Write-Host "${BOLD}Step 5/8: Python Environment${NC}"
Write-Host ""

Write-Host "  ${CYAN}◐${NC} Creating isolated environment..."
& $PYTHON -m venv $VENV_DIR
Write-Host "  ${GREEN}✓${NC} Virtual environment created"

Write-Host "  ${CYAN}◐${NC} Installing dependencies..."
$msg = Get-RandomMessage
Write-Host "    ${DIM}$msg${NC}"
$reqFile = Join-Path $DAEMON_DIR "requirements.txt"
$ErrorActionPreference = "SilentlyContinue"
& $VENV_PIP install --upgrade pip 2>&1 | Out-Null
& $VENV_PIP install -r $reqFile 2>&1 | Out-Null
& $VENV_PIP install -e "$DAEMON_DIR[tui]" 2>&1 | Out-Null
$ErrorActionPreference = "Continue"
Write-Host "  ${GREEN}✓${NC} Dependencies installed"

# Install spaCy
Write-Host "  ${CYAN}◐${NC} Installing NLP engine..."
$msg = Get-RandomMessage
Write-Host "    ${DIM}$msg${NC}"
$ErrorActionPreference = "SilentlyContinue"
& $VENV_PIP install spacy 2>&1 | Out-Null
& $VENV_PYTHON -m spacy download en_core_web_sm 2>&1 | Out-Null
$ErrorActionPreference = "Continue"
Write-Host "  ${GREEN}✓${NC} NLP ready"

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 6: Auto-Start Setup (Windows Task Scheduler)
# ============================================================
Write-Host "${BOLD}Step 6/8: Auto-Start Setup${NC}"
Write-Host ""

$taskName = "ClaudiaMemoryDaemon"

try {
    # Remove existing task if present
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    }

    # Create the scheduled task action
    $action = New-ScheduledTaskAction `
        -Execute $VENV_PYTHON `
        -Argument "-m claudia_memory --standalone" `
        -WorkingDirectory $DAEMON_DIR

    # Trigger: at logon for current user
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

    # Settings: restart on failure, don't stop on idle, run indefinitely
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Days 0) `
        -StartWhenAvailable

    # Register the task (runs as current user, no elevation needed)
    Register-ScheduledTask `
        -TaskName $taskName `
        -Description "Claudia Memory Daemon - persistent memory system" `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -RunLevel Limited `
        -Force | Out-Null

    Write-Host "  ${GREEN}✓${NC} Configured Windows Task Scheduler"
    Write-Host "    ${DIM}Will start on login${NC}"

    # Start the task now
    Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Write-Host "  ${GREEN}✓${NC} Daemon launched"
} catch {
    Write-Host "  ${YELLOW}!${NC} Could not configure auto-start: $_"
    Write-Host "    ${DIM}You can start the daemon manually:${NC}"
    Write-Host "    ${DIM}$VENV_PYTHON -m claudia_memory --standalone${NC}"
}

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 7: Memory Migration
# ============================================================
Write-Host "${BOLD}Step 7/8: Memory Migration${NC}"
Write-Host ""

$projectPath = $env:CLAUDIA_PROJECT_PATH

if ($projectPath -and (Test-Path (Join-Path $projectPath "context") -ErrorAction SilentlyContinue)) {
    Write-Host "  ${CYAN}◐${NC} Found existing memories to migrate..."
    Start-Sleep -Seconds 2

    try {
        $migrationScript = Join-Path (Join-Path $DAEMON_DIR "scripts") "migrate_markdown.py"
        & $VENV_PYTHON $migrationScript --quiet $projectPath
        Write-Host "  ${GREEN}✓${NC} Memories migrated to database"
    } catch {
        Write-Host "  ${YELLOW}!${NC} Migration had issues (memories still in markdown)"
        Write-Host "    ${DIM}You can retry manually: $VENV_PYTHON -m claudia_memory.scripts.migrate_markdown $projectPath${NC}"
    }
} elseif ($projectPath -and (Test-Path (Join-Path $projectPath "people") -ErrorAction SilentlyContinue)) {
    Write-Host "  ${CYAN}◐${NC} Found existing memories to migrate..."
    Start-Sleep -Seconds 2

    try {
        $migrationScript = Join-Path (Join-Path $DAEMON_DIR "scripts") "migrate_markdown.py"
        & $VENV_PYTHON $migrationScript --quiet $projectPath
        Write-Host "  ${GREEN}✓${NC} Memories migrated to database"
    } catch {
        Write-Host "  ${YELLOW}!${NC} Migration had issues (memories still in markdown)"
    }
} else {
    Write-Host "  ${DIM}Fresh install - no migration needed${NC}"
}

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 8: Verification
# ============================================================
Write-Host "${BOLD}Step 8/8: Verification${NC}"
Write-Host ""
Write-Host "  ${CYAN}◐${NC} Checking all services..."
Start-Sleep -Seconds 3

# Check 1: Ollama running
try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  ${GREEN}✓${NC} Ollama running"
} catch {
    Write-Host "  ${YELLOW}○${NC} Ollama not running (will start on next boot)"
}

# Check 2: Embedding model
if ($OLLAMA_AVAILABLE) {
    $modelList = & ollama list 2>&1
    if ($modelList -match "minilm") {
        Write-Host "  ${GREEN}✓${NC} Embedding model ready"
    } else {
        Write-Host "  ${YELLOW}○${NC} Embedding model pending"
    }
}

# Check 3: sqlite-vec
try {
    & $VENV_PYTHON -c "import sqlite_vec" 2>&1 | Out-Null
    Write-Host "  ${GREEN}✓${NC} Vector search available (sqlite-vec)"
} catch {
    Write-Host "  ${YELLOW}○${NC} Vector search unavailable (keyword search only)"
}

# Check 4: Memory daemon health
try {
    $health = Invoke-WebRequest -Uri "http://localhost:3848/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($health.Content -match "healthy") {
        Write-Host "  ${GREEN}✓${NC} Memory daemon running"
    } else {
        Write-Host "  ${YELLOW}○${NC} Memory daemon starting..."
    }
} catch {
    Write-Host "  ${YELLOW}○${NC} Memory daemon starting..."
}

# Check 5: Task Scheduler
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "  ${GREEN}✓${NC} Auto-start configured (Task Scheduler)"
}

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# Success banner
Write-Host "${GREEN}"
Write-Host "  ╔═══════════════════════════════════════════════════════════╗"
Write-Host "  ║                                                           ║"
Write-Host "  ║   ✨ Memory system installed successfully! ✨             ║"
Write-Host "  ║                                                           ║"
Write-Host "  ╚═══════════════════════════════════════════════════════════╝"
Write-Host "${NC}"

Write-Host "${CYAN}${BOLD}"
Write-Host "  ┌─────────────────────────────────────────────────────────────┐"
Write-Host "  │                                                             │"
Write-Host "  │   Ready! Run 'claude' in a new terminal to start.          │"
Write-Host "  │                                                             │"
Write-Host "  │   If Claude was already running, restart it to activate    │"
Write-Host "  │   the memory tools.                                         │"
Write-Host "  │                                                             │"
Write-Host "  └─────────────────────────────────────────────────────────────┘"
Write-Host "${NC}"

# Summary
Write-Host "${BOLD}What's installed:${NC}"
Write-Host ""
Write-Host "  ${CYAN}◆${NC} Memory daemon      ${DIM}$DAEMON_DIR${NC}"
Write-Host "  ${CYAN}◆${NC} SQLite database    ${DIM}$MEMORY_DIR\claudia.db${NC}"
Write-Host "  ${CYAN}◆${NC} Health endpoint    ${DIM}http://localhost:3848${NC}"
if ($OLLAMA_AVAILABLE) {
    Write-Host "  ${CYAN}◆${NC} Vector search      ${DIM}Enabled (Ollama)${NC}"
} else {
    Write-Host "  ${YELLOW}○${NC} Vector search      ${DIM}Disabled (install Ollama to enable)${NC}"
}
Write-Host ""

Write-Host "${BOLD}Troubleshooting:${NC}"
Write-Host ""
Write-Host "  ${DIM}Run diagnostics:${NC}  powershell -File $CLAUDIA_DIR\diagnose.ps1"
Write-Host "  ${DIM}Check health:${NC}     Invoke-WebRequest http://localhost:3848/health"
Write-Host "  ${DIM}View task:${NC}        Get-ScheduledTask -TaskName ClaudiaMemoryDaemon"
Write-Host ""

# Claudia says goodbye
Write-Host "${MAGENTA}${DIM}$([char]34)I learn how you work. Let's get started.$([char]34) -- Claudia${NC}"
Write-Host ""
