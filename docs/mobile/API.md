# API cho app mobile — hợp đồng đang chạy thật

> Trích từ `server/src/routes.js` (80 route) và `server/src/agent.js` (11 sự kiện SSE).
> Base URL production: `https://fbuddy.meetflowai.site/api` (web và app **dùng chung**
> một API, không có version riêng cho mobile).

## 1. Nguyên tắc chung

| Điều | Giá trị |
|---|---|
| Kiểu dữ liệu | JSON (`Content-Type: application/json`) |
| Xác thực | `Authorization: Bearer <jwt>` — web còn set cookie, **mobile chỉ dùng Bearer** |
| Lỗi | `{ "error": { "code": "…", "message": "…" } }` — message là tiếng Việt, hiện thẳng được cho người dùng |
| Mã lỗi hay gặp | `401` hết phiên → đăng xuất và mời đăng nhập lại · `402` hết credit (kèm link nạp) · `403` không đủ quyền · `429` vượt giới hạn · `400` sai tham số |
| Giới hạn | chat **60 lượt/phút**, upload **40/phút**, voice **120/phút** (mỗi IP+user) |
| Kích thước tệp | tệp **30MB** (tối đa 5 tệp/lần), audio voice **15MB** |
| Thời gian chờ | nên đặt 20s cho request thường; chat là SSE nên không đặt timeout cứng |

## 2. Đăng nhập

Luồng chính là **mã gửi qua email** (passwordless) — giống web:

```
POST /api/auth/request-token   { "email": "..." }
   → 200 { sent: true }            (rate limit: 3 mã / 15 phút cho mỗi email)
POST /api/auth/verify-token    { "email": "...", "code": "123456" }
   → 200 { user: {...}, token: "<jwt>" }     ← LƯU TOKEN VÀO KEYCHAIN / KEYSTORE
```

- Mã sai 5 lần thì mã bị khoá — hiện thông báo rõ, đừng tự thử lại vòng lặp.
- Luồng phụ: `POST /api/auth/login { email, password }` (chỉ khi cài đặt bật
  `passwordLoginEnabled`) và `POST /api/auth/register` (chỉ khi `allowSignup`).
- `GET /api/auth/me` → người dùng hiện tại (dùng để kiểm tra token còn sống lúc mở app).
- `GET /api/auth/sessions` · `DELETE /api/auth/sessions/:id` · `POST /api/auth/sessions/revoke-others`
  → **mỗi thiết bị là một phiên**; nên có màn "Thiết bị đang đăng nhập" như web.
- `POST /api/auth/logout` → huỷ phiên hiện tại rồi xoá token khỏi máy.

`GET /api/meta` (không cần đăng nhập) trả về: `appName`, `version`, `allowSignup`,
`authMethods` (bật/tắt từng cách), `mailer`, `credits` (bật? giá credit? tặng bao nhiêu?),
`promo`. App nên gọi lúc khởi động để quyết định hiện nút "Đăng ký" hay không.

## 3. Chat streaming (SSE) — phần khó nhất

```
POST /api/chat/stream
Headers: Authorization: Bearer <jwt>, Accept: text/event-stream
Body: { "content": "…", "skill": "auto", "attachments": ["<fileId>"],
        "conversationId": null, "toolMode": "auto" }
→ 200 text/event-stream, các khối "event: <tên>\ndata: <json>\n\n"
```

**11 sự kiện** (khoá trong `data` theo code `server/src/agent.js`):

| Sự kiện | Khoá payload | App làm gì |
|---|---|---|
| `start` | `conversationId`, `messageId`, `userMessageId`, `userMessage`, `conversation`, `providerId`, `provider` (+ `notice` khi phải chuyển nhà cung cấp dự phòng) | tạo hội thoại nếu chưa có, hiện tin nhắn người dùng, hiện `notice` dạng toast |
| `status` | `stage` | đổi dòng trạng thái ("Đang suy nghĩ…") |
| `reasoning` | `text` | (nếu bật) hiện phần suy luận, thường thu gọn |
| `delta` | `text` | **nối vào bong bóng trả lời** — đây là phần chạy liên tục |
| `tool_call` | `id`, `name`, `args` | hiện "thẻ công cụ" đang gọi |
| `tool_result` | `role`, `toolCallId`, `name`, `content`, `isError` | cập nhật thẻ công cụ (lỗi thì tô `--danger`) |
| `artifact` | `artifact` (tệp sinh ra: id/tên/mime/kích thước) | hiện thẻ tệp tải được |
| `usage` | `in`, `out` (+ credit đã trừ nếu có) | cập nhật số dư, hiện nhỏ dưới tin nhắn |
| `notice` | `message` | toast thông báo |
| `done` | `messageId`, `finishReason`, `iterations`, `durationMs` | đóng trạng thái, lưu tin nhắn |
| `error` | `code`, `message` | hiện lỗi trong khung chat; `402` thì hiện nút nạp credit |

**Bắt buộc trên mobile:**

- Không có `EventSource` sẵn ở iOS/Android → viết client SSE đọc theo dòng
  (mẫu ở [`IOS.md`](IOS.md) và [`ANDROID.md`](ANDROID.md)). Không được gom cả response
  rồi mới parse: như vậy mất hẳn cảm giác chạy chữ.
- Phải **buffer theo dòng** vì một khối `data:` có thể bị cắt giữa hai gói TCP.
- Người dùng bấm dừng → **huỷ request**, đừng chỉ bỏ qua sự kiện (server vẫn tính credit
  cho tới khi kết thúc).
- Mất mạng giữa stream: giữ phần `delta` đã nhận, hiện "mất kết nối", cho gửi lại.
- `attachments` là **mảng id tệp** đã upload trước đó (xem mục 5).

## 4. Hội thoại

| Method | Path | Việc |
|---|---|---|
| `GET` | `/api/conversations` | danh sách (mới nhất trước) |
| `POST` | `/api/conversations` | tạo mới |
| `GET` | `/api/conversations/:id` | chi tiết + tin nhắn |
| `PATCH` | `/api/conversations/:id` | đổi tiêu đề |
| `DELETE` | `/api/conversations/:id` | xoá |
| `POST` | `/api/conversations/:id/duplicate` | nhân bản |
| `GET` | `/api/conversations/search?q=` | tìm trong lịch sử |
| `POST` | `/api/conversations/:id/active` · `DELETE /api/conversations/active` | nhớ hội thoại đang mở (web dùng để mở lại đúng chỗ) |

## 5. Tệp & artifact

```
POST /api/files           multipart, field tên "file" (+ conversationId)
GET  /api/files/:id       metadata
GET  /api/files/:id/content   nội dung (CẦN Bearer — không phải URL công khai)
DELETE /api/files/:id
GET  /api/artifacts       danh sách tệp do trợ lý tạo ra
```

- Sai tên field trả **400** kèm hướng dẫn (đừng đoán, đọc `message`).
- Tải tệp trên mobile: gửi kèm header Authorization rồi lưu vào thư mục tạm của app;
  **không** mở trực tiếp URL bằng trình duyệt hệ thống vì sẽ thiếu token.

## 6. Kỹ năng (skill) & chợ kỹ năng

| Method | Path | Việc |
|---|---|---|
| `GET` | `/api/skills` | `items` (dropdown), `installed`, `catalog`, `maxSelectable` |
| `PUT` | `/api/skills/installed` | `{ ids: [...] }` — lưu lựa chọn (tối đa 10, tối thiểu 1) |
| `GET` | `/api/hub` | chợ: danh sách đang bán + `owned` + số dư |
| `POST` | `/api/hub/:id/purchase` | mua bằng credit (402 nếu thiếu) |

Trợ lý nhận **mọi id trong danh mục**, nên app không cần map cứng tên kỹ năng.
Bên web chỉ có 6 kỹ năng đang bán, giá tính bằng **VND** (xem `priceVnd` trong `hub_skills`).

## 7. Credit & nạp tiền

| Method | Path | Việc |
|---|---|---|
| `GET` | `/api/credits` | số dư + tổng đã dùng + trung bình mỗi lượt + số lượt còn lại |
| `GET` | `/api/credits/ledger` | sổ cái (mỗi bút toán có `balance_after`) |
| `POST` | `/api/credits/request` | "Xin thêm token" → gửi yêu cầu chờ admin duyệt |
| `GET` | `/api/credits/requests` | các yêu cầu của mình |
| `GET` | `/api/topup` | `packages`, `bank`, `orders`, `balance` |
| `POST` | `/api/topup/orders` | `{ packageId }` → đơn `pending` + mã `FLOWGPT…` + ảnh VietQR |
| `POST` | `/api/topup/orders/:id/transferred` | người dùng báo đã chuyển khoản |
| `POST` | `/api/topup/orders/:id/cancel` | huỷ đơn |

- Hết credit: chat trả **402** kèm link nạp → app hiện nút "Nạp thêm".
- Ảnh VietQR là URL công khai (`img.vietqr.io`) — hiển thị thẳng được.
- Đơn đổi trạng thái `pending → awaiting_confirmation → paid`; app nên hỏi lại
  `/api/topup` khi người dùng quay lại màn nạp tiền.

## 8. Voice

| Method | Path | Việc |
|---|---|---|
| `GET` | `/api/voice/config` | nửa STT/TTS đang do **trình duyệt** hay **server** làm |
| `POST` | `/api/voice/transcribe` | multipart field `audio` → chữ |
| `POST` | `/api/voice/speech` | `{ text, … }` → bytes audio |

**Mobile ưu tiên native**: `SFSpeechRecognizer` + `AVSpeechSynthesizer` (iOS),
`SpeechRecognizer` + `TextToSpeech` (Android) — miễn phí, không tốn credit, không phụ thuộc mạng.
Chỉ gọi endpoint server khi cài đặt trỏ về provider (giống web).

## 9. Bảng tra nhanh toàn bộ route

<details><summary>80 route, nhóm theo khu vực</summary>

- **Công khai**: `GET /health` · `GET /meta` · `POST /auth/request-token` · `POST /auth/verify-token` ·
  `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` ·
  `GET /topup/orders/:id/confirm` (link admin) · `POST /topup/sepay` (webhook SePay) ·
  `GET /credits/requests/:id/decide` (link admin)
- **Cần đăng nhập**: `PATCH /auth/me` · phiên đăng nhập · hội thoại (8 route) · `POST /chat/stream` ·
  files/artifacts (5) · skills (2) · models · voice (3) · credits (5) · hub (3) · topup (5)
- **Admin** (app thường **không** cần): settings (app/providers/mcp/mailer/voice test) ·
  admin users/stats/credits · admin hub (4) · admin topup (2) · admin sepay (2) ·
  admin credit-requests (4) · `GET /mcp/tools`

Danh sách đầy đủ kèm method: xem `docs/API_CONTRACT.md` hoặc `server/src/routes.js`.
</details>

## 10. Việc app phải tự lo (server chưa có)

| Việc | Ghi chú |
|---|---|
| Push notification | Chưa có endpoint đăng ký thiết bị (APNs/FCM). Cần làm ở backend trước. |
| Refresh token | JWT sống 30 ngày, không có refresh — hết hạn thì 401 → đăng nhập lại. |
| Offline | Không có API đồng bộ; chỉ nên cache danh sách hội thoại gần nhất để mở app nhanh. |
| Deep link | Chưa có. Nếu cần mở thẳng hội thoại, dùng `?view=` trên web làm chuẩn rồi thống nhất sau. |
