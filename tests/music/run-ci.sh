#!/usr/bin/env bash
set -euo pipefail
git clone --quiet /gateway.bundle /mprlab-gateway
exec make ci
