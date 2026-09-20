# R-004 Phụ lục D — Đề cương giao việc: Pha 1 "chỉ ghi log" (shadow mode)

| | |
|---|---|
| **Thuộc nghiên cứu** | R-004 |
| **Feature** | **F-004 — Chọn model thích ứng**, pha 1 (quan sát, **không đổi hành vi người dùng**) |
| **Ngày soạn** | 20/09/2026 |
| **Trạng thái** | **Đề cương để anh duyệt** — chưa giao việc, chưa viết code |
| **Mục tiêu pha 1** | Sau 1–2 tuần có đủ dữ liệu để trả lời: *"Nếu bật định tuyến thì tiết kiệm bao nhiêu, và model rẻ có làm hỏng việc gì không?"* |
| **Không thuộc pha 1** | Không đổi model thật · không thêm UI mới · không sửa chính sách credit · không dùng router học máy |

---

## D.1 Sản phẩm bàn giao (deliverables)

| Mã | Sản phẩm | Tiêu chí "xong" (kiểm được) |
|---|---|---|
| **D1** | Bảng `model_catalog` (SQLite) + script nạp dữ liệu | `SELECT count(*)` ≥ số model đang bật; mỗi dòng có `context_len`, `supports_tools`, `supports_vision`, `price_in_usd`, `price_out_usd`, `privacy_class` |
| **D2** | Bộ luật chọn model (L1 lọc năng lực + L2 chấm điểm) chạy ở chế độ **shadow** | Với 1 lượt bất kỳ, hàm trả về danh sách xếp hạng + lý do; **không** ảnh hưởng model thực tế đang dùng |
| **D3** | Bảng `routing_decisions` + ghi log mỗi lượt | Sau 20 lượt chat thử: có ≥20 dòng, đủ trường ở phụ lục B §B.5, **không chứa nội dung tin nhắn người dùng** |
| **D4** | Đo độ trễ & chi phí theo (provider, model) | Bảng tổng hợp có `ttft_p50/p95`, `cost/turn` cho ít nhất 3 model |
| **D5** | Bộ eval 42 ca (phụ lục C) chạy được trên ≥3 model | Sinh file JSON + CSV tổng hợp; mốc nền `gemini-2.5-flash` có số |
| **D6** | Báo cáo 1 trang | Có: tỉ lệ lượt "khó" thật, ước tính tiết kiệm %, danh sách model đủ điều kiện theo intent, rủi ro phát hiện được |

---

## D.2 Phạm vi thay đổi trong code (chỉ thêm, không sửa hành vi)

| File | Thay đổi | Ghi chú |
|---|---|---|
| `server/src/settings.js` | Thêm `selectModel({ intent, needs })` trả **danh sách xếp hạng**; `resolveProviderForChat()` **giữ nguyên hành vi**, chỉ **gọi thêm** hàm mới để ghi log | Không đổi thứ tự chọn hiện tại |
| `server/src/agent.js` | Sau khi chọn provider/model thật: gọi `logRoutingDecision(...)`; đo `ttft_ms`, `iterations`, `finish_reason` | Chèn một lần, không đổi luồng |
| `server/src/skills/index.js` | Hàm phân loại intent từ `skill` + `attachments` + nội dung (luật rẻ tiền) | Thuần, dễ test |
| `server/src/db.js` | Thêm 2 bảng `model_catalog`, `routing_decisions`; thêm migration có version | **Không** dùng `rowid` cho bảng mới (xem R-006 §4) |
| `ops/refresh-model-pricing.mjs` | Mở rộng: nạp thêm `router.huggingface.co/v1/models` (giá + độ trễ + `supports_tools`) | Giữ nguyên phần OpenRouter |
| `ops/model-eval.mjs` *(mới)* | Chạy bộ đề ở phụ lục C, xuất JSON + CSV | Dùng lại mẫu `ops/apps-explain-check.mjs` |
| `web/` | **Không sửa** | Pha 1 không có UI mới |

**Cờ bật/tắt:** `routingShadow` (mặc định **tắt**). Bật trên môi trường dev/người thử trước, sau đó bật trên
production nhưng **vẫn không đổi model người dùng nhận**.

---

## D.3 Bảng dữ liệu mới

```sql
-- 1) Danh mục model (dữ liệu, không phải suy đoán)
model_catalog(
  provider_id TEXT, model TEXT, context_len INTEGER,
  supports_tools INTEGER, supports_vision INTEGER, supports_structured INTEGER,
  price_in_usd REAL, price_out_usd REAL,
  ttft_ms_p50 INTEGER, ttft_ms_p95 INTEGER,
  error_rate REAL, tool_success_rate REAL, vi_quality REAL,
  privacy_class TEXT, enabled INTEGER, updated_at TEXT,
  PRIMARY KEY (provider_id, model)
);

-- 2) Quyết định định tuyến (chỉ metadata)
routing_decisions(
  id TEXT PRIMARY KEY, created_at TEXT, user_id TEXT, conversation_id TEXT, message_id TEXT,
  intent TEXT, needs_tools INTEGER, has_images INTEGER, context_tokens INTEGER,
  candidates_json TEXT, chosen_provider TEXT, chosen_model TEXT, chosen_reason TEXT,
  shadow_provider TEXT, shadow_model TEXT, est_cost_usd REAL,
  actual_provider TEXT, actual_model TEXT, ttft_ms INTEGER,
  in_tokens INTEGER, out_tokens INTEGER, cost_usd REAL,
  tools_called_json TEXT, tool_call_valid INTEGER, artifact_created INTEGER,
  finish_reason TEXT, iterations INTEGER, escalated_from TEXT, escalated_reason TEXT,
  user_retry_within_10m INTEGER, user_feedback TEXT
);
```
**Quy tắc riêng tư (bắt buộc):** hai bảng này **không** chứa prompt, câu trả lời, tên tệp hay nội dung người dùng.
`candidates_json` chỉ có metadata (provider, model, điểm, lý do).

---

## D.4 Chia việc & ước lượng

| # | Việc | Đề xuất ai | Ước lượng | Phụ thuộc |
|---|---|---|---|---|
| 1 | Tạo 6 fixture + duyệt 42 ca (phụ lục C) | người hiểu sản phẩm (anh/Mac) | 1–2 ngày | anh duyệt §C.10 |
| 2 | `model_catalog` + script nạp (OpenRouter + HF router) | kỹ thuật (Mac hoặc WIN) | 1 ngày | — |
| 3 | Phân loại intent + bộ luật L1/L2 (shadow) | kỹ thuật | 1–2 ngày | #2 |
| 4 | `routing_decisions` + ghi log + migration có version | kỹ thuật | 1 ngày | #3 |
| 5 | `ops/model-eval.mjs` + chạy mốc nền + 4 model rẻ | kỹ thuật | 1–2 ngày | #1, #2 |
| 6 | Bật shadow 1–2 tuần, thu số | cả hai | 1–2 tuần (chờ) | #3, #4 |
| 7 | Báo cáo D6 + đề xuất pha 2 | Mac | 0,5 ngày | #6 |

**Tổng công sức chủ động:** ~5–8 ngày người + 1–2 tuần chờ dữ liệu.

---

## D.5 Cách kiểm (bắt buộc có bằng chứng)

| # | Kiểm gì | Cách kiểm | Đạt khi |
|---|---|---|---|
| V1 | **Không đổi hành vi người dùng** | chạy 20 lượt với cờ shadow **bật** và 20 lượt **tắt**; so `actual_model` | **giống hệt nhau** |
| V2 | Log đủ trường | `sqlite3 … "SELECT count(*) FROM routing_decisions WHERE shadow_model IS NULL"` | = 0 |
| V3 | **Không rò nội dung người dùng** | quét 100 dòng log tìm chuỗi trong prompt thử | không thấy chuỗi nào |
| V4 | Độ trễ không tăng | so `ttft_ms` trung bình khi bật/tắt shadow | chênh **< 5%** |
| V5 | Catalog đúng | so 5 dòng với giá thật trên OpenRouter/HF | khớp |
| V6 | Eval chạy được | `node ops/model-eval.mjs …` trên 3 model | ra file + không lỗi |
| V7 | Rollback | tắt cờ `routingShadow` | hệ thống về đúng hành vi cũ, không cần deploy lại |

---

## D.6 Rủi ro & ràng buộc

| Rủi ro | Cách chặn |
|---|---|
| Shadow vô tình đổi model thật | Cờ mặc định tắt; `resolveProviderForChat()` **không** bị sửa hành vi; kiểm V1 là bắt buộc |
| Log phình to | chỉ metadata; dọn dòng cũ > 90 ngày; ước tính ~1 KB/lượt |
| Thêm độ trễ | luật thuần trong tiến trình; kiểm V4 |
| Ghi log thất bại làm hỏng lượt chat | ghi log **best-effort**, lỗi log không được ném ra ngoài |
| Rò dữ liệu người dùng vào log | kiểm V3; rà soát tay 20 dòng trước khi bật production |
| Nạp giá sai ⇒ kết luận sai | kiểm V5; đối chiếu tay 5 dòng |
| Kết luận sớm vì mẫu nhỏ | không báo cáo tiết kiệm trước **500 lượt** có log; dùng cỡ mẫu ở phụ lục B §B.6 |

---

## D.7 Định nghĩa "hoàn thành pha 1" (definition of done)

- [ ] D1–D6 đều có, kèm bằng chứng V1–V7.
- [ ] Có **≥ 500 lượt** log đầy đủ, trải ≥ 5 intent.
- [ ] Báo cáo D6 nêu rõ: **tỉ lệ lượt khó thật**, **ước tính tiết kiệm có khoảng tin cậy**, **model nào đủ điều kiện
      cho intent nào**, và **rủi ro nào còn mở**.
- [ ] Chưa có thay đổi nào ảnh hưởng người dùng cuối (kiểm V1).
- [ ] Nếu kết quả không đủ tốt (tiết kiệm < 20% hoặc có intent bị thoái bộ), **báo rõ và dừng** thay vì tự ý sang pha 2.

---

## D.8 Câu hỏi cần anh quyết trước khi bắt đầu

1. **Ai làm?** (Mac làm hết, hay tách phần #1 fixture cho WIN?)
2. **Cờ shadow bật ở đâu trước**: chỉ máy dev, hay bật luôn trên fBuddy production (không ảnh hưởng người dùng)?
3. **Có dùng dữ liệu lượt thật của người dùng** để đo không (chỉ metadata), hay chỉ chạy trên tài khoản thử?
4. **Duyệt ngưỡng gate** ở phụ lục C §C.9 và **42 ca** ở §C.10?
