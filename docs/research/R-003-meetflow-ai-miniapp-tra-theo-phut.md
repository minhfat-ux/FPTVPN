### 0.1 Bổ sung sau lượt khảo sát thứ hai (bản đặc tả trình duyệt + pháp lý EU + móvil)

| Điểm | Nội dung | Trạng thái |
|---|---|---|
| **Đường "không cài gì" hẹp hơn nữa** | `getDisplayMedia({audio:true})` **chỉ Chromium (Chrome/Edge)** mới có tiếng; **Firefox và Safari không trả audio** cho chia sẻ màn hình. Trên **macOS/Linux, Chrome chỉ chia sẻ được tiếng của TAB**, không có tiếng hệ thống (chỉ Windows + ChromeOS mới có) ⇒ "chia sẻ cả màn hình" trên Mac **không có tiếng họp**. Thêm nữa `systemAudio` chỉ là *gợi ý*, trình duyệt có thể bỏ qua: MDN ghi rõ "the returned stream might contain no audio track even when audio is true" | `[ĐÃ KIỂM]` MDN `getDisplayMedia` (đọc 20/09/2026); chi tiết Firefox/Safari ở R-002 phụ lục E |
| **Mobile đóng về mặt kỹ thuật, không chỉ chính sách** | Android `AudioPlaybackCapture` chỉ bắt được `USAGE_UNKNOWN/GAME/MEDIA`; **`USAGE_VOICE_COMMUNICATION` không bắt được** ⇒ không lấy được tiếng cuộc gọi VoIP. iOS cũng không (ReplayKit là quay màn hình và **bị deprecate ở iOS 27**) | `[ĐÃ KIỂM]` (R-002 phụ lục D/E) — **không làm đường mobile** |
| **Luật AI của EU** | **Điều 50 AI Act có hiệu lực từ 02/08/2026** ("Comes into force 2 August 2026, according to Article 113"): đầu ra văn bản/âm thanh do AI tạo **phải được đánh dấu ở dạng máy đọc được**; miễn trừ chỉ cho trường hợp "không làm thay đổi đáng kể dữ liệu đầu vào" ⇒ **biên bản trích xuất (extractive)** có thể được miễn, **biên bản do AI viết lại (generative)** thì không; **giọng dịch tổng hợp có thể bị coi là "deep fake"** và phải công bố | `[ĐÃ KIỂM]` artificialintelligenceact.eu/Article 50 (đọc 20/09/2026). Recital 57 (AI giám sát nhân viên = rủi ro cao) em `[CHƯA KIỂM]` |
| **Mức phạt VN + ngưỡng "dữ liệu quan trọng"** | Ngoài khung phạt đã nêu: Luật Dữ liệu có ngưỡng riêng — **"dữ liệu quan trọng" khi 100.000+ công dân (cơ bản) hoặc 10.000+ (nhạy cảm)** ⇒ nếu dùng **sinh trắc học giọng nói** thì chỉ **10.000 người dùng** đã thành "dữ liệu quan trọng", và **mất ưu đãi ân hạn cho startup** | `[CHƯA KIỂM]` (từ R-002 phụ lục C/D; chưa đọc được văn bản luật gốc — **cần luật sư xác nhận**) |
| **Bot chậm hơn tưởng** | Transcript realtime của bot ~**1–3 giây**, **chậm hơn** STT streaming trực tiếp (200–500 ms); bot còn **bị tính tiền trong lúc chờ được duyệt vào phòng**, và webhook realtime **xử lý tuần tự** (một handler chậm là chặn cả dòng transcript) | `[ĐÃ KIỂM]` (R-002 phụ lục A/C) |
| **Diarization có số thật** | pyannote `community-1`: **DER ~17% (AMI headset), 19,9% (một mic từ xa), 20,2% (DIHARD-3)** ⇒ ~1/5 lượt gán sai người là trần thực tế của diarization tự host miễn phí. Chỉ tier trả tiền `pyannoteAI Live-1` mới streaming (<300 ms, ≤8 người nói) | `[ĐÃ KIỂM]` (R-002 phụ lục A/C) |

## 0. ĐÍNH CHÍNH & BỔ SUNG (sau lượt khảo sát độc lập — xem R-002 phụ lục A / C / D)

| Điểm trong tài liệu | Đính chính | Trạng thái |
|---|---|---|
| §7.3 viện dẫn **Nghị định 13/2023/NĐ-CP** | **ĐÃ HẾT HIỆU LỰC.** Từ **01/01/2026** khung pháp lý là **Luật BV dữ liệu cá nhân 91/2025/QH15** (thay thế NĐ 13/2023) + **Nghị định 356/2025/NĐ-CP** hướng dẫn. Dữ liệu **sinh trắc học** (gồm **giọng nói dùng để nhận diện**) là **dữ liệu cá nhân nhạy cảm**. Phạt: tới **5% doanh thu năm trước** (chuyển dữ liệu xuyên biên giới), **3 tỷ đồng** (vi phạm khác) | `[ĐÃ KIỂM]` Chambers *Investing in Vietnam 2026* §11.3 + `vanban.chinhphu.vn` (NĐ 356/2025) |
| **§4.1 phương án A** ("Phòng họp web trong fBuddy, engine Soniox") | **Phải thu hẹp phạm vi:** trang web **không bắt được âm thanh của app desktop** (Zoom/Teams bản cài) — chỉ bắt được **tab trình duyệt** (họp diễn ra trên web) hoặc **mic/âm thanh phòng**. `getDisplayMedia` cũng **buộc người dùng thao tác lại mỗi phiên** và **không chạy trên mobile**. ⇒ Nếu khách họp bằng app cài sẵn, phương án A một mình là **không đủ** — phải có overlay desktop (chính là lý do MeetFlow AI có bản Windows overlay) hoặc bot | `[ĐÃ KIỂM]` MDN + R-002 phụ lục D |
| §5.1 chi phí | Số "dịch hai chiều ~$0,06/giờ `[ƯỚC TÍNH]`" nay **đã kiểm được**: Soniox **dịch giọng nói realtime $0,18/giờ** ⇒ tổng ~**$0,18/giờ ≈ 77đ/phút** như đã ước. Giá tham chiếu thêm: Deepgram Nova-3 `vi` $0,288 promo, Speechmatics RT $0,24 (VN + diarization), ElevenLabs Scribe v2 Realtime $0,39, Gladia $0,75, Azure STT $1,00, OpenAI Realtime-Translate $2,04 | `[ĐÃ KIỂM]` R-002 phụ lục A |
| §4 — bot vào họp | **Zoom đổi luật từ 02/03/2026**: bot vào họp ngoài tổ chức cần **OBF/ZAK** hoặc **RTMS**; **ghi âm dừng khi người cấp quyền rời họp** ⇒ đường bot có thêm rủi ro vận hành | `[ĐÃ KIỂM]` R-002 phụ lục A |
| §6.3 "fBuddy nắm ngữ cảnh" (đặt tên người nói) | Chỉ **bot** mới có **tên người thật**; mọi đường khác chỉ có `SPEAKER_xx` ⇒ cần lớp đặt tên thủ công/khớp danh sách người dự. **Hoãn** nhận diện bằng giọng nói (là dữ liệu nhạy cảm theo luật mới) | `[ĐÃ KIỂM]` R-002 phụ lục A |

**Ghi chú về tên gọi:** tài liệu này nghiên cứu **tự xây pipeline**; nếu chọn **dùng lại engine/app MeetFlow AI**
thì xem **R-003** (F-003) — trong đó có phát hiện engine thực tế là **Soniox**, kèm thiết kế bán **theo phút**.

---

# R-003 — Dùng lại MeetFlow AI làm miniApp trong fBuddy, người dùng trả tiền theo số phút

| | |
|---|---|
| **Mã nghiên cứu** | R-003 |
| **Feature** | **F-003 — MiniApp "Phòng họp" trong fBuddy dùng lại engine/app MeetFlow AI; thu tiền consumer theo phút sử dụng** |
| **Câu hỏi nghiên cứu** | "Nhúng MeetFlow AI vào fBuddy như một miniApp và bán theo phút được không? Cần hạ tầng gì, giá nào thì có lãi, vướng gì?" |
| **Ngày khảo sát** | 20/09/2026 (giờ máy Mac) |
| **Người thực hiện** | Phiên nghiên cứu (Mac) |
| **Trạng thái** | Có kết luận + 3 phương án + đề xuất giá; chờ quyết định |
| **Liên quan trong repo** | `server/src/credits.js`, `server/src/topup.js`, `server/src/sepay.js`, `server/src/settings.js`, `web/src/App.tsx`, `web/src/components/Sidebar.tsx`; nghiên cứu liên quan: **R-002** (tự làm engine), **R-001** (chi phí model) |

> Khác với R-002 (tự xây pipeline STT/dịch/MoM), tài liệu này giả định **dùng lại MeetFlow AI** —
> sản phẩm cùng công ty — làm miniApp, và bán **theo phút**.

---

## 1. Kết luận (TL;DR)

1. **MeetFlow AI hiện KHÔNG có bản web.** Nó là bộ app native: iOS (App Store `id6765590042`), macOS,
   Android (APK), Windows (overlay). Các hostname `app./web./ai./meet.meetflowai.site` **không tồn tại**
   ⇒ **không thể iframe** MeetFlow AI vào fBuddy hôm nay. `[ĐÃ KIỂM]`
2. **Nhưng engine thì dùng lại được, và rất rẻ.** Giải mã `MeetFlowAI.Win.dll` trong gói overlay Windows
   cho thấy app chạy **Soniox** (chuỗi `Connecting to Soniox...`, `SonioxApiKey is missing in the secure
   application configuration.`, và nguyên mẫu cấu hình realtime có `enable_speaker_diarization`,
   `enable_endpoint_detection`, `endpoint_latency_adjustment_level`, `max_endpoint_delay_ms`, `translation`
   — đúng bộ tham số của WebSocket API Soniox). `[ĐÃ KIỂM]`
3. **Soniox rẻ hơn hẳn lựa chọn trong R-002:** realtime **$0,12/giờ** (audio vào $2/1M token + text ra $4/1M;
   ~30k token audio và ~15k token text mỗi giờ), bật dịch hai chiều thì thêm phần text ra ⇒ **ước ~$0,18/giờ
   ≈ 4.600đ/giờ ≈ 77đ/phút**. So với Deepgram streaming + diarization (≈ $0,59/giờ) thì rẻ hơn ~3 lần. `[ĐÃ KIỂM]` (bảng giá), `[ƯỚC TÍNH]` (bản dịch 2 chiều)
4. **Soniox hỗ trợ tiếng Việt đúng thứ cần:** trang riêng cho tiếng Việt — dịch **một chiều và hai chiều**,
   60+ ngôn ngữ, **3.600 cặp ngôn ngữ**, model `stt-rt-v5`, transcript và bản dịch **về cùng một stream**,
   có **diarization** (biết ai nói). `[ĐÃ KIỂM]`
5. **Nút thắt thật của "bán theo phút" là ĐO PHÚT, không phải công nghệ.** App native cầm **API key Soniox
   và nói chuyện trực tiếp với Soniox** ⇒ server của MeetFlow có thể **không thấy số phút đã dùng**.
   Muốn thu tiền theo phút phải có một trong: (a) proxy audio qua server mình, (b) cấp key tạm theo phiên
   rồi đối soát usage, (c) app báo usage về server (giả mạo được). `[ĐÃ KIỂM]` (bằng chứng DLL) — đây là **spike #1**.
6. **Khuyến nghị:** làm **phương án A — "Phòng họp web" trong fBuddy dùng engine Soniox** (không phụ thuộc
   app native), bán phút bằng hạ tầng credit/VietQR/SePay **đã có sẵn** của fBuddy; để phương án B (ví phút
   dùng chung với app native) sau, vì vướng cả việc app phải báo usage **và** luật IAP của Apple.
7. **Giá đề xuất:** **250–400đ/phút**, bán theo gói (60 phút 15.000đ · 300 phút 60.000đ · 1.000 phút
   180.000đ). Mốc so sánh: MeetFlow AI đang bán gói tháng **130.000–150.000đ/30 ngày**, tức hoà vốn ở
   **~325–375 phút** (5,4–6,2 giờ) nếu bán 400đ/phút. `[ĐÃ KIỂM]` (giá MeetFlow), `[ĐỀ XUẤT]` (giá mới)

---

## 2. Hiện trạng MeetFlow AI (bằng chứng đọc trực tiếp) `[ĐÃ KIỂM]`

| Hạng mục | Sự thật | Bằng chứng |
|---|---|---|
| Nền tảng | iOS (App Store `id6765590042`), macOS (App Store), Android APK, Windows overlay | `meetflowai.site` (trang sản phẩm), `apps-knowledge.js`, `api.meetflowai.site/v1/ai/downloads/android` (200, 96,5 MB) |
| Bản web | **Không có.** `app./web./ai./meet.` không resolve; chỉ có `meetflowai.site` (site công ty), `api.meetflowai.site` (API), `fbuddy.meetflowai.site` (fBuddy) | thử DNS/HTTP 20/09/2026 |
| Windows overlay | **.NET 8 + WPF, self-contained, build 22/08/2026**, 485 tệp, dùng **NAudio (WASAPI loopback)** để bắt âm thanh hệ thống | `MeetFlowAI-Overlay-latest-win-x64.zip` (71,4 MB) → `MeetFlowAI.Win.dll`, `NAudio.Wasapi.dll` |
| Engine realtime | **Soniox** (`stt-rt-v5`): STT + dịch + diarization + language ID trên cùng một stream | chuỗi trong DLL + tham số trùng khớp tài liệu Soniox |
| MoM | Sinh bằng LLM phía client ("Prepare formal, audit-ready business meeting minutes in English", "The meeting-minutes model returned invalid JSON") | chuỗi trong DLL |
| Cấp quyền | Có **license/activation**: `ActivationKey`, `license.json`, `LocalLicense`, "Activation endpoint is not configured", "License expired", `MeetFlowAI.Win.2026.LocalLicense` ⇒ đã có dịch vụ cấp quyền phía server | chuỗi trong DLL |
| Giá consumer hiện tại | **30-Day Pass $5,70 ≈ 150.000đ** (mua một lần, không tự gia hạn) · **Monthly $4,94 ≈ 130.000đ** · **Yearly $39,90 ≈ 1.050.000đ** | `api.meetflowai.site/ai/buy` (20/09/2026) |
| Cách bán | Web: VietQR ngân hàng VN, MoMo, WeChat Pay/Alipay (CNY) → kích hoạt theo **email**; **iOS bán qua Apple IAP** | `api.meetflowai.site/ai/buy`, `meetflowai.site/ai/guide` |
| API | `https://api.meetflowai.site/health` → 200 (công khai); mọi đường khác → **401 Unauthorized** (có auth), một số đường 404 ⇒ có routing | dò 20/09/2026 (`/v1/ai/plans` 404, `/v1/ai/meetings` 404, `/v1`, `/v1/ai`, `/openapi.json` 401) |

**Hệ quả:** "miniApp" không thể là iframe. Nó phải là một trong ba dạng ở §4.

---

## 3. Vì sao "theo phút" là bài toán đo lường, không phải bài toán kỹ thuật `[ĐÃ KIỂM]`

Chuỗi trong DLL cho thấy **app native giữ `SonioxApiKey` và kết nối thẳng tới Soniox**. Nghĩa là:

- Thời lượng phiên (số phút) được Soniox tính theo **key của mình**, không tự động chảy về MeetFlow/fBuddy.
- Nếu fBuddy bán phút mà không có nguồn đo độc lập, người dùng có thể dùng app native “miễn phí” ngoài ví.

Ba cách đo, xếp theo độ tin cậy:

| Cách | Tin cậy | Chi phí/độ phức tạp | Ghi chú |
|---|---|---|---|
| **(a) fBuddy gọi Soniox trực tiếp trong phòng họp web** | **Cao nhất** — server fBuddy mở/khoá phiên, tự đếm phút | Không thêm hạ tầng nếu proxy WS; có thêm băng thông nếu proxy audio | Cách này biến fBuddy thành nơi *dùng* phút, không cần app native |
| **(b) Key tạm theo phiên + đối soát usage API** | Cao | Trung bình | Cần Soniox hỗ trợ key tạm/giới hạn — `[CẦN KIỂM]` |
| **(c) App native báo usage về server** | Thấp (giả mạo được) | Thấp | Chỉ nên dùng làm lớp phụ, có phát hiện bất thường |

---

## 4. Ba phương án triển khai

| | **A. Phòng họp web trong fBuddy, engine Soniox** | **B. Ví phút dùng chung với app native MeetFlow** | **C. MiniApp = cổng vào app native** |
|---|---|---|---|
| Người dùng làm gì | Mở fBuddy → "Phòng họp" → chia sẻ tab/mic → xem transcript + bản dịch 2 cột → nhận MoM | Mua phút trong fBuddy, mở **app MeetFlow AI** (iOS/Android/Windows) để dùng, số phút trừ vào ví fBuddy | Bấm "Mở MeetFlow AI" (deep link), mua gói như hiện nay, MoM/transcript import về fBuddy |
| Phụ thuộc | Soniox (+ backend fBuddy) | App native phải báo usage + **IAP parity trên iOS** | Chỉ cần API/export của MeetFlow |
| Công sức | **Trung bình** (web capture + WS + màn hình phòng họp + đếm phút) | **Cao** (sửa app native, cửa hàng, luật store) | **Thấp** |
| Đo phút | **Server fBuddy** (chính xác) | App native/đối soát | Không bán phút |
| Chi phí biến đổi | ~**55–90đ/phút** (Soniox + LLM MoM) | như A + hoa hồng store | 0 với fBuddy |
| Rủi ro chính | Chất lượng tiếng Việt của Soniox cần đo; phụ thuộc 1 nhà cung cấp | Luật Apple 3.1.3(b) + Google Play; phải phát hành bản app mới | Không có mô hình "trả theo phút"; trải nghiệm đứt đoạn |
| Kết luận | **Nên làm trước** | Để sau | Chỉ là bước đệm |

### 4.1 Luật cửa hàng — chỗ dễ sập nhất của phương án B `[ĐÃ KIỂM]`

Trích nguyên văn [App Store Review Guidelines 3.1.3](https://developer.apple.com/app-store/review/guidelines/) (đọc 20/09/2026):

- **3.1.3(b) Multiplatform Services:** app đa nền tảng **được** cho người dùng truy cập nội dung/gói/tính năng
  đã mua ở nền tảng khác hoặc trên web — **kể cả "consumable items"** — **với điều kiện những mục đó cũng
  phải bán được bằng in-app purchase trong app**.
- **3.1.3:** app thuộc nhóm này **không được**, trong app, khuyến khích người dùng dùng phương thức mua khác
  (trừ storefront Hoa Kỳ theo 3.1.3(a)/3.1.1(a)).
- 3.1.3(e): hàng hoá/dịch vụ tiêu dùng **ngoài** app thì phải **không** dùng IAP — không áp dụng cho phút họp.

⇒ Nếu muốn người dùng **mua phút ở fBuddy rồi tiêu trong app iOS MeetFlow**, thì **trong app iOS cũng phải
bán phút bằng IAP** (và Apple ăn hoa hồng), đồng thời không được đặt CTA mời ra web. Đây là lý do kỹ thuật
lẫn thương mại để **làm phương án A (web) trước**.

`[CHƯA KIỂM]` Luật tương ứng của Google Play (trang chính sách bị chặn từ máy này). Nguyên tắc cần kiểm:
nội dung số tiêu thụ trong app Android phải qua Google Play Billing, và ngoại lệ "multi-platform" hẹp hơn Apple.

---

## 5. Kinh tế đơn vị & giá bán đề xuất

### 5.1 Chi phí thật cho 1 giờ họp (engine Soniox) `[ĐÃ KIỂM]` + `[ƯỚC TÍNH]`

| Khoản | Số | Nguồn |
|---|---|---|
| STT realtime (`stt-rt-v5`) | audio vào $2,00/1M token (~30.000 token/giờ) = **$0,06/giờ** | soniox.com/pricing |
| Text ra (transcript, ~15.000 token/giờ) | $4,00/1M = **$0,06/giờ** | như trên |
| Dịch hai chiều (thêm text ra ~15.000 token/giờ) | ~**$0,06/giờ** `[ƯỚC TÍNH]` | suy từ bảng giá |
| MoM bằng LLM (gemini-2.5-flash) | ~$0,01–0,02/giờ | R-001 §5 |
| **Tổng** | **≈ $0,19/giờ ≈ 4.800đ/giờ ≈ 80đ/phút** | |
| Nếu proxy audio qua server fBuddy | + ~115 MB băng thông/giờ/phiên (PCM 16 kHz mono) — không đáng kể | tính toán |

So sánh: đường Deepgram trong R-002 tốn ~$0,65/giờ ⇒ **engine Soniox rẻ hơn ~3,4 lần** cho cùng tính năng
(đã gồm dịch + diarization).

### 5.2 Mốc giá thị trường `[ĐÃ KIỂM]`

| Sản phẩm | Giá | Quy ra mỗi phút |
|---|---|---|
| **MeetFlow AI hiện tại** | 130.000–150.000đ/30 ngày (không giới hạn phút) | nếu dùng 300 phút/tháng ⇒ **~433–500đ/phút**; dùng 1.000 phút ⇒ ~130–150đ/phút |
| Notta Pro | $8,17/tháng (trả năm) cho 1.800 phút | **~115đ/phút** |
| Otter Pro | $16,99/người/tháng (Basic free 300 phút) | — |
| Wordly (doanh nghiệp, sự kiện) | ~$1.500 cho gói 10 giờ | **~$150/giờ ≈ 3,8 triệu đ/giờ** |
| Interprefy | tính theo gói giờ, không công khai đơn giá | — |

### 5.3 Giá đề xuất cho miniApp fBuddy `[ĐỀ XUẤT]`

| Gói | Giá | Đơn giá | Biên gộp (cost ~80đ/phút) |
|---|---|---|---|
| Dùng thử | 15 phút miễn phí (1 lần/tài khoản) | — | chi phí ~1.200đ/người — dùng làm phễu |
| Lẻ | **400đ/phút** | 400đ | ~5× |
| Gói 60 phút | **15.000đ** | 250đ/phút | ~3,1× |
| Gói 300 phút | **60.000đ** | 200đ/phút | ~2,5× |
| Gói 1.000 phút | **180.000đ** | 180đ/phút | ~2,25× |
| Doanh nghiệp (từ 10.000 phút) | thoả thuận | ~140đ/phút | ~1,75× |

**Neo quan trọng:** bán 400đ/phút thì người dùng **hoà vốn so với gói tháng hiện tại ở ~325 phút**
(≈ 5,4 giờ họp/tháng). Ai họp nhiều hơn nên mua gói phút lớn; ai họp ít (1–2 giờ/tháng) **có lợi hơn hẳn**
so với mua gói tháng ⇒ đây chính là phân khúc mà mô hình theo phút thắng.

### 5.4 Hạ tầng thanh toán — dùng lại 100% cái đang có `[ĐÃ KIỂM]`

| Cần | Đã có trong fBuddy |
|---|---|
| Sổ cái append-only, mọi thay đổi giải thích được | `credit_ledger` + `grantCredits()`/`spendCredits()` (`server/src/credits.js`) |
| Gói bán + giá quy đổi từ một tham số | `topupPackages()` (+ `vndPerCredit`) — thêm loại gói "phút" là mở rộng cùng chỗ |
| QR ngân hàng VN + xác nhận tự động | `server/src/sepay.js` (webhook HMAC hoặc poll), `server/src/topup.js` (mã đơn, idempotent), duyệt tay qua Telegram |
| Ví dụ giá theo VND đã có | chợ kỹ năng bán prompt-pack bằng credit với `priceVnd` (`server/src/skills/skillhub.js`) |

⇒ **Không cần thêm cổng thanh toán nào.** Chỉ cần thêm loại "gói phút" và một hàm trừ credit theo phút.

---

## 6. Kiến trúc đề xuất cho phương án A

```
[Trình duyệt fBuddy]                         [Server fBuddy]                 [Soniox]
  chia sẻ tab (getDisplayMedia audio)  ──►   mở phiên: tạo session,          WS realtime
  + micro, AudioWorklet → PCM16 16 kHz        kiểm tra số dư, cấp quyền  ──►  stt-rt-v5
  hiển thị transcript + bản dịch 2 cột  ◄──   đếm phút theo nhịp tim     ◄──  transcript + dịch
  nút "Kết thúc" → sinh MoM             ◄──   LLM sinh MoM (R-002 §6.3)
```

Các điểm kỹ thuật bắt buộc nhớ:

| Điểm | Số/giới hạn | Nguồn |
|---|---|---|
| Một stream Soniox tối đa **300 phút** | phải tự xoay stream khi họp dài hơn | tài liệu WebSocket API Soniox |
| Định dạng audio/`audio_format`, `sample_rate`, `num_channels` cấu hình trong request | PCM16 16 kHz mono ≈ 32 KB/s ≈ **115 MB/giờ** upload | như trên + tính toán |
| Dịch 1 chiều (`one_way` + `target_language`) hoặc **2 chiều** (`two_way`: `language_a`, `language_b`) | chọn theo loại họp | như trên |
| Diarization bật/tắt bằng `enable_speaker_diarization` | cần cho MoM "ai nói gì" | như trên |
| Browser → Soniox trực tiếp | phụ thuộc việc Soniox cấp **key tạm** `[CẦN KIỂM]`; nếu không, fBuddy phải làm **proxy WebSocket** (thêm ~115 MB/giờ/phiên) | — |

**Đếm phút (thiết kế):**
- Bảng `meeting_sessions` (SQLite): `id`, `user_id`, `started_at`, `last_heartbeat_at`, `minutes_billed`, `status`.
- Trừ credit theo phút, làm tròn lên; **khoá phiên khi số dư = 0** (thông báo + cho nạp tiếp tại chỗ).
- Heartbeat mỗi 15–30 giây; phiên không heartbeat > 2 phút ⇒ đóng và chỉ tính tới lần cuối.
- Trần an toàn: ví dụ tối đa 180 phút/phiên, 8 giờ/ngày/tài khoản (chống treo máy).
- Hoàn credit cho phút bị lỗi hệ thống (ghi rõ lý do trong sổ cái — cơ chế đã có).
- Đối soát định kỳ với usage của Soniox để phát hiện lệch.

**Hạ tầng:** dùng **VPS node-2 hiện tại** là đủ nếu proxy WS chỉ chuyển tiếp audio (CPU thấp, RAM thấp);
băng thông 115 MB/giờ/phiên ⇒ 1.000 giờ họp/tháng ≈ 115 GB — cần kiểm hạn mức của VPS/nhà mạng.
Nếu cho trình duyệt nối thẳng Soniox bằng key tạm thì **không tốn băng thông server**.

---

## 7. Rủi ro & tuân thủ

1. **Phụ thuộc một nhà cung cấp (Soniox)** cho cả MeetFlow AI lẫn miniApp mới. Cần kế hoạch dự phòng
   (R-002 §5 liệt kê Deepgram/Gladia/AssemblyAI/Cloudflare) và theo dõi giá.
2. **Chất lượng tiếng Việt chưa tự đo.** Soniox quảng cáo tiếng Việt hai chiều, 3.600 cặp ngôn ngữ; nhưng
   phải tự chạy 3 file họp thật (accent, chêm tiếng Anh, tên riêng) trước khi bán.
3. **Ghi âm cuộc họp = xử lý dữ liệu cá nhân** ⇒ cần **đồng ý của người tham gia** (Nghị định 13/2023/NĐ-CP;
   họp quốc tế thêm GDPR và luật two-party consent của một số bang Mỹ). Phải có thông báo "đang ghi âm & dịch"
   cho cả phòng và nút dừng tức thì.
4. **Lưu transcript**: SQLite vài chục KB/giờ — rẻ, nhưng cần chính sách xoá và quyền xoá của người dùng
   (`/api/memory` đã có tiền lệ).
5. **Xung đột giá với sản phẩm hiện có:** bán 400đ/phút trong fBuddy có thể làm loãng gói 130.000đ của app
   MeetFlow. Nên coi đây là **gói "trả theo dùng" của cùng một sản phẩm**, và cân nhắc cho phút mua ở fBuddy
   dùng được trong app native (phương án B) — nhưng chỉ sau khi xử lý xong IAP.
6. **Không được hứa "miễn phí"**: chi phí ~80đ/phút là chi phí thật, phải tính vào giá.

---

## 8. Cách tự kiểm chứng lại

```bash
# 1) MeetFlow AI có bản web không + giá hiện tại
curl -sL https://meetflowai.site | grep -o 'href="[^"]*"' | sort -u | grep -i ai
curl -sL https://api.meetflowai.site/ai/buy            # bảng giá 30-day / monthly / yearly
curl -sL https://meetflowai.site/ai/guide              # cách kích hoạt Pro theo email

# 2) API công khai tới đâu (chỉ GET, không thăm dò sâu)
curl -s  https://api.meetflowai.site/health            # 200 {"ok":...}
curl -s  https://api.meetflowai.site/v1                # 401 Unauthorized

# 3) Bằng chứng engine = Soniox (không cần chạy app)
curl -sL -o mf.zip https://meetflowai.site/dl/MeetFlowAI-Overlay-latest-win-x64.zip
unzip -o -q mf.zip MeetFlowAI.Win.dll -d mfx
node -e 'const b=require("fs").readFileSync("mfx/MeetFlowAI.Win.dll");let o=[],c="";
for(let i=0;i+1<b.length;i+=2){const x=b.readUInt16LE(i);if(x>=32&&x<127)c+=String.fromCharCode(x);else{if(c.length>5)o.push(c);c=""}}
console.log([...new Set(o)].filter(s=>/soniox|api_key|activation|license|meeting minutes/i.test(s)).join("\n"))'

# 4) Đối chiếu tham số Soniox
curl -sL https://soniox.com/docs/stt/api-reference/websocket-api | grep -o "enable_speaker_diarization\|max_endpoint_delay_ms" | sort -u
curl -sL https://soniox.com/pricing                     # $2/1M audio token realtime, $4/1M text token
curl -sL https://soniox.com/speech-translation/vietnamese
```

---

## 9. Việc phải spike trước khi cam kết `[CẦN SPIKE]`

| # | Câu hỏi | Vì sao quyết định |
|---|---|---|
| 1 | Soniox có cấp **key tạm/giới hạn** cho client không, hay bắt buộc proxy qua server? | Quyết định kiến trúc và băng thông VPS |
| 2 | Soniox có cho phép **WebSocket từ origin trình duyệt** (CORS/origin policy) không? | Nếu không, buộc phải proxy |
| 3 | Chất lượng tiếng Việt thật (3 file họp: accent Bắc/Trung/Nam, chêm tiếng Anh, tên riêng) | Quyết định có bán được |
| 4 | Độ trễ hiển thị bản dịch trên một phòng họp 15 phút | Trải nghiệm "live" thật hay chỉ gần-live |
| 5 | MeetFlow backend có endpoint **usage/entitlement** để đối soát phút không? | Quyết định phương án B có khả thi |
| 6 | Luật Google Play cho "mua trên web, tiêu trong app Android" | Nếu làm phương án B |
| 7 | Hạn mức băng thông/CPU của node-2 khi có 5–10 phiên đồng thời | Hạ tầng |

---

## 10. Kết luận & đề xuất

1. **Làm phương án A**: miniApp "Phòng họp" trong fBuddy, dùng engine Soniox (chính là engine MeetFlow AI đang
   dùng), không chờ bản web của MeetFlow AI.
2. **Bán theo phút bằng hạ tầng đang có** (credit + VietQR + SePay), giá **250–400đ/phút** theo gói;
   giá lẻ 400đ/phút hoà vốn với gói tháng hiện tại ở ~325 phút.
3. **Đo phút ở phía server fBuddy**, không tin số phút do client/app báo.
4. **Để phương án B sau**, khi: (a) app native báo được usage về server, (b) có phương án IAP cho iOS,
   (c) đã kiểm luật Google Play.
5. **Chốt sớm hai câu hỏi lớn**: chất lượng tiếng Việt của Soniox trên dữ liệu thật, và việc Soniox có cho
   nối trực tiếp từ trình duyệt hay không — hai câu này quyết định cả trải nghiệm lẫn hạ tầng.
