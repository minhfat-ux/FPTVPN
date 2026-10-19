# [WINDOWS → MAC] Nhờ copy APK Android v33 vào ổ BIWIN cho chủ dự án

**Việc:** chủ dự án cần file APK bản dev v33 để **cài lên TV Xiaomi Redmi** (đang lỗi "bật VPN là
thoát app"). Nhờ Mac tải về và **copy vào ổ `BIWIN`** để chủ dự án lấy trực tiếp.

## Nguồn tải (Windows đã đưa lên server, đã kiểm tra)

```
https://meetflowai.site/dl/test/VPNFlow-dev-33.apk
size   : 113.422.837 byte
sha256 : b6782e4f8c5dfbf6b08deafb6afa1b8ab5466c2ab6e4436534a2766adc3d69ab
```

Kiểm tra HTTP (từ máy Windows): `status=200`, `Content-Type: application/vnd.android.package-archive`,
`Content-Length` khớp ✓.

## Đích cần copy

```
/Volumes/BIWIN/VPNFlow-dev-33.apk
```
(để ở **gốc ổ BIWIN** cho chủ dự án dễ tìm; nếu Mac có quy ước thư mục riêng cho file cài thì đặt theo
quy ước đó và ghi lại đường dẫn trong trả lời.)

**Trước khi copy nên kiểm dung lượng** (runbook Mac đã có ca `/Volumes/BIWIN` đầy 100%):
```bash
df -h /Volumes/BIWIN | tail -1
```

**Bắt buộc kiểm hash sau khi copy** — sai hash là file hỏng, cài lên TV sẽ lỗi:
```bash
shasum -a 256 /Volumes/BIWIN/VPNFlow-dev-33.apk
# phải ra: b6782e4f8c5dfbf6b08deafb6afa1b8ab5466c2ab6e4436534a2766adc3d69ab
```

## Bối cảnh (để Mac biết vì sao bản này)

- Bản `.dev` v33 = commit `adcb5a2` trên `origin/main`, `versionCode 33`, applicationId
  `com.privatevpn.app.dev` (cài **song song** bản production, không đè khách).
- Nội dung: bịt 3 lỗ hổng làm app **thoát** thay vì báo lỗi trên TV — (1) vòng `runTunnel()` trước đây
  chỉ có `try/finally`, không `catch`; (2) `establish()` trả `null` không được ghi rõ; (3) không có
  handler crash toàn cục. Nay mọi exception được ghi vào `diagnostics.log` + lưu lại để lần chạy sau
  ghi tiếp, nhờ vậy **đọc được vết crash dù TV không có logcat**.
- Đây là bản **dev để chẩn đoán/kiểm chứng**, KHÔNG phải bản phát hành. Bản Android đang ở trạng thái
  **khóa** (xem `docs/handoff/FREEZE_ANDROID_2026-09-23.md`), chỉ mở cho đúng lỗi TV này.

## Sau khi copy xong, Mac trả lời lại 1 dòng

```
đã copy: /Volumes/BIWIN/VPNFlow-dev-33.apk  sha256=<...>  (khớp|không khớp)
```
