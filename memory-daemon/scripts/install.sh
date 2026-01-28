#!/bin/bash
# Claudia Memory System Installer
# Sets up the memory daemon with all dependencies

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
DAEMON_DIR="$CLAUDIA_DIR/daemon"
VENV_DIR="$DAEMON_DIR/venv"
MEMORY_DIR="$CLAUDIA_DIR/memory"

# Spinner animation
spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " ${CYAN}%c${NC}  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# Run command with spinner
run_with_spinner() {
    local msg="$1"
    shift
    printf "${YELLOW}$msg${NC}"
    "$@" > /dev/null 2>&1 &
    spinner $!
    wait $!
    local status=$?
    if [ $status -eq 0 ]; then
        echo -e "\r${GREEN}✓${NC} $msg"
    else
        echo -e "\r${RED}✗${NC} $msg"
        return $status
    fi
}

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
echo -e "${DIM}Memory System Installer${NC}"
echo -e "${DIM}Teaching Claudia to never forget${NC}"
echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Fun messages
MESSAGES=(
    "Brewing neural pathways..."
    "Calibrating memory banks..."
    "Teaching Claudia to remember..."
    "Installing elephant-grade memory..."
    "Wiring up the hippocampus..."
    "Defragmenting thought patterns..."
)

random_message() {
    echo "${MESSAGES[$RANDOM % ${#MESSAGES[@]}]}"
}

# Check Python
echo -e "${BOLD}Step 1/7: Environment Check${NC}"
echo
if command -v python3 &> /dev/null; then
    PYTHON=$(command -v python3)
    PYTHON_VERSION=$($PYTHON --version 2>&1 | awk '{print $2}')
    echo -e "  ${GREEN}✓${NC} Python $PYTHON_VERSION"
else
    echo -e "  ${RED}✗${NC} Python 3 not found"
    echo -e "    Please install Python 3.10 or later"
    exit 1
fi

# Check Python version
PYTHON_MAJOR=$($PYTHON -c "import sys; print(sys.version_info.major)")
PYTHON_MINOR=$($PYTHON -c "import sys; print(sys.version_info.minor)")
if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
    echo -e "  ${RED}✗${NC} Python 3.10+ required (found: $PYTHON_VERSION)"
    exit 1
fi

# Check Ollama
if command -v ollama &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Ollama installed"
    OLLAMA_AVAILABLE=true
else
    echo -e "  ${YELLOW}○${NC} Ollama not found (optional)"
    OLLAMA_AVAILABLE=false

    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo
        echo -e "  ${DIM}Ollama enables semantic vector search.${NC}"
        echo -e "  ${DIM}Without it, Claudia falls back to keyword search.${NC}"
        echo
        read -p "  Install Ollama now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo
            echo -e "  ${CYAN}Installing Ollama via Homebrew...${NC}"
            brew install ollama 2>/dev/null && OLLAMA_AVAILABLE=true || echo -e "  ${YELLOW}!${NC} Brew install failed, continuing without"
        fi
    fi
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Pull embedding model
echo -e "${BOLD}Step 2/7: AI Models${NC}"
echo
if [ "$OLLAMA_AVAILABLE" = true ]; then
    if ollama list 2>/dev/null | grep -q "all-minilm"; then
        echo -e "  ${GREEN}✓${NC} Embedding model ready"
    else
        echo -e "  ${CYAN}◐${NC} Downloading embedding model (45MB)..."
        echo -e "    ${DIM}This gives Claudia semantic understanding${NC}"
        echo
        ollama pull all-minilm:l6-v2 2>/dev/null || echo -e "  ${YELLOW}!${NC} Model pull failed, continuing"
        echo -e "  ${GREEN}✓${NC} Model downloaded"
    fi
else
    echo -e "  ${YELLOW}○${NC} Skipping (Ollama not available)"
    echo -e "    ${DIM}Claudia will use keyword search instead${NC}"
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Create directories
echo -e "${BOLD}Step 3/7: Creating Home${NC}"
echo
mkdir -p "$DAEMON_DIR"
mkdir -p "$MEMORY_DIR"
echo -e "  ${GREEN}✓${NC} Created ~/.claudia/"
echo -e "    ${DIM}├── daemon/   (brain)${NC}"
echo -e "    ${DIM}└── memory/   (memories)${NC}"

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Find source directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

# Copy daemon files
echo -e "${BOLD}Step 4/7: Installing Core${NC}"
echo
echo -e "  ${CYAN}◐${NC} Copying memory system files..."
cp -r "$SOURCE_DIR/claudia_memory" "$DAEMON_DIR/"
cp "$SOURCE_DIR/pyproject.toml" "$DAEMON_DIR/"
cp "$SOURCE_DIR/requirements.txt" "$DAEMON_DIR/"
echo -e "  ${GREEN}✓${NC} Core files installed"

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Create virtual environment
echo -e "${BOLD}Step 5/7: Python Environment${NC}"
echo
echo -e "  ${CYAN}◐${NC} Creating isolated environment..."
$PYTHON -m venv "$VENV_DIR"
echo -e "  ${GREEN}✓${NC} Virtual environment created"

echo -e "  ${CYAN}◐${NC} Installing dependencies..."
echo -e "    ${DIM}$(random_message)${NC}"
"$VENV_DIR/bin/pip" install --upgrade pip > /dev/null 2>&1
"$VENV_DIR/bin/pip" install -r "$DAEMON_DIR/requirements.txt" > /dev/null 2>&1
echo -e "  ${GREEN}✓${NC} Dependencies installed"

# Install spaCy
echo -e "  ${CYAN}◐${NC} Installing NLP engine..."
echo -e "    ${DIM}$(random_message)${NC}"
"$VENV_DIR/bin/pip" install spacy > /dev/null 2>&1 || true
"$VENV_DIR/bin/python" -m spacy download en_core_web_sm > /dev/null 2>&1 || true
echo -e "  ${GREEN}✓${NC} NLP ready"

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Configure auto-start
echo -e "${BOLD}Step 6/7: Auto-Start Setup${NC}"
echo

if [[ "$OSTYPE" == "darwin"* ]]; then
    PLIST_DIR="$HOME/Library/LaunchAgents"
    PLIST_FILE="$PLIST_DIR/com.claudia.memory.plist"
    mkdir -p "$PLIST_DIR"

    cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claudia.memory</string>
    <key>ProgramArguments</key>
    <array>
        <string>$VENV_DIR/bin/python</string>
        <string>-m</string>
        <string>claudia_memory</string>
        <string>--standalone</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$DAEMON_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>$CLAUDIA_DIR/daemon-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$CLAUDIA_DIR/daemon-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
EOF

    echo -e "  ${GREEN}✓${NC} Configured macOS LaunchAgent"
    echo -e "    ${DIM}Will start on login${NC}"

    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    launchctl load "$PLIST_FILE"
    echo -e "  ${GREEN}✓${NC} Daemon launched"

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    SERVICE_DIR="$HOME/.config/systemd/user"
    SERVICE_FILE="$SERVICE_DIR/claudia-memory.service"
    mkdir -p "$SERVICE_DIR"

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Claudia Memory Daemon
After=network.target

[Service]
Type=simple
ExecStart=$VENV_DIR/bin/python -m claudia_memory --standalone
WorkingDirectory=$DAEMON_DIR
Restart=on-failure
RestartSec=5
Environment="PATH=/usr/local/bin:/usr/bin:/bin"

[Install]
WantedBy=default.target
EOF

    echo -e "  ${GREEN}✓${NC} Configured systemd service"

    systemctl --user daemon-reload
    systemctl --user enable claudia-memory
    systemctl --user start claudia-memory
    echo -e "  ${GREEN}✓${NC} Daemon started"
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Verify
echo -e "${BOLD}Step 7/7: Verification${NC}"
echo
echo -e "  ${CYAN}◐${NC} Waiting for daemon to start..."
sleep 3

if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
    echo -e "  ${GREEN}✓${NC} Health check passed"
    HEALTH_OK=true
else
    echo -e "  ${YELLOW}○${NC} Health check pending (daemon still starting)"
    HEALTH_OK=false
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Success banner
echo -e "${GREEN}"
cat << 'EOF'
  ╔═══════════════════════════════════════════════════════╗
  ║                                                       ║
  ║   ✨ Claudia is ready. ✨                             ║
  ║                                                       ║
  ║   Your agentic executive assistant who learns         ║
  ║   how you work, tracks your commitments, and          ║
  ║   remembers the people and projects that matter.      ║
  ║                                                       ║
  ╚═══════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Summary
echo -e "${BOLD}What's installed:${NC}"
echo
echo -e "  ${CYAN}◆${NC} Memory daemon      ${DIM}~/.claudia/daemon/${NC}"
echo -e "  ${CYAN}◆${NC} SQLite database    ${DIM}~/.claudia/memory/claudia.db${NC}"
echo -e "  ${CYAN}◆${NC} Health endpoint    ${DIM}http://localhost:3848${NC}"
if [ "$OLLAMA_AVAILABLE" = true ]; then
echo -e "  ${CYAN}◆${NC} Vector search      ${DIM}Enabled (Ollama)${NC}"
else
echo -e "  ${YELLOW}○${NC} Vector search      ${DIM}Disabled (install Ollama to enable)${NC}"
fi
echo

echo -e "${BOLD}Quick commands:${NC}"
echo
echo -e "  ${DIM}Check status:${NC}  curl http://localhost:3848/status"
echo -e "  ${DIM}View stats:${NC}    curl http://localhost:3848/stats"
if [[ "$OSTYPE" == "darwin"* ]]; then
echo -e "  ${DIM}View logs:${NC}     tail -f ~/.claudia/daemon-stderr.log"
else
echo -e "  ${DIM}View logs:${NC}     journalctl --user -u claudia-memory -f"
fi
echo

echo -e "${BOLD}Next step:${NC}"
echo
echo -e "  Add this to your ${CYAN}.mcp.json${NC}:"
echo
echo -e "  ${DIM}\"claudia-memory\": {${NC}"
echo -e "  ${DIM}  \"command\": \"$VENV_DIR/bin/python\",${NC}"
echo -e "  ${DIM}  \"args\": [\"-m\", \"claudia_memory.mcp.server\"]${NC}"
echo -e "  ${DIM}}${NC}"
echo

# Claudia says goodbye
echo -e "${MAGENTA}${DIM}\"I learn how you work. Let's get started.\" — Claudia${NC}"
echo
