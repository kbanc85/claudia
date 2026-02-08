#!/bin/bash
# Claudia Relay Installer
# Sets up the Telegram relay with all dependencies

set -e

# Skip interactive elements (set by parent installer)
SKIP_SETUP="${CLAUDIA_RELAY_SKIP_SETUP:-0}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Paths
CLAUDIA_DIR="$HOME/.claudia"
RELAY_DIR="$CLAUDIA_DIR/relay"
BIN_DIR="$CLAUDIA_DIR/bin"

# Upgrade mode: preserve existing config
IS_UPGRADE="${CLAUDIA_RELAY_UPGRADE:-0}"

# Detect shell rc file
SHELL_RC=""
if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$(basename "$SHELL")" = "bash" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

# Banner (skip clear when called from parent installer)
if [ "$SKIP_SETUP" != "1" ]; then
    clear
    echo ""
    echo -e "${CYAN}████${NC}  ${CYAN}██${NC}      ${CYAN}██${NC}    ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}████${NC}    ${CYAN}██${NC}    ${CYAN}██${NC}"
    echo -e "${CYAN}██${NC}    ${CYAN}██${NC}    ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}"
    echo -e "${CYAN}████${NC}  ${CYAN}████${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}    ${CYAN}██${NC}    ${CYAN}████${NC}    ${CYAN}██${NC}  ${CYAN}██${NC}  ${CYAN}██${NC}"
    echo ""
    echo -e "${DIM}Telegram Relay Installer${NC}"
    echo -e "${DIM}Talk to Claudia via Telegram using full Claude Code agent${NC}"
    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
fi

# ============================================================
# Step 1: Check Node.js >= 18
# ============================================================
echo -e "${BOLD}Step 1/4: Environment Check${NC}"
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

# Check Claude CLI
if command -v claude &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Claude CLI found"
else
    echo -e "  ${YELLOW}!${NC} Claude CLI not found in PATH"
    echo -e "    ${DIM}The relay requires Claude Code: https://docs.anthropic.com/en/docs/claude-code${NC}"
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 2: Copy relay source to ~/.claudia/relay/
# ============================================================
echo -e "${BOLD}Step 2/4: Installing Relay${NC}"
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

mkdir -p "$RELAY_DIR"

echo -e "  ${CYAN}◐${NC} Copying relay files..."
cp -r "$SOURCE_DIR/src" "$RELAY_DIR/"
cp "$SOURCE_DIR/package.json" "$RELAY_DIR/"
if [ -f "$SOURCE_DIR/.gitignore" ]; then
    cp "$SOURCE_DIR/.gitignore" "$RELAY_DIR/"
fi
echo -e "  ${GREEN}✓${NC} Relay source installed"

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 3: npm install --production
# ============================================================
echo -e "${BOLD}Step 3/4: Installing Dependencies${NC}"
echo

echo -e "  ${CYAN}◐${NC} Running npm install (this may take a moment)..."
cd "$RELAY_DIR"
npm install --production > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Dependencies installed"
else
    echo -e "  ${RED}✗${NC} npm install failed"
    echo -e "    ${DIM}Try running manually: cd $RELAY_DIR && npm install --production${NC}"
    exit 1
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 4: Create CLI wrapper + service
# ============================================================
echo -e "${BOLD}Step 4/4: CLI Wrapper${NC}"
echo

mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/claudia-relay" << 'WRAPPER'
#!/bin/bash
# Claudia Relay CLI wrapper
exec node "$HOME/.claudia/relay/src/index.js" "$@"
WRAPPER

chmod +x "$BIN_DIR/claudia-relay"
echo -e "  ${GREEN}✓${NC} CLI installed at ~/.claudia/bin/claudia-relay"

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
    PLIST_FILE="$PLIST_DIR/com.claudia.relay.plist"
    mkdir -p "$PLIST_DIR"

    cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claudia.relay</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$RELAY_DIR/src/index.js</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$RELAY_DIR</string>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>$CLAUDIA_DIR/relay-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$CLAUDIA_DIR/relay-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
EOF

    echo -e "  ${GREEN}✓${NC} macOS LaunchAgent created (disabled)"
    echo -e "    ${DIM}Enable after configuring: launchctl load ~/Library/LaunchAgents/com.claudia.relay.plist${NC}"

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    SERVICE_DIR="$HOME/.config/systemd/user"
    SERVICE_FILE="$SERVICE_DIR/claudia-relay.service"
    mkdir -p "$SERVICE_DIR"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Claudia Telegram Relay
After=network.target

[Service]
Type=simple
ExecStart=$NODE_BIN $RELAY_DIR/src/index.js start
WorkingDirectory=$RELAY_DIR
Restart=on-failure
RestartSec=10
Environment="PATH=/usr/local/bin:/usr/bin:/bin"

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} systemd service created (disabled)"
    echo -e "    ${DIM}Enable after configuring: systemctl --user enable --now claudia-relay${NC}"
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Final summary
echo -e "${BOLD}Installed:${NC}"
echo
echo -e "  ${CYAN}◆${NC} Relay source       ${DIM}$RELAY_DIR${NC}"
echo -e "  ${CYAN}◆${NC} Config             ${DIM}~/.claudia/relay.json (create via /setup-telegram)${NC}"
echo -e "  ${CYAN}◆${NC} CLI                ${DIM}~/.claudia/bin/claudia-relay${NC}"
echo -e "  ${CYAN}◆${NC} Logs               ${DIM}~/.claudia/relay-stderr.log${NC}"
if [ "$PATH_ADDED" = "1" ]; then
    echo
    echo -e "  ${YELLOW}!${NC} PATH was updated. Run ${BOLD}source ~/${SHELL_RC##*/}${NC} or open a new terminal."
fi
echo
echo -e "${BOLD}Next steps:${NC}"
echo
echo -e "  Run ${CYAN}/setup-telegram${NC} inside Claude Code for guided setup,"
echo -e "  or configure manually:"
echo
echo -e "  ${DIM}claudia-relay start${NC}     Start the relay"
echo -e "  ${DIM}claudia-relay stop${NC}      Stop the relay"
echo -e "  ${DIM}claudia-relay status${NC}    Check status"
echo
echo -e "${MAGENTA}${DIM}\"Now you can reach me anywhere.\" -- Claudia${NC}"
echo
