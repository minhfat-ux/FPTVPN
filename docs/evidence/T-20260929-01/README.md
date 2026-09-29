# T-20260929-01 — "Android bấm Connect báo lỗi HTTP 500 là sao?"

> Nguồn: **bus #566** (owner → win, 2026-09-29T13:49:10Z: *"lỗi Android connect báo lỗi http 500 là sao?"*)
> và **bus #567** (owner → win, 14:03:24Z: *"báo lỗi http 500 khi connect"*).
> Người làm: harness **WIN** (macOS song song ở sổ `TG-VIBECODE`) · Nghiệm thu: `node ops/verify-android-connect-500.mjs`.

## 0. Trả lời ngắn cho chủ dự án

**Không phải lỗi app Android, không phải mạng/VPN/relay.** Lỗi nằm ở **máy chủ**: tệp dữ liệu
người dùng `auth.json` của control-plane (`flowvpn-cp`) **bị rách** — JSON không còn hợp lệ — nên
**mọi request cần đăng nhập đều trả HTTP 500**, trong đó có `POST /v1/peers/register` (đúng cái app
gọi khi bấm **Connect**). Rách lúc **13:27:03Z (20:27:03 giờ VN) 29/09**; đã lành lúc **14:17Z**;
bản vá chống tái diễn **đã chạy thật từ 21:26:38 (+07)**.

## 1. Thủ phạm: `_save()` dùng CHUNG một tệp tạm

`AuthStore._save()` (control-plane/src/auth-store.js) ghi "nguyên tử" bằng `writeFile` ra
`${auth.json}.tmp` rồi `rename`. Nhưng tên tệp tạm **cố định**, và **không có xếp hàng**: hai request
đồng thời cùng `writeFile` vào **một** tệp tạm, rồi hai `rename` tranh nhau.

Bằng chứng "khói súng" — log của chính flowvpn-cp, đúng giây file hỏng:

```
Sep 29 20:27:03 fcnvps2 node[442824]: POST /v1/peers/register failed: Error: ENOENT: no such file
  or directory, rename '/root/flowvpn-cp/data/auth.json.tmp' -> '/root/flowvpn-cp/data/auth.json'
```

Nghĩa là: lần ghi A đã `rename` mất tệp tạm trước khi lần ghi B kịp `rename` ⇒ B **ENOENT**, còn
byte mà B ghi dở vẫn nằm trong inode đã được đổi tên thành `auth.json` ⇒ file bị **trộn**.

### 1.1 Giải phẫu file rách (đo trực tiếp, không suy đoán)

| | |
|---|---|
| File | `/root/flowvpn-cp/data/auth.json` (tang vật: `data/backups/auth.json.torn-20260929-211613`) |
| Dung lượng | 419.257 B · 10.245 dòng |
| JSON hợp lệ đầu tiên | kết thúc ở byte **419.002** (`}` đóng ngoài cùng) |
| Phần dư | **253 B** bắt đầu giữa một object: `"f3519b0a-…", "windowDays": 7, "sentAt": …` |

Đúng hình dạng của hai `writeFile` chồng nhau: bản ghi ngắn hơn đóng file bằng `}`, phần đuôi của
bản ghi dài hơn (đã ghi ra trước đó ở offset lớn hơn) còn nguyên phía sau.

## 2. Vì sao 500 lan ra MỌI request

`_load()` đã được siết từ sự cố 26/09: **hỏng thì NÉM RA**, không coi như rỗng (coi như rỗng rồi
`_save` sẽ **xoá sạch** khách). Nên khi `auth.json` rách:

`requireUserAuth → findSession → _load → JSON.parse` ném `SyntaxError` ⇒ framework trả **500 Internal
error**. App Android bấm Connect gọi `/v1/peers/register` (cũng cần `_load`) ⇒ **HTTP 500**.

## 3. Số đo sự cố (26/09 → 29/09)

| Mốc (giờ node-2, UTC+7) | Số đo |
|---|---|
| 20:27:03 | dòng `ENOENT … rename auth.json.tmp` (duy nhất trong toàn bộ journal) + 3 lần `POST /v1/peers/register` **500** (app khách bấm Connect lại) |
| 20:27:03 → 21:15:30 | **201** dòng `Unexpected non-whitespace character after JSON at position 419003` |
| cùng cửa sổ | **109** request đã nhận 500 (`[auth-store] KHÔNG ĐỌC ĐƯỢC` = 1 dòng/request): **49× `GET /v1/admin/stats`**, **4× `POST /v1/peers/register`** (+ các request phiên khác) |
| 13:49:10Z / 14:03:24Z (= 20:49 / 21:03 giờ VN) | chủ dự án báo qua Telegram — **nằm trong** cửa sổ hỏng |
| 21:16:13 | bản sao tang vật `auth.json.torn-20260929-211613` được tạo |
| 21:17 / 21:18 | `auth.json` lành (JSON hợp lệ trở lại) — hết 500 |
| 21:24:08 | `auth-store.js` được vá (`_writeChain` + tên tệp tạm riêng), backup `.bak-20260929-500fix` |
| **21:26:38** | **WIN khởi động lại `flowvpn-cp`** ⇒ bản vá **thực sự có hiệu lực** (trước đó chỉ nằm trên đĩa, tiến trình cũ vẫn chạy code cũ) |

### 3.1 Không mất dữ liệu khách

| Bản | users | sessions | subscriptions | renewalReminders |
|---|---|---|---|---|
| `backups/auth.json.20260926-224751.bak` (26/09) | 22 | 97 | 20 | 10 |
| `auth.json` đang chạy (sau khi lành) | **25** | **108** | **23** | 10 |

Phần 253 B bị cắt là **bản trùng** của 2 mục `renewalReminders` cuối (`f3519b0a…`, `0d61d28e…`) —
cả hai đều **đã có** trong bản giữ lại. Tăng trưởng 22→25 user / 97→108 phiên / 20→23 gói là liên tục
⇒ **không mất user, phiên hay gói nào**.

## 4. Bản vá + nghiệm thu độc lập

**Bản vá** (`control-plane/src/auth-store.js`, MAC thực hiện 21:24:08, WIN đo lại và đưa vào chạy):

1. `_writeNow()` dùng tên tệp tạm **riêng cho từng lần ghi**: `${file}.${pid}.${uuid}.tmp` (+ `rm` nếu lỗi).
2. `_save()` **xếp hàng** qua `this._writeChain` ⇒ hai lần ghi không bao giờ chồng nhau.

**Bài bắn đồng thời** (3 vòng × 50 lần `_save` song song, payload khác kích thước, ghi vào `/tmp`):

| Code | `ENOENT rename` | File JSON hỏng | Kết luận |
|---|---|---|---|
| **Trước vá** (`auth-store.js.bak-20260929-500fix`) | **147** | **2**/3 | FAIL — tái hiện đúng sự cố |
| **Sau vá** (đang chạy) | **0** | **0**/3 | OK |

**Trạng thái sống sau khi khởi động lại 21:26:38** (đo lúc 21:29):

- `GET /v1/health` → **200** (127.0.0.1:7778 **và** `https://api.meetflowai.site/v1/health`).
- `POST /v1/peers/register` bắn **20 lần ĐỒNG THỜI** → **20× 401** (`Invalid or expired join token` — đúng), **0× 500**.
- `/v1/admin/stats`, `/v1/me`, `/v1/servers` với token giả → **401**, không 500.
- Journal kể từ lúc khởi động lại: **0** `position 419003`, **0** `ENOENT … auth.json`.

Lệnh nghiệm thu (chạy được từ cả WIN và Mac):

```bash
node ops/verify-android-connect-500.mjs     # → KẾT LUẬN: PASS — 7/7 điều kiện đúng (exit 0)
```

## 5. Còn lại (không giấu)

- `_save` xếp hàng chỉ chặn **rách file**. Kiểu **read-modify-write** (hai request cùng `_load` rồi
  cùng `_save`) vẫn có thể làm **mất một cập nhật** (không hỏng file, không gây 500). Muốn kín phải
  gom `_load`+sửa+`_save` vào một hàng đợi — việc riêng, chưa làm.
- Clip "500" ở tầng proxy: Caddy không log status theo cách grep được, nên số request bị 500 được
  đếm từ log ứng dụng (109 request) — là **cận dưới**, thực tế có thể hơn.
- Sự cố 26/09 (đã siết `_load`) và sự cố 29/09 này là **hai nửa của cùng một lỗi**: đọc thì đã chặt,
  ghi thì nay mới chặt.
