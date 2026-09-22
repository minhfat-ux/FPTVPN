# Bản dựng sẵn để phát hành — 19/09/2026

Bảng này là nguồn số liệu để publisher đặt file + set mốc phiên bản. **Chưa upload gì.**
Quy trình chung: xem `docs/RELEASE_RUNBOOK.md`.

## iOS 1.4.0 (build 15) — IPA ad-hoc

| | |
|---|---|
| File (máy build Mac) | `build/ios-adhoc-export/ipa/FlowVPN.ipa` |
| Kích thước | 5.049.845 bytes |
| sha256 | `b6bf9a04bf3331655dcefd062c957d22ee81d177d8880636ec4ba492d4150677` |
| Version trong IPA | app `1.4.0/15`, extension `com.privatevpn.app.packet-tunnel` `1.4.0/15` (kiểm bằng `plutil` bên trong IPA) |
| Ký | Ad Hoc, Team `G6XW3RN6LJ`, profile hết hạn 2027-07-19, **6 UDID**, `get-task-allow=false` (khách không cần Developer Mode) |
| Release notes | `release/ios/RELEASE_NOTES_1.4.0.md` |
| Đích trên node-2 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` (route `GET /v1/downloads/ios` đọc file này) |
| Mốc phiên bản | `latest_version=1.4.0`, `ipa_build=15` (phải khớp `CFBundleVersion` của manifest OTA) |

Nội dung bản này: sửa lỗi tunnel "Connected mà không chở gói" không tự dựng lại (vòng kiểm tra sống/chết mỗi 10s),
sửa "Connect lại phải force-quit app" (cô lập phiên + listener UDP không tái dùng fd), và backpressure đường WS.
**Lưu ý**: iOS vẫn dùng transport WireGuard-chồng-relay; hysteria2 cho Apple là bước sau.

## Android 1.4.0 (versionCode 20) — 2 APK

| Biến thể | File (máy build Mac) | Kích thước | sha256 | minSdk |
|---|---|---|---|---|
| modern | `~/.vpnflow-build/app/outputs/apk/modern/release/app-modern-release.apk` | 96.519.741 B | `a780a773806c8ddf4e0b55945db52df0780a982b95cec864a4b1a9da23f956e8` | 26 |
| legacy | `~/.vpnflow-build/app/outputs/apk/legacy/release/app-legacy-release.apk` | 96.536.114 B | `e36b4fcba4f9b104ec0235d5e5ac569eb46d2538144e13634dc27455a352bc46` | 24 |

| | |
|---|---|
| Version | `1.4.0` / versionCode `20` (cả 2 biến thể), đã ký cùng một cert |
| Release notes | `release/android/RELEASE_NOTES_1.4.0.md` |
| Đích trên node-2 | `app-modern-release.apk` → `/root/flowvpn-apk/VPNFlow-latest.apk`; `app-legacy-release.apk` → `/root/flowvpn-apk/VPNFlow-android7.apk` |
| Mốc phiên bản | `PATCH /v1/admin/android-version {"latest_version":"1.4.0"}` — **không** đặt `minimum_version` |

Nội dung bản này (ưu tiên tốc độ): sửa lỗi khai sai băng thông cho Brutal CC trên Wi-Fi **unmetered**
(trước đây khai mức mobile 8/12 Mbps ⇒ trần bị kéo xuống ~12 Mbps; nay khai đúng theo loại mạng 30/100 Mbps).
Đo trước khi sửa, cùng Wi-Fi cùng URL: RAW ~49,8 Mbps vs VPN ~13,4 Mbps (trung vị 10,1). Chủ dự án đã test
và xác nhận **cải thiện rất tốt**; số đo định lượng sau khi sửa đang chờ bổ sung.

## Việc chưa xong (đừng ghi vào release notes là đã có)

- **Bypass WeChat**: bản Windows đã có rule `domain_suffix` cho WeChat/Tencent + `.cn` đi thẳng, nhưng
  **cần test lại trên máy thật** trước khi coi là xong; Android/iOS/Mac chưa có split-tunnel (đang điều tra).
- **Apple hysteria2**: macOS extension đã hysteria-only nhưng TCP còn blackhole (cần rebuild framework với
  stack gVisor); iOS chưa chuyển. Bản iOS 1.4.0 ở trên **không** dùng hysteria2.

## 🔒 ĐÓNG BĂNG iOS (19/09/2026, theo yêu cầu chủ dự án)

Chủ dự án xác nhận bản iOS **1.4.0 (build 15)** đang chạy **tốt và ổn định** và yêu cầu **khoá lại, không sửa gì thêm**.

- **Không sửa** `iOS/**` (đặc biệt `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift`, `WSRelayClient.swift`, `RelayUDPListener.swift`), **không** đổi version iOS, **không** build lại IPA trừ khi chủ dự án yêu cầu.
- Bản đóng băng tương ứng: IPA ở `build/ios-1.3.3...` không dùng; bản đang dùng là **`build/ios-adhoc-export/ipa/FlowVPN.ipa`** (1.4.0/15, sha256 `b6bf9a04bf3331655dcefd062c957d22ee81d177d8880636ec4ba492d4150677` — xem bảng phía trên) tại commit `b08649d`.
- Việc **hysteria2 cho iOS** (chuyển NE sang hysteria-only) **tạm dừng** cho tới khi chủ dự án mở khoá. Công việc Apple hiện chỉ làm trên **macOS**.
- Lưu ý kỹ thuật: thư mục `iOS/PrivateVPNPacketTunnel/` được **dùng chung** với target extension macOS, nên sửa file trong đó có thể đổi binary iOS nếu build lại app iOS — vì vậy tuyệt đối không build lại iOS trong lúc khoá.

## 🔒 ĐÓNG BĂNG Android (19/09/2026, theo yêu cầu chủ dự án)

Chủ dự án xác nhận bản Android **1.4.0 (versionCode 20)** đã **sửa xong tốc độ, kết nối tốt** và yêu cầu **khoá lại, không sửa gì thêm**.

- **Không sửa** `android/**` (đặc biệt `HysteriaVpnService.kt`, `Config.kt`), **không** đổi version, **không** build lại APK trừ khi chủ dự án yêu cầu.
- Bản đóng băng = 2 APK ở bảng phía trên (modern `a780a773…56e8`, legacy `e36b4fcb…bc46`), release notes `release/android/RELEASE_NOTES_1.4.0.md`, commit `b08649d`.
- Việc còn treo (không nằm trong bản đóng băng): **bypass WeChat cần test lại**; split-tunnel theo CN cho Android chưa làm.

## 🔒 ĐÓNG BĂNG macOS (19/09/2026, theo yêu cầu chủ dự án)

Chủ dự án xác nhận bản macOS (hysteria2/gVisor) **chạy ổn** và yêu cầu **khoá lại sau khi đóng gói release**.

- Bản đóng băng = build **1.4.0 / build 14** (đang được đóng gói khi ghi dòng này; artifact + sha256 sẽ bổ sung vào mục macOS ở phía trên).
- **Không sửa** `mac/**`, `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift`, `HysteriaTransport.swift`, `tools/hysteria-apple/**` (trừ khi chủ dự án yêu cầu). Không build lại bản macOS trừ khi có yêu cầu.
- Việc treo (KHÔNG nằm trong bản khoá, làm sau khi có yêu cầu): bỏ hiện tượng "lượt tải đầu sau Connect chậm rồi mới tăng"; tăng tốc hơn nữa; WeChat split-tunnel; iOS hysteria2 (bản test riêng).

## macOS 1.4.0 (build 14) — ZIP (đóng gói 19/09, chưa upload)

| | |
|---|---|
| File | `/tmp/VPNFlow-mac-1.4.0.zip` (bản bền: `~/.vpnflow-build/mac/VPNFlow-mac-1.4.0.zip`) |
| Kích thước | 21.396.621 bytes (20,40 MiB) |
| sha256 | `262634c62b4d775671771d8264efdca3a1ac135c23cdd0c3037d576f1450ed7b` |
| Version | app `com.privatevpn.mac` **1.4.0/14**, extension `com.privatevpn.mac.packet-tunnel` **1.4.0/14** (universal x86_64 + arm64, yêu cầu macOS 14+) |
| Ký | `Apple Development: minhnb2@me.com` (Team G6XW3RN6LJ); **CHƯA notarize** ⇒ máy khác lần đầu: chuột phải → Open |
| Release notes | `release/mac/RELEASE_NOTES_1.4.0.md` |
| Đích trên node-2 | `/root/flowvpn-mac/VPNFlow-mac.zip` (route `GET /v1/downloads/mac` đọc file này; env override `MAC_APP_ZIP_PATH`) |
| Mốc hiển thị | `latest_mac_version = 1.4.0` — **không có API admin** cho khoá này: set trực tiếp SQLite `app_config` (DB `control-plane/data/app-config.db`) HOẶC env `MAC_APP_VERSION` rồi restart CP |

Nội dung bản này: chuyển transport macOS sang **hysteria2 qua relay Cloudflare (stack gVisor)** thay cho WireGuard-chồng-relay; sửa lỗi "bật VPN mất toàn mạng" (TCP blackhole); **tự gỡ tunnel** khi blackhole 10s hoặc 0 gói 15s (kiểm mỗi 5s). Số đo: VPN 24–52 Mbps (median 27), RAW 66–105 Mbps cùng mạng.

## 🔒 ĐÓNG BĂNG Android + iPad (19/09/2026 tối, "để test vài ngày")

Chủ dự án yêu cầu **khoá 2 bản này để test vài ngày**. Các bản đang cài trên máy = bản đóng băng:

| Nền tảng | Bản đóng băng | Bằng chứng |
|---|---|---|
| **Android** | 1.4.0 / versionCode **20** (APK modern sha256 `dee9f82370c415…589e4ff3`) | `adb shell dumpsys package com.privatevpn.app` → versionName 1.4.0; log `bw: ramp …` chạy thật |
| **iPad/iOS** | 1.4.0 / build **16** (IPA sha256 `20050977c7cbf9…81ac7a74`) | `xcrun devicectl device info apps` → 1.4.0 (16); log `bridge: packetFlow→Go … SYN/SYN-ACK khớp` |

**Quy tắc khi đang khoá:** không sửa `android/**` và `iOS/**` cho 2 nền tảng này, **không build lại APK/IPA**, **không cài đè** lên máy đang test — trừ khi chủ dự án yêu cầu. Các worker đang làm dở đã được **dừng** (Android: bỏ việc kéo số khai lên nấc tĩnh; iOS: sửa bộ nhớ bị nhiễm số tĩnh) — code dở được commit riêng, **chưa phát hành**.

**macOS không nằm trong lệnh khoá này** (đang build lại với khai báo động + các fix trên).

Việc treo khi khoá: 3 fix nhỏ (Android clamp, iOS memory, macOS khai động), multipath, telemetry client (`bw_policy`), node HK.

## macOS — ĐO THẬT + PHÁT HÀNH LẠI (20/09/2026 ~01:30, khách sạn Quảng Châu)

### 1. Số đo (MacBook Air, node-1 `103.173.155.50`, relay `/relay/vn1hy`)

| Phép đo | RAW (buộc ra `en0`) | Qua VPN | VPN/RAW |
|---|---|---|---|
| 1 luồng 50 MB (speed.cloudflare.com) | 49,7 Mbps | 31,3 / 36,3 / 38,3 / 41,5 / 41,8 / 45,5 / 48,2 / 49,3 Mbps (8 lượt) | 63–99% |
| 4 luồng × 25 MB | 75,3 Mbps | 42,8 / 55,5 / 71,0 Mbps | 57–94% |
| 8 luồng × 10 MB | — | 56,9 Mbps | — |

Streaming qua VPN (YouTube, đo bằng realtime factor = thời lượng tải được / thời gian tải):

| Stream | Goodput | realtime |
|---|---|---|
| 1080p60 AV1 (nominal 1,57 Mbps) | 3,0 Mbps | 1,52× |
| 1440p60 AV1 (3,94 Mbps) | 7,5 Mbps | 1,56× |
| 1440p60 VP9 (5,97 Mbps) | 11,6 Mbps | 1,46× |
| 4K60 AV1 (8,98 Mbps) | 17,0 Mbps | 1,70× |
| 4K60 VP9 (17,17 Mbps) | 28,6 Mbps | 1,42× |
| 4K60 VP9 **liên tục 120 s** | 30,4 Mbps trung bình | 1,90× (không suy giảm) |
| Apple HLS 1080p (bipbop) | — | 7× |

Khác: tunnel lên lại sau **2 s** khi Connect; khai báo đọc từ bộ nhớ `up=20565/down=68552 kbps`; ICMP trong tunnel 0% loss (RTT do stack tunnel trả lời nên không phản ánh RTT thật); DNS qua tunnel 0,17–0,22 s; extension ăn **84–128% CPU 1 core**, RSS 72–78 MB khi chở 30 Mbps.

⇒ Đạt và vượt chỉ tiêu ≥20 Mbps (đơn luồng 31–49 Mbps), 4K60 chạy êm không đệm.

### 2. Lỗi tìm được khi đo

1. **Link tải Mac phục vụ bản CŨ 5 ngày**: route `GET /v1/downloads/mac` trỏ vào `/root/flowvpn-mac/VPNFlow-mac.dmg` (env `MAC_APP_ZIP_PATH=/root/flowvpn-mac/VPNFlow-mac.dmg` trong `/etc/systemd/system/flowvpn-cp.service.d/store-urls.conf`), mà file DMG đó là **1.3.3 / build 13, last-modified 15/09** — người dùng tải về không phải bản 1.4.0. Đã thay bằng DMG 1.4.0/14 (mục dưới) và **kiểm bằng sha256 tải qua route công khai** (lần trước chỉ kiểm HTTP 200 nên lọt).
2. **Bản macOS đang cài thiếu guard "ramp không được HẠ số khai"**: log thật `bw: ramp … observed=11036 old=20565/68552 new=16554/16554 reason=idle-reconnect` — hạ `down` 4 lần. Bản build mới (guard có trong binary, kiểm bằng chuỗi `không cho số khai`) log `observed=20696 old=20565/68552 new=25707/31044`, cả hai chiều đều tăng.
3. **Build macOS phải kèm credential**: `xcodebuild` trần cho ra app **thiếu** `HysteriaPassword`/`HysteriaObfs` trong Info.plist ⇒ extension chết với `providerConfiguration thiếu khoá "hysteria"`. Phải `eval "$(scripts/dev-hysteria-build-env.sh)"` rồi truyền `HYST_PASSWORD=… HYST_OBFS=…`.

### 3. Artifact đã phát hành (thay bản 1.3.3 trên route tải)

| | |
|---|---|
| DMG | `/root/flowvpn-mac/VPNFlow-mac.dmg` — **23.961.684 bytes**, sha256 `d416b3ff45480add91596bd37f59b6ac6b9cfa90ebc1448f4bfd7731be19ecff` (backup bản 1.3.3: `VPNFlow-mac.dmg.backup-20260920-004817`) |
| ZIP | `/root/flowvpn-mac/VPNFlow-mac.zip` — **21.496.293 bytes**, sha256 `72f06385c6a810ffcc20282ac0cfe995954c169d499b60c7bb978f70178b7715` |
| Version | app + extension **1.4.0 / build 14**, extension sha256 `1ee5463afce7431f806aa30725fe56485717e7b721b29b67f9c9b890ffbb48da` |
| Ký | `Apple Development: minhnb2@me.com`; chưa notarize |
| Kiểm chứng | `curl https://meetflowai.site/v1/downloads/mac` → 23.961.684 bytes, sha256 khớp `d416b3ff…` ✅ |
| Nguồn | build từ cây làm việc 20/09 (guard + `pendingForceAfter` + lọc bộ nhớ nhiễm); nguồn **không đổi** trong lúc build (`shasum iOS/PrivateVPNPacketTunnel/*.swift` trước/sau) |

> **Chốt 22/09/2026 — hai DMG 1.4.0/14 ở bảng trên KHÔNG còn là bản route đang phát.**
> Đọc thẳng artifact hiện phục vụ (`GET /v1/downloads/mac`): DMG **21.617.309 B**, sha256
> `9d05f271232b75ddbae281059ff48355d5162032cb2a86114fafc130bfd54597`; `Info.plist` app + extension =
> **1.4.0 / build 14**; ký `Developer ID Application: Minh Nguyen (G6XW3RN6LJ)`; `spctl` =
> `Notarized Developer ID`; `stapler validate` = **chưa staple**. Bảng trên là vết trung gian
> 19–20/09 (23.961.684 / 23.972.080 B, Apple Development, chưa notarize) — giữ để đối chiếu lịch sử.

## 20/09/2026 — Sửa dashboard "đang kết nối" + alert máy mới + login nhảy 2 bản

### 1. Dashboard sai vì sao (đo thật)
- Khách đang kết nối **2 máy** nhưng `/v1/admin/stats` trả `online_peers: 0`, `online_devices: []`.
- Nguyên nhân gốc: dashboard chỉ đếm **handshake WireGuard**, mà từ 19/09 mọi bản app đi **hysteria2 qua relay Cloudflare** ⇒ không bao giờ có handshake.
- Tín hiệu sống duy nhất còn lại là `lastSeenAt`, nhưng 3 client (iOS/Android/Windows) gọi `POST /v1/peers/heartbeat` mỗi 30s mà **route đó chưa từng tồn tại** ở server (404 im lặng). Máy Mac thì không gọi heartbeat chút nào.

### 2. Đã sửa + deploy (node-2)
| Việc | Chi tiết |
|---|---|
| `aggregateDeviceSessions()` | `control-plane/src/connection-stats.js` — thiết bị thật báo cáo trong 30 phút (`ONLINE_DEVICE_WINDOW_MIN`), gộp với nguồn WG legacy, dedup theo `device_id` |
| `/v1/admin/stats` | trả `totals.online_devices`, `device_report_window_min`, `device_sessions_totals` |
| `POST /v1/peers/heartbeat` | route MỚI + allowlist auth; credential được **lưu** vào bản ghi khi register/claim (trước đây sinh mới mỗi lần trả về nên không xác thực được). Bản ghi cũ: nhận lần đầu rồi ghim (TOFU) + ghi log |
| Alert Telegram | `POST /v1/devices/claim` cho máy MỚI nay gửi `deviceRegisteredAlert` — trước 20/09 chỉ `/v1/peers/register` mới alert, nên máy Android claim lúc 10:46 chỉ để lại dòng log |
| Mac client | gửi heartbeat mỗi 120s khi tunnel sống (`mac/PrivateVPNMac/VPNManagerMac.swift`); chỉ dừng khi tunnel ĐÃ từng lên rồi mới tắt (NE báo `.disconnected` vài nhịp lúc chuẩn bị profile, dừng sớm là chết ngay sau 19 ms) |

Kiểm chứng: log `heartbeat: ok` cách nhau 122s; `/v1/admin/stats` → `online_devices: 3` (`mac-lnakgro1` reported 50s, `ios-166c028a` 167s, `android-ee8b6dae` 1627s).

### 3. macOS 1.4.0/14 — DMG cập nhật (có heartbeat)
| | |
|---|---|
| DMG | `/root/flowvpn-mac/VPNFlow-mac.dmg` — **23.972.080 bytes**, sha256 `0b54c12edd14d6e3627640e97e109cc736917113acfa5f7d8f12ab80404fa92a` (backup bản trước: `.backup-20260920-152902`) |
| Kiểm chứng | `curl -sSI https://meetflowai.site/v1/downloads/mac` → 200 · content-length 23.972.080 |

### 4. Login "nhảy" giữa 2 bản (fbuddy)
- Triệu chứng: `https://fbuddy.meetflowai.site/` ra trang đúng (slogan trái + box đăng nhập phải) nhưng có lúc ra **trang login cũ** (1 card giữa trang, brand "FlowGpt"), kèm 502 lác đác.
- Nguyên nhân: đang trong lúc chuyển service `flowgpt` → `fbuddy` (build mới lúc 14:22–14:23 ngày 20/09). Shell cũ trong cache trình duyệt/edge vẫn trỏ tới **bundle cũ** — asset có hash được cache `immutable` 1 năm, nên mở lại tab là thấy giao diện cũ. Route `/assets/index-BiAU-WYK.js` (bản cũ) vẫn `200 · cf-cache-status: HIT`.
- Đã sửa: `index.html` trả `Cache-Control: no-store, must-revalidate` (+ `Pragma: no-cache`) — đã deploy `/opt/fbuddy/server/src/index.js` và kiểm header công khai (`cf-cache-status: DYNAMIC`).
- Kiểm chứng bố cục sau khi sửa (Chrome headless dumps DOM): `fbuddy.meetflowai.site/`, `?lang=en`, `flowgpt.meetflowai.site/?lang=vi` đều có `auth-hero` (slogan trái) + `auth-panel/auth-card` (box phải), title "fBuddy — Trợ lý AI đa năng".
- Còn lại: cache edge vẫn giữ bundle cũ; purge bằng token trong drop-in **không đủ quyền** (`Authentication error`) — cần purge tay trên Cloudflare dashboard nếu muốn sạch hẳn (không bắt buộc vì HTML đã no-store).
