#!/bin/bash
# SessionStart hook: installs each app's dependencies so `npm test` and
# `npm start` work immediately in a Claude Code on the web session.
set -euo pipefail

# Only run in remote (web) sessions — local checkouts manage their own installs.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

repo_root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$repo_root"

# Each app under apps/ is independent and has its own package.json.
for app_dir in apps/*/; do
  [ -f "${app_dir}package.json" ] || continue
  echo "Installing dependencies for ${app_dir}"
  (cd "$app_dir" && npm install --no-audit --no-fund)
done
