#!/usr/bin/env bash
# ios-typecheck.sh — CỔNG `swiftc -typecheck` cho iOS theo AGENTS.md §7b.
#
# Vì sao có script này: §7b BẮT BUỘC `-typecheck` (không dùng `-parse`; build 33 đã PASS `-parse`
# mà archive vẫn FAIL vì thiếu hàm), nhưng repo **không có dụng cụ nào** để chạy nó. Script này
# gói đúng hai chuyện đã tốn thời gian tìm ra:
#
#   1. App target `import WireGuardKit` (framework vendored) ⇒ gọi `swiftc` trần là
#      "no such module". Phải dựng **module shim** mô phỏng đúng API đang dùng.
#   2. `import Network` + `import NetworkExtension` cùng lúc làm `NWPath` **mơ hồ** khi gọi
#      `swiftc` trực tiếp (Xcode build không dính). Phải có shim `typealias NWPath = Network.NWPath`.
#
# Dùng:
#   bash scripts/ios-typecheck.sh            # cả hai target
#   bash scripts/ios-typecheck.sh extension  # chỉ extension (nhanh)
#   bash scripts/ios-typecheck.sh app        # chỉ app
# Exit code: 0 = 0 lỗi. Khác 0 = có lỗi (in ra).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"
SDK="$(xcrun --sdk iphoneos --show-sdk-path)"
TRIPLE="arm64-apple-ios17.0"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAIL=0

# --- Shim NWPath (xem (2) ở đầu file) -------------------------------------------------
cat > "$WORK/nwshim.swift" <<'SWIFT'
import Network
typealias NWPath = Network.NWPath
SWIFT

# --- Shim WireGuardKit (xem (1) ở đầu file) -------------------------------------------
# CHỈ mô phỏng phần API mà app đang dùng. Nếu app dùng thêm API mới, thêm vào đây — KHÔNG nới
# lỏng bằng cách bỏ qua app target.
cat > "$WORK/WireGuardKit.swift" <<'SWIFT'
import Foundation
public struct PublicKey {
    public init() {}
    public init?(rawValue: Data) {}
    public init?(base64Key: String) {}
    public var rawValue: Data { Data() }
    public var base64Key: String { "" }
}
public struct PrivateKey {
    public init() {}
    public init?(rawValue: Data) {}
    public init?(base64Key: String) {}
    public var rawValue: Data { Data() }
    public var publicKey: PublicKey { PublicKey() }
    public var base64Key: String { "" }
}
public struct PreSharedKey { public init?(base64Key: String) {} }
public struct IPAddressRange { public init?(from: String) {} }
public struct DNSServer { public init?(from: String) {} }
public struct Endpoint { public init?(from: String) {} }
public struct InterfaceConfiguration {
    public var privateKey: PrivateKey
    public var addresses: [IPAddressRange] = []
    public var dns: [DNSServer] = []
    public init(privateKey: PrivateKey) { self.privateKey = privateKey }
}
public struct PeerConfiguration {
    public var publicKey: PublicKey
    public var allowedIPs: [IPAddressRange] = []
    public var endpoint: Endpoint?
    public var preSharedKey: PreSharedKey?
    public var persistentKeepAlive: UInt16?
    public init(publicKey: PublicKey) { self.publicKey = publicKey }
}
public struct TunnelConfiguration {
    public var name: String?
    public var interface: InterfaceConfiguration
    public var peers: [PeerConfiguration]
    public init(name: String?, interface: InterfaceConfiguration, peers: [PeerConfiguration]) {
        self.name = name; self.interface = interface; self.peers = peers
    }
}
SWIFT
xcrun --sdk iphoneos swiftc -emit-module -module-name WireGuardKit -target "$TRIPLE" -sdk "$SDK" \
  "$WORK/WireGuardKit.swift" -emit-module-path "$WORK/WireGuardKit.swiftmodule" 2>/dev/null

# --- Stub WireGuardKit cho macOS (target PrivateVPNMac cũng import nó) -------------------
MAC_SDK="$(xcrun --sdk macosx --show-sdk-path)"
MAC_TRIPLE="arm64-apple-macos14.0"
mkdir -p "$WORK/mac"
cp "$WORK/WireGuardKit.swift" "$WORK/mac/"
xcrun --sdk macosx swiftc -emit-module -module-name WireGuardKit -target "$MAC_TRIPLE" -sdk "$MAC_SDK" \
  "$WORK/mac/WireGuardKit.swift" -emit-module-path "$WORK/mac/WireGuardKit.swiftmodule" 2>/dev/null

# --- Danh sách nguồn: GIỮ KHỚP `project.yml` ------------------------------------------
# (project.yml là nguồn sự thật; sửa target thì cập nhật ở đây.)
E="iOS/PrivateVPNPacketTunnel"
EXT_SOURCES=(
  "$E/HysteriaPacketTunnelProvider.swift" "$E/HysteriaTransport.swift"
  "$E/HysteriaBandwidthControl.swift" "$E/LivenessWatchdog.swift"
  "$E/TransportLadder.swift" "$E/GoodputMeter.swift" "$E/ChinaRouteBypass.swift"
  "$E/RouteReporter.swift" "$E/RampStatus.swift" "$E/IPv6Reject.swift" "$E/WSRelayClient.swift"
  "$E/RelayLink.swift" "$E/RelayUDPListener.swift" "$E/RelayDiagnostics.swift"
  "iOS/PrivateVPN/Services/HysteriaDefaults.swift"
)
# App target = cả thư mục iOS/PrivateVPN + RampStatus.swift dùng chung (project.yml dòng ~22-25).
# Lọc `._*`: ổ exFAT sinh file AppleDouble (resource fork) tên `._Foo.swift`; đưa vào swiftc là
# "invalid character in source file" oan. Không lọc thì cổng này báo lỗi giả mỗi lần build.
mapfile -t APP_SOURCES < <(find iOS/PrivateVPN -name '*.swift' ! -name '._*' | sort)
APP_SOURCES+=("$E/RampStatus.swift")

run() { # $1 = nhãn, $2.. = file
  local label="$1"; shift
  local out
  out="$(cd "$ROOT" && xcrun --sdk iphoneos swiftc -typecheck -target "$TRIPLE" -sdk "$SDK" "$@" 2>&1)"
  local n
  n="$(printf '%s\n' "$out" | grep -c 'error:')"
  if [ "$n" = "0" ]; then
    echo "✅ $label: 0 lỗi"
  else
    echo "❌ $label: $n lỗi"
    printf '%s\n' "$out" | grep 'error:' | head -20
    FAIL=1
  fi
}

run_mac() { # target macOS: PrivateVPNMac + 6 file dùng chung (theo project.yml)
  local out n files=()
  while IFS= read -r f; do files+=("$f"); done < <(find mac/PrivateVPNMac -name '*.swift' ! -name '._*' | sort)
  files+=("iOS/PrivateVPN/Services/ControlAPIClient.swift"
          "iOS/PrivateVPN/Services/WireGuardConfig.swift"
          "iOS/PrivateVPN/Services/AppVersionService.swift"
          "iOS/PrivateVPN/Services/KeychainStore.swift"
          "iOS/PrivateVPN/Services/HysteriaDefaults.swift"
          "$E/RampStatus.swift")
  out="$(cd "$ROOT" && xcrun --sdk macosx swiftc -typecheck -target "$MAC_TRIPLE" -sdk "$MAC_SDK" \
        -I "$WORK/mac" "$WORK/nwshim.swift" "${files[@]}" 2>&1)"
  n="$(printf '%s\n' "$out" | grep -c 'error:')"
  if [ "$n" = "0" ]; then
    echo "✅ macOS (shim WireGuardKit): 0 lỗi"
  else
    echo "❌ macOS: $n lỗi"
    printf '%s\n' "$out" | grep 'error:' | head -20
    FAIL=1
  fi
}

[ "$TARGET" = "all" ] || [ "$TARGET" = "extension" ] && run "extension" "$WORK/nwshim.swift" "${EXT_SOURCES[@]}"
[ "$TARGET" = "all" ] || [ "$TARGET" = "app" ] && run "app (shim WireGuardKit)" -I "$WORK" "$WORK/nwshim.swift" "${APP_SOURCES[@]}"
# macOS: bản review 26/09 đánh giá parity macOS là rủi ro CAO NHẤT, mà trước đây cổng này chỉ phủ iOS
# ⇒ sửa macOS không có gì kiểm. Thêm target này để lỗ hổng đó không lặp lại.
[ "$TARGET" = "all" ] || [ "$TARGET" = "macos" ] && run_mac

exit $FAIL
