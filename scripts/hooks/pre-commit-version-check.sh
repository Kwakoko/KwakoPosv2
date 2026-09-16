#!/bin/bash
# Pre-commit hook to prevent version drift
# Install: cp scripts/hooks/pre-commit-version-check.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -e

echo "🔍 Running pre-commit version drift check..."

# Check if version:check passes
if ! npm run version:check > /dev/null 2>&1; then
  echo "❌ VERSION DRIFT DETECTED!"
  echo ""
  echo "To fix, run:"
  echo "  npm run version:sync"
  echo "  npm run version:check"
  echo ""
  exit 1
fi

echo "✅ Version check passed!"
exit 0
