#!/usr/bin/env bash
set -euo pipefail
gateway_seed="$(mktemp -d)"
trap 'rm -rf "$gateway_seed"' EXIT
tar -xzf /gateway-runtime.tar.gz -C "$gateway_seed"
"$gateway_seed/bin/mprlab-gateway" install --version "$MPRLAB_GATEWAY_CI_VERSION" --archive /gateway-runtime.tar.gz
export PATH="$HOME/.local/bin:$PATH"
make "${1:-ci}"
