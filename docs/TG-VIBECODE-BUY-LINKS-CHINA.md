# Kiểm tra link trang buy từ Trung Quốc — TG-VIBECODE (bus #238)

> Người làm: harness **WIN** · ngày 2026-09-22 (giờ VN) · task sổ: `T-20260922-20`
> Yêu cầu (owner, Telegram): *"kiểm tra các link trang buy, đang có thể bị lỗi không access được từ Trung Quốc. Kiểm tra ngay và báo cáo lại ngay."*

## 1. Kết luận ngắn

| Hạng mục | Kết quả từ **Trung Quốc đại lục** | Kết quả từ VN/Mỹ |
|---|---|---|
| Trang **HTML** `/buy`, `/buy?lang=zh`, `/ai/buy`, `/ai/buy?lang=zh` | ✅ **200** | ✅ 200 |
| Ảnh/asset nhỏ (logo 81 KB) | ✅ 200 | ✅ 200 |
| APK **MeetFlow AI** (4.4 MB) | ✅ 200 | ✅ 200 |
| Bộ cài **Windows VPNFlow** (52.8 MB) | ❌ 0 byte / timeout | ✅ 206/200 |
| APK **VPNFlow Android** (96.5 MB) + legacy | ❌ 0 byte / timeout | ✅ 206 |
| Đường dự phòng **Funnel** (`fcnvpn.tail303be3.ts.net`) | HTML nhỏ ✅ 200, **file tải ❌ timeout** | ✅ 206 |

**Trả lời owner:** Trang buy **không** bị chặn khỏi Trung Quốc — mở được. Nhưng **link tải app/bộ cài trên trang buy thì không tải được từ Trung Quốc** (file lớn bị treo 0 byte). Đây là lỗi thật, ảnh hưởng đúng khách TQ: mở được trang, bấm tải thì không xuống được file.

## 2. Hạ tầng hiện tại (đo được)

- `meetflowai.site`, `api.meetflowai.site`, `t1.meetflowai.site` → **Cloudflare** (`104.21.83.112`, `172.67.175.138`), `server: cloudflare`, edge `cf-ray …-HKG`.
- `fcnvpn.tail303be3.ts.net` → Tailscale (`103.84.155.217`, `103.84.155.153`).
- Bộ cài Windows trên `/buy` dùng `https://meetflowai.site/dl/VPNFlow-Setup-1.4.4.exe?v=d9956056`
  (52 792 515 byte). APK dùng `https://t1.meetflowai.site/v1/downloads/android` (96 536 145 byte).
- Trang buy liệt kê 44 link; **mọi link HTML/asset đều 200**, chỉ 3 link tải file lớn là lỗi từ TQ.

## 3. Cách đo (để tái lập)

1. **Từ máy WIN** — `node ops/_scratch/probe-buy-links.mjs` và `probe-downloads.mjs`
   (curl của Windows hỏng schannel trong sandbox nên dùng `fetch` của Node).
   Range request 1 MB → `206` cho cả 4 file lớn, tốc độ ~600 KB/s ⇒ link **không** hỏng, chỉ là file lớn.
2. **Nhiều nơi trên thế giới** — `node ops/_scratch/check-buy-stability.mjs` (check-host.net): 7 node × 2 lượt
   cho `/buy` và `/ai/buy` = **14/14 → 200** (một lần 522 thoáng qua, không lặp lại).
3. **Từ Trung Quốc đại lục** — API trạng thái theo vùng `cn.apihz.cn` (`type=1` = nội địa):
   - **Đối chứng hợp lệ**: `baidu.com` → 200, `google.com` → timeout. Node này đúng là ở sau tường lửa TQ.
   - `/buy`, `/buy?lang=zh`, `/ai/buy`, `/ai/buy?lang=zh` → **200**.
   - logo 81 KB → 200; APK MeetFlow AI 4.4 MB → 200.
   - `VPNFlow-Setup-1.4.4.exe` (52.8 MB), `/v1/downloads/android` (96.5 MB), legacy → **0 byte / timeout 15 s**.
   - **Hiệu chuẩn**: `speed.cloudflare.com/__down?bytes=` 1 MB → 200, 10 MB → 200, **50 MB → 0 byte/timeout**
     từ node TQ; cùng file 50 MB từ node Mỹ → 200. ⇒ Ngưỡng nằm ở **đường TQ ↔ hạ tầng quốc tế**, không riêng site mình.
4. **Funnel** — `check-china-fallback.mjs` + `check-funnel-downloads.mjs`: `/` và `/buy` = 200 (2 lượt),
   nhưng `/v1/ai/downloads/android` (4.4 MB) và `/v1/downloads/android` (96 MB) = **0 byte/timeout** từ TQ.

## 4. Vì sao

- HTML nhỏ (vài chục KB) đi qua Cloudflare từ TQ **ổn**.
- Truyền **file lớn** từ hạ tầng quốc tế (Cloudflare free, Tailscale Funnel) vào TQ bị **treo/ngắt (0 byte)**.
  Đây là hành vi đã biết của GFW với luồng tải lớn/qua CDN, và cũng khớp với việc Cloudflare free bị bóp ở TQ.
- Vì thế khách TQ **mở được trang buy nhưng không tải được app** — đúng hiện tượng owner nghi.

## 5. Việc nên làm (khuyến nghị, cần owner quyết)

1. **Không phát file lớn cho khách TQ qua Cloudflare free / Tailscale Funnel.** Đưa bộ cài Windows + APK lên
   kênh vào được từ TQ (ví dụ object storage/CDN có endpoint trong TQ, hoặc origin HK/SG **không** proxy Cloudflare).
   Server đã có sẵn ô ghi đè: `android_apk_url`, `android_apk_url_legacy`, `windows_installer_url`, `ios_ipa_url`
   (`appConfig`) — chỉ cần trỏ sang link gương, **không phải build lại app**.
2. Thêm **link gương "中国镜像 / China mirror"** rõ ràng trên `/buy` và `/ai/buy` (và trong email/link cập nhật).
3. Giảm kích thước: APK 96.5 MB (split APK / bỏ tính năng không cần) và bộ cài Windows 52.8 MB (web-installer tải từng phần).
4. **Không** dựa vào Funnel làm đường tải cho TQ (đo ra không tải được file).
5. `gfw-watch.js` trong control plane chạy probe **từ server VN** nên chỉ phát hiện được lỗi phía mình,
   **không** phát hiện được chặn theo SNI phía TQ. Nếu muốn cảnh báo sớm, cần một điểm đo **đặt trong TQ**.
6. Ghi nhận thêm: có 1 lần node nước ngoài nhận `522/520` từ Cloudflare (origin không kịp trả lời), sau đó
   không lặp lại (14/14 = 200). Theo dõi thêm, chưa kết luận.

## 6. Bằng chứng

- Script đo: `ops/_scratch/probe-buy-links.mjs`, `extract-buy-links.mjs`, `probe-downloads.mjs`,
  `check-buy-stability.mjs`, `check-china-apihz.mjs`, `check-china-sizes.mjs`, `calibrate-china-api.mjs`,
  `check-china-fallback.mjs`, `check-funnel-downloads.mjs`.
- Link kiểm tra của check-host: `https://check-host.net/check-report/4cdbb023k3e1` (buy), `4cdbb202kfa7` (APK).
