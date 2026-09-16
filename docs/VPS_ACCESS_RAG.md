# VPNFlow — RAG hạ tầng & cách vào VPS

> Dành cho MỌI agent/harness (Mac & Windows). Đọc trước khi thao tác trên server.
> KHÔNG ghi secret (khoá/token) vào file này hay bất kỳ file nào trong repo.

## 1. Hai VPS
| Máy | IP | Vai trò |
|---|---|---|
| **node-1** (fcnvpn) | `103.173.155.50` | Caddy, `cp-proxy` (→ node-2), `wsrelay*.service` (WS→UDP), Tailscale Funnel, wg0 |
| **node-2** (fcnvps2) | `165.101.114.162` | Cửa vào công khai chính: Caddy (`meetflowai.site` + `t1`), **control-plane** (`/root/flowvpn-cp`, systemd `flowvpn-cp`, port 7778), wg0, hysteria |

## 2. SSH
```bash
ssh -i ~/.ssh/fpt_tunnel -o ConnectTimeout=10 root@103.173.155.50          # node-1
# từ node-1 nhảy sang node-2 (node-2 KHÔNG mở SSH trực tiếp từ ngoài):
ssh -o ConnectTimeout=10 root@165.101.114.162
```
- Từ mạng Trung Quốc SSH hay timeout ⇒ **thử lại 2–3 lần**; gói lệnh vào 1 lần ssh hoặc base64 script.
- Khoá SSH **không** nằm trong repo.

## 3. Cấu trúc node-2
```
/root/flowvpn-cp/src/*.js        # index.js (HTTP/API/web), admin-page.js, payments.js, mailer.js, auth-store.js, node-store.js…
/root/flowvpn-cp/data/*.json     # auth.json (users/sessions/pendingPayments), devices.json, nodes.json, apple-asc.json(600)…
/root/flowvpn-ipa/VPNFlow-latest.ipa      # IPA đang phát
/root/flowvpn-mac/VPNFlow-mac.dmg         # DMG Mac đang phát
/var/www/flowvpn/dl/                      # file tĩnh → https://t1.meetflowai.site/dl/<file>
```
- `systemctl {status,restart} flowvpn-cp` · `journalctl -u flowvpn-cp -n 50 --no-pager`
- Env: `/etc/systemd/system/flowvpn-cp.service.d/*.conf` (600): alerts.conf (Telegram + Cloudflare token + ALERT_EMAIL), store-urls.conf, admin-token.conf.
- Sửa file: **backup `.bak-<việc>` → `node --check` → restart → verify bằng curl**.

## 4. Caddy — nguồn của mọi lỗi 404/525
- `/etc/caddy/Caddyfile`; **node-2** là cái phục vụ `meetflowai.site` + `t1.meetflowai.site`.
- Site block: `meetflowai.site, t1.meetflowai.site { … }` với các `handle`: `/buy`, `/v1/payments/*`, `/assets/*`, `/guide*`, `/support*`, `/v1/downloads/{android,android-legacy,ios,qr,mac}`, `/install/ios*`, `/install/mac*`, `/v1/*`, `/PrivateVPN/*`, `/dl/*`.
- **Quy luật đã trả giá**: thêm route trong Node là CHƯA đủ — thiếu `handle` ở Caddy là **edge trả 404 dù Node 200** (ca `/install/mac`, `/guide`).
- Thêm hostname mới: thêm vào **chính site block này** để Caddy tự xin cert; quên cert ⇒ Cloudflare trả **525**.
- `caddy validate --config /etc/caddy/Caddyfile` → `systemctl reload caddy`.
- `/dl/*` dùng `root /var/www/flowvpn` (**không** strip prefix) ⇒ file phải nằm trong `/var/www/flowvpn/dl/`.
- Cache 404 của Cloudflare: gặp 404 oan thì thêm `?v=2`.

## 5. WireGuard / relay / GFW
- `wg0` trên cả 2 node, subnet `10.77.0.0/24`, NAT `-s 10.77.0.0/24 -o eth0 -j MASQUERADE` ⇒ mỗi node có IP thoát riêng.
- Kiểm peer: `wg show` (peer, `latest handshake`, `transfer`). Cấp peer qua `/v1/peers/register`; giới hạn **3 thiết bị/user**; gặp `403 device_limit_reached` thì client gửi lại kèm `replace_device_id`.
- Relay: `wg_relay_url` / `hy_relay_url` trong `nodes.json`; đổi bằng `control-plane/scripts/set-node-relay.mjs`. Hiện dùng **Tailscale Funnel** (`wss://fcnvpn.tail303be3.ts.net/…`) — chủ dự án chốt **giữ nguyên** vì đang chạy ổn.
- **GFW chặn theo TÊN MIỀN (SNI), không theo IP**: cùng IP Cloudflare, SNI khác thì handshake OK, SNI `meetflowai.site` thì `TLS alert 40` (TCP vẫn connect). ⇒ Nghi chặn phải kiểm ở **tầng TLS theo SNI**, không chỉ ping/TCP. Host mới `t1.meetflowai.site` vào được từ TQ.

## 6. DNS / Cloudflare / mail
- Zone `meetflowai.site` (Cloudflare NS). Record: `@` + `api` (A → node-2, proxied), `t1` (A → node-2, proxied, dùng cho TQ).
- Mail (KHÔNG xoá): MX `mx92231.maychuemail.net`, SPF `include:spf.maychuemail.com`, DKIM Resend `resend._domainkey`, DMARC `_dmarc` — thiếu là OTP/mail mua chết.
- Token Cloudflare + Telegram: trên Mac `~/.vpnflow-telegram` (600); trên node-2 `alerts.conf` (600). Không đưa vào repo.

## 7. Quy tắc bắt buộc
1. Backup trước khi sửa cấu hình (Caddy, index.js, drop-in) — `.bak-<việc>-<timestamp>`.
2. `node --check` / `caddy validate` trước khi restart; luôn verify bằng curl thật (`t1` + `meetflowai.site`).
3. Không ghi secret vào repo/RAG/log.
4. Không copy đè file đang có hotfix chưa commit — `diff` server ↔ local trước.
5. Commit theo **pathspec** (chỉ file của mình) để không cuốn file của harness khác.
6. **Ranh giới harness**: `windows/**` + mọi bản build/version Windows thuộc **Windows Harness** — session Mac không đụng. Mac Harness lo control-plane/scripts/deploy/iOS/mac/trang buy.
