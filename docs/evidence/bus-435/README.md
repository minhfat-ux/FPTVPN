# Bằng chứng nghiệm thu bus-435 (Mac, 26/09/2026) — KẾT QUẢ: FAIL

## Lỗi
Trên bản đang phát `https://t1.meetflowai.site/buy`, regex kiểm email phía client bị **mất backslash**:

- Live HTML: `if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(email))`
- Nguồn `control-plane/src/payments.js:2150` (origin/main): `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Nguyên nhân: regex nằm trong template literal của `buyPageHTML` ⇒ `\s` → `s`, `\.` → `.`.
- Hệ quả: email hợp lệ **có chữ "s"** (user@example.com, test@gmail.com, …) bị báo "Invalid email." và không hiện nút tải.

## Cách tái hiện
`node docs/evidence/bus-435/repro-cdp.mjs` (cần Chrome headless + DevTools; xem biến PORT trong script).
Với mỗi UA (iPhone / Android / macOS), script nhập `user@example.com` → "Invalid email.";
sau đó `john@gmail.com` (không có 's') → qua và hiện đúng bản của thiết bị.

## Ảnh
`<device>-1-gate.png` — bước email, chưa có nút tải.
`<device>-2-after-s-email.png` — `user@example.com` (hợp lệ) bị "Invalid email." (LỖI).
`<device>-3-after-no-s-email.png` — `john@gmail.com` qua, hiện đúng bản thiết bị.

## Ghi chú
- Các mục (1)-(5) của §5 handoff đều đạt; `node --test` có 3 fail ở `test/home-page.test.js` là **có sẵn** (baseline 59c46630 cũng y hệt), 6 test mới của bus-435 đều pass.
- Cổng test trong `scripts/server-agent/deploy-control-plane.sh` vì thế đang chặn mọi deploy src control-plane (nên có task riêng).
