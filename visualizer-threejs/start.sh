#!/bin/bash
# Start Claudia Brain Three.js Visualizer
# Launches backend server + Vite dev server

cd "$(dirname "$0")"

echo "Starting Claudia Brain visualizer..."
echo ""

# Start backend server in background
echo "→ Starting API backend on :3849..."
(cd ../visualizer && node server.js) &
BACKEND_PID=$!

# Give backend a moment to start
sleep 1

# Start Vite dev server
echo "→ Starting Three.js frontend on :5174..."
echo ""
npm run dev

# When Vite exits, kill the backend
kill $BACKEND_PID 2>/dev/null
