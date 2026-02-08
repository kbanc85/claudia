# Claudia Relay Installer (Windows)
# Sets up the Telegram relay with all dependencies

$ErrorActionPreference = "Continue"

# Colors via ANSI escape sequences
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
$RELAY_DIR = Join-Path $CLAUDIA_DIR "relay"
$BIN_DIR = Join-Path $CLAUDIA_DIR "bin"

# Upgrade mode
$IS_UPGRADE = $env:CLAUDIA_RELAY_UPGRADE -eq "1"

# Skip interactive elements (set by parent installer)
$SkipSetup = $env:CLAUDIA_RELAY_SKIP_SETUP

# Banner (skip clear when called from parent installer)
if ($SkipSetup -ne "1") {
    Clear-Host
    Write-Host ""
    Write-Host ($CYAN + "####" + $NC + "  " + $CYAN + "##" + $NC + "      " + $CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "####" + $NC + "    " + $CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC)
    Write-Host ($CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC)
    Write-Host ($CYAN + "####" + $NC + "  " + $CYAN + "####" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC + "    " + $CYAN + "####" + $NC + "    " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC)
    Write-Host ""
    Write-Host ($DIM + "Telegram Relay Installer (Windows)" + $NC)
    Write-Host ($DIM + "Talk to Claudia via Telegram using full Claude Code agent" + $NC)
    Write-Host ""
    Write-Host ($DIM + "------------------------------------------------" + $NC)
    Write-Host ""
}

# ============================================================
# Step 1: Check Node.js >= 18
# ============================================================
Write-Host ($BOLD + "Step 1/4: Environment Check" + $NC)
Write-Host ""

$NODE_BIN = $null
try {
    $nodeVersion = & node --version 2>&1
    if ($nodeVersion -match "v(\d+)") {
        $major = [int]$Matches[1]
        if ($major -ge 18) {
            $NODE_BIN = (Get-Command node).Source
            Write-Host ("  " + $GREEN + "[OK]" + $NC + " Node.js " + $nodeVersion)
        } else {
            Write-Host ("  " + $RED + "[X]" + $NC + " Node.js 18+ required (found: " + $nodeVersion + ")")
            Write-Host ("    " + $DIM + "Install from https://nodejs.org" + $NC)
            exit 1
        }
    }
} catch {
    Write-Host ("  " + $RED + "[X]" + $NC + " Node.js not found")
    Write-Host "    Please install Node.js 18 or later"
    Write-Host ("    " + $DIM + "https://nodejs.org" + $NC)
    exit 1
}

# Check Claude CLI
try {
    $null = & claude --version 2>&1
    Write-Host ("  " + $GREEN + "[OK]" + $NC + " Claude CLI found")
} catch {
    Write-Host ("  " + $YELLOW + "[!]" + $NC + " Claude CLI not found in PATH")
    Write-Host ("    " + $DIM + "The relay requires Claude Code: https://docs.anthropic.com/en/docs/claude-code" + $NC)
}

Write-Host ""
Write-Host ($DIM + "------------------------------------------------" + $NC)
Write-Host ""

# ============================================================
# Step 2: Copy relay source
# ============================================================
Write-Host ($BOLD + "Step 2/4: Installing Relay" + $NC)
Write-Host ""

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$SOURCE_DIR = Split-Path -Parent $SCRIPT_DIR

New-Item -ItemType Directory -Force -Path $RELAY_DIR | Out-Null

Write-Host ("  " + $CYAN + "[..]" + $NC + " Copying relay files...")
Copy-Item -Recurse -Force (Join-Path $SOURCE_DIR "src") $RELAY_DIR
Copy-Item -Force (Join-Path $SOURCE_DIR "package.json") $RELAY_DIR
$gitignorePath = Join-Path $SOURCE_DIR ".gitignore"
if (Test-Path $gitignorePath) {
    Copy-Item -Force $gitignorePath $RELAY_DIR
}
Write-Host ("  " + $GREEN + "[OK]" + $NC + " Relay source installed")

Write-Host ""
Write-Host ($DIM + "------------------------------------------------" + $NC)
Write-Host ""

# ============================================================
# Step 3: npm install --production
# ============================================================
Write-Host ($BOLD + "Step 3/4: Installing Dependencies" + $NC)
Write-Host ""

Write-Host ("  " + $CYAN + "[..]" + $NC + " Running npm install...")
Push-Location $RELAY_DIR
try {
    & npm install --production 2>&1 | Out-Null
    Write-Host ("  " + $GREEN + "[OK]" + $NC + " Dependencies installed")
} catch {
    Write-Host ("  " + $RED + "[X]" + $NC + " npm install failed")
    Write-Host ("    " + $DIM + "Try running manually: cd " + $RELAY_DIR + "; npm install --production" + $NC)
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""
Write-Host ($DIM + "------------------------------------------------" + $NC)
Write-Host ""

# ============================================================
# Step 4: Create CLI wrapper + scheduled task
# ============================================================
Write-Host ($BOLD + "Step 4/4: CLI Wrapper" + $NC)
Write-Host ""

New-Item -ItemType Directory -Force -Path $BIN_DIR | Out-Null

# Create batch wrapper
$wrapperPath = Join-Path $BIN_DIR "claudia-relay.cmd"
$wrapperContent = '@echo off' + "`r`n" + 'node "%USERPROFILE%\.claudia\relay\src\index.js" %*'
Set-Content -Path $wrapperPath -Value $wrapperContent
Write-Host ("  " + $GREEN + "[OK]" + $NC + " CLI installed at " + $wrapperPath)

# Auto-add to user PATH if not already there
$PATH_ADDED = $false
$currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*$BIN_DIR*") {
    try {
        $newPath = if ($currentPath) { "$currentPath;$BIN_DIR" } else { $BIN_DIR }
        [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        $env:PATH = "$BIN_DIR;$env:PATH"
        Write-Host ("  " + $GREEN + "[OK]" + $NC + " PATH updated (user environment)")
        $PATH_ADDED = $true
    } catch {
        Write-Host ("  " + $YELLOW + "[!]" + $NC + " Add to your PATH manually:")
        Write-Host ("    " + $DIM + "[Environment]::SetEnvironmentVariable('PATH', " + '$env:PATH' + " + ';" + $BIN_DIR + "', 'User')" + $NC)
    }
}

# Create scheduled task (disabled by default)
$taskName = "ClaudiaRelay"
try {
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    }

    $action = New-ScheduledTaskAction `
        -Execute $NODE_BIN `
        -Argument "$RELAY_DIR\src\index.js start" `
        -WorkingDirectory $RELAY_DIR

    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Days 0) `
        -StartWhenAvailable

    Register-ScheduledTask `
        -TaskName $taskName `
        -Description "Claudia Telegram Relay" `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -RunLevel Limited `
        -Force | Out-Null

    Disable-ScheduledTask -TaskName $taskName | Out-Null

    Write-Host ("  " + $GREEN + "[OK]" + $NC + " Windows Task Scheduler entry created (disabled)")
    Write-Host ("    " + $DIM + "Enable after configuring:" + $NC)
    Write-Host ("    " + $DIM + "Enable-ScheduledTask -TaskName ClaudiaRelay" + $NC)
} catch {
    Write-Host ("  " + $YELLOW + "[!]" + $NC + " Could not configure auto-start: " + $_)
    Write-Host ("    " + $DIM + "You can start the relay manually: claudia-relay start" + $NC)
}

Write-Host ""
Write-Host ($DIM + "------------------------------------------------" + $NC)
Write-Host ""

# Final summary
Write-Host ($BOLD + "Installed:" + $NC)
Write-Host ""
Write-Host ("  " + $CYAN + "*" + $NC + " Relay source       " + $DIM + $RELAY_DIR + $NC)
Write-Host ("  " + $CYAN + "*" + $NC + " Config             " + $DIM + "~\.claudia\relay.json (create via /setup-telegram)" + $NC)
Write-Host ("  " + $CYAN + "*" + $NC + " CLI                " + $DIM + $wrapperPath + $NC)
Write-Host ("  " + $CYAN + "*" + $NC + " Logs               " + $DIM + $CLAUDIA_DIR + "\relay-stderr.log" + $NC)
if ($PATH_ADDED) {
    Write-Host ""
    Write-Host ("  " + $YELLOW + "[!]" + $NC + " PATH was updated. Restart your terminal for it to take effect.")
}
Write-Host ""
Write-Host ($BOLD + "Next steps:" + $NC)
Write-Host ""
Write-Host ("  Run " + $CYAN + "/setup-telegram" + $NC + " inside Claude Code for guided setup,")
Write-Host "  or configure manually:"
Write-Host ""
Write-Host ("  " + $DIM + "claudia-relay start" + $NC + "     Start the relay")
Write-Host ("  " + $DIM + "claudia-relay stop" + $NC + "      Stop the relay")
Write-Host ("  " + $DIM + "claudia-relay status" + $NC + "    Check status")
Write-Host ""
Write-Host ($MAGENTA + $DIM + [char]34 + "Now you can reach me anywhere." + [char]34 + " -- Claudia" + $NC)
Write-Host ""
