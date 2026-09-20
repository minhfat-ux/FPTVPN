#!/usr/bin/env bash
#
# Deploy node-2 NGUYÊN GÓI — để không bao giờ lặp lại cảnh file lệch bộ.
#
#   bash ops/deploy-node2.sh --server     # server/src + restart
#   bash ops/deploy-node2.sh --web        # build web rồi đẩy dist
#   bash ops/deploy-node2.sh --all
#
# Vì sao phải nguyên gói: đã gặp thật — deploy từng file bằng nhiều lệnh scp, một lệnh dừng giữa
# chừng, thế là routes.js mới đi kèm skills/hub.js cũ ⇒ service crash-loop
# ("does not provide an export named 'HUB_KINDS'") và web 502 suốt. Gói tar + kiểm tra md5 thì
# hoặc là lên hết, hoặc là không lên gì.
#
# Đọc docs/PORTS-AND-SERVICES.md trước khi sửa script này.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@165.101.114.162}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/fpt_vpn_node}"
APP_DIR="/opt/fbuddy"
PORT=7790
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=12 "$HOST")

do_server=0
do_web=0
for arg in "$@"; do
  case "$arg" in
    --server) do_server=1 ;;
    --web) do_web=1 ;;
    --all) do_server=1; do_web=1 ;;
    *) echo "Tham số lạ: $arg (dùng --server | --web | --all)" >&2; exit 2 ;;
  esac
done
[ $do_server -eq 0 ] && [ $do_web -eq 0 ] && { echo "Chưa chọn gì. Dùng --server | --web | --all" >&2; exit 2; }

cd "$(dirname "$0")/.."

if [ $do_server -eq 1 ]; then
  echo "== 1/3: sao lưu bản đang chạy trên node-2 =="
  "${SSH[@]}" "cd $APP_DIR && rm -rf /root/backup-src && cp -r server/src /root/backup-src && echo 'đã sao lưu /root/backup-src'"

  echo "== 2/3: đẩy nguyên gói server =="
  tar czf /tmp/fbuddy-server-sync.tgz server/src server/package.json
  scp -i "$KEY" -o StrictHostKeyChecking=no /tmp/fbuddy-server-sync.tgz "$HOST:/tmp/fbuddy-server-sync.tgz"
  "${SSH[@]}" "tar xzf /tmp/fbuddy-server-sync.tgz -C $APP_DIR && cd $APP_DIR && for f in \$(find server/src -name '*.js'); do node --check \"\$f\" || { echo \"LỖI CÚ PHÁP \$f\"; exit 1; }; done && echo 'cú pháp OK'"

  echo "== 3/3: restart + kiểm tra =="
  # Bước kiểm tra có thể trả mã khác 0 (ví dụ `grep` không khớp) — KHÔNG được để nó làm script
  # thoát giữa chừng, vì như vậy phần --web phía sau sẽ bị bỏ qua trong im lặng (đã gặp thật:
  # server lên bản mới mà web vẫn là bundle cũ).
  "${SSH[@]}" "systemctl restart fbuddy && sleep 5 && systemctl is-active fbuddy && ss -ltnp | grep $PORT && curl -s -o /dev/null -w 'web %{http_code}\n' http://127.0.0.1:$PORT/ && curl -s -o /dev/null -w 'api/hub %{http_code} (401 là đúng khi chưa đăng nhập)\n' http://127.0.0.1:$PORT/api/hub" || echo "! Bước kiểm tra sau restart có lỗi — đọc kỹ kết quả phía trên trước khi làm tiếp."
fi

if [ $do_web -eq 1 ]; then
  echo "== build web =="
  npm --workspace web run build
  local_bundle=$(grep -o 'index-[A-Za-z0-9_-]*\.js' web/dist/index.html | head -1)
  echo "bundle vừa build: $local_bundle"
  tar czf /tmp/fbuddy-dist.tgz -C web dist
  scp -i "$KEY" -o StrictHostKeyChecking=no /tmp/fbuddy-dist.tgz "$HOST:/tmp/fbuddy-dist.tgz"
  "${SSH[@]}" "cd $APP_DIR/web && rm -rf dist.prev && cp -r dist dist.prev && rm -rf dist && tar xzf /tmp/fbuddy-dist.tgz -C $APP_DIR/web && echo -n 'bundle trên server: ' && grep -o 'index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1"
fi

echo "== xong. Nhớ kiểm tra docs/PORTS-AND-SERVICES.md §5 =="
