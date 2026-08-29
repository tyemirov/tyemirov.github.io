#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
production_pixel_url="https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"

for html_path in $(git -C "${repo_root}" ls-files '*.html'); do
  [[ "$(grep -F -c "${production_pixel_url}" "${repo_root}/${html_path}")" -eq 1 ]] || {
    echo "error: ${html_path} must load the tyemirov.net production LoopAware pixel exactly once" >&2
    exit 1
  }
done

echo "tyemirov.net LoopAware site identifier passed"
