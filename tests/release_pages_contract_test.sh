#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_dir="${repo_root}/scripts/release"
forbidden="../agent""Skills/gitrelease/scripts"

if grep -R -F "${forbidden}" "${repo_root}/Makefile" "${repo_root}/scripts" >/dev/null; then
  echo "error: release commands must not use mutable sibling tooling" >&2
  exit 1
fi

for tool in prepare_release.sh publish_release.sh release_helper.py prepare_pages_artifact.sh deploy_pages_artifact.sh; do
  [[ -x "${release_dir}/${tool}" ]] || {
    echo "error: repo-owned release tool is missing or not executable: scripts/release/${tool}" >&2
    exit 1
  }
done

temporary_directory="$(mktemp -d)"
trap 'rm -rf "${temporary_directory}"' EXIT
source_directory="${temporary_directory}/source"
artifact_directory="${temporary_directory}/artifact"
fixture_directory="${temporary_directory}/published-release"
fake_bin="${temporary_directory}/bin"
mkdir -p "${source_directory}" "${artifact_directory}" "${fixture_directory}" "${fake_bin}"

version="v9.8.7"
source_commit="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
release_commit="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
printf '<!doctype html><title>release contract</title>\n' >"${source_directory}/index.html"
cat >"${artifact_directory}/staging.json" <<EOF
{
  "schema_version": 1,
  "version": "${version}",
  "source_commit": "${source_commit}",
  "release_timestamp": "2026-07-10T12:00:00-0700"
}
EOF

RELEASE_VERSION="${version}" RELEASE_ARTIFACT_DIR="${artifact_directory}" \
  "${release_dir}/prepare_pages_artifact.sh" --source "${source_directory}"

archive="${artifact_directory}/payloads/release-assets/pages.tar.gz"
[[ -f "${archive}" ]] || { echo "error: Pages artifact was not prepared" >&2; exit 1; }
tar -xOf "${archive}" ./.nojekyll >"${temporary_directory}/nojekyll"
[[ ! -s "${temporary_directory}/nojekyll" ]] || { echo "error: .nojekyll must be empty" >&2; exit 1; }
source_marker="${temporary_directory}/source-marker.json"
release_marker="${temporary_directory}/release-marker.json"
tar -xOf "${archive}" ./.mprlab-release.json >"${source_marker}"
python3 - "${source_marker}" "${release_marker}" "${version}" "${source_commit}" "${release_commit}" <<'PY'
import json
import pathlib
import sys

source_path, release_path, version, source_commit, release_commit = sys.argv[1:]
marker = json.loads(pathlib.Path(source_path).read_text(encoding="utf-8"))
if marker != {
    "schema_version": 1,
    "release_version": version,
    "source_commit": source_commit,
    "release_timestamp": "2026-07-10T12:00:00-0700",
}:
    raise SystemExit("prepared Pages marker does not preserve source provenance")
if marker["source_commit"] == release_commit:
    raise SystemExit("prepared Pages marker incorrectly uses the release commit")
marker["source_commit"] = release_commit
pathlib.Path(release_path).write_text(json.dumps(marker) + "\n", encoding="utf-8")
PY

asset_sha256="$(shasum -a 256 "${archive}" | awk '{print $1}')"
cp "${archive}" "${fixture_directory}/pages.tar.gz"
python3 - "${fixture_directory}/manifest.json" "${version}" "${source_commit}" "${release_commit}" "${asset_sha256}" <<'PY'
import json
import pathlib
import sys

path, version, source_commit, release_commit, sha256 = sys.argv[1:]
manifest = {
    "schema_version": 2,
    "artifact_kind": "mprlab.release",
    "version": version,
    "source_commit": source_commit,
    "release_commit": release_commit,
    "payloads": [
        {
            "path": "payloads/release-assets/pages.tar.gz",
            "sha256": sha256,
        }
    ],
}
pathlib.Path(path).write_text(json.dumps(manifest) + "\n", encoding="utf-8")
PY

cat >"${fake_bin}/git" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  rev-parse)
    [[ "${2:-}" == "--show-toplevel" ]] || exit 64
    printf '%s\n' "${TEST_REPO_ROOT}"
    ;;
  ls-remote)
    printf '%s\trefs/tags/%s^{}\n' "${TEST_RELEASE_COMMIT}" "${TEST_VERSION}"
    ;;
  remote)
    [[ "${2:-}" == "get-url" ]] || exit 64
    printf 'fake://release-contract\n'
    ;;
  clone)
    destination="${!#}"
    mkdir -p "${destination}/.git"
    ;;
  -C)
    case "${3:-}" in
      show-ref) exit 1 ;;
      diff) exit 1 ;;
      checkout|add|commit|push) exit 0 ;;
      -c) exit 0 ;;
      *) echo "unexpected git -C command: ${3:-<missing>}" >&2; exit 64 ;;
    esac
    ;;
  *)
    echo "unexpected git command: ${*}" >&2
    exit 64
    ;;
esac
SH

cat >"${fake_bin}/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "release" && "${2:-}" == "download" ]]; then
  shift 2
  destination=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dir) destination="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  [[ -n "${destination}" ]] || exit 64
  cp "${TEST_RELEASE_FIXTURE}/manifest.json" "${TEST_RELEASE_FIXTURE}/pages.tar.gz" "${destination}/"
  exit 0
fi
if [[ "${1:-}" == "api" ]]; then
  exit 0
fi
echo "unexpected gh command: ${*}" >&2
exit 64
SH

cat >"${fake_bin}/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cat "${TEST_PAGES_MARKER}"
SH
chmod +x "${fake_bin}/git" "${fake_bin}/gh" "${fake_bin}/curl"

common_environment=(
  "PATH=${fake_bin}:${PATH}"
  "TEST_REPO_ROOT=${repo_root}"
  "TEST_RELEASE_COMMIT=${release_commit}"
  "TEST_RELEASE_FIXTURE=${fixture_directory}"
  "TEST_VERSION=${version}"
  "PAGES_VERIFY_ATTEMPTS=1"
  "PAGES_VERIFY_DELAY_SECONDS=0"
)

env "${common_environment[@]}" "TEST_PAGES_MARKER=${source_marker}" \
  "${release_dir}/deploy_pages_artifact.sh" \
  --remote origin --branch gh-pages --version "${version}" --url https://pages.example.test/ \
  >"${temporary_directory}/source-marker.out" 2>"${temporary_directory}/source-marker.err"
grep -F "Verified https://pages.example.test/ at source ${source_commit}." \
  "${temporary_directory}/source-marker.out" >/dev/null

if env "${common_environment[@]}" "TEST_PAGES_MARKER=${release_marker}" \
  "${release_dir}/deploy_pages_artifact.sh" \
  --remote origin --branch gh-pages --version "${version}" --url https://pages.example.test/ \
  >"${temporary_directory}/release-marker.out" 2>"${temporary_directory}/release-marker.err"; then
  echo "error: deploy accepted a public Pages marker containing the release commit" >&2
  exit 1
fi
grep -F "Pages marker did not reach source ${source_commit}" \
  "${temporary_directory}/release-marker.err" >/dev/null

echo "repo-owned Pages release contract passed"
