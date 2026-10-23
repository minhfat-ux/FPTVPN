# Agent Handoff

- **Agent:** harness Mac (worker) → giao **harness Windows** (publisher Android)
- **Task ID:** HANDOFF-WINDOWS-TUNNEL-KEEPALIVE-2026-10-23
- **Date:** 2026-10-23
- **Status:** blocked (chờ Windows sửa app — tunnel không tự dựng lại khi app bị kill ở nền)

## Summary

Trên TV `MiTV-AFZP0` (Android 14), app `com.privatevpn.app.tv.dev` (v1.4.5-tv-dev, versionCode 96)
bị kill khi xuống nền (update package, LMK 1 GB, bộ dọn Xiaomi). App có cơ chế tự dựng lại
`HysteriaVpnService` qua chuông `VpnKeepAlive` (60 s) + `START_STICKY`, **nhưng Xiaomi chặn**:

```text
20:07:12  AppsRelaunchController: Refused to start foreground service(setServiceForegroundLocked):
            caller=com.privatevpn.app.tv.dev, isCallerSystem=false,
            service=ComponentInfo{com.privatevpn.app.tv.dev/...HysteriaVpnService}
```

⇒ Tunnel nằm chết (không còn `127.0.0.1:1081`) cho tới khi **mở app lên foreground**; khi foreground
thì tunnel lên bình thường (đo 1731 kbps, exit `103.173.155.50`). Cần app tự hồi được khi ở nền.

Ngoài ra: source repo (`android/`) đang **cũ hơn bản đang chạy** (repo `versionCode 90`, máy đang cài
`96`); bản 96 đã có "tự dò gateway" mà repo chưa có ⇒ cần sync trước khi sửa.

## Files Changed

| Path | Change Summary |
|---|---|
| `docs/handoff/HANDOFF_WINDOWS_TUNNEL_KEEPALIVE_2026-10-23.md` | **mới** — handoff này (chỉ tài liệu) |

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Giao Windows sửa app | Windows phát hành Android (`AGENTS.md` §0) | handoff này |
| Không root / không sửa framework Xiaomi | Ngoài phạm vi, rủi ro; ưu tiên app-side | handoff này |
| Giữ nguyên tunnel/proxy hiện có | Lỗi nằm ở khả năng tự hồi service, không phải tunnel | Appendix A |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20261023-11 | runtime_checked | `AppsRelaunchController: Refused to start foreground service … isCallerSystem=false` (service `HysteriaVpnService`) |
| EVID-20261023-12 | runtime_checked | `Force stopping com.privatevpn.app.tv.dev … installPackageLI` + `Killing … (adj 905)` — app bị dừng khi update |
| EVID-20261023-13 | runtime_checked | Khi mở app: `transport=http1081 tunnelUp=true`, `bw: probe 671735B/3104ms -> 1731kbps`, `IP thoát = 103.173.155.50` |
| EVID-20261023-14 | runtime_checked | `cat /proc/net/tcp` → `:0439` (1081) LISTEN uid 10074 khi connected; không listen khi app bị kill |
| EVID-20261023-15 | code_checked | repo `versionCode 90` / `1.4.5` vs máy cài `96` / `1.4.5-tv-dev`; repo `ProxyDirector.kt` chưa có "tự dò" |

## Validation Performed

```text
adb shell logcat -d | grep -aE "AppsRelaunchController|Force stopping|tunnelUp|transport="
  -> Refused to start foreground service (setServiceForegroundLocked) isCallerSystem=false
  -> (foreground) transport=http1081 tunnelUp=true, 1731kbps

adb shell cat /proc/net/tcp | grep 0439   -> LISTEN khi app connected
adb shell settings get global http_proxy   -> 192.168.100.3:18081 (gateway đang sống)
adb shell pm disable-user --user 0 com.xiaomi.mitv.tvmanager -> disabled-user (giảm kill)
adb shell am set-standby-bucket com.privatevpn.app.tv.dev 10
adb shell cmd deviceidle whitelist +com.privatevpn.app.tv.dev
```

## Validation Not Performed

| Check | Reason |
|---|---|
| Tự hồi tunnel sau khi `am kill` (không mở app) | Chưa có bản sửa; cần Windows build |
| Chạy trên Android 9 (ASTP0) | Cần bản APK mới cài lên TV đó |

## Risks

- Xiaomi có thể vẫn chặn dù thêm `SYSTEM_ALERT_WINDOW` (controller là system_server, không phải AOSP).
- Nếu phải mở activity từ nền để "mồi" service, có thể nháy UI — dùng activity trong suốt.
- TV 1 GB RAM: thêm cơ chế hồi phục không được ăn CPU/pin quá mức.

## Open Questions

- Xiaomi `AppsRelaunchController` có tuân theo exemption `SYSTEM_ALERT_WINDOW` không? (test thực tế trên TV)
- Có cần root để whitelist app trong framework (như `PLAN_TV_XIAOMI_ROOT_2026-10-22.md`) không?

## Next Recommended Step

Windows sync source bản 96, sửa `VpnKeepAlive`/service theo Appendix B, build APK, cài lên TV
`.104` (`192.168.100.104:5555`), rồi test acceptance ở Appendix B.4 và trả handoff cho Mac verify.

---

## Appendix A — Phân tích & vị trí code

- `android/app/src/main/java/com/privatevpn/app/vpn/VpnKeepAlive.kt`
  - `ensureRunning()`: gọi `ProxyDirector.enforce`, rồi `startForegroundService(HysteriaVpnService)`
    (API 26+) từ `KeepAliveReceiver` (chuông 60 s) / `BOOT_COMPLETED` / `MY_PACKAGE_REPLACED`.
  - `schedule()`: `AlarmManager.setAndAllowWhileIdle` (inexact) mỗi 60 s.
- `android/app/src/main/java/com/privatevpn/app/vpn/HysteriaVpnService.kt`
  - `START_STICKY` (onStartCommand), `startForegroundSafely()`; header ghi service start bằng
    `startService` thường (VpnService tự pin process).
- `android/app/src/main/AndroidManifest.xml` — service `exported=false`,
  `stopWithTask=false`, `foregroundServiceType="specialUse"`, `BIND_VPN_SERVICE`.
- Nguyên nhân: khi app ở nền, `startForegroundService` + `startForeground` bị system_server
  (Xiaomi `AppsRelaunchController`) từ chối vì `isCallerSystem=false` ⇒ không được phép start FGS
  từ background.

## Appendix B — Hướng sửa (app-side)

### B.1 Exemption để start FGS từ nền

1. Khai báo `android.permission.SYSTEM_ALERT_WINDOW` trong manifest; xin quyền (Settings) hoặc cấp
   qua ADB `appops set com.privatevpn.app.tv.dev SYSTEM_ALERT_WINDOW allow`. Đây là một exemption
   cho start FGS/activity từ nền (Android 12+); cần **test thực tế trên Xiaomi**.
2. Dùng **exact alarm** `setExactAndAllowWhileIdle` (đã có `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`)
   thay cho `setAndAllowWhileIdle` — có thể được cấp temporary allowlist khi chuông nổ.

### B.2 "Mồi" foreground trước khi start service

Nếu vẫn bị chặn: khi chuông nổ, mở một **activity trong suốt** (trampoline, không UI, `finish()`
ngay) hoặc `MainActivity` rồi `moveTaskToBack` — vì app đang foreground nên được phép start FGS.
Cần `SYSTEM_ALERT_WINDOW` để start activity từ nền.

### B.3 Receiver bổ sung

- `USER_PRESENT` / `SCREEN_ON` / `MY_PACKAGE_REPLACED` → `VpnKeepAlive.ensureRunning` (hồi nhanh khi
  người dùng bật TV).
- `onTaskRemoved` của service → `ensureRunning`.

### B.4 Acceptance criteria

- [ ] `adb shell am kill com.privatevpn.app.tv.dev` (hoặc force-stop) ⇒ trong ≤ 2 phút service tự
      chạy lại, `127.0.0.1:1081` LISTEN, **không cần người dùng mở app**.
- [ ] Chạy được trên `MiTV-AFZP0` (Android 14) và `MiTV-ASTP0` (Android 9).
- [ ] Log `keepalive: đã yêu cầu service VPN chạy` + `tunnelUp=true`.
- [ ] Không crash; không đốt pin/CPU bất thường.

### B.5 Cách nghiệm thu

```bash
adb shell settings get global http_proxy
adb shell "cat /proc/net/tcp | grep 0439"      # 1081 phải LISTEN
adb logcat -s VPNFLOW_DIAG | grep -E "keepalive|tunnelUp|tuyến:"
adb shell am kill com.privatevpn.app.tv.dev    # rồi chờ ≤2 phút, kiểm lại
```

## Appendix C — Tạm thời trên TV `.104` (đã làm)

- `pm disable-user --user 0 com.xiaomi.mitv.tvmanager` → `disabled-user` (giảm kill).
- `am set-standby-bucket com.privatevpn.app.tv.dev 10`, `am set-inactive … false`,
  `cmd deviceidle whitelist +com.privatevpn.app.tv.dev`.
- `WRITE_SECURE_SETTINGS` đã cấp; app đang **Connected**, `127.0.0.1:1081` LISTEN.
- Watchdog `com.tvflow.watchdog` **đang disabled** (app v96 tự dò gateway; tránh 2 bên giành proxy).
- Nếu app bị kill: **mở app lên** để nối lại (cho tới khi Windows sửa xong).

## Liên quan

- `docs/handoff/HANDOFF_WINDOWS_AUTO_GATEWAY_2026-10-23.md` — tự dò gateway; **cần chỉnh lại** vì
  bản app 96 đã có `tuyến: tự dò được gateway ...` trong khi source repo chưa có (repo cũ hơn app).
- `docs/handoff/LAUNCHER_TVFLOW_HOME_v1.7_2026-10-23.md` — launcher/HomeGuard (không liên quan proxy).
