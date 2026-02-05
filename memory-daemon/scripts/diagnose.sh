#!/bin/bash
# Claudia Memory Diagnostic Tool
# Run this to check all components of the memory system

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

echo ""
echo -e "${BOLD}Claudia Memory System Diagnostics${NC}"
echo -e "${DIM}===================================${NC}"
echo ""

ISSUES_FOUND=0

# Check 1: Daemon health
echo -n "1. Daemon health check... "
if curl -s "http://localhost:3848/health" 2>/dev/null | grep -q "healthy"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "   ${DIM}Fix: launchctl load ~/Library/LaunchAgents/com.claudia.memory.plist${NC}"
    else
        echo -e "   ${DIM}Fix: systemctl --user start claudia-memory${NC}"
    fi
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 2: Virtual environment exists
echo -n "2. Virtual environment... "
if [ -d "$HOME/.claudia/daemon/venv" ]; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ Missing${NC}"
    echo -e "   ${DIM}Fix: Re-run the memory installer${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 3: Python module
echo -n "3. Python module installed... "
if [ -d "$HOME/.claudia/daemon/venv" ] && "$HOME/.claudia/daemon/venv/bin/python" -c "import claudia_memory" 2>/dev/null; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ Missing${NC}"
    echo -e "   ${DIM}Fix: ~/.claudia/daemon/venv/bin/pip install -e ~/.claudia/daemon${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 4: MCP server can start
echo -n "4. MCP server module... "
if [ -d "$HOME/.claudia/daemon/venv" ] && "$HOME/.claudia/daemon/venv/bin/python" -c "from claudia_memory.mcp import server" 2>/dev/null; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ Failed to import${NC}"
    echo -e "   ${DIM}Check: ~/.claudia/daemon-stderr.log for errors${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 5: .mcp.json configured (check current directory and home)
echo -n "5. .mcp.json configured... "
MCP_FOUND=false
MCP_LOCATION=""

if [ -f ".mcp.json" ] && grep -q "claudia-memory" .mcp.json 2>/dev/null; then
    MCP_FOUND=true
    MCP_LOCATION="current directory"
elif [ -f "$HOME/.claudia/.mcp.json" ] && grep -q "claudia-memory" "$HOME/.claudia/.mcp.json" 2>/dev/null; then
    MCP_FOUND=true
    MCP_LOCATION="~/.claudia/"
fi

if [ "$MCP_FOUND" = true ]; then
    echo -e "${GREEN}✓ Found in ${MCP_LOCATION}${NC}"
else
    echo -e "${YELLOW}○ Not found${NC}"
    echo -e "   ${DIM}The npx installer should have created this automatically.${NC}"
    echo -e "   ${DIM}Add claudia-memory to your project's .mcp.json if needed.${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 6: Database exists
echo -n "6. Database file... "
if [ -f "$HOME/.claudia/memory/claudia.db" ]; then
    DB_SIZE=$(du -h "$HOME/.claudia/memory/claudia.db" 2>/dev/null | cut -f1)
    echo -e "${GREEN}✓ OK${NC} ${DIM}(${DB_SIZE})${NC}"
else
    echo -e "${YELLOW}○ Not created yet${NC}"
    echo -e "   ${DIM}Database will be created on first use.${NC}"
fi

# Check 7: Ollama installed
echo -n "7. Ollama installed... "
if command -v ollama &> /dev/null; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${YELLOW}○ Not installed (keyword search will be used)${NC}"
    echo -e "   ${DIM}Optional: brew install ollama${NC}"
fi

# Check 8: Ollama running
echo -n "8. Ollama running... "
if curl -s http://localhost:11434/api/tags &>/dev/null; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${YELLOW}○ Not running${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if [ -f "$HOME/Library/LaunchAgents/com.ollama.serve.plist" ]; then
            echo -e "   ${DIM}LaunchAgent exists - try: launchctl load ~/Library/LaunchAgents/com.ollama.serve.plist${NC}"
        else
            echo -e "   ${DIM}Start with: ollama serve${NC}"
        fi
    else
        echo -e "   ${DIM}Start with: ollama serve${NC}"
    fi
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 9: Ollama auto-start (macOS only)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -n "9. Ollama auto-start... "
    if [ -f "$HOME/Library/LaunchAgents/com.ollama.serve.plist" ]; then
        echo -e "${GREEN}✓ LaunchAgent configured${NC}"
    else
        echo -e "${YELLOW}○ No LaunchAgent${NC}"
        echo -e "   ${DIM}Ollama won't start on boot. Re-run memory installer to configure.${NC}"
    fi
else
    echo -e "9. Ollama auto-start... ${DIM}(Linux - check systemd if needed)${NC}"
fi

# Check 10: Embedding model
echo -n "10. Embedding model... "
if command -v ollama &> /dev/null; then
    if ollama list 2>/dev/null | grep -q "minilm"; then
        echo -e "${GREEN}✓ all-minilm model available${NC}"
    else
        echo -e "${YELLOW}○ No embedding model${NC}"
        echo -e "   ${DIM}Run: ollama pull all-minilm:l6-v2${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
else
    echo -e "${DIM}○ Skipped (Ollama not installed)${NC}"
fi

# Check 11: sqlite-vec (vector search)
echo -n "11. Vector search (sqlite-vec)... "
VENV_PYTHON="$HOME/.claudia/daemon/venv/bin/python"
if [ -f "$VENV_PYTHON" ]; then
    if $VENV_PYTHON -c "import sqlite_vec; print('ok')" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}✓ sqlite-vec available${NC}"
    else
        echo -e "${YELLOW}○ sqlite-vec not working${NC}"
        echo -e "   ${DIM}Fix: $HOME/.claudia/daemon/venv/bin/pip install sqlite-vec${NC}"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
else
    echo -e "${RED}✗ Virtual environment missing${NC}"
fi

# Summary
echo ""
echo -e "${DIM}-----------------------------------${NC}"
echo ""

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}${BOLD}All checks passed!${NC}"
    echo ""
    echo -e "If memory.* tools still don't appear in Claude Code:"
    echo ""
    echo -e "  ${YELLOW}${BOLD}→ Close this terminal and run 'claude' in a NEW terminal${NC}"
    echo ""
    echo -e "  ${DIM}Claude Code only reads .mcp.json at startup.${NC}"
    echo -e "  ${DIM}A restart is required to pick up new MCP servers.${NC}"
else
    echo -e "${YELLOW}${BOLD}Found $ISSUES_FOUND issue(s) above.${NC}"
    echo ""
    echo -e "Fix the issues and run this diagnostic again."
fi

echo ""

# Exit with appropriate code for automated checks
exit $ISSUES_FOUND
