#!/usr/bin/env bash
# deploy-control-plane.sh — triển khai thay đổi control-plane TỪ WORKSPACE CỦA AGENT lên
# bản đang chạy, có kiểm tra + tự ROLLBACK nếu bản mới không khoẻ.
#
# Vì sao cần: agent trên server phải "tự sửa lỗi xong là chạy được", nhưng không được phép
# làm sập control plane của khách. Script này là ranh giới an toàn:
#   1) chỉ nhận file .js trong src/ (không đụng .env, systemd, dữ liệu)
#   2) kéo theo module phụ thuộc + kiểm đồ thị module (chống ERR_MODULE_NOT_FOUND)
#   3) node --check từng file + chạy test suite
#   4) backup bản đang chạy, copy, restart, kiểm tra /health
#   5) /health không 200 ⇒ tự khôi phục backup + restart lại
#
# Dùng:  scripts/server-agent/deploy-control-plane.sh [--dry-run] [--files a.js,b.js]
set -euo pipefail

WS="${WS:-/root/flowvpn-agent/control-plane}"
LIVE="${LIVE:-/root/flowvpn-cp}"
SERVICE="${SERVICE:-flowvpn-cp.service}"
ENTRY="${ENTRY:-index.js}"   # entrypoint service chạy (systemd ExecStart)
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:7778/health}"
DRY_RUN=0
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --files) shift; ONLY="${1:-}" ;;
    *) echo "tham số lạ: $1" >&2; exit 2 ;;
  esac
  shift
done

log() { printf '  %s\n' "$*"; }

# Đồ thị module nội bộ — một nguồn phân tích duy nhất cho cả "kéo theo phụ thuộc" và "kiểm tra".
# Vì sao: `--files` chỉ liệt kê file MUỐN deploy; nếu file đó import một module MỚI chưa có trên
# live thì deploy một-file sẽ làm live crash-loop (Node ERR_MODULE_NOT_FOUND). Đã xảy ra thật
# 23/09 10:20 (+07): index.js import ./bw-policy.js nhưng chỉ index.js được copy ⇒ service restart
# fail 12 lần liên tiếp (10:20:08→10:20:48), API không phục vụ được khách. `node --check` KHÔNG
# bắt được lỗi này vì nó chỉ kiểm cú pháp, không resolve import.
#   modgraph closure            → in danh sách file sẽ deploy (khớp --files + mọi module nó import, đệ quy)
#   modgraph check <changed...> → kiểm bản LIVE SAU khi copy resolve đủ import, tính từ $ENTRY
modgraph() {
  MODE="$1" ENTRYPOINT="$ENTRY" SRC_WS="$WS/src" SRC_LIVE="$LIVE/src" CHANGED="${2:-}" ONLY="$ONLY" node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { MODE, SRC_WS: ws, SRC_LIVE: live, ENTRYPOINT: entry } = process.env;
const changed = (process.env.CHANGED || "").split(/\s+/).filter(Boolean);
const only = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const listJs = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
// Chỉ lấy import trỏ ra file nội bộ ("./x.js"): import package/node: không ảnh hưởng deploy.
const localImports = (file) => {
  const src = fs.readFileSync(file, "utf8");
  const out = new Set();
  const patterns = [
    /\bfrom\s*["'](\.[^"']+)["']/g,
    /\bimport\s*["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) out.add(m[1]);
  }
  return [...out];
};
const resolve = (from, dep) => path.posix.normalize(path.posix.join(path.posix.dirname(from), dep));

if (MODE === "closure") {
  const unknown = only.filter((f) => !fs.existsSync(path.join(ws, f)));
  if (unknown.length) {
    console.error(`LỖI: --files nêu file không có trong workspace: ${unknown.join(", ")}`);
    process.exit(1);
  }
  const picked = listJs(ws).filter((f) => only.length === 0 || only.includes(f));
  const keep = new Set(picked);
  const queue = [...picked];
  const broken = [];
  while (queue.length) {
    const cur = queue.shift();
    for (const dep of localImports(path.join(ws, cur))) {
      const base = resolve(cur, dep);
      if (!fs.existsSync(path.join(ws, base))) { broken.push(`${cur} import ${dep}`); continue; }
      if (!keep.has(base)) { keep.add(base); queue.push(base); }
    }
  }
  if (broken.length) {
    console.error(`LỖI: workspace thiếu module được import: ${broken.join("; ")}`);
    process.exit(1);
  }
  console.log(listJs(ws).filter((f) => keep.has(f)).join(" "));
  process.exit(0);
}

// check: bản LIVE sau deploy = file đang có ở LIVE ∪ file sắp copy từ workspace
const known = new Set([...listJs(live), ...changed]);
const seen = new Set();
const missing = [];
const queue = [...new Set([entry, ...changed])];
while (queue.length) {
  const cur = queue.shift();
  if (seen.has(cur)) continue;
  seen.add(cur);
  const fromWs = changed.includes(cur);
  const file = path.join(fromWs ? ws : live, cur);
  if (!fs.existsSync(file)) { missing.push(`${cur} (không có ở ${fromWs ? "workspace" : "LIVE"})`); continue; }
  for (const dep of localImports(file)) {
    const base = resolve(cur, dep);
    if (!known.has(base)) missing.push(`${cur} → ${dep}`);
    else queue.push(base);
  }
}
if (missing.length) {
  console.error("LỖI: import nội bộ không resolve được ⇒ restart sẽ crash-loop:");
  for (const m of [...new Set(missing)]) console.error("  - " + m);
  process.exit(1);
}
console.log(`  OK: đồ thị module ${seen.size} file (từ ${entry}) resolve đủ`);
NODE
}
[ -d "$WS/src" ] || { echo "LỖI: không thấy $WS/src" >&2; exit 1; }
[ -d "$LIVE/src" ] || { echo "LỖI: không thấy $LIVE/src" >&2; exit 1; }

# --- 0) chặn tai nạn: workspace cũ hơn bản đang chạy --------------------------
# Deploy copy MỌI file src/*.js khác nhau. Nếu bản đang chạy có file mà workspace không có,
# lần deploy đó sẽ làm live mất tính năng tương ứng (suýt xảy ra thật 17/09: live có
# geoip.js/gfw-watch.js/mmdb.js còn workspace thì không). Thà dừng lại bắt đồng bộ workspace.
missing=()
for f in "$LIVE"/src/*.js; do
  base="$(basename "$f")"
  [ -f "$WS/src/$base" ] || missing+=("$base")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "LỖI: workspace thiếu file so với bản đang chạy: ${missing[*]}" >&2
  echo "  → đồng bộ workspace trước (cp -a $LIVE/src/. $WS/src/), nếu không deploy sẽ làm mất tính năng." >&2
  exit 1
fi

# --- 1) danh sách file .js khác nhau (kèm mọi module phụ thuộc) --------------
# shellcheck disable=SC2086
selected="$(modgraph closure)" || exit 1
changed=()
for base in $selected; do
  if [ ! -f "$LIVE/src/$base" ] || ! cmp -s "$WS/src/$base" "$LIVE/src/$base"; then changed+=("$base"); fi
done

if [ "${#changed[@]}" -eq 0 ]; then
  log "không có file src/*.js nào khác bản đang chạy — không cần deploy"
  exit 0
fi
log "file thay đổi (${#changed[@]}): ${changed[*]}"

# --- 1b) đồ thị module của bản LIVE SAU copy phải resolve đủ ------------------
# Kiểm TRƯỚC khi copy: thà không deploy còn hơn để live ở trạng thái crash-loop.
modgraph check "${changed[*]}" || {
  echo "  → bổ sung module còn thiếu vào workspace (hoặc gọi kèm file đó trong --files)" >&2
  exit 1
}

if [ "$DRY_RUN" = "1" ]; then log "--dry-run: chỉ liệt kê, không làm gì"; exit 0; fi

# --- 2) kiểm tra cú pháp + test ---------------------------------------------
log "node --check từng file thay đổi"
for base in "${changed[@]}"; do node --check "$WS/src/$base"; done
if [ -d "$WS/test" ]; then
  log "chạy test suite trong workspace"
  ( cd "$WS" && node --test test/*.test.js ) >/tmp/deploy-cp-test.log 2>&1 || {
    echo "LỖI: test suite FAIL — không deploy. Xem /tmp/deploy-cp-test.log" >&2
    tail -20 /tmp/deploy-cp-test.log >&2
    exit 1
  }
  grep -E '^ℹ (tests|pass|fail)' /tmp/deploy-cp-test.log | sed 's/^/    /' || true
fi

# --- 3) backup + copy + restart ---------------------------------------------
TS="$(date -u +%Y%m%d-%H%M%S)"
BK="$LIVE/src-backup-$TS"
mkdir -p "$BK"
added=()
for base in "${changed[@]}"; do
  # File MỚI (chưa có ở live) thì không có gì để backup — trước đây `cp -a` fail làm cả deploy
  # abort dưới `set -e`, nên script không thể thêm file mới; agent phải copy tay (đúng đường
  # gây crash-loop 23/09). Giờ theo dõi riêng để rollback xoá được.
  if [ -f "$LIVE/src/$base" ]; then cp -a "$LIVE/src/$base" "$BK/$base"; else added+=("$base"); fi
done
log "backup: $BK (giờ máy $(date '+%F %T %Z'))"
if [ "${#added[@]}" -gt 0 ]; then log "file MỚI (chưa có ở live): ${added[*]}"; fi
for base in "${changed[@]}"; do install -m 644 "$WS/src/$base" "$LIVE/src/$base"; done
log "đã copy ${#changed[@]} file"

# --- 3b) xác nhận trên bản LIVE đã copy, TRƯỚC khi restart -------------------
modgraph check "" || {
  echo "LỖI: bản LIVE sau copy KHÔNG resolve đủ import → khôi phục, KHÔNG restart" >&2
  for base in "${changed[@]}"; do
    if [ -f "$BK/$base" ]; then cp -a "$BK/$base" "$LIVE/src/$base"; else rm -f "$LIVE/src/$base"; fi
  done
  exit 1
}

systemctl restart "$SERVICE"
sleep 2

# --- 4) kiểm tra sức khoẻ, rollback nếu hỏng --------------------------------
# Control plane cần vài giây để nạp store rồi mới phục vụ /health ⇒ phải thử lại, nếu không
# script sẽ báo "hỏng" oan và rollback một bản lành (đã xảy ra thật 16/09).
healthy=0
for i in $(seq 1 10); do
  if curl -s -o /dev/null -w '%{http_code}' -m 5 "$HEALTH_URL" | grep -qE '^2'; then healthy=1; break; fi
  sleep 2
done
if [ "$healthy" = "1" ]; then
  log "health OK ($HEALTH_URL) — deploy xong"
  echo "$TS" > /var/lib/flowvpn-last-deploy 2>/dev/null || true
  exit 0
fi

echo "LỖI: health check KHÔNG 200 sau 20s → tự khôi phục bản cũ" >&2
for base in "${changed[@]}"; do
  if [ -f "$BK/$base" ]; then cp -a "$BK/$base" "$LIVE/src/$base"; else rm -f "$LIVE/src/$base"; fi
done
systemctl restart "$SERVICE"
sleep 2
echo "đã rollback từ $BK (service: $(systemctl is-active "$SERVICE"))" >&2
exit 1
