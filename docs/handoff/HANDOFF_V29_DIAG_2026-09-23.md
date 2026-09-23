# HANDOFF v29 — SỬA NGUỒN BYTE CỦA DIAGNOSTICS (23/09/2026)

> Tiếp nối `HANDOFF_FINAL_2026-09-22.md`. Bản này **thay thế** phần build trong handoff cũ:
> build mới nhất là **versionCode 29 / versionName 1.4.3-dev**, không phải v28.

## 1. Vấn đề chủ dự án báo

> "các thông số trong Diagnostics đang không đúng với tốc độ đo được từ speed cloudflare.
> Có vẻ 2 đường đo tốc độ là khác nhau."

Chủ dự án xác nhận: **Diagnostics THẤP hơn nhiều** (speedtest cao gấp ≥2 lần).

## 2. Nguyên nhân gốc — có bằng chứng từ log của chính máy

Trích `diagnostics.log` trên máy thật (22/09/2026):

```
09-22 11:39:58  bw: sampler nguồn byte = cầu WS (app không đọc được /proc/net/dev)
09-22 12:55:41  tunnel: UP (hy-udp:50121)          <- transport đang chạy là UDP TRỰC TIẾP
09-22 13:08:59  bw: sample net=中国联通 observed=5 declared=1000
09-22 11:40:03  bw: probe 1719546B/3082ms -> 4463kbps qua tunnel
```

- Android/SELinux **chặn app đọc `/proc/net/dev`** ⇒ vòng lấy mẫu lùi về **bộ đếm của cầu WS**.
- Bộ đếm cầu WS **chỉ nhúc nhích khi đường chạy qua cầu WS**. Transport là `hy-udp`/`hy-tcp`
  trực tiếp ⇒ bộ đếm đứng yên ⇒ app báo **5 kbps** trong khi cùng phiên tunnel chở thật
  **4.463 kbps** — sai ~900 lần.
- Vòng ramp dùng **chính con số đó**, nên tưởng mạng chết và kẹt `declared` ở sàn 1.000 kbps.
  Đây cũng là lý do đã thấy "khai 1,4 / 3,8 Mbps trong khi tải thật 21–35 Mbps".

## 3. Đã sửa

| File | Sửa gì |
|---|---|
| `vpn/BandwidthMemory.kt` | Thêm `uidRxBytes()` / `uidTxBytes()` — `TrafficStats` theo UID, **luôn đọc được**, phủ **mọi transport** (socket trực tiếp lẫn socket cầu WS đều thuộc UID app). Ghi rõ trong KDoc cảnh báo: đếm mức "trên dây" và có tính traffic KHÔNG qua tunnel của chính app (đo trước khi nối / gọi API điều khiển). |
| `vpn/HysteriaVpnService.kt` | Vòng lấy mẫu chọn nguồn byte theo thứ tự: **(1)** `/proc/net/dev` → **(2)** đang qua cầu WS thì dùng bộ đếm cầu (khít nhất, không dính đếm trùng socket loopback `127.0.0.1`) → **(3)** đường trực tiếp thì `TrafficStats` theo UID. **Đổi đường (WS ⇄ trực tiếp) là chọn lại nguồn** (`srcOnWs`), vì giữ nguyên nguồn cũ chính là lỗi gốc. Dòng log `bw: sample ...` thêm `src=<1/2/3> raw=<byte>` để soát được. |
| `app/build.gradle.kts` | `versionCode = 29` (giữ `versionName = "1.4.3"` + hậu tố `-dev`). |
| `apply-patch-to-repo.ps1` (ngoài repo) | Dấu vết kiểm tra đổi theo v29: `versionCode = 29`, `uidRxBytes`, `srcOnWs`. |

Nhãn trên màn hình không đổi (đã i18n ở v28): **Tốc độ tải xuống / Tải lên / Đo được (đường ramp) /
Khai báo hiện tại / Khai báo còn lên được / Đường đang dùng**.

## 4. Sự cố trong lúc làm (đã khắc phục, phải ghi lại)

Script `tools/fix-mojibake.mjs` (viết để sửa lỗi mã hoá tiếng Việt do PowerShell 5.1 đọc file
không BOM bằng ANSI) có **lỗi `push`**: dòng nào sửa được thì bị *ghi log* mà **không được đưa
vào kết quả** ⇒ **xoá mất 54 dòng** ở `HysteriaVpnService.kt` + 5 dòng ở `Config.kt`.

- Đã khôi phục **nguyên văn** từ script vá gốc `.tmp/apply-ramp-patch.ps1`:
  6 chuỗi log (`ramp: STABLE at…`, `ramp: đường mới KHÔNG lên được…`, `ramp: kênh dò lỗi…`,
  `ramp: kênh dò KHÔNG có lãi…`, `ramp: kênh dò thấy đường TRỰC TIẾP tốt hơn…`,
  `ramp: NÂNG CẤP đường WS -> trực tiếp…`) và 17 khối comment/KDoc.
  Công cụ: `tools/restore-v29-lines.mjs`, `tools/restore-v29-comments.mjs` (mỗi phép thay phải
  khớp đúng 1 lần, sai thì **không ghi gì**).
- **Còn thiếu ~3 dòng comment** không khôi phục được (không xác định được nguyên văn). Không ảnh
  hưởng biên dịch/hành vi; committer nên biết để không ngạc nhiên khi soát.
- Bằng chứng trạng thái hiện tại: `BUILD SUCCESSFUL`, `HysteriaVpnService.kt` 1960 dòng
  (trước sự cố 1963), không còn lời gọi `DiagnosticsLog.*()` rỗng (đã quét bằng
  `tools/find-broken-log-calls.mjs`).

## 5. Bản build

```
APK : C:\Users\Minhn\.vpnflow-build-142\app\outputs\apk\modern\debug\app-modern-debug.apk
size: 113.422.837 bytes
sha256: A536BCA792C3D7ED392ACC3437E12B1A1B34F31C4B0D60BEF81EC6D36708E452
package: com.privatevpn.app.dev  versionCode=29  versionName=1.4.3-dev
```

Đã soi trong `classes3.dex` của chính APK này: có `uidRxBytes`, `uidTxBytes`,
`TrafficStats theo UID`, `srcOnWs`, `ramp: STABLE at` ⇒ đúng bản đã vá (không phải APK cũ còn sót).

## 6. Cách nghiệm thu trên máy (khi có adb)

```powershell
adb -s <serial> install -r -d <apk>
# bật VPN, chạy speedtest, rồi:
adb shell "grep -E 'sampler nguồn byte|bw: sample|chon-duong|tunnel: UP' /sdcard/Android/data/com.privatevpn.app.dev/files/diagnostics.log | tail -20"
```

Đạt khi:
- `sampler nguồn byte = TrafficStats theo UID (đường trực tiếp)` khi `tunnel: UP (hy-udp…)`,
  hoặc `cầu WS (đang qua cầu)` khi đường đang qua cầu;
- `observed=` trong `bw: sample` **cùng bậc** với tốc độ speedtest (sai lệch ≤ ~20% là bình
  thường vì window 12 s gồm cả lúc rảnh), **không còn cảnh 5 kbps**;
- `declared` leo lên theo mạng thay vì kẹt ở 1.000 kbps.

## 7. Việc còn lại (không nằm trong bản này)

1. **Chưa test được trên máy**: điện thoại chưa cắm USB (adb `no devices/emulators found`) —
   mọi kết luận ở §2 là từ log cũ trên máy, §5 mới là kiểm chứng trên APK.
2. Mac: căn 16 KB page (`libbwg.so`, `libbgojni.so`, `libandroidx.graphics.path.so`) + keystore.
3. `docs/RELEASE_PLAN_2026-09-24.md` §2.3 còn ghi 21/1.4.1 → cập nhật 29/1.4.3.
4. Kênh đo tốc độ riêng trong app (nút "Đo qua VPN" trong Diagnostics) để so trực tiếp với
   speedtest — hiện người dùng phải so bằng mắt giữa 2 ứng dụng.

## 8. Bài học cho iOS/macOS

Quy tắc: **bộ đếm byte phải phủ MỌI transport của tunnel**. Nếu bên iOS/macOS đang đọc bộ đếm
của *một* transport (ví dụ chỉ cầu WS/proxy) thì đổi đường là con số sai y hệt. Nguồn đúng:
bộ đếm của chính tiến trình (mọi socket) hoặc bộ đếm interface TUN nếu đọc được payload thật.
