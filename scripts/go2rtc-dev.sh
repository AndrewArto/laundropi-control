#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${GO2RTC_CONFIG_PATH:-/tmp/laundropi-go2rtc.brandoa1.yaml}"

if ! command -v go2rtc >/dev/null 2>&1; then
  echo "[go2rtc] binary not found in PATH. Download from https://github.com/AlexxIT/go2rtc/releases"
  exit 0
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
  printf "streams:\n" > "$CONFIG_PATH"
fi

exec go2rtc -config "$CONFIG_PATH"
