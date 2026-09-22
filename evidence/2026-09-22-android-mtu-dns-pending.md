# Android MTU/DNS — việc dở chưa commit (phát hiện 2026-09-22)

> Trạng thái: **CHƯA ÁP DỤNG** — đang nằm trong `git stash`, không nằm trong cây làm việc.
> Người quyết: chủ dự án (xem §4). Liên quan: `BUG-ANDROID-CPU-001`, ADR-0005 không liên quan.

## 1. Phát hiện

Khi đồng bộ `origin/main` (50 commit) trước khi push đợt dọn nợ trạng thái,
`git merge` **bị chặn** vì 3 file Android đang sửa dở trong cây làm việc
(`android/app/build.gradle.kts`, `Config.kt`, `vpn/HysteriaVpnService.kt`) **cũng bị
upstream sửa**. Đối chiếu từng thay đổi:

| Thay đổi trong diff dở | Upstream (`origin/main`) | Kết luận |
|---|---|---|
| `versionCode = 20 → 21` | đã là `21`, `versionName = "1.4.1"` | **ĐÃ BỊ THAY THẾ** (trùng hoàn toàn) |
| `HY_MTU = 1500 → 1300` | vẫn `1500` | còn giá trị |
| `addDnsServer` 1 → 2 resolver (`Config.HY_DNS_SERVERS`) | vẫn `1.1.1.1` đơn | còn giá trị |

Kiểm chứng upstream không đụng MTU/DNS:
`git diff HEAD origin/main -- android/ | grep -iE "^[+-].*(mtu|dns|resolver)"` → **rỗng**;
`git show origin/main:android/.../HysteriaVpnService.kt` → `const val HY_MTU = 1500` (không có
comment giải thích), `builder.addDnsServer("1.1.1.1")`.
Hai commit Android của upstream là về việc khác: `0ac7d4c` (1.4.1 + probe RTT có mục tiêu dự
phòng) và `152e524` (hiện version ở Settings).

## 2. Vì sao KHÔNG commit

1. Chưa có bằng chứng: không build lại APK, không đo `top -H`/`dumpsys cpuinfo`, không đo
   MTU/DNS trên máy Android thật. Commit nó sẽ là "đã sửa" mà không có bằng chứng.
2. Upstream vừa phát hành Android 1.4.1 (có IPv6 `HY_TUN_IPV6`) trong cùng file ⇒ áp diff cũ
   máy móc sẽ hỏng ngữ cảnh; phải **áp lại có ý thức** lên code mới.
3. `BUG-ANDROID-CPU-001` còn nguyên điều kiện chặn: cần 1 máy Android thật để đo.

## 3. Cách lấy lại việc dở

```bash
git stash list
# stash@{0}: On main: 2026-09-22: MTU 1500->1300 + 2 DNS resolver (Android) — cua phien truoc...
git stash show -p stash@{0}
```

Bản patch rời (cùng nội dung, không được track):
`.privatevpn/tmp/2026-09-22-android-uncommitted.patch` — 73 dòng,
sha256 bắt đầu `0a19103e4b1c87c3`.

## 4. Đề xuất (chờ chủ dự án)

Áp lại **chỉ 2 thay đổi còn giá trị** (MTU 1300 + 2 resolver) lên code Android 1.4.1 hiện tại,
theo đúng `docs/ANDROID_CPU_TODO.md` và commit `TUNNEL_MTU_DNS_BUGREPORT` §4.1/§4.2 mà chính
diff cũ dẫn ra, **kèm** build APK bằng `.tools/jdk/temurin-17.jdk/Contents/Home` (JDK 17 chạy
tốt — blocker cũ trong `BUG-ANDROID-CPU-001` đã hết đúng) và một lần đo trên máy thật.
Bỏ hẳn phần `versionCode` vì upstream đã ở 21.

## 5. ĐÃ NHẬN BÀN GIAO & ÁP LẠI (22/09/2026, harness Windows)

> Patch gốc (`.privatevpn/tmp/2026-09-22-android-uncommitted.patch`) và `git stash` của phiên trước
> **đã KHÔNG còn** (`git stash list` chỉ còn 2 mục từ 16/09) ⇒ không merge máy móc được. Đã áp lại
> **có ý thức** đúng 2 thay đổi còn giá trị, theo `TUNNEL_MTU_DNS_BUGREPORT` §4.1/§4.2.

| Thay đổi | Chỗ sửa | Ghi chú |
|---|---|---|
| `HY_MTU = 1500 → 1300` | `android/…/vpn/HysteriaVpnService.kt` | Hằng này dùng chung cho `builder.setMtu`, `Mobile.serve(...)` ×2 ⇒ đổi 1 chỗ là đủ. Chọn 1300 (khuyến nghị 1280–1360) |
| `addDnsServer("1.1.1.1")` → vòng lặp `Config.HY_DNS_SERVERS` | `android/…/vpn/HysteriaVpnService.kt` + `Config.kt` | Thêm `val HY_DNS_SERVERS = listOf("1.1.1.1", "8.8.8.8")` — **2 nhà cung cấp khác nhau** nên hỏng độc lập |
| ~~`versionCode 20 → 21`~~ | — | **BỎ**, upstream đã ở 21/1.4.1 |

### Bằng chứng đã chạy thật (JDK Temurin 17.0.20.1 + Android SDK 36, harness Windows)

```
.\gradlew.bat :app:compileModernDebugKotlin :app:compileLegacyDebugKotlin \
    --rerun-tasks --no-build-cache
   > Task :app:compileModernDebugKotlin
   > Task :app:compileLegacyDebugKotlin
   BUILD SUCCESSFUL in 59s            ← không có dòng `e:` / `error:`

.\gradlew.bat :app:assembleModernDebug :app:assembleLegacyDebug
   BUILD SUCCESSFUL in 10s
```

Kiểm chứng hằng số mới **có thật trong bytecode** đã biên dịch (không chỉ trong source):
`HysteriaVpnService.class` chứa `HY_MTU`; `Config.class` chứa `HY_DNS_SERVERS` + chuỗi `8.8.8.8`.

### Việc CHƯA làm được (còn treo)

**Chưa đo được trên máy thật.** Lúc bắt đầu phiên có thiết bị `SM-F9460` (Galaxy Z Fold5, Android 16)
qua adb, nhưng **máy tự ngắt kết nối giữa phiên** (`adb devices` → rỗng; đã `kill-server`/`start-server`
vẫn không thấy lại). Vì vậy các bước nghiệm thu dưới đây **vẫn phải chạy** khi có máy:

```bash
adb shell dumpsys connectivity | grep -iE 'InterfaceName: tun0|MTU|DnsAddresses'   # kỳ vọng MTU 1300 + 2 DNS
adb shell dumpsys connectivity | grep -iE 'InterfaceName: tun0|MTU'                # xem §5 TUNNEL_MTU_DNS_BUGREPORT
# rồi chạy lại 3 kịch bản đo CPU ở docs/ANDROID_CPU_TODO.md §4
```

`BUG-ANDROID-CPU-001` **vẫn chưa đóng** vì thiếu số đo trên máy thật. Ghi chú kỹ thuật: APK debug có
`applicationId` riêng (`com.privatevpn.app.dev`) nên cài song song được, không phải gỡ bản khách đang dùng.

