#!/usr/bin/env bash
set -u

echo '=== OS ==='
cat /etc/os-release 2>/dev/null || true
echo '=== ARCHITECTURE ==='
uname -m
echo '=== GLIBC ==='
ldd --version 2>&1 | head -n 1
echo '=== PYTHON ==='
command -v python3 || true
python3 --version 2>&1 || true
python3 -m venv --help >/dev/null 2>&1 && echo 'python_venv=yes' || echo 'python_venv=no'
echo '=== SERVICES ==='
command -v systemctl || true
command -v mysql || true
mysql --version 2>&1 || true
command -v nginx || true
nginx -v 2>&1 || true
echo '=== LISTENING PORTS ==='
ss -lntp 2>/dev/null | head -n 80 || true
echo '=== DISK ==='
df -h / /opt /home 2>/dev/null || true
echo '=== CURRENT KUAILEARNING ==='
readlink -f /opt/kuailearning/api-current 2>/dev/null || true
readlink -f /opt/kuailearning/current 2>/dev/null || true
systemctl is-active kuailearning-api.service 2>/dev/null || true

echo
echo 'Return this complete output to the external build operator.'
