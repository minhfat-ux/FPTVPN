# Android bấm Connect báo **HTTP 500** — nguyên nhân gốc + đã sửa (29/09/2026)

> Người làm: harness **WIN** · task sổ: **`T-20260929-01`** (owner → win, bus **#566** lúc 2026-09-29T13:49:10Z)
> Nguyên văn (Telegram `/vibecode`): *"lỗi Android connect báo lỗi http 500 là sao?"*
> Kiểm tra + sửa lúc **2026-09-29 13:50–14:35Z** (20:50–21:35 giờ VN, VPS node-2 `165.101.114.162`).

## 1. Kết luận ngắn

**Không phải lỗi mạng, không phải app Android, không phải Cloudflare.** Máy chủ **`flowvpn-cp` trả 500 thật**,
vì **kho `data/auth.json` bị hỏng** do **hai request ghi chồng nhau dùng chung một tệp tạm `auth.json.tmp`**.

- Endpoint mà app gọi khi **Connect** (`POST /v1/peers/register`) và khi **đăng nhập** (`POST /v1/auth/email/*`)
  đều đọc `auth.json`; gặp JSON hỏng thì `AuthStore._load()` **ném lỗi** (cố ý — để không ghi đè rỗng làm mất
  dữ liệu khách) ⇒ route trả **HTTP 500 `{"error":"Internal error"}`**.
- Hỏng lúc **20:27:03 +07 (13:27:03Z)**; chủ dự án báo lúc **20:49:10 +07 (13:49:10Z)** — app dính 500 trong
  khoảng **22 phút** trước khi được báo.
- **Đã sửa**: (a) vá `AuthStore._save` ghi tệp tạm **duy nhất** + **xếp hàng ghi**; (b) restart `flowvpn-cp`;
  (c) `auth.json` hiện **hợp lệ** (25 user / 108 phiên / 1146 enrollment token giữ nguyên). Đã kiểm chứng lại
  25 lượt ghi đồng thời + email login thật ⇒ **202/201, không còn 500**.

## 2. Bằng chứng đo được (log thật trên node-2)

```text
# Ngay lúc hỏng — journalctl -u flowvpn-cp
Sep 29 20:27:03 fcnvps2 node[442824]: POST /v1/peers/register failed: Error: ENOENT: no such file or directory,
    rename '/root/flowvpn-cp/data/auth.json.tmp' -> '/root/flowvpn-cp/data/auth.json'
    at async AuthStore._save (file:///root/flowvpn-cp/src/auth-store.js:626:5)
Sep 29 20:27:03 fcnvps2 node[442824]: [auth-store] KHÔNG ĐỌC ĐƯỢC /root/flowvpn-cp/data/auth.json — DỪNG thay vì
    coi như rỗng (coi như rỗng sẽ khiến lần ghi kế tiếp XOÁ SẠCH dữ liệu).
    Lỗi: Unexpected non-whitespace character after JSON at position 419003 (line 10236 column 3)
Sep 29 20:27:03 fcnvps2 node[442824]: POST /v1/peers/register failed: SyntaxError: Unexpected non-whitespace
    character after JSON at position 419003 ... at async AuthStore._load (auth-store.js:610:33)
```

Đo trực tiếp file hỏng (trước khi sửa): `auth.json` = **419.255 byte**, 419.002 byte đầu là JSON hợp lệ,
**253 byte đuôi là rác** (một mảnh `renewalReminders` bị ghi lặp lại) — xem `ops/_scratch/inspect-auth-20260929.mjs`.

Đo endpoint lúc đang hỏng:

```text
$ curl -X POST http://127.0.0.1:7778/v1/auth/email/start -d '{"email":"..."}'
{"error":"Internal error"}          HTTP 500
```

## 3. Nguyên nhân gốc (đọc code, không phỏng đoán)

`/root/flowvpn-cp/src/auth-store.js` bản cũ:

```js
async _save(data) {
  await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  const tmp = `${this.filePath}.tmp`;          // ← MỘT tên tệp tạm DÙNG CHUNG cho mọi lần ghi
  await fs.writeFile(tmp, JSON.stringify(normalizeData(data), null, 2), "utf8");
  await fs.rename(tmp, this.filePath);
}
```

Hai request đồng thời (app bấm Connect nhiều lần / nhiều khách cùng lúc) cùng `writeFile` vào **một** đường dẫn:

1. nội dung hai lần ghi **trộn vào nhau** ⇒ `auth.json` thành **JSON không hợp lệ** (đúng dạng "JSON hợp lệ +
   đuôi rác" đã đo);
2. lần `rename` thứ hai **ném `ENOENT`** vì tệp tạm đã bị lần thứ nhất đổi tên đi.

Từ đó mọi request đọc `auth.json` đều 500, cho tới khi **một lần ghi đơn lẻ** vô tình ghi lại được file hợp lệ —
nên lỗi **chập chờn** (lúc 500, lúc lại qua), rất khó đoán nếu chỉ nhìn từ app.

## 4. Đã sửa gì

| # | Việc | Chi tiết |
|---|---|---|
| 1 | Vá gốc | `AuthStore._save` ghi ra tệp tạm **duy nhất** `${file}.${pid}.${uuid}.tmp` + **xếp hàng ghi** `_writeChain` cho từng kho ⇒ không bao giờ hai lần ghi chồng nhau. Lỗi giữa chừng thì dọn tệp tạm. |
| 2 | Backup | `src/auth-store.js.bak-20260929-500fix` (sha256 `1bf1210a…`) · `data/auth.json.bak-20260929-500fix` (sha256 `b4d2a2e2…`) |
| 3 | Nạp bản vá | `node --check` OK; `systemctl restart flowvpn-cp` (chạy lại lúc **21:26:38 +07**) |
| 4 | Kiểm tra dữ liệu | `auth.json` hợp lệ: **25 user, 108 phiên, 1146 enrollment token, 15 pending payment** — không mất dữ liệu khách |

File đã sửa: `auth-store.js` sha256 `683165d5…` (nguồn trong repo: `ops/_scratch/` chỉ chứa script đo; bản vá
nằm trên node-2 vì control-plane không có trong git của repo này).

## 5. Kiểm chứng sau khi sửa (đo thật)

```text
# a) Test cô lập: 60 lượt ghi đồng thời, chạy 3 vòng
BẢN CŨ  → crash ENOENT rename auth.json.tmp   (3/3 vòng)
BẢN VÁ  → VALID, không còn tệp .tmp sót        (3/3 vòng)
   cmd: node ops/_scratch/auth-race-test-20260929.mjs file:///tmp/auth-new.mjs /tmp/auth-new-test.json 60

# b) Trên production, 25 lượt POST /v1/tokens đồng thời
201 201 201 … (25/25)  →  auth.json VALID, 0 tệp .tmp, 0 lỗi "KHÔNG ĐỌC ĐƯỢC" trong log

# c) Đường app Android dùng
POST /v1/peers/register (token sai) → 401 (KHÔNG còn 500)
POST /v1/auth/email/start (email thật) → 202 {"ok":true} + log "[otp] sent … via resend"
GET  https://api.meetflowai.site/v1/health → 200 {"status":"ok"}
```

## 6. Còn tồn tại (nói rõ, không giấu)

Bản vá chặn **hỏng file / 500**, nhưng chưa chặn **mất cập nhật** (lost update): mỗi hàm vẫn là
`_load()` → sửa → `_save()`, nên khi nhiều request ghi **cùng lúc**, lần ghi sau đè lần trước.
Đo được: 25 lượt `POST /v1/tokens` đồng thời chỉ **2 token còn lại** trong file (23 token khác đã trả về
cho client nhưng bị đè). Hệ quả có thể gặp: mã OTP / join token của người này bị người khác ghi đè ⇒
khách phải xin lại mã (401), **không phải 500**.

Đề xuất bước tiếp theo (việc riêng): gói toàn bộ đọc–sửa–ghi của `AuthStore` vào **một mutex** (hoặc hàng đợi
giao dịch) — sửa khoảng 30 dòng, nhưng phải xử lý tái nhập (`sessionPayloadForToken` gọi `findSession`) nên
cần test kỹ. `plan-store.js:257` cũng đang dùng chung `${file}.tmp` — cùng loại lỗi, chưa gây sự cố vì ít ghi.

## 7. Lệnh tái lập / kiểm tra

```bash
# Trạng thái kho + endpoint
ssh root@165.101.114.162 'node -e "JSON.parse(require(\"fs\").readFileSync(\"/root/flowvpn-cp/data/auth.json\",\"utf8\"))"'
ssh root@165.101.114.162 'curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:7778/v1/tokens'
ssh root@165.101.114.162 'journalctl -u flowvpn-cp --since "2026-09-29 21:26:38" | grep -c "KHÔNG ĐỌC ĐƯỢC"'   # kỳ vọng 0

# Test ghi đồng thời (cô lập, không đụng dữ liệu thật)
node ops/_scratch/auth-race-test-20260929.mjs file:///root/flowvpn-cp/src/auth-store.js /tmp/t.json 60
```
