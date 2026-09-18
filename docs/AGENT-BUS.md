# Connector giữa hai harness (agent bus trên VPS)

> VPS: **node-2** (`165.101.114.162`) · service `agent-bus.service` · store `/var/lib/agent-bus/messages.jsonl`
> Telegram **chỉ để alert cho người** — kênh máy–máy là connector này.

## 1. Vì sao cần connector (đo thật, không phỏng đoán)

| Đường | Kết quả đo |
|---|---|
| VPS gọi **vào** máy Windows | Không được: máy Windows là client VPN một chiều — `ping 10.77.0.57` mất 100% gói, không cổng nào mở (22/3389/5985/445/3080/7790/80/443) |
| Telegram | Không dùng làm kênh máy–máy: hai bên gửi cùng một bot nên `getUpdates` không trả lại tin của nhau |
| Git | Dùng được nhưng nặng và dễ kẹt khi cây làm việc dirty |

Kết luận: máy Windows chỉ **gọi RA** được. Nên VPS giữ một hàng đợi nhỏ, hai bên **poll** nó — và vì VPS
luôn bật, thông báo vẫn tới nơi kể cả khi bên gửi đã tắt máy.

## 2. Địa chỉ

| Ai | Dùng URL nào |
|---|---|
| Máy trong VPN (Windows) | `http://10.77.0.1:7799` (hoặc `10.78.0.1:7799`) — đi trong tunnel |
| Ra Internet (Mac) | `https://fbuddy.meetflowai.site/agent-bus` (TLS do Caddy lo) |

## 3. Token

- Máy **trong VPN** tự lấy token, không cần người chép tay:
  `curl http://10.77.0.1:7799/token` → `{"token":"…"}`
  (endpoint này **chặn theo IP**: chỉ `10.77.0.0/24`, `10.78.0.0/24`, loopback; Internet bị 403 — đã test cả hai chiều).
- Ngoài VPN (Mac): token nằm ở `.env.bus` trong repo (đã gitignore) — env `AGENT_BUS_URL`, `AGENT_BUS_TOKEN`.
- Mọi lần cấp token đều **alert lên Telegram** (biết ai vừa lấy).

## 4. API

```bash
# gửi cho bên kia
curl -X POST "$BUS_URL/push" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to":"win","kind":"task","title":"T-20260918-01 viết lại 22 mục","body":"…","ref":"T-20260918-01"}'

# bên kia kéo tin mới
curl "$BUS_URL/pull?agent=win&since=0" -H "Authorization: Bearer $TOKEN"
curl "$BUS_URL/health"
```

`kind` gợi ý: `task`, `sent`, `ack`, `progress`, `blocked`, `done`, `verified`, `reopened`, `wake`, `notify`.

## 5. Đã nối sẵn vào công cụ (không phải gọi tay)

- `ops/task.mjs`: mỗi sự kiện (`send`/`ack`/`progress`/`blocked`/`done`/`verify`) **tự đẩy sang bus** cho bên kia
  và **tự alert Telegram** cho người.
- `ops/agent-watch.mjs`: ngoài việc theo dõi git (`fetch` 20s), còn **poll `/pull`**; tin thuộc về mình thì
  **boot harness** (`dsh --profile headless`) để `sync` → `ack` → làm việc → `done --evidence`.
  Tự đọc `.env.bus` nếu env chưa có. Tắt bus: `--no-bus`.

## 6. Bằng chứng đã chạy thật

| Kiểm chứng | Kết quả |
|---|---|
| Push qua TLS + qua VPN IP | 201 (public), 200 (10.77.0.1, 10.78.0.1) |
| `/token` từ Internet | **403** (đã từng hở 200 vì sau Caddy `remoteAddress` là 127.0.0.1 — đã sửa: lấy IP thật ở cuối `X-Forwarded-For`, và chặn thêm ở Caddy) |
| Alert Telegram từ VPS | `message_id 287`, `293` (phải sửa: `fetch` của Node bị ETIMEDOUT tới api.telegram.org — VPS chỉ resolve IPv6; chuyển sang `curl -4`) |
| VPS → Mac đánh thức | Watcher Mac kéo `BUS #6 win→mac` và **chạy lệnh đánh thức** với đúng prompt (`/tmp/wake-bus.txt`) |
| Mac → VPS → (chờ Windows) | `task.mjs send` đẩy bus #2; Windows cần `git pull` để có watcher biết poll bus |

## 7. Vận hành

```bash
systemctl status agent-bus            # trên node-2
journalctl -u agent-bus -n 30         # log: mỗi push + kết quả alert
```

Deploy lại sau khi sửa `ops/agent-bus/bus.mjs`:
```bash
scp ops/agent-bus/bus.mjs root@165.101.114.162:/opt/agent-bus/bus.mjs && \
  ssh root@165.101.114.162 'systemctl restart agent-bus'
```

Biến môi trường (`/etc/agent-bus.env`, quyền 600): `AGENT_BUS_TOKEN`, `AGENT_BUS_PORT=7799`,
`AGENT_BUS_STORE`, `AGENT_TG_TOKEN`, `AGENT_TG_CHAT`.

## 8. Giới hạn phải biết

- Bus là hàng đợi **một chiều mỗi lần gửi**: ai cần tin thì phải poll (watcher làm việc đó).
- Nếu watcher không chạy ở một bên, tin vẫn nằm trong hàng đợi (không mất) nhưng **không ai đánh thức** —
  `node ops/task.mjs list` sẽ cảnh báo `⚠ giao N phút, CHƯA thấy đánh thức/ack`.
- Token nằm trong file `.env.bus` (máy) và `/etc/agent-bus.env` (VPS). Lộ token = người khác đọc/ghi được
  hàng đợi — đổi token thì sửa cả hai nơi rồi restart `agent-bus`.
