# T-20260930-02 — Khách complain không dùng được Claude và Gemini khi bật VPN

- **Việc**: chủ dự án giao qua Telegram (`/vibecode`), bus **#604** lúc `2026-09-30T06:57:01Z`
  (nguyên văn: *"kiểm tra: khách complain không dùng được claude và gemini khi vpn"*)
- **Bên nhận / người làm**: WIN · **máy**: `DESKTOP-852P1LT` · **đo lúc**: 2026-09-30 15:00–15:35 (+08)
- **Nghiệm thu**: `node ops/verify-claude-gemini-vpn.mjs`

## 1. Kết luận ngắn

| Câu hỏi | Trả lời | Bằng chứng |
|---|---|---|
| Đường hầm VPN có chặn Claude không? | **KHÔNG** | `claude.ai/` → 302 → `/login` → **200** (title "Claude"); `api.anthropic.com` → **401** "API key is invalid" = tới được Anthropic, chỉ sai khoá |
| Đường hầm VPN có chặn Gemini không? | **KHÔNG** | `gemini.google.com` → **200** (`lang="vi"`, title "Google Gemini"); `generativelanguage.googleapis.com` → **400** `API_KEY_INVALID` = tới được Google |
| IP ra Internet có bị gắn cờ xấu không? | **KHÔNG** | `165.101.114.162` = Vietnam/VNPT · `proxy=false` · `hosting=false`; Cloudflare (thứ Anthropic nhìn thấy) báo `loc=VN` |
| Việt Nam có được Anthropic hỗ trợ không? | **CÓ** — cả API **và** Claude.ai | danh sách chính thức có "Vietnam": [anthropic.com/supported-countries](https://www.anthropic.com/supported-countries) |
| Vậy vì sao khách không dùng được? | **Không nằm ở đường hầm** — xem §4, nghi phạm số 1 là **bản app cũ (≤1.4.5) dính lỗi DNS đã biết** | máy này đang cài **1.4.5**; bản phát hành hiện tại **1.4.7** |

**Nói thẳng**: đo từ chính IP mà khách đi ra (`165.101.114.162`), Claude và Gemini **đều vào được**.
Đường hầm không chặn, IP không bị Anthropic/Google chặn. Vấn đề của khách nằm ở phía khách (bản app /
tài khoản / trình duyệt) — danh sách kiểm tra ở §5.

## 2. Số đo thật

### 2.1 Bảng đo (máy Windows **đang bật VPN**, egress = VPS)

| Đích | Kết quả | Nghĩa |
|---|---|---|
| `claude.ai/` | `302 → https://claude.ai/login` | chuyển hướng bình thường, không bị chặn |
| `claude.ai/login` | **`200`**, title `Claude` | trang đăng nhập tải được |
| `api.anthropic.com/v1/messages` (khoá sai) | **`401`** `authentication_error: API key is invalid.` | **tới được Anthropic**; nếu bị chặn vùng sẽ là `403` |
| `gemini.google.com/` | **`200`**, `lang="vi"`, title `Google Gemini` | app Gemini tải được |
| `generativelanguage.googleapis.com` (khoá sai) | **`400`** `API_KEY_INVALID` | **tới được Google API** |
| `aistudio.google.com/` | `302 → /welcome` | bình thường |
| `chatgpt.com/` (đối chứng) | `200` | bình thường |
| `api.openai.com/v1/models` (đối chứng) | `401` | bình thường |
| DNS cho cả 8 tên miền | phân giải **đúng** hết | không dính lỗi DNS |

`verify-claude-gemini-vpn.mjs` → **5/5 PASS, exit 0**, chạy ở **cả hai** nơi:
`verify-windows.txt` (qua tunnel) và `verify-node2.txt` (trên chính VPS, không qua tunnel).

### 2.2 Vì sao đo ở node-2 lại là đối chứng đúng

Hai vantage cùng đi ra **một IP** `165.101.114.162`:
- **Windows qua tunnel** ⇒ chứng minh *đường hầm chở được* traffic tới Claude/Gemini.
- **node-2 trực tiếp** ⇒ chứng minh *chính cái IP đó* không bị Anthropic/Google chặn.

Hai bên cho **cùng kết quả**. (Không tắt VPN của chủ dự án để đo đối chứng — không cần, và tránh cắt
phiên đang chạy.)

## 3. Hai cái bẫy kỹ thuật đã tốn thời gian — **đừng kết luận oan lần nữa**

### 3.1 `fetch`/undici báo "gemini fetch failed" — KHÔNG phải mạng

Header trả về của `gemini.google.com` là **28.657 byte**, vượt mức **16 KB** mặc định của undici:

```
LOI: fetch failed | cause: UND_ERR_HEADERS_OVERFLOW
```

Đổi sang `node:https` với `maxHeaderSize` lớn ⇒ **200 OK**. Đây là **giới hạn của client Node**, không
phải Gemini bị chặn. (Trình duyệt thật không dính.)

### 3.2 `curl` bị `403` trên claude.ai — KHÔNG phải IP bị chặn

Trên **cùng một IP** `165.101.114.162`, chỉ đổi client (xem `ua-vs-fingerprint.txt`):

| Client | `claude.ai/login` | `gemini.google.com` |
|---|---|---|
| `curl` (UA curl **và** UA Chrome) | **403** | 200 |
| `node:https` (UA Chrome) | **200** | 200 |
| Windows qua tunnel (`node:https`) | **200** | 200 |

⇒ `403` là **Cloudflare bot-management chặn theo fingerprint TLS của curl**, không phải chặn theo IP.
**Hệ quả thực tế:** khách dùng **công cụ dòng lệnh / script / client không phải trình duyệt** để vào
Claude sẽ bị `403` **dù VPN hoàn toàn sạch** — đây là một nguyên nhân rất khớp với câu "Claude không
dùng được" mà mọi trang khác vẫn chạy. Gemini thì không dính (curl vẫn 200).

### 3.3 Ghi chú môi trường harness

`curl.exe` và `Invoke-RestMethod` trong phiên này hỏng TLS (`schannel: SEC_E_NO_CREDENTIALS`) —
lỗi của môi trường sandbox, **không liên quan VPN**. Vì vậy mọi phép đo ở đây dùng `node:https`.

## 4. Nghi phạm thật (xếp theo khả năng)

1. **Bản app cũ dính lỗi DNS đã biết — khả năng cao nhất.**
   Máy này đang cài **`1.4.5`** (`C:\Program Files\VPNFlow\PrivateVPNWindows.App.exe`,
   `ProductVersion = 1.4.5-localtest+38a3e6f…`). Bản 1.4.5 có lỗi **thứ tự rule `hijack-dns` + thiếu
   `detour` cho DNS** ⇒ *"bật VPN thì mất mạng; google, youtube và **các link cần VPN** không vào được,
   trong khi app/web trong nước vẫn chạy"* — Claude/Gemini chính là "link cần VPN".
   Lỗi này **đã sửa ở 1.4.6** (`_work/web-assets-main/docs/handoff/HANDOFF_WINDOWS_1.4.6_DNS_HOTFIX_2026-09-23.md`).
   Bản phát hành hiện tại: **Windows 1.4.7**, **macOS 1.4.7** (min 1.4.7), **iOS 1.4.6**, **Android 1.4.4**
   (đọc từ `GET /v1/app-version?platform=…`).
   → **Khách phải cập nhật lên bản mới nhất rồi thử lại.**
2. **Client không phải trình duyệt bị Cloudflare chặn** (§3.2) — nếu khách dùng CLI/script/app lạ để
   vào Claude. Thử bằng **Chrome/Edge/Safari bình thường** để phân biệt.
3. **Chặn ở tầng tài khoản** (Anthropic/Google gắn cờ, CAPTCHA "unusual traffic", hết hạn mức) — không
   do đường hầm; cần chính tài khoản của khách để kiểm.
4. **Chất lượng đường truyền kém** — đo lúc này: mất gói tunnel **6%**, **5 lần** WireGuard handshake
   thất bại trong 1 giờ; T-20260930-01 đo được **10–23% mất gói UDP**. Mất gói cao làm các phiên TLS/QUIC
   dài (chat AI stream) đứt giữa chừng ⇒ "dùng một lúc thì hỏng". Đây là vấn đề **thật và sửa được**,
   khác với "bị chặn".

## 5. Cần hỏi khách 4 câu (để chốt đúng nguyên nhân)

1. **Phiên bản app** đang dùng (mở app → About/Diagnostics) — nếu < **1.4.7** thì cập nhật rồi thử lại.
2. **Dùng cái gì**: trang web trên trình duyệt thường, hay app/CLI? Trình duyệt nào?
3. **Thông báo lỗi nguyên văn** (ảnh chụp càng tốt): `403`, màn hình xoay mãi, "not available in your
   country", hay CAPTCHA?
4. **Tắt VPN đi thì có dùng được không?** — câu này tách "do VPN" khỏi "do tài khoản/mạng khách".

## 6. Bằng chứng kèm theo

| File | Nội dung |
|---|---|
| `verify-windows.txt` | `node ops/verify-claude-gemini-vpn.mjs` chạy trên Windows **qua tunnel** → 5/5 PASS, exit 0 |
| `verify-node2.txt` | cùng script chạy trên **node-2** (cùng IP, không qua tunnel) → 5/5 PASS, exit 0 |
| `ua-vs-fingerprint.txt` | Cùng IP: `curl` → 403 vs `node:https` → 200 trên `claude.ai` (chứng minh 403 do fingerprint, không do IP) |
| `probe-windows.txt` | Số đo thô: status/header/`lang` từng endpoint, `loc=VN`, và artifact `UND_ERR_HEADERS_OVERFLOW` |
| `ops/verify-claude-gemini-vpn.mjs` | Script nghiệm thu (chạy được cả trên Windows và trên VPS) |

Script đo dùng một lần (nằm cùng trong `ops/_scratch/T-20260930-02/`): `probe-ai-block.mjs`,
`probe2-gemini-cause.mjs`, `probe3-maxheader.mjs`, `probe4-loc.mjs`, `probe5-versions.mjs`,
`probe6-geo-catalog.mjs`, `node2-ai-check.sh`, `node2-node-probe.mjs`, `send-tg-claude-gemini.mjs`.

## 7. Việc đã thực hiện

- Chép bus #604 vào sổ thành `T-20260930-02` (owner → win, có `busId`/`busFrom`), `ack` + push.
- Đo từ 2 vantage (Windows qua tunnel + node-2 trực tiếp) trên 8 tên miền; kiểm danh tiếng + quốc gia IP.
- Tách bạch 2 artifact (`undici` header overflow, `curl` fingerprint) để không kết luận oan.
- Viết script nghiệm thu `ops/verify-claude-gemini-vpn.mjs` (5 mục PASS/FAIL, exit code rõ ràng).
- **Không đổi cấu hình VPN, không tắt đường hầm** của chủ dự án.
