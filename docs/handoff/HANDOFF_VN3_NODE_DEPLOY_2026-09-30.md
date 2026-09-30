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

---

## Cập nhật sau khi chủ dự án chốt (30/09/2026, cùng phiên)

- **`priority = 150` được GIỮ NGUYÊN** — chủ dự án xác nhận: không đụng dòng khách của `vietnam-2`/`node-1`.
- **Phase 4 (test từ Trung Quốc) TẠM HOÃN** theo yêu cầu chủ dự án (*"android chưa cần test đâu"*).
  `vietnam-3` đã ở trạng thái sẵn sàng, nhưng **CHƯA được coi là "xong"** theo `AGENT_NEW_NODE_GUIDE.md` §7
  vì chưa có phép đo từ vantage Trung Quốc.
- **Đã sửa docs lệch production** (Open Questions #3): `AGENT_NEW_NODE_GUIDE.md` §1/§6.4, `EXIT_NODE_RUNBOOK.md`
  và `provision-node.sh` nay đều khẳng định `ignoreClientBandwidth: true` là **BẮT BUỘC** cho mọi node.
- **Đã commit** (Open Questions #4), chừa `scripts/security/mac-selfdefense/**` của phiên khác:
  `c50c9da` (fix iOS build 59 + ghim kênh 1.4.6/57) · `52f2f54` (bộ công cụ migration) · `e9c1d2e` (docs node + báo cáo này).

---

## Cập nhật vòng goal 1 (30/09/2026 ~21:50) — BẰNG CHỨNG MỚI, mạnh hơn dự kiến

### 1. Node mới ĐÃ chở khách thật từ Trung Quốc (không phải test tổng hợp)

`journalctl -u relay-cf-vn3hy` (giờ UTC; +7 = giờ VN):

| Phiên | Từ IP | Thời lượng | in (khách→node) | out (node→khách) | Đóng |
|---|---|---|---|---|---|
| #1 | `63.140.14.154` | 240,9 s | 3.205.381 B | 4.573.341 B | client-close 1000 |
| #2 | `63.140.14.154` | 31,7 s | 1.102.524 B | 1.666.490 B | 1000 |
| #3 | `63.140.14.154` | 38,5 s | 470.008 B | 1.965.030 B | 1000 |
| **#4** | **`120.234.32.53` (TQ)** | 78,3 s | 1.262.416 B | **43.585.848 B** | 1001 |
| #5 | `120.234.32.53` | 26,1 s | 653 B | 998 B | 1001 |
| #6 | `120.234.32.53` | đang mở lúc trích log | — | — | — |

```text
STATS active=1 total=6 in=29021f/6160744B out=43667f/52016930B drop=0 udpErr=0 lastError=-
```

⇒ Đường CF relay → **node-2 mới** đã chở **43,6 MB** về một khách ở Trung Quốc trong **một phiên 78 s**,
**`drop=0`, `udpErr=0`**. Phiên **#1 → #2 → #3 liên tiếp từ cùng một IP** là bằng chứng **ngắt → nối lại hoạt động**
(khớp tiêu chí §7 DoD "chịu được disconnect/reconnect").

### 2. Chặng `relay-cf-vn3hy` → node-2 (chứng minh bằng bắt gói, không chỉ "426")

Trước đó `426` chỉ chứng minh relay **đang nghe**. Nay đã chứng minh nó **thật sự forward sang node-2**:
bơm 1 WS frame nhị phân 25 B vào `127.0.0.1:7789` → tcpdump bắt đúng gói ra:

```text
21:44:52.522109 eth0  Out IP 165.101.114.162.20238 > 103.6.235.39.8443: UDP, length 36   (3 gói)
relay log:  #7 MỞ từ ::ffff:127.0.0.1 local_udp=28104 -> 103.6.235.39:8443
            #7 ĐÓNG sau 1.5s | in=1f/25B out=0f/0B | lý do: client-close 1006
```
`in=1f/25B` khớp **đúng** frame đã bơm ⇒ chặng relay → node-2 hoạt động.

### 3. ĐÍNH CHÍNH một nhận định SAI của chính tôi (để không ai ghi sai vào docs)

Lúc recon tôi từng nói *"docs lệch: `AGENT_NEW_NODE_GUIDE.md` §6.2 nói framing 2 byte nhưng `wsrelay.js` không dùng"*.
**SAI** — đó là **HAI relay khác nhau**, không phải docs lệch:

| Relay | Đường | Framing |
|---|---|---|
| `tools/node-setup/relay.go` (`hyrelay`) | TCP trực tiếp (khách → node) | **2 byte big-endian** — khớp client `mobile.go:65-96` ⇒ **guide §6.2 ĐÚNG** |
| `/root/wsrelay.js` | WebSocket qua Cloudflare (khách → CF → relay-server → node) | **không** thêm framing: 1 binary WS frame = 1 datagram UDP |

⇒ **Không sửa gì ở §6.2.** (Mục "docs lệch" duy nhất còn hiệu lực là `ignoreClientBandwidth` — đã sửa.)

### 4. Ý nghĩa cho nghiệm thu

- **Đã có**: bằng chứng khách thật ở TQ chở 43,6 MB qua `vn3hy`, không rơi gói, kèm hành vi nối lại.
- **CHƯA có**: phép nghiệm thu **có kiểm soát của chủ dự án** — chọn node trong app, ngắt/nối 3 lần,
  và **trình duyệt thật** kiểm `gemini.google.com` / `claude.ai` (bài học handoff §3.1: `curl` không thay được).
  Chủ dự án đã **chủ động hoãn** phần này ("android chưa cần test đâu").
- Cảnh báo diễn giải: `63.140.14.154` và `120.234.32.53` **không phải** máy Mac này (egress Mac lúc kiểm =
  `165.101.114.162` = `vietnam-2`) ⇒ đây là **thiết bị khác**, nhưng tôi **không** khẳng định được đó là ai
  hay họ đã mở `gemini`/`claude` hay chưa.

---

## Cập nhật vòng goal 2 (30/09/2026 ~21:55) — ĐÓNG LỖ HỔNG GIÁM SÁT do chính việc thêm relay gây ra

### Phát hiện
`flowvpn-health-watch` (watchdog đường khách, timer 45 s + cron dự phòng `*/2`) và hai công cụ vận hành
`flowvpn-safe-status` / `flowvpn-safe-stop` đều **hardcode 4 relay** (`vn1hy/vn2hy/vn1wg/vn2wg`).
⇒ `relay-cf-vn3hy` — đường **đang chở khách thật** (xem mục trên) — **không được giám sát**: watchdog sẽ
**không** tự `start` nếu nó chết, và `flowvpn-safe-stop relay-cf-vn3hy` sẽ **cho dừng mà không cảnh báo**
(vì unit không nằm trong `ALL_RELAYS` ⇒ `IS_RELAY=0` ⇒ không in "rủi ro: relay").

### Đã sửa (trên relay-server; backup `/root/flowvpn-tools-backup-20260930-215023/`)
| File | Sửa |
|---|---|
| `/usr/local/bin/flowvpn-health-watch` | thêm `"relay-cf-vn3hy\|Hysteria\|vietnam-3\|/relay/vn3hy\|7789"` vào `CATALOG` |
| `/usr/local/bin/flowvpn-safe-status` | thêm dòng `relay-cf-vn3hy`; "cả bốn"→"cả năm"; 4→5 mã relay |
| `/usr/local/bin/flowvpn-safe-stop` | thêm `NODE_IP_vn3=103.6.235.39`, `NODE3_RELAYS`, `ALL_RELAYS`, nhánh `vn3` cho `detect_control_node` + `PROTECTED` |

### Bằng chứng
```text
bash -n cả 3 file   → syntax OK
flowvpn-safe-status → vn3hy = 426 ✔ · "TÓM TẮT: vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426 vn3hy=426"
                    → "KẾT LUẬN: ✔ TẤT CẢ ĐẠT (mọi unit active, cả năm relay = 426)"
watchdog log 21:51:36 → "RELAY: vn1hy=426 vn2hy=426 vn1wg=426 vn2wg=426 vn3hy=426"
                      → "OK: mọi dịch vụ đường khách active · … (không gửi Telegram — không có gì để báo)"
thử âm 1: FLOWVPN_CONTROL_NODE=vn3 flowvpn-safe-stop relay-cf-vn3hy 30 → exit 3 (TỪ CHỐI; "relay được bảo vệ: relay-cf-vn3hy")
thử âm 2: FLOWVPN_CONTROL_NODE=zzz flowvpn-safe-stop relay-cf-vn3hy 30 → exit 3 (TỪ CHỐI; coi MỌI relay là đường điều khiển)
sau 2 thử âm → relay-cf-vn3hy VẪN active, vẫn listen :7789 (không dừng gì)
```
Hai phép thử âm đi qua **nhánh TỪ CHỐI** trước khi đặt lệnh dừng ⇒ **không** dừng dịch vụ nào.

### Docs repo đã khớp theo (cùng loại việc chủ dự án đã duyệt: sửa docs cho khớp production)
`AGENTS.md` §7e.3 (vòng `for` + "cả năm") và §7e.5 (**9 unit + 5 relay**); `docs/SERVER_RECOVERY_RUNBOOK.md`
(bảng §2 thêm dòng `relay-cf-vn3hy`, vòng lệnh, mô tả `flowvpn-safe-status`, bảng rủi ro, checklist).
Khối nhật ký lịch sử 26/09 **giữ nguyên**, chỉ thêm ghi chú "(số của 26/09/2026; nay là 9/9 unit + 5 relay)".

---

## Trạng thái cuối phiên (vòng goal 3, 30/09/2026 ~22:00) — TREO chờ chủ dự án

**Mọi phần dựng được: XONG và đã kiểm chứng lại tươi.** 10/10 cửa relay = `426`
(`api.` + `t1.` × `vn1hy vn2hy vn1wg vn2wg vn3hy`), `hysteria@8443` trên `103.6.235.39` = `active/enabled`,
`relay-cf-vn3hy` = `active`, watchdog phủ `vn3hy` (`OK: mọi dịch vụ đường khách active · … vn3hy=426`).

**Bằng chứng Trung Quốc TIẾP TỤC TĂNG** (không phải test tổng hợp) — cùng một relay, sau vài chục phút:

```text
(vòng 1) total=6  in=6.160.744 B   out=52.016.930 B  drop=0 udpErr=0
(vòng 3) total=9  in=7.727.717 B   out=72.205.129 B  drop=0 udpErr=0 lastError=-
```

⇒ Thêm 3 phiên và ~20 MB nữa về khách, vẫn **0 rơi gói / 0 lỗi UDP**.

**Điều kiện TREO (giữ nguyên 3 vòng liên tiếp 1→3):** mục *"nghiệm thu từ Trung Quốc trên máy thật"* —
cần **thiết bị Android của chủ dự án** (USB debugging bật) để chọn node trong app, ngắt/nối 3 lần và mở
**trình duyệt thật** kiểm `gemini.google.com` / `claude.ai`. Chủ dự án đã **chủ động hoãn** việc này
(*"android chưa cần test đâu"*). Agent **không** có vantage TQ và **không** được tự chạy thay.

**Việc khác của chủ dự án (đã xác nhận 30/09/2026):** DNS `meetflowai.io.vn` **chưa trỏ ở CẢ hai nơi**
(nhà đăng ký `.vn` **và** Cloudflare). Phía Caddy đã sẵn sàng (xem mục "domain mới"); việc còn lại thuần DNS.

**Mở treo bằng một trong hai cách:**
1. Chủ dự án chạy phép nghiệm thu có kiểm soát (5 phút, hướng dẫn ở mục "Next Recommended Step"), hoặc
2. Chủ dự án xác nhận dùng **bằng chứng đời thực ở trên** (9 phiên, 72 MB, `drop=0`) thay cho phép đo có kiểm soát.

---

## Bảo mật node-2 mới (30/09/2026, chủ dự án yêu cầu) — ĐÃ SIẾT + KIỂM CHỨNG

### Audit: node-2 mới thiếu đúng thứ đã gây sự cố 26/09

| Hạng mục | Trước | Sau | Chuẩn `relay-server` |
|---|---|---|---|
| `PasswordAuthentication` | **`yes`** 🔴 | `no` | `no` |
| `PermitRootLogin` | **`yes`** 🔴 | `prohibit-password` | `without-password` |
| Mật khẩu `root` | **có** (`passwd -S` = `P`) 🔴 | **khoá** (`L`) | — |
| `MaxAuthTries` | `6` | `3` | `3` |
| `MaxStartups` | chưa đặt (`10:30:100`) | `10:30:60` | `10:30:60` |
| `flowvpn-autoban` (defender dự án) | **không có** 🟠 | timer `active/enabled` | có |
| Gói security chờ vá | **36** (48 tổng) | **3** (kernel) | — |
| `fail2ban` | có, jail `sshd` (6 IP đang ban) | giữ nguyên | — |
| `ufw` | active, deny incoming | giữ nguyên | active |

**Vì sao `PasswordAuthentication` khó sửa:** Ubuntu 24.04 có `Include /etc/ssh/sshd_config.d/*.conf` ở **dòng 12**, và sshd lấy **giá trị ĐẦU TIÊN**. Hai file của nhà cung cấp (`00-dataonline.conf`, `50-cloud-init.conf`) đặt `yes` và **đè** drop-in mới. Cách xử: tạo `000-flowvpn-hardening.conf` **+** sửa cả 2 file nhà cung cấp **+** sửa `sshd_config` dòng 42 ⇒ mọi file **đồng thuận**, đúng dưới mọi thứ tự đọc.

### Bằng chứng kiểm chứng

```text
sshd -T sau khi reload:
  passwordauthentication no · permitrootlogin without-password · maxauthtries 3 · maxstartups 10:30:60

Phiên SSH MỚI bằng khoá (không chỉ phiên đang mở):  NEW_SESSION_OK / root / node-2
Mật khẩu bị TỪ CHỐI:  root@103.6.235.39: Permission denied (publickey).
Mật khẩu root:        passwd -S root → root L  (locked)
autoban:              timer=active/enabled · chạy thử exit=0
Vá gói:               48 → 4 gói (36 → 3 security) · needrestart chế độ "chỉ liệt kê" ⇒ KHÔNG dịch vụ nào bị restart
Không hồi quy khách:  hysteria@8443 active · hyrelay@8443 active · wg0 listen 443 · 6/6 relay = 426 · watchdog OK
Backup:               /root/ssh-hardening-backup-20260930-225717/ (sshd_config + sshd_config.d)
```

### Còn lại (đề xuất, chưa làm)

1. **3 gói kernel** (`linux-image/headers-generic 6.8.0-142`, held vì cần `dist-upgrade`) ⇒ **cần REBOOT**.
   Reboot sẽ **rớt mọi khách** đang đi `vn3hy`/`vn3wg` ⇒ **chờ chủ dự án chốt thời điểm**.
2. **Không có giám sát sống-còn cho chính node-2**: `flowvpn-health-watch` chỉ kiểm **tiến trình relay**
   trên relay-server, **không** kiểm `hysteria`/`wg0` bên trong node-2.⇒ hysteria chết thì relay vẫn `426`
   và khách đi `vn3hy`/`vn3wg` chết im lặng. Đề xuất: thêm probe UDP từ relay-server → `103.6.235.39:8443`
   và `:443`, báo Telegram nếu chết. **(Chưa làm vì phiên Team Leader khác đang sửa cùng file watchdog.)**
3. `fail2ban` đang dùng mặc định (ban 10 phút/5 lần) — yếu hơn autoban của dự án (20 lần/giờ → 24h, tái phạm → vĩnh viễn).

### Reboot cập nhật kernel node-2 mới (30/09/2026 ~23:05) — XONG, rớt ~100 s

Chủ dự án duyệt reboot (ngân sách rớt mạng tối đa 15 phút).

**Sửa trước khi reboot — một rủi ro thật đã bắt được:** `/etc/sysctl.d/99-dataonline-hardening.conf`
đặt `net.ipv4.ip_forward = 0`, còn `/etc/sysctl.d/99-wireguard-forward.conf` đặt `= 1`. Hiện `=1` thắng
(đọc sau), nhưng để **deterministic** đã sửa file hardening thành `= 1` ⇒ **mọi file đồng thuận**.
Nếu không sửa và thứ tự đọc đổi, **khách WireGuard mất mạng hoàn toàn sau reboot** (không forward được).

**Kiểm tra sống-lại TRƯỚC khi reboot** (đều `enabled`): `hysteria@8443`, `hyrelay@8443`, `wg-quick@wg0`,
`ufw`, `fail2ban`, `flowvpn-autoban.timer`.

```text
Sự cố giữa đường: phiên SSH đứt khi dist-upgrade nâng openssh-server (postinst restart sshd).
  ⇒ apt-get VẪN chạy tiếp (pid 18058), `dpkg --audit` SẠCH ⇒ không hỏng giao dịch.
Kernel: 6.8.0-139 → 6.8.0-142-generic (đã cài, cần reboot)
Reboot: systemctl reboot lúc ~23:05 → node lên lại sau ~100 s
sau reboot:
  uptime 1 phút · kernel 6.8.0-142-generic
  hysteria@8443 active · hyrelay@8443 active · wg-quick@wg0 active
  ufw active · fail2ban active · flowvpn-autoban.timer active
  ip_forward = 1  · wg0 up · NAT MASQUERADE = 1   ← khách WireGuard vẫn có mạng
  listener: udp 8443 · tcp 8443 · udp 443
  sshd vẫn siết: passwordauthentication no · permitrootlogin without-password
  6/6 relay = 426 · CP {"status":"ok"} · tunnel máy Mac vẫn ổn
```

Còn lại: 1 gói `thermald` (không phải security) — cập nhật lúc rảnh.
