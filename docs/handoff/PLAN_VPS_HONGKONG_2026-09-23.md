# PLAN — VPS RELAY THẬT Ở HONG KONG (đề xuất 23/09/2026)

> Mục tiêu: **5G chạy được như Wi-Fi**. Hiện 5G chết vì **IP node Việt Nam bị chặn/giả bắt tay**;
> thêm một VPS ở Hong Kong là cách sửa đúng tầng (đường đi), không phải tầng đo.

## 1. Vì sao phải thêm node (bằng chứng đo trên Z Fold5, Unicom 5G, 23/09/2026)

| Phép đo (VPN TẮT) | Kết quả | Kết luận |
|---|---|---|
| `speed.cloudflare.com/__down` 20 MB | **21,4 Mbps** | 5G **không** yếu |
| `meetflowai.site/v1/downloads/android` 20 MB | **19,0 Mbps** | domain mình **không** bị bóp |
| TLS sống dài 60 s @30 KB/s tới cả 3 host | đủ 60 s, ~30.9 KB/s | nhà mạng **không** cắt TLS sống dài |
| `connect()` TCP tới node-2 `165.101.114.162:8443` | **2–4 ms** | **BẮT TAY GIẢ** (RTT thật phải 40–100 ms) |
| `connect()` tới node-1 `103.173.155.50:8443` | **2,7 ms** | cũng giả |
| Qua tunnel trên 5G (cầu WS) | **13–109 kbps**, `loss=30–80%` | cầu WS cũng không lên được |
| Qua tunnel trên Wi-Fi (đường trực tiếp, 114 ms) | **5,2 Mbps** | cùng app, cùng node → chỉ khác đường vào |

⇒ Chặn nằm ở **đường vào node VN từ mạng di động Trung Quốc**, không phải ở app, không phải ở Cloudflare,
không phải ở băng thông. Node HK (RTT 10–40 ms từ miền Nam TQ, IP HK thường không bị xử như IP VN)
giải quyết đúng chỗ này.

## 2. Thiết kế đề xuất

**Một VPS Hong Kong, chạy 3 thứ (giống node-2 để dùng lại toàn bộ code/kinh nghiệm):**

| Thành phần | Vai trò | Cổng |
|---|---|---|
| `hysteria.service` (hysteria2, có **salamander obfs**) | đường dữ liệu chính cho client TQ | **UDP 443** (dự phòng 8443) |
| `wsrelay.js` (bản trong repo, `sha256 acee1382…`) | cầu WS khi UDP bị chặn | TCP **127.0.0.1:7785** (hy) + **7783** (wg) |
| Caddy | TLS + route `/relay/*` cho cầu WS | TCP 443 (Cloudflare proxy) |

**Hai đường vào cho khách (để app tự chọn theo số đo):**
1. **Trực tiếp**: `hy2://<IP_HK>:443` (UDP, obfs) — nhanh nhất khi không bị chặn.
2. **Qua Cloudflare**: `wss://api.meetflowai.site/relay/hkhy` → Caddy (node-2) → cầu WS tới VPS HK.
   *(Cách này chạy được ngay mà KHÔNG cần domain riêng cho VPS HK; chỉ thêm 1 route trong Caddyfile.)*

**Khai vào control plane** (`exit_nodes`): thêm hàng node HK với `ws_relay_url = wss://api.meetflowai.site/relay/hkhy`,
`hy_relay_url = hy2://<IP_HK>:443`, và ưu tiên node này cho **mạng di động TQ**. App đã đọc cấu hình này
theo từng node (`ws-relay: node … -> relay wss://… (control plane cấp)`) ⇒ **không cần sửa app** để dùng node mới.

## 3. Việc phải làm (theo thứ tự)

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | Mua/thuê VPS HK (1 vCPU/1 GB là đủ; cần **UDP không bị chặn**, băng thông ≥ 100 Mbps) | chủ dự án | ưu tiên nhà cung cấp có IP sạch với TQ (Aliyun/Tencent HK quốc tế, Vultr/DigitalOcean HK…) |
| 2 | Cài `hysteria` server + `wsrelay.js` + Caddy (copy nguyên cấu hình node-2) | agent server | dùng lại unit/systemd + script đã có |
| 3 | Thêm route `/relay/hkhy` + `/relay/hkwg` vào Caddyfile node-2, reload Caddy | agent server | mẫu có sẵn ở dòng 24–25 của `/etc/caddy/Caddyfile` |
| 4 | Thêm node HK vào control plane + đặt ưu tiên cho mạng di động | owner `windows` (vùng bảo vệ) | file `control-plane/src/index.js` — **chỉ harness Windows được sửa** theo AGENTS.md §6b |
| 5 | Nghiệm thu theo §4 dưới | chủ dự án + em | phải đo trên 5G thật |

## 4. Nghiệm thu (dùng đúng lệnh §3c của `docs/YEU_CAU_TOC_DO_ON_DINH.md`)

```bash
# trên máy, VPN BẬT, mạng 5G:
curl -s -o /dev/null -w 'tunnel: %{speed_download}B/s\n' --max-time 25 \
  'https://speed.cloudflare.com/__down?bytes=20000000'
# và đọc log:
adb shell "grep -E 'chon-duong|sampler nguồn byte|bw: sample|tunnel: UP' \
  /sdcard/Android/data/com.privatevpn.app.dev/files/diagnostics.log | tail -12"
```

**Đạt khi (trên 5G):**
1. `connect()` tới node HK cho **RTT 10–60 ms** (hợp lý), **không** còn 2–4 ms;
2. `observed` ≥ **8.000 kbps** giữ ≥ 10 phút (A1) — hiện trên 5G là 13–109 kbps;
3. `chon-duong` chọn **TRỰC TIẾP** tới node HK (không phải lùi về cầu WS) và tunnel không bị
   `tunnel UP nhưng không có gói nào qua`;
4. Không có chuỗi dựng lại dày: ≤ 1 lần/30 phút (A4).

## 5. Việc Android đã làm để node HK phát huy tác dụng (không cần chờ)

- **v31** (`48498b7`): không tin bắt tay TCP nhanh bất khả thi (< 25 ms) và **ghi nhớ đường trực tiếp đã
  chết trên mạng đó** ⇒ khi có node HK, app sẽ đo được RTT thật và chọn nó, thay vì lặp lại việc chọn
  nhầm node VN bị chặn.
- **v30** (`8f949f8`): số khai không tự bóp khi tải kiểu adaptive (Netflix).
- **v29** (`86944de`): số đo tốc độ phản ánh đúng mọi transport — nhờ vậy mới nhìn ra node HK nhanh/chậm ra sao.

## 6. Rủi ro & lưu ý

- VPS HK vẫn có thể bị chặn theo thời điểm; vì vậy **giữ node VN + cầu WS** làm đường lùi, không thay thế.
- Nếu UDP 443 bị chặn ở một số mạng, cầu WS `/relay/hkhy` là đường vào thứ hai (đã có sẵn hạ tầng).
- Chi phí: 1 VPS nhỏ ~5–10 USD/tháng; băng thông HK về TQ thường tốt hơn VN rõ rệt.
- Sau khi có IP HK, **đo ngay bằng §4 trước khi mở cho khách** — nếu RTT > 80 ms hoặc tốc độ < 8 Mbps
  thì đổi nhà cung cấp/IP khác (IP HK "bẩn" cũng bị xử).
