# BRIEF UI-02 — Bộ asset logo/icon dựng từ của web (chép vào repo, không hot-link)

- **Người làm:** harness **Windows** (`AGENT_NAME=WIN`) · **Bên giao / nghiệm thu:** MAC
- **Gate:** GATE 1 (Design parity kit) · **Baseline:** `RS-FB-20260919-01` / `RULESET-FB-0001`
- **Hạn (`--due`):** 2026-09-22 · **Luật:** `RULE-UI-FB-003`/`RULE-UI-FB-009`, `FR-UI-002` (`AC-039`),
  `RULE-IOS-FB-006`, `RULE-ANDROID-FB-005`, `RULE-DELEGATE-FB-*`

## 1. Mục tiêu (1 câu, đo được)

Dựng **bộ asset hoàn chỉnh** cho iOS (`Assets.xcassets`: AppIcon + imageset) và Android
(`res/mipmap-*` + adaptive icon) **từ chính asset của web**, chép vào repo — **không hot-link** URL nào —
sao cho **tắt mạng vẫn hiện đủ logo/icon**.

## 2. Phạm vi file (whitelist)

| Đường dẫn | Loại |
|---|---|
| `ios/FBuddy/Assets.xcassets/**` (`AppIcon.appiconset/**`, `BrandMark.imageset/**`, `BrandLogo.imageset/**`, `HeroMark.imageset/**`) | tạo mới |
| `android/app/src/main/res/mipmap-*/**` (+ `mipmap-anydpi-v26/`) | tạo mới |
| `android/app/src/main/res/drawable*/**` (splash/foreground nếu cần) | tạo mới |
| `docs/design/ui-02-*.png` | ảnh chụp bằng chứng |

**Nguồn (chỉ ĐỌC, tuyệt đối không sửa):** `web/public/brand-mark.png`, `web/public/brand-logo.png`,
`web/public/favicon.png`, `web/public/favicon.svg`
(`brand-mark.png` là nguồn để dựng **icon app** theo `AC-039`).

**Cấm sửa mọi file khác** — đặc biệt `web/**`, `docs/mobile/**`, `.privatefbuddy/**`, `ops/**`.
Không chạy git. Không thêm dependency mới.

## 3. Nguồn sự thật & quy tắc asset

- `AGENTS.md` §5: asset **phải chép vào repo**, **không hot-link** URL của web.
- `FR-UI-002`/`AC-039`: icon app trên máy phải là bản dựng từ `brand-mark.png`; tắt mạng vẫn đủ logo.
- Trạng thái rỗng của web dùng logo `hero-mark` **52×52** + tên app chữ gradient + thẻ gợi ý (`FR-UI-004`)
  ⇒ cần **cả** bản mark vuông (**AppIcon**) **và** bản mark nhỏ dùng cho empty-state/splash.
- iOS AppIcon phải đủ bộ kích thước Xcode yêu cầu; Android bắt buộc **adaptive icon**
  (`mipmap-anydpi-v26` + foreground/background) và đủ mật độ `mdpi…xxxhdpi`.

## 4. Hành vi đúng phải giữ nguyên

- Ảnh bắt nguồn từ asset web; **không** vẽ lại logo bằng tay, **không** đổi màu/méo tỉ lệ.
- Không nhúng logo dạng base64/URL trong code màn hình; asset là **resource của nền tảng**.
- Giữ tỉ lệ khung và vùng đệm an toàn của adaptive icon (logo không bị launcher cắt).

## 5. Tiêu chí nghiệm thu (AC)

- [ ] `web/public/brand-mark.png` → iOS `AppIcon.appiconset` **đủ mọi kích thước** Xcode yêu cầu, và
      Android `mipmap-*` **đủ mật độ** + `mipmap-anydpi-v26/ic_launcher.xml` (adaptive).
- [ ] Có `imageset` cho mark/logo/hero-mark; màn hình đọc qua **tên asset**, không qua URL.
- [ ] **0** tham chiếu asset của web trong `ios/**` và `android/**`
      (`grep -rn "fbuddy.meetflowai.site/.*\.\(png\|svg\)" ios android` ⇒ rỗng).
- [ ] Ảnh chụp màn hình chính **khi tắt mạng** vẫn hiện đủ logo/icon.
- [ ] Ảnh chụp **390×844** cho: (a) màn hình có logo, (b) launcher/home screen thấy icon Android,
      (c) icon iOS trên màn hình chính.
- [ ] Không file nào ngoài whitelist bị thay đổi.

## 6. Lệnh nghiệm thu (Mac chạy **đúng** lệnh này)

```bash
node ops/verify-design-parity.mjs --section assets
```

> Chưa tồn tại — Mac tạo cùng GATE 1; phải chạy được trên Mac. Nếu chưa có ⇒ `blocked`,
> **không** tự viết script thay thế, **không** hạ tiêu chí (`RULE-DELEGATE-FB-006`, `-012`).

## 7. Bằng chứng bắt buộc

| # | Bằng chứng | Tên file gợi ý |
|---|---|---|
| 1 | Output thật của `node ops/verify-design-parity.mjs --section assets` | trong `done --evidence` |
| 2 | Ảnh chụp **390×844** màn hình có logo (chế độ máy bay/tắt mạng) | `docs/design/ui-02-ios-390x844.png` |
| 3 | Ảnh chụp **390×844** icon trên màn hình chính iOS | `docs/design/ui-02-ios-icon.png` |
| 4 | Ảnh chụp **390×844** launcher Android thấy icon (adaptive) | `docs/design/ui-02-android-icon.png` |
| 5 | Danh sách kích thước đã sinh (đường dẫn + px) | bảng trong báo cáo |
| 6 | Output grep chứng minh không hot-link | |

`done --evidence "cmd=… ; kết quả=… ; file=… ; rag=<đường dẫn entry RAG đã ghi>"`.

## 8. Phụ thuộc / việc bị chặn

- **Phụ thuộc Mac:** `ops/verify-design-parity.mjs` phải tồn tại.
- **Phụ thuộc Mac:** khung project iOS/Android phải dựng được để chụp ảnh icon.
- Nếu công cụ tạo icon (sips/ImageMagick/…) không có trên Windows ⇒ ghi `blocked` kèm output lỗi thật;
  **không** tự đổi sang cách khác mà không báo.
- Ghi chú cho Mac: đường dẫn `web/public/**` **đã được xác minh là tồn tại** trong phiên này
  (xem `.privatefbuddy/knowledge/DESIGN/KD-002-logo-icon-tu-web.md`).
