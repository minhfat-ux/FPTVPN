# RELEASE ARTIFACTS — Android **1.4.7 / build 105** (24/10/2026)

Phát hành bởi harness Windows (`android` + `android-legacy`). Kênh TV **không** nằm trong lần này.

## 0. Vì sao là 1.4.7 mà không phải 1.4.6 (đọc trước khi hỏi "sao nhảy số")

- Cặp **(android, 1.4.6)** **đã có sha256 khác**: bản `1.4.6 / build 38` phát ngày **19/10/2026**
  (modern `79.106.252 B` sha256 `0eabd787…`, legacy `79.122.631 B` sha256 `aa392fd3…`) — có trong
  `release/releases.jsonl` và `docs/PUBLISHER_PROCESS.md` §6.
  Luật `docs/VERSIONING.md` §3 luật 3 (**artifact bất biến**: một cặp `(platform, version)` chỉ ứng với
  **một** sha256) ⇒ bản dựng hôm nay **không được** mang số 1.4.6.
- Trong phiên làm việc này tôi **đã dựng và upload 1.4.6 / build 104 trước khi nhận ra** điều trên
  (`latest_version` lúc đó đang là 1.4.5, cổng `check-publish-version.py` chỉ so với **mốc đang phát**
  nên không bắt được trùng số với bản đã phát trước đó). Sai đã sửa: dựng lại **1.4.7 / build 105**,
  upload đè lên đúng route, đặt mốc **1.4.7**. Bản 1.4.6/104 chỉ tồn tại trên route ~50 phút,
  **không gửi email/thông báo** cho khách (máy chủ **không** bật access log Caddy nên không có số liệu
  tải thật trong khoảng đó — không dám khẳng định "không ai tải").
- Việc cổng chặn **không** đối chiếu `release/releases.jsonl` là **lỗ hổng còn lại**: xem §5.

## 1. Artifact đang phát

| Kênh | File trên node-2 | Size (B) | sha256 | versionCode | versionName |
|---|---|---|---|---|---|
| Android modern | `/root/flowvpn-apk/VPNFlow-latest.apk` | **80.531.942** | `f1dffaef3a8836a26575104ae3380694a5c3315947cfd29058b457a69b9163a5` | 105 | 1.4.7 |
| Android legacy (Android 7/Fire OS) | `/root/flowvpn-apk/VPNFlow-android7.apk` | **80.548.320** | `a833b3d1c31ad55a59d1311ebe5a9b37f79f3e4bc44c95dfb039751724275e4e` | 105 | 1.4.7 |

- Ký: **cùng một chứng chỉ release** `dc6e484bf8ef2eea0dcd15a9192d8233fea1a05068b8ee4486cdc53f456b5e46`
  (CN=Minh Nguyen Binh, OU=VPNFlow) ⇒ cài đè **không mất đăng nhập**.
- Bản cũ giữ nguyên làm bản lùi: `/root/flowvpn-apk/VPNFlow-latest.apk.bak-20261024` và
  `VPNFlow-android7.apk.bak-20261024` (chính là **1.4.6 / 38** — 79.106.252 / 79.122.631 B).

## 2. Cổng chặn (output thật)

```
check-publish-version.py --platform android        --mode pre  --version 1.4.7 --build 105  → exit 0 (ĐẠT)
check-publish-version.py --platform android-legacy --mode pre  --version 1.4.7 --build 105  → exit 0 (ĐẠT)
check-publish-version.py --platform android        --mode post --version 1.4.7 --file …     → exit 0 (ĐẠT)
check-publish-version.py --platform android-legacy --mode post --version 1.4.7 --file …     → exit 0 (ĐẠT)
```

Đọc version **trong file đang phát**: `1.4.7 / build 105`, gói `com.privatevpn.app` (không phải bản dev).
Cảnh báo còn lại của cổng post ("file đang phát đã đúng N byte như local") là **cảnh báo đúng chiều**:
server đã có đúng artifact vừa dựng.

- Route `https://t1.meetflowai.site/v1/downloads/android` → `HTTP/1.1 200`, `Content-Length: 80531942`.
- Route `https://t1.meetflowai.site/v1/downloads/android-legacy` → `HTTP/1.1 200`, `Content-Length: 80548320`.
- **Tải thật từ route công khai rồi băm lại** (không tin `scp`): cả hai file trả về đúng
  `f1dffaef…` / `a833b3d1…` — khớp local tuyệt đối.
- `stat` trên node-2: `80531942 2026-10-24 01:12:57` · `80548320 2026-10-24 01:13:13`.

## 3. Mốc phiên bản (server)

| Field | Trước | Sau |
|---|---|---|
| `latest_version` | `1.4.5` | **`1.4.7`** |
| `minimum_version` | `1.2.6` | **1.2.6** (không đổi — không ép cập nhật) |
| `apk_url` / `apk_url_legacy` | route như cũ | không đổi |

`PATCH /v1/admin/android-version` trả `200` + JSON đọc lại đúng `latest_version=1.4.7`.

## 4. Nội dung bản này (so với 1.4.5 / build 103 mà khách đang chạy)

Xem `docs/RELEASE_NOTES_android_1.4.7.md`. Tóm tắt: **điện thoại làm gateway LAN cho TV**,
**sửa gốc lỗi "VPN connected nhưng Google/YouTube bị chặn" (IPv6)**, tự chọn đường ra tốt nhất,
keepalive tự hồi tunnel.

## 5. Việc chưa xong (không được quảng cáo là đã có)

1. **Kênh Android TV riêng chưa phát lần này.** TV đang chạy bản cũ (`com.privatevpn.app.tv`,
   versionCode 100 / 1.4.5); mốc riêng `android_tv_latest_version` **chưa đặt** ⇒ client TV rơi về
   mốc Android chung ⇒ TV sẽ thấy "có bản mới" và tải **APK điện thoại** (`com.privatevpn.app`).
   Bản TV 1.4.6-tv/**104** đã dựng trong phiên nhưng **chưa đăng** (và cũng phải đổi thành 1.4.7-tv
   cho cùng lý do artifact bất biến — cặp `(android-tv, 1.4.6)` đã có sha256 `191f8f95…`).
2. **Chưa gửi email thông báo** (§5 `PUBLISHER_PROCESS.md`): script mới có template Windows; cần
   template Android trước khi gửi.
3. ~~Chưa cài thử trên máy thật~~ → **XONG (24/10 02:19 +07).** Galaxy Z Fold5 (`SM-F9460`,
   Android 16, `adb 192.168.100.101:39717`): `adb install -r` artifact modern phát hành ⇒
   `versionCode=105`, `versionName=1.4.7`, `firstInstallTime` **giữ nguyên 2026-10-19** (cài đè,
   **không** gỡ bản cũ ⇒ giữ đăng nhập; app gọi control API ngay: log `tuyến: chọn … (điểm: …)`).
   Tunnel lên đúng thiết kế: `tun0 100.100.100.101/30` + `tun0 fd00:1::1/64` (IPv6 thu vào tunnel
   rồi bỏ), `probe: THROUGH TUNNEL http 1.1.1.1:80 ok=301`, `dns … in 196ms`. Gateway LAN của điện
   thoại **chạy thật**: cổng **18081** LISTEN; từ laptop `curl -x http://192.168.100.101:18081
   https://1.1.1.1/cdn-cgi/trace` → `ip=165.101.114.162 loc=VN`, tải 4 MB qua gateway điện thoại
   **945.846 B/s** (~7,6 Mbps) — đúng đường dùng cho TV.
4. **Cổng `check-publish-version.py` không đối chiếu `release/releases.jsonl`** ⇒ không bắt được
   "phát lại cùng số version với artifact khác hash". Cần bổ sung chặn cứng (việc tồn, xem §0).
5. ~~Chưa có tag / dòng sổ~~ → **XONG**: 2 dòng `published` trong `release/releases.jsonl` (sha256 đo
   từ file thật) + tag annotated `android-v1.4.7`, `android-legacy-v1.4.7` (xem §6).
6. **`scripts/release-record.mjs` đã sửa 1 lỗi thật**: cổng so `git rev-list` (sha 40 ký tự) với
   `--commit` dạng sha ngắn ⇒ báo sai "KHONG khop" và từ chối tạo tag `android-legacy-v1.4.7`
   (24/10). Nay so **bằng tiền tố**. Hệ quả đã tránh được: tag không bị tạo lại/sai commit.

## 6. Mốc git của bản này (đọc kỹ: 2 mã commit)

- **Commit build (tag neo vào đây):** `05e28d1d` — commit `release(android): PHAT 1.4.7/105 …`.
  Tag `android-v1.4.7` + `android-legacy-v1.4.7` (annotated) trỏ đúng commit này và đã push.
- Lúc push, `origin/main` đã có commit của máy khác ⇒ phải `git pull --rebase` ⇒ nội dung đó nằm
  trên main với mã **`ccc83a3d`** (commit ghi sổ: `8c0ad992`). **Tag vẫn neo `05e28d1d`** theo luật
  "không tạo lại/không sửa tag đã có" (`docs/VERSIONING.md` §2); commit này vẫn nằm trong repo qua
  chính 2 tag đó.
- Khác nhau giữa `05e28d1d` và `ccc83a3d` **chỉ** là các commit của máy khác được rebase vào giữa:
  `android/guard/**` (app guard **riêng** `com.privatevpn.app.guard`, `settings.gradle.kts` khai
  `include(":guard")` ⇒ **không** nằm trong APK VPN), `android/tvflow-launcher/**`, `docs/**`,
  `tools/**`. **Không** file nào thuộc `android/app/src/**` bị đổi ⇒ APK phát hành khớp mã nguồn
  `android/app` ở cả hai commit.
- `node scripts/release-record.mjs verify` **không** báo lỗi cho 2 dòng android/android-legacy 1.4.7;
  các dòng `KHONG DAT` còn lại trong sổ là của iOS/macOS/windows có từ trước (không thuộc kênh này).

