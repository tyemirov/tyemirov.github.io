#!/usr/bin/env bash
set -euo pipefail
gateway_seed="$(mktemp -d)"
gateway_install="$(mktemp -d)"
gateway_environment="$(git rev-parse --show-toplevel)/.mprlab/deploy/.env"
gateway_environment_owned=false
cleanup() {
  if "$gateway_environment_owned"; then
    rm -f "$gateway_environment"
  fi
  rm -rf "$gateway_seed"
  rm -rf "$gateway_install"
}
trap cleanup EXIT
(
  set -o noclobber
  cat > "$gateway_environment" <<'ENVIRONMENT'
GALLERY_TAUTH_SIGNING_KEY=gallery-ci-fixture-signing-key-not-for-production
GALLERY_GOOGLE_WEB_CLIENT_ID=fixture.apps.googleusercontent.com
DEPLOY_SUDO_PASSWORD_TUTOSH=ci-fixture-sudo-not-for-production
MPRLAB_TAUTH_MANAGEMENT_URL=http://127.0.0.1:9
MPRLAB_TAUTH_PROVISIONING_CREDENTIALS='{"tyemirov-site":{"gallery-auth":"tauthp_fixture"}}'
ENVIRONMENT
)
gateway_environment_owned=true
tar -xzf /gateway-runtime.tar.gz -C "$gateway_seed"
"$gateway_seed/bin/mprlab-gateway" install --version "$MPRLAB_GATEWAY_CI_VERSION" --archive /gateway-runtime.tar.gz --repo-root "$(git rev-parse --show-toplevel)" \
  --install-root "$gateway_install/install" --bin-root "$gateway_install/bin" --cache-root "$gateway_install/cache" > "$gateway_install/identity.json"
MPRLAB_GATEWAY_EXECUTABLE="$(node --input-type=module - "$gateway_install/identity.json" "$gateway_install/install" <<'IDENTITY'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const identity = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(identity.version, process.env.MPRLAB_GATEWAY_CI_VERSION);
assert.match(identity.platform, /^linux-(amd64|arm64)$/);
process.stdout.write(join(process.argv[3], 'releases', identity.version, identity.platform, 'runtime/bin/mprlab-gateway'));
IDENTITY
)"
export MPRLAB_GATEWAY_EXECUTABLE
export PATH="$gateway_install/bin:$PATH"
make "${1:-ci}"
