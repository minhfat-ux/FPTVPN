# T-20261101-01 — iOS/API báo HTTP 500: auth.json hỏng + vì sao watchdog không tự cứu

**Ngày:** 2026-11-01 (UTC+7) · **Máy:** MAC (thao tác trên node-2) · **Mức:** khách không đăng nhập/kết nối được

## 1. Triệu chứng

App iOS trong mạng hiện tại chạy lên báo **HTTP 500**. Không phải lỗi relay/tunnel — mọi route cần
đăng nhập của control plane đều 500.

## 2. Nguyên nhân gốc

`/root/flowvpn-cp/data/auth.json` có **253 byte rác sau một JSON hợp lệ** (một fragment lặp lại của
`renewalReminders`):

```
... "sentAt": "2026-10-29T04:25:26.675Z"
    }
  ]
} "0d61d28e-77c0-477f-abcf-1fc6213bcdef",
      "windowDays": 0,
      ...
```

`AuthStore._load()` từ chối file (fail-closed) thay vì coi như rỗng, và mọi route dùng
`requireUserAuth` ném lỗi ⇒ **500**. Log thật:

```
[auth-store] KHÔNG ĐỌC ĐƯỢC /root/flowvpn-cp/data/auth.json — DỪNG thay vì coi như rỗng
SyntaxError: Unexpected non-whitespace character after JSON at position 634733
  at AuthStore._load (auth-store.js:632)
  at requireUserAuth (index.js:388)
```

## 3. Vì sao health check KHÔNG tự recover

`flowvpn-health-watch` (timer 45 s) chỉ kiểm:

- `systemctl is-active` từng unit, trong đó có `flowvpn-cp` ⇒ process **vẫn active**;
- 6 relay phải trả `426`;
- `/health` của control plane **không chạm `auth.json`/AuthStore** ⇒ vẫn trả 200.

Vì vậy watchdog thấy tất cả "xanh" trong khi mọi route cần đăng nhập trả 500. Nó không có probe
tầng ứng dụng nào cho auth store, và `AuthStore` fail-closed (trả 500) chứ không crash/restart.

## 4. Đã sửa

### 4.1. Sửa dữ liệu

```bash
cp -a /root/flowvpn-cp/data/auth.json /root/flowvpn-cp/data/auth.json.corrupt-20261101-192702
systemctl stop flowvpn-cp
# raw_decode lấy JSON hợp lệ đầu tiên, atomic replace
python3 - <<'PY'
import json, os
p = "/root/flowvpn-cp/data/auth.json"
b = open(p, "rb").read()
obj, end = json.JSONDecoder().raw_decode(b.decode("utf-8"))
valid = b.decode("utf-8")[:end].encode("utf-8")
print("trim", len(b), "->", len(valid))
open(p + ".tmp", "wb").write(valid)
os.replace(p + ".tmp", p)
PY
python3 -m json.tool /root/flowvpn-cp/data/auth.json >/dev/null
systemctl start flowvpn-cp
```

Kết quả: **634987 → 634734 byte**, giữ **22 users / 125 sessions / 56 renewalReminders**.

### 4.2. Kiểm sau sửa

| Endpoint | Trước | Sau |
|---|---|---|
| `GET /health` | 200 (không chạm auth) | 200 |
| `GET /v1/nodes` | 500/connection reset | 200 |
| `GET /v1/auth/session` (token giả) | **500** | **401** |
| `GET /v1/devices` (token giả) | **500** | **401** |

## 5. Chống tái diễn: health-watch v1.0.1

Thêm `check_auth_store()` vào `/usr/local/bin/flowvpn-health-watch`:

1. Parse `auth.json`; nếu hỏng:
   - thử `raw_decode` lấy **JSON hợp lệ đầu tiên**; chỉ chấp nhận khi có `users` + `sessions`;
   - backup `.autowatch-<ts>`, atomic replace, `systemctl restart flowvpn-cp`;
   - gửi Telegram + ghi inbox; kiểu hỏng khác **chỉ cảnh báo**, không tự đoán.
2. Probe `GET /v1/auth/session` với `Authorization: Bearer __auth_watch_probe__`:
   - 401 = auth store đọc được;
   - 500 = hỏng ⇒ thử restart một lần; vẫn 500 ⇒ cảnh báo người.

Đã test:
- `bash -n` OK; dry-run OK; timer tick thật OK (v1.0.1).
- Test logic cắt rác trên **bản copy**: `635041 → 635031 byte`, JSON vẫn 22 users/125 sessions.
- Probe hiện tại: `auth_probe=401`.
- Backup watchdog cũ: `/usr/local/bin/flowvpn-health-watch.bak-authprobe-20261101`.

## 6. Việc còn lại

- Tìm **nguồn ghi** đã append 253 byte rác. `AuthStore._save` hiện đã atomic (`write .tmp` + `rename`),
  nên fragment này nhiều khả năng đến từ một lệnh ngoài (script/người) append trực tiếp; cần soát
  cron/lịch sử shell quanh mốc `2026-11-01 17:01:42 +07`.
- Nếu app iOS vẫn hiện 500: force-quit mở lại (token cũ vẫn hợp lệ) và gửi endpoint + thời điểm.
- Không tự khôi phục các kiểu hỏng `auth.json` khác (mất users/sessions) — chỉ cảnh báo để tránh mất dữ liệu.
