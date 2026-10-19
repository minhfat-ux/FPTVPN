# Đồng bộ REPO ↔ LIVE (control-plane) — 08/10/2026

- **Người làm:** DSH main agent (owner `windows`).
- **Yêu cầu của chủ dự án:** *"2 => đồng bộ luôn đi"* (sau khi em báo LIVE và repo đã lệch nhau, làm cổng test của script deploy không còn tác dụng).
- **Trạng thái:** ✅ **ĐÃ ĐỒNG BỘ + SUITE 448/448 PASS + ĐÃ DEPLOY** (LIVE == repo cho `control-plane/src`).
- Commit: `5c8a6b4` (đồng bộ mã + sửa test), `84728ad` (bản vá nhắc gia hạn trước đó).

## 1. Vì sao phải đồng bộ — và theo hướng nào

Đo bằng sha256 từng file (`control-plane/src/*.js` ↔ `/root/flowvpn-cp/src/*.js`):

| Loại | File |
|---|---|
| **Chỉ có ở LIVE** (chưa từng vào repo) | `license-keys.js` (+315 dòng), `device-machines.js` (+62) |
| **Khác nội dung** (LIVE mới hơn) | `admin-page.js` (+236), `index.js` (+123), `tg-commands.js` (−47), `payments.js` (+18), `device-replace.js` (+32), `device-store.js`, `home-page.js` |

⚠️ **Chiều đồng bộ phải là LIVE → REPO**, không phải REPO → LIVE: nếu đẩy thẳng bản repo lên LIVE thì
**mất** 2 file mới + toàn bộ phần đã tiến hoá ở trên (cổng bước 0 của `deploy-control-plane.sh` chỉ chặn
được ca *thiếu file*, không chặn được ca *file cũ ghi đè file mới*). Sau khi kéo LIVE về repo thì
REPO → LIVE trở thành **no-op** và từ đó mới an toàn để deploy tiếp.

## 2. Việc đã làm

1. **Kéo 9 file từ LIVE về repo** (`scp` + chuẩn hoá LF), commit `5c8a6b4` — giữ nguyên mọi tính năng
   đang chạy (license keys, device machines, tab `aikeys`, trang chủ FlowTech, bỏ tính năng /wakeup…).
2. **Sửa 6 test cho khớp hành vi THẬT** của bản đang chạy (không nới lỏng để "cho pass"):
   | Test | Vì sao hỏng | Cách sửa |
   |---|---|---|
   | `home-page.test.js` (b) | test cũ đòi badge của **bảng giá** được escape, nhưng bảng giá đã bị bỏ khỏi landing page | vẫn là cổng chống XSS nhưng dùng trường CÓ render (`reviews.name/text`, `supportEmail`) + khẳng định dữ liệu gói **không lọt** ra landing page |
   | `home-page.test.js` (d) | `#pricing` không còn tồn tại | khẳng định không còn `#pricing`; thẻ sản phẩm trỏ đúng `/buy` + `/ai/buy` |
   | `home-page.test.js` (i) | test cũ đòi link `?plan=` trong bảng giá | khẳng định `buyUrl`/`aiBuyUrl` được tôn trọng ở thẻ sản phẩm + CTA |
   | `admin-tabs.test.js` | LIVE có thêm tab `aikeys` (khu `ai`) | thêm `aikeys` vào danh sách tab cũ |
   | `mmdb.test.js` | `2606:4700:4700::1111` là IP **anycast** của Cloudflare, mmdb trả `CA` chứ không phải `US` | chốt "có mã quốc gia 2 ký tự" thay vì 1 nước cụ thể |
   | `tg-commands.test.js` | LIVE đã **gỡ** tính năng `describeMacAlive`/`isMacAlive`/`MAC_ALIVE_STALE_MS` + lệnh `/wakeup` (`grep -c wakeup` = 0) | xoá các test tương ứng, giữ ghi chú lý do trong file (đừng khôi phục test khi chưa khôi phục tính năng) |
3. **Chạy lại cổng:** `node --test test/*.test.js` trên node-2 (Linux, src+test đồng bộ) → **tests 448 / pass 448 / fail 0**
   (trước khi sửa test: 408 test / 402 pass / 6 fail).
4. **Deploy lại bằng script có cổng đầy đủ** (kèm bản vá thư "đã hết hạn"): stage = LIVE + 2 file vá,
   `node_modules` symlink, test trong stage = **toàn bộ test repo** ⇒ cổng test giờ **có tác dụng thật**:
   ```
   file thay đổi (2): auth-store.js mailer.js
   chạy test suite trong workspace -> tests 448 / pass 448 / fail 0
   backup: /root/flowvpn-cp/src-backup-20261008-113419
   health OK — deploy xong
   ```

## 3. Việc còn lại (khuyến nghị)

1. **Giữ kỷ luật chiều dữ liệu:** mọi thay đổi trên LIVE phải được kéo về repo **trong cùng ngày**; nếu
   không, lần deploy sau sẽ lặp lại tình trạng này (và lần tới có thể mất tính năng nếu ai đó đẩy thẳng).
2. `deploy-control-plane.sh` hiện **chỉ chặn file thiếu**, chưa chặn file cũ ghi đè file mới. Đề xuất
   thêm cổng: so sha256 từng file LIVE ↔ repo và **từ chối** nếu file LIVE không có trong repo
   (hoặc cảnh báo to) — em có thể làm khi chủ dự án đồng ý.
3. Thư mục `/root/flowvpn-agent/control-plane` (WS của agent trên server) **thiếu `license-keys.js`** và
   `cp -a` vào `home-page.js` báo `Operation not permitted` (thuộc tính file/ACL) — cần dọn một lần
   để deploy mặc định (không cần stage) chạy được.
