# LOCKED — cấu hình "Smart Gateway" ổn định (23/10/2026)

> Mốc chốt: FPT Play + TV360 (kênh TV) chạy ổn định trên cùng một proxy hệ thống
> `192.168.100.5:18081` nhờ **chia luồng theo tên miền**.
> Mọi version/hash dưới đây là bản đang chạy thật, đã kiểm chứng.

## 1. Repo / code

| Hạng mục | Giá trị |
|---|---|
| Commit | `c4452d83be160a1b0201bbe070558f12816dcdee` (`c4452d8`) |
| Tag | `lock-2026-10-23-smart-gateway` |
| Tính năng chốt | `tools/http-socks-bridge` hỗ trợ `-route <hậu tố>=<socks>` |

## 2. Mac gateway (LaunchAgent, chạy thường trực)

Thư mục: `~/Library/Application Support/flowvpn/`

| File | SHA-256 |
|---|---|
| `flowvpnrelay` (hysteria relay) | `9f9c8e323ed01ef1287c26b419d653a1b6dce293e087de380a6898afb444acd0` |
| `http-socks-bridge` | `1a7e086e468c51aa63faa3b6927f8d49278484b5f9d21a452f5467a581a91b31` |

```json
// config.json — Flow2, mặc định cho FPT + mọi traffic khác
{"server":"165.101.114.162:8443","socks5":{"listen":"127.0.0.1:1081"},
 "transport":{"type":"wsrelay","url":"wss://api.meetflowai.site/relay/vn2hy"}}

// config-flow3.json — Flow3, chỉ cho TV360
{"server":"103.6.235.39:8443","socks5":{"listen":"127.0.0.1:1083"},
 "transport":{"type":"wsrelay","url":"wss://api.meetflowai.site/relay/vn3hy"}}
```




LaunchAgent:

| Label | Vai trò |
|---|---|
| `site.flowvpn.relay` | relay Flow2 → SOCKS `127.0.0.1:1081` |
| `site.flowvpn.bridge` | HTTP proxy `0.0.0.0:18081` → socks 1081, **route `.tv360.vn=127.0.0.1:1083`** |
| `site.flowvpn.relay3` | relay Flow3 → SOCKS `127.0.0.1:1083` |
| `site.flowvpn.bridge3` | HTTP proxy `0.0.0.0:18083` → socks 1083 (tuỳ chọn) |
| `site.flowvpn.health` | 5 phút/lần: relay treo → `launchctl kickstart -k` |

Cài lại (nếu cần):
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/site.flowvpn.{relay,relay3,bridge,bridge3,health}.plist
```

## 3. TV (MiTV-AFZP0)

| Hạng mục | Giá trị |
|---|---|
| Build TV | `UD2A.240505.001.W1.OS3.0.8.0.UFZAATV` |
| VPNFlow TV app | `com.privatevpn.app.tv.dev` **versionCode 90** — APK sha256 `fd3189a7bc142b09c10709e3d2fc19ed1f72ebcc658f79b2093b633970894db0` |
| TVFlow Home | `com.tvflow.launcher` **versionCode 5** (v1.4) — sha256 `27c5a6289aae390ee1d1fc9e1235dbad7f93d59b825e13f0f91e517b45ab9387` |
| TVFlow Watchdog (guard) | `com.tvflow.watchdog` **versionCode 1** — sha256 `06e9656604a18349b9a1a425f8183e254cdf6d0509a905a6c39a2d138d71d3da` |
| DRM Probe | `com.tvflow.drmprobe` — sha256 `0ba9501e8efb1adc302592e27b8986bffee85f81cdb90e9a5eb90cd5e964df46` |

Cấu hình proxy trên TV:
```bash
adb shell settings put global http_proxy 192.168.100.5:18081
# app VPNFlow: proxy_mode=gateway, proxy_gateway=192.168.100.5:18081
adb shell run-as com.privatevpn.app.tv.dev sh -c \
  "sed -i 's|<string name=\"proxy_gateway\">[^<]*</string>|<string name=\"proxy_gateway\">192.168.100.5:18081</string>|' shared_prefs/vpnflow_hysteria.xml"
adb shell run-as com.privatevpn.app.tv.dev sh -c \
  "sed -i 's|<string name=\"proxy_mode\">[^<]*</string>|<string name=\"proxy_mode\">gateway</string>|' shared_prefs/vpnflow_hysteria.xml"
```

## 4. Bảng định tuyến đã kiểm chứng (23/10/2026)

| Dịch vụ | Node | Kết quả |
|---|---|---|
| FPT Play | Flow2 `165.101.114.162` (via 1081) | content + LIVE OK |
| TV360 kênh TV | Flow3 `103.6.235.39` (via 1083) | PLAYING, không còn C-310 |
| TV360 phim | Flow2 | OK |
| Mặc định/khác | Flow2 | OK |

Log kiểm chứng: `~/Library/Application Support/flowvpn/bridge.log`
(dòng `CONNECT host:443 via 127.0.0.1:1081|1083`).

## 5. Điều kiện & giới hạn

- Mac phải **bật**, không sleep (hoặc `sudo pmset -a sleep 0`), LaunchAgent tự chạy khi login.
- Nếu Mac tắt: guard trên TV fail-open về `:0` (TV vẫn Internet trực tiếp; FPT/TV360 không qua VPN).
- Windows gateway `192.168.100.11:18081` (Flow1) vẫn dùng được cho FPT, **nhưng chặn kênh TV360**.
- Thêm dịch vụ mới: thêm `-route .domain=127.0.0.1:1083` vào plist bridge rồi
  `launchctl kickstart -k gui/$(id -u)/site.flowvpn.bridge`.

## 6. Việc chưa chốt (để sau)

- Root/Magisk để TVFlow Home làm launcher mặc định + sửa whitelist TV Manager
  → `docs/handoff/PLAN_TV_XIAOMI_ROOT_2026-10-22.md`.
- Tự động chọn node nhanh nhất (throughput-aware) — harness đang phát triển.
