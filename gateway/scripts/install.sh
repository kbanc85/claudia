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

# Add to PATH hint if not already there
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo -e "  ${YELLOW}!${NC} Add to your PATH if not already present:"
    echo -e "    ${DIM}export PATH=\"\$HOME/.claudia/bin:\$PATH\"${NC}"
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

echo -e "${BOLD}Security checklist (do these before starting):${NC}"
echo
if [ -z "$LOCAL_MODEL" ]; then
    echo -e "  ${YELLOW}□${NC} Set ANTHROPIC_API_KEY as an environment variable"
else
    echo -e "  ${GREEN}✓${NC} Local model ${LOCAL_MODEL} configured (no API key needed)"
    echo -e "  ${DIM}    Set ANTHROPIC_API_KEY to use Claude instead${NC}"
fi
echo -e "  ${YELLOW}□${NC} Set TELEGRAM_BOT_TOKEN (or SLACK_BOT_TOKEN + SLACK_APP_TOKEN)"
echo -e "  ${YELLOW}□${NC} Add your user ID(s) to allowedUsers in gateway.json"
echo -e "  ${YELLOW}□${NC} Never commit API keys to git or store them in gateway.json"
echo
echo -e "${BOLD}Quick start:${NC}"
echo
if [ -z "$LOCAL_MODEL" ]; then
    echo -e "  ${CYAN}1.${NC} export ANTHROPIC_API_KEY=sk-ant-..."
    echo -e "  ${CYAN}2.${NC} export TELEGRAM_BOT_TOKEN=123456:ABC..."
    echo -e "  ${CYAN}3.${NC} Edit ~/.claudia/gateway.json (enable channel, set allowedUsers)"
    echo -e "  ${CYAN}4.${NC} claudia-gateway start"
else
    echo -e "  ${CYAN}1.${NC} export TELEGRAM_BOT_TOKEN=123456:ABC..."
    echo -e "  ${CYAN}2.${NC} Edit ~/.claudia/gateway.json (enable channel, set allowedUsers)"
    echo -e "  ${CYAN}3.${NC} claudia-gateway start"
fi
echo
echo -e "${BOLD}Installed:${NC}"
echo
echo -e "  ${CYAN}◆${NC} Gateway source     ${DIM}$GATEWAY_DIR${NC}"
echo -e "  ${CYAN}◆${NC} Config             ${DIM}~/.claudia/gateway.json${NC}"
echo -e "  ${CYAN}◆${NC} CLI                ${DIM}~/.claudia/bin/claudia-gateway${NC}"
echo -e "  ${CYAN}◆${NC} Logs               ${DIM}~/.claudia/gateway.log${NC}"
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
