#!/usr/bin/env bash
# Dựng binary hysteria2 có transport WebSocket-relay cho VPNFlow.
#
#   ./build.sh                 # mac arm64 + windows amd64 + linux amd64
#   TARGETS="darwin/arm64" ./build.sh
#
# Không sửa file nào của hysteria: script chỉ COPY thêm hai file vào checkout
# (app/internal/wsrelay/wsrelay.go, app/flowvpnrelay/main.go) rồi build — nhờ vậy
# import được package `internal/...` của chính module đó mà upstream vẫn nguyên bản.
#
# Yêu cầu: Go 1.25+, git, mạng (clone hysteria + tải gorilla/websocket lần đầu).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
TAG="app/v2.12.2"
SRC="${HYSTERIA_SRC:-/tmp/hysteria-relay-src}"
OUT="${OUT_DIR:-/tmp/hysteria-relay-dist}"
TARGETS="${TARGETS:-darwin/arm64 windows/amd64 linux/amd64}"

export GOPROXY="${GOPROXY:-https://goproxy.cn,https://goproxy.io,direct}"
export GOTOOLCHAIN="${GOTOOLCHAIN:-local}"
export CGO_ENABLED=0

if [ ! -d "$SRC/.git" ]; then
  echo "==> clone hysteria $TAG -> $SRC"
  git clone --depth 1 --branch "$TAG" https://github.com/apernet/hysteria.git "$SRC"
fi
echo "==> checkout: $(git -C "$SRC" describe --tags 2>/dev/null || echo "$TAG")"

mkdir -p "$SRC/app/internal/wsrelay" "$SRC/app/flowvpnrelay"
cp "$HERE/wsrelay.go" "$SRC/app/internal/wsrelay/wsrelay.go"
cp "$HERE/runner.go" "$SRC/app/flowvpnrelay/main.go"

echo "==> nạp gorilla/websocket (dependency duy nhất thêm vào bản build)"
(cd "$SRC/app" && go get github.com/gorilla/websocket@v1.5.3 >/dev/null)

mkdir -p "$OUT"
for t in $TARGETS; do
  os="${t%%/*}"; arch="${t##*/}"
  bin="$OUT/flowvpnrelay-$os-$arch"
  [ "$os" = "windows" ] && bin="$bin.exe"
  echo "==> build $os/$arch"
  (cd "$SRC/app" && GOOS="$os" GOARCH="$arch" go build -trimpath -ldflags "-s -w" -o "$bin" ./flowvpnrelay)
  ls -la "$bin"
  shasum -a 256 "$bin" || sha256sum "$bin"
done

echo "==> xong. Binary ở $OUT"
echo "    (repo: $REPO_ROOT — build.sh không ghi gì vào repo)"
