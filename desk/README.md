# flowdesk — backend riêng cho bản Windows

Service này phục vụ **app Windows (MeetFlow AI Overlay)**. Nó tồn tại để app không
phải giữ key Soniox/OpenRouter trong máy khách, và để chủ dự án **thu hồi được**
quyền của một thiết bị.

Thiết kế nằm trong `docs/HANDOFF-NEXT.md` §3 — đọc mục đó trước khi sửa.

## Vì sao tách hẳn khỏi fBuddy

| Lớp tách | fBuddy | flowdesk |
|---|---|---|
| Tiến trình | `fbuddy.service` · port 7790 | `flowdesk.service` · port **7791** |
| Env | `FBUDDY_*` | `DESK_*` |
| DB | `/var/lib/fbuddy/fbuddy.db` (ghi) | `/var/lib/flowdesk/desk.db` (ghi) |
| Key nhà cung cấp | key của web | **key riêng** cho bản Windows |
| Tên miền | `fbuddy.meetflowai.site` | `desk.meetflowai.site` |

Nhờ vậy xoay key của bản Windows, hay service này chết, **không đụng** bản Mac
(`api.meetflowai.site`) và không đụng web fBuddy. Code nằm trong cùng checkout
`/opt/fbuddy` (một nguồn sự thật) nhưng chạy như một tiến trình riêng.

Quyền sử dụng **chỉ đọc** từ `fbuddy.db`: một đơn `topup_orders.status = 'paid'`
là đủ mở quyền. Không có bảng nào của fBuddy bị service này ghi vào.

## Phụ thuộc

Gần như không: `node:http`, `node:sqlite`, `node:crypto` + **`ws`** (chỉ để làm
WebSocket server). Không build native, deploy chỉ cần `npm install --prefix desk`.
Yêu cầu Node ≥ 22.5 (vì `node:sqlite`).

## Endpoint

| Method | Đường dẫn | Xác thực | Việc |
|---|---|---|---|
| GET | `/v1/desktop/health` | công khai | sống/chết + nguồn quyền có đọc được không |
| POST | `/v1/desktop/activate` | mã kích hoạt | đổi mã → token phiên (rate limit theo IP) |
| POST | `/v1/desktop/session` | token phiên | gia hạn token |
| GET | `/v1/desktop/me` | token phiên | trạng thái + hạn mức tháng |
| POST | `/v1/desktop/revoke` | token phiên | thiết bị tự gỡ chính mình |
| WS | `/v1/desktop/stt` | token phiên | proxy PCM 16 kHz mono → Soniox, key ở server |
| POST | `/v1/desktop/summary` | token phiên | proxy OpenRouter (biên bản họp), key ở server |
| POST | `/v1/desktop/invitations` | `x-desk-admin-token` | phát/xoay mã cho user có đơn `paid` → trả mã gốc **một lần** |
| GET | `/v1/desktop/invitations` | admin | danh sách mã (chỉ còn `codeHint`) |
| POST | `/v1/desktop/invitations/:id/revoke` | admin | thu hồi mã |
| GET | `/v1/desktop/activations` | admin | danh sách thiết bị đã kích hoạt |
| POST | `/v1/desktop/activations/:id/revoke` | admin | thu hồi một thiết bị (hiệu lực ngay) |
| GET | `/v1/desktop/audit` | admin | nhật ký cấp/thu hồi/kích hoạt thất bại |

### Giao thức `WS /v1/desktop/stt`

1. App mở `wss://<desk>/v1/desktop/stt` với `Authorization: Bearer <token phiên>`
   (hoặc `?token=` cho công cụ không đặt được header). Sai token ⇒ **HTTP 401**
   ngay, không nâng cấp giao thức.
2. App gửi khung **TEXT đầu tiên** = cấu hình Soniox của app, **không có key**.
   Proxy bỏ mọi `api_key` client gửi, chèn key thật, ép `audio_format` /
   `sample_rate` / `num_channels` về giá trị hợp lệ rồi mới gửi lên Soniox.
3. Sau đó chỉ còn khung **nhị phân** (PCM) hai chiều. Khung TEXT khác rỗng ⇒ đóng
   `1008`. Khung TEXT rỗng = kết thúc phiên (đúng giao thức Soniox).
4. Kết thúc phiên: ghi `desk_usage` (giây + byte) để tính hạn mức tháng.

Quy tắc bắt buộc (§3.5 của file bàn giao):

- Mọi route đều cần xác thực, **trừ `/health`**.
- Rate limit theo IP (activate/session/admin) **và** chặn dò mã: quá
  `DESK_RATE_ACTIVATE_FAIL_PER_10MIN` lần sai từ một IP thì khoá tạm.
- **Chỉ lưu HMAC của mã kích hoạt**, không lưu mã gốc; mất DB cũng không lộ mã khách.
- Token phiên ngắn hạn, mang `aid`; thu hồi thiết bị ⇒ token chết **ngay**, không
  phải chờ hết hạn.
- Hạn mức audio/tháng mỗi user (`DESK_MAX_STT_MINUTES_PER_MONTH`); mỗi phiên còn có
  trần riêng (`DESK_MAX_STT_SESSION_MINUTES`).
- Trần ký tự mỗi lần tóm tắt (`DESK_MAX_SUMMARY_CHARS`) và **model do server chọn** —
  client không tự chọn model đắt tiền.
- **Không bao giờ** trả key Soniox/OpenRouter ra client; phản hồi của nhà cung cấp
  còn bị quét để che key nếu chẳng may có (test canh cả hai việc này).

## Chạy

```bash
npm --prefix desk install                # chỉ `ws`, không build native
node desk/src/index.js                   # dev: tự sinh secret ở data/flowdesk/.dev-secret

# test — mỗi file một tiến trình (mặc định của `node --test` trên Linux/VPS)
npm --prefix desk test

# Windows trong sandbox DSH: `node --test` bị chặn spawn tiến trình con (named pipe),
# nên chạy gộp một tiến trình:
node --test --test-isolation=none desk/test/*.test.js
```

Env: xem `deploy/flowdesk.env.example`. Bắt buộc ở production: `DESK_SECRET`
(≥ 32 ký tự), `DESK_ADMIN_TOKEN` (≥ 16 ký tự), `DESK_SONIOX_API_KEY`,
`DESK_OPENROUTER_API_KEY`. Thiếu secret/admin token là **không khởi động**, cố ý:
thà chết còn hơn chạy với khoá ai cũng đoán được.

## Deploy

```powershell
# từ Windows: deploy fBuddy như cũ, kèm cài/refresh flowdesk
.\deploy\deploy.ps1 -WithDesk
```

`deploy/flowdesk-remote-setup.sh` (chạy trên VPS) cài systemd unit `flowdesk`, thêm
block Caddy cho `desk.meetflowai.site` (backup + `caddy validate` trước khi reload),
cài dependency `ws`, rồi khởi động. **Nó từ chối khởi động khi
`/etc/flowdesk/flowdesk.env` chưa tồn tại** — vì env chứa key riêng của bản Windows
và `DESK_ADMIN_TOKEN` phải trùng với `FBUDDY_DESK_ADMIN_TOKEN` bên fBuddy.

Sau khi có env, thêm vào `/etc/fbuddy/fbuddy.env`:

```
FBUDDY_DESK_URL=http://127.0.0.1:7791
FBUDDY_DESK_ADMIN_TOKEN=<đúng DESK_ADMIN_TOKEN>
```

rồi `systemctl restart fbuddy` — từ đó mỗi đơn chuyển sang `paid` sẽ tự phát mã và
gửi email cho khách.

## Phía fBuddy (đã nối)

- `server/src/desktop.js` — client gọi flowdesk (timeout, không bao giờ ném ra luồng
  xác nhận thanh toán), ký link mở trang công khai.
- `server/src/topup.js` — `confirmTopupOrder()` gọi `queueDesktopActivation()` (chạy nền)
  sau khi đơn thành `paid` ⇒ không thể làm hỏng việc cộng credit.
- `server/src/mailer.js` — `sendDesktopActivation()` gửi mã + hướng dẫn tải app.
- `server/src/routes.js` — `GET /api/desktop/status`, `POST /api/desktop/code`,
  `GET /api/desktop?u=&t=` (trang công khai, link ký HMAC 30 ngày).
- `server/test/desktop.test.js` — 8 test, có ca "flowdesk chết nhưng thanh toán vẫn xong".

## Trạng thái

- [x] §3.6.1 Service + đọc quyền từ đơn `paid` + bảng activation + `/health` + test
- [x] §3.6.3 WS proxy Soniox + `/summary` (key ở server, hạn mức, che key)
- [~] §3.6.2 Email tự động + trang xem lại mã: **xong phía fBuddy + trang công khai**;
      còn lại view `?view=desktop` trong web app
- [x] §3.6.4 App WPF bỏ key, dùng mã kích hoạt (build sạch + smoke 9/9 mục)
- [ ] §3.6.5 Deploy thật + một phiên đầu-cuối (cần key Soniox/OpenRouter **riêng** cho
      bản Windows và bản ghi DNS `desk`)
