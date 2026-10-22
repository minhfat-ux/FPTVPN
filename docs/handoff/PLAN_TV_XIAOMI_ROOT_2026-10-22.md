# KẾ HOẠCH (làm sau) — Root Xiaomi TV MiTV-AFZP0 để:
# 1) TVFlow Home thành launcher mặc định
# 2) Sửa/whitelist TV Manager để không kill app

- **Ngày lập:** 22/10/2026 · **Người lập:** phiên làm việc trên Mac (ADB Wi-Fi)
- **Trạng thái:** ⏸ CHƯA LÀM — để cuối tuần khi rảnh. **Không thực hiện khi chưa có firmware rollback.**
- **TV:** MiTV-AFZP0 (`moderntimes`), Android 14, HyperOS TV `OS3.0.8.0.UFZAATV`,
  fingerprint `Xiaomi/moderntimes/moderntimes:14/UD2A.240505.001.W1/OS3.0.8.0.UFZAATV:user/release-keys`

---

## 1. Vì sao cần root

| Mục tiêu | Không root | Có root |
|---|---|---|
| TVFlow Home làm HOME mặc định | ❌ Xiaomi hardcode `com.mitv.tvhome`; mọi API chuẩn (role/set-home-activity/priority) bị bỏ qua | ✅ `pm disable` được `com.mitv.tvhome` **và** `com.xiaomi.mitv.settings/.entry.FallbackHome` |
| Xiaomi launcher chỉ mở khi cần | Card "Launcher Xiaomi" dùng `moveTaskToBack` (chỉ lộ home gốc) | ✅ có thể `pm enable`/launch tạm khi user chọn |
| TV Manager không kill app (whitelist) | Chỉ disable hẳn `com.xiaomi.mitv.tvmanager` | ✅ sửa DB/prefs whitelist của TV Manager, hoặc đóng băng guard có chọn lọc |

## 2. Hiện trạng kỹ thuật đã đo (22/10/2026)

```
ro.boot.flash.locked      = 0            (bootloader UNLOCKED)
ro.boot.verifiedbootstate = orange
ro.boot.veritymode        = disabled      (dm-verity TẮT)
ro.build.type             = user
ro.build.tags             = release-keys
ro.build.ab_update        = false         (không A/B)
ro.boot.bootloader        = 01.01.260625.212613
ro.build.expect.bootloader= 01.01.250325.103853   ← LỆCH version bootloader!
ro.product.device         = moderntimes
ro.mitv.product.customer  = gitv
```

Partition quan trọng (`/dev/block/by-name/`):

| Tên | Block | Ghi chú |
|---|---|---|
| `boot` | mmcblk0p15 | kernel + ramdisk? |
| `init_boot` | mmcblk0p22 | **ramdisk Android 13+ → mục tiêu patch Magisk** |
| `recovery` / `recoverybak` | mmcblk0p7 / p18 | đường rollback |
| `vbmeta` | mmcblk0p17 | AVB (đang verity disabled) |
| `super` | mmcblk0p24 | dynamic partitions |

- `/system`, `/vendor`, `/product` là **erofs read-only**.
- ADB production build: `adb root` bị từ chối; không có `su`/Magisk.
- SoC Amlogic; **AMLSECU** (Amlogic Secure Boot) là rủi ro lớn — XDA ghi nhận một số MiTV
  không patch được boot do ảnh bị ký AMLSECU.

## 3. Rủi ro & điều kiện tiên quyết

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Không có fastboot → không flash được ảnh tự tạo | Cao | Kiểm tra fastboot trước (Bước 0) |
| AMLSECU từ chối init_boot đã patch → bootloop | Cao | Thử firmware rollback trước; chỉ làm khi có USB recovery |
| Không có firmware AFZP0 công khai | **Rất cao** | Tìm & tải firmware trước; **không có = KHÔNG LÀM** |
| Mất ADB sau reboot (Xiaomi tự tắt) | Trung bình | Bật lại ADB bằng remote mỗi lần reboot |
| Lệch bootloader version (`expect` vs thực tế) | Trung bình | Không flash bootloader; tránh OTA giữa chừng |

**Tiêu chí DỪNG (stop conditions):**
1. Không tìm được `update.zip` + script `xiaomi_XXXXXX` đúng model AFZP0 → dừng.
2. `adb reboot bootloader` không vào được fastboot (hoặc không có Amlogic USB Burning Tool
   + firmware) → dừng.
3. Flash thử firmware rollback thất bại → dừng, không patch gì.

## 4. Các bước thực hiện (khi làm)

### Bước 0 — Test fastboot (rủi ro thấp, mất ADB tạm thời)
```bash
adb reboot bootloader
sleep 5
fastboot devices          # có serial → fastboot khả dụng
fastboot getvar product
fastboot reboot
```
- Nếu `fastboot devices` rỗng → ghi nhận, chuyển hướng Amlogic USB Burning Tool.
- Sau reboot: bật lại ADB trên TV (Settings → About → Build 5–7 lần → ADB debugging).

### Bước 1 — Tìm firmware gốc AFZP0 (rollback)
- Nguồn: ZNDS/小米社区/trung tâm Xiaomi; cần đúng `moderntimes` / `MiTV-AFZP0`, version
  `OS3.0.8.0.UFZAATV` (hoặc mới hơn cùng nhánh).
- Gói cần: `update.zip` + script `xiaomi_<model>`.
- Kiểm tra: giải nén xem `META-INF`/`payload`; xác nhận model & fingerprint khớp.
- **Lưu bản firmware vào** `/Volumes/BIWIN/XiaoMiLauncher/firmware/`.

### Bước 2 — Thử đường rollback trước (dry run)
- USB 2.0 FAT32 8 GB, copy `update.zip` + `xiaomi_*` ra gốc.
- Tắt điện TV → cắm USB → bật nguồn + giữ tổ hợp remote ngay:
  - IR: **Menu + Home**; BT: **OK + Back**.
- Nếu vào recovery và nạp được firmware cùng version → **đường lùi đã chắc**, mới đi tiếp.
  (Nạp lại cùng version không mất dữ liệu người dùng nếu chọn "keep data".)

### Bước 3 — Lấy `init_boot.img` & patch Magisk
- Có fastboot: dùng `fastboot fetch init_boot init_boot.img` (nếu hỗ trợ) hoặc lấy từ firmware.
- Cài Magisk app trên TV (APK), chọn "Patch a file" → chọn `init_boot.img` → nhận
  `magisk_patched-*.img`.
- Lưu bản gốc `init_boot.img` + patched ra BIWIN.

### Bước 4 — Flash & root
```bash
fastboot flash init_boot magisk_patched-xxxx.img
fastboot reboot
# kiểm tra
adb shell su -c id
```
- Nếu không boot: vào recovery/USB firmware để khôi phục (Bước 2).

### Bước 5 — Đạt mục tiêu (sau khi có root)
```bash
# 1) Launcher mặc định
adb shell su -c "pm disable-user --user 0 com.mitv.tvhome"
adb shell su -c "pm disable-user --user 0 com.xiaomi.mitv.settings/.entry.FallbackHome"
adb shell su -c "cmd package set-home-activity com.tvflow.launcher/.MainActivity"
adb shell su -c "cmd role add-role-holder --user 0 android.app.role.HOME com.tvflow.launcher"

# 2) TV Manager: xem whitelist/guard trước khi sửa
adb shell su -c "ls /data/data/com.xiaomi.mitv.tvmanager/"
adb shell su -c "sqlite3 /data/data/com.xiaomi.mitv.tvmanager/databases/*.db '.tables'"
# mục tiêu: thêm com.privatevpn.app.tv.dev, com.tvflow.launcher, net.fptplay.ottbox
# vào danh sách bảo vệ/whitelist; hoặc đóng băng guard nếu không có whitelist.

# 3) Dọn: xoá file Magisk patched khỏi /sdcard, ghi lại hash
```
- Test: bấm HOME → TVFlow Home; mở app khác → HOME vẫn về TVFlow; TV Manager không kill VPNFlow.
- Rollback mục tiêu này (không cần factory reset): `pm enable` lại 2 component trên.

## 5. Tình trạng hiện tại (không root) — dùng tiếp trong lúc chờ

- TV Manager: **đã disable** (`pm disable-user com.xiaomi.mitv.tvmanager`) → không kill app.
- Launcher: TVFlow Home v1.4 là app thường; bấm HOME → Xiaomi launcher.
- FPT Play: đang chạy qua Mac gateway `192.168.100.5:18081` (1080p), proxy do app/harness quản lý.
- Handoff chính: `HANDOFF_TV_XIAOMI_FPT_NETFLIX_2026-10-22.md`.

## 6. Checklist cuối tuần (tóm tắt)

- [ ] Bước 0: test fastboot (nhớ bật lại ADB sau reboot)
- [ ] Bước 1: tìm & lưu firmware AFZP0 + script
- [ ] Bước 2: thử USB recovery flash (dry run)
- [ ] Bước 3: patch init_boot bằng Magisk
- [ ] Bước 4: flash + xác nhận root
- [ ] Bước 5: disable tvhome/FallbackHome + set home; sửa whitelist TV Manager
- [ ] Ghi lại hash + đường rollback vào doc này
