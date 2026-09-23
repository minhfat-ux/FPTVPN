# VPNFlow Android 1.4.3 (versionCode 29) — có gì mới

> Phát hành 23/09/2026. Nguồn build: commit **`86944de`** (nhánh `mac/android-1.4.3`), **không** gồm
> thay đổi `windows/**` đang dở. Artifact: **2 APK release** — modern (minSdk 26) + legacy (minSdk 24),
> cùng một cert release (`SHA-256 dc6e484b…5e46`).
>
> **Phân biệt với Windows:** `docs/RELEASE_NOTES_1.4.3.md` là **của Windows 1.4.3**; tệp này là bản
> riêng cho **Android 1.4.3**. Từ nay đặt tên theo nền tảng: `docs/RELEASE_NOTES_<platform>_<version>.md`.

## Điểm chính (dùng để thông báo khách)

1. **Đồng hồ tốc độ trong Diagnostics nay đo ĐÚNG.**
   Trước đây app đọc nhầm nguồn byte: khi transport chạy trực tiếp (`hy-udp`/`hy-tcp`), nó vẫn lấy
   bộ đếm của **cầu WS** (chỉ nhúc nhích khi đường đi qua cầu) ⇒ báo **~5 kbps** trong khi cùng phiên
   tunnel chở thật **4.463 kbps** — sai tới ~200 lần, và vòng ramp vì thế kẹt `declared` ở sàn
   1.000 kbps. Nay nguồn byte chọn theo thứ tự: `/proc/net/dev` → bộ đếm cầu (nếu đang qua cầu) →
   **`TrafficStats` theo UID** (luôn đọc được, phủ **mọi transport**), và **đổi đường thì chọn lại nguồn**.
2. **MTU tun = 1300 (thay 1500).** Giảm phân mảnh/thất lạc gói trên mạng có MTU nhỏ (4G/5G, Wi-Fi có
   VPN lồng nhau) ⇒ kết nối ổn định hơn.
3. **2 máy chủ DNS cho tunnel** (`1.1.1.1` + `8.8.8.8`) thay vì 1 ⇒ một cái chậm/không phản hồi thì
   cái còn lại vẫn phân giải được.

Không có thay đổi giao diện nào khác; nhãn Diagnostics giữ nguyên (đã i18n từ v28).

## Artifact & kênh phát hành

| Biến thể | Kênh | Bytes | sha256 |
|---|---|---|---|
| modern (minSdk 26) | `/v1/downloads/android` → `/root/flowvpn-apk/VPNFlow-latest.apk` | 74.731.689 | `9563366995704d9c49c2087b6357e6c9655426cbdee909cecfb0f46515064ce5` |
| legacy (minSdk 24) | `/v1/downloads/android-legacy` → `/root/flowvpn-apk/VPNFlow-android7.apk` | 74.748.051 | `fdb88e3febdbab4a243d92d3b743327298d04c9e6e8b7f2fe79b121dd6a5ede9` |

- `applicationId com.privatevpn.app` (không `.dev`) · `versionCode 29` · `versionName 1.4.3` · targetSdk 36.
- Cả hai: ký v1+v2+v3, `zipalign -c -P 16` đạt, 10/10 `.so` 64-bit có `PT_LOAD align = 0x4000` (16 KB page).

## Việc đã kiểm trước khi phát

- **Cổng chặn pre** `scripts/check-publish-version.py --platform android|android-legacy --version 1.4.3 --build 29` → exit 0 (cả 2).
- **Độc lập trên Windows** (bus-300): `aapt2 badging` → `com.privatevpn.app 29/1.4.3`; `apksigner` cert
  `dc6e484b…5e46`; sha256 băm lại trên Windows **khớp 100%** với Mac/node-2.
- **§6 máy thật — ĐẠT** (Samsung SM-F9460, Android 16, bus-300): `sampler nguồn byte = TrafficStats theo UID`;
  `observed=2508 kbps` so với `curl` độc lập `2.555 kbps` (lệch 1,8%); `declared` leo theo mạng,
  không kẹt 1.000 kbps; lúc rảnh `4..22 kbps` khớp chênh lệch bộ đếm thô.
- **Kênh tải**: `https://t1.meetflowai.site/v1/downloads/android` → HTTP 200, `content-length` 74.731.689.

## Nghiệm thu

- `bus-282` (build + ký + §6) đã **verified PASS** ngày 23/09/2026 (bus-300/302).
- Email thông báo khách: `scripts/send-android-1.4.3-announcement.py` — số người nhận + Resend id/delivered
  ghi trong sổ `bus-299`.
