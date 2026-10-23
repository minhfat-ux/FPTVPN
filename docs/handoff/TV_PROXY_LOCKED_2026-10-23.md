# Agent Handoff

- **Agent:** harness Mac (worker)
- **Task ID:** LOCK-TV-PROXY-2026-10-23
- **Date:** 2026-10-23
- **Status:** verified (đã chốt cấu hình đang chạy tốt)

## Summary

TV `192.168.100.104` (`MiTV-AFZP0`) đang xem FPT Play **rất tốt**; chốt (lock) cấu hình hiện tại để
không bị thay đổi. Đường ra: proxy hệ thống `192.168.100.5:18081` → egress `103.173.155.50` (VPN),
app VPNFlow `1.4.5-tv-dev` (versionCode 96) đang Connected, Xiaomi TV Manager đã tắt.

## Cấu hình đã chốt

| Hạng mục | Giá trị |
|---|---|
| `settings get global http_proxy` | `192.168.100.5:18081` |
| Egress qua gateway | `103.173.155.50` (node VN) |
| App VPN | `com.privatevpn.app.tv.dev` `1.4.5-tv-dev` (versionCode 96) |
| `proxy_mode` (prefs app) | `gateway` (khoá cứng — không cho app nhảy sang tunnel/Mac) |
| `proxy_gateway` (prefs app) | `192.168.100.5:18081` (đã pin, backup `.bak-lock`) |
| Xiaomi TV Manager | `disabled-user` |
| Watchdog `com.tvflow.watchdog` | disabled |
| Launcher | `com.tvflow.launcher` v2.1 (HomeGuard) |
| Pin/Doze | standby bucket active, deviceidle whitelist |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20261023-21 | runtime_checked | `.5:18081` tải 1 MB = **175 KB/s** (5,7 s) |
| EVID-20261023-22 | runtime_checked | `.3:18081` và `.6:18081` = **0** (chết) tại thời điểm test |
| EVID-20261023-23 | runtime_checked | egress qua `.5` = `103.173.155.50` (VPN VN) |
| EVID-20261023-24 | runtime_checked | log app: `transport=http1081 tunnelUp=true`, `bw: probe … -> 1731kbps` |
| EVID-20261023-25 | runtime_checked | `http_proxy` vẫn `.5` sau khi pin prefs |

## Validation Performed

```text
curl -x http://192.168.100.5:18081 ...  -> code=200, 175 KB/s
curl -x http://192.168.100.5:18081 https://api.ipify.org -> 103.173.155.50
adb shell settings get global http_proxy -> 192.168.100.5:18081
adb shell run-as … cat shared_prefs/vpnflow_hysteria.xml -> proxy_gateway=.5, proxy_mode=gateway
adb shell pm list packages -d | grep tvmanager -> com.xiaomi.mitv.tvmanager
```

## Guardrails (đừng làm khi đang xem)

1. **Không cài lại/update app** trong lúc xem — `installPackageLI` sẽ force-stop app, tunnel tắt
   (xem `HANDOFF_WINDOWS_TUNNEL_KEEPALIVE_2026-10-23.md`).
2. **Không bật lại** `com.xiaomi.mitv.tvmanager` hay `com.tvflow.watchdog` (dễ giành proxy).
3. **Không đổi proxy tay** — đang khoá `proxy_mode=gateway` + một gateway `.5` duy nhất.
4. Không đặt IP tĩnh lung tung trên mạng tòa nhà (dễ trùng DHCP).

## Risks

- `.5` là IP **DHCP của tòa nhà** (như Mac đã đổi `.3 → .6`) → có thể đổi. Đang chạy `gateway` mode
  nên nếu `.5` chết app trả `:0` (đi thẳng) — TV vẫn còn internet; không tự nhảy sang nguồn khác.
- App bị kill ở nền → tunnel tắt (đã có handoff Windows sửa).

## Sự cố 23/10 — proxy nhảy qua lại làm FPT Play mất kết nối

Triệu chứng: thỉnh thoảng "proxy chết và khởi động lại" ⇒ FPT Play rớt kết nối.

Nguyên nhân: `proxy_mode = auto` khiến app đo throughput và **đổi `http_proxy` giữa nhiều nguồn**
(`.5` nhanh 344 KB/s ↔ Mac `.6` chậm 18 KB/s / có lúc 0 ↔ tunnel `127.0.0.1:1081`). Mỗi lần đổi,
kết nối đang chạy của FPT Play bị cắt (đổi proxy = đổi đường của phiên).

Bằng chứng:

```text
http_proxy: 192.168.100.5:18081 -> 192.168.100.6:18081 (Mac) -> lại về .5
.5:18081  = 344 KB/s   (egress 103.173.155.50)
.6:18081  = 18 KB/s, có lúc 0 (timeout)
```

Đã sửa: `proxy_mode = gateway` + `proxy_gateway = 192.168.100.5:18081` (một nguồn duy nhất) và
`settings put global http_proxy 192.168.100.5:18081`. Theo dõi 60 s: proxy **giữ nguyên `.5`**.

## Next Recommended Step

Giữ `proxy_mode = gateway` (đã chốt). Nếu sau này muốn app tự nhảy nhiều nguồn, đổi lại `auto` —
nhưng chấp nhận rủi ro rớt kết nối khi đổi tuyến (đã tái hiện 23/10).

## Liên quan

- `docs/handoff/HANDOFF_WINDOWS_TUNNEL_KEEPALIVE_2026-10-23.md`
- `docs/handoff/HANDOFF_WINDOWS_AUTO_GATEWAY_2026-10-23.md`
