# Node-2 (Flow2 / relay-server `165.101.114.162`) — ĐO & TỐI ƯU PERFORMANCE

_Ngày: 2026-10-23. Người làm: agent chính (SA). Yêu cầu chủ dự án: "check node 2, cải thiện performance cho nó"._

> ⚠️ **Đính chính mốc thời gian:** phiên này bắt đầu từ 01/10; **hôm nay là 2026-10-23** (Mac, server và header
> HTTP của Google đều khớp). Mọi log của ngày 01/10 trong các báo cáo trước là **của quá khứ**, không phải "hôm nay".

## 1. Số đo TRƯỚC khi sửa (baseline)

| Hạng mục | Số đo | Đánh giá |
|---|---|---|
| CPU | **1 vCPU** Xeon 8171M @2.6GHz · load `0.61/0.69/0.69` | 1 nhân cho 36 service |
| PSI (áp lực) | cpu `12.4%` (avg10) · io `2.8%` · memory `0.16%` | có stall CPU dù trung bình nhàn |
| RAM / SWAP | **961 MB** · used 575 · available 386 · **swap đã dùng 724 MB** | **thiếu RAM thật** |
| `vmstat` | `us 5–8% sy 4–7% id 81–90% wa 1–4%` | trung bình nhàn ⇒ nút cổ chai là **burst** |
| **qdisc eth0** | 🔴 **`pfifo_fast`** dù `net.core.default_qdisc=fq` | **BBR mất pacing** ← lỗi thật |
| `net.core.rmem_default`/`wmem_default` | 🔴 **212992 (208 KB)** trong khi `rmem_max` đã 16 MB | đệm mặc định quá hẹp |
| `net.core.optmem_max` | 131072 | thấp |
| `nf_conntrack_max` | 🔴 **8192** (đang dùng 1200) | trần thấp cho 75 peer + nhiều relay |
| UDP rcvbuf errors | 9.472.412 **tích luỹ 44 ngày**, nhưng **~0/giây hiện tại** | lịch sử, KHÔNG phải lỗi đang chảy |
| TCP retrans | 4,43M / 936M seg = **0,47%** | bình thường với đường TQ |
| Giới hạn FD | `LimitNOFILE=524288`, đang dùng 3200 | ✅ không phải nút cổ chai |
| `swappiness` | 10 | ✅ đã đúng |
| Đĩa | **87% (2,4 GB trống)** | rủi ro cho DB/log |
| Thông lượng 1 luồng (Cloudflare 50 MB) | **20,2 MB/s (~161 Mbps)** | mức tham chiếu |
| Tiến trình | 7 × `wsrelay.js` (Node, ~22 MB) + 2 × `wgrelay.js` + `hysteria` + `sing-box` + `caddy` (59 MB) + CP + bot + guard + watchdogs | ~36 service trên 1 nhân |

## 2. Đã sửa (3 thay đổi, **không restart dịch vụ nào**)

| # | Thay đổi | Vì sao | Bằng chứng |
|---|---|---|---|
| 1 | `tc qdisc replace dev eth0 root fq` + unit `flowvpn-qdisc.service` (+ script `/usr/local/bin/flowvpn-set-qdisc`, lấy NIC theo default route) — **enabled** | `default_qdisc=fq` **không** áp cho interface đã tồn tại ⇒ BBR chạy trên `pfifo_fast`, mất pacing | `qdisc fq 8001: … (dropped 0 overlimits 0)` · restart unit ⇒ *"đã là fq (không đổi)"* (idempotent) |
| 2 | `/etc/sysctl.d/99-flowvpn-perf.conf` += `rmem_default=1048576`, `wmem_default=1048576`, `optmem_max=262144` | đệm mặc định 208 KB áp cho socket **không tự đặt** (WireGuard kernel, sing-box, relay UDP) ⇒ hẹp khi burst | `sysctl -p` lại **không lỗi**, giá trị đọc ra đúng |
| 3 | `nf_conntrack_max` 8192 → **32768** | trần cũ quá thấp cho 75 peer + NAT nhiều relay | đang dùng `1148/32768` |

**Nghiệm thu sau khi sửa (đo lại):** 6/6 relay `=426` · `flowvpn-cp /v1/health` `{"status":"ok"}` ·
**UDP rcvbuf errors +0 trong 10 giây** · TCP retrans +32/10s (bình thường) · toàn bộ service đường khách `active`
(caddy, cp, hysteria, 4 relay, wgrelay, sing-box) · `flowvpn-qdisc.service` = **enabled** (sống qua reboot).
Đĩa về **81% (3,7 GB trống)**.

⚠️ **Nói thẳng:** thông lượng đỉnh **không tăng** (17,4 MB/s so với 20,2 MB/s — đo 1 luồng, nhiễu, chạy song song
với chính lệnh đo). `fq` + đệm lớn cải thiện **jitter/mất gói khi đông**, không nâng trần băng thông. Không được báo cáo
"nhanh hơn 2×" — không có bằng chứng đó.

## 3. Việc CHƯA làm — cần chủ dự án quyết (kèm lý do)

1. **Nâng cấu hình VPS: 2 vCPU + 2 GB RAM** ← *đòn bẩy lớn nhất*. Bằng chứng: 1 nhân / 961 MB cho 36 service;
   **swap đã dùng 724 MB**; PSI cpu 12,4% khi tải nhàn. Không có tuning nào bù được thiếu RAM.
2. **Gộp 7 tiến trình `wsrelay.js` thành 1** (mỗi cái ~22 MB + overhead V8 ≈ 150 MB+) ⇒ giảm RAM + chi phí
   chuyển ngữ cảnh trên 1 nhân. **Là thay đổi code — đang đóng băng, cần chủ dự án mở băng.**
3. **Ưu tiên CPU cho đường khách**: `Nice=-5` cho `hysteria` + `relay-cf-*`, CP/Caddy để mặc định ⇒ giảm độ trễ khi
   CPU bị tranh. **Cần restart dịch vụ đường khách** ⇒ phải theo `AGENTS §7e.1` (đặt auto-restore tách phiên trước).
4. **Dọn đĩa ~640 MB**: `/root/upload-145` (227 MB), `/root/upload-146` (227 MB), `/root/apk-upload` (185 MB) —
   **đã kiểm: KHÔNG file nào được Caddy trỏ tới** (bản phục vụ khách nằm ở `/var/www/dl`, `caddy:caddy`, phải GIỮ).
   Chỉ xoá khi chủ dự án xác nhận không cần bản staging.
5. **`sing-box`** (VLESS-over-WS) đang active, Caddy trỏ `reverse_proxy 127.0.0.1:8081` (`Caddyfile:63`),
   hiện **0 kết nối**. Nếu đây là đường dự phòng còn dùng thì giữ; nếu bỏ rồi ⇒ tắt để nhẹ máy. **Cần chủ dự án xác nhận.**

## 4. Cách rollback (nếu cần)

```bash
# qdisc
tc qdisc replace dev eth0 root pfifo_fast && systemctl disable --now flowvpn-qdisc.service
# sysctl (khôi phục nguyên trạng)
cp -a /etc/sysctl.d/99-flowvpn-perf.conf.bak-<ts> /etc/sysctl.d/99-flowvpn-perf.conf && sysctl -p /etc/sysctl.d/99-flowvpn-perf.conf
# hoặc đặt lại từng khoá
sysctl -w net.core.rmem_default=212992 net.core.wmem_default=212992 net.core.optmem_max=131072 net.netfilter.nf_conntrack_max=8192
```

## 5. Nghiệm thu phía KHÁCH (bắt buộc, chưa làm)

Tuning chỉ có nghĩa nếu khách thấy khác. **Cần chủ dự án đo trên máy thật** (Mac/iPad đang chọn **Flow2**):
tốc độ tải + xem video + độ trễ vài phút. Tiêu chí: không tệ hơn trước, và ít "khựng" hơn khi mạng TQ yếu.
