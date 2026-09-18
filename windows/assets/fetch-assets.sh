#!/usr/bin/env bash
# Tải/dựng 4 binary nhúng cho tunnel userspace trên Windows:
#   - windows/assets/wintun.dll        (tải từ wintun.net)
#   - windows/assets/wireguard-go.exe  (cross-compile windows/amd64 từ wireguard-go)
#   - windows/assets/flowvpnrelay.exe  (build qua tools/hysteria-relay/build.sh — hysteria2
#                                       có transport WebSocket relay)
#   - windows/assets/sing-box.exe      (tải từ GitHub SagerNet/sing-box — TUN/định tuyến/DNS)
#
# Chạy được từ macOS/Linux. Yêu cầu: curl, unzip, git, và Go >= 1.23.
# Go được ưu tiên lấy từ .tools/go (toolchain cục bộ, đã gitignore); nếu không có
# thì dùng `go` trong PATH.
#
# Không tự commit gì. Sau khi chạy, cập nhật lại hash trong THIRD_PARTY.md nếu đổi.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ASSETS_DIR="$SCRIPT_DIR"
TOOLS_DIR="$REPO_ROOT/.tools"
WORK_DIR="$TOOLS_DIR/wg-assets-build"

SING_BOX_VERSION="1.14.1"
SING_BOX_ZIP="sing-box-${SING_BOX_VERSION}-windows-amd64.zip"
SING_BOX_URL="https://github.com/SagerNet/sing-box/releases/download/v${SING_BOX_VERSION}/${SING_BOX_ZIP}"

WINTUN_VERSION="0.14.1"
WINTUN_URL="https://www.wintun.net/builds/wintun-${WINTUN_VERSION}.zip"
WIREGUARD_GO_REPO="https://github.com/WireGuard/wireguard-go.git"

mkdir -p "$ASSETS_DIR" "$WORK_DIR"

# --- Go toolchain -----------------------------------------------------------
GO_BIN="go"
if [ -x "$TOOLS_DIR/go/bin/go" ]; then
  export GOROOT="$TOOLS_DIR/go"
  export GOPATH="$TOOLS_DIR/gopath"
  GO_BIN="$GOROOT/bin/go"
  export PATH="$GOROOT/bin:$PATH"
fi
echo "==> Dùng Go: $($GO_BIN version)"

# --- wintun.dll -------------------------------------------------------------
if [ -f "$ASSETS_DIR/wintun.dll" ]; then
  echo "==> wintun.dll đã có, bỏ qua tải"
else
  echo "==> Tải Wintun $WINTUN_VERSION"
  cd "$WORK_DIR"
  curl -fsSL -o "wintun-${WINTUN_VERSION}.zip" "$WINTUN_URL"
  rm -rf wintun
  unzip -o -q "wintun-${WINTUN_VERSION}.zip"
  cp wintun/bin/amd64/wintun.dll "$ASSETS_DIR/wintun.dll"
fi

# --- wireguard-go.exe -------------------------------------------------------
if [ -f "$ASSETS_DIR/wireguard-go.exe" ]; then
  echo "==> wireguard-go.exe đã có, bỏ qua build"
else
  echo "==> Clone + cross-compile wireguard-go (windows/amd64)"
  cd "$WORK_DIR"
  if [ ! -d wireguard-go-src ]; then
    git clone --depth 1 "$WIREGUARD_GO_REPO" wireguard-go-src
  fi
  cd wireguard-go-src
  CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
    "$GO_BIN" build -trimpath -ldflags="-s -w" -o "$ASSETS_DIR/wireguard-go.exe" .
fi

# --- flowvpnrelay.exe -------------------------------------------------------
# hysteria2 có transport WebSocket relay: đường duy nhất còn đi được khi mạng chặn thẳng
# IP node (đo thật: TCP tới IP node timeout, chỉ api.meetflowai.site:443 đi qua). Build
# bằng tools/hysteria-relay/build.sh — script đó clone hysteria tag app/v2.12.2 rồi COPY
# 2 file của mình vào checkout, KHÔNG ghi gì vào repo.
if [ -f "$ASSETS_DIR/flowvpnrelay.exe" ]; then
  echo "==> flowvpnrelay.exe đã có, bỏ qua build"
else
  echo "==> Build flowvpnrelay.exe (windows/amd64) qua tools/hysteria-relay/build.sh"
  TARGETS="windows/amd64" OUT_DIR="$WORK_DIR/hysteria-relay" \
    bash "$REPO_ROOT/tools/hysteria-relay/build.sh"
  cp "$WORK_DIR/hysteria-relay/flowvpnrelay-windows-amd64.exe" "$ASSETS_DIR/flowvpnrelay.exe"
fi

# --- sing-box.exe -----------------------------------------------------------
# Bộ não TUN/định tuyến/DNS; outbound trỏ vào SOCKS5 nội bộ của flowvpnrelay.
# GPL-3.0 — xem THIRD_PARTY.md (phân phối kèm binary GPL là có chủ đích, chủ dự án đã duyệt).
if [ -f "$ASSETS_DIR/sing-box.exe" ]; then
  echo "==> sing-box.exe đã có, bỏ qua tải"
else
  echo "==> Tải sing-box $SING_BOX_VERSION (windows/amd64)"
  cd "$WORK_DIR"
  curl -fsSL -o "$SING_BOX_ZIP" "$SING_BOX_URL"
  rm -rf "sing-box-${SING_BOX_VERSION}-windows-amd64"
  unzip -o -q "$SING_BOX_ZIP"
  cp "sing-box-${SING_BOX_VERSION}-windows-amd64/sing-box.exe" "$ASSETS_DIR/sing-box.exe"
fi

# Kiểm tra phiên bản: chỉ chạy được .exe khi có Windows/Wine. Trên macOS/Linux thì in rõ là
# bỏ qua (không im lặng coi như đã kiểm) và chỉ còn sha256 bên dưới để đối chiếu THIRD_PARTY.md.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    echo "==> sing-box.exe version:"
    "$ASSETS_DIR/sing-box.exe" version
    ;;
  *)
    echo "==> BỎ QUA kiểm tra 'sing-box.exe version': không chạy được .exe Windows trên $(uname -s)."
    echo "    Kiểm tra phiên bản thật trên máy Windows bằng: windows/installer/verify-relay.ps1"
    ;;
esac

echo "==> Xong. SHA-256:"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ASSETS_DIR/wintun.dll" "$ASSETS_DIR/wireguard-go.exe" \
    "$ASSETS_DIR/flowvpnrelay.exe" "$ASSETS_DIR/sing-box.exe"
else
  sha256sum "$ASSETS_DIR/wintun.dll" "$ASSETS_DIR/wireguard-go.exe" \
    "$ASSETS_DIR/flowvpnrelay.exe" "$ASSETS_DIR/sing-box.exe"
fi
