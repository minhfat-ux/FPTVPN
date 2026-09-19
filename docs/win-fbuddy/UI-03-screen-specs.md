# BRIEF UI-03 — Screen-spec cho 8 màn hình MVP

- **Người làm:** harness **Windows** (`AGENT_NAME=WIN`) · **Bên giao / nghiệm thu:** MAC
- **Gate:** GATE 1 (Design parity kit) · **Baseline:** `RS-FB-20260919-01` / `RULESET-FB-0001`
- **Hạn (`--due`):** 2026-09-24 · **Luật:** `RULE-UI-FB-001..010`, `FR-UI-001..007`, `NFR-UX-001`,
  `NFR-ACC-001`, `RULE-EVID-FB-007`, `RULE-DELEGATE-FB-*`

## 1. Mục tiêu (1 câu, đo được)

Viết **screen-spec cho 8 màn hình MVP**, mỗi màn có bố cục, **bảng token màu lấy từ web**, và **đủ 4 trạng thái
bắt buộc** (rỗng / đang tải / lỗi / mất mạng), theo đúng template
[`docs/mobile/templates/SCREEN-SPEC.template.md`](../mobile/templates/SCREEN-SPEC.template.md).

**8 màn hình:** (1) Đăng nhập · (2) Chat · (3) Danh sách hội thoại · (4) Chợ kỹ năng · (5) Chọn kỹ năng ·
(6) Credit · (7) Nạp · (8) Tài khoản & thiết bị.

## 2. Phạm vi file (whitelist)

| Đường dẫn | Loại |
|---|---|
| `docs/design/SCREEN-SPEC-01-login.md` … `SCREEN-SPEC-08-account-devices.md` | tạo mới (8 file) |
| `docs/design/ui-03-*.png` | ảnh so sánh |

**Cấm sửa** `docs/mobile/**` (kể cả template — **đây là vùng của Mac**), `docs/SRS.md`, `web/**`,
`.privatefbuddy/**`, `ops/**`. Không chạy git. Không thêm dependency.

## 3. Nguồn sự thật

- Template: `docs/mobile/templates/SCREEN-SPEC.template.md` (**đọc**, không sửa).
- Token: `docs/mobile/theme-tokens.json` + `docs/mobile/THEME.md`.
- Bố cục & hành vi web: `web/src/**` và `docs/mobile/SCREENS.md`.
- Yêu cầu: `docs/SRS.md` §6.1–§6.12, §7 (`NFR-UX-001`, `NFR-ACC-001`).

**Bốn sự thật backend bắt buộc phản ánh đúng trong spec** (SRS §12 — tài liệu mobile cũ ghi sai):

| Chủ đề | Đúng (theo code) | Sai (tài liệu cũ) |
|---|---|---|
| Số dư credit | event `done.credits` | "event `usage`" |
| Hết credit | **event `error`** (mã `insufficient_credits`) trong SSE | "HTTP **402**" |
| Giới hạn tệp | **25MB** hiệu dụng | "30MB" |
| Phân trang / dừng | **không** có `nextCursor`, **không** có `POST /chat/stop` | "đã có" |

⇒ Trong spec, trạng thái "hết credit" phải mô tả là **event `error` trong luồng chat** và hiện khối chặn có
**hai đường**: nạp thêm (theo store) và "Xin thêm token". Đừng dùng câu "402" ở bất kỳ màn hình nào.
Lưu ý: template hiện đang ghi "Hết credit (402)" — hãy **ghi rõ trong spec** rằng theo `FR-CHAT-004` đó là
event `error`, và **báo Mac** để Mac sửa template (bạn không được sửa).

## 4. Hành vi đúng phải giữ nguyên

- Web **dark-first**: bảng màu trong spec lấy từ nhánh `color.dark.*` của `theme-tokens.json`.
- Tin người dùng: bong bóng `bubbleUser` (`#16385E`) canh **phải**; tin trợ lý **không nền**,
  avatar 32×32 bo góc 10, meta 12px màu `--text-faint` (`FR-UI-003`).
- Trạng thái rỗng: logo `hero-mark` 52×52 + tên app chữ gradient + thẻ gợi ý (`FR-UI-004`).
- Ba ngôn ngữ `vi/en/zh`, tên ngôn ngữ viết đầy đủ kèm cờ, fallback `en` (`FR-UI-006`).
- Thao tác chính (gửi tin, dừng, chọn kỹ năng, nạp) ≤ **2 chạm** từ màn chat (`NFR-UX-001`).

## 5. Tiêu chí nghiệm thu (AC)

- [ ] Đủ **8** file `docs/design/SCREEN-SPEC-*.md`, mỗi file theo template (bố cục, token, trạng thái,
      tương tác, phụ thuộc API).
- [ ] **Mỗi** màn có đủ 4 trạng thái: **rỗng · đang tải · lỗi · mất mạng** (mô tả hiển thị cụ thể, có nút
      "Thử lại"; riêng màn chat phải giữ phần `delta` đã nhận — `FR-CHAT-009`/`AC-016`).
- [ ] Mỗi màn có **bảng token** trỏ tên token trong `theme-tokens.json` + hex; **không** mô tả màu tuỳ ý.
- [ ] Mỗi màn ghi rõ **endpoint API** dùng và **trạng thái lỗi** tương ứng (401 hết phiên ⇒ về đăng nhập;
      hết credit ⇒ event `error`; 429 ⇒ tự backoff vì **không có** `Retry-After`).
- [ ] Không có câu nào ghi "402" cho hết credit, không ghi "30MB", không nhắc `nextCursor`/`/chat/stop`.
- [ ] Có **ảnh so sánh 390×844** web ↔ app cho ít nhất các màn Chat, Đăng nhập, Credit.
- [ ] Màn "Tài khoản & thiết bị" có mục **xoá tài khoản** (2 bước xác nhận) và **danh sách phiên thiết bị**
      (`FR-ACCT-001`, `FR-AUTH-003`); màn "Nạp" ghi rõ nhánh theo nền tảng (iOS **không** dùng VietQR).

## 6. Lệnh nghiệm thu (Mac chạy **đúng** lệnh này)

```bash
node ops/verify-design-parity.mjs --section specs
```

> Chưa tồn tại — Mac tạo cùng GATE 1. Nếu chưa có ⇒ `blocked`, không tự viết thay, không hạ tiêu chí.

## 7. Bằng chứng bắt buộc

| # | Bằng chứng |
|---|---|
| 1 | Danh sách 8 file spec + số dòng mỗi file |
| 2 | Output thật của `node ops/verify-design-parity.mjs --section specs` |
| 3 | **Ảnh chụp 390×844**: web ↔ app cho Chat, Đăng nhập, Credit (`docs/design/ui-03-*.png`) |
| 4 | Bảng đối chiếu token: tên token · hex trong spec · hex trong `theme-tokens.json` |
| 5 | Ghi chú phát hiện sai lệch (nếu template/spec cũ nói sai) để Mac mở CR |

`done --evidence "cmd=… ; kết quả=… ; file=… ; rag=<đường dẫn entry RAG đã ghi>"`.

## 8. Phụ thuộc / việc bị chặn

- **Phụ thuộc Mac:** `ops/verify-design-parity.mjs`; và nếu muốn có **ảnh app** thì cần khung iOS/Android
  build được (GATE 2/3). Nếu chưa có ⇒ nộp **spec + ảnh web 390px** trước, ghi `progress` rõ phần ảnh app.
- **Phụ thuộc UI-01/UI-02:** bảng token nên khớp tên token với `FBTheme.swift`/`Theme.kt` do `UI-01` sinh.
  Không trùng vùng file với UI-01/UI-02 ⇒ **không** vi phạm `RULE-DELEGATE-FB-009`.
- Không bị chặn bởi `OQ-001`/`OQ-002`/`OQ-003` ⇒ giao ngay.
