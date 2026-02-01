# Claudia Gateway Installer (Windows)
# Sets up the messaging gateway with all dependencies

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
$GATEWAY_DIR = Join-Path $CLAUDIA_DIR "gateway"
$BIN_DIR = Join-Path $CLAUDIA_DIR "bin"

# Upgrade mode
$IS_UPGRADE = $env:CLAUDIA_GATEWAY_UPGRADE -eq "1"

# Banner
Clear-Host
Write-Host ""
Write-Host "${CYAN}████${NC}  ${CYAN}██${NC}      ${CYAN}██${NC}    ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}████${NC}    ${CYAN}██${NC}    ${CYAN}██${NC}"
Write-Host "${CYAN}██${NC}    ${CYAN}██${NC}    ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}"
Write-Host "${CYAN}████${NC}  ${CYAN}████${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}    ${CYAN}██${NC}    ${CYAN}████${NC}    ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}"
Write-Host ""
Write-Host "${DIM}Messaging Gateway Installer (Windows)${NC}"
Write-Host "${DIM}Talk to Claudia from Telegram and Slack${NC}"
Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 1: Check Node.js >= 18
# ============================================================
Write-Host "${BOLD}Step 1/6: Environment Check${NC}"
Write-Host ""

$NODE_BIN = $null
try {
    $nodeVersion = & node --version 2>&1
    if ($nodeVersion -match "v(\d+)") {
        $major = [int]$Matches[1]
        if ($major -ge 18) {
            $NODE_BIN = (Get-Command node).Source
            Write-Host "  ${GREEN}✓${NC} Node.js $nodeVersion"
        } else {
            Write-Host "  ${RED}✗${NC} Node.js 18+ required (found: $nodeVersion)"
            Write-Host "    ${DIM}Install from https://nodejs.org${NC}"
            exit 1
        }
    }
} catch {
    Write-Host "  ${RED}✗${NC} Node.js not found"
    Write-Host "    Please install Node.js 18 or later"
    Write-Host "    ${DIM}https://nodejs.org${NC}"
    exit 1
}

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 2: Copy gateway source
# ============================================================
Write-Host "${BOLD}Step 2/6: Installing Gateway${NC}"
Write-Host ""

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$SOURCE_DIR = Split-Path -Parent $SCRIPT_DIR

New-Item -ItemType Directory -Force -Path $GATEWAY_DIR | Out-Null

Write-Host "  ${CYAN}◐${NC} Copying gateway files..."
Copy-Item -Recurse -Force (Join-Path $SOURCE_DIR "src") $GATEWAY_DIR
Copy-Item -Force (Join-Path $SOURCE_DIR "package.json") $GATEWAY_DIR
Write-Host "  ${GREEN}✓${NC} Gateway source installed"

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 3: npm install --production
# ============================================================
Write-Host "${BOLD}Step 3/6: Installing Dependencies${NC}"
Write-Host ""

Write-Host "  ${CYAN}◐${NC} Running npm install..."
Push-Location $GATEWAY_DIR
try {
    & npm install --production 2>&1 | Out-Null
    Write-Host "  ${GREEN}✓${NC} Dependencies installed"
} catch {
    Write-Host "  ${RED}✗${NC} npm install failed"
    Write-Host "    ${DIM}Try running manually: cd $GATEWAY_DIR && npm install --production${NC}"
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 4: Generate config
# ============================================================
Write-Host "${BOLD}Step 4/6: Configuration${NC}"
Write-Host ""

$CONFIG_FILE = Join-Path $CLAUDIA_DIR "gateway.json"

if ((Test-Path $CONFIG_FILE) -and $IS_UPGRADE) {
    Write-Host "  ${GREEN}✓${NC} Existing config preserved"
} else {
    & node (Join-Path $GATEWAY_DIR "src" "index.js") init 2>&1 | Out-Null
    Write-Host "  ${GREEN}✓${NC} Config created at $CONFIG_FILE"
}

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 5: Create CLI wrapper
# ============================================================
Write-Host "${BOLD}Step 5/6: CLI Wrapper${NC}"
Write-Host ""

New-Item -ItemType Directory -Force -Path $BIN_DIR | Out-Null

# Create batch wrapper
$wrapperPath = Join-Path $BIN_DIR "claudia-gateway.cmd"
$wrapperContent = @"
@echo off
node "%USERPROFILE%\.claudia\gateway\src\index.js" %*
"@
Set-Content -Path $wrapperPath -Value $wrapperContent
Write-Host "  ${GREEN}✓${NC} CLI installed at $wrapperPath"

# PATH hint
$currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*$BIN_DIR*") {
    Write-Host "  ${YELLOW}!${NC} Add to your PATH if not already present:"
    Write-Host "    ${DIM}[Environment]::SetEnvironmentVariable('PATH', `$env:PATH + ';$BIN_DIR', 'User')${NC}"
}

# Create scheduled task (disabled by default)
$taskName = "ClaudiaGateway"
try {
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    }

    $action = New-ScheduledTaskAction `
        -Execute $NODE_BIN `
        -Argument "$GATEWAY_DIR\src\index.js start" `
        -WorkingDirectory $GATEWAY_DIR

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
        -Description "Claudia Messaging Gateway" `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -RunLevel Limited `
        -Force | Out-Null

    # Disable the task (requires API keys first)
    Disable-ScheduledTask -TaskName $taskName | Out-Null

    Write-Host "  ${GREEN}✓${NC} Windows Task Scheduler entry created (disabled)"
    Write-Host "    ${DIM}Enable after configuring API keys:${NC}"
    Write-Host "    ${DIM}Enable-ScheduledTask -TaskName ClaudiaGateway${NC}"
} catch {
    Write-Host "  ${YELLOW}!${NC} Could not configure auto-start: $_"
    Write-Host "    ${DIM}You can start the gateway manually: claudia-gateway start${NC}"
}

Write-Host ""
Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
Write-Host ""

# ============================================================
# Step 6: Security checklist and next steps
# ============================================================
Write-Host "${BOLD}Step 6/6: What's Next${NC}"
Write-Host ""

Write-Host "${GREEN}"
Write-Host "  ╔═══════════════════════════════════════════════════════════╗"
Write-Host "  ║                                                           ║"
Write-Host "  ║   ✨ Gateway installed successfully! ✨                   ║"
Write-Host "  ║                                                           ║"
Write-Host "  ╚═══════════════════════════════════════════════════════════╝"
Write-Host "${NC}"

Write-Host "${BOLD}Security checklist (do these before starting):${NC}"
Write-Host ""
Write-Host "  ${YELLOW}□${NC} Set ANTHROPIC_API_KEY as an environment variable"
Write-Host "  ${YELLOW}□${NC} Set TELEGRAM_BOT_TOKEN (or SLACK_BOT_TOKEN + SLACK_APP_TOKEN)"
Write-Host "  ${YELLOW}□${NC} Add your user ID(s) to allowedUsers in gateway.json"
Write-Host "  ${YELLOW}□${NC} Never commit API keys to git or store them in gateway.json"
Write-Host ""
Write-Host "${BOLD}Quick start:${NC}"
Write-Host ""
Write-Host "  ${CYAN}1.${NC} `$env:ANTHROPIC_API_KEY = 'sk-ant-...'"
Write-Host "  ${CYAN}2.${NC} `$env:TELEGRAM_BOT_TOKEN = '123456:ABC...'"
Write-Host "  ${CYAN}3.${NC} Edit $CONFIG_FILE (enable channel, set allowedUsers)"
Write-Host "  ${CYAN}4.${NC} claudia-gateway start"
Write-Host ""
Write-Host "${BOLD}Installed:${NC}"
Write-Host ""
Write-Host "  ${CYAN}◆${NC} Gateway source     ${DIM}$GATEWAY_DIR${NC}"
Write-Host "  ${CYAN}◆${NC} Config             ${DIM}$CONFIG_FILE${NC}"
Write-Host "  ${CYAN}◆${NC} CLI                ${DIM}$wrapperPath${NC}"
Write-Host "  ${CYAN}◆${NC} Logs               ${DIM}$CLAUDIA_DIR\gateway.log${NC}"
Write-Host ""
Write-Host "${BOLD}CLI commands:${NC}"
Write-Host ""
Write-Host "  ${DIM}claudia-gateway start${NC}     Start the gateway"
Write-Host "  ${DIM}claudia-gateway stop${NC}      Stop the gateway"
Write-Host "  ${DIM}claudia-gateway status${NC}    Check status"
Write-Host "  ${DIM}claudia-gateway logs${NC}      View recent logs"
Write-Host ""
Write-Host "${MAGENTA}${DIM}$([char]34)Now you can reach me anywhere.$([char]34) -- Claudia${NC}"
Write-Host ""
