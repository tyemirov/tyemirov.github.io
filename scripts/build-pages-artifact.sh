#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${PAGES_DIST_DIR:-${repo_root}/.pages-dist}"
source_paths=(
  .nojekyll
  CNAME
  apple-touch-icon.png
  assets
  civilization
  data
  decisioning
  favicon.ico
  favicon.png
  favicon.svg
  freedom
  gallery/assets
  gallery/data
  gallery/images
  gallery/index.html
  gallery/js
  index.html
  music
  robots.txt
  site.js
  site.webmanifest
  sitemap.xml
  styles.css
  timeseries
)

[[ "${output_dir}" != "/" && "${output_dir}" != "${repo_root}" ]] || {
  echo "error: unsafe Pages output directory: ${output_dir}" >&2
  exit 1
}

rm -rf "${output_dir}"
mkdir -p "${output_dir}"
cd "${repo_root}"
while IFS= read -r -d '' relative_path; do
  mkdir -p "${output_dir}/$(dirname "${relative_path}")"
  cp "${relative_path}" "${output_dir}/${relative_path}"
done < <(git ls-files -z -- "${source_paths[@]}")

for required_path in .nojekyll CNAME data/site.json index.html site.js styles.css gallery/index.html; do
  [[ -f "${output_dir}/${required_path}" ]] || {
    echo "error: missing Pages source file: ${required_path}" >&2
    exit 1
  }
done
[[ "$(tr -d '\r\n' <"${output_dir}/CNAME")" == "tyemirov.net" ]] || {
  echo "error: CNAME must be tyemirov.net" >&2
  exit 1
}
echo "Prepared ${output_dir}."
