# HANDOFF — Tối ưu ảnh trang chủ/trang bán (meetflowai.site) — 25/09/2026

- **Từ:** harness Mac (publisher iOS/macOS) · **Cho:** **harness Windows** (owner `windows` của
  `control-plane/**` — AGENTS.md §6b) + **agent server node-2** (header cache ở Caddy)
- **Vì sao:** chủ dự án báo *"site meetflowai.site vào chậm"*. Đo thật ngày 25/09/2026 — **không phải
  origin chậm**, mà **6 ảnh logo nặng 588 KB = 95% trọng lượng trang** trong khi chỉ hiển thị 34–54 px.
- **Gói đã soạn sẵn:** `docs/handoff/web-assets-2026-09-25/` (ảnh đã tối ưu + `sizes.json` + cổng chặn).

## 1. Số đo thật (bằng chứng)

| Hạng mục | Trước | Ghi chú |
|---|---|---|
| Origin node-2 (qua Caddy, loopback) | TTFB **0,078–0,089 s** | origin KHÔNG nghẽn |
| HTML trang chủ | 34.735 B, `content-encoding: br` | đã nén brotli ✓ |
| Từ máy VN/TQ → Cloudflare (edge HKG) | TLS 0,24–0,39 s · TTFB **0,30–0,75 s** (p50 0,475 s) | độ trễ biên là chi phí nền |
| Tốc độ tải ảnh từ Cloudflare | **190–300 KB/s**, có mẫu rơi **37,9 KB/s** (ảnh 161 KB mất **4,25 s**) | quyết định cảm giác "chậm" |
| **6 ảnh logo** | **602413 B = 588 KB** | 256×256 / 512×512 PNG RGBA, hiển thị 34–54 px |
| `cf-cache-status` HTML | `DYNAMIC` | mỗi lần vào đều về origin |
| `cache-control` ảnh | `public, max-age=14400` (4 h) + `REVALIDATED` | **origin không set header** ⇒ Cloudflare áp mặc định 4 h |

Suy ra: mạng tốt lần vào đầu ≈ **3–3,5 s** (riêng logo ~3 s); lúc mạng TQ chập chờn (37,9 KB/s) riêng
logo ≈ **15 s**. Đây là toàn bộ nguyên nhân "vào chậm".

## 2. Gói có gì

| Thư mục | Nội dung | Tổng | Cách dùng |
|---|---|---|---|
| `tier1-png8-samesize/` | 6 PNG-8 **giữ nguyên kích thước** (256/512) | **97258 B = 95 KB** (−84%) | chép đè vào `control-plane/assets/` — **không đổi code** |
| `tier2-display-size/png` | 6 PNG-8 **đúng 2× cỡ hiển thị** (108/68/192) | **30396 B = 30 KB** (−95%) | cần khai `width/height` (xem §4) |
| `tier2-display-size/webp` | 6 WebP cùng cỡ | **19810 B = 19 KB** (−97%) | `<picture>` (xem §4) |
| `tier2-display-size/avif` | 6 AVIF cùng cỡ | **14767 B = 14 KB** (−98%) | tuỳ chọn, Safari ≥ 16.4 |
| `sizes.json` | số đo + sha256 từng file | — | máy đọc |

**Tier 1 — bảng file (dùng ngay được):**

| File | Trước | Sau | sha256 |
|---|---|---|---|
| `vpnflow-logo.png` | 81646 B | **11659 B** | `7a9da049ad92553f…` |
| `meetflow-logo.png` | 102807 B | **17357 B** | `a086bc681a3016d5…` |
| `fbuddy-logo.png` | 135591 B | **16333 B** | `126d2b2c91adb885…` |
| `supermom-logo.png` | 160963 B | **28326 B** | `d4fb123a3e15f760…` |
| `flowtech-mark.png` | 34851 B | **8248 B** | `dd6921239ce24bc5…` |
| `flowtech-icon.png` | 86555 B | **15335 B** | `f72bb3e8571e5425…` |

> ⚠️ Lưu ý chất lượng: 2 logo `vpnflow-logo.png` / `meetflow-logo.png` còn được **trang bán `/buy`
> hiển thị ở cỡ gốc 256 px** (`payments.js` → `<img class="brand-logo">` **không có width/height**).
> Ở 256 px, PNG-8 có **hơi lốm đốm ở nền tối** (xem ảnh bằng mắt thường mới thấy; ở 54–108 px không
> thấy). Muốn tuyệt đối sạch: làm **Tier 2 + khai `width` cho trang bán** (§4) — ảnh 108 px nhìn sạch.

**Tier 2 — bảng file:**

| File | PNG-8 (cỡ hiển thị) | WebP | AVIF |
|---|---|---|---|
| `vpnflow-logo.png` | 4271 B @108x108 | 2716 B | 2078 B |
| `meetflow-logo.png` | 5280 B @108x108 | 2480 B | 1959 B |
| `fbuddy-logo.png` | 4820 B @108x108 | 2284 B | 1936 B |
| `supermom-logo.png` | 8556 B @108x108 | 4738 B | 3403 B |
| `flowtech-mark.png` | 2541 B @68x68 | 2050 B | 1995 B |
| `flowtech-icon.png` | 4928 B @192x192 | 5542 B | 3396 B |

## 3. TIER 1 — làm ngay (không đổi code, ~5 phút)

```bash
cd <repo>
cp docs/handoff/web-assets-2026-09-25/tier1-png8-samesize/*.png control-plane/assets/
bash scripts/check-web-assets-weight.sh          # phải exit 0, tổng 95 KB
git add control-plane/assets/*.png
git commit -m "perf(web): toi uu 6 anh logo trang chu/trang ban — 588 KB -> 95 KB (PNG-8, giu nguyen kich thuoc)"
bash scripts/server-agent/deploy-control-plane.sh --files assets   # hoặc cách deploy hiện hành của owner windows
```

## 4. TIER 2 — đúng cỡ hiển thị (tuỳ chọn, thêm ~65 KB giảm)

Làm **sau** Tier 1 (ghi đè tiếp). Cần 3 điểm sửa trong `control-plane/src/` (đều thuộc owner `windows`):

1. **`index.js` — thêm MIME cho `.webp`** (route `/assets/:file`, map `allowed` ~dòng 765):
   ```js
   "vpnflow-logo.webp": "image/webp",
   "meetflow-logo.webp": "image/webp",
   "flowtech-icon.webp": "image/webp",
   "flowtech-mark.webp": "image/webp",
   "fbuddy-logo.webp": "image/webp",
   "supermom-logo.webp": "image/webp",
   ```
2. **`home-page.js` — logo sản phẩm (dòng ~964, đang `width="54"`) và mark (dòng ~1001, `width="34"`)**:
   ```js
   const LOGO_IMG = `<picture>
     <source srcset="/assets/flowtech-mark.webp" type="image/webp">
     <img class="mark" src="/assets/flowtech-mark.png" width="34" height="34" alt="" decoding="async">
   </picture>`;
   // ...và chỗ render logo sản phẩm:
   ${icon ? `<picture>
     <source srcset="${esc(icon.replace(/\.png$/, ".webp"))}" type="image/webp">
     <img class="prod-logo" src="${esc(icon)}" alt="" width="54" height="54" loading="lazy" decoding="async">
   </picture>` : ""}
   ```
3. **Trang bán (`payments.js` + CSS)** — khai cỡ để dùng ảnh 108 px (thay vì để ảnh render ở 256 px):
   ```css
   .brand-logo { width: 108px; height: 108px; }
   ```

## 5. Cache (giảm mạnh lần vào thứ hai trở đi)

1. **Origin set header tường minh** — hiện origin KHÔNG set nên Cloudflare áp mặc định 4 h.
   Trong `index.js` route `/assets/:file`, thêm:
   ```js
   res.type(type)
      .set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400")
      .sendFile(file);
   ```
   (muốn `immutable, max-age=31536000` thì phải thêm `?v=<ngày>` vào 6 URL ảnh — nếu không, đổi logo
   sau này khách còn giữ bản cũ tới 1 năm.)
2. **Caddy (node-2)** — nếu muốn chặn ở tầng biên:
   ```
   @assets path /assets/*
   header @assets Cache-Control "public, max-age=604800, stale-while-revalidate=86400"
   ```
3. **Cloudflare** — đặt *Browser Cache TTL = Respect Existing Headers*; tuỳ chọn tạo Cache Rule cho
   `/assets/*` (Edge TTL 1 tháng). Riêng HTML (`DYNAMIC`) cân nhắc `s-maxage=300` + purge khi deploy
   (đừng để khách thấy bản cũ sau khi phát hành).

## 6. Nghiệm thu (bắt buộc)

```bash
bash scripts/check-web-assets-weight.sh --url https://meetflowai.site   # phải exit 0
curl -sS -o /dev/null -w "ttfb=%{time_starttransfer}s total=%{time_total}s\n" https://meetflowai.site/
for a in vpnflow-logo meetflow-logo fbuddy-logo supermom-logo flowtech-mark flowtech-icon; do
  curl -sS -o /dev/null -w "$a %{size_download} B %{time_total}s\n" "https://meetflowai.site/assets/$a.png"
done
```
Kỳ vọng: tổng ảnh **95 KB** (Tier 1) hoặc **30 KB** (Tier 2) · `cache-control` có `max-age` ≥ 604800
· lần vào đầu giảm còn **~0,5–1 s** (mạng tốt) thay vì 3–3,5 s.

## 7. Rollback + lưu ý

- Rollback: `git revert` commit ảnh rồi deploy lại (ảnh gốc vẫn nằm trong lịch sử git:
  sha256 gốc ghi trong `sizes.json`, cột `orig`).
- `control-plane/**` là **vùng bảo vệ §6b**: chỉ owner `windows` commit/deploy. Máy Mac **không** sửa.
- Deploy theo luật: **commit trước, deploy sau**.
- Cổng `scripts/check-web-assets-weight.sh` (Mac soạn) nên được chạy trong pipeline deploy của owner
  windows để không tái phát (ngưỡng `MAX_ONE_KB=40`, `MAX_TOTAL_KB=120`).
