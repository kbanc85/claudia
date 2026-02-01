#!/bin/bash
# Claudia Gateway Installer
# Sets up the messaging gateway with all dependencies

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Paths
CLAUDIA_DIR="$HOME/.claudia"
GATEWAY_DIR="$CLAUDIA_DIR/gateway"
BIN_DIR="$CLAUDIA_DIR/bin"

# Upgrade mode: skip config generation if config exists
IS_UPGRADE="${CLAUDIA_GATEWAY_UPGRADE:-0}"

# Detect shell rc file (used for PATH and token persistence)
SHELL_RC=""
if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$(basename "$SHELL")" = "bash" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

# Clear screen and show banner
clear

# Claudia pixel art banner (matching the NPX installer)
W='\033[97m'  # white
Y='\033[33m'  # yellow
B='\033[36m'  # cyan/blue

echo ""
echo -e "${B}████${NC}  ${B}██${NC}      ${B}██${NC}    ${B}██${NC}  ${B}██${NC}  ${B}████${NC}    ${B}██${NC}    ${B}██${NC}"
echo -e "${B}██${NC}    ${B}██${NC}    ${B}██${NC}  ${B}██${NC}  ${B}██${NC}  ${B}██${NC}  ${B}██${NC}  ${B}██${NC}  ${B}██${NC}  ${B}██${NC}  ${B}██${NC}"
echo -e "${B}████${NC}  ${B}████${NC}  ${B}██${NC}  ${B}██${NC}    ${B}██${NC}    ${B}████${NC}    ${B}██${NC}  ${B}██${NC}  ${B}██${NC}"
echo ""
echo -e "                ${Y}██████████${NC}"
echo -e "              ${Y}██${W}██████████${Y}██${NC}"
echo -e "              ${Y}██${W}██${NC}  ${W}██${NC}  ${W}██${Y}██${NC}"
echo -e "                ${W}██████████${NC}"
echo -e "                  ${B}██████${NC}"
echo -e "                ${B}██████████${NC}"
echo -e "                  ${W}██${NC}  ${W}██${NC}"
echo ""
echo -e "${DIM}Messaging Gateway Installer${NC}"
echo -e "${DIM}Talk to Claudia from Telegram and Slack${NC}"
echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 1: Check Node.js >= 18
# ============================================================
echo -e "${BOLD}Step 1/6: Environment Check${NC}"
echo

NODE_BIN=""
if command -v node &> /dev/null; then
    NODE_BIN=$(command -v node)
fi

if [ -n "$NODE_BIN" ]; then
    NODE_VERSION=$($NODE_BIN --version 2>&1)
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "  ${GREEN}✓${NC} Node.js $NODE_VERSION"
    else
        echo -e "  ${RED}✗${NC} Node.js 18+ required (found: $NODE_VERSION)"
        echo -e "    ${DIM}Install from https://nodejs.org${NC}"
        exit 1
    fi
else
    echo -e "  ${RED}✗${NC} Node.js not found"
    echo -e "    Please install Node.js 18 or later"
    echo -e "    ${DIM}https://nodejs.org${NC}"
    exit 1
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 2: Copy gateway source to ~/.claudia/gateway/
# ============================================================
echo -e "${BOLD}Step 2/6: Installing Gateway${NC}"
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

mkdir -p "$GATEWAY_DIR"

echo -e "  ${CYAN}◐${NC} Copying gateway files..."
cp -r "$SOURCE_DIR/src" "$GATEWAY_DIR/"
cp "$SOURCE_DIR/package.json" "$GATEWAY_DIR/"
echo -e "  ${GREEN}✓${NC} Gateway source installed"

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 3: npm install --production
# ============================================================
echo -e "${BOLD}Step 3/6: Installing Dependencies${NC}"
echo

echo -e "  ${CYAN}◐${NC} Running npm install (this may take a moment)..."
cd "$GATEWAY_DIR"
npm install --production > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Dependencies installed"
else
    echo -e "  ${RED}✗${NC} npm install failed"
    echo -e "    ${DIM}Try running manually: cd $GATEWAY_DIR && npm install --production${NC}"
    exit 1
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 3.5: Local model check (Ollama)
# ============================================================
echo -e "${BOLD}Step 3.5/6: Local Model${NC}"
echo

LOCAL_MODEL=""
CLAUDIA_CONFIG="$CLAUDIA_DIR/config.json"

# Check if a language model is already configured
if [ -f "$CLAUDIA_CONFIG" ]; then
    LOCAL_MODEL=$(node -e "try{const c=JSON.parse(require('fs').readFileSync('$CLAUDIA_CONFIG','utf8'));console.log(c.language_model||'')}catch{}" 2>/dev/null)
fi

OLLAMA_AVAILABLE=0
if command -v ollama &> /dev/null; then
    if ollama list &> /dev/null; then
        OLLAMA_AVAILABLE=1
    fi
fi

if [ -n "$LOCAL_MODEL" ] && [ "$OLLAMA_AVAILABLE" = "1" ]; then
    # Check if the model is actually pulled
    if ollama list 2>/dev/null | grep -q "^${LOCAL_MODEL}"; then
        echo -e "  ${GREEN}✓${NC} Using ${BOLD}${LOCAL_MODEL}${NC} for chat (no API key needed)"
    else
        echo -e "  ${YELLOW}!${NC} Model ${LOCAL_MODEL} configured but not pulled"
        echo -e "    ${DIM}Run: ollama pull ${LOCAL_MODEL}${NC}"
    fi
elif [ "$OLLAMA_AVAILABLE" = "1" ]; then
    echo -e "  ${CYAN}?${NC} No local language model configured."
    echo -e "    A local model lets you use the gateway without an Anthropic API key."
    echo
    echo -e "  ${BOLD}Pick a model:${NC}"
    echo -e "    ${CYAN}1)${NC} qwen3:4b     ${DIM}(recommended, 2.5GB)${NC}"
    echo -e "    ${CYAN}2)${NC} smollm3:3b   ${DIM}(smaller, 1.7GB)${NC}"
    echo -e "    ${CYAN}3)${NC} llama3.2:3b  ${DIM}(Meta, 2.0GB)${NC}"
    echo -e "    ${CYAN}4)${NC} skip         ${DIM}(use Anthropic API key instead)${NC}"
    echo
    read -p "  Choice [1-4, default=4]: " MODEL_CHOICE

    case "$MODEL_CHOICE" in
        1) LOCAL_MODEL="qwen3:4b" ;;
        2) LOCAL_MODEL="smollm3:3b" ;;
        3) LOCAL_MODEL="llama3.2:3b" ;;
        *) LOCAL_MODEL="" ;;
    esac

    if [ -n "$LOCAL_MODEL" ]; then
        echo
        echo -e "  ${CYAN}◐${NC} Pulling ${LOCAL_MODEL} (this may take a few minutes)..."
        if ollama pull "$LOCAL_MODEL" 2>&1 | tail -1; then
            echo -e "  ${GREEN}✓${NC} Model ${LOCAL_MODEL} ready"

            # Write to shared config
            if [ -f "$CLAUDIA_CONFIG" ]; then
                node -e "
                  const fs = require('fs');
                  const c = JSON.parse(fs.readFileSync('$CLAUDIA_CONFIG','utf8'));
                  c.language_model = '$LOCAL_MODEL';
                  fs.writeFileSync('$CLAUDIA_CONFIG', JSON.stringify(c, null, 2));
                " 2>/dev/null
            else
                echo "{\"language_model\":\"$LOCAL_MODEL\"}" > "$CLAUDIA_CONFIG"
            fi
        else
            echo -e "  ${RED}✗${NC} Failed to pull ${LOCAL_MODEL}"
            LOCAL_MODEL=""
        fi
    else
        echo -e "  ${DIM}  Skipped. You'll need ANTHROPIC_API_KEY to use the gateway.${NC}"
    fi
else
    echo -e "  ${DIM}  Ollama not found. You'll need ANTHROPIC_API_KEY to use the gateway.${NC}"
    echo -e "  ${DIM}  Install Ollama: https://ollama.com${NC}"
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 4: Generate config
# ============================================================
echo -e "${BOLD}Step 4/6: Configuration${NC}"
echo

CONFIG_FILE="$CLAUDIA_DIR/gateway.json"

if [ -f "$CONFIG_FILE" ] && [ "$IS_UPGRADE" = "1" ]; then
    echo -e "  ${GREEN}✓${NC} Existing config preserved"
else
    node "$GATEWAY_DIR/src/index.js" init 2>/dev/null
    echo -e "  ${GREEN}✓${NC} Config created at ~/.claudia/gateway.json"
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 5: Create shell wrapper
# ============================================================
echo -e "${BOLD}Step 5/6: CLI Wrapper${NC}"
echo

mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/claudia-gateway" << 'WRAPPER'
#!/bin/bash
# Claudia Gateway CLI wrapper
exec node "$HOME/.claudia/gateway/src/index.js" "$@"
WRAPPER

chmod +x "$BIN_DIR/claudia-gateway"
echo -e "  ${GREEN}✓${NC} CLI installed at ~/.claudia/bin/claudia-gateway"

# Auto-add to PATH via shell rc file if not already there
PATH_ADDED=0
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    PATH_LINE='export PATH="$HOME/.claudia/bin:$PATH"'

    if [ -n "$SHELL_RC" ]; then
        # Check if already in rc file (even if not in current PATH)
        if [ -f "$SHELL_RC" ] && grep -q '\.claudia/bin' "$SHELL_RC" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} PATH already configured in $(basename "$SHELL_RC")"
        else
            echo "" >> "$SHELL_RC"
            echo "# Claudia CLI" >> "$SHELL_RC"
            echo "$PATH_LINE" >> "$SHELL_RC"
            echo -e "  ${GREEN}✓${NC} PATH added to ~/${SHELL_RC##*/}"
            PATH_ADDED=1
        fi
        # Also add to current session
        export PATH="$HOME/.claudia/bin:$PATH"
    else
        echo -e "  ${YELLOW}!${NC} Add to your PATH manually:"
        echo -e "    ${DIM}${PATH_LINE}${NC}"
    fi
fi

# Create LaunchAgent / systemd unit (disabled by default)
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLIST_DIR="$HOME/Library/LaunchAgents"
    PLIST_FILE="$PLIST_DIR/com.claudia.gateway.plist"
    mkdir -p "$PLIST_DIR"

    cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claudia.gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$GATEWAY_DIR/src/index.js</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$GATEWAY_DIR</string>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>$CLAUDIA_DIR/gateway-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$CLAUDIA_DIR/gateway-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
EOF

    echo -e "  ${GREEN}✓${NC} macOS LaunchAgent created (disabled)"
    echo -e "    ${DIM}Enable after configuring API keys:${NC}"
    echo -e "    ${DIM}launchctl load ~/Library/LaunchAgents/com.claudia.gateway.plist${NC}"

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    SERVICE_DIR="$HOME/.config/systemd/user"
    SERVICE_FILE="$SERVICE_DIR/claudia-gateway.service"
    mkdir -p "$SERVICE_DIR"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Claudia Messaging Gateway
After=network.target

[Service]
Type=simple
ExecStart=$NODE_BIN $GATEWAY_DIR/src/index.js start
WorkingDirectory=$GATEWAY_DIR
Restart=on-failure
RestartSec=10
Environment="PATH=/usr/local/bin:/usr/bin:/bin"

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} systemd service created (disabled)"
    echo -e "    ${DIM}Enable after configuring API keys:${NC}"
    echo -e "    ${DIM}systemctl --user enable --now claudia-gateway${NC}"
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 6: Security checklist and next steps
# ============================================================
echo -e "${BOLD}Step 6/6: What's Next${NC}"
echo

echo -e "${GREEN}"
cat << 'EOF'
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   ✨ Gateway installed successfully! ✨                   ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Offer interactive setup guide
echo -e "  The gateway needs a chat platform (Telegram or Slack) to"
echo -e "  receive your messages. ${BOLD}Want a step-by-step setup guide?${NC}"
echo
read -p "  Show setup guide? [y/n, default=y]: " SHOW_GUIDE
SHOW_GUIDE="${SHOW_GUIDE:-y}"

if [[ "$SHOW_GUIDE" =~ ^[Yy] ]]; then
    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo -e "  ${BOLD}Which platform?${NC}"
    echo -e "    ${CYAN}1)${NC} Telegram   ${DIM}(easiest, 2 minutes)${NC}"
    echo -e "    ${CYAN}2)${NC} Slack      ${DIM}(requires workspace admin)${NC}"
    echo -e "    ${CYAN}3)${NC} Skip       ${DIM}(I'll set it up later)${NC}"
    echo
    read -p "  Choice [1-3, default=1]: " PLATFORM_CHOICE
    PLATFORM_CHOICE="${PLATFORM_CHOICE:-1}"

    if [ "$PLATFORM_CHOICE" = "1" ]; then
        echo
        echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo
        echo -e "  ${BOLD}Telegram Setup${NC}"
        echo
        echo -e "  ${CYAN}Step 1:${NC} Open Telegram and search for ${BOLD}@BotFather${NC}"
        echo -e "          (or tap: ${DIM}https://t.me/BotFather${NC})"
        echo
        echo -e "  ${CYAN}Step 2:${NC} Send ${BOLD}/newbot${NC} to BotFather"
        echo -e "          He'll ask for a display name (anything, e.g. \"My Claudia\")"
        echo -e "          Then a username (must end in 'bot', e.g. \"my_claudia_bot\")"
        echo
        echo -e "  ${CYAN}Step 3:${NC} BotFather will reply with a token like:"
        echo -e "          ${DIM}123456789:ABCdefGHIjklMNOpqrsTUVwxyz${NC}"
        echo -e "          Copy that token."
        echo
        read -p "  Paste your bot token here (or press Enter to skip): " BOT_TOKEN

        if [ -n "$BOT_TOKEN" ]; then
            echo
            echo -e "  ${CYAN}Step 4:${NC} Now get your Telegram user ID."
            echo -e "          Search for ${BOLD}@userinfobot${NC} in Telegram"
            echo -e "          (or tap: ${DIM}https://t.me/userinfobot${NC})"
            echo -e "          Send it any message. It replies with your ID (a number)."
            echo
            while true; do
                read -p "  Paste your user ID here (or press Enter to skip): " USER_ID

                # Empty = skip
                if [ -z "$USER_ID" ]; then
                    break
                fi

                # Strip leading @
                USER_ID="${USER_ID#@}"

                # Validate: must be all digits
                if [[ "$USER_ID" =~ ^[0-9]+$ ]]; then
                    break
                else
                    echo
                    echo -e "  ${RED}✗${NC} That looks like a username, not a numeric ID."
                    echo -e "    Telegram user IDs are numbers only (e.g. ${BOLD}1588190837${NC})."
                    echo -e "    Get yours from ${BOLD}@userinfobot${NC} in Telegram."
                    echo
                fi
            done

            if [ -n "$USER_ID" ]; then
                # Write the config
                node -e "
                  const fs = require('fs');
                  const path = '$CONFIG_FILE';
                  let c = {};
                  try { c = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
                  if (!c.channels) c.channels = {};
                  if (!c.channels.telegram) c.channels.telegram = {};
                  c.channels.telegram.enabled = true;
                  c.channels.telegram.allowedUsers = ['$USER_ID'];
                  fs.writeFileSync(path, JSON.stringify(c, null, 2));
                " 2>/dev/null

                echo
                echo -e "  ${GREEN}✓${NC} Telegram configured in gateway.json"
                echo -e "  ${GREEN}✓${NC} User ${USER_ID} added to allowlist"
                echo

                # Export the token for this session
                export TELEGRAM_BOT_TOKEN="$BOT_TOKEN"

                # Auto-persist token to shell rc file
                TOKEN_LINE="export TELEGRAM_BOT_TOKEN=\"$BOT_TOKEN\""
                if [ -n "$SHELL_RC" ]; then
                    if [ -f "$SHELL_RC" ] && grep -q 'TELEGRAM_BOT_TOKEN' "$SHELL_RC" 2>/dev/null; then
                        # Replace existing line
                        sed -i.bak "s|^export TELEGRAM_BOT_TOKEN=.*|$TOKEN_LINE|" "$SHELL_RC" && rm -f "${SHELL_RC}.bak"
                        echo -e "  ${GREEN}✓${NC} Bot token updated in ~/${SHELL_RC##*/}"
                    else
                        echo "" >> "$SHELL_RC"
                        echo "# Claudia Gateway - Telegram" >> "$SHELL_RC"
                        echo "$TOKEN_LINE" >> "$SHELL_RC"
                        echo -e "  ${GREEN}✓${NC} Bot token saved to ~/${SHELL_RC##*/}"
                    fi

                    echo
                    echo -e "  ${YELLOW}┌─────────────────────────────────────────────────┐${NC}"
                    echo -e "  ${YELLOW}│${NC}  ${BOLD}Open a NEW terminal${NC} to run the gateway.         ${YELLOW}│${NC}"
                    echo -e "  ${YELLOW}│${NC}  This terminal doesn't have your token yet.      ${YELLOW}│${NC}"
                    echo -e "  ${YELLOW}│${NC}                                                   ${YELLOW}│${NC}"
                    echo -e "  ${YELLOW}│${NC}  Or run in this terminal first:                   ${YELLOW}│${NC}"
                    echo -e "  ${YELLOW}│${NC}    ${CYAN}source ~/${SHELL_RC##*/}${NC}                          ${YELLOW}│${NC}"
                    echo -e "  ${YELLOW}└─────────────────────────────────────────────────┘${NC}"
                else
                    echo -e "  ${YELLOW}!${NC} Add this to your shell profile to persist the token:"
                    echo -e "    ${DIM}${TOKEN_LINE}${NC}"
                fi
            else
                echo
                echo -e "  ${YELLOW}!${NC} Skipped user ID. You'll need to add it manually:"
                echo -e "    ${DIM}Edit ~/.claudia/gateway.json and set:"
                echo -e "    channels.telegram.allowedUsers = [\"YOUR_USER_ID\"]${NC}"
            fi
        else
            echo
            echo -e "  ${DIM}No worries. When you have your token, run:${NC}"
            echo -e "    ${CYAN}export TELEGRAM_BOT_TOKEN=\"your-token-here\"${NC}"
            echo -e "    ${CYAN}claudia-gateway start${NC}"
        fi

    elif [ "$PLATFORM_CHOICE" = "2" ]; then
        echo
        echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo
        echo -e "  ${BOLD}Slack Setup${NC}"
        echo
        echo -e "  ${CYAN}Step 1:${NC} Go to ${BOLD}https://api.slack.com/apps${NC}"
        echo -e "          Click ${BOLD}Create New App${NC} > ${BOLD}From scratch${NC}"
        echo -e "          Pick a name and workspace."
        echo
        echo -e "  ${CYAN}Step 2:${NC} Enable ${BOLD}Socket Mode${NC} (in Settings sidebar)"
        echo -e "          This generates an app-level token (starts with ${DIM}xapp-${NC})"
        echo -e "          Name it anything (e.g. \"claudia-socket\"). Copy it."
        echo
        echo -e "  ${CYAN}Step 3:${NC} Go to ${BOLD}OAuth & Permissions${NC}. Add these bot token scopes:"
        echo -e "          ${DIM}app_mentions:read, chat:write, im:history, im:read, im:write${NC}"
        echo
        echo -e "  ${CYAN}Step 4:${NC} Go to ${BOLD}Event Subscriptions${NC}. Enable events."
        echo -e "          Subscribe to: ${DIM}message.im${NC} and ${DIM}app_mention${NC}"
        echo
        echo -e "  ${CYAN}Step 5:${NC} Click ${BOLD}Install to Workspace${NC} (in sidebar or OAuth page)"
        echo -e "          This generates a bot token (starts with ${DIM}xoxb-${NC}). Copy it."
        echo
        echo -e "  ${CYAN}Step 6:${NC} Get your Slack user ID:"
        echo -e "          Click your profile picture > ${BOLD}Profile${NC} > ${BOLD}...${NC} (more) > ${BOLD}Copy member ID${NC}"
        echo
        read -p "  Paste your bot token (xoxb-...): " SLACK_BOT
        read -p "  Paste your app token (xapp-...): " SLACK_APP
        read -p "  Paste your user ID (U...): " SLACK_USER

        if [ -n "$SLACK_BOT" ] && [ -n "$SLACK_APP" ] && [ -n "$SLACK_USER" ]; then
            node -e "
              const fs = require('fs');
              const path = '$CONFIG_FILE';
              let c = {};
              try { c = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
              if (!c.channels) c.channels = {};
              if (!c.channels.slack) c.channels.slack = {};
              c.channels.slack.enabled = true;
              c.channels.slack.allowedUsers = ['$SLACK_USER'];
              fs.writeFileSync(path, JSON.stringify(c, null, 2));
            " 2>/dev/null

            # Export tokens for this session
            export SLACK_BOT_TOKEN="$SLACK_BOT"
            export SLACK_APP_TOKEN="$SLACK_APP"

            echo
            echo -e "  ${GREEN}✓${NC} Slack configured in gateway.json"
            echo -e "  ${GREEN}✓${NC} User ${SLACK_USER} added to allowlist"

            # Auto-persist tokens to shell rc file
            SBOT_LINE="export SLACK_BOT_TOKEN=\"$SLACK_BOT\""
            SAPP_LINE="export SLACK_APP_TOKEN=\"$SLACK_APP\""
            if [ -n "$SHELL_RC" ]; then
                if [ -f "$SHELL_RC" ] && grep -q 'SLACK_BOT_TOKEN' "$SHELL_RC" 2>/dev/null; then
                    sed -i.bak "s|^export SLACK_BOT_TOKEN=.*|$SBOT_LINE|" "$SHELL_RC" && rm -f "${SHELL_RC}.bak"
                    sed -i.bak "s|^export SLACK_APP_TOKEN=.*|$SAPP_LINE|" "$SHELL_RC" && rm -f "${SHELL_RC}.bak"
                    echo -e "  ${GREEN}✓${NC} Slack tokens updated in ~/${SHELL_RC##*/}"
                else
                    echo "" >> "$SHELL_RC"
                    echo "# Claudia Gateway - Slack" >> "$SHELL_RC"
                    echo "$SBOT_LINE" >> "$SHELL_RC"
                    echo "$SAPP_LINE" >> "$SHELL_RC"
                    echo -e "  ${GREEN}✓${NC} Slack tokens saved to ~/${SHELL_RC##*/}"
                fi
            else
                echo -e "  ${YELLOW}!${NC} Add these to your shell profile to persist the tokens:"
                echo -e "    ${DIM}${SBOT_LINE}${NC}"
                echo -e "    ${DIM}${SAPP_LINE}${NC}"
            fi
        else
            echo
            echo -e "  ${DIM}Missing some values. When you have all tokens, run:${NC}"
            echo -e "    ${CYAN}export SLACK_BOT_TOKEN=\"xoxb-...\"${NC}"
            echo -e "    ${CYAN}export SLACK_APP_TOKEN=\"xapp-...\"${NC}"
            echo -e "    ${CYAN}claudia-gateway start${NC}"
        fi
    fi

    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo

    # Show the "How to Use" box if a platform was configured
    if [ "$PLATFORM_CHOICE" = "1" ] || [ "$PLATFORM_CHOICE" = "2" ]; then
        echo -e "  ${BOLD}${CYAN}How It Works: Two Terminals${NC}"
        echo
        echo -e "  The gateway is a separate program that connects your"
        echo -e "  chat app (Telegram/Slack) to Claudia. It needs to run"
        echo -e "  in its own terminal window while you use Claude in another."
        echo
        echo -e "  ${BOLD}Terminal 1 (gateway):${NC}"
        echo -e "    ${CYAN}claudia-gateway start${NC}"
        echo -e "    ${DIM}Keep this running. It connects to your bot.${NC}"
        echo
        echo -e "  ${BOLD}Terminal 2 (Claude):${NC}"
        echo -e "    ${CYAN}cd your-project && claude${NC}"
        echo -e "    ${DIM}Your normal Claude Code sessions.${NC}"
        echo
        echo -e "  ${YELLOW}!${NC} The gateway must be running before you message the bot."
        echo -e "    If the gateway is stopped, your bot won't respond."
        echo
        echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo
    fi
fi

echo -e "${BOLD}Security reminders:${NC}"
echo
if [ -z "$LOCAL_MODEL" ]; then
    echo -e "  ${YELLOW}□${NC} Set ANTHROPIC_API_KEY as an environment variable"
else
    echo -e "  ${GREEN}✓${NC} Local model ${LOCAL_MODEL} (no API key needed)"
fi
echo -e "  ${YELLOW}□${NC} Never commit API keys to git or store them in config files"
echo
echo -e "${BOLD}Installed:${NC}"
echo
echo -e "  ${CYAN}◆${NC} Gateway source     ${DIM}$GATEWAY_DIR${NC}"
echo -e "  ${CYAN}◆${NC} Config             ${DIM}~/.claudia/gateway.json${NC}"
echo -e "  ${CYAN}◆${NC} CLI                ${DIM}~/.claudia/bin/claudia-gateway${NC}"
echo -e "  ${CYAN}◆${NC} Logs               ${DIM}~/.claudia/gateway.log${NC}"
if [ "$PATH_ADDED" = "1" ]; then
    echo
    echo -e "  ${YELLOW}!${NC} PATH was updated. Run ${BOLD}source ~/${SHELL_RC##*/}${NC} or open a new terminal."
fi
echo
echo -e "${BOLD}CLI commands:${NC}"
echo
echo -e "  ${DIM}claudia-gateway start${NC}     Start the gateway"
echo -e "  ${DIM}claudia-gateway stop${NC}      Stop the gateway"
echo -e "  ${DIM}claudia-gateway status${NC}    Check status"
echo -e "  ${DIM}claudia-gateway logs${NC}      View recent logs"
echo
echo -e "${MAGENTA}${DIM}\"Now you can reach me anywhere.\" -- Claudia${NC}"
echo
