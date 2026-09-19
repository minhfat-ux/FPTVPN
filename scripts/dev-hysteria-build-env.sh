#!/usr/bin/env bash
# In ra 2 build setting cho credential hysteria2 để build app Apple:
#
#   eval "$(scripts/dev-hysteria-build-env.sh)"
#   xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPNMac -configuration Release \
#     HYST_PASSWORD="$HYST_PASSWORD" HYST_OBFS="$HYST_OBFS" build
#
# Vì sao đọc từ Config.kt của Android: credential hysteria đang là giá trị DÙNG CHUNG và
# nguồn sự thật duy nhất nằm trong `android/app/src/main/java/com/privatevpn/app/Config.kt`
# (HY_PASSWORD / HY_OBFS). Script này KHÔNG chứa giá trị nào và KHÔNG ghi ra file — chỉ
# grep tại chỗ rồi in ra shell, nên secret không vào repo/log (AGENTS.md §1).
#
# Giá trị vẫn là nợ bảo mật đã biết (docs/TRANSPORT_SPEED_2026-09-19.md §10): phải chuyển
# server sang auth theo người dùng rồi xoay credential.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_KT="$ROOT/android/app/src/main/java/com/privatevpn/app/Config.kt"

if [[ ! -f "$CONFIG_KT" ]]; then
  echo "dev-hysteria-build-env: không thấy $CONFIG_KT" >&2
  exit 1
fi

read_const() {
  local name="$1" value
  value="$(grep -E "const val ${name} *=" "$CONFIG_KT" | head -1 | sed -E 's/.*"(.*)".*/\1/')"
  if [[ -z "$value" || "$value" == "$(grep -E "const val ${name} *=" "$CONFIG_KT" | head -1)" ]]; then
    echo "dev-hysteria-build-env: không đọc được $name từ Config.kt" >&2
    exit 1
  fi
  printf '%s' "$value"
}

printf 'export HYST_PASSWORD=%q\n' "$(read_const HY_PASSWORD)"
printf 'export HYST_OBFS=%q\n' "$(read_const HY_OBFS)"
