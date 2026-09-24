# Nới cửa sổ guard + gửi hướng dẫn cho 3 khách trả tiền chưa cài (24/09/2026)

- **Người làm:** DSH main agent (owner `windows`), trên node-2 (`flowvpn-guard.service`).
- **Yêu cầu của chủ dự án (nguyên văn):** *"nới cửa số ra, và cũng guide luôn cho 3 khách kia"*
  (sau khi em báo cáo 3 khách trả tiền có 0 thiết bị nằm ngoài cửa sổ 72h).
- **Trạng thái:** ✅ ĐÃ ÁP + ĐÃ GỬI + **3/3 email `delivered`**.

## 1. Vì sao

Rà "khách mới có cài và chạy app không" (24/09) thấy guard **bỏ sót khách trả tiền**:
`GUARD_NEW_WINDOW_H = 72` giờ ⇒ khách đăng ký >3 ngày mà **chưa từng cài** bị xếp `too_old` và
**không bao giờ** được nhắc, dù gói còn hạn. Cụ thể 3 khách (đã loại trừ khả năng họ nằm ở kênh
hồ sơ iOS `ios-devices.json` — không có):

| Khách | Đăng ký | Gói hết hạn | Thiết bị |
|---|---|---|---|
| `1971749828@qq.com` | 10/09/2026 | 09/12/2026 | 0 |
| `kimdungtq@vip.163.com` | 10/09/2026 | 10/10/2026 | 0 |
| `congtranquoc@gmail.com` | 13/09/2026 | 13/10/2026 | 0 |

## 2. Đã làm

1. **Nới cửa sổ 72 → 720 giờ (30 ngày)**, khớp **gói ngắn nhất** (`plans.json`: Monthly 30 ngày) ⇒ mọi
   khách còn hạn nằm trong tầm theo dõi.
   Sửa `/etc/flowvpn-guard.env`: thêm `GUARD_NEW_WINDOW_H=720` (các tham số khác giữ mặc định).
   Backup: `/etc/flowvpn-guard.env.bak-20260924-074102`. Xác nhận tiến trình đang nạp:
   `tr '\0' '\n' < /proc/<MainPID>/environ | grep GUARD_` → `GUARD_NEW_WINDOW_H=720`.
2. `systemctl restart flowvpn-guard` → vòng đầu chạy ngay (14:41:05 +07).

## 3. Bằng chứng

**Xem trước (không gửi) trước khi áp** — mô phỏng `classify()` cho cả 16 khách:

```
GUARD_NEW_WINDOW_H = 72h  → 2 khách (đều đang cooldown)
GUARD_NEW_WINDOW_H = 336h → 5 khách: 1971749828@qq.com, congtranquoc@gmail.com, kimdungtq@vip.163.com
                                      + je***/tu*** (đã gửi hôm qua, cooldown 48h)
GUARD_NEW_WINDOW_H = 720h → 5 khách (y hệt 336h)
Mọi khách CÓ thiết bị đều `ok — đã từng kết nối` ⇒ KHÔNG gửi nhầm khách đang dùng.
```

**Sau khi áp** (journal thật):

```
Sep 24 14:41:05 fcnvps2 python3[1584965]: vòng xong: 16 khách · 3 mail · 0 task · 13 bỏ qua
  1971749828@qq.com:    gửi hướng dẫn (never_installed, mọi nền tảng) → 01a0d25c-5b04-701b-b711-bbed70c3aee6
  congtranquoc@gmail.com: gửi hướng dẫn (never_installed, mọi nền tảng) → 01a0d25c-5e44-7539-a988-4886859aabef
  kimdungtq@vip.163.com:  gửi hướng dẫn (never_installed, mọi nền tảng) → 01a0d25c-603e-767b-908c-00a0afeef35b
```

**Đối chiếu trạng thái gửi thật bằng Resend API** (`GET /emails/<id>`):

```
01a0d25c-5b04-… | 1971749828@qq.com     | last_event=delivered | VPNFlow — hướng dẫn cài đặt / install guide / 安装指南
01a0d25c-5e44-… | congtranquoc@gmail.com| last_event=delivered | VPNFlow — hướng dẫn cài đặt / install guide / 安装指南
01a0d25c-603e-… | kimdungtq@vip.163.com | last_event=delivered | VPNFlow — hướng dẫn cài đặt / install guide / 安装指南
```

Vết nội bộ: `/var/lib/flowvpn-guard/audit.jsonl` (+3 dòng `guide_mailed`),
`/var/lib/flowvpn-guard/state.json` (3 khách `never_installed.mails=1`).

## 4. Rollback

```bash
cp -a /etc/flowvpn-guard.env.bak-20260924-074102 /etc/flowvpn-guard.env
systemctl restart flowvpn-guard && systemctl is-active flowvpn-guard
python3 /root/flowvpn-guard/guard.py --dry-run   # soi lại, KHÔNG gửi
```

## 5. Việc còn lại (chưa làm — chờ chủ dự án)

1. **Bước nhắc khách trial đã dùng thật khi hết hạn**: khách `tu***@gmail.com` (trial 24h) đã chạy thật
   **380 MB** rồi hết hạn ⇒ guard xếp `no_sub` nên **dừng theo dõi**, không có bước chuyển đổi nào.
   Cần chủ dự án quyết (đụng email khách).
2. **Rủi ro cần biết:** với cửa sổ 30 ngày, khách có device mà `lastSeenAt` rỗng sẽ bị xếp
   `never_connected` và được gửi email "chưa từng kết nối". Hiện **không có khách nào** ở trạng thái này
   (mọi khách có device đều có `lastSeenAt`), nhưng nếu sau này thấy khách đang dùng bị gửi nhầm thì
   kiểm `devices.json: lastSeenAt` của họ trước.
3. Nếu muốn phủ cả khách gói 3/6 tháng, nâng `GUARD_NEW_WINDOW_H` lên `2160` (90 ngày) — hôm nay cho
   kết quả y hệt (khách cũ hơn đều đã `ok`), nên chưa cần.
