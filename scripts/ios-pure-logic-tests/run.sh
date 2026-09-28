#!/usr/bin/env bash
# Chạy harness swiftc cho các file thuần logic (T-20260922-10, P0-1/P0-2 + A7/A9/A10/A11).
# Không cần Xcode project/ký — chỉ cần toolchain Swift của macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/iOS/PrivateVPNPacketTunnel"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

echo "swiftc: $(swiftc --version 2>&1 | head -1)"
swiftc -O \
  "$SRC/LivenessWatchdog.swift" \
  "$SRC/TransportLadder.swift" \
  "$SRC/GoodputMeter.swift" \
  "$SRC/ChinaRouteBypass.swift" \
  "$SRC/IPv6Reject.swift" \
  "$SRC/RouteReporter.swift" \
  "$SRC/RampStatus.swift" \
  "$ROOT/iOS/PrivateVPN/Services/HysteriaDefaults.swift" \
  "$ROOT/mac/PrivateVPNMac/NetworkConflictDetector.swift" \
  "$ROOT/scripts/ios-pure-logic-tests/main.swift" \
  -o "$OUT/pure-tests"
"$OUT/pure-tests"
