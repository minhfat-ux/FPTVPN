#!/usr/bin/env bash
# Giữ chứng chỉ TLS công khai đồng bộ giữa node-1 (control plane) và node-2 (cửa vào dự phòng).
#
# VÌ SAO CẦN: bản ghi A của meetflowai.site / api.meetflowai.site có thể trỏ về node-1 HOẶC node-2
# (đổi khi IP bị GFW chặn). Chỉ node đang giữ DNS mới xin/gia hạn được cert qua ACME (HTTP-01 /
# TLS-ALPN-01 đều kiểm tra theo tên miền). Node còn lại SẼ KHÔNG gia hạn được và cert của nó hết
# hạn sau ~90 ngày — mà node-2 lại verify cert của node-1 khi proxy (`reverse_proxy https://…`),
# nên cert node-1 hết hạn là **sập cả web** dù DNS trỏ đúng.
#
# Cách xử lý: mỗi ngày lấy cert của node còn lại, cái nào hạn XA HƠN thì đưa sang node kia, rồi
# restart Caddy ở node nhận (reload không nạp lại file cert đã thay từ ngoài).
#
#   scripts/sync-caddy-certs.sh            # chạy thật
#   scripts/sync-caddy-certs.sh --dry-run  # chỉ in ra sẽ làm gì
#
# Chạy trên node-1 (node-1 SSH sang node-2 được; chiều ngược lại thì không).
set -euo pipefail

NODE2="${NODE2:-root@165.101.114.162}"
CA_DIR="${CA_DIR:-/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory}"
DOMAINS="${DOMAINS:-meetflowai.site api.meetflowai.site}"
DRY=0
NO_RESTART=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --no-restart) NO_RESTART=1 ;;   # dùng khi thử: copy cert nhưng không đụng Caddy đang chạy
    *) echo "Tham số lạ: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '  %s\n' "$*"; }

# Cả hai hàm dưới LUÔN in ra một số nguyên (0 = không có/không đọc được), để phần so sánh
# không bao giờ gặp chuỗi rỗng ("integer expression expected").
as_epoch() {
  case "${1:-}" in
    '' | *[!0-9]*) echo 0 ;;
    *) echo "$1" ;;
  esac
}

remote_expiry() {  # -> epoch hết hạn của cert $1 trên node-2
  local out
  out=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$NODE2" \
    "openssl x509 -in '$CA_DIR/$1/$1.crt' -noout -enddate 2>/dev/null | cut -d= -f2 | xargs -r -I{} date -d '{}' +%s" \
    2>/dev/null || true)
  as_epoch "$out"
}

local_expiry() {
  local end
  end=$(openssl x509 -in "$CA_DIR/$1/$1.crt" -noout -enddate 2>/dev/null | cut -d= -f2 || true)
  [ -n "$end" ] && as_epoch "$(date -d "$end" +%s 2>/dev/null || true)" || echo 0
}

if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$NODE2" true 2>/dev/null; then
  log "Không SSH được tới $NODE2 — bỏ qua lần này (node-2 có thể đang bảo trì)."
  exit 0
fi

echo "Đồng bộ cert giữa node-1 (máy này) và $NODE2:"
changed_local=0
changed_remote=0

for domain in $DOMAINS; do
  l=$(local_expiry "$domain")
  r=$(remote_expiry "$domain")
  if [ "$l" = "0" ] && [ "$r" = "0" ]; then
    log "$domain: không đọc được cert ở cả hai node — CẦN XEM TAY"
    continue
  fi
  if [ "$r" -gt "$l" ]; then
    human_r=$(date -d "@$r" '+%Y-%m-%d %H:%M')
    human_l=$([ "$l" = "0" ] && echo "không có" || date -d "@$l" '+%Y-%m-%d %H:%M')
    log "$domain: node-2 mới hơn ($human_r > $human_l) → kéo về node-1"
    if [ "$DRY" = "0" ]; then
      mkdir -p "$CA_DIR"
      ssh -o BatchMode=yes "$NODE2" "tar -C '$CA_DIR' -cf - '$domain'" | tar -C "$CA_DIR" -xf -
      chown -R caddy:caddy "$CA_DIR/$domain"
      changed_local=1
    fi
  elif [ "$l" -gt "$r" ]; then
    human_l=$(date -d "@$l" '+%Y-%m-%d %H:%M')
    human_r=$([ "$r" = "0" ] && echo "không có" || date -d "@$r" '+%Y-%m-%d %H:%M')
    log "$domain: node-1 mới hơn ($human_l > $human_r) → đẩy sang node-2"
    if [ "$DRY" = "0" ]; then
      tar -C "$CA_DIR" -cf - "$domain" | ssh -o BatchMode=yes "$NODE2" "mkdir -p '$CA_DIR' && tar -C '$CA_DIR' -xf - && chown -R caddy:caddy '$CA_DIR/$domain'"
      changed_remote=1
    fi
  else
    log "$domain: hai node giống nhau (hết hạn $(date -d "@$l" '+%Y-%m-%d'))"
  fi
done

if [ "$DRY" = "1" ]; then
  echo "(--dry-run: chưa thay đổi gì)"
  exit 0
fi

if [ "$NO_RESTART" = "1" ] && { [ "$changed_local" = "1" ] || [ "$changed_remote" = "1" ]; }; then
  log "(--no-restart: đã copy cert nhưng KHÔNG restart Caddy — nhớ restart nếu đây không phải lần thử)"
fi

if [ "$changed_local" = "1" ] && [ "$NO_RESTART" = "0" ]; then
  log "restart Caddy trên node-1 để nạp cert mới…"
  systemctl restart caddy
  systemctl is-active caddy
fi
if [ "$changed_remote" = "1" ] && [ "$NO_RESTART" = "0" ]; then
  log "restart Caddy trên node-2 để nạp cert mới…"
  ssh -o BatchMode=yes "$NODE2" 'systemctl restart caddy && systemctl is-active caddy'
  log "lưu ý: node-2 là cửa vào công khai, restart mất ~1s kết nối đang mở."
fi
if [ "$changed_local" = "0" ] && [ "$changed_remote" = "0" ]; then
  log "không cần đồng bộ — mọi cert đã khớp."
fi
echo "Xong."
