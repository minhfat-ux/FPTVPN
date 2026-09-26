# HANDOFF → harness Windows: đổi UX trang `/buy` — BẮT BUỘC email trước, rồi mới cho tải theo thiết bị

- **Từ:** harness Mac (main agent) · **Cho:** **harness Windows** (owner `windows` của `control-plane/**`)
- **Ngày:** 26/09/2026 · **Chủ dự án chốt trong phiên:** (1) mức đăng ký = **chỉ cần email** (KHÔNG OTP,
  KHÔNG mật khẩu); (2) **chặn ở TRANG** — link tải trực tiếp `/v1/downloads/*` **giữ nguyên**;
  (3) **WIN làm** (Mac chỉ soạn brief, không sửa control-plane).
- **Vì sao:** hiện `/buy` cho tải TRƯỚC, email chỉ hỏi ở bước thanh toán ⇒ không thu được lead, không
  biết khách dùng thiết bị nào, và link tải bị quét/chia sẻ tự do. Chủ dự án muốn: **email trước → mới
  hiện bản tải đúng theo thiết bị**.

## 1. Luồng mong muốn (3 bước, một trang)

```
BƯỚC 1  [ Email của bạn ..................... ]  →  nút "Tiếp tục"
        - bắt buộc, kiểm định dạng email, hiện lỗi rõ ràng theo 3 ngôn ngữ
        - POST /v1/buy/lead { email, platform? }  → { ok, known }
        - CHƯA hiện bất kỳ nút tải nào ở bước này
BƯỚC 2  Nhận diện thiết bị (User-Agent) ⇒ hiện ĐÚNG bản của máy đó + hướng dẫn từng bước
        - iOS  → IPA ad-hoc + nút "Đăng ký thiết bị (UDID)" + hướng dẫn Safari/profile/Trust (đang có sẵn)
        - macOS→ .dmg
        - Android → APK modern (kèm "Fire TV / máy cũ" = legacy)
        - Windows → VPNFlow-Setup-*.exe
        - Không nhận ra ⇒ hiện danh sách chọn nền tảng (như hiện nay) — vẫn SAU bước email
BƯỚC 3  Thanh toán (giữ nguyên luồng hiện tại, chỉ khác: email đã điền sẵn và KHOÁ lại)
```

- Nếu email **đã có tài khoản** ⇒ `known=true`: đi thẳng bước 2 và ghi chú "tài khoản đã có — premium
  sẽ bật cho email này sau khi thanh toán".
- Nếu email **mới** ⇒ vẫn cho tải (không bắt trả tiền trước), nhưng đã ghi lead.

## 2. Việc cụ thể cho WIN

| # | Việc | Nơi |
|---|---|---|
| 2.1 | Thêm bước email ở đầu trang buy + ẩn toàn bộ khối tải cho tới khi email hợp lệ | `control-plane/src/payments.js` (khối `t.dlSub`/`platform` hiện có, ~2.221 dòng) |
| 2.2 | Nhận diện thiết bị bằng UA để chọn bản tải + giữ mục "nền tảng khác" cho trường hợp không nhận ra | `payments.js` (dùng lại dữ liệu `/v1/app-version` + `manifest.plist` đang có) |
| 2.3 | Endpoint mới `POST /v1/buy/lead` — validate email, **ghi lead**, trả `{ok, known}` | `control-plane/src/index.js` (cạnh các route `/v1/payments/*`) |
| 2.4 | Chặn spam rất nhẹ: ≤ 5 lead/phút/IP và ≤ 1 lead/giây/IP; từ chối domain rác nếu muốn | `index.js` |
| 2.5 | Khoá email ở bước thanh toán (điền sẵn từ bước 1) | `payments.js` |

**Chữ (i18n):** trang đang có đủ `vi` / `en-GB` / `zh-Hans` trong `payments.js` — thêm khoá mới cho cả 3
(không hard-code tiếng Việt). Câu đề xuất:
- vi: *"Nhập email để nhận bản cài đúng cho thiết bị của bạn"* · nút *"Tiếp tục"* · lỗi *"Email không hợp lệ."*
- en-GB: *"Enter your email to get the right build for this device"* · *"Continue"* · *"Invalid email."*
- zh-Hans: *"请输入邮箱以获取适合本设备的安装包"* · *"继续"* · *"邮箱格式不正确。"*

## 3. Lưu lead ở đâu

- File `control-plane/data/leads.json`, append-only, mỗi dòng:
  `{"at":"<ISO>","email":"<lowercase>","platform":"<ios|macos|android|windows|unknown>","ua":"<đã cắt 120 ký tự>","ip":"<hash sha256 12 ký tự>"}`
- **Không** ghi IP thô, không ghi token; email chỉ nằm trong file nội bộ này (không bao giờ nhét vào URL).
- Dedup: nếu email đã có trong `auth.json` (khách cũ) ⇒ `known=true` (vẫn ghi 1 dòng lead để đo phễu).

## 4. BẤT BIẾN — được phép/không được phép

- ✅ Được: đổi thứ tự hiển thị trong trang, thêm endpoint lead, khoá email ở bước thanh toán.
- ❌ **KHÔNG** chặn hay đổi `/v1/downloads/*`, `/install/ios/manifest.plist`, `/v1/app-version` —
  email đã gửi cho khách (26/09) trỏ thẳng `/install/ios` và `/v1/downloads/mac`, và app tự kiểm tra
  bản mới qua `/v1/app-version`. Chặn mấy đường này = khách đang dùng bị ảnh hưởng.
- ❌ **KHÔNG** đụng logic thanh toán (`/v1/payments/create`, webhook, `/v1/payments/status/*`).
- ❌ **KHÔNG** thêm OTP/mật khẩu (chủ dự án chốt chỉ cần email).
- ❌ **KHÔNG** gate `/install/*` ở giai đoạn này (khách vào từ email; giai đoạn 2 cân nhắc riêng).

## 5. Nghiệm thu (dán bằng chứng, không tóm tắt suông)

```bash
# 1) Trang CHƯA có email ⇒ KHÔNG được có nút tải
curl -s https://t1.meetflowai.site/buy | grep -c "downloads/ios\|downloads/mac\|VPNFlow-Setup"   # phải = 0
# 2) Lead hợp lệ ⇒ 200 + known
curl -s -X POST https://t1.meetflowai.site/v1/buy/lead -H 'content-type: application/json' \
  -d '{"email":"test-buy@example.com","platform":"macos"}'                                        # {"ok":true,...}
# 3) Lead sai định dạng ⇒ 4xx, KHÔNG ghi file
curl -s -o /dev/null -w '%{http_code}\n' -X POST .../v1/buy/lead -d '{"email":"khong-phai-email"}'
# 4) Đường tải trực tiếp KHÔNG đổi
curl -s -o /dev/null -w 'mac=%{http_code} ' https://t1.meetflowai.site/v1/downloads/mac
curl -s -o /dev/null -w 'ios=%{http_code} ' https://t1.meetflowai.site/v1/downloads/ios
curl -s -o /dev/null -w 'manifest=%{http_code}\n' https://t1.meetflowai.site/install/ios/manifest.plist
# 5) Test đơn vị + deploy
node --test control-plane/test/            # phải pass hết
bash scripts/server-agent/deploy-control-plane.sh --files payments.js,index.js
```

- Kèm **ảnh chụp 3 máy** (desktop / iPhone / Android): bước email hiện trước, sau khi nhập mới thấy bản
  đúng thiết bị.
- Ghi `control-plane/data/leads.json` mẫu 2-3 dòng (email giả) làm bằng chứng.

## 6. Quy trình

1. `flowvpn-coord claim --owner windows --area buy-ux --files control-plane/src/payments.js,control-plane/src/index.js --note "email gate truoc khi tai"` (board đang trống).
2. Sửa → test cục bộ → **commit trước, deploy sau** → chạy lại nghiệm thu §5 TRÊN BẢN ĐANG PHÁT.
3. Trả lời qua agent bus (`--to mac`) kèm commit + output nghiệm thu.
4. Rollback: `git revert` + deploy lại (`deploy-control-plane.sh` giữ backup `src-backup-*`).

## 7. Việc Mac đã làm sẵn (không cần WIN làm lại)

- Nhánh phát hành 26/09 đã xong: iOS 1.4.6/54 + macOS 1.4.6/21 đã phát, TestFlight build 54 đang
  `WAITING_FOR_BETA_REVIEW`, email khách đã gửi **riêng từng kênh** (macOS 21/21 · iOS 6/6).
- Luật mới: `docs/PUBLISHER_PROCESS.md` §0 luật 14 — “email gửi riêng từng nền tảng”.
