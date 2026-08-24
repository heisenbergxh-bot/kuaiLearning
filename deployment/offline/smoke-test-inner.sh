#!/usr/bin/env bash
set -euo pipefail

public_url="${1:-http://127.0.0.1:8080}"
public_url="${public_url%/}"

systemctl is-active kuailearning-api.service
curl -fsS http://127.0.0.1:8001/api/v1/health/live
echo
curl -fsS "${public_url}/api/v1/health/live"
echo
curl -fsS "${public_url}/" | grep -Eo 'assets/index-[A-Za-z0-9_-]+\.js' | head -n 1

http_code="$(curl -sS -o /dev/null -w '%{http_code}' "${public_url}/api/v1/me")"
case "${http_code}" in
  200|401) echo "Authentication boundary HTTP ${http_code}: ok" ;;
  *) echo "Unexpected /api/v1/me HTTP status: ${http_code}" >&2; exit 1 ;;
esac
