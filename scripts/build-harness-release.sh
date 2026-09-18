#!/usr/bin/env bash
# Build (va tuy chon upload) goi FlowTech Harness cho Windows + macOS.
#
# Nguon su that: .dhs-setup/fpt-harness-package/{windows,mac}
#   windows/  install-fpt-harness.ps1, README-WINDOWS.md, patches/, profile/, tools/, vps/
#   mac/      install-mac.sh, README-MAC.md, setup-tunnel.sh, patches/, profile/
#
# Ket qua (trong .tmp/harness-release/):
#   flowvpn-harness-windows-<sha8>.zip     (root: flowvpn-harness-windows/)
#   flowvpn-harness-mac-<sha8>.zip         (root: flowvpn-harness-mac/)
#   latest.json                            ({version, windows:{file,sha256}, mac:{...}})
#
# Dung:
#   bash scripts/build-harness-release.sh            # chi build
#   bash scripts/build-harness-release.sh --upload   # build + day len node-2 + verify qua CDN
#
# Ghi chu:
#   - Zip duoc tao bang python (entry '/' , timestamp co dinh) => build lai ra cung sha256.
#   - Ten file kem <sha8> nen URL bat bien, khong bi Cloudflare cache 4h lam sai phien ban.
#   - Script TU CHOI dong goi neu phat hien mat khau mac dinh con trong nguon (repo public).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$ROOT/.dhs-setup/fpt-harness-package"
OUT="$ROOT/.tmp/harness-release"

NODE2="root@165.101.114.162"
JUMP="root@103.173.155.50"
REMOTE_DIR="/var/www/flowvpn/dl/harness"
BASE_URL="https://meetflowai.site/dl/harness"

UPLOAD=0
[[ "${1:-}" == "--upload" ]] && UPLOAD=1

PY="${PYTHON:-python}"
command -v "$PY" >/dev/null 2>&1 || PY=python3

log() { printf '==> %s\n' "$*" >&2; }
die() { printf '!!  %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- stage
stage_tree() { # $1 = windows|mac  -> in ra duong dan stage
  local plat="$1" src="$PKG/$1" dst="$OUT/flowvpn-harness-$1"
  if [[ ! -d "$src/patches" || ! -f "$src/profile/cordis.patch.yml" ]]; then
    # ban clone moi: patches/profile cua Windows nam trong bundle zip da track trong repo
    local bundle="$PKG/windows/fpt-harness-windows-bundle.zip"
    if [[ "$plat" == "windows" && -f "$bundle" ]]; then
      log "Khoi phuc patches/ + profile/ tu $bundle"
      "$PY" - "$bundle" "$PKG" >&2 <<'PYEOF'
import os, sys, zipfile
z = zipfile.ZipFile(sys.argv[1]); pkg = sys.argv[2]
dest_root = os.path.join(pkg, "windows")
n = 0
for name in z.namelist():
    if name.startswith("windows/patches/") or name.startswith("windows/profile/"):
        target = os.path.join(dest_root, name[len("windows/"):].replace("/", os.sep))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f:
            f.write(z.read(name))
        n += 1
print("   khoi phuc %d file" % n)
PYEOF
    fi
  fi
  [[ -d "$src/patches" ]] || die "THIEU $src/patches — copy tu goi phat hanh truoc"
  [[ -f "$src/profile/cordis.patch.yml" ]] || die "THIEU $src/profile/cordis.patch.yml"
  rm -rf "$dst"; mkdir -p "$dst"
  cp -R "$src"/. "$dst"/
  # bo artifact: zip cu + backup cua chinh goi (KHONG xoa patches/*.bak — la asset cua patch)
  find "$dst" -type f \( -name 'fpt-harness-windows-bundle.zip*' -o -name '*.bak-truoc-*' \) -delete
  find "$dst" -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
  # chuan hoa LF: CRLF lam hong script bash tren macOS/Linux ('$\r': command not found)
  find "$dst" -type f \( -name '*.sh' -o -name '*.ps1' -o -name '*.py' -o -name '*.yml' -o -name '*.mjs' -o -name '*.md' \) -print0 |
    xargs -0 -r sed -i 's/\r$//'
  # chan ro ri mat khau mac dinh (mau trong doc/help cua installer)
  if grep -rInE '(mặc định|mac dinh)[[:space:]]+dhs[[:space:]]*/' "$dst" >/dev/null 2>&1; then
    die "Phat hien mat khau mac dinh trong $dst — scrub roi build lai"
  fi
  # chan loi encoding: PowerShell 5.1 doc .ps1 / phan hoi 'irm' theo codepage ANSI khi
  # khong co charset/BOM => ky tu UTF-8 da byte (nhat la U+2014) thanh dau ngoac thong minh
  # => vo chuoi => loi parse. Moi .ps1 phat cho nguoi dung PHAI la ASCII thuan.
  local bad
  bad="$(grep -rlP '[^\x00-\x7F]' --include='*.ps1' "$dst" 2>/dev/null || true)"
  if [[ -n "$bad" ]]; then
    printf '%s\n' "$bad" | sed "s|$dst/|   |"
    die "Cac file .ps1 tren co ky tu non-ASCII — chuyen sang ASCII (tranh loi parse tren PS 5.1)"
  fi
  printf '%s\n' "$dst"
}

# ---------------------------------------------------------------- zip
make_zip() { # $1 = thu muc can zip (zip chua chinh ten thu muc nay), $2 = file out
  "$PY" - "$1" "$2" <<'PYEOF'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
base = os.path.dirname(os.path.abspath(src))
items = []
for dirpath, dirnames, filenames in os.walk(src):
    dirnames.sort()
    for fn in sorted(filenames):
        full = os.path.join(dirpath, fn)
        rel = os.path.relpath(full, base).replace(os.sep, "/")
        items.append((rel, full))
items.sort()
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for rel, full in items:
        zi = zipfile.ZipInfo(rel, date_time=(1980, 1, 1, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        mode = 0o755 if rel.endswith(".sh") else 0o644
        zi.external_attr = mode << 16
        with open(full, "rb") as f:
            z.writestr(zi, f.read())
print(f"   {os.path.basename(out)}  ({len(items)} file, {os.path.getsize(out)} byte)")
PYEOF
}

sha8() { "$PY" -c "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" "$1"; }

# ---------------------------------------------------------------- build
rm -rf "$OUT"; mkdir -p "$OUT"

log "Stage nguon"
W="$(stage_tree windows)"
M="$(stage_tree mac)"

log "Dong goi"
WIN_ZIP_RAW="$OUT/win.zip"; MAC_ZIP_RAW="$OUT/mac.zip"
make_zip "$W" "$WIN_ZIP_RAW"
make_zip "$M" "$MAC_ZIP_RAW"

WIN_SHA="$(sha8 "$WIN_ZIP_RAW")"; MAC_SHA="$(sha8 "$MAC_ZIP_RAW")"
WIN_FILE="flowvpn-harness-windows-${WIN_SHA:0:8}.zip"
MAC_FILE="flowvpn-harness-mac-${MAC_SHA:0:8}.zip"
mv "$WIN_ZIP_RAW" "$OUT/$WIN_FILE"
mv "$MAC_ZIP_RAW" "$OUT/$MAC_FILE"

VER="$("$PY" -c "import datetime;print(datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d'))")"
"$PY" - "$OUT/latest.json" "$VER" "$WIN_FILE" "$WIN_SHA" "$MAC_FILE" "$MAC_SHA" <<'PYEOF'
import json, sys
out, ver, wf, ws, mf, ms = sys.argv[1:7]
data = {"version": ver, "windows": {"file": wf, "sha256": ws}, "mac": {"file": mf, "sha256": ms}}
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF

# ban copy trong repo (giai nen tay, root 'windows/') — giu dong bo voi nguon da scrub
BUNDLE_STAGE="$OUT/bundle/windows"
mkdir -p "$(dirname "$BUNDLE_STAGE")"; cp -R "$W" "$BUNDLE_STAGE"
make_zip "$BUNDLE_STAGE" "$PKG/windows/fpt-harness-windows-bundle.zip"

log "Ket qua"
printf '   windows : %s  %s\n' "$WIN_FILE" "$WIN_SHA"
printf '   mac     : %s  %s\n' "$MAC_FILE" "$MAC_SHA"
printf '   latest  : %s\n' "$OUT/latest.json"
printf '   bundle  : .dhs-setup/fpt-harness-package/windows/fpt-harness-windows-bundle.zip\n'

[[ "$UPLOAD" == "1" ]] || { log "Chua upload (them --upload)"; exit 0; }

# ---------------------------------------------------------------- upload
log "Upload len $NODE2:$REMOTE_DIR"
SCP=(scp -o BatchMode=yes -J "$JUMP" -q)
SSH=(ssh -o BatchMode=yes -J "$JUMP" "$NODE2")
"${SCP[@]}" "$OUT/$WIN_FILE" "$OUT/$MAC_FILE" "$OUT/latest.json" \
  "$PKG/bootstrap/install.ps1" "$PKG/bootstrap/install.sh" \
  "$NODE2:$REMOTE_DIR/"

log "Quyen file + verify qua CDN"
"${SSH[@]}" bash -s <<EOF
set -e
cd "$REMOTE_DIR"
chown caddy:caddy ./* 2>/dev/null || true
chmod 644 ./*
HARNESS_BASE="$BASE_URL" HARNESS_WINDOWS="$WIN_FILE" HARNESS_MAC="$MAC_FILE" python3 - <<'PY'
import hashlib, io, json, os, re, sys, time, urllib.request, zipfile

base = os.environ["HARNESS_BASE"]

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "harness-release-verify"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()

d = json.loads(get(f"{base}/latest.json?t={int(time.time())}"))
ok = True
blobs = {}
for plat in ("windows", "mac"):
    f, want = d[plat]["file"], d[plat]["sha256"]
    local = os.environ["HARNESS_" + plat.upper()]
    if f != local:
        print(f"   {plat}: latest.json tro {f}, khac ban vua build {local}")
        ok = False
    raw = get(f"{base}/{f}?t={int(time.time())}")
    got = hashlib.sha256(raw).hexdigest()
    print(f"   {plat}: HTTP 200  {f}  {len(raw)} byte  sha256 {'KHOP' if got == want else 'LECH!'}")
    ok &= got == want
    blobs[plat] = raw

z = zipfile.ZipFile(io.BytesIO(blobs["windows"]))
names = [n for n in z.namelist() if n.endswith("install-fpt-harness.ps1")]
print("   entry installer:", names)
body = z.read(names[0]).decode("utf-8", "replace") if names else ""
if re.search(r"(mặc định|mac dinh)\s+dhs\s*/", body):
    print("   !! CON MAT KHAU MAC DINH trong goi Windows")
    ok = False
else:
    print("   goi Windows: khong con mat khau mac dinh")
print("   latest.json version:", d["version"])
sys.exit(0 if ok else 1)
PY
EOF

log "Xong. Link:"
printf '   %s/install.ps1\n   %s/install.sh\n   %s/%s\n   %s/%s\n' "$BASE_URL" "$BASE_URL" "$BASE_URL" "$WIN_FILE" "$BASE_URL" "$MAC_FILE"
