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

## 6. TẠM DỪNG — 2026-10-23 20:25 (+07), chủ dự án: *"mai làm"*

**Trạng thái lúc dừng (đã kiểm ngay trước khi dừng):**

| Hạng mục | Trạng thái |
|---|---|
| 3 thay đổi ở §2 | ✅ đã áp **và sống qua reboot** (`flowvpn-qdisc.service` enabled, `sysctl -p` không lỗi) |
| 6/6 relay | ✅ `=426` |
| `flowvpn-cp /v1/health` | ✅ `{"status":"ok"}` |
| Service đường khách | ✅ `caddy · cp · hysteria · relay-cf-vn2hy/vn2wg/vn3hy/vn3wg · wgrelay-wg · sing-box` đều `active` |
| UDP rcvbuf errors | ✅ `+0` trong 10 s |
| Đĩa | 81% (3,7 GB trống) — đủ vài ngày, không gấp |
| Việc dở dang | **KHÔNG có** — cả 3 thay đổi trọn vẹn, mỗi cái có lệnh rollback riêng (§4) |

**Hàng đợi cho lần sau — theo thứ tự em đề nghị:**
1. **Chủ dự án đo phía khách trên Flow2** (tiêu chí §5) ⇒ quyết **giữ hay rollback**. Đây là việc chặn mọi việc khác.
2. **Nâng VPS 2 vCPU + 2 GB RAM** (quyết định chi phí) — đòn bẩy lớn nhất.
3. **Gộp 7 × `wsrelay.js` → 1 tiến trình** — cần mở đóng băng code.
4. **`Nice=-5` cho `hysteria` + `relay-cf-*`** — cần làm theo `AGENTS §7e.1`.
5. **Dọn ~640 MB staging** (`/root/upload-145`, `/root/upload-146`, `/root/apk-upload`) — chờ xác nhận;
   **xác nhận `sing-box` còn dùng hay không**.

**Việc khác đang mở (không liên quan node-2):** đổi IP Flow3 sang **ASN/dải khác** `103.6.234.0/23`
(chờ chủ dự án cho biết **nhà cung cấp** để soạn đơn) · runbook đổi IP Flow3 đã có, chưa chạy.

---

## 7. SỰ CỐ 25/10/2026 — **SESSION 30 NGÀY HẾT HẠN**, app hiện lỗi thô *"Valid user session required"*

**Triệu chứng:** iPad/iPhone VPNFlow báo lỗi; chữ thật là `{"error":"Unauthorized","message":"Valid user session required"}`
(đây là câu của **API**, không phải lỗi mạng). Chủ dự án hỏi: *"sao session lại hết hạn, ảnh hưởng người dùng,
thế cần phải có alert hoặc Force user login lại chứ."*

### 7a. Vì sao hết hạn — và **ai chịu trách nhiệm**

- `control-plane/src/auth-store.js:6` → **`SESSION_TTL_MS = 30 ngày`**, tính từ lúc đăng nhập. **Hết hạn là hành vi
  thiết kế**, không phải sự cố.
- **Không do vòng xoay khoá 01/10:** session được lưu bằng `hashToken()` = **sha256(token)** (`auth-store.js:761`),
  KHÔNG ký bằng `VERIFY_LINK_SECRET` ⇒ đổi secret **không** làm chết session. Chỉ có 2 đường chết:
  **quá 30 ngày** hoặc **user bị revoke** (`findSession`, `auth-store.js:155-163`).
- Máy đăng nhập đợt ~25/09 ⇒ hết hạn ~25/10 ⇒ **nhiều máy chết cùng lúc** (đúng như đang thấy).

### 7b. 🔴 ĐÂY MỚI LÀ LỖI THẬT: app không xử lý 401

Khi session chết, client **hiển thị nguyên văn câu lỗi tiếng Anh của API** thay vì: **xoá token cũ → mở màn hình
đăng nhập → báo "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại"**. Thiếu nhánh xử lý **401-session-expired**
ở client ⇒ khách tưởng app hỏng. **Cần sửa ở cả 4 nền tảng** (iOS · macOS · Android · Windows).

### 7c. Alert + Force re-login — đề xuất (chờ chủ dự án chốt)

| # | Việc | Loại | Ghi chú |
|---|---|---|---|
| A | **401 ⇒ clear session + mở Login** (kèm thông điệp rõ ràng) | client, **BẮT BUỘC** | sửa 4 app |
| B | **Sliding expiry**: gia hạn khi còn < 7 ngày *và* user đang dùng | server + client | giảm ~90% ca này |
| C | Banner "Phiên sẽ hết hạn sau 3 ngày" | client | phòng ngừa |
| D | **Alert server**: script đọc `auth.json` + `devices.json` mỗi 10 phút → *(i)* số session hết hạn/24h vượt ngưỡng, *(ii)* thiết bị `active` mà `lastSeenAt` im > N giờ ⇒ gửi `flowvpn-notify` | server, **không cần sửa code app** | làm được ngay |
| E | Log/counter 401 trong CP | server | `control-plane/src/index.js` = **vùng bảo vệ của Windows** (`AGENTS §6b`) ⇒ phải phối hợp |
| F | Kiểm đường gửi email đăng nhập (Resend) còn sống | server | chưa kiểm được phiên này: **SSH bị cắt** |

### 7d. Ghi chép vận hành — SSH bị cắt giữa phiên (không phải sự cố production)

- Hiện tượng: TCP 22 **mở**, `SSH2_MSG_KEXINIT sent` xong **"Connection closed"** ngay; 443/API vẫn `health=200`.
- Nguyên nhân khả dĩ: cơ chế chống dò của sshd (OpenSSH `PerSourcePenalties`) / `flowvpn-autoban` phản ứng vì phiên này
  mở **quá nhiều kết nối SSH** liên tiếp. Tự hết sau cửa sổ phạt.
- **Việc cần làm khi vào lại:** (1) kiểm `journalctl -u sshd | grep -i "penalty\|MaxStartups"`, (2) xem log
  `flowvpn-autoban` có ghi IP `183.61.117.64` (IP công cộng của LAN hiện tại) không, (3) nếu autoban bắt oan thì
  thêm allowlist cho IP văn phòng/khách sạn đang dùng.

### 7e. ✅ ĐÃ LÀM — sửa iOS (chủ dự án mở đóng băng iOS, 25/10/2026) — commit `4ce0c55`

**Hành vi mới khi phiên 30 ngày hết hạn (trước: hiện nguyên văn `Valid user session required`, token chết vẫn giữ):**

| File | Thay đổi |
|---|---|
| `iOS/PrivateVPN/Services/SessionExpiryPolicy.swift` **(mới, thuần logic)** | `daysLeft()`, `bannerDaysLeft()` (≤3 ngày), `expiredMessage()`, `bannerMessage()` + `Notification.Name.flowvpnSessionExpired` |
| `Services/ControlAPIClient.swift` | `ClientError.sessionExpired` + `failure(http,data:)`: **401 + "user session"** ⇒ lỗi riêng + **phát thông báo** (3 chỗ dựng lỗi đã chuyển sang helper, không còn nuốt thành `.server(msg)`) |
| `Services/AuthSessionStore.swift` | cờ `sessionExpired`, `invalidate()` (xoá token trong Keychain), nghe thông báo ⇒ **tự xoá phiên**; `signOut()` xoá cờ |
| `LoginView.swift` | hiện rõ **"Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."** (vi/en) |
| `ContentView.swift` | **nhắc trước ≤3 ngày** (`SessionExpiryPolicy.bannerDaysLeft`) — không chặn dùng app |
| `VPNManager.swift` | thêm nhánh `.sessionExpired` (cổng typecheck bắt `switch` không exhaustive) |
| `project.yml` + `scripts/ios-typecheck.sh` | khai file mới cho **target macOS** (`ControlAPIClient` dùng chung; thiếu file ⇒ macOS không build). **Không đổi hành vi macOS.** |
| `scripts/ios-pure-logic-tests/*` | **+10 test** cho policy (mốc hạn, làm tròn xuống, nil/hỏng, ngưỡng banner 3 ngày, câu vi/en) |

**Cổng đã chạy (AGENTS §7b) — bằng chứng:**
- `bash scripts/ios-pure-logic-tests/run.sh` → **682/682 PASS, 0 FAIL**
- `python3 scripts/ios-lint-locks.py` → **ĐẠT**
- `bash scripts/ios-typecheck.sh` → **extension 0 lỗi · app 0 lỗi · macOS 0 lỗi** (có `-swift-version 6`)

**CHƯA làm (cần chủ dự án):**
1. **Build IPA** theo §7a (`dev-hysteria-build-env.sh` → archive → export → `ios-verify-ipa.sh`) để cài lên máy khách.
   — *Không bắt buộc để gỡ kẹt:* khách chỉ cần **đăng xuất + đăng nhập lại** là có phiên mới 30 ngày, cả trên bản đang cài.
2. **Parity**: macOS (401 → Login), Android, Windows — chưa sửa (đóng băng chỉ mở cho iOS).
3. **Sliding expiry** (tự gia hạn khi còn <7 ngày): phải sửa **server** `control-plane/src/index.js` =
   **vùng bảo vệ của harness Windows** (`AGENTS §6b`) ⇒ cần phối hợp, không tự commit.
