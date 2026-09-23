#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "A browser test command is required" >&2
  exit 2
fi

lock_file="${MUSIC_BROWSER_LOCK_FILE:-$PWD/output/playwright/music-browser.lock}"
mkdir -p "$(dirname "$lock_file")"

if command -v flock >/dev/null 2>&1; then
  exec flock "$lock_file" "$@"
fi
if command -v lockf >/dev/null 2>&1; then
  exec lockf "$lock_file" "$@"
fi

echo "An OS file-lock command (flock or lockf) is required for browser tests" >&2
exit 2
