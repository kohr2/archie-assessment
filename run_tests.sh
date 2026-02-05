#!/bin/bash
# run_tests.sh — Run the test suite

set -e # Exit on error

echo "Running tests..."
npx vitest run
