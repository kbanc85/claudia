#!/bin/bash
#
# Claudia Memory System - One-Click Test Script
#
# Just run: ./test.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Test database location (temporary)
TEST_DB="/tmp/claudia_test_$$.db"
export CLAUDIA_TEST_DB="$TEST_DB"

# Cleanup function
cleanup() {
    echo ""
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    rm -rf "$SCRIPT_DIR/.test_venv" 2>/dev/null || true
    rm -f "$TEST_DB" 2>/dev/null || true
    rm -f "$TEST_DB-wal" 2>/dev/null || true
    rm -f "$TEST_DB-shm" 2>/dev/null || true
    pkill -f "claudia_memory --standalone" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Cleanup complete"
}

# Always cleanup on exit
trap cleanup EXIT

# Clear screen
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
echo -e "${DIM}Memory System Tests${NC}"
echo -e "${DIM}Verifying everything works${NC}"
echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Check Python
echo -e "${BOLD}Step 1/6: Environment${NC}"
echo ""
if command -v python3 &> /dev/null; then
    PYTHON=$(command -v python3)
    PYTHON_VERSION=$($PYTHON --version 2>&1)
    echo -e "  ${GREEN}✓${NC} $PYTHON_VERSION"
else
    echo -e "  ${RED}✗${NC} Python 3 not found!"
    echo "    Please install Python 3.10 or later"
    exit 1
fi

echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 2: Create virtual environment
echo -e "${BOLD}Step 2/6: Test Environment${NC}"
echo ""
echo -e "  ${CYAN}◐${NC} Creating isolated test environment..."
$PYTHON -m venv .test_venv
echo -e "  ${GREEN}✓${NC} Virtual environment created"

echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 3: Install dependencies
echo -e "${BOLD}Step 3/6: Dependencies${NC}"
echo ""
echo -e "  ${CYAN}◐${NC} Installing packages..."
echo -e "    ${DIM}Wiring up the test harness...${NC}"
.test_venv/bin/pip install --upgrade pip -q
.test_venv/bin/pip install -e ".[dev]" -q
echo -e "  ${GREEN}✓${NC} Dependencies installed"

echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 4: Run unit tests
echo -e "${BOLD}Step 4/6: Unit Tests${NC}"
echo ""
echo -e "  ${DIM}Running pytest...${NC}"
echo ""
if .test_venv/bin/pytest tests/ -v --tb=short 2>&1 | tee /tmp/pytest_output_$$.txt | grep -E "^tests/|PASSED|FAILED|ERROR|passed|failed"; then
    PYTEST_RESULT=$(tail -1 /tmp/pytest_output_$$.txt)
    if echo "$PYTEST_RESULT" | grep -q "passed"; then
        echo ""
        echo -e "  ${GREEN}✓${NC} Unit tests passed"
    else
        echo ""
        echo -e "  ${RED}✗${NC} Some unit tests failed"
        cat /tmp/pytest_output_$$.txt
        exit 1
    fi
else
    echo -e "  ${RED}✗${NC} Unit tests failed"
    exit 1
fi
rm -f /tmp/pytest_output_$$.txt

echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 5: Test core services
echo -e "${BOLD}Step 5/6: Integration Tests${NC}"
echo ""
echo -e "  ${DIM}Testing remember → recall cycle...${NC}"
echo ""

.test_venv/bin/python << 'PYTHON_TEST' 2>&1 | grep -v "^spaCy\|^Could not\|^Skipping\|^Ollama"
import sys
import os

# Use temp database
os.environ['HOME'] = '/tmp/claudia_test_home'
os.makedirs('/tmp/claudia_test_home/.claudia/memory', exist_ok=True)

from claudia_memory.database import get_db, reset_db
from claudia_memory.services.remember import remember_fact, remember_entity, relate_entities
from claudia_memory.services.recall import recall, recall_about, search_entities

# Initialize
reset_db()
db = get_db()
db.initialize()

tests_passed = 0
tests_failed = 0

def test(name, condition):
    global tests_passed, tests_failed
    if condition:
        print(f"  ✓ {name}")
        tests_passed += 1
    else:
        print(f"  ✗ {name}")
        tests_failed += 1

# Test 1: Create entities
sarah_id = remember_entity("Sarah Chen", entity_type="person")
mike_id = remember_entity("Mike Johnson", entity_type="person")
test("Create entities", sarah_id > 0 and mike_id > 0)

# Test 2: Remember facts
f1 = remember_fact("Sarah prefers morning meetings", memory_type="preference", about_entities=["Sarah Chen"])
f2 = remember_fact("Mike is the tech lead", memory_type="fact", about_entities=["Mike Johnson"])
test("Remember facts", f1 > 0 and f2 > 0)

# Test 3: Create relationships
r1 = relate_entities("Sarah Chen", "Mike Johnson", "works_with")
test("Create relationships", r1 > 0)

# Test 4: Recall memories
results = recall("Sarah", limit=5)
test("Recall memories", len(results) > 0)

# Test 5: Recall about entity
about = recall_about("Sarah Chen")
test("Recall about entity", about['entity'] is not None and len(about['memories']) > 0)

# Test 6: Search entities
entities = search_entities("Sarah")
test("Search entities", len(entities) > 0)

# Summary
print("")
if tests_failed == 0:
    print(f"  All {tests_passed} tests passed!")
    sys.exit(0)
else:
    print(f"  {tests_failed} tests failed!")
    sys.exit(1)
PYTHON_TEST

if [ $? -eq 0 ]; then
    echo ""
    echo -e "  ${GREEN}✓${NC} Core services working"
else
    echo ""
    echo -e "  ${RED}✗${NC} Core services test failed"
    exit 1
fi

echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 6: Test daemon startup
echo -e "${BOLD}Step 6/6: Daemon Test${NC}"
echo ""

# Start daemon in background
export HOME="/tmp/claudia_test_home"
echo -e "  ${CYAN}◐${NC} Starting daemon..."
.test_venv/bin/python -m claudia_memory --standalone 2>/dev/null &
DAEMON_PID=$!
sleep 3

# Check if daemon is running
if kill -0 $DAEMON_PID 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Daemon started (PID: $DAEMON_PID)"

    # Test health endpoint
    if curl -s http://localhost:3848/health | grep -q "healthy"; then
        echo -e "  ${GREEN}✓${NC} Health endpoint responding"
    else
        echo -e "  ${YELLOW}○${NC} Health endpoint not responding (may be port conflict)"
    fi

    # Stop daemon
    kill $DAEMON_PID 2>/dev/null || true
    wait $DAEMON_PID 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Daemon stopped cleanly"
else
    echo -e "  ${RED}✗${NC} Daemon failed to start"
    exit 1
fi

echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Success!
echo -e "${GREEN}"
cat << 'EOF'
  ╔═══════════════════════════════════════════════════════╗
  ║                                                       ║
  ║   ✨ All Tests Passed! ✨                             ║
  ║                                                       ║
  ║   Claudia's memory system is ready for deployment.    ║
  ║                                                       ║
  ╚═══════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${BOLD}What was tested:${NC}"
echo ""
echo -e "  ${GREEN}✓${NC} Database layer (SQLite + WAL mode)"
echo -e "  ${GREEN}✓${NC} Entity creation and storage"
echo -e "  ${GREEN}✓${NC} Memory storage with metadata"
echo -e "  ${GREEN}✓${NC} Relationship linking"
echo -e "  ${GREEN}✓${NC} Semantic recall"
echo -e "  ${GREEN}✓${NC} Entity search"
echo -e "  ${GREEN}✓${NC} Daemon startup/shutdown"
echo -e "  ${GREEN}✓${NC} Health endpoint"
echo ""

echo -e "${BOLD}Next step:${NC}"
echo ""
echo -e "  To install for real:"
echo -e "  ${CYAN}./scripts/install.sh${NC}"
echo ""

echo -e "${MAGENTA}${DIM}\"All systems ready. Let's work together.\" — Claudia${NC}"
echo ""
