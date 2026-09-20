# R-005 — Kiến trúc cho hạ tầng mỏng: fBuddy làm được gì với 1 VPS ~1 GB RAM

| | |
|---|---|
| **Mã nghiên cứu** | R-005 |
| **Feature** | **F-005 — Kiến trúc hạ tầng tối thiểu (thin infra) cho fBuddy**, phục vụ F-001 (chi phí model), F-002/F-003 (phòng họp), F-004 (chọn model thích ứng) |
| **Câu hỏi nghiên cứu** | "Hạ tầng hiện tại còn mỏng (1 VPS, ~1 GB RAM, SQLite, 1 tiến trình Node). Kiến trúc nào để làm được phòng họp + bán theo phút mà **không phải mua hạ tầng mới ngay**, và khi nào thì buộc phải nâng?" |
| **Ngày khảo sát** | 20/09/2026 |
| **Người thực hiện** | Phiên nghiên cứu (Mac) |
| **Trạng thái** | Có kết luận + thang hạ tầng M0→M3; chờ quyết định |
| **Liên quan** | R-002, R-003 (phòng họp & bán theo phút), R-004 (chọn model); code: `deploy/fbuddy.service`, `docs/DEPLOY.md`, `server/src/db.js`, `server/src/topup.js`, `server/src/sepay.js` |

---

## 1. Kết luận (TL;DR)

1. **Nguyên tắc số 1: VPS chỉ làm "control plane + text".** Mọi thứ nặng (thu âm → STT → dịch → TTS) đẩy
   hết ra ngoài (Soniox lo cả ba). VPS giữ: đăng nhập, credit, đăng ký phiên, đếm phút, gọi LLM sinh MoM,
   phát SSE. `[ĐỀ XUẤT]`
2. **Không cần mua VPS mới để chạy pilot.** Phần "media proxy" (nếu buộc phải có) đặt trên
   **Cloudflare Workers + Durable Object**: free plan đã có DO (backend SQLite), **1 triệu request/tháng**,
   **13.000 GB-s/ngày**. Với 4 phiên đồng thời, 100 giờ họp/tháng ≈ **46.000 GB-s và ~180.000 request**
   ⇒ **vẫn nằm trong hạn mức miễn phí**. `[ĐÃ KIỂM]` (bảng giá DO, 20/09/2026) `[ƯỚC TÍNH]` (quy đổi)
3. **Tốt nhất là không proxy gì cả**: nếu Soniox cho phép nối **trực tiếp từ trình duyệt bằng key tạm** thì
   VPS không tốn một byte băng thông audio nào ⇒ kiến trúc mỏng nhất có thể. `[CẦN SPIKE]`
4. **Dữ liệu lớn để ở R2**: free **10 GB-month**, egress **miễn phí**, sau đó **$0,015/GB-tháng**. Transcript
   vài chục KB/giờ nên **thường không bao giờ chạm trần**; chỉ audio mới đáng lo (11 MB/giờ nếu Opus). `[ĐÃ KIỂM]`
5. **RAM là tài nguyên khan hiếm nhất, không phải CPU.** node-2 có **961 MB RAM**, unit fBuddy bị chặn
   `MemoryMax=600M`. Vì vậy: **không giữ transcript trong RAM**, ghi xuống SQLite theo dòng, **giới hạn số
   phiên đồng thời** (khuyến nghị 5), và **không tự host model nào**. `[ĐÃ KIỂM]` (docs/DEPLOY.md, unit file)
6. **Không cần Redis/Postgres ở giai đoạn này.** Hàng đợi nhẹ chạy trong tiến trình; chỉ mua/kéo Redis khi có
   nhiều tiến trình hoặc nhiều máy (Upstash free: **256 MB dữ liệu, 500K lệnh/tháng**). `[ĐÃ KIỂM]`
7. **Tự host GPU để chạy STT là bước nhảy hạ tầng lớn nhất và không nên làm bây giờ**: RTX 4090 thuê
   ~$0,34–0,69/giờ ⇒ ~250–500 USD/tháng nếu chạy liên tục, cộng thêm ops. Với giá Soniox $0,18/giờ thì
   **phải vượt hàng nghìn giờ họp/tháng mới hoàn vốn**. `[ĐÃ KIỂM]` (RunPod) `[ƯỚC TÍNH]`
8. **Chi phí biến đổi thật của pilot:** Soniox ~$0,18/giờ họp ⇒ **100 giờ họp/tháng ≈ 18 USD**, phần hạ tầng
   phụ trợ **≈ 0 USD** (nằm trong free tier). Bán 250–400đ/phút thì biên rất rộng. `[ƯỚC TÍNH]`

---

## 2. Hiện trạng hạ tầng (số đã kiểm) `[ĐÃ KIỂM]`

| Hạng mục | Hiện tại | Nguồn |
|---|---|---|
| Máy chủ | **node-2** (`fcnvps2`), `165.101.114.162`, Caddy làm TLS | `docs/DEPLOY.md` |
| RAM | **961 MB tổng**; unit fBuddy giới hạn **`MemoryMax=600M`** | `docs/DEPLOY.md` §0, `deploy/fbuddy.service` |
| Ổ đĩa | **~12 GB trống / 20 GB** | `docs/DEPLOY.md` §0 |
| Node | v24.19.0 (≥ 22.5 yêu cầu) | `docs/DEPLOY.md` §0 |
| Cùng máy còn chạy | Caddy (80/443), `flowvpn-cp` (7778), harness (3080), `api.meetflowai.site`, `meetflowai.site`, `fbuddy` (7790) | `docs/DEPLOY.md`, `docs/HANDOVER.md` |
| Dữ liệu | SQLite (`node:sqlite`) tại `/var/lib/fbuddy`; tệp/artifact ngoài webroot | `README.md`, `docs/ARCHITECTURE.md` |
| Bí mật | API key provider/MCP mã hoá **AES-256-GCM** bằng `FBUDDY_SECRET` | `README.md` |
| Triển khai | systemd `fbuddy` + script `deploy/deploy.ps1`, `ops/*` | `docs/DEPLOY.md` |
| Thanh toán | VietQR + SePay (webhook HMAC / poll) + duyệt Telegram | `server/src/topup.js`, `server/src/sepay.js` |

**Hệ quả thiết kế:** không GPU · không Redis · không Postgres · 1 tiến trình Node · RAM chặt · đĩa vừa phải ·
một máy là **single point of failure** cho mọi sản phẩm FlowTech.

---

## 3. Ba mặt phẳng kiến trúc

```
┌─ CONTROL PLANE (VPS node-2) ────────────────────────────────────────────┐
│ đăng nhập · credit ledger · đăng ký/kết thúc phiên · đếm phút · MoM · SSE │
└────────────────────────────────────────────────────────────────────────┘
        ▲ text, vài KB/phút                    ▲ text (MoM, transcript)
        │                                      │
┌─ MEDIA PLANE ────────────────────────┐  ┌─ DATA PLANE ────────────────┐
│ audio: trình duyệt ⇄ Soniox          │  │ SQLite: transcript + MoM    │
│ (trực tiếp nếu có key tạm, hoặc      │  │ R2: audio/ghi âm dài hạn    │
│  qua Cloudflare Worker + DO)         │  │ (10 GB free, egress free)   │
└──────────────────────────────────────┘  └─────────────────────────────┘
```

**Nguyên tắc:** control plane chịu trách nhiệm **tiền và trạng thái**; media plane chịu **băng thông**;
data plane chịu **dung lượng**. Ba thứ này nâng cấp độc lập — đó là điều giúp hạ tầng mỏng vẫn mở rộng được.

---

## 4. Đặt "media proxy" ở đâu — ba lựa chọn, xếp theo mức tốt cho hạ tầng mỏng

| Phương án | Tải lên VPS | Chi phí | Đánh giá |
|---|---|---|---|
| **(a) Trình duyệt nối thẳng Soniox bằng key tạm** | **0 byte audio**, chỉ text | $0 | **Tốt nhất.** Phụ thuộc Soniox có hỗ trợ key tạm/giới hạn ⇒ `[CẦN SPIKE]` |
| **(b) Cloudflare Worker + Durable Object làm proxy WS** | 0 byte audio (đi qua Cloudflare) | Free plan: **1M request/tháng**, **13.000 GB-s/ngày**; vượt: **$0,15/triệu request**, **$12,50/triệu GB-s** | **Khuyến nghị nếu (a) không được.** DO có **WebSocket Hibernation API** để không bị tính thời gian khi rảnh; tính dựa trên **128 MB/DO** |
| **(c) Proxy ngay trên VPS node-2** | **~115 MB/giờ/phiên** (PCM 16 kHz mono) cho mỗi chiều | $0 (nhưng chung máy) | Không nên: ăn băng thông và chung số phận với 600 MB RAM của app |

**Ước tính chi phí cho (b) ở quy mô pilot (đã kiểm hạn mức, tự quy đổi):**

| Quy mô | GB-s/tháng | Request/tháng | Kết luận |
|---|---|---|---|
| 4 phiên đồng thời × 100 giờ họp/tháng | ~46.000 GB-s | ~180.000 | **Nằm trong free tier** (400.000 GB-s/tháng, 1M request/tháng) |
| 20 phiên đồng thời × 500 giờ/tháng | ~230.000 GB-s | ~900.000 | Vẫn còn trong free tier |
| 50 phiên đồng thời × 2.000 giờ/tháng | ~920.000 GB-s | ~3,6M | Vượt free ⇒ ~$10–12/tháng |

*(Cách tính: DO tính 128 MB ⇒ 0,128 GB × 3.600 s = **460 GB-s mỗi giờ phiên**; WS message vào được tính theo
tỷ lệ **20:1** ⇒ 10 khung/giây ≈ 1.800 request/giờ phiên.)* `[ƯỚC TÍNH]` từ bảng giá `[ĐÃ KIỂM]`

---

## 5. RAM: chỗ dễ chết nhất, và cách phòng

| Việc | Quy tắc |
|---|---|
| Transcript | **Không giữ trong RAM.** Ghi xuống SQLite theo từng dòng/cụm (WAL), UI đọc lại khi cần |
| Buffer audio | **Không giữ ở server** (proxy chỉ chuyển tiếp). Nếu buộc lưu, ghi tạm ra đĩa rồi xoá |
| Số phiên đồng thời | **Chốt trần cứng** (khuyến nghị **5** ở M0) và trả lời rõ "phòng đang bận" khi vượt |
| MoM | Sinh **sau khi kết thúc** phiên (hoặc cuộn theo từng đoạn), không nạp cả transcript vào một lần |
| Tiến trình | Một tiến trình Node; mọi việc dài (phiên họp 1 giờ) là **I/O chờ**, không phải CPU |
| Giới hạn phòng vệ | Giữ `MemoryMax=600M`; thêm cảnh báo khi RSS > 400 MB; log có timestamp để biết phiên nào gây tăng RAM |

---

## 6. Data plane: SQLite trước, R2 sau `[ĐÃ KIỂM]`

| Dữ liệu | Khối lượng | Nơi lưu |
|---|---|---|
| Transcript (text) | vài chục KB/giờ họp | SQLite (`/var/lib/fbuddy`), bảng riêng cho phiên + đoạn |
| MoM + artifact | vài chục KB | SQLite + endpoint tải hiện có |
| Audio gốc | **~11 MB/giờ** (Opus) hoặc 115 MB/giờ (PCM) | **R2** (free 10 GB, egress free, $0,015/GB-tháng) — **chỉ lưu nếu thật cần**, kèm chính sách xoá 7/30/90 ngày |
| Bản sao lưu | bằng dung lượng DB | R2 hoặc máy Mac/WIN (script `ops/*`) |

R2 an toàn hơn việc nhồi audio vào đĩa 20 GB của VPS — nhất là khi VPS còn chạy 4 sản phẩm khác.

---

## 7. Control plane: dùng lại tối đa cái đã có `[ĐÃ KIỂM]`

| Nhu cầu | Đã có |
|---|---|
| Trừ tiền theo phút, giải thích được | `credit_ledger` append-only + `spendCredits()` (`server/src/credits.js`) |
| Bán gói phút | `topupPackages()` + `vndPerCredit` (`server/src/topup.js`, `settings`) |
| Thu tiền tự động | `server/src/sepay.js` (webhook HMAC hoặc poll) — idempotent, không cộng hai lần |
| Duyệt tay | thông báo Telegram + link ký HMAC (đã dùng cho "Xin thêm token") |
| Hàng đợi | **không cần Redis**: hàng đợi trong tiến trình là đủ cho vài phiên; chỉ khi tách worker/máy mới cần (Upstash free 256 MB/500K lệnh/tháng) |
| Giám sát lỗi | hiện có log journald + báo Telegram; thêm uptime monitoring free là đủ giai đoạn đầu |

---

## 8. Vận hành & chịu lỗi (phần thường bị bỏ qua)

| Rủi ro | Cách xử lý đề xuất |
|---|---|
| **Tiến trình Node restart giữa phiên họp** | Ghi transcript **dần** xuống SQLite; khi restart, phiên đánh dấu `interrupted`, cho resume hoặc sinh MoM từ phần đã có. **Không** để mất cả cuộc họp |
| Hết RAM (OOM kill) | trần phiên đồng thời + cảnh báo RSS + không giữ buffer |
| Đầy đĩa (chỉ còn ~12 GB) | audio không nằm trên VPS; log journald giới hạn dung lượng; cron dọn tệp tạm |
| WebSocket/SSE bị Caddy cắt | cấu hình timeout dài cho đường `/api/meeting/*`, heartbeat 15–30 giây |
| Provider chết (Soniox/LLM) | thông báo rõ cho người dùng + **không trừ tiền cho phút lỗi** (hoàn credit có ghi lý do) |
| Một máy là điểm chết duy nhất | chấp nhận ở M0; khi doanh thu theo phút có thật thì tách realtime sang VPS riêng (M2) |
| Bí mật | giữ nguyên cơ chế AES-256-GCM; **không** đưa key Soniox vào client nếu chưa có key tạm có giới hạn |
| Sao lưu | `sqlite3 .backup` định kỳ → R2 (hoặc máy nhà); thử phục hồi 1 lần/quý |

---

## 9. Thang hạ tầng M0 → M3 (kèm ngưỡng nâng cấp và giá)

| Mức | Nội dung | Chi phí thêm/tháng | **Nâng khi nào** (trigger) |
|---|---|---|---|
| **M0 — hiện tại** | 1 VPS node-2, SQLite, Soniox gọi trực tiếp hoặc proxy qua Cloudflare free, R2 free | **0 USD** | ≤ 5 phiên đồng thời · ≤ vài chục người dùng thật · ≤ ~200 giờ họp/tháng |
| **M1** | + Cloudflare Worker/DO (proxy WS) + R2 lưu audio + uptime monitoring | **0–5 USD** (đa số nằm trong free tier; Workers Paid **$5/tháng** nếu cần vượt) | > 5 phiên đồng thời thường xuyên · cần lưu audio gốc · cần uptime alert |
| **M2** | + **VPS riêng cho realtime** (Contabo Cloud VPS 4: **€5,50/tháng**, 4 vCPU `[ĐÃ KIỂM]`; Hetzner tương đương `[CHƯA KIỂM]`) + Upstash trả phí nếu cần | **~10–20 USD** | > 50 phiên đồng thời/tháng · RAM VPS chính > 400 MB thường xuyên · cần tách worker khỏi web |
| **M3** | + GPU thuê (chỉ khi tự host STT/diarization) | **250–500 USD** (RTX 4090 ~$0,34–0,69/giờ chạy 24/7) | Chỉ khi chi phí Soniox vượt hẳn chi phí GPU **và** có người trực ops |

**Khuyến nghị:** ở lại **M0/M1** cho tới khi doanh thu theo phút chứng minh được nhu cầu. Việc nâng cấp nên
được **kích hoạt bằng số đo** (RAM, phiên đồng thời, giờ họp/tháng), không bằng cảm giác.

---

## 10. Chi phí thật của một pilot (100 giờ họp/tháng) `[ƯỚC TÍNH]`

| Khoản | Số tiền/tháng |
|---|---|
| Soniox (STT + dịch realtime, $0,18/giờ) | **~18 USD** |
| LLM sinh MoM (gemini-2.5-flash, ~$0,015/giờ họp) | ~1,5 USD |
| Hạ tầng phụ trợ (VPS hiện có, DO free, R2 free, monitoring free) | **0 USD** |
| **Tổng** | **~20 USD cho 100 giờ họp** |
| Doanh thu nếu bán 250đ/phút (= 15.000đ/giờ = ~0,59 USD/giờ) | **~59 USD** |
| Doanh thu nếu bán 400đ/phút | **~94 USD** |

⇒ Ở quy mô pilot, **chi phí hạ tầng gần như bằng 0** và chi phí biến đổi chủ yếu là Soniox. Nút thắt không
phải tiền hạ tầng mà là **chất lượng tiếng Việt** (R-002 phụ lục A) và **đo phút chính xác** (R-003 §3).

---

## 11. Việc cần đo/spike trước khi chốt kiến trúc `[CẦN SPIKE]`

| # | Câu hỏi | Cách đo | Ảnh hưởng |
|---|---|---|---|
| 1 | Soniox có cấp **key tạm** cho client không? | hỏi tài liệu/console Soniox | Quyết định có cần media proxy hay không (§4a) |
| 2 | Cloudflare Worker/DO làm proxy WS tới Soniox có ổn định không (không timeout, độ trễ cộng thêm bao nhiêu)? | dựng 1 DO thử, đo 3 phiên 30 phút | Quyết định M0 dùng DO hay phải lên VPS riêng |
| 3 | **RSS thật** của fBuddy khi có 3–5 phiên đồng thời (dưới trần 600 MB) | chạy tải giả, đọc `systemd-cgtop` | Chốt trần phiên đồng thời |
| 4 | Băng thông & độ trễ từ VN tới edge của Soniox/Cloudflare | đo từ VPS và từ mạng VN | Trải nghiệm caption |
| 5 | Định dạng audio Soniox nhận (PCM/Opus/mulaw) và hệ số nén | đọc tài liệu Soniox | 115 MB/giờ hay 11 MB/giờ mỗi phiên |
| 6 | Chi phí DO thật khi 100 giờ họp/tháng | bật billing alert, xem bảng usage | Xác nhận "pilot nằm trong free tier" |

---

## 12. Kết luận & đề xuất

1. **Không mua hạ tầng mới ở giai đoạn này.** Với kiến trúc đúng (control plane trên VPS + media plane trên
   Cloudflare/browser + data plane trên SQLite/R2), pilot 100 giờ họp/tháng **không phát sinh chi phí hạ tầng**.
2. **Ưu tiên tuyệt đối cho "không proxy"**: nếu Soniox cho nối trực tiếp bằng key tạm thì bỏ hẳn được tầng
   media — đây là câu hỏi rẻ nhất và có ảnh hưởng lớn nhất, nên hỏi trước khi viết dòng code nào.
3. **RAM mới là ràng buộc, không phải CPU**: trần phiên đồng thời, ghi dần xuống SQLite, không giữ audio.
4. **Đặt ngưỡng nâng cấp bằng số** (M1 khi >5 phiên đồng thời, M2 khi >50 phiên/tháng hoặc RAM >400 MB,
   M3 chỉ khi vượt hẳn chi phí Soniox) và **đo trước khi nâng**.
5. **Đừng tự host model/STT**: ở quy mô này, thuê ngoài rẻ hơn và không cần ops; GPU chỉ có nghĩa khi đã có
   hàng nghìn giờ họp/tháng.
