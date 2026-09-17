# FlowTech Signature — theme dùng chung cho mọi sản phẩm

Nguồn gốc: popup quảng cáo hệ sinh thái trên FlowGpt (`web/public/promo.css`).
Đây là **hợp đồng style** để FlowGpt, trang buy, admin và control panel trông như một
sản phẩm duy nhất. Mọi giá trị dưới đây là con số thật đang chạy, không phải mô tả.

## 1. Token

| Token | Giá trị | Dùng ở đâu |
|---|---|---|
| `--accent` | `#33C773` | màu thương hiệu, nút chính, badge OK |
| `--accent-2` | `#22D3EE` | đầu kia của gradient, hào quang |
| `--accent-3` | `#7C3AED` | điểm nhấn cuối của viền gradient |
| `--accent-text` | `#05202A` | chữ trên nền gradient sáng |
| `--sig-bg` | `#0A1F3B` | nền navy (dark theme) |
| `--sig-bg-deep` | `#071628` | đáy của gradient nền card |
| `--sig-bg-top` | `#14406C` | đỉnh sáng của gradient nền card |
| `--sig-text` | `#EAF2FF` | chữ chính trên nền navy |
| `--sig-muted` | `rgba(234,242,255,0.74)` | chữ phụ |
| `--sig-faint` | `rgba(234,242,255,0.5)` | chú thích nhỏ |
| `--sig-mint` | `#7FE6C0` | nhãn eyebrow (chữ in hoa nhỏ) |
| `--sig-line` | `rgba(255,255,255,0.12)` | đường viền mảnh trên nền navy |

Bán kính: card lớn **22px**, card con **16px**, nút **11px**, chip/badge **999px**.

## 2. Công thức bắt buộc

**Nền card (navy):**
```css
background: radial-gradient(130% 120% at 0% 0%, #14406c 0%, #0a1f3b 55%, #071628 100%);
```

**Viền gradient 1px (không dùng border):**
```css
.card--sig::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
  background: linear-gradient(135deg, #33c773, #22d3ee 46%, #7c3aed);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: .85; pointer-events: none;
}
```

**Hào quang phía trên card:**
```css
.card--sig::after {
  content: ""; position: absolute; top: -70px; left: 12%; width: 60%; height: 150px;
  background: radial-gradient(closest-side, rgba(51,199,115,.4), transparent);
  filter: blur(30px); pointer-events: none;
}
```

**Nút chính:**
```css
background: linear-gradient(135deg, #33c773, #22d3ee);
color: #05202a; border-radius: 11px;
box-shadow: 0 10px 24px -10px rgba(34,211,238,.75);
/* hover */ transform: translateY(-1px); box-shadow: 0 14px 30px -10px rgba(51,199,115,.8);
```

**Nút phụ:** nền `rgba(255,255,255,.07)`, viền `1px solid rgba(255,255,255,.14)`,
hover nền `rgba(255,255,255,.14)` + `translateY(-1px)`.

**Nhãn eyebrow:** `font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #7fe6c0; font-weight: 700`.

## 3. Animation

| Tên | Công thức | Dùng cho |
|---|---|---|
| `fade` | `opacity 0 → 1`, `.28s ease-out` | backdrop, overlay |
| `rise` | `opacity 0 + translateY(16px) scale(.97)` → `none`, `.36s cubic-bezier(.22,1,.36,1)` | card, modal, panel mới hiện |
| `slide-in` | `translateY(8px) + opacity 0` → `none` | toast, dòng mới trong danh sách |
| `spin` | `rotate(360deg) .7s linear infinite` | spinner |
| hover card | `translateY(-2px)` + đổi `border-color` sang `rgba(51,199,115,.45)` | card bấm được |

Tôn trọng người dùng: bọc trong `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }`.

## 4. Áp vào từng sản phẩm

| Sản phẩm | Việc cần làm |
|---|---|
| **FlowGpt** (`web/src/styles.css`) | ✅ **ĐÃ ÁP** (mục "FLOWTECH SIGNATURE THEME"): token + nút chính gradient + viền gradient cho card nổi bật (gói nạp, chợ kỹ năng, panel giá) + `sig-rise` khi card/modal hiện. |
| **Trang buy** (`flowvpn-cp` → `src/payments.js`, `buyPageHTML`) | ✅ **ĐÃ ÁP** (`/buy`, `/ai/buy`, `/buy/success`, `/buy/cancel`, `/buy/status`). |
| **Admin + control panel** (`flowvpn-cp` → `src/admin-page.js`) | ✅ **ĐÃ ÁP** (`/PrivateVPN/Admin`). |
| **Popup hệ sinh thái** | Đã là bản gốc — giữ nguyên, không đổi. |

### Rollback (1 lệnh, chỉ control plane)

```bash
cd /root/flowvpn-cp/src
cp payments.js.bak-theme-20260917-172919 payments.js
cp admin-page.js.bak-theme-20260917-172919 admin-page.js
systemctl restart flowvpn-cp
```


## 5. Quy tắc

1. **Không hard-code màu trong component**: mọi màu đi qua biến CSS.
2. Chữ trên nền navy luôn dùng `--sig-text`/`--sig-muted`; chữ trên nền gradient sáng dùng `--accent-text`.
3. Viền gradient là **1px** và chỉ dùng cho card nổi bật (tối đa 1–2 card mỗi màn hình), không dùng cho bảng/danh sách dài.
4. Animation chỉ ở lần xuất hiện đầu, không lặp lại khi cuộn.
5. Mọi thay đổi phải kèm ảnh chụp trước/sau và `prefers-reduced-motion` vẫn dùng được.
