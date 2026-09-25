#!/bin/bash
# Nghiệm thu LOG MÁY THẬT cho tunnel iOS bằng MỘT lệnh (AGENTS.md §7d).
#
#   bash scripts/ios-acceptance-pull.sh [<udid> ...]
#
# Không tham số ⇒ dùng 2 máy test của dự án (iPhone 14 Pro Max + iPad A16).
# Việc làm: kéo `relay.log` từ container của extension → GỘP vào bản master (chống mất dòng khi
# `RelayDiagnostics` xoá cả file lúc vượt 512 KB) → chấm bằng `scripts/ios-log-acceptance.py`.
# Exit 0 = mọi máy ĐẠT; exit 1 = có máy/phiên KHÔNG ĐẠT (in rõ lý do).
set -uo pipefail
cd "$(dirname "$0")/.."

DEFAULT_DEVICES=(
  "33987D6F-5424-58C7-9CFC-7A0B1F60C717:iphone"
  "5BA3126D-4776-5F75-8B10-0A60559ED1CC:ipad"
)
if [ "$#" -gt 0 ]; then
  DEVICES=(); for d in "$@"; do DEVICES+=("$d:$(echo "$d" | tr -d '-' | tail -c 9)"); done
else
  DEVICES=("${DEFAULT_DEVICES[@]}")
fi

OUT="${IOS_ACCEPTANCE_OUT:-/tmp/ios-acceptance}"
mkdir -p "$OUT"
bad=0
for pair in "${DEVICES[@]}"; do
  ID="${pair%%:*}"; NAME="${pair##*:}"
  SRC="$OUT/pull-$NAME"
  MASTER="$OUT/master-$NAME.log"
  rm -rf "$SRC"; mkdir -p "$SRC"
  echo "== $NAME ($ID) =="
  if ! xcrun devicectl device copy from --device "$ID" --domain-type appDataContainer \
       --domain-identifier com.privatevpn.app.packet-tunnel --source Documents \
       --destination "$SRC" >/dev/null 2>&1; then
    echo "   ⚠️  không kéo được log (máy chưa cắm/khoá/mất mạng?) — bỏ qua máy này"
    bad=1; continue
  fi
  FILE="$SRC/relay.log"
  [ -f "$FILE" ] || { echo "   ⚠️  không thấy relay.log — máy chưa từng chạy tunnel?"; bad=1; continue; }
  if [ ! -f "$MASTER" ]; then
    cp "$FILE" "$MASTER"
  else
    LAST=$(tail -1 "$MASTER")
    if grep -qF -- "$LAST" "$FILE"; then
      # chỉ nối phần MỚI sau dòng cuối đã biết (giữ được cả lịch sử dù file trên máy bị xoá)
      awk -v last="$LAST" 'f{print} $0==last{f=1}' "$FILE" >> "$MASTER"
    else
      echo "### [máy đã xoá log 512KB] $(date '+%m-%d %H:%M:%S')" >> "$MASTER"
      cat "$FILE" >> "$MASTER"
    fi
  fi
  echo "   master: $MASTER ($(wc -l < "$MASTER" | tr -d ' ') dòng)"
  python3 scripts/ios-log-acceptance.py "$MASTER" | tail -3 || bad=1
done
exit $bad
