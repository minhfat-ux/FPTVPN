# LOCKED — TVFlow Home 2.6 + VPNFlow Guard 1.4 + app TV 1.4.5-tv-dev (24/10/2026)

> Mốc chốt: TV MiTV-AFZP0 `192.168.100.104` xem **FPT Play** và **TV360** qua proxy hệ thống
> trỏ gateway LAN (IP Việt Nam), app **không bị ngắt** khi tunnel đổi nhịp.
> Mọi version/hash dưới đây là bản **đang chạy thật** trên TV, đo ngày 24/10/2026.

## 1. Repo / code

| Hạng mục | Giá trị |
|---|---|
| Commit | `1ef558c` (`fix(android guard): chot guard v1.4 …`) |
| Tag | `lock-2026-10-24-tvflow-guard` |
| Tính năng chốt | guard chọn gateway bằng **CONNECT thật** (200), giữ proxy khi TCP còn sống, không gỡ `:0` oan |

File code chốt:

| File | Thay đổi |
|---|---|
| `android/guard/src/main/java/com/privatevpn/app/guard/GuardReceiver.java` | `DEFAULT_GATEWAY` = `.6 → .5 → .11`; `probeMs()` CONNECT thật; `bestGateway()` chọn nhanh nhất; nhánh "TCP còn sống thì giữ" |
| `docs/handoff/HANDOFF_SERVER_RELAY_RECOVERY_2026-10-23.md` | bàn giao khôi phục relay node-2 |
| `docs/handoff/HANDOFF_WINDOWS_PROXY_STABILITY_2026-10-23.md` | bàn giao ổn định proxy Windows |

## 2. Gateway LAN

| Vai trò | Địa chỉ | Đích ra | Ghi chú |
|---|---|---|---|
| Mac (dự phòng 1) | `192.168.100.6:18081` | node-2 `165.101.114.162` qua `wss://api.meetflowai.site/relay/vn2hy` | bridge → socks `127.0.0.1:1081`, route `.tv360.vn=127.0.0.1:1083` |
| Windows (đang dùng) | `192.168.100.5:18081` | node-1 `103.173.155.50` | máy Windows bật thì ưu tiên |
| Cũ/không dùng | `192.168.100.11:18081` | — | giữ trong danh sách, tự bị loại khi CONNECT hỏng |

Mac LaunchAgent: `site.flowvpn.relay`, `site.flowvpn.bridge`, `site.flowvpn.relay3`,
`site.flowvpn.bridge3`, `site.flowvpn.health`, `net.flowtech.keepawake` (`caffeinate -s`).

File + hash (Mac):

| File | SHA-256 |
|---|---|
| `~/Library/Application Support/flowvpn/flowvpnrelay` | `9f9c8e323ed01ef1287c26b419d653a1b6dce293e087de380a6898afb444acd0` |
| `~/Library/Application Support/flowvpn/http-socks-bridge` | `1a7e086e468c51aa63faa3b6927f8d49278484b5f9d21a452f5467a581a91b31` |
| `~/Library/Application Support/flowvpn/config.json` | `ce1493be55512411f101d865af8fe439e424282053fd4c9babeabe76763aeab2` |

`config.json` dạng khoá (credential đã che, xem file thật trên máy):

```json
{"server":"165.101.114.162:8443","insecure":true,"upKbps":30000,"downKbps":100000,
 "transport":{"type":"wsrelay","url":"wss://api.meetflowai.site/relay/vn2hy",
              "host":"api.meetflowai.site","links":1},
 "socks5":{"listen":"127.0.0.1:1081"},"dialTimeoutSec":15}
```

## 3. TV `192.168.100.104` (MiTV-AFZP0, Android 14, build `UD2A.240505.001.W1.OS3.0.8.0.UFZAATV`)

| Thành phần | version | sha256 APK | Cài lúc |
|---|---|---|---|
| TVFlow Home (`com.tvflow.launcher`) | 2.6 (vc 17) | `9808d211f222452da4f1f6cc10fc878bf4c46a6048d9ba4dc22cdc6f66fec9e6` | 2026-10-24 00:24 |
| VPNFlow Guard (`com.privatevpn.app.guard`) | 1.4 (vc 5) | `dc4af8b83003005afdc5209a01d6c81ef381db7b412d8a9b4eef32961816fbf9` | 2026-10-23 23:05 |
| VPNFlow TV (`com.privatevpn.app.tv.dev`) | 1.4.5-tv-dev (vc 100) | `4454861d501e5fb8bdb2a7837b0f4f0ee38cf4af935d9ee31046737b4a782810` | 2026-10-24 00:09 |

Cấu hình proxy hệ thống trên TV: `http_proxy = 192.168.100.5:18081` (gateway Windows).
Guard giữ danh sách dự phòng `192.168.100.6:18081,192.168.100.5:18081,192.168.100.11:18081`,
dò bằng CONNECT thật mỗi 60 s, chỉ gỡ `:0` khi **mọi** gateway TCP-chết.

## 4. Nghiệm thu (số đo thật 24/10/2026)

| Phép đo | Kết quả |
|---|---|
| Gateway `.5` (Windows) | `204`, 1.09 s |
| Gateway `.6` (Mac) | `204`, 1.85 s |
| FPT CDN qua `.5` (`vodcdn.fptplay.net`) | `210`, 0.83 s |
| Số lần guard gỡ proxy oan (`:0`) trong 600 dòng log gần nhất | **0** |
| FPT Play khi đang xem | foreground, logcat 200 dòng gần nhất **0 lỗi/timeout** |

## 4b. Launcher 2.3→2.6 (24/10/2026)

| Việc | Nội dung | Bằng chứng |
|---|---|---|
| Sửa lỗi "không di chuyển được box cuối" (2.3, vc 14) | `moveBy()` đổi chỗ theo **hàng đang hiển thị** (`rowApps` tag) rồi mới ghi lại `customOrder`, thay vì đổi theo chỉ số trong `customOrder` (danh sách này chứa cả app không hiện ra hàng ⇒ box cuối đổi chỗ với phần tử vô hình, màn hình không đổi) | log `MOVE enter com.tvflow.drmprobe visible=8 order=11` (đúng nguyên nhân) → sau khi sửa: `MOVE swap com.tvflow.drmprobe <-> org.smarttube.stable idx=5/8`, dump `uiautomator` xác nhận thứ tự đổi |
| Giảm nhịp HomeGuard (2.4→2.6, vc 15-17) | 2000 ms → 120 ms, cửa sổ `queryEvents` 800 ms, chống dội 600 ms, `moveTaskToFront` trước `startActivity` | 4 lần bấm HOME: TVFlow Home khởi động lại sau **180-430 ms** (trước: **1,9 s**) |
| Thêm `HomeWatcherService` (2.5, vc 16) | AccessibilityService bắt `TYPE_WINDOW_STATE_CHANGED` của `com.mitv.tvhome` ⇒ bật lại TVFlow Home ngay (dự phòng tầng 2 cho HomeGuard) | `dumpsys accessibility`: service bound, `Enabled services: com.tvflow.launcher/com.tvflow.launcher.HomeWatcherService`; log `TVFlowWatch: MiHome -> TVFlow Home (accessibility)` |

### Vì sao không đặt được TVFlow Home làm HOME mặc định (đã thử, bị Xiaomi chặn)

| Cách | Kết quả thật |
|---|---|
| `cmd package set-home-activity com.tvflow.launcher/.MainActivity` | trả `Success`, nhưng `cmd package resolve-activity -c HOME -a MAIN` **vẫn ra** `com.mitv.tvhome/.MainActivityUserMode`; bấm HOME vẫn `START ... cmp=com.mitv.tvhome/...` |
| Tăng `android:priority` của intent-filter HOME lên 2000 | không đổi, resolve vẫn ra MiHome |
| `pm disable-user --user 0 com.mitv.tvhome/com.mitv.tvhome.MainActivityUserMode` | `SecurityException: Shell cannot change component state ...` (máy không root) |

⇒ Trên firmware này MiHome bị ghim cứng ở tầng hệ thống; phương án khả thi **không root** là bounce nhanh (đang làm, ~0,2-0,4 s).
Muốn **tuyệt đối không thấy MiHome**: cần root (đổi home component/`pm disable`) hoặc overlay toàn màn hình che lúc chuyển — chưa làm.

### Trạng thái TV sau khi test (đã khôi phục)

- Ngôn ngữ: **Tiếng Việt**; thứ tự app: `FPT Play, VPNFlow, Gallery, Settings, Wireless Share, SmartTube, DRM Probe, TV360`.
- Proxy: `192.168.100.5:18081`; guard 1.4 giữ nguyên.

## 5. Giới hạn đã biết

1. **Phím HOME vẫn lóe MiHome ~0,2-0,4 s** (xem §4b) — chưa phải "vào thẳng TVFlow Home".
2. **Relay Mac flap**: `relay.log` có lúc `nhận terminated — thoát` rồi launchd dựng lại ⇒ vài giây
   `127.0.0.1:1081` bị `connection refused`, gateway `.6` trả `000`. Hiện TV bám `.5` nên không ảnh hưởng.
   Nếu `.5` chết đúng lúc `.6` đang dựng lại, guard xử lý ở nhịp kế tiếp (tối đa 60 s).
3. Guard nhịp **60 s** — đủ cho xem phim (player còn buffer), chưa đủ "đổi gateway trong 5 s".
   Muốn siết: hạ `INTERVAL_MS` xuống 5 s kèm đường nhanh "dò đúng gateway đang dùng trước"
   (đã thử, chưa build/ cài — không nằm trong mốc chốt này).

## 6. Khôi phục / rollback

- Cài lại đúng bản chốt: `TVFlowHome-2.2.apk`, `VPNFlowGuard-1.4.apk` trong `/Volumes/BIWIN/XiaoMiLauncher/`.
- Mac gateway chết: `launchctl kickstart -k gui/$(id -u)/site.flowvpn.relay` rồi thử
  `curl -x http://192.168.100.6:18081 https://connectivitycheck.gstatic.com/generate_204` phải `204`.
- TV mất proxy: `adb -s 192.168.100.104:5555 shell settings put global http_proxy 192.168.100.5:18081`.
