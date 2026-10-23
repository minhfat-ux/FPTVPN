# HANDOFF — TVFlow Home launcher v2.1 (ngôn ngữ · nguồn vào · icon · layout · auto-start · home guard)

- **Ngày:** 23/10/2026
- **Máy thực hiện:** harness Mac (ADB Wi-Fi tới LAN `10.193.44.x`)
- **Trạng thái:** ✅ v2.1 trên `.113`, `.115`; `.109` đang offline (ADB tắt) — cài lại khi bật
- **Không commit/push** — bàn giao cho agent chính.

## 1. Tóm tắt

Nâng launcher TVFlow Home từ v1.4 → **v1.7**:

| Bản | Thay đổi |
|---|---|
| v1.5 | Chọn **ngôn ngữ** VI/EN/ZH (lưu theo TV) + card **Nguồn** mở bảng chọn nguồn của TV |
| v1.6 | Thay 3 ô màu bằng **icon vector** (globe / TV / sort) |
| v1.7 | **Thu gọn card**: 140→120dp, icon 58→46dp, nhãn 120→104dp, chữ 12→11sp, hàng 158→138dp |
| v1.8 | Thêm `AutoStartReceiver` (BOOT_COMPLETED → tự mở TVFlow Home) |
| v1.9 | Khai báo `SYSTEM_ALERT_WINDOW` (appop) để được mở activity từ nền trên Android 10+ |
| v2.0 | Thêm `HomeGuardService` (giữ TVFlow Home tiền cảnh, bật lại khi MiHome nổi lên) |
| v2.1 | Fallback `ActivityManager.moveTaskToFront` — bounce hoạt động cả trên Android 9 |

Theme giữ nguyên FlowTech tối (nền `#071628`, accent `#33C773`/`#22D3EE`/`#7C3AED`).

## 2. Nguồn & artifact

> **Source thật của launcher:** `/Volumes/BIWIN/IoSApps/FacebookLack/tvlauncher`
> (thư mục `/Volumes/BIWIN/XiaoMiLauncher/source` chỉ là bản v1.1 cũ — đừng sửa).

| Path | Thay đổi |
|---|---|
| `tvlauncher/src/com/tvflow/launcher/MainActivity.java` | pref `lang`, `t()`, card Ngôn ngữ + Nguồn, `openInputSelector()`, `applyTexts()`, date theo locale, kích thước card |
| `tvlauncher/res/layout/activity_main.xml` | id `appsLabel`/`shortcutsLabel`; giảm chiều cao hàng + margin |
| `tvlauncher/res/drawable/ic_language.xml`, `ic_input.xml`, `ic_sort.xml` | mới — icon vector |
| `tvlauncher/AndroidManifest.xml` | `versionCode 12`, `versionName 2.1`; receiver AutoStartReceiver; service HomeGuardService; quyền SYSTEM_ALERT_WINDOW + PACKAGE_USAGE_STATS |
| `/Volumes/BIWIN/XiaoMiLauncher/TVFlowHome-1.7.apk` | APK phát hành |
| `/Volumes/BIWIN/XiaoMiLauncher/USB-Cai-Dat/` + `TVFlowHome-XiaomiTV-v1.7-USB.zip` | bộ cài USB (APK + watchdog + hướng dẫn + SHA256) |
| `/Volumes/BIWIN/XiaoMiLauncher/README.md` | cập nhật v1.7 |

SHA-256 APK v1.7: `8b06887d617343e399b7a0a6a7c514aa9eb987627b507fd6ea24727ece099977`

## 3. Bằng chứng (lệnh + kết quả thật)

```text
$ bash build.sh
package: name='com.tvflow.launcher' versionCode='8' versionName='1.7'

$ adb -s 10.193.44.113:5555 install -r TVFlowHome-1.7.apk   -> Success
$ adb -s 10.193.44.115:5555 install -r TVFlowHome-1.7.apk   -> Success
$ adb -s 10.193.44.109:5555 install -r TVFlowHome-1.7.apk   -> Success
dumpsys package com.tvflow.launcher -> versionName=1.7 (cả 3 TV)

| TV | Model | Android | v1.7 |
|---|---|---|---|
| 10.193.44.109 | MiTV-ASTP0 | 9 | ✅ |
| 10.193.44.113 | MiTV-ASSU0 | 14 | ✅ |
| 10.193.44.115 | MiTV-ASTP0 | 9 | ✅ |

# Đổi ngôn ngữ (uiautomator dump, tap card thật)
VI: ỨNG DỤNG · LỐI TẮT · Giữ OK trên app để sắp xếp · Ngôn ngữ: Tiếng Việt · Nguồn · Thứ Sáu, 23 tháng 10
EN: APPS · SHORTCUTS · Hold OK on an app to reorder · Language: English · Input · Friday, 23 October
ZH: 应用 · 快捷方式 · 长按 OK 排序 · 语言: 中文 · 信号源 · 星期五, 23 十月

# Card Nguồn (đã test .113 và .115)
tap "Nguồn" -> mCurrentFocus=com.xiaomi.mitv.tvplayer/com.xiaomi.mitv.tvplayer.ExternalSourceActivity

# Card nhỏ lại (bounds nhãn "Ngôn ngữ: Tiếng Việt")
[428,954][668,987]  ->  [380,853][588,883]   (240px -> 208px rộng)
```

## 4. Quyết định & giả định

| Quyết định | Lý do |
|---|---|
| Không copy icon HyperOS/Xiaomi vào APK | Asset độc quyền + resource private của app hệ thống; dùng icon vector tự vẽ cùng phong cách (bo góc + glyph trắng) |
| Card Nguồn mở `ExternalSourceActivity` của hãng | App thường không có quyền chuyển input trực tiếp; đây là UI chọn nguồn chuẩn của TV |
| Ngôn ngữ lưu per-device (SharedPreferences) | Mỗi TV nhớ ngôn ngữ riêng |
| Default HOME vẫn là Xiaomi | Xiaomi hardcode `com.mitv.tvhome`; muốn đổi phải root — xem `PLAN_TV_XIAOMI_ROOT_2026-10-22.md` |

## 5. Việc còn lại / blocker

1. `.110`, `.112` đang bật nhưng **ADB 5555 đóng** — muốn cài phải bật ADB debugging trên TV.
2. Chưa có ảnh nghiệm thu thị giác: `screencap` trên các TV trả file rỗng (môi trường này), nên chỉ nghiệm thu bằng `uiautomator dump` + app chạy không crash.

## 6. Đã kiểm bảng việc chung

```text
flowvpn-coord check docs/handoff/LAUNCHER_TVFLOW_HOME_v1.7_2026-10-23.md --owner mac
  -> OK: khong ai khac dang giu
flowvpn-coord claim --owner mac --area docs --files <doc> --note handoff-launcher-v1.7
  -> Da giu claim
```

## 7. Bước tiếp theo

- `.109` đã cài xong sau khi bấm Allow (chuyển từ `unauthorized` → `device`).
- Nếu cần ảnh nghiệm thu, chụp màn hình TV bằng điện thoại/cách khác.
- Muốn làm HOME mặc định: theo kế hoạch root, cần firmware AFZP0 rollback trước.

## 8. Bổ sung v1.9 — tự mở khi TV khởi động (chưa phải HOME mặc định)

- Đã thêm `<receiver .AutoStartReceiver>` lắng nghe `BOOT_COMPLETED` → mở `MainActivity`.
- Đã cấp appop `SYSTEM_ALERT_WINDOW` trên cả 3 TV (cần để mở activity từ nền trên Android 10+).
- Vẫn **KHÔNG** đặt được làm HOME mặc định: Xiaomi hardcode `com.mitv.tvhome`; `set-home-activity`/role trả Success nhưng bị bỏ qua; tắt tvhome → FallbackHome trắng. Muốn nút HOME về TVFlow Home phải root (xem `PLAN_TV_XIAOMI_ROOT_2026-10-22.md`, đang hoãn).
- **Cần kiểm chứng bằng reboot thật**: `BOOT_COMPLETED` là protected broadcast, `adb shell am broadcast` bị từ chối (uid 2000). Lưu ý Xiaomi có thể tắt ADB sau reboot.
- APK: `/Volumes/BIWIN/XiaoMiLauncher/TVFlowHome-1.9.apk` (sha256 `249cbd64bab817946fe8ffddf1234e84038e5fc86a38b48dfd9c2e4938c2383f`); bộ USB kit hiện vẫn là v1.7 (bump khi chủ dự án chốt).

## 9. Bổ sung v2.1 — HomeGuard: ép về TVFlow Home

- **Cơ chế:** `HomeGuardService` (foreground service) đọc app đang ở trước bằng `UsageStatsManager`; thấy `com.mitv.tvhome` thì đưa TVFlow Home lên (`startActivity` + `ActivityManager.moveTaskToFront`).
- **Quyền cấp qua ADB** (bắt buộc):
  ```bash
  adb shell appops set com.tvflow.launcher GET_USAGE_STATS allow
  adb shell appops set com.tvflow.launcher SYSTEM_ALERT_WINDOW allow
  ```
- **Test thật:** bấm HOME → MiHome hiện ~1–3 s → tự nhảy về TVFlow Home.
  - `.113` (Android 14): bounce trong ~1 s.
  - `.115` (Android 9): cần fallback `moveTaskToFront` (v2.1), bounce ~2–3 s.
- **KHÔNG phải HOME mặc định thật:** nút HOME vẫn gọi MiHome trước rồi mới bounce; nếu service bị LMK dọn thì thôi. Muốn sạch hẳn vẫn phải root.
- Card **"Launcher Xiaomi"** tạm dừng guard **60 s** (để vào MiHome khi cần).
- APK: `/Volumes/BIWIN/XiaoMiLauncher/TVFlowHome-2.1.apk` (sha256 `d06bf629691a4314a88e00cce50cbcad1e52a847831c3137f3a2f11f1ada7212`); USB kit vẫn v1.7.
- **`.109` đang offline (ADB tắt)** — cần bật ADB lại rồi cài v2.1 + cấp 2 appop như trên.
