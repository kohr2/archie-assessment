#!/bin/bash
# stop.sh — Stop the running server

PORT=3000

PID=$(lsof -ti :$PORT 2>/dev/null)

if [ -z "$PID" ]; then
  echo "No server running on port $PORT"
  exit 0
fi

kill $PID 2>/dev/null
echo "Server stopped (PID $PID)"
