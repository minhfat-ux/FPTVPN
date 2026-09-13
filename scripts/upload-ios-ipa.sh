#!/usr/bin/env bash
# Đưa file IPA đã build lên node-2 để nút tải trên trang /buy hoạt động.
#
# VÌ SAO CẦN: route `GET /v1/downloads/ios` của control plane đọc file **trên đĩa của chính
# máy đang chạy nó** (node-2; `IOS_IPA_DIR`, mặc định `/root/flowvpn-ipa/VPNFlow-latest.ipa`).
# Code đã deploy đúng rồi, nhưng chưa có file thì route trả 404 "IPA not found..." — nút tải
# trên trang /buy thành link chết mà không ai thấy lỗi ở đâu.
#
#   scripts/upload-ios-ipa.sh                       # lấy VPNFlow-latest.ipa trong thư mục release
#   scripts/upload-ios-ipa.sh /duong/dan/khac.ipa   # chỉ định file khác
#   HOST=root@1.2.3.4 scripts/upload-ios-ipa.sh     # đổi máy đích
#
# Chạy TỪ MAC NÀY. Chỉ cần SSH, không đụng gì khác trên server.
set -euo pipefail

SRC="${1:-/Volumes/BIWIN/Release/IoS/VPNFlow-latest.ipa}"
HOST="${HOST:-root@103.6.234.233}"          # node-2: control plane đang chạy ở đây
KEY="${KEY:-$HOME/.ssh/fpt_vpn_node}"       # key SSH vào node-2 (docs/AGENT_NEW_NODE_GUIDE.md)
DEST_DIR="${DEST_DIR:-/root/flowvpn-ipa}"
VERIFY_URL="${VERIFY_URL:-https://api.meetflowai.site/v1/downloads/ios}"

log() { printf '  %s\n' "$*"; }
die() { printf 'LỖI: %s\n' "$*" >&2; exit 1; }

[ -f "$SRC" ] || die "không thấy file IPA: $SRC (build trước bằng: bash scripts/archive-appstore.sh ios diawi)"
[ -s "$SRC" ] || die "file IPA rỗng: $SRC"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)
[ -f "$KEY" ] && SSH_OPTS+=(-i "$KEY") || log "cảnh báo: không thấy key $KEY — thử bằng ssh config/agent"

log "nguồn : $SRC ($(du -h "$SRC" | cut -f1))"
log "sha256: $(shasum -a 256 "$SRC" | cut -d' ' -f1)"
log "đích  : $HOST:$DEST_DIR/VPNFlow-latest.ipa"

if ! ssh "${SSH_OPTS[@]}" "$HOST" true 2>/dev/null; then
  cat >&2 <<HOP
LỖI: không SSH được thẳng vào $HOST.
Nếu mạng đang chặn SSH tới node-2, đi vòng qua node-1 (node-1 SSH sang node-2 được):
  scp $SRC root@103.173.155.50:/tmp/VPNFlow-latest.ipa
  ssh root@103.173.155.50 'ssh -i /root/.ssh/id_node1 $HOST "mkdir -p $DEST_DIR" && \
    scp -i /root/.ssh/id_node1 /tmp/VPNFlow-latest.ipa $HOST:$DEST_DIR/VPNFlow-latest.ipa'
HOP
  exit 1
fi

ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p '$DEST_DIR'"
# Đẩy vào tên tạm rồi đổi tên: khách đang tải dở sẽ không nhận file cụt.
scp "${SSH_OPTS[@]}" "$SRC" "$HOST:$DEST_DIR/.VPNFlow-latest.ipa.part"
ssh "${SSH_OPTS[@]}" "$HOST" "mv -f '$DEST_DIR/.VPNFlow-latest.ipa.part' '$DEST_DIR/VPNFlow-latest.ipa' && ls -l '$DEST_DIR/VPNFlow-latest.ipa'"

log "kiểm tra qua web:"
code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 -I "$VERIFY_URL" || echo 000)
if [ "$code" = "200" ]; then
  log "OK  $VERIFY_URL → 200 (nút tải trên /buy đã hoạt động)"
  curl -s -I -L --max-time 20 "$VERIFY_URL" | tr -d '\r' | grep -iE '^(content-length|content-disposition)' | sed 's/^/  /' || true
else
  log "CẢNH BÁO: $VERIFY_URL → $code (mong đợi 200). Kiểm theo thứ tự:"
  log "  1) service: ssh $HOST 'systemctl is-active flowvpn-cp'"
  log "  2) server có đặt IOS_IPA_DIR/IOS_IPA_PATH khác không:"
  log "     ssh $HOST 'systemctl show flowvpn-cp -p Environment'"
  log "     (nếu khác thì chạy lại script với DEST_DIR=<đúng thư mục>)"
  log "  3) file đã nằm đúng chỗ chưa: ssh $HOST 'ls -l $DEST_DIR'"
  exit 1
fi

log "nhắc: IPA cài được chỉ khi profile ký có UDID máy khách. Link này để TẢI file — muốn cài"
log "      trực tiếp trên máy khách thì đưa file lên Diawi (hoặc cài qua cáp/Finder)."
