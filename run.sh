#!/bin/bash
# run.sh — Build and start the server

set -e # Exit on error

echo "Building TypeScript..."
npm run build

echo "Starting server on http://localhost:3000"
npm start
