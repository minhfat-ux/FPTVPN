# Giám sát relay WS "đứt MỘT CHIỀU" — canary đo BYTE THẬT (20/10/2026)

## 1. Vì sao phải có

Sự cố thật trên iPhone (19–20/10/2026, nhiều phiên trong khoảng 14:15–15:07):

| Bằng chứng | Giá trị |
|---|---|
| Máy khách gửi lên | `cầu vào 59 gói`, `lossProxy=100%` |
| Chiều về | **0 gói** (`Go→ 0`), `rawWindowBytes` vài trăm byte |
| Đo trực tiếp NGOÀI tunnel | 3–5 Mbps ⇒ Internet của máy **không** hỏng |
| 3 relay `relay-cf-*` | `active`, đều trả `HTTP 426`, journal **không một dòng lỗi** |
| `flowvpn-health-watch` | Không phát hiện gì |

`flowvpn-health-watch` chỉ kiểm **"cổng WS có sẵn sàng không" (426)**. Cổng vẫn sẵn sàng trong khi
**không một byte nào quay về client** — đó là điểm mù. Khách thấy "Connected mà không có mạng", và
mỗi client phải tự phát hiện (15–20 s) rồi tự đổi đường; nếu cửa khác cũng hỏng thì mất mạng lâu.

## 2. Cách đo — dùng số THẬT của chính relay

`/root/wsrelay.js` (relay `relay-cf-*`) có endpoint **`/healthz` trên CÙNG cổng WS**, trả JSON:

```
bytesIn   byte NHẬN TỪ client  (chiều LÊN)      framesIn
bytesOut  byte GỬI VỀ client   (chiều VỀ)       framesOut
active    số WS đang mở                          dropped / udpErrors / lastPongAt
```

Không cần đóng vai client, không cần hysteria: chỉ so hai mẫu liên tiếp để lấy delta.

## 3. Luật kết luận (`flowvpn-relay-canary-eval.py`)

| Điều kiện | Kết luận | Hành động |
|---|---|---|
| Không lấy được `/healthz` | `SKIP` | không làm gì |
| `active == 0` | `IDLE` | không có khách ⇒ không phán |
| Bộ đếm tụt | `SKIP` | relay vừa restart, delta âm là rác |
| `din < 2 KB` | `IDLE` | khách đang rảnh |
| `din ≥ 2 KB` và **`dout == 0`** | **`ONE_WAY`** | 2 mẫu liên tiếp ⇒ **restart** relay |
| `din ≥ 2 KB`, `dout > 0` nhưng `< 1%` của `din` | `SUSPECT` | chỉ ghi log (có thể khách đang upload) |
| còn lại | `OK` | — |

**Vì sao ngưỡng chiều lên chỉ 2 KB** (bản đầu tôi đặt 32 KB và **suýt bỏ lọt chính ca cần bắt**):
lưu lượng streaming rất bất đối xứng — client chỉ gửi ACK ~30–60 KB/phút, có mẫu đo được đúng
**+32.761 B** (dưới ngưỡng cũ ⇒ bị xếp `IDLE`). Dấu hiệu thật của "đứt một chiều" không phải
"chiều lên lớn" mà là **"chiều về đúng bằng 0"**: kể cả khi khách rảnh, QUIC vẫn có ACK/keepalive
về, nên 0 byte là bằng chứng mạnh và không phụ thuộc độ lớn lưu lượng.

**Vì sao restart là hành động đúng:** restart đóng WS ngay ⇒ client nối lại trong ~1–2 s; không
restart thì mỗi client phải chờ watchdog của nó (15–20 s, bản 1.4.7/88) rồi mới đổi đường.

## 4. Luật an toàn (giống `flowvpn-health-watch`)

- **KHÔNG BAO GIỜ** `systemctl stop` / `disable`. Chỉ `restart`.
- **2 mẫu liên tiếp** (≈120 s) mới restart ⇒ tránh báo oan.
- **Cooldown 300 s** cho mỗi unit.
- Tôn trọng cờ bảo trì `/etc/flowvpn-health-watch.maintenance` ⇒ chỉ alert, **không** restart.
- `active == 0` ⇒ không restart (không có khách để cứu).
- Không in token/secret; chỉ in `message_id` khi gửi Telegram.
- Log tự cắt còn 1 MB cuối.

## 5. Cài đặt (đã làm trên relay-server 20/10/2026)

```bash
scp scripts/server/flowvpn-relay-canary scripts/server/flowvpn-relay-canary-eval.py \
    root@165.101.114.162:/usr/local/bin/
ssh root@165.101.114.162 'chmod +x /usr/local/bin/flowvpn-relay-canary*'
# unit + timer: OnUnitActiveSec=60, OnBootSec=90 (xem /etc/systemd/system/flowvpn-relay-canary.*)
ssh root@165.101.114.162 'systemctl daemon-reload && systemctl enable --now flowvpn-relay-canary.timer'
```

## 6. Kiểm tra / nghiệm thu

```bash
python3 /usr/local/bin/flowvpn-relay-canary-eval.py --selftest   # phải in "DAT (8/8 PASS)"
flowvpn-relay-canary --dry-run --report                          # in kết luận MỌI relay, không hành động
tail -f /var/log/flowvpn-relay-canary.log                        # chỉ ghi khi có bất thường/khôi phục
```

Kết quả thật 20/10/2026 (server, sau khi cài):
```
relay-cf-vn1hy  OK    len=+830770  ve=+568240  active=6  down/up=68.40%
relay-cf-vn2hy  OK    len=+117460  ve=+197720  active=4  down/up=168.33%
relay-cf-vn1wg/vn2wg/vn3hy/vn3wg  IDLE  active=0
```

Bộ tự kiểm `--selftest` phủ 8 ca: ONE_WAY (ve=0 khi còn client) · OK (streaming) · IDLE (rảnh) ·
IDLE (không client) · SUSPECT (upload bất đối xứng) · SKIP (bộ đếm tụt) · FIRST (chưa có mốc) ·
lưu mốc cho lần sau.

## 7. Giới hạn đã biết (đừng tưởng sai)

- **Chỉ thấy được khi CÓ client đang kết nối.** Relay không có khách thì không có dữ liệu để phán.
- **Không phân biệt được** "Cloudflare→relay hỏng" với "relay→node hỏng" hay "node không trả lời";
  canary chỉ nói "relay này đang không chở chiều về". Muốn biết vì sao phải xem thêm log node.
- **Restart đá client của relay đó** (chúng nối lại trong 1–2 s). Với relay đang chở nhiều khách,
  đó vẫn rẻ hơn để họ mất mạng 15–20 s.
- Ngưỡng 1% (`SUSPECT`) có thể báo nhiều ở relay có khách upload lớn; nó **không** gây restart.
