#!/bin/bash
# setup.sh — One command to set up everything

set -e # Exit on error

echo "Installing dependencies..."
npm install

echo "Building TypeScript..."
npm run build

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  bash run.sh          # Start the server"
echo "  bash run_tests.sh    # Run tests"
