# FPT Play cho Android TV — link phát (T-20260928-01)

> Nguồn việc: bus **#530** (owner → win, 28/09/2026 14:15Z): *"cho anh link tải bản apk của fpt play
> đã cài lên các tv"*; nhắc lại ở **#542/#544**. Người làm: **WIN**. Ngày: 28/09/2026.

## 1. Link phát (đã đo thật, tải thật)

| # | File | Link | Byte | sha256 |
|---|---|---|---|---|
| 1 | Bản **đã cài lên TV** (XAPK nguyên bản) | https://meetflowai.site/dl/tv/FPTPlay-TV-7.34.13-ottbox.xapk | 90.167.841 | `ac57bde7996fb946511591341e3dd43ba883a3ba7ba1cc58a499b6a4b2f6129c` |
| 2 | Bản **gộp 1 file** (base + mọi split, ký lại) | https://meetflowai.site/dl/tv/FPTPlay-TV-7.34.13-universal.apk | 65.367.336 | `71d0447f776a64e933fc113ec7d972c11650693c0e14fac2a3ce31e541e8413c` |

File nằm trên node-2 tại `/var/www/flowvpn/dl/tv/` (Caddy `handle /dl/*` → `root /var/www/flowvpn`,
đã `chown caddy:caddy`, `chmod 644`). **Không** gắn lên trang chủ (xem §5).

## 2. Gói này là gì (đọc từ chính file, không suy đoán)

| Thuộc tính | Giá trị |
|---|---|
| package | `net.fptplay.ottbox` (FPT Play for Android TV) |
| versionName / versionCode | `7.34.13` / `4394` |
| minSdk / targetSdk | 23 / 36 (Android 6.0 trở lên) |
| ABI | **chỉ `armeabi-v7a` (32-bit)** — không có arm64 |
| cấu trúc | app bundle tách split: `base` 81.500.909 B + 19 split (ngôn ngữ, `hdpi`, native libs) |

Bản trên máy Windows trước khi phát: `%USERPROFILE%\Downloads\fptplay-tv-latest.apk` (90.167.841 B,
sha256 `ac57bde7…`) — đúng file đã dùng để cài lên các TV. Thư mục giải nén
`Downloads\fptplay-tv-xapk\` chứa `manifest.json` khai `package_name=net.fptplay.ottbox`,
`version_code=4394`, `version_name=7.34.13`, `total_size=90160071`.

## 3. Vì sao có HAI file — dùng cái nào

| Tình huống | Dùng file |
|---|---|
| TV **chưa** có FPT Play, muốn cài bằng cách bấm vào file (USB/trình duyệt) | **#2 universal** — 1 file, cài thẳng |
| TV **đã** có FPT Play (bản gốc FPT) và muốn cập nhật/giữ nguyên dữ liệu đăng nhập | **#1 XAPK** — giữ nguyên chữ ký FPT nên cài đè được; phải cài bằng công cụ hiểu split-APK |
| Cần đúng file đã test trên TV Xiaomi | **#1 XAPK** (nguyên bản, không sửa byte nào) |
| Cần đưa cho kỹ thuật viên / adb | **#1 XAPK** (`adb install-multiple base.apk config.*.apk`) |

**Vì sao #2 phải ký lại:** gộp split thành 1 APK là *sửa* nội dung APK nên chữ ký gốc của FPT không
còn hợp lệ (`apksigner verify` báo `CHUNKED_SHA256 digest mismatch` với bản gộp chưa ký). Bản #2 đã
được ký lại bằng khoá sideload riêng:

- `CN=FPT Play TV Sideload, O=FlowTech, C=VN`
- chứng chỉ SHA-256: `ffc619811f37300f8c72d2b11ce40d236b472f29d7b772c26aabc1e54abd8cdc`
- **Hệ quả phải biết:** TV đang có FPT Play bản gốc thì cài #2 sẽ báo xung đột chữ ký ⇒ phải gỡ bản
  cũ trước (mất phiên đăng nhập). Bản #2 **chưa được test trên TV** (lúc làm không có TV nào kết nối
  adb) — vì vậy #1 mới là bản "đã cài lên các TV".

Cách cài:
- **#2**: `adb install FPTPlay-TV-7.34.13-universal.apk`, hoặc copy vào USB → mở bằng trình quản lý file trên TV.
- **#1**: `adb install-multiple net.fptplay.ottbox.apk config.armeabi_v7a.apk config.hdpi.apk config.vi.apk`
  (giải nén .xapk trước), hoặc dùng app SAI / APKPure trên TV (chúng hiểu XAPK).

## 4. Bằng chứng (chạy lại được)

```bash
# 1) File trên node-2 khớp byte với file gốc trên máy Windows
ssh root@165.101.114.162 "sha256sum /var/www/flowvpn/dl/tv/FPTPlay-TV-7.34.13-ottbox.xapk"
# -> ac57bde7996fb946511591341e3dd43ba883a3ba7ba1cc58a499b6a4b2f6129c  (90.167.841 byte)

# 2) Tải THẬT qua URL công khai (từ node-2, qua Cloudflare + Caddy) rồi băm lại
ssh root@165.101.114.162 'curl -sS -o /tmp/p.xapk -w "http=%{http_code} size=%{size_download}\n" \
  https://meetflowai.site/dl/tv/FPTPlay-TV-7.34.13-ottbox.xapk && sha256sum /tmp/p.xapk'
# -> http=200 size=90167841 ; ac57bde7… (KHỚP)
# -> bản universal: http=200 size=65367336 ; 71d0447f… (KHỚP)

# 3) Kiểm tra gói/meta của file gộp
aapt2 dump badging FPTPlay-TV-7.34.13-universal.apk   # package net.fptplay.ottbox 7.34.13 (4394)
apksigner verify --print-certs FPTPlay-TV-7.34.13-universal.apk
```

Cách đẩy file lên (đường truyền từ máy Windows chỉ ~30-200 KB/s): `ops/_scratch/tv-upload.mjs`
— chia 1 MB/chunk, **6 kết nối scp song song**, có resume; đo được ~200 KB/s (90 MB trong ~6 phút
sau khi resume, thay vì ~48 phút nếu một kết nối).

## 5. Ghi chú

- Đây là **app của FPT**, không phải sản phẩm của mình. Chỉ phát cho TV của chủ dự án (đường dẫn
  `/dl/tv/`, không gắn lên trang chủ, không quảng cáo). Nếu cần phát rộng cho khách thì phải xin phép
  FPT hoặc trỏ về nguồn chính thức.
- Link **bản TV của VPNFlow** (sản phẩm của mình, việc `T-20260928-02`) là
  `https://meetflowai.site/dl/VPNFlow-tv-latest.apk` / `https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk`
  và đã có chip **"Android TV (APK)"** trên trang chủ — không phải file FPT Play ở tài liệu này.
