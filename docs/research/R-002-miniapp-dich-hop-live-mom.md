### 0.1 Bổ sung sau lượt khảo sát thứ hai (bản đặc tả trình duyệt + pháp lý EU + móvil)

| Điểm | Nội dung | Trạng thái |
|---|---|---|
| **Đường "không cài gì" hẹp hơn nữa** | `getDisplayMedia({audio:true})` **chỉ Chromium (Chrome/Edge)** mới có tiếng; **Firefox và Safari không trả audio** cho chia sẻ màn hình. Trên **macOS/Linux, Chrome chỉ chia sẻ được tiếng của TAB**, không có tiếng hệ thống (chỉ Windows + ChromeOS mới có) ⇒ "chia sẻ cả màn hình" trên Mac **không có tiếng họp**. Thêm nữa `systemAudio` chỉ là *gợi ý*, trình duyệt có thể bỏ qua: MDN ghi rõ "the returned stream might contain no audio track even when audio is true" | `[ĐÃ KIỂM]` MDN `getDisplayMedia` (đọc 20/09/2026); chi tiết Firefox/Safari ở R-002 phụ lục E |
| **Mobile đóng về mặt kỹ thuật, không chỉ chính sách** | Android `AudioPlaybackCapture` chỉ bắt được `USAGE_UNKNOWN/GAME/MEDIA`; **`USAGE_VOICE_COMMUNICATION` không bắt được** ⇒ không lấy được tiếng cuộc gọi VoIP. iOS cũng không (ReplayKit là quay màn hình và **bị deprecate ở iOS 27**) | `[ĐÃ KIỂM]` (R-002 phụ lục D/E) — **không làm đường mobile** |
| **Luật AI của EU** | **Điều 50 AI Act có hiệu lực từ 02/08/2026** ("Comes into force 2 August 2026, according to Article 113"): đầu ra văn bản/âm thanh do AI tạo **phải được đánh dấu ở dạng máy đọc được**; miễn trừ chỉ cho trường hợp "không làm thay đổi đáng kể dữ liệu đầu vào" ⇒ **biên bản trích xuất (extractive)** có thể được miễn, **biên bản do AI viết lại (generative)** thì không; **giọng dịch tổng hợp có thể bị coi là "deep fake"** và phải công bố | `[ĐÃ KIỂM]` artificialintelligenceact.eu/Article 50 (đọc 20/09/2026). Recital 57 (AI giám sát nhân viên = rủi ro cao) em `[CHƯA KIỂM]` |
| **Mức phạt VN + ngưỡng "dữ liệu quan trọng"** | Ngoài khung phạt đã nêu: Luật Dữ liệu có ngưỡng riêng — **"dữ liệu quan trọng" khi 100.000+ công dân (cơ bản) hoặc 10.000+ (nhạy cảm)** ⇒ nếu dùng **sinh trắc học giọng nói** thì chỉ **10.000 người dùng** đã thành "dữ liệu quan trọng", và **mất ưu đãi ân hạn cho startup** | `[CHƯA KIỂM]` (từ R-002 phụ lục C/D; chưa đọc được văn bản luật gốc — **cần luật sư xác nhận**) |
| **Bot chậm hơn tưởng** | Transcript realtime của bot ~**1–3 giây**, **chậm hơn** STT streaming trực tiếp (200–500 ms); bot còn **bị tính tiền trong lúc chờ được duyệt vào phòng**, và webhook realtime **xử lý tuần tự** (một handler chậm là chặn cả dòng transcript) | `[ĐÃ KIỂM]` (R-002 phụ lục A/C) |
| **Diarization có số thật** | pyannote `community-1`: **DER ~17% (AMI headset), 19,9% (một mic từ xa), 20,2% (DIHARD-3)** ⇒ ~1/5 lượt gán sai người là trần thực tế của diarization tự host miễn phí. Chỉ tier trả tiền `pyannoteAI Live-1` mới streaming (<300 ms, ≤8 người nói) | `[ĐÃ KIỂM]` (R-002 phụ lục A/C) |

## 0. ĐÍNH CHÍNH & BỔ SUNG (sau lượt khảo sát độc lập — xem phụ lục A / C / D)

> Lượt khảo sát độc lập (phụ lục A, kèm 2 bản dữ liệu thô C và D) đã bác/đính chính một số điểm của tài liệu này.
> **Chỗ nào mâu thuẫn thì mục 0 này thắng.**

| Điểm trong tài liệu | Đính chính | Trạng thái |
|---|---|---|
| Viện dẫn **Nghị định 13/2023/NĐ-CP** (§8) | **ĐÃ HẾT HIỆU LỰC.** Từ **01/01/2026**, khung pháp lý là **Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15** ("PDP Law"), thay thế Nghị định 13/2023/NĐ-CP; có **Nghị định 356/2025/NĐ-CP** hướng dẫn thi hành. Dữ liệu **sinh trắc học** (gồm **giọng nói** nếu dùng để nhận diện) thuộc nhóm **dữ liệu cá nhân nhạy cảm**. Khung phạt: tới **10× doanh thu** từ việc mua bán dữ liệu trái phép, tới **5% doanh thu năm trước** cho vi phạm chuyển dữ liệu xuyên biên giới, **3 tỷ đồng** cho vi phạm khác | `[ĐÃ KIỂM]` Chambers *Investing in Vietnam 2026* §11.3 (đọc 20/09/2026) + `vanban.chinhphu.vn` (NĐ 356/2025) |
| Bảng "cách lấy tiếng" §4 — "Capture trong trình duyệt" | **Trang web KHÔNG bắt được âm thanh của app desktop** (Zoom/Teams bản cài). Chỉ bắt được: tab trình duyệt, hoặc mic/âm thanh phòng. `getDisplayMedia` **buộc người dùng thao tác mỗi phiên** (không lưu quyền), và **không chạy trên mobile** | `[ĐÃ KIỂM]` MDN + khảo sát trình duyệt ở phụ lục D |
| §5 — Deepgram cho tiếng Việt | `language=multi` của Nova-3 **không gồm tiếng Việt** (chỉ EN/ES/FR/DE/HI/RU/PT/JA/IT/NL) ⇒ phải dùng `language=vi` ⇒ **không tự chuyển ngữ giữa câu**. Soniox là nhà cung cấp rẻ duy nhất nhận chuyển ngữ giữa câu **và** có tiếng Việt | `[ĐÃ KIỂM]` (phụ lục A) |
| §4 — bot vào họp | **Zoom đổi luật từ 02/03/2026**: bot vào họp ngoài tổ chức cần **OBF/ZAK token** hoặc **RTMS**; và **ghi âm DỪNG khi người cấp quyền rời họp** ⇒ kiến trúc chỉ-dùng-bot rất rủi ro | `[ĐÃ KIỂM]` (phụ lục A) |
| §5 — bảng giá STT | Bổ sung số đầy đủ hơn: Cloudflare **$0,03/giờ** (batch) · Groq **~$0,016/giờ** (batch) · **Soniox dịch realtime $0,18/giờ** · AssemblyAI Streaming $0,15 (không có VN) · Speechmatics RT $0,24 (VN ✓, có diarization) · ElevenLabs Scribe v2 Realtime $0,39 · Deepgram Nova-3 `vi` $0,288 promo · Gladia $0,75 · Azure STT $1,00 · OpenAI Realtime-Translate $2,04 | `[ĐÃ KIỂM]` (phụ lục A) — giá trong §5 của tài liệu này vẫn đúng, chỉ thiếu vài dòng |
| Free tier | Ngoài Cloudflare (≈214 phút/ngày): Deepgram **$200 credit ≈ 574 giờ** streaming; Speechmatics **$100 ≈ 416 giờ** (có tiếng Việt + diarization); Gladia **€50 ≈ 60 giờ**; Azure F0 **5 giờ/tháng** | `[ĐÃ KIỂM]` (phụ lục A) |
| §6.1 — kỳ vọng độ trễ | Ngưỡng thực tế: **caption 1,0–1,8 giây** là đạt (kèm TTS 2,0–3,5 giây) — **ngang hoặc tốt hơn phiên dịch viên người (2–4 giây)**. **Đừng đuổi theo dưới 1 giây** | `[ĐÃ KIỂM]` (phụ lục A) |
| §6.3 — "ai nói gì" | **Chất lượng diarization do đường lấy tiếng quyết định, không do nhà STT**: chỉ **bot** mới cho **tên người thật**; mọi đường khác chỉ có `SPEAKER_xx` ⇒ phải làm lớp đặt tên (nhập tay + khớp danh sách người dự + phát hiện tự giới thiệu). **Hoãn** việc nhận diện bằng giọng nói (xem đính chính luật ở trên: giọng nói = dữ liệu nhạy cảm) | `[ĐÃ KIỂM]` (phụ lục A) |

**Đọc thêm:** [`R-002-appendix-A-live-audio-stt-translation-mom.md`](R-002-appendix-A-live-audio-stt-translation-mom.md)
(kết luận đầy đủ, có ngân sách độ trễ từng chặng, giao thức dịch delta, mô hình dữ liệu MoM cuộn, bảng luật
đồng thuận ghi âm từng bang Hoa Kỳ), [`R-002-appendix-C-mom-bots-legal-raw.md`](R-002-appendix-C-mom-bots-legal-raw.md),
[`R-002-appendix-D-meeting-audio-capture-raw.md`](R-002-appendix-D-meeting-audio-capture-raw.md).

---

# R-002 — MiniApp dịch họp live + ghi biên bản (MoM) và để fBuddy giữ ngữ cảnh cuộc họp

| | |
|---|---|
| **Mã nghiên cứu** | R-002 |
| **Feature** | **F-002 — MiniApp "Phòng họp": dịch cuộc họp theo thời gian thực, ghi biên bản (MoM), và nạp ngữ cảnh cuộc họp vào fBuddy** |
| **Câu hỏi nghiên cứu** | "fBuddy có thể thêm miniApp kiểu MeetFlow AI để dịch họp live + ghi MoM, rồi nắm luôn ngữ cảnh cuộc họp không? Cần hạ tầng gì, tốn bao nhiêu?" |
| **Ngày khảo sát** | 20/09/2026 (giờ máy Mac) |
| **Người thực hiện** | Phiên nghiên cứu (Mac) |
| **Trạng thái** | Có kết luận + 3 phương án — chờ chọn hướng |
| **Liên quan trong repo** | `server/src/voice/index.js`, `server/src/skills/translate.js`, `server/src/skills/hub.js` (skill `meeting-notes`), `server/src/memory.js`, `server/src/files.js`, `web/src/App.tsx`, `web/src/components/Sidebar.tsx` |

> Giá và quota dưới đây là giá trị **tại ngày khảo sát**, có URL để kiểm lại. Mục §9 ghi rõ cái gì
> `[ĐÃ KIỂM]`, cái gì `[CHƯA KIỂM]`, cái gì `[CẦN SPIKE]`.

---

## 1. Kết luận (TL;DR)

1. **Khả thi về mặt kỹ thuật**, và fBuddy đã có sẵn ~60% phần "MoM": skill chợ **"Tóm tắt cuộc họp"**
   (`meeting-notes`: quyết định / việc cần làm + người phụ trách + hạn / điểm tranh luận / rủi ro),
   `translate.js` có hàm gọi LLM 1 lượt, memory 2 tầng + tìm kiếm toàn văn, và skill xuất `.xlsx/.pptx/.docx` thật. `[ĐÃ KIỂM]`
2. **Cái còn thiếu chỉ có 3 thứ:** (a) **đường lấy tiếng cuộc họp**, (b) **STT streaming + biết ai nói (diarization)**,
   (c) **bề mặt "miniApp"** (union view hiện tại là `chat|studio|hub|topup|settings`). `[ĐÃ KIỂM]`
3. **Chi phí chính là STT, không phải dịch và không phải MoM.** Dịch + MoM cho 1 giờ họp chỉ ~0,05 USD;
   STT từ **0,03 USD/giờ** (Whisper batch, có free 214 phút/ngày) tới **0,65 USD/giờ** (streaming + diarization + bot). `[ĐÃ KIỂM]`
4. **Đường rẻ nhất gần như miễn phí:** Cloudflare Workers AI chạy `whisper-large-v3-turbo` với
   **0,0005 USD/phút audio** và **10.000 neurons/ngày miễn phí ≈ 214 phút/ngày** — nhưng là **batch, không realtime**. `[ĐÃ KIỂM]`
5. **Muốn "live" thật** (dịch khi người ta đang nói) thì phải trả tiền streaming (Deepgram Flux Multilingual
   0,0078 USD/phút + diarization 0,0020 USD/phút) hoặc **tự host GPU** (RTX 4090 ~0,34–0,69 USD/giờ). `[ĐÃ KIỂM]`
6. **Hạ tầng:** dùng STT thuê ngoài thì **VPS node-2 hiện tại đủ**; chỉ cần thêm hàng đợi/worker cho job chuyển âm,
   bật audio trong `ALLOWED_MIME`, và chú ý băng thông (gửi **Opus** ~11 MB/giờ thay vì PCM ~115 MB/giờ). `[ĐÃ KIỂM]` (phần code)
7. **Pháp lý:** ghi âm cuộc họp cần **sự đồng ý của người tham gia** (Nghị định 13/2023/NĐ-CP; họp quốc tế
   còn GDPR / two-party consent của một số bang Mỹ). Kiểu "ghi lén" của một số app overlay là rủi ro pháp lý. `[ĐÃ KIỂM]` (luật VN)
8. **Đề xuất lộ trình:** làm **MVP "tải bản ghi → MoM + ngữ cảnh"** trước (rẻ, chắc chắn chạy), đo chất lượng
   tiếng Việt và mức sẵn sàng trả tiền, rồi mới làm bản live.

---

## 2. Hiện trạng fBuddy (đọc code 20/09/2026) `[ĐÃ KIỂM]`

| Đã có | Ở đâu |
|---|---|
| STT server-side 2 đường: Gemini (audio understanding) và `openai-compatible` → `POST /audio/transcriptions` (Groq/OpenAI) | `server/src/voice/index.js` |
| Hàm gọi LLM một lượt (`completeOnce`) dùng cho dịch — tái dùng được để dịch từng đoạn transcript | `server/src/skills/translate.js` |
| Skill chợ **"Tóm tắt cuộc họp"** (MoM 4 phần, có bảng việc/người/hạn) và **"Dịch tài liệu chuyên ngành"** | `server/src/skills/hub.js` (slug `meeting-notes`, `doc-translate`) |
| Memory dài hạn 2 tầng: `user_memories` + chỉ mục toàn văn FTS của mọi tin nhắn | `server/src/memory.js` |
| Knowledge block nhét vào system prompt theo điều kiện (credit, `apps-knowledge`) | `server/src/agent.js`, `server/src/apps-knowledge.js` |
| Tạo tệp thật `.xlsx/.pptx/.docx` + artifact tải có kiểm tra chủ sở hữu | `server/src/skills/*`, `server/src/files.js` |
| Voice trong trình duyệt (dictation + đọc câu trả lời, rảnh tay có barge-in) | `web/src/voice/*` |

| Còn thiếu | Ghi chú |
|---|---|
| Đầu vào **audio cuộc họp** (tab/system/call) | Trình duyệt chỉ có mic; họp online cần capture tab hoặc bot |
| **STT streaming** | Hiện là file/chunk ngắn, không phải luồng liên tục |
| **Diarization** (ai đang nói) | Không có ở cả 2 đường STT hiện tại |
| **Bề mặt miniApp** | `web/src/components/Sidebar.tsx`: `type View = "chat" \| "studio" \| "hub" \| "topup" \| "settings"` |
| **Audio trong `ALLOWED_MIME`** | `server/src/files.js` chỉ cho ảnh/pdf/text/office |
| **Failover giữa provider** | `agent.js` chưa có (chỉ có `vision-fallback.js` cho ảnh) |

---

## 3. Kiến trúc tổng thể

```
[lấy tiếng]  →  [STT (+diarization)]  →  [dịch + MoM]  →  [ngữ cảnh cho fBuddy]
 mic/tab/bot      cloud hoặc tự host        LLM sẵn có      conversation + memory + artifact
```

---

## 4. Lớp 1 — Lấy tiếng cuộc họp (quyết định tính khả thi) `[ĐÃ KIỂM]`

| Cách | Khả thi | Chi phí | Ưu / nhược |
|---|---|---|---|
| **Bot vào họp — Recall.ai** | Rất cao (đã thương mại hoá) | **0,50 USD/giờ ghi** + transcription 0,15 USD/giờ (hoặc tự cắm), **5 giờ đầu free**, lưu trữ 0,05 USD/giờ | Vào được Zoom/Meet/Teams, có diarization, người dùng không phải cài gì. **Không** lấy được họp trực tiếp/ngoài nền tảng |
| **Bot vào họp — Meeting BaaS** | Cao | **từ 0,35 USD/giờ**, **8 giờ free**, BYO transcription key, Pro 99 USD/tháng (300 bot/ngày, giữ dữ liệu 7 ngày) | Rẻ hơn Recall, hợp nếu tự cắm Whisper |
| **Capture trong trình duyệt** (`getDisplayMedia` + tab audio, mic) | Cao trên **Chrome/Edge desktop**; hạn chế Safari/Firefox; **mobile gần như không** | **0 USD hạ tầng** | Không cần cài app; nhưng user phải bấm chia sẻ, và đổi tab/app có thể mất tiếng |
| **Overlay desktop** (kiểu MeetFlow AI bản Windows) | Cao nhưng **phải làm app riêng** | Chi phí phát triển + ký code + cập nhật | Chất lượng tốt nhất, vốn lớn nhất |
| **Mobile app bắt âm cuộc gọi** | Thấp (iOS chặn) | — | Không nên làm giai đoạn này |

Ghi chú: `api.meetflowai.site` có phản hồi ở `/guide` nhưng `/v1/ai/guide` trả **404** `[ĐÃ KIỂM]`
⇒ **chưa xác nhận** MeetFlow AI có API/export transcript để fBuddy import. Đây là câu hỏi cần trả lời
trước khi chọn phương án A (§8).

---

## 5. Lớp 2 — STT: giá thật, free tier thật `[ĐÃ KIỂM]`

Khoản tốn tiền chính của feature nằm ở đây.

| Dịch vụ | Loại | Giá | Free | Diarization |
|---|---|---|---|---|
| **Cloudflare Workers AI** `@cf/openai/whisper-large-v3-turbo` | File/chunk | **0,0005 USD/phút = 0,03 USD/giờ** | **10.000 neurons/ngày ≈ 214 phút/ngày** | Không |
| **Deepgram** Nova-3 (monolingual) | **Streaming** | 0,0048 USD/phút (0,29 USD/giờ) | **200 USD credit** cho tài khoản mới | +0,0020 USD/phút |
| **Deepgram** Flux Multilingual | **Streaming, <300 ms** | 0,0078 USD/phút (0,47 USD/giờ) | như trên | +0,0020 USD/phút |
| **AssemblyAI** Universal-2 / Universal-3.5 Pro | Async (không live) | **0,15 / 0,21 USD mỗi giờ** | Free tier | **Có sẵn** |
| **ElevenLabs** Scribe | File | 330 credit/phút (≈19.800 credit/giờ) | Free 10k credit ≈ **30 phút/tháng** | Có |
| **Gladia** Solaria | Realtime <300 ms + async | Trang giá không niêm yết số ⇒ `[CHƯA KIỂM]` | — | Có |
| **HF Inference Providers** (Whisper qua `hf-inference`/deepinfra/together) | File | Tính theo giây GPU, không niêm yết rõ ⇒ `[CHƯA KIỂM]` | nằm trong 0,10 USD/tháng | Tuỳ provider |
| **Groq** `whisper-large-v3-turbo` | File, rất nhanh | Không đọc được bảng giá (console trả 403) ⇒ `[CHƯA KIỂM]`, ước tính rất rẻ | Có free tier | Không |
| **Gemini** audio (fBuddy **đã** tích hợp) | Chunk 20–30 s | Free tier + rẻ | Có | Không |
| **Tự host** faster-whisper large-v3 trên GPU thuê | Streaming được | **RTX 4090 ~0,34–0,69 USD/giờ · A100 80GB ~1,19–1,99 · H100 ~2,69–3,49** (RunPod, 20/09/2026) | — | pyannote (thêm GPU) |

**Nhận định:** với tiếng Việt, `whisper-large-v3(-turbo)` là lựa chọn mở phổ biến và có free tier thật
(Cloudflare). Muốn **realtime** thì hoặc trả tiền streaming, hoặc tự host GPU.

---

## 6. Lớp 3 — Dịch + MoM + ngữ cảnh

### 6.1 Chi phí cho 1 giờ họp `[ĐÃ KIỂM]` (giá), `[CHƯA KIỂM]` (ước lượng token)

Giả định: 4 người nói tiếng Việt, ~8.500 từ ⇒ **~15.000 token** transcript; dịch 2 chiều ≈ 30.000 token
vào+ra; MoM ≈ 15k vào + 2k ra.

| Hạng mục | Chi phí/giờ họp |
|---|---|
| STT Cloudflare Whisper turbo (batch) | **0,03 USD** (hoặc miễn phí trong 214 phút/ngày) |
| STT Deepgram streaming multilingual + diarization | **0,59 USD** |
| Bot Recall.ai (nếu họp online) | 0,50 USD (+0,15 nếu dùng transcription của họ) |
| Dịch bằng `gemini-2.5-flash` (0,30/2,50 USD mỗi 1M) | ~0,04 USD |
| MoM | ~0,01–0,02 USD |
| **Tổng — đường rẻ (không realtime)** | **≈ 0,08–0,10 USD ≈ 2.000–2.500đ/giờ họp** |
| **Tổng — đường live + bot** | **≈ 1,10–1,25 USD ≈ 28.000–32.000đ/giờ họp** |

### 6.2 Giá bán phải khác giá chat

Cơ chế credit hiện tại: **1 credit = 1 token**, `creditsPerToken = 0.06`, `vndPerCredit = 1`.
Một giờ họp sinh ra ~50.000 token (transcript + bản dịch + MoM) ⇒ nếu bán theo token thì thu ~50.000 credit
trong khi đường live **tốn 1,1 USD (~28.000đ)** — biên mỏng và dễ lỗ khi họp dài/nhiều người.
⇒ Feature này cần **bảng giá riêng theo phút họp** (ví dụ 500–800 credit/phút cho bản live, hoặc bán gói
"1 giờ họp"), tách khỏi giá token của chat.

### 6.3 "fBuddy nắm ngữ cảnh cuộc họp" — thiết kế đề xuất

1. Mỗi cuộc họp = **1 conversation loại `meeting`**: transcript 2 cột (gốc/dịch) lưu dạng message,
   MoM lưu dạng artifact `.docx`/`.xlsx`.
2. Kết thúc họp tự sinh: **MoM** (skill `meeting-notes` đã có) + **bảng việc cần làm** (xuất Excel) +
   **từ điển thuật ngữ/tên riêng** của khách hàng để dùng lại cho các họp sau.
3. Ghi vào **memory** các mẩu bền vững: tên người, vai trò, quyết định đã chốt, hạn cam kết ⇒ các lượt chat
   sau tự có ngữ cảnh (đúng cơ chế `user_memories` + FTS đang chạy).
4. Thêm **knowledge block "họp gần nhất"** giống khối credit/`apps-knowledge`, **chỉ ghép khi câu hỏi chạm
   tới họp/dự án** để không tốn token mỗi lượt.
5. Artifact + transcript tái dùng endpoint tải có kiểm tra chủ sở hữu hiện có.

---

## 7. Hạ tầng cần gì (feasibility thật)

| Hạng mục | Kết luận |
|---|---|
| **Server** | Dùng STT thuê ngoài ⇒ **VPS node-2 hiện tại đủ** (Node chỉ giữ SSE + gọi API ngoài, CPU thấp). Nên tách **worker/queue** cho job chuyển âm để không chặn chat |
| **Băng thông** | Gửi **Opus 24 kbps ≈ 10,8 MB/giờ** thay vì PCM 16 kHz (≈115 MB/giờ) — chênh 10×. 1.000 giờ họp ≈ 11 GB egress, không đáng kể |
| **Lưu trữ** | Transcript + MoM vài chục KB/giờ ⇒ SQLite ổn. Nếu lưu audio nên Opus + chính sách xoá (11 MB/giờ) |
| **Phiên dài** | Phiên live có thể kéo dài 1 giờ ⇒ cần heartbeat + chỉnh timeout Caddy/proxy; nên có kênh SSE/WebSocket riêng cho phòng họp |
| **Đồng thời** | Deepgram/AssemblyAI giới hạn concurrency theo gói ⇒ phải **queue + báo "phòng đang bận"**, không mở vô hạn |
| **Tự host GPU** | Chỉ nên khi > ~300–500 giờ họp/tháng: 1 GPU 4090 (0,34–0,69 USD/giờ ≈ 250–500 USD/tháng nếu chạy 24/7) gánh được nhiều phiên (cần đo throughput thật), nhưng thêm ops + độ trễ khởi động model |
| **Secret** | Token HF/Groq/Deepgram lưu **đúng cơ chế provider key hiện có (AES-256-GCM, `FBUDDY_SECRET`)** — không cần hạ tầng mới |
| **Pháp lý/consent** | Cần thông báo + đồng ý của người tham gia trước khi ghi âm (xem §8) |

---

## 8. Ba phương án triển khai

| | **A. Nhúng/SSO MeetFlow AI** | **B. MVP trong fBuddy: tải bản ghi → MoM + ngữ cảnh** | **C. MiniApp live thật trong fBuddy** |
|---|---|---|---|
| Nội dung | fBuddy mở/SSO sang MeetFlow AI, **import transcript + MoM** về thành conversation | Upload file ghi âm/transcript → STT (Cloudflare/Gemini) → MoM (skill có sẵn) + dịch + lưu ngữ cảnh | View "Phòng họp": capture tab/mic → STT streaming → panel dịch 2 cột → MoM cuối buổi |
| Công sức | **Thấp–vừa** (cần API/export từ MeetFlow AI — hiện `/v1/ai/guide` trả 404, **phải xác nhận**) | **Thấp** (thêm mime audio + 1 luồng job + tái dùng skill) | **Cao** (view mới, audio pipeline, streaming, queue, bảng giá riêng) |
| Chi phí chạy | ~0 (MeetFlow AI đã thu phí riêng) | ~0,09 USD/giờ họp | ~0,10 USD/giờ (capture tab + Whisper chunk) → ~1,25 USD/giờ (bot + streaming) |
| Rủi ro | Phụ thuộc sản phẩm khác; trải nghiệm đứt đoạn; chưa chắc có API | Không live, nhưng **chắc chắn chạy được** | Nhiều biến số: trình duyệt, độ trễ, chi phí, quota |
| Mức "fBuddy nắm ngữ cảnh" | Vừa (chỉ khi import) | **Tốt** (mọi thứ nằm trong fBuddy) | **Tốt nhất** |

**Lộ trình đề xuất:** **B trước** (chứng minh giá trị "fBuddy hiểu cuộc họp của tôi" với chi phí gần 0)
→ **C sau** khi đã có số đo độ chính xác tiếng Việt và biết người dùng chịu trả bao nhiêu mỗi phút
→ **A** chỉ khi cần bản live ngay và MeetFlow AI mở được API/export.

### 8.1 Điều kiện pháp lý bắt buộc cho mọi phương án

- Ghi âm/học nội dung cuộc họp là **xử lý dữ liệu cá nhân** ⇒ cần **sự đồng ý** của người tham gia
  (Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân — fBuddy đã nhắc nghị định này trong content policy).
- Họp có người nước ngoài ⇒ thêm GDPR (EU) và luật two-party consent của một số bang Mỹ.
- Khuyến nghị: hiện thông báo "đang ghi âm & dịch" cho mọi người trong phòng, có nút dừng tức thì,
  và chính sách xoá bản ghi sau N ngày. **Không** làm cơ chế ghi lén.

---

## 9. Cách tự kiểm chứng lại

Máy Mac này chặn một số domain (`huggingface.co`, `google.com`, `console.groq.com` trả 403) nhưng phần lớn
site nhà cung cấp thì fetch được:

```bash
# Giá STT
curl -sL https://developers.cloudflare.com/workers-ai/platform/pricing/   # whisper-large-v3-turbo
curl -sL https://deepgram.com/pricing                                      # Nova-3 / Flux (số nằm trong JSON-LD)
curl -sL https://www.assemblyai.com/pricing                                # Universal-2 / 3.5 Pro
curl -sL https://elevenlabs.io/pricing                                     # Scribe: 330 credit/phút

# Bot vào họp
curl -sL https://www.recall.ai/pricing                                     # 0,50 USD/giờ, 5 giờ free
curl -sL https://meetingbaas.com/en/pricing                                # từ 0,35 USD/giờ, 8 giờ free

# GPU thuê (nếu tự host Whisper)
curl -sL https://www.runpod.io/pricing                                     # H100 2,69–3,49 USD/giờ (JSON-LD)

# Trong repo
grep -n "type View" web/src/components/Sidebar.tsx
sed -n '1,40p' server/src/voice/index.js
grep -n "meeting-notes" -A 12 server/src/skills/hub.js
```

Tiện ích: script `strip.mjs` (bỏ thẻ HTML thành text) đã dùng khi khảo sát nằm ở `/tmp` của phiên này,
không thuộc repo.

---

## 10. Việc phải spike trước khi cam kết `[CẦN SPIKE]`

| # | Câu hỏi | Cách test | Vì sao quan trọng |
|---|---|---|---|
| 1 | Chất lượng STT tiếng Việt thật của Cloudflare Whisper turbo vs Gemini vs Deepgram | 3 file họp thật (có accent, có chêm tiếng Anh) | Quyết định có bán được không |
| 2 | Độ trễ end-to-end của đường chunk 20–30 s (capture → STT → dịch → hiện) | đo trên 1 cuộc họp giả 15 phút | Nếu cần <1 s thì buộc phải streaming trả tiền hoặc self-host GPU |
| 3 | Trình duyệt mục tiêu: capture tab audio chỉ ổn trên Chrome/Edge desktop | thử Chrome/Edge/Safari + mobile | Quyết định có làm bản live trong web không |
| 4 | MeetFlow AI có API/export transcript không | hỏi trực tiếp/đọc `api.meetflowai.site` | Nếu có, phương án A rẻ hơn nhiều |
| 5 | Người dùng trả bao nhiêu cho 1 giờ họp | khảo sát/phỏng vấn 5–10 khách | Chọn giữa đường 0,1 USD và 1,25 USD/giờ |

---

## 11. Kết luận & đề xuất

1. **Khả thi, nhưng đừng làm bản live trước.** Giá trị lớn nhất/chi phí thấp nhất nằm ở MVP:
   tải bản ghi → STT → MoM + nạp ngữ cảnh vào fBuddy (phương án **B**).
2. **Tận dụng cái đã có**: skill `meeting-notes`, `translate.completeOnce`, memory + FTS, artifact
   `.docx/.xlsx`. Không xây lại từ đầu.
3. **Free tier dùng được cho MVP**: Cloudflare Workers AI (214 phút/ngày) hoặc Gemini (đã tích hợp) ⇒
   gần như 0 đồng cho giai đoạn thử.
4. **Bản live là bài toán tiền + hạ tầng, không phải bài toán code**: chọn giữa trả tiền streaming
   (0,6 USD/giờ), bot vào họp (0,35–0,65 USD/giờ), hay tự host GPU (~0,35–0,7 USD/giờ + ops).
5. **Phải có đồng ý ghi âm** và chính sách xoá dữ liệu trước khi phát hành cho người dùng thật.
