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
# Step 3.5: Local model check (Ollama)
# ============================================================
Write-Host "${BOLD}Step 3.5/6: Local Model${NC}"
Write-Host ""

$LOCAL_MODEL = ""
$CLAUDIA_CONFIG = Join-Path $CLAUDIA_DIR "config.json"

# Check if a language model is already configured
if (Test-Path $CLAUDIA_CONFIG) {
    try {
        $configData = Get-Content $CLAUDIA_CONFIG -Raw | ConvertFrom-Json
        $LOCAL_MODEL = $configData.language_model
        if ($null -eq $LOCAL_MODEL) { $LOCAL_MODEL = "" }
    } catch {
        $LOCAL_MODEL = ""
    }
}

$OLLAMA_AVAILABLE = $false
try {
    $ollamaList = & ollama list 2>&1
    if ($LASTEXITCODE -eq 0) { $OLLAMA_AVAILABLE = $true }
} catch {}

if ($LOCAL_MODEL -and $OLLAMA_AVAILABLE) {
    # Check if model is pulled
    $modelFound = $ollamaList | Select-String -Pattern "^$LOCAL_MODEL" -Quiet
    if ($modelFound) {
        Write-Host "  ${GREEN}✓${NC} Using ${BOLD}${LOCAL_MODEL}${NC} for chat (no API key needed)"
    } else {
        Write-Host "  ${YELLOW}!${NC} Model $LOCAL_MODEL configured but not pulled"
        Write-Host "    ${DIM}Run: ollama pull $LOCAL_MODEL${NC}"
    }
} elseif ($OLLAMA_AVAILABLE) {
    Write-Host "  ${CYAN}?${NC} No local language model configured."
    Write-Host "    A local model lets you use the gateway without an Anthropic API key."
    Write-Host ""
    Write-Host "  ${BOLD}Pick a model:${NC}"
    Write-Host "    ${CYAN}1)${NC} qwen3:4b     ${DIM}(recommended, 2.5GB)${NC}"
    Write-Host "    ${CYAN}2)${NC} smollm3:3b   ${DIM}(smaller, 1.7GB)${NC}"
    Write-Host "    ${CYAN}3)${NC} llama3.2:3b  ${DIM}(Meta, 2.0GB)${NC}"
    Write-Host "    ${CYAN}4)${NC} skip         ${DIM}(use Anthropic API key instead)${NC}"
    Write-Host ""
    $modelChoice = Read-Host "  Choice [1-4, default=4]"

    switch ($modelChoice) {
        "1" { $LOCAL_MODEL = "qwen3:4b" }
        "2" { $LOCAL_MODEL = "smollm3:3b" }
        "3" { $LOCAL_MODEL = "llama3.2:3b" }
        default { $LOCAL_MODEL = "" }
    }

    if ($LOCAL_MODEL) {
        Write-Host ""
        Write-Host "  ${CYAN}◐${NC} Pulling $LOCAL_MODEL (this may take a few minutes)..."
        try {
            & ollama pull $LOCAL_MODEL 2>&1 | Select-Object -Last 1
            Write-Host "  ${GREEN}✓${NC} Model $LOCAL_MODEL ready"

            # Write to shared config
            if (Test-Path $CLAUDIA_CONFIG) {
                $configData = Get-Content $CLAUDIA_CONFIG -Raw | ConvertFrom-Json
                $configData | Add-Member -NotePropertyName "language_model" -NotePropertyValue $LOCAL_MODEL -Force
                $configData | ConvertTo-Json -Depth 10 | Set-Content $CLAUDIA_CONFIG
            } else {
                @{ language_model = $LOCAL_MODEL } | ConvertTo-Json | Set-Content $CLAUDIA_CONFIG
            }
        } catch {
            Write-Host "  ${RED}✗${NC} Failed to pull $LOCAL_MODEL"
            $LOCAL_MODEL = ""
        }
    } else {
        Write-Host "  ${DIM}  Skipped. You'll need ANTHROPIC_API_KEY to use the gateway.${NC}"
    }
} else {
    Write-Host "  ${DIM}  Ollama not found. You'll need ANTHROPIC_API_KEY to use the gateway.${NC}"
    Write-Host "  ${DIM}  Install Ollama: https://ollama.com${NC}"
}

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

# Auto-add to user PATH if not already there
$PATH_ADDED = $false
$currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*$BIN_DIR*") {
    try {
        $newPath = if ($currentPath) { "$currentPath;$BIN_DIR" } else { $BIN_DIR }
        [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        $env:PATH = "$BIN_DIR;$env:PATH"
        Write-Host "  ${GREEN}✓${NC} PATH updated (user environment)"
        $PATH_ADDED = $true
    } catch {
        Write-Host "  ${YELLOW}!${NC} Add to your PATH manually:"
        Write-Host "    ${DIM}[Environment]::SetEnvironmentVariable('PATH', `$env:PATH + ';$BIN_DIR', 'User')${NC}"
    }
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

# Offer interactive setup guide
Write-Host "  The gateway needs a chat platform (Telegram or Slack) to"
Write-Host "  receive your messages. ${BOLD}Want a step-by-step setup guide?${NC}"
Write-Host ""
$showGuide = Read-Host "  Show setup guide? [y/n, default=y]"
if (-not $showGuide) { $showGuide = "y" }

if ($showGuide -match "^[Yy]") {
    Write-Host ""
    Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    Write-Host ""
    Write-Host "  ${BOLD}Which platform?${NC}"
    Write-Host "    ${CYAN}1)${NC} Telegram   ${DIM}(easiest, 2 minutes)${NC}"
    Write-Host "    ${CYAN}2)${NC} Slack      ${DIM}(requires workspace admin)${NC}"
    Write-Host "    ${CYAN}3)${NC} Skip       ${DIM}(I'll set it up later)${NC}"
    Write-Host ""
    $platformChoice = Read-Host "  Choice [1-3, default=1]"
    if (-not $platformChoice) { $platformChoice = "1" }

    if ($platformChoice -eq "1") {
        Write-Host ""
        Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        Write-Host ""
        Write-Host "  ${BOLD}Telegram Setup${NC}"
        Write-Host ""
        Write-Host "  ${CYAN}Step 1:${NC} Open Telegram and search for ${BOLD}@BotFather${NC}"
        Write-Host "          (or open: ${DIM}https://t.me/BotFather${NC})"
        Write-Host ""
        Write-Host "  ${CYAN}Step 2:${NC} Send ${BOLD}/newbot${NC} to BotFather"
        Write-Host "          He'll ask for a display name (anything, e.g. $([char]34)My Claudia$([char]34))"
        Write-Host "          Then a username (must end in 'bot', e.g. $([char]34)my_claudia_bot$([char]34))"
        Write-Host ""
        Write-Host "  ${CYAN}Step 3:${NC} BotFather will reply with a token like:"
        Write-Host "          ${DIM}123456789:ABCdefGHIjklMNOpqrsTUVwxyz${NC}"
        Write-Host "          Copy that token."
        Write-Host ""
        $botToken = Read-Host "  Paste your bot token here (or press Enter to skip)"

        if ($botToken) {
            Write-Host ""
            Write-Host "  ${CYAN}Step 4:${NC} Now get your Telegram user ID."
            Write-Host "          Search for ${BOLD}@userinfobot${NC} in Telegram"
            Write-Host "          (or open: ${DIM}https://t.me/userinfobot${NC})"
            Write-Host "          Send it any message. It replies with your ID (a number)."
            Write-Host ""
            while ($true) {
                $userId = Read-Host "  Paste your user ID here (or press Enter to skip)"

                # Empty = skip
                if (-not $userId) { break }

                # Strip leading @
                $userId = $userId -replace '^@', ''

                # Validate: must be all digits
                if ($userId -match '^\d+$') { break }

                Write-Host ""
                Write-Host "  ${RED}✗${NC} That looks like a username, not a numeric ID."
                Write-Host "    Telegram user IDs are numbers only (e.g. ${BOLD}1588190837${NC})."
                Write-Host "    Get yours from ${BOLD}@userinfobot${NC} in Telegram."
                Write-Host ""
            }

            if ($userId) {
                # Write the config
                $cfgData = @{}
                if (Test-Path $CONFIG_FILE) {
                    try { $cfgData = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json } catch {}
                }
                if (-not $cfgData.channels) { $cfgData | Add-Member -NotePropertyName "channels" -NotePropertyValue @{} -Force }
                $cfgData.channels | Add-Member -NotePropertyName "telegram" -NotePropertyValue @{
                    enabled = $true
                    allowedUsers = @($userId)
                } -Force
                $cfgData | ConvertTo-Json -Depth 10 | Set-Content $CONFIG_FILE

                Write-Host ""
                Write-Host "  ${GREEN}✓${NC} Telegram configured in gateway.json"
                Write-Host "  ${GREEN}✓${NC} User $userId added to allowlist"
                Write-Host ""

                $env:TELEGRAM_BOT_TOKEN = $botToken

                # Auto-persist token to PowerShell profile
                $profilePath = $PROFILE.CurrentUserAllHosts
                $profileDir = Split-Path $profilePath -Parent
                if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Force -Path $profileDir | Out-Null }
                if (-not (Test-Path $profilePath)) { New-Item -ItemType File -Force -Path $profilePath | Out-Null }

                $profileContent = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
                $tokenLine = "`$env:TELEGRAM_BOT_TOKEN = '$botToken'"

                if ($profileContent -match 'TELEGRAM_BOT_TOKEN') {
                    # Replace existing line
                    $profileContent = $profileContent -replace '(?m)^\$env:TELEGRAM_BOT_TOKEN\s*=.*$', $tokenLine
                    Set-Content -Path $profilePath -Value $profileContent
                    Write-Host "  ${GREEN}✓${NC} Bot token updated in PowerShell profile"
                } else {
                    Add-Content -Path $profilePath -Value "`n# Claudia Gateway - Telegram`n$tokenLine"
                    Write-Host "  ${GREEN}✓${NC} Bot token saved to PowerShell profile"
                }

                Write-Host ""
                Write-Host "  ${YELLOW}┌─────────────────────────────────────────────────┐${NC}"
                Write-Host "  ${YELLOW}│${NC}  ${BOLD}Open a NEW terminal${NC} to run the gateway.         ${YELLOW}│${NC}"
                Write-Host "  ${YELLOW}│${NC}  This terminal doesn't have your token yet.      ${YELLOW}│${NC}"
                Write-Host "  ${YELLOW}│${NC}                                                   ${YELLOW}│${NC}"
                Write-Host "  ${YELLOW}│${NC}  Or reload your profile in this terminal:         ${YELLOW}│${NC}"
                Write-Host "  ${YELLOW}│${NC}    ${CYAN}. `$PROFILE${NC}                                      ${YELLOW}│${NC}"
                Write-Host "  ${YELLOW}└─────────────────────────────────────────────────┘${NC}"
            } else {
                Write-Host ""
                Write-Host "  ${YELLOW}!${NC} Skipped user ID. You'll need to add it manually:"
                Write-Host "    ${DIM}Edit $CONFIG_FILE and set:"
                Write-Host "    channels.telegram.allowedUsers = [$([char]34)YOUR_USER_ID$([char]34)]${NC}"
            }
        } else {
            Write-Host ""
            Write-Host "  ${DIM}No worries. When you have your token, run:${NC}"
            Write-Host "    ${CYAN}`$env:TELEGRAM_BOT_TOKEN = 'your-token-here'${NC}"
            Write-Host "    ${CYAN}claudia-gateway start${NC}"
        }

    } elseif ($platformChoice -eq "2") {
        Write-Host ""
        Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        Write-Host ""
        Write-Host "  ${BOLD}Slack Setup${NC}"
        Write-Host ""
        Write-Host "  ${CYAN}Step 1:${NC} Go to ${BOLD}https://api.slack.com/apps${NC}"
        Write-Host "          Click ${BOLD}Create New App${NC} > ${BOLD}From scratch${NC}"
        Write-Host "          Pick a name and workspace."
        Write-Host ""
        Write-Host "  ${CYAN}Step 2:${NC} Enable ${BOLD}Socket Mode${NC} (in Settings sidebar)"
        Write-Host "          This generates an app-level token (starts with ${DIM}xapp-${NC})"
        Write-Host "          Name it anything (e.g. $([char]34)claudia-socket$([char]34)). Copy it."
        Write-Host ""
        Write-Host "  ${CYAN}Step 3:${NC} Go to ${BOLD}OAuth & Permissions${NC}. Add these bot token scopes:"
        Write-Host "          ${DIM}app_mentions:read, chat:write, im:history, im:read, im:write${NC}"
        Write-Host ""
        Write-Host "  ${CYAN}Step 4:${NC} Go to ${BOLD}Event Subscriptions${NC}. Enable events."
        Write-Host "          Subscribe to: ${DIM}message.im${NC} and ${DIM}app_mention${NC}"
        Write-Host ""
        Write-Host "  ${CYAN}Step 5:${NC} Click ${BOLD}Install to Workspace${NC} (in sidebar or OAuth page)"
        Write-Host "          This generates a bot token (starts with ${DIM}xoxb-${NC}). Copy it."
        Write-Host ""
        Write-Host "  ${CYAN}Step 6:${NC} Get your Slack user ID:"
        Write-Host "          Click your profile picture > ${BOLD}Profile${NC} > ${BOLD}...${NC} (more) > ${BOLD}Copy member ID${NC}"
        Write-Host ""
        $slackBot = Read-Host "  Paste your bot token (xoxb-...)"
        $slackApp = Read-Host "  Paste your app token (xapp-...)"
        $slackUser = Read-Host "  Paste your user ID (U...)"

        if ($slackBot -and $slackApp -and $slackUser) {
            $cfgData = @{}
            if (Test-Path $CONFIG_FILE) {
                try { $cfgData = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json } catch {}
            }
            if (-not $cfgData.channels) { $cfgData | Add-Member -NotePropertyName "channels" -NotePropertyValue @{} -Force }
            $cfgData.channels | Add-Member -NotePropertyName "slack" -NotePropertyValue @{
                enabled = $true
                allowedUsers = @($slackUser)
            } -Force
            $cfgData | ConvertTo-Json -Depth 10 | Set-Content $CONFIG_FILE

            # Export tokens for this session
            $env:SLACK_BOT_TOKEN = $slackBot
            $env:SLACK_APP_TOKEN = $slackApp

            Write-Host ""
            Write-Host "  ${GREEN}✓${NC} Slack configured in gateway.json"
            Write-Host "  ${GREEN}✓${NC} User $slackUser added to allowlist"

            # Auto-persist tokens to PowerShell profile
            $profilePath = $PROFILE.CurrentUserAllHosts
            $profileDir = Split-Path $profilePath -Parent
            if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Force -Path $profileDir | Out-Null }
            if (-not (Test-Path $profilePath)) { New-Item -ItemType File -Force -Path $profilePath | Out-Null }

            $profileContent = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
            $sbotLine = "`$env:SLACK_BOT_TOKEN = '$slackBot'"
            $sappLine = "`$env:SLACK_APP_TOKEN = '$slackApp'"

            if ($profileContent -match 'SLACK_BOT_TOKEN') {
                $profileContent = $profileContent -replace '(?m)^\$env:SLACK_BOT_TOKEN\s*=.*$', $sbotLine
                $profileContent = $profileContent -replace '(?m)^\$env:SLACK_APP_TOKEN\s*=.*$', $sappLine
                Set-Content -Path $profilePath -Value $profileContent
                Write-Host "  ${GREEN}✓${NC} Slack tokens updated in PowerShell profile"
            } else {
                Add-Content -Path $profilePath -Value "`n# Claudia Gateway - Slack`n$sbotLine`n$sappLine"
                Write-Host "  ${GREEN}✓${NC} Slack tokens saved to PowerShell profile"
            }
        } else {
            Write-Host ""
            Write-Host "  ${DIM}Missing some values. When you have all tokens, run:${NC}"
            Write-Host "    ${CYAN}`$env:SLACK_BOT_TOKEN = 'xoxb-...'${NC}"
            Write-Host "    ${CYAN}`$env:SLACK_APP_TOKEN = 'xapp-...'${NC}"
            Write-Host "    ${CYAN}claudia-gateway start${NC}"
        }
    }

    Write-Host ""
    Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    Write-Host ""

    # Show the "How to Use" box if a platform was configured
    if ($platformChoice -eq "1" -or $platformChoice -eq "2") {
        Write-Host "  ${BOLD}${CYAN}How It Works: Two Terminals${NC}"
        Write-Host ""
        Write-Host "  The gateway is a separate program that connects your"
        Write-Host "  chat app (Telegram/Slack) to Claudia. It needs to run"
        Write-Host "  in its own terminal window while you use Claude in another."
        Write-Host ""
        Write-Host "  ${BOLD}Terminal 1 (gateway):${NC}"
        Write-Host "    ${CYAN}claudia-gateway start${NC}"
        Write-Host "    ${DIM}Keep this running. It connects to your bot.${NC}"
        Write-Host ""
        Write-Host "  ${BOLD}Terminal 2 (Claude):${NC}"
        Write-Host "    ${CYAN}cd your-project && claude${NC}"
        Write-Host "    ${DIM}Your normal Claude Code sessions.${NC}"
        Write-Host ""
        Write-Host "  ${YELLOW}!${NC} The gateway must be running before you message the bot."
        Write-Host "    If the gateway is stopped, your bot won't respond."
        Write-Host ""
        Write-Host "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        Write-Host ""
    }
}

Write-Host "${BOLD}Security reminders:${NC}"
Write-Host ""
if (-not $LOCAL_MODEL) {
    Write-Host "  ${YELLOW}□${NC} Set ANTHROPIC_API_KEY as an environment variable"
} else {
    Write-Host "  ${GREEN}✓${NC} Local model $LOCAL_MODEL (no API key needed)"
}
Write-Host "  ${YELLOW}□${NC} Never commit API keys to git or store them in config files"
Write-Host ""
Write-Host "${BOLD}Installed:${NC}"
Write-Host ""
Write-Host "  ${CYAN}◆${NC} Gateway source     ${DIM}$GATEWAY_DIR${NC}"
Write-Host "  ${CYAN}◆${NC} Config             ${DIM}$CONFIG_FILE${NC}"
Write-Host "  ${CYAN}◆${NC} CLI                ${DIM}$wrapperPath${NC}"
Write-Host "  ${CYAN}◆${NC} Logs               ${DIM}$CLAUDIA_DIR\gateway.log${NC}"
if ($PATH_ADDED) {
    Write-Host ""
    Write-Host "  ${YELLOW}!${NC} PATH was updated. Restart your terminal for it to take effect."
}
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
