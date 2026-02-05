#!/bin/bash
# run.sh — Build and start the server

set -e # Exit on error

echo "Checking for existing server on port 3000..."
EXISTING_PID=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  echo "Killing existing process (PID $EXISTING_PID)..."
  kill $EXISTING_PID 2>/dev/null || true
  sleep 1
fi

echo "Building TypeScript..."
npm run build

echo "Starting server in background..."
npm start &
SERVER_PID=$!

echo "Waiting for server to start..."
sleep 2

echo "Seeding demo data..."
npm run seed

echo ""
echo "Server running on http://localhost:3000"
echo "Press Ctrl+C to stop"
wait $SERVER_PID
