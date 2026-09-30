# Agent Handoff — dựng node-2 mới (103.6.235.39) thành exit node + relay riêng `/relay/vn3hy`

- **Agent:** main (Senior Architect — tiếp nhận bàn giao từ `HANDOFF_TEAMLEADER_NODE2_BUILD_2026-09-30.md`)
- **Task ID:** TASK-20260930-VN3
- **Date:** 2026-09-30
- **Status:** needs_review — Phase 1–3 xong và đã tự nghiệm thu; **Phase 4 (test từ Trung Quốc trên máy thật) chưa làm được vì cần điện thoại Android của chủ dự án**

> Luật đã giữ: **CHỈ THÊM – KHÔNG PHÁ**. Không sửa `Caddyfile` cũ (chỉ chèn thêm), không đụng unit đang chạy,
> không tắt/không đổi `active`/`priority` của node cũ. Sau **mỗi** thay đổi đều `curl` lại toàn bộ relay.

## Summary

Dựng thành công exit node thứ ba `vietnam-3` = VPS mới `103.6.235.39` (Ubuntu 24.04.5, AS152992):

1. **Trên node-2 mới:** cài `hysteria` v2.12.2 (copy binary từ `relay-server`, **sha256 khớp từng byte**),
   cấu hình `listen :8443` với credential **trùng fleet** (pipe trực tiếp từ config `relay-server`, không qua đĩa/argv),
   cert self-signed mới `CN=meetflowai.site`, chạy bằng **systemd** (`hysteria@8443`, `enabled` — sống qua reboot).
2. **Trên `relay-server`:** thêm unit `relay-cf-vn3hy` (7789 → UDP `103.6.235.39:8443`) và chèn
   `handle /relay/vn3hy*` vào **CẢ HAI khối site** của Caddy (`api.meetflowai.site` **và**
   `meetflowai.site, t1.meetflowai.site, home.meetflowai.site`).
3. **Control plane:** đăng ký `exit_nodes` id `vietnam-3`, `active=1`, `priority=150`,
   `hy_relay_url=wss://api.meetflowai.site/relay/vn3hy`.

Kết quả tự nghiệm thu: **10/10 cửa relay = HTTP 426** (5 path × 2 hostname, gồm 4 path cũ — không hồi quy),
`caddy` active, `flowvpn-cp` active, tunnel khách trên máy Mac **vẫn Connected** xuyên suốt.

## Files Changed

Repo: **không đổi file code nào** — chỉ thêm file báo cáo này.

| Path | Change Summary |
|---|---|
| `docs/handoff/HANDOFF_VN3_NODE_DEPLOY_2026-09-30.md` | Báo cáo này (mới) |

Thay đổi **trên production** (không nằm trong git — ghi lại để truy vết/khôi phục):

| Máy | Đường dẫn / đối tượng | Thay đổi |
|---|---|---|
| node-2 mới `103.6.235.39` | `/usr/local/bin/hysteria` | Thêm mới, v2.12.2, sha256 `6493dfff…d55f94` (khớp `relay-server`) |
| node-2 mới | `/etc/hysteria-server-8443.yaml` | Thêm mới, mode `600`, copy nguyên từ `relay-server` (creds trùng fleet + `ignoreClientBandwidth: true`) |
| node-2 mới | `/etc/hysteria-cert.pem`, `/etc/hysteria-key.pem` | Sinh mới self-signed `CN=meetflowai.site` (key `600`). **Không** nhân bản private key của node khác |
| node-2 mới | `/etc/systemd/system/hysteria@.service` | Thêm mới (từ `tools/node-setup/systemd/hysteria@.service`) → `hysteria@8443` enabled+active |
| node-2 mới | process `python3 -c` (pid 1670, `0.0.0.0:443`) | **Đã kill** — listener tạm sót lại đúng như handoff §6.2 |
| relay-server `165.101.114.162` | `/etc/systemd/system/relay-cf-vn3hy.service` | Thêm mới: `WS_LISTEN_PORT=7789`, `WS_UDP_HOST=103.6.235.39`, `WS_UDP_PORT=8443`, `PONG_TIMEOUT_MS=120000` |
| relay-server | `/etc/caddy/Caddyfile` | Chèn 2 khối `handle /relay/vn3hy*` → `127.0.0.1:7789` (1 khối mỗi site block) |
| relay-server | `/etc/caddy/Caddyfile.bak-vn3hy-20260930-200936` | Backup trước khi sửa |
| relay-server | `/root/vn3hy-rollback.sh`, `/root/vn3hy-rollback.log` | Lưới an toàn tách-phiên + log chứng minh đã chạy |
| relay-server | `exit_nodes` (`/root/flowvpn-cp/data/nodes.db`) | Thêm hàng `vietnam-3`; `hy_relay_url` qua `set-node-relay.mjs` |

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| **`ignoreClientBandwidth: true`** cho node-2 mới (ngược với `docs/AGENT_NEW_NODE_GUIDE.md` §6.4 + `provision-node.sh`) | **Production thắng docs**: cả `node-1` (`/etc/hysteria/server.yaml`) lẫn `relay-server` (`/etc/hysteria-server.yaml`) đều đặt `true` kèm ghi chú 18/09/2026 *"app cũ khai 2/20 Mbps → bị tự bóp"*. Để node mới khác hành vi CC với phần còn lại của fleet là rủi ro vô cớ. **Docs đang lạc hậu — cần sửa** | `/etc/hysteria-server-8443.yaml` |
| id `vietnam-3` (không phải "node-2") | DB đã có `node-1` và `vietnam-2` (165.101.114.162). Gọi node mới là "node-2" sẽ trùng nghĩa với `vietnam-2` đang chạy. Path relay `vn3hy` khớp tên này | `nodes.db` |
| `priority = 150` | Handoff nói "priority thấp hơn node-1". Ở hệ này **số nhỏ = ưu tiên cao** (`vietnam-2`=50 → `node-1`=100). Chọn 150 ⇒ **không** giành khách của 2 node đang chạy, vẫn là fallback thật. Chủ dự án đổi được bằng 1 PATCH, không phá gì | `nodes.db` |
| Chạy **systemd** (`hysteria@8443`) thay vì `setsid nohup` | Đúng `AGENT_NEW_NODE_GUIDE.md` §6.7 — node cũ mất khi reboot; node mới phải `enabled` | `/etc/systemd/system/hysteria@.service` |
| Chỉ mở **8443/udp** (không 28443/54443, không hyrelay) | Đúng tối thiểu mà đường CF relay cần (`WS_UDP_PORT=8443`). Thêm cổng/relay TCP là việc khác, không cần cho `vn3hy` | node-2 mới |
| Sinh cert **mới** thay vì copy cert+key của relay-server | Client Go đặt `InsecureSkipVerify: true` (`tools/hysteria-android/mobile.go:161-162`) ⇒ nội dung cert không quan trọng; sinh mới tránh nhân bản private key | node-2 mới |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20260930-01 | runtime_checked | `hysteria@8443` = `active` **và** `enabled`; `ss -ulnp` thấy `*:8443` do `hysteria` |
| EVID-20260930-02 | e2e_checked (VN) | hysteria client từ `relay-server` → `103.6.235.39:8443`: `connected to server {"udpEnabled": true}`; egress IP = **`103.6.235.39`**; speed `738.052 B/s` (≈5,9 Mbps, đo 5 MB) |
| EVID-20260930-03 | runtime_checked | `caddy validate` = **Valid configuration** trước reload; `systemctl reload caddy` → `caddy=active` |
| EVID-20260930-04 | e2e_checked | **10/10** cửa relay = `426`: `api.` và `t1.` × `vn1hy vn2hy vn1wg vn2wg vn3hy` |
| EVID-20260930-05 | runtime_checked | `flowvpn-cp` active; `GET /v1/health` = `{"status":"ok"}` |
| EVID-20260930-06 | runtime_checked | `GET /v1/nodes` (công khai) trả về `vietnam-3` với `hy_relay_url=wss://api.meetflowai.site/relay/vn3hy` |
| EVID-20260930-07 | runtime_checked | Không hồi quy khách: `pgrep -f com.privatevpn.mac.packet-tunnel` = VPN_ON suốt quá trình |
| EVID-20260930-08 | runtime_checked | Lưới an toàn tách-phiên **đã chạy thật** lúc `20:11:11`: `check: vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426` (không cần khôi phục) |

## Validation Performed

```bash
# Node-2 moi: binary + cert + service
ssh -i ~/.ssh/fpt_vpn_node root@165.101.114.162 'cat /usr/local/bin/hysteria' \
  | ssh -i ~/.ssh/fpt_vpn_node root@103.6.235.39 'cat > /usr/local/bin/hysteria && chmod 0755 /usr/local/bin/hysteria && sha256sum /usr/local/bin/hysteria'
ssh -i ~/.ssh/fpt_vpn_node root@103.6.235.39 'systemctl is-active hysteria@8443; systemctl is-enabled hysteria@8443; ss -ulnp | grep :8443'

# Duong UDP that: client hysteria tu relay-server -> node-2
curl -s --max-time 20 --socks5-hostname 127.0.0.1:1081 https://api64.ipify.org

# Caddy: validate TRUOC khi reload
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

# Sau moi thay doi: toan bo cua relay phai = 426
for h in api t1; do for r in vn1hy vn2hy vn1wg vn2wg vn3hy; do
  curl -s -o /dev/null -w "$h/$r=%{http_code} " https://$h.meetflowai.site/relay/$r; done; done
```

Result:

```text
sha256(/usr/local/bin/hysteria) = 6493dfffd55b5883f64c76c63880ecc32988f0c568c9ca9014907877b4d55f94  (== relay-server)
Version: v2.12.2
hysteria@8443: active / enabled ;  UNCONN *:8443 users:(("hysteria",pid=3125))
client: connected to server {"addr":"103.6.235.39:8443","udpEnabled":true} ; egress IP = 103.6.235.39
speed: down=738052 B/s time=6.774585s
Valid configuration
caddy=active
api: vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426 vn3hy=426
t1:  vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426 vn3hy=426
{"status":"ok"}
```

## Validation Not Performed

| Check | Reason |
|---|---|
| **Test từ Trung Quốc trên máy thật** (điều kiện "xong" số 1 của `AGENT_NEW_NODE_GUIDE.md` §7) | Cần **điện thoại Android của chủ dự án** (SIM TQ) + USB debugging đang bật. Agent không có vantage TQ |
| **Trình duyệt thật** kiểm `gemini.google.com` / `claude.ai` qua node mới | Phải làm trên máy khách; `curl` không giải được JS challenge (bài học §3.1 của handoff) |
| E2E app qua **framing riêng của relay** (`wsrelay.js` 2-byte length prefix) | Chỉ app Android/iOS nói được framing đó; không có probe CLI trong repo (guide §3 Bước 6 nói probe `hyconnect` **không được commit**) |
| Đo băng thông dài / nhiều phiên qua `vn3hy` | Cần máy khách thật; số `738 KB/s` ở trên chỉ là smoke test VN→VN 5 MB |

## Risks

- **⚠️ Dải IP bị docs xếp vào loại "tránh cho hysteria UDP":** `AGENT_NEW_NODE_GUIDE.md` §2.2 nói tránh
  **AS152992 (Online Data)** và dải `103.6.234.0/23`; node-2 mới `103.6.235.39` **nằm đúng trong /23 đó**.
  ⇒ Kỳ vọng thực tế: **UDP trực tiếp từ TQ nhiều khả năng bị chặn** (giống node cũ `103.6.234.233`).
  Đường sống là **CF WebSocket relay** (`client → CF TCP 443 → relay-server → UDP node-2:8443`), vì chặng
  UDP bị chặn (TQ→node-2) không còn nằm trên đường đi. Đây là lý do thiết kế `vn3hy` vẫn đúng, nhưng
  **"UP via UDP" khó đạt** — chấp nhận "UP via TCP relay" theo §7 DoD.
- **Docs lệch production** về `ignoreClientBandwidth` (xem Decisions). Ai đọc guide rồi dựng node kế tiếp
  theo guide sẽ tạo node hành xử khác fleet.
- Tồn đọng **không phải của việc này**, phát hiện lúc recon: `relay-server` còn 1 tiến trình
  `hysteria client -c /tmp/hy-client.yaml` sót lại từ phiên trước (chưa dọn). Không ảnh hưởng đường khách.
- `Caddyfile` có cảnh báo `not formatted` (dòng 8) — **có trước khi tôi sửa**; tôi **không** chạy `caddy fmt`
  để giữ diff tối thiểu.
- Ổ `/Volumes/BIWIN` là exFAT ngoài, từng bị ngắt giữa phiên ⇒ báo cáo này cần commit sớm.

## Open Questions

1. **`priority = 150`** có đúng ý chủ dự án không? Nếu muốn node mới **được ưu tiên dùng** (giảm tải node-1)
   thì phải hạ số xuống `< 50`, nhưng việc đó **đổi dòng khách đang chạy** ⇒ cần chủ dự án chốt trước.
2. **Test TQ:** khi nào bật lại USB debugging trên điện thoại Android để chạy nghiệm thu?
3. Có sửa `docs/AGENT_NEW_NODE_GUIDE.md` §6.4 + `tools/node-setup/provision-node.sh` cho khớp production
   (`ignoreClientBandwidth: true`) không?
4. **Commit:** handoff trước (§4.9) liệt kê một loạt file phiên trước **chưa commit**
   (`tools/hysteria-android/mobile.go`, `iOS/.../HysteriaDefaults.swift`, `scripts/ios-pure-logic-tests/main.swift`,
   `project.yml`, `scripts/archive-appstore.sh`, `.privatevpn/status/release-lock.json`, `release/releases.jsonl`,
   và `scripts/migrate/**`) — **không** quét `scripts/security/mac-selfdefense/**` (của phiên khác).
   Có commit ngay không?

## Next Recommended Step

**Phase 4 — nghiệm thu từ Trung Quốc** (chủ dự án, ~5 phút):

```bash
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
adb devices          # trống = USB debugging đang tắt -> bật lại trên máy
adb shell "svc wifi disable; svc data enable"
adb logcat -c && adb logcat -v time | grep --line-buffered VPNFLOW_DEBUG
# Trong app: chọn node "Vietnam 3" -> Connect
#   cần thấy:  hysteria: UP via TCP relay 8443     (kỳ vọng, xem Risks)
#   hoặc tốt hơn: hysteria: UP via UDP 103.6.235.39:8443
# Sau đó mở TRÌNH DUYỆT THẬT: gemini.google.com + claude.ai
```

Tiêu chí đạt (`AGENT_NEW_NODE_GUIDE.md` §7): lên được từ TQ (TCP relay là đủ) · node hiện trong app ·
Disconnect→Connect lại 3 lần đều lên. Nếu **không lên được đường nào** ⇒ dải IP không đạt, phải xin đổi IP.
