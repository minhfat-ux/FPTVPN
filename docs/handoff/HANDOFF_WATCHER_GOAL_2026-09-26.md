# MỤC TIÊU BACKEND sau sự cố 26/09/2026 + NHIỆM VỤ MỚI CHO WATCHER

> Chủ dự án chốt: *"backend cần đặt mục tiêu không để xảy ra các lỗi như vừa rồi sau sự cố hôm nay,
> thêm các nhiệm vụ mới cho watcher để phát hiện sớm và tự sửa"*.

## 0. MỤC TIÊU (đo được)

| # | Mục tiêu | Ngưỡng |
|---|---|---|
| G1 | **Phát hiện** mọi sự cố thuộc 5 lớp dưới | ≤ **2 phút** |
| G2 | **Tự sửa** hoặc **báo Telegram** | ≤ **3 phút** |
| G3 | **Watcher không bao giờ tự chặn đường của chính nó** (§7e) | 0 lần |
| G4 | Không có sự cố nào **im lặng > 5 phút** | 0 lần |

## 1. WATCHER HIỆN TẠI BỎ SÓT GÌ (đo từ sự cố hôm nay)

| Sự cố thật hôm nay | `flowvpn-health-watch` có bắt? |
|---|---|
| Relay trả **426 nhưng KHÔNG chở gói** (phiên 30 s, `in=0f/0B`) | ❌ **KHÔNG** — chỉ kiểm HTTP 426 |
| Phiên bị cắt liên tục vì **`pong-timeout`** (5 phút/lần) | ❌ KHÔNG |
| **Thông lượng sụt** 25 Mbps → 0,5–2,6 Mbps | ❌ KHÔNG |
| **SSH quản trị bị chặn** (iptables chèn sai thứ tự) → mất 3 giờ | ❌ KHÔNG |
| Lỗi **enrollment token** (khách không vào được) | ❌ KHÔNG — chỉ kiểm unit `active` |
| Watcher **tự chặn đường mình** khi thao tác | ❌ KHÔNG |

## 2. NHIỆM VỤ MỚI CHO WATCHER (theo thứ tự ưu tiên)

### W1 — Đo ĐƯỜNG DỮ LIỆU THẬT (quan trọng nhất, bắt đúng lỗi hôm nay)
Mỗi 60 s: đọc `STATS` của từng `wsrelay` (đã có sẵn dòng `STATS active=N total=M in=… out=…`).
- `active > 0` **mà** `in`+`out` **không tăng trong 2 lần liên tiếp (≥2 phút)** ⇒ **BÁO** (đây là "426 nhưng không chở gói").
- `active = 0` liên tục **≥5 phút trong giờ cao điểm** ⇒ **BÁO** (không ai kết nối được).

### W2 — TỈ LỆ `pong-timeout`
Mỗi 5 phút: đếm số phiên đóng với `lý do: pong-timeout`.
- `> 10 phiên/5 phút` ⇒ **BÁO** (đường đang chập — ca hôm nay ~10 lần/giờ).

### W3 — SÀN THÔNG LƯỢNG
Mỗi 5 phút: đo tốc độ thật qua 1 relay (tải 5 MB).
- `< 5 Mbps` **3 lần liên tiếp** ⇒ **BÁO** (hôm nay: 0,5–2,6 Mbps, trước sự cố 25 Mbps).

### W4 — ĐƯỜNG QUẢN TRỊ SSH (bắt đúng ca iptables hôm nay)
Mỗi 5 phút:
- Kiểm `iptables -S INPUT`: có luật `DROP/REJECT` cho `dport 22` nằm **TRƯỚC** mọi `ACCEPT` không ⇒ **BÁO + tự chèn** `iptables -I INPUT 1 -i tailscale0 -j ACCEPT`.
- Kiểm `sshd` còn trả banner không (từ chính server: `timeout 5 bash -c "</dev/tcp/127.0.0.1/22"`) ⇒ **BÁO + `systemctl restart sshd`**.

### W5 — CONTROL-PLANE ENROLLMENT (bắt lỗi khách không vào được)
Mỗi 5 phút: gọi nội bộ `POST /v1/enrollment-tokens` (tài khoản test) rồi `consume` — nếu fail ⇒ **BÁO**.
Kèm **backup `auth.json` mỗi giờ, giữ 24 bản** (`/root/flowvpn-cp/data/backups/`) — vì `_load()` nuốt lỗi có thể xoá trắng dữ liệu.

### W6 — WATCHER TỰ BẢO VỆ (§7e)
Trước khi restart/stop **bất kỳ** unit đường khách:
- kiểm unit đó có đang chở phiên điều khiển không (như `flowvpn-safe-stop` đang làm — exit 3),
- **đặt auto-restore tách phiên TRƯỚC** (nohup), và **kiểm lại 426 sau** khi xong.

### W7 — KHÔNG IM LẶNG
Mọi lần watcher chạy mà **không** gửi tin, vẫn ghi 1 dòng `OK` vào log (đang có) — giữ nguyên.
Thêm: nếu **chính watcher** không chạy >3 phút ⇒ cron dự phòng `*/2` báo.

## 3. BẢN VÁ CODE KÈM THEO (không chỉ watcher)

| File | Sửa gì | Vì sao |
|---|---|---|
| `control-plane/src/auth-store.js` | `_load()` **KHÔNG** `catch { return emptyData() }` — phải ném lỗi + log; `_save()` ghi **nguyên tử** (`.tmp` → `rename`) như `ai-access-store.js` | Trả rỗng rồi `_save()` = **xoá sạch dữ liệu khách** |
| `/root/wsrelay.js` hoặc unit env | `PONG_TIMEOUT_MS` 20 s (mặc định trong file) / 60 s (env) → **120 s** | ✅ **ĐÃ LÀM 26/09 21:57** — xem §4 |
| `mac/PrivateVPNMac/NetworkConflictDetector.swift` | bỏ khớp **helper chạy nền** (`ovpnagent`) | Đã làm, 657/657 PASS |

## 4. ĐÃ THỰC HIỆN TRONG PHIÊN NÀY

- ✅ **`PONG_TIMEOUT_MS` 60000 → 120000** cho cả 4 relay (`/etc/systemd/system/relay-cf-*.service` dòng 10).
  Sao lưu: `/root/relay-units-backup-20260926-215725/`. Instance mới xác nhận `ping=15000ms pongTimeout=120000ms`.
  Xác minh ngoài: **2 vòng × 2 cửa = 426/426/426/426**, CP ok.
- ✅ Script: `/root/fix-pong-timeout.sh` (giữ lại để chạy lại/khôi phục).
- ⚠️ **Bài học**: lần đầu chạy script bị **giết giữa lúc restart** (SSH của agent đi qua chính `relay-cf-vn2hy`)
  ⇒ để lại relay **502 tạm thời**. Đã `systemctl start` khôi phục. ⇒ **W6 là bắt buộc**, không phải tuỳ chọn.
