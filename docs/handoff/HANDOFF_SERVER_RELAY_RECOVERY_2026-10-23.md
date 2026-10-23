# Agent Handoff

- **Agent:** harness Mac (worker) → giao **agent server / người giữ relay**
- **Task ID:** HANDOFF-SERVER-RELAY-RECOVERY-2026-10-23
- **Date:** 2026-10-23
- **Status:** needs_review — **relay KHÔNG chết**; lỗi thật là WS từ Mac bị reset/timeout (gateway chập chờn)

## Summary (đã sửa sau khi kiểm server)

Lúc đầu tưởng `vn1hy`/`vn3hy` chết vì endpoint trả `000` đo từ Mac (timeout 8 s). **Kiểm lại thì sai**:
- Từ chính node-2: `curl https://api.meetflowai.site/relay/{vn1hy,vn2hy,vn3hy}` = **426** cả 3.
- Từ Mac, tăng timeout 25 s: **426 cả 3** (vn1hy 2,4 s; vn2hy 1,4 s; vn3hy 1,5 s).
- `systemctl is-active relay-cf-vn1hy/vn2hy/vn3hy` = **active running**; `caddy` = active; `flowvpn-health-watch.timer` = active.

⇒ Các relay **sống bình thường**. Vấn đề thật: **`flowvpnrelay` trên Mac flap** — link WS tới Cloudflare
(`wss://api.meetflowai.site/relay/vn2hy`) bị `connection reset by peer` / `operation timed out`, relay
`terminated — thoát` rồi launchd dựng lại mỗi ~10–15 s. Trong mỗi khoảng hở, SOCKS `127.0.0.1:1081`
chết ⇒ gateway Mac mất upstream ⇒ TV mất mạng tạm thời. Hiện tại relay đã READY lại, gateway .6 chạy
(200, ~56 KB/s), SOCKS 1081 chạy (200, ~45 KB/s).

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20261023-51 | runtime_checked | Từ node-2: cả 3 relay = **426** |
| EVID-20261023-52 | runtime_checked | Từ Mac (timeout 25 s): cả 3 relay = **426** (1,4–2,4 s) — 000 trước đó là do timeout 8 s quá ngắn |
| EVID-20261023-53 | runtime_checked | units `relay-cf-vn1hy/vn2hy/vn3hy` active running; caddy active; health-watch.timer active |
| EVID-20261023-54 | runtime_checked | `relay.log`: `link 0: chết (... 172.67.175.138:443: connection reset by peer / operation timed out)` → `terminated — thoát` lặp ~10–15 s |
| EVID-20261023-55 | runtime_checked | Ping Cloudflare từ Mac: **~246 ms** (độ trễ cao) — Wi-Fi tòa nhà dùng chung |
| EVID-20261023-56 | runtime_checked | Sau khi relay READY: SOCKS 1081 = 200 (~45 KB/s), gateway .6 = 200 (~56 KB/s) |

## Validation Performed

```text
# từ node-2
curl -s -o /dev/null -w "%{http_code}" https://api.meetflowai.site/relay/vn1hy -> 426
systemctl is-active relay-cf-vn1hy relay-cf-vn2hy relay-cf-vn3hy -> active active active
# từ Mac (timeout 20-25s)
curl ... vn1hy -> 426 (2.45s); vn2hy -> 426 (1.38s); vn3hy -> 426 (1.54s)
ping 104.21.83.112 -> avg 246 ms
curl -x socks5h://127.0.0.1:1081 ... -> 200
curl -x http://192.168.100.6:18081 ... -> 200
```

## Validation Not Performed

| Check | Reason |
|---|---|
| WS vì sao bị reset (Cloudflare/ISP/Wi-Fi) | Cần bắt gói/so sánh mạng khác |
| Độ ổn định ≥10 phút của relay sau sửa | Chưa có thay đổi nào |

## Risks

- TV mất exit VN trong các khoảng flap (FPT Play/TV360 gián đoạn) — dù proxy vẫn trỏ `.6`.
- Mac đang ở mạng tòa nhà (Wi-Fi dùng chung, latency ~250 ms) — WS dài dễ bị reset.

## Open Questions

- WS `vn2hy` bị reset do Cloudflare (idle/keepalive), do AP/ISP tòa nhà, hay do tải relay (`relay.log` thấy nhiều client khác từ `183.61.117.231`)?
- Có nên thêm **WS keepalive/ping** phía relay, hoặc tăng `links`/`ThrottleInterval` phía Mac?

## Next Recommended Step

- **Server/relay:** kiểm WS keepalive + log `relay-cf-vn2hy` (client-close 1001/1000); nếu Cloudflare đóng WS do thiếu ping thì thêm ping. Relay units đang OK, không cần restart.
- **Mac:** mạng tới Cloudflare trễ 250 ms và WS bị reset — nên dùng **mạng dây/AP riêng** (như mạng `10.193.44.x` trước đây ổn định hơn), hoặc tăng keepalive/giảm tải trên relay.
- **TV `.104`:** ADB đang tắt (reboot) — bật lại ADB để em kiểm proxy/gateway.

## Liên quan

- `docs/SERVER_RECOVERY_RUNBOOK.md` — luật an toàn production.
- `docs/handoff/TV_PROXY_LOCKED_2026-10-23.md` — cấu hình proxy TV.
