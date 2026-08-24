#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
output_dir="${2:-${repo_root}/artifacts}"
release_id="${3:-$(git -C "${repo_root}" rev-parse --short=12 HEAD)}"

case "${release_id}" in
  *[!A-Za-z0-9._-]*|'') echo "Unsafe release id: ${release_id}" >&2; exit 2 ;;
esac
api_dir="${repo_root}/kuaiLearning-api"
test -f "${api_dir}/pyproject.toml"
mkdir -p "${output_dir}"
artifact="${output_dir}/kuailearning-backend-${release_id}.tar.gz"
test ! -e "${artifact}" || { echo "Artifact already exists: ${artifact}" >&2; exit 2; }

build_dir="$(mktemp -d)"
cleanup() { rm -rf -- "${build_dir}"; }
trap cleanup EXIT
mkdir -p "${build_dir}/bundle/wheels"

python3 -m venv "${build_dir}/builder-venv"
"${build_dir}/builder-venv/bin/python" -m pip install --upgrade pip wheel
"${build_dir}/builder-venv/bin/pip" wheel "${api_dir}" --wheel-dir "${build_dir}/bundle/wheels"

# Prove that installation works without contacting a package index.
python3 -m venv "${build_dir}/offline-test-venv"
"${build_dir}/offline-test-venv/bin/pip" install \
  --no-index \
  --find-links "${build_dir}/bundle/wheels" \
  kuailearning-api==0.1.0
"${build_dir}/offline-test-venv/bin/python" -c \
  'import agentscope, asyncmy, fastapi, sqlalchemy; print("offline imports ok")'
"${build_dir}/offline-test-venv/bin/pip" check

git -C "${repo_root}" archive \
  --format=tar.gz \
  --output="${build_dir}/bundle/backend-source.tar.gz" \
  "${release_id}" \
  kuaiLearning-api

{
  echo "release_id=${release_id}"
  echo "os_release=$(tr '\n' ' ' </etc/os-release)"
  echo "architecture=$(uname -m)"
  echo "python=$(python3 --version 2>&1)"
  echo "glibc=$(ldd --version 2>&1 | head -n 1)"
} >"${build_dir}/bundle/platform-info.txt"

(cd "${build_dir}/bundle" && sha256sum backend-source.tar.gz wheels/* >SHA256SUMS)
tar -czf "${artifact}" -C "${build_dir}/bundle" .
sha256sum "${artifact}"
echo "Created: ${artifact}"
