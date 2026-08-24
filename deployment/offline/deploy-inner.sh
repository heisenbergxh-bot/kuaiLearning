#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 2
fi
if [[ "$#" -ne 3 ]]; then
  echo "Usage: $0 BACKEND_BUNDLE FRONTEND_TAR RELEASE_ID" >&2
  exit 2
fi

backend_bundle="$(readlink -f "$1")"
frontend_tar="$(readlink -f "$2")"
release_id="$3"
case "${release_id}" in
  *[!A-Za-z0-9._-]*|'') echo "Unsafe release id: ${release_id}" >&2; exit 2 ;;
esac
test -f "${backend_bundle}"
test -f "${frontend_tar}"
test -f /opt/kuailearning/api.env
id kuailearning >/dev/null 2>&1

platform_info="$(tar -xOf "${backend_bundle}" ./platform-info.txt)"
bundle_arch="$(printf '%s\n' "${platform_info}" | sed -n 's/^architecture=//p')"
bundle_python="$(printf '%s\n' "${platform_info}" | sed -n 's/^python=Python //p')"
local_arch="$(uname -m)"
local_python="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
case "${bundle_python}" in "${local_python}".*) ;; *)
  echo "Python mismatch: bundle=${bundle_python}, server=${local_python}" >&2; exit 2 ;;
esac
if [[ "${bundle_arch}" != "${local_arch}" ]]; then
  echo "Architecture mismatch: bundle=${bundle_arch}, server=${local_arch}" >&2
  exit 2
fi

api_release="/opt/kuailearning/api-releases/${release_id}"
front_release="/opt/kuailearning/releases/${release_id}"
case "${api_release}" in /opt/kuailearning/api-releases/*) ;; *) exit 2 ;; esac
case "${front_release}" in /opt/kuailearning/releases/*) ;; *) exit 2 ;; esac
test ! -e "${api_release}"
test ! -e "${front_release}"

mkdir -p /opt/kuailearning/api-releases /opt/kuailearning/releases /opt/kuailearning/backups
mkdir "${api_release}"
mkdir "${front_release}"
tar -xzf "${backend_bundle}" -C "${api_release}"
(cd "${api_release}" && sha256sum -c SHA256SUMS)
tar -xzf "${api_release}/backend-source.tar.gz" -C "${api_release}"
tar -xzf "${frontend_tar}" -C "${front_release}"
test -f "${front_release}/index.html"
test -f "${api_release}/kuaiLearning-api/alembic.ini"

python3 -m venv "${api_release}/.venv"
"${api_release}/.venv/bin/pip" install \
  --no-index \
  --find-links "${api_release}/wheels" \
  kuailearning-api==0.1.0
"${api_release}/.venv/bin/python" -c \
  'import agentscope, asyncmy, fastapi, sqlalchemy; print("runtime imports ok")'
"${api_release}/.venv/bin/pip" check

chown -R kuailearning:kuailearning "${api_release}"
chmod -R a+rX "${front_release}"

# Existing installations must provide a protected MySQL client defaults file for backup.
if [[ -L /opt/kuailearning/api-current ]]; then
  test -f /opt/kuailearning/mysql-backup.cnf || {
    echo "Missing /opt/kuailearning/mysql-backup.cnf; refusing upgrade without a backup." >&2
    exit 3
  }
  backup_file="/opt/kuailearning/backups/before-${release_id}-$(date +%Y%m%d-%H%M%S).sql"
  mysqldump \
    --defaults-extra-file=/opt/kuailearning/mysql-backup.cnf \
    --single-transaction \
    --routines \
    kuailearning >"${backup_file}"
  test -s "${backup_file}"
  chmod 600 "${backup_file}"
  echo "Database backup: ${backup_file}"
fi

set -a
# api.env is maintained as simple KEY=value entries and must contain no shell commands.
. /opt/kuailearning/api.env
set +a
(cd "${api_release}/kuaiLearning-api" && "${api_release}/.venv/bin/alembic" upgrade head)

old_api="$(readlink -f /opt/kuailearning/api-current 2>/dev/null || true)"
if [[ -n "${old_api}" ]]; then
  case "${old_api}" in /opt/kuailearning/api-releases/*) ;; *) echo "Unsafe old API link" >&2; exit 4 ;; esac
fi
ln -sfn "${api_release}" /opt/kuailearning/api-current
systemctl restart kuailearning-api.service

healthy=0
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS http://127.0.0.1:8001/api/v1/health/live >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done
if [[ "${healthy}" -ne 1 ]]; then
  echo "New API failed health check." >&2
  if [[ -n "${old_api}" ]]; then
    ln -sfn "${old_api}" /opt/kuailearning/api-current
    systemctl restart kuailearning-api.service
    echo "API link rolled back to ${old_api}; database backup may still need restoration." >&2
  fi
  exit 5
fi

ln -sfn "${front_release}" /opt/kuailearning/current
echo "Release ${release_id} installed. Validate Nginx configuration, reload it, then run smoke-test-inner.sh."
