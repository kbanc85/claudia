#!/bin/bash
# Claudia Memory System Installer
# Sets up the memory daemon with all dependencies

set -e

# Non-interactive mode (set by parent installer)
NONINTERACTIVE="${CLAUDIA_NONINTERACTIVE:-0}"

# Embedded mode: only emit STATUS:/ERROR: lines (for programmatic consumers)
EMBEDDED="${CLAUDIA_EMBEDDED:-0}"

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
    if [ "$EMBEDDED" = "1" ]; then
        "$@" > /dev/null 2>&1
        return $?
    fi
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

# Embedded mode emitters
emit_status() {
    local step="$1" state="$2" detail="$3"
    [ "$EMBEDDED" = "1" ] && echo "STATUS:${step}:${state}:${detail}" || true
}
emit_error() {
    local step="$1" detail="$2"
    [ "$EMBEDDED" = "1" ] && echo "ERROR:${step}:${detail}" || true
}

# Clear screen and show banner (skip clear when called from parent installer)
if [ "$NONINTERACTIVE" != "1" ] && [ "$EMBEDDED" != "1" ]; then
    clear
fi

if [ "$EMBEDDED" != "1" ]; then
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
fi

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
    if [ "$EMBEDDED" = "1" ]; then
        echo ""
        return
    fi
    echo "${MESSAGES[$RANDOM % ${#MESSAGES[@]}]}"
}

# Check Python - prefer Homebrew Python on macOS (supports SQLite extensions)
# Avoid Python 3.14+ where spaCy/Pydantic V1 are incompatible
if [ "$EMBEDDED" != "1" ]; then
    echo -e "${BOLD}Step 1/8: Environment Check${NC}"
    echo
fi
emit_status "environment" "progress" "Checking environment..."
PYTHON=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Homebrew Python supports SQLite extension loading (needed for vector search)
    # Prefer 3.13 over 3.14+ (spaCy's Pydantic V1 dependency doesn't support 3.14 yet)
    _pick_homebrew_python() {
        local candidate="$1"
        if [ -x "$candidate" ]; then
            local minor
            minor=$("$candidate" -c "import sys; print(sys.version_info.minor)" 2>/dev/null)
            # Verify SQLite extension support (only Homebrew Python has this on macOS)
            if ! "$candidate" -c "import sqlite3; sqlite3.connect(':memory:').enable_load_extension(True)" 2>/dev/null; then
                return 1
            fi
            if [ -n "$minor" ] && [ "$minor" -lt 14 ]; then
                PYTHON="$candidate"
                return 0
            fi
        fi
        return 1
    }

    # Try versioned 3.13 first (Homebrew keeps it alongside 3.14)
    # Check both symlinks and Cellar paths (symlinks may not exist for non-default versions)
    _pick_homebrew_python "/opt/homebrew/bin/python3.13" ||
    _pick_homebrew_python "/usr/local/bin/python3.13" ||
    {
        # Search Homebrew Cellar for python@3.13 (ARM and Intel paths)
        for cellar_path in /opt/homebrew/Cellar/python@3.13/*/bin/python3.13 \
                           /usr/local/Cellar/python@3.13/*/bin/python3.13; do
            _pick_homebrew_python "$cellar_path" && break
        done
    } ||
    # Fall back to unversioned python3 even if 3.14+
    _pick_homebrew_python "/opt/homebrew/bin/python3" ||
    _pick_homebrew_python "/usr/local/bin/python3" || true

    # If all Homebrew candidates are 3.14+, still use Homebrew for SQLite support
    if [ -z "$PYTHON" ]; then
        if [ -x "/opt/homebrew/bin/python3" ]; then
            PYTHON="/opt/homebrew/bin/python3"
        elif [ -x "/usr/local/bin/python3" ]; then
            PYTHON="/usr/local/bin/python3"
        fi
    fi

    if [ -n "$PYTHON" ]; then
        [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Using Homebrew Python (vector search supported)"
    fi
fi

if [ -z "$PYTHON" ]; then
    if command -v python3 &> /dev/null; then
        PYTHON=$(command -v python3)
    fi
fi

if [ -n "$PYTHON" ]; then
    PYTHON_VERSION=$($PYTHON --version 2>&1 | awk '{print $2}')
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Python $PYTHON_VERSION ($PYTHON)"
else
    if [ "$EMBEDDED" != "1" ]; then
        echo -e "  ${RED}✗${NC} Python 3 not found"
        echo -e "    Please install Python 3.10 or later"
        echo -e "    ${DIM}On macOS: brew install python${NC}"
    fi
    emit_error "environment" "Python 3.10+ required"
    exit 1
fi

# Check Python version
PYTHON_MAJOR=$($PYTHON -c "import sys; print(sys.version_info.major)")
PYTHON_MINOR=$($PYTHON -c "import sys; print(sys.version_info.minor)")
if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
    [ "$EMBEDDED" != "1" ] && echo -e "  ${RED}✗${NC} Python 3.10+ required (found: $PYTHON_VERSION)"
    emit_error "environment" "Python 3.10+ required (found: $PYTHON_VERSION)"
    exit 1
fi

# Check Ollama
if command -v ollama &> /dev/null; then
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Ollama installed"
    OLLAMA_AVAILABLE=true
else
    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}○${NC} Ollama not found"
    OLLAMA_AVAILABLE=false

    if [ "$NONINTERACTIVE" = "1" ] || [ "$EMBEDDED" = "1" ]; then
        # Auto-install Ollama in non-interactive/embedded mode
        [ "$EMBEDDED" != "1" ] && echo -e "  ${CYAN}Installing Ollama automatically...${NC}"
        if [[ "$OSTYPE" == "darwin"* ]] && command -v brew &> /dev/null; then
            [ "$EMBEDDED" != "1" ] && echo -e "  ${CYAN}Installing Ollama via Homebrew...${NC}"
            brew install ollama 2>/dev/null && OLLAMA_AVAILABLE=true
        fi

        if [ "$OLLAMA_AVAILABLE" = false ]; then
            [ "$EMBEDDED" != "1" ] && echo -e "  ${CYAN}Installing Ollama...${NC}"
            curl -fsSL https://ollama.com/install.sh | sh 2>/dev/null && OLLAMA_AVAILABLE=true
        fi

        if [ "$OLLAMA_AVAILABLE" = true ]; then
            [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Ollama installed"
        else
            [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} Ollama auto-install failed, continuing without"
            [ "$EMBEDDED" != "1" ] && echo -e "  ${DIM}Install manually: https://ollama.com/download${NC}"
        fi
    else
        echo
        echo -e "  ${DIM}Ollama enables semantic vector search.${NC}"
        echo -e "  ${DIM}Without it, Claudia falls back to keyword search.${NC}"
        echo
        read -p "  Install Ollama now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo
            if [[ "$OSTYPE" == "darwin"* ]] && command -v brew &> /dev/null; then
                echo -e "  ${CYAN}Installing Ollama via Homebrew...${NC}"
                brew install ollama 2>/dev/null && OLLAMA_AVAILABLE=true
            fi

            if [ "$OLLAMA_AVAILABLE" = false ]; then
                echo -e "  ${CYAN}Installing Ollama...${NC}"
                curl -fsSL https://ollama.com/install.sh | sh 2>/dev/null && OLLAMA_AVAILABLE=true
            fi

            if [ "$OLLAMA_AVAILABLE" = true ]; then
                echo -e "  ${GREEN}✓${NC} Ollama installed"
            else
                echo -e "  ${YELLOW}!${NC} Ollama install failed, continuing without"
                echo -e "  ${DIM}Install manually: https://ollama.com/download${NC}"
            fi
        fi
    fi
fi

# Configure Ollama to auto-start on boot (macOS)
if [[ "$OSTYPE" == "darwin"* ]] && [ "$OLLAMA_AVAILABLE" = true ]; then
    OLLAMA_PLIST="$HOME/Library/LaunchAgents/com.ollama.serve.plist"

    if [ ! -f "$OLLAMA_PLIST" ]; then
        # Find Ollama binary location
        OLLAMA_BIN=$(command -v ollama)

        mkdir -p "$HOME/Library/LaunchAgents"
        cat > "$OLLAMA_PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ollama.serve</string>
    <key>ProgramArguments</key>
    <array>
        <string>$OLLAMA_BIN</string>
        <string>serve</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ollama.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ollama.err</string>
</dict>
</plist>
PLIST
        launchctl load "$OLLAMA_PLIST" 2>/dev/null || true
        [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Ollama configured to auto-start on boot"
    else
        [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Ollama LaunchAgent already configured"
    fi
fi

# Emit environment completion status
if [ "$OLLAMA_AVAILABLE" = true ]; then
    emit_status "environment" "ok" "Python ${PYTHON_VERSION}, Ollama"
else
    emit_status "environment" "ok" "Python ${PYTHON_VERSION}, no Ollama"
fi

if [ "$EMBEDDED" != "1" ]; then
    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
fi

# Pull embedding model
if [ "$EMBEDDED" != "1" ]; then
    echo -e "${BOLD}Step 2/8: AI Models${NC}"
    echo
fi
emit_status "models" "progress" "Checking AI models..."

# Determine embedding model from config (default: all-minilm:l6-v2)
EMBEDDING_MODEL="all-minilm:l6-v2"
EMBEDDING_MODEL_SHORT="all-minilm"
if [ -f "$HOME/.claudia/config.json" ]; then
    CONFIG_EMB=$("$PYTHON" -c "
import json
try:
    with open('$HOME/.claudia/config.json') as f:
        print(json.load(f).get('embedding_model', ''))
except:
    pass
" 2>/dev/null)
    if [ -n "$CONFIG_EMB" ]; then
        EMBEDDING_MODEL="$CONFIG_EMB"
        EMBEDDING_MODEL_SHORT="${CONFIG_EMB%%:*}"
    fi
fi

if [ "$OLLAMA_AVAILABLE" = true ]; then
    # Ensure Ollama is running before pulling model
    if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
        [ "$EMBEDDED" != "1" ] && echo -e "  ${CYAN}◐${NC} Starting Ollama server..."
        ollama serve &>/dev/null &
        OLLAMA_PID=$!

        # Wait for Ollama to be ready (up to 10 seconds)
        for i in {1..10}; do
            if curl -s http://localhost:11434/api/tags &>/dev/null; then
                break
            fi
            sleep 1
        done

        if curl -s http://localhost:11434/api/tags &>/dev/null; then
            [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Ollama server running"
        else
            [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} Could not start Ollama (will retry on boot)"
        fi
    else
        [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Ollama server already running"
    fi

    # Pull embedding model
    if ollama list 2>/dev/null | grep -q "$EMBEDDING_MODEL_SHORT"; then
        [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Embedding model ready (${EMBEDDING_MODEL})"
    else
        [ "$EMBEDDED" != "1" ] && echo -e "  ${CYAN}◐${NC} Downloading embedding model (${EMBEDDING_MODEL})..."
        [ "$EMBEDDED" != "1" ] && echo -e "    ${DIM}This gives Claudia semantic understanding${NC}"
        [ "$EMBEDDED" != "1" ] && echo
        emit_status "models" "progress" "Downloading ${EMBEDDING_MODEL}..."
        if ollama pull "$EMBEDDING_MODEL" 2>/dev/null; then
            [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Model downloaded"
        else
            [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} Model pull failed (will retry when Ollama runs)"
        fi
    fi

    # Language model for cognitive tools (optional)
    if [ "$EMBEDDED" != "1" ]; then
        echo
        echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo
        echo -e "  ${BOLD}Cognitive Tools (Optional)${NC}"
        echo
        echo -e "  ${DIM}A local language model lets Claudia extract entities,${NC}"
        echo -e "  ${DIM}facts, and commitments from text locally -- no API keys.${NC}"
        echo -e "  ${DIM}Without it, Claude handles extraction directly.${NC}"
        echo
    fi

    if [ "$NONINTERACTIVE" = "1" ] || [ "$EMBEDDED" = "1" ]; then
        LLM_CHOICE=1
        LLM_MODEL="qwen3:4b"
        [ "$EMBEDDED" != "1" ] && echo -e "  ${CYAN}◐${NC} Auto-installing recommended model (qwen3:4b)..."
    else
        echo -e "  ${BOLD}Choose a model:${NC}"
        echo -e "    ${CYAN}1)${NC} qwen3:4b    ${DIM}(~3GB, recommended, strong tool calling)${NC}"
        echo -e "    ${CYAN}2)${NC} smollm3:3b  ${DIM}(~2GB, 95% JSON accuracy, Hugging Face)${NC}"
        echo -e "    ${CYAN}3)${NC} llama3.2:3b ${DIM}(~2GB, solid general extraction)${NC}"
        echo -e "    ${CYAN}4)${NC} Skip        ${DIM}(Claude handles everything, no extra download)${NC}"
        echo
        read -p "  Your choice [1-4, default=4]: " LLM_CHOICE
        LLM_CHOICE=${LLM_CHOICE:-4}

        LLM_MODEL=""
        case "$LLM_CHOICE" in
            1) LLM_MODEL="qwen3:4b" ;;
            2) LLM_MODEL="smollm3:3b" ;;
            3) LLM_MODEL="llama3.2:3b" ;;
            4) LLM_MODEL="" ;;
            *) LLM_MODEL="" ;;
        esac
    fi

    if [ -n "$LLM_MODEL" ]; then
        if ollama list 2>/dev/null | grep -q "${LLM_MODEL%%:*}"; then
            [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Language model ${LLM_MODEL} already available"
        else
            [ "$EMBEDDED" != "1" ] && echo -e "  ${CYAN}◐${NC} Downloading ${LLM_MODEL}..."
            [ "$EMBEDDED" != "1" ] && echo -e "    ${DIM}This may take a few minutes depending on your connection${NC}"
            [ "$EMBEDDED" != "1" ] && echo
            emit_status "models" "progress" "Downloading ${LLM_MODEL}..."
            if ollama pull "$LLM_MODEL" 2>/dev/null; then
                [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Language model downloaded"
            else
                [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} Download failed (you can pull it later: ollama pull ${LLM_MODEL})"
                LLM_MODEL=""
            fi
        fi

        # Write model choice to config
        if [ -n "$LLM_MODEL" ]; then
            CONFIG_FILE="$HOME/.claudia/config.json"
            if [ -f "$CONFIG_FILE" ]; then
                # Update existing config (simple key replacement)
                "$PYTHON" -c "
import json, sys
with open('$CONFIG_FILE') as f:
    cfg = json.load(f)
cfg['language_model'] = '$LLM_MODEL'
with open('$CONFIG_FILE', 'w') as f:
    json.dump(cfg, f, indent=2)
" 2>/dev/null || true
            else
                mkdir -p "$HOME/.claudia"
                echo "{\"language_model\": \"$LLM_MODEL\"}" > "$CONFIG_FILE"
            fi
            [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Config updated: language_model = ${LLM_MODEL}"
        fi
    else
        [ "$EMBEDDED" != "1" ] && echo -e "  ${DIM}Skipped. Claude will handle extraction directly.${NC}"
        # Write empty string to disable cognitive tools
        CONFIG_FILE="$HOME/.claudia/config.json"
        if [ -f "$CONFIG_FILE" ]; then
            "$PYTHON" -c "
import json
with open('$CONFIG_FILE') as f:
    cfg = json.load(f)
cfg['language_model'] = ''
with open('$CONFIG_FILE', 'w') as f:
    json.dump(cfg, f, indent=2)
" 2>/dev/null || true
        fi
    fi

    # Emit models completion status
    MODELS_SUMMARY="${EMBEDDING_MODEL_SHORT}"
    [ -n "$LLM_MODEL" ] && MODELS_SUMMARY="${MODELS_SUMMARY}, ${LLM_MODEL}"
    emit_status "models" "ok" "${MODELS_SUMMARY}"
else
    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}○${NC} Skipping (Ollama not available)"
    [ "$EMBEDDED" != "1" ] && echo -e "    ${DIM}Claudia will use keyword search instead${NC}"
    emit_status "models" "warn" "Ollama not available"
fi

if [ "$EMBEDDED" != "1" ]; then
    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
fi

# Create directories
if [ "$EMBEDDED" != "1" ]; then
    echo -e "${BOLD}Step 3/8: Creating Home${NC}"
    echo
fi
emit_status "memory" "progress" "Creating directories..."
mkdir -p "$DAEMON_DIR"
mkdir -p "$MEMORY_DIR"
if [ "$EMBEDDED" != "1" ]; then
    echo -e "  ${GREEN}✓${NC} Created ~/.claudia/"
    echo -e "    ${DIM}├── daemon/   (brain)${NC}"
    echo -e "    ${DIM}└── memory/   (memories)${NC}"

    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
fi

# Find source directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

# Copy daemon files
if [ "$EMBEDDED" != "1" ]; then
    echo -e "${BOLD}Step 4/8: Installing Core${NC}"
    echo
    echo -e "  ${CYAN}◐${NC} Copying memory system files..."
fi
emit_status "memory" "progress" "Installing core files..."
cp -r "$SOURCE_DIR/claudia_memory" "$DAEMON_DIR/"
cp -r "$SOURCE_DIR/scripts" "$DAEMON_DIR/"
cp "$SOURCE_DIR/pyproject.toml" "$DAEMON_DIR/"
cp "$SOURCE_DIR/requirements.txt" "$DAEMON_DIR/"
[ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Core files installed"

# Copy diagnostic script to ~/.claudia for easy access
cp "$SOURCE_DIR/scripts/diagnose.sh" "$CLAUDIA_DIR/diagnose.sh"
chmod +x "$CLAUDIA_DIR/diagnose.sh"
[ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Diagnostic script installed"

if [ "$EMBEDDED" != "1" ]; then
    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
fi

# Create virtual environment
if [ "$EMBEDDED" != "1" ]; then
    echo -e "${BOLD}Step 5/8: Python Environment${NC}"
    echo
    echo -e "  ${CYAN}◐${NC} Creating isolated environment..."
fi
emit_status "memory" "progress" "Installing dependencies..."
$PYTHON -m venv --clear "$VENV_DIR"
[ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Virtual environment created"

if [ "$EMBEDDED" != "1" ]; then
    echo -e "  ${CYAN}◐${NC} Installing dependencies..."
    echo -e "    ${DIM}$(random_message)${NC}"
fi
"$VENV_DIR/bin/pip" install --upgrade pip >> "$CLAUDIA_DIR/install.log" 2>&1
"$VENV_DIR/bin/pip" install -r "$DAEMON_DIR/requirements.txt" >> "$CLAUDIA_DIR/install.log" 2>&1
if "$VENV_DIR/bin/pip" install -e "$DAEMON_DIR[tui]" >> "$CLAUDIA_DIR/install.log" 2>&1; then
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Dependencies installed"
else
    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} Some dependencies failed to install. Check ~/.claudia/install.log for details"
fi

# Install spaCy (optional, degrades gracefully)
if [ "$EMBEDDED" != "1" ]; then
    echo -e "  ${CYAN}◐${NC} Installing NLP engine..."
    echo -e "    ${DIM}$(random_message)${NC}"
fi
if "$VENV_DIR/bin/pip" install spacy > /dev/null 2>&1; then
    "$VENV_DIR/bin/python" -m spacy download en_core_web_sm > /dev/null 2>&1 || true
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} NLP ready"
else
    if [ "$EMBEDDED" != "1" ]; then
        echo -e "  ${YELLOW}!${NC} spaCy could not be installed (this is non-critical)"
        echo -e "    Entity extraction will use pattern matching instead of NLP."
        echo -e "    ${DIM}This is common on Python 3.14+. For full NLP support, use Python 3.13.${NC}"
    fi
fi

if [ "$EMBEDDED" != "1" ]; then
    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
fi

# Configure auto-start
if [ "$EMBEDDED" != "1" ]; then
    echo -e "${BOLD}Step 6/8: Auto-Start Setup${NC}"
    echo
fi
emit_status "memory" "progress" "Starting daemon..."

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
        <string>--standalone</string>$(if [ -n "$CLAUDIA_PROJECT_PATH" ]; then printf '\n        <string>--project-dir</string>\n        <string>%s</string>' "$CLAUDIA_PROJECT_PATH"; fi)
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

    if [ "$EMBEDDED" != "1" ]; then
        echo -e "  ${GREEN}✓${NC} Configured macOS LaunchAgent"
        echo -e "    ${DIM}Will start on login${NC}"
    fi

    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    launchctl load "$PLIST_FILE"
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Daemon launched"

    # Verify daemon actually started
    sleep 5
    if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
        [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Memory daemon is running"
        emit_status "memory" "ok" "daemon running"
    else
        [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} Memory daemon may not have started. Run ~/.claudia/diagnose.sh for details"
        emit_status "memory" "warn" "daemon may not have started"
    fi

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

    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Configured systemd service"

    systemctl --user daemon-reload
    systemctl --user enable claudia-memory
    systemctl --user start claudia-memory
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Daemon started"

    # Verify daemon actually started
    sleep 5
    if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
        [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Memory daemon is running"
        emit_status "memory" "ok" "daemon running"
    else
        [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} Memory daemon may not have started. Run ~/.claudia/diagnose.sh for details"
        emit_status "memory" "warn" "daemon may not have started"
    fi
fi

if [ "$EMBEDDED" != "1" ]; then
    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
fi

# Memory Migration (for upgrades)
if [ "$EMBEDDED" != "1" ]; then
    echo -e "${BOLD}Step 7/8: Memory Migration${NC}"
    echo
fi

if [ -n "$CLAUDIA_PROJECT_PATH" ]; then
    # Check if there are memories to migrate
    if [ -d "$CLAUDIA_PROJECT_PATH/context" ] || [ -d "$CLAUDIA_PROJECT_PATH/people" ]; then
        [ "$EMBEDDED" != "1" ] && echo -e "  ${CYAN}◐${NC} Found existing memories to migrate..."

        # Wait a moment for daemon to start
        sleep 2

        # Run migration in quiet mode (if block is immune to set -e)
        if PYTHONWARNINGS="ignore" "$VENV_DIR/bin/python" "$DAEMON_DIR/scripts/migrate_markdown.py" --quiet "$CLAUDIA_PROJECT_PATH" 2>&1; then
            [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Memories migrated to database"
        else
            if [ "$EMBEDDED" != "1" ]; then
                echo -e "  ${YELLOW}!${NC} Migration had issues (memories still in markdown)"
                echo -e "    ${DIM}You can retry: ~/.claudia/daemon/venv/bin/python ~/.claudia/daemon/scripts/migrate_markdown.py --quiet $CLAUDIA_PROJECT_PATH${NC}"
            fi
        fi
    else
        [ "$EMBEDDED" != "1" ] && echo -e "  ${DIM}No existing memories found to migrate${NC}"
    fi
else
    [ "$EMBEDDED" != "1" ] && echo -e "  ${DIM}Fresh install - no migration needed${NC}"
fi

# Embedding maintenance (backfill missing embeddings on upgrade)
if [ "$OLLAMA_AVAILABLE" = true ]; then
    # Find all databases in ~/.claudia/memory/
    EMBED_DBS=()
    for db_file in "$HOME/.claudia/memory/"*.db; do
        [ -f "$db_file" ] && EMBED_DBS+=("$db_file")
    done

    if [ ${#EMBED_DBS[@]} -gt 0 ]; then
        if [ "$EMBEDDED" != "1" ]; then
            echo
            echo -e "  ${CYAN}◐${NC} Checking embeddings..."
        fi

        BACKFILLED_TOTAL=0
        MISMATCH_FOUND=false

        for db_file in "${EMBED_DBS[@]}"; do
            DB_NAME=$(basename "$db_file")
            RESULT=$(PYTHONWARNINGS="ignore" CLAUDIA_DB_OVERRIDE="$db_file" "$VENV_DIR/bin/python" -m claudia_memory --backfill-embeddings 2>&1) && EXITCODE=0 || EXITCODE=$?

            if [ $EXITCODE -ne 0 ]; then
                if echo "$RESULT" | grep -q "Dimension mismatch"; then
                    MISMATCH_FOUND=true
                    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} ${DB_NAME}: Embedding model change detected"
                elif echo "$RESULT" | grep -qi "not available\|connection refused\|connect call failed"; then
                    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} ${DB_NAME}: Ollama not responding (embeddings will backfill on next restart)"
                else
                    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}!${NC} ${DB_NAME}: Embedding check skipped"
                fi
                # Log details for debugging
                echo "[$(date)] Backfill failed for $DB_NAME (exit=$EXITCODE):" >> "$CLAUDIA_DIR/install.log"
                echo "$RESULT" >> "$CLAUDIA_DIR/install.log"
                continue
            fi

            # Count backfilled embeddings from output
            if echo "$RESULT" | grep -q "Backfill complete"; then
                COUNT=$(echo "$RESULT" | grep -o '[0-9]* embedded' | cut -d' ' -f1)
                BACKFILLED_TOTAL=$((BACKFILLED_TOTAL + ${COUNT:-0}))
            fi
        done

        if [ "$EMBEDDED" != "1" ]; then
            if [ "$MISMATCH_FOUND" = true ]; then
                echo -e "    ${DIM}Your config has a different embedding model than the database.${NC}"
                echo -e "    ${DIM}Run to migrate: ~/.claudia/daemon/venv/bin/python -m claudia_memory --migrate-embeddings${NC}"
            elif [ $BACKFILLED_TOTAL -gt 0 ]; then
                echo -e "  ${GREEN}✓${NC} Backfilled ${BACKFILLED_TOTAL} embeddings"
            else
                echo -e "  ${GREEN}✓${NC} Embeddings up to date"
            fi
        fi
    fi
fi

if [ "$EMBEDDED" != "1" ]; then
    echo
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
fi

# Verify all services
if [ "$EMBEDDED" != "1" ]; then
    echo -e "${BOLD}Step 8/8: Verification${NC}"
    echo
    echo -e "  ${CYAN}◐${NC} Checking all services..."
fi
emit_status "health" "progress" "Verifying services..."
sleep 3

VERIFY_ISSUES=0

# Check 1: Ollama running
if curl -s http://localhost:11434/api/tags &>/dev/null; then
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Ollama running"
else
    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}○${NC} Ollama not running (will start on next boot)"
    VERIFY_ISSUES=$((VERIFY_ISSUES + 1))
fi

# Check 2: Ollama LaunchAgent (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if [ -f "$HOME/Library/LaunchAgents/com.ollama.serve.plist" ]; then
        [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Ollama auto-start configured"
    else
        [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}○${NC} Ollama auto-start not configured"
        VERIFY_ISSUES=$((VERIFY_ISSUES + 1))
    fi
fi

# Check 3: Embedding model
if [ "$OLLAMA_AVAILABLE" = true ] && ollama list 2>/dev/null | grep -q "$EMBEDDING_MODEL_SHORT"; then
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Embedding model ready (${EMBEDDING_MODEL})"
else
    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}○${NC} Embedding model pending (${EMBEDDING_MODEL})"
    VERIFY_ISSUES=$((VERIFY_ISSUES + 1))
fi

# Check 3b: Language model (cognitive tools)
if [ -n "$LLM_MODEL" ] && [ "$OLLAMA_AVAILABLE" = true ] && ollama list 2>/dev/null | grep -q "${LLM_MODEL%%:*}"; then
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Language model ready (${LLM_MODEL})"
else
    [ "$EMBEDDED" != "1" ] && echo -e "  ${DIM}○${NC} Language model not installed (cognitive tools disabled)"
fi

# Check 4: sqlite-vec (vector search)
if "$VENV_DIR/bin/python" -c "import sqlite_vec" 2>/dev/null; then
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Vector search available (sqlite-vec)"
else
    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}○${NC} Vector search unavailable (keyword search only)"
    VERIFY_ISSUES=$((VERIFY_ISSUES + 1))
fi

# Check 5: Memory daemon health
if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
    [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Memory daemon running"
    HEALTH_OK=true
else
    [ "$EMBEDDED" != "1" ] && echo -e "  ${YELLOW}○${NC} Memory daemon starting..."
    HEALTH_OK=false
    VERIFY_ISSUES=$((VERIFY_ISSUES + 1))
fi

# Check 6: Claudia LaunchAgent (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if [ -f "$HOME/Library/LaunchAgents/com.claudia.memory.plist" ]; then
        [ "$EMBEDDED" != "1" ] && echo -e "  ${GREEN}✓${NC} Claudia auto-start configured"
    fi
fi

# Emit health completion status
if [ $VERIFY_ISSUES -eq 0 ]; then
    emit_status "health" "ok" "All services verified"
else
    emit_status "health" "warn" "${VERIFY_ISSUES} issues detected"
fi

if [ "$EMBEDDED" != "1" ]; then

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Success banner
echo -e "${GREEN}"
cat << 'EOF'
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   ✨ Memory system installed successfully! ✨             ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Note about running claude
echo -e "${CYAN}${BOLD}"
cat << 'EOF'
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   Ready! Run 'claude' in a new terminal to start.          │
  │                                                             │
  │   If Claude was already running, restart it to activate    │
  │   the memory tools.                                         │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
EOF
echo -e "${NC}"

# Summary
echo -e "${BOLD}What's installed:${NC}"
echo
echo -e "  ${CYAN}◆${NC} Memory daemon      ${DIM}~/.claudia/daemon/${NC}"
echo -e "  ${CYAN}◆${NC} SQLite database    ${DIM}~/.claudia/memory/claudia.db${NC}"
echo -e "  ${CYAN}◆${NC} Health endpoint    ${DIM}http://localhost:3848${NC}"
if [ "$OLLAMA_AVAILABLE" = true ]; then
echo -e "  ${CYAN}◆${NC} Vector search      ${DIM}Enabled (${EMBEDDING_MODEL})${NC}"
else
echo -e "  ${YELLOW}○${NC} Vector search      ${DIM}Disabled (install Ollama to enable)${NC}"
fi
if [ -n "$LLM_MODEL" ]; then
echo -e "  ${CYAN}◆${NC} Cognitive tools    ${DIM}Enabled (${LLM_MODEL})${NC}"
else
echo -e "  ${DIM}○${NC} Cognitive tools    ${DIM}Disabled (Claude handles extraction)${NC}"
fi
echo

echo -e "${BOLD}Troubleshooting:${NC}"
echo
echo -e "  ${DIM}Run diagnostics:${NC}  ~/.claudia/diagnose.sh"
echo -e "  ${DIM}Check health:${NC}     curl http://localhost:3848/health"
if [[ "$OSTYPE" == "darwin"* ]]; then
echo -e "  ${DIM}View logs:${NC}        tail -f ~/.claudia/daemon-stderr.log"
else
echo -e "  ${DIM}View logs:${NC}        journalctl --user -u claudia-memory -f"
fi
echo

# Claudia says goodbye
echo -e "${MAGENTA}${DIM}\"I learn how you work. Let's get started.\" — Claudia${NC}"
echo

fi # end EMBEDDED guard for success output
