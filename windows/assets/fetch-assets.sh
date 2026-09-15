#!/usr/bin/env bash
# Tải/dựng 2 binary nhúng cho tunnel userspace trên Windows:
#   - windows/assets/wintun.dll      (tải từ wintun.net)
#   - windows/assets/wireguard-go.exe (cross-compile windows/amd64 từ wireguard-go)
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

echo "==> Xong. SHA-256:"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ASSETS_DIR/wintun.dll" "$ASSETS_DIR/wireguard-go.exe"
else
  sha256sum "$ASSETS_DIR/wintun.dll" "$ASSETS_DIR/wireguard-go.exe"
fi
