#!/bin/bash
# Claudia Brain Visualizer Installer
# Sets up the 3D memory visualization system

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
VISUALIZER_DIR="$CLAUDIA_DIR/visualizer"
THREEJS_DIR="$CLAUDIA_DIR/visualizer-threejs"
BIN_DIR="$CLAUDIA_DIR/bin"

# Clear screen and show banner
clear

# Claudia pixel art banner (matching the NPX installer)
B='\033[36m'  # cyan/blue
Y='\033[33m'  # yellow
W='\033[97m'  # white

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
echo -e "${DIM}Brain Visualizer Installer${NC}"
echo -e "${DIM}See your memories in 3D${NC}"
echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 1: Environment Check
# ============================================================
echo -e "${BOLD}Step 1/5: Environment Check${NC}"
echo

# Check Node.js
NODE_CMD=""
if command -v node &> /dev/null; then
    NODE_CMD="node"
    NODE_VERSION=$(node --version 2>&1 | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "  ${GREEN}✓${NC} Node.js v$NODE_VERSION"
    else
        echo -e "  ${RED}✗${NC} Node.js $NODE_VERSION (v18+ required)"
        echo -e "    ${DIM}Install from https://nodejs.org or use nvm${NC}"
        exit 1
    fi
else
    echo -e "  ${RED}✗${NC} Node.js not found"
    echo -e "    ${DIM}Install from https://nodejs.org${NC}"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version 2>&1)
    echo -e "  ${GREEN}✓${NC} npm v$NPM_VERSION"
else
    echo -e "  ${RED}✗${NC} npm not found"
    echo -e "    ${DIM}npm should come with Node.js${NC}"
    exit 1
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 2: Create Directories
# ============================================================
echo -e "${BOLD}Step 2/5: Creating Directories${NC}"
echo

mkdir -p "$VISUALIZER_DIR"
mkdir -p "$THREEJS_DIR"
mkdir -p "$BIN_DIR"

echo -e "  ${GREEN}✓${NC} Created ~/.claudia/"
echo -e "    ${DIM}├── visualizer/        (API backend)${NC}"
echo -e "    ${DIM}├── visualizer-threejs/ (3D frontend)${NC}"
echo -e "    ${DIM}└── bin/               (launcher)${NC}"

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 3: Copy Files
# ============================================================
echo -e "${BOLD}Step 3/5: Installing Visualizer${NC}"
echo

# Find source directory (relative to this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"
THREEJS_SOURCE="$(dirname "$SOURCE_DIR")/visualizer-threejs"

echo -e "  ${CYAN}◐${NC} Copying API backend..."

# Copy visualizer (API backend)
if [ -d "$SOURCE_DIR" ] && [ -f "$SOURCE_DIR/server.js" ]; then
    # Copy all files except node_modules (remove existing first to avoid stale files)
    rm -rf "$VISUALIZER_DIR"/*
    for item in "$SOURCE_DIR"/*; do
        basename=$(basename "$item")
        if [ "$basename" != "node_modules" ]; then
            cp -R "$item" "$VISUALIZER_DIR/"
        fi
    done
    # Copy hidden files too (like .gitignore, .npmignore)
    for item in "$SOURCE_DIR"/.[!.]*; do
        if [ -e "$item" ]; then
            cp -R "$item" "$VISUALIZER_DIR/"
        fi
    done
    echo -e "  ${GREEN}✓${NC} API backend installed"
else
    echo -e "  ${RED}✗${NC} Source visualizer not found at $SOURCE_DIR"
    exit 1
fi

echo -e "  ${CYAN}◐${NC} Copying 3D frontend..."

# Copy visualizer-threejs (3D frontend)
if [ -d "$THREEJS_SOURCE" ] && [ -f "$THREEJS_SOURCE/package.json" ]; then
    # Copy all files except node_modules
    rm -rf "$THREEJS_DIR"/*
    for item in "$THREEJS_SOURCE"/*; do
        basename=$(basename "$item")
        if [ "$basename" != "node_modules" ]; then
            cp -R "$item" "$THREEJS_DIR/"
        fi
    done
    # Copy hidden files too
    for item in "$THREEJS_SOURCE"/.[!.]*; do
        if [ -e "$item" ]; then
            cp -R "$item" "$THREEJS_DIR/"
        fi
    done
    echo -e "  ${GREEN}✓${NC} 3D frontend installed"
else
    echo -e "  ${RED}✗${NC} Source visualizer-threejs not found at $THREEJS_SOURCE"
    exit 1
fi

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 4: Install Dependencies
# ============================================================
echo -e "${BOLD}Step 4/5: Installing Dependencies${NC}"
echo

echo -e "  ${CYAN}◐${NC} Installing backend dependencies..."
echo -e "    ${DIM}This includes better-sqlite3 (native module)${NC}"
cd "$VISUALIZER_DIR"
npm install --silent 2>&1 | grep -v "^npm" || true
echo -e "  ${GREEN}✓${NC} Backend dependencies ready"

echo -e "  ${CYAN}◐${NC} Installing frontend dependencies..."
cd "$THREEJS_DIR"
npm install --silent 2>&1 | grep -v "^npm" || true
echo -e "  ${GREEN}✓${NC} Frontend dependencies ready"

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ============================================================
# Step 5: Create Launcher Script
# ============================================================
echo -e "${BOLD}Step 5/5: Creating Launcher${NC}"
echo

cat > "$BIN_DIR/brain" << 'LAUNCHER'
#!/bin/bash
# Claudia Brain Visualizer Launcher
# Starts the API server and 3D frontend

CLAUDIA_DIR="$HOME/.claudia"
VISUALIZER_DIR="$CLAUDIA_DIR/visualizer"
THREEJS_DIR="$CLAUDIA_DIR/visualizer-threejs"

# Get project directory (current working directory or argument)
PROJECT_DIR="${1:-$(pwd)}"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
DIM='\033[2m'
NC='\033[0m'

echo -e "${CYAN}Starting Brain Visualizer...${NC}"
echo -e "${DIM}Project: $PROJECT_DIR${NC}"
echo

# Check if API server is already running
if curl -s http://localhost:3849/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} API server already running on port 3849"
else
    echo -e "${CYAN}◐${NC} Starting API server..."
    cd "$VISUALIZER_DIR"
    nohup node server.js --project-dir "$PROJECT_DIR" > /tmp/claudia-brain-api.log 2>&1 &
    sleep 2

    if curl -s http://localhost:3849/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} API server started on port 3849"
    else
        echo -e "${YELLOW}!${NC} API server failed to start"
        echo -e "${DIM}Check /tmp/claudia-brain-api.log for details${NC}"
    fi
fi

# Check if frontend is already running
FRONTEND_PORT=""
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    FRONTEND_PORT="5173"
    echo -e "${GREEN}✓${NC} Frontend already running on port 5173"
elif curl -s http://localhost:5174 > /dev/null 2>&1; then
    FRONTEND_PORT="5174"
    echo -e "${GREEN}✓${NC} Frontend already running on port 5174"
else
    echo -e "${CYAN}◐${NC} Starting 3D frontend..."
    cd "$THREEJS_DIR"
    nohup npm run dev > /tmp/claudia-brain.log 2>&1 &
    sleep 3

    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        FRONTEND_PORT="5173"
        echo -e "${GREEN}✓${NC} Frontend started on port 5173"
    elif curl -s http://localhost:5174 > /dev/null 2>&1; then
        FRONTEND_PORT="5174"
        echo -e "${GREEN}✓${NC} Frontend started on port 5174"
    else
        echo -e "${YELLOW}!${NC} Frontend failed to start"
        echo -e "${DIM}Check /tmp/claudia-brain.log for details${NC}"
        exit 1
    fi
fi

# Open in browser
echo
echo -e "${GREEN}Opening http://localhost:$FRONTEND_PORT${NC}"
open "http://localhost:$FRONTEND_PORT" 2>/dev/null || xdg-open "http://localhost:$FRONTEND_PORT" 2>/dev/null || echo "Open http://localhost:$FRONTEND_PORT in your browser"
LAUNCHER

chmod +x "$BIN_DIR/brain"
echo -e "  ${GREEN}✓${NC} Created launcher at ~/.claudia/bin/brain"

echo
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Success banner
echo -e "${GREEN}"
cat << 'EOF'
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   ✨ Brain Visualizer installed successfully! ✨          ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Summary
echo -e "${BOLD}What's installed:${NC}"
echo
echo -e "  ${CYAN}◆${NC} API backend        ${DIM}~/.claudia/visualizer/${NC}"
echo -e "  ${CYAN}◆${NC} 3D frontend        ${DIM}~/.claudia/visualizer-threejs/${NC}"
echo -e "  ${CYAN}◆${NC} Launcher script    ${DIM}~/.claudia/bin/brain${NC}"
echo

echo -e "${BOLD}How to use:${NC}"
echo
echo -e "  ${DIM}From Claude Code, run:${NC}  ${CYAN}/brain${NC}"
echo -e "  ${DIM}Or from terminal:${NC}       ${CYAN}~/.claudia/bin/brain${NC}"
echo

# Claudia says goodbye
echo -e "${MAGENTA}${DIM}\"Want to see what your memory looks like?\" — Claudia${NC}"
echo
