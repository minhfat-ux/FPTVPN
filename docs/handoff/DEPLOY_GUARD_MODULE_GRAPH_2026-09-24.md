# Vá lỗ hổng deploy control-plane gây crash-loop (23–24/09/2026)

- **Người làm:** DSH main agent (owner `windows`) — phát hiện khi điều tra task khách #373.
- **Trạng thái:** ✅ **ĐÃ VÁ + ĐÃ TEST (7/7) + ĐÃ ĐỒNG BỘ script lên node-2.** Không phải deploy lại
  control-plane (bản vá nằm ở script deploy, không nằm trong `src/`).
- **Sổ bug:** `.privatevpn/status/bugs.json` → thêm `BUG-DEPLOY-CRASHLOOP-001` (đã `resolved`).

## 1. Phát hiện

Khi rà `journalctl -u flowvpn-cp` để tìm nguyên nhân task #373 ("khách không kết nối được máy chủ khi
gọi email login"), thấy dị thường **control-plane chết 12 lần liên tiếp**:

```
Sep 23 10:20:08 fcnvps2 systemd[1]: flowvpn-cp.service: Scheduled restart job, restart counter is at 1.
...
Sep 23 10:20:46 fcnvps2 systemd[1]: flowvpn-cp.service: Scheduled restart job, restart counter is at 12.
Sep 23 10:20:46 fcnvps2 node[224797]: Error [ERR_MODULE_NOT_FOUND]: Cannot find module
                                  '/root/flowvpn-cp/src/bw-policy.js' imported from /root/flowvpn-cp/src/index.js
Sep 23 10:20:46 fcnvps2 systemd[1]: flowvpn-cp.service: Main process exited, code=exited, status=1/FAILURE
Sep 23 10:20:48 fcnvps2 systemd[1]: Stopped flowvpn-cp.service ...        ← có người copy file thiếu vào rồi start lại
Sep 23 10:20:49 fcnvps2 node[224862]: PrivateVPN control plane listening on :7778 (HTTP)
```

→ **~41 giây API không phục vụ được khách** (10:20:08 → 10:20:49 +07). Không có OOM, RAM còn trống
(480/961 MB dùng).

**Đính chính số liệu:** con số "17 lần restart/24h" nêu lúc điều tra ban đầu **không phải 17 lần crash** —
gồm **12 lần crash** ở cửa sổ trên + 3 lần restart hợp lệ (11:41:06 do deploy khác, 17:47:08 = deploy
`BUG-APPVERSION-PLATFORM-001`, 08:08:29 ngày 24/09 = sync workspace).

**Đây KHÔNG phải nguyên nhân task #373** (lỗi khách báo lúc 15:09Z = 22:09 +07, cách đó ~12h; trong cửa sổ
#373 cả 4 host `api/t1/meetflowai.site`, `meetflowai.site`, `fcnvpn.tail…` đều **OK 13/13 mẫu**, CP không
restart, không có lỗi OTP/auth). Chi tiết #373 ở §6.

**Vì sao chắc chắn không đi qua script deploy:** script luôn tạo thư mục
`/root/flowvpn-cp/src-backup-<UTC>`; quanh 10:20 **không có** backup dir nào (chỉ có `20260923-104708` và
`20260924-010829`) ⇒ đây là thao tác **copy tay + restart tay**.

## 2. Hai lỗ hổng thật trong `scripts/server-agent/deploy-control-plane.sh`

| # | Lỗ hổng | Hậu quả |
|---|---|---|
| a | `--files a.js` **chỉ** copy đúng file được liệt kê, không kéo theo module nó import | File mới (vd `index.js` mới import `./bw-policy.js`) lên live mà **thiếu module** ⇒ `ERR_MODULE_NOT_FOUND` ⇒ crash-loop |
| b | File MỚI: `cp -a "$LIVE/src/$base" "$BK/$base"` **fail** vì không có nguồn ⇒ `set -e` **abort toàn bộ deploy** | Script **không thể thêm file mới** ⇒ agent buộc phải copy tay ⇒ đúng con đường gây (a) |
| c | `node --check` chỉ kiểm **cú pháp**, không resolve import | Lỗi (a) lọt qua hết mọi cổng kiểm tra hiện có |

## 3. Bản vá (diff tối thiểu, 1 file)

| File | Thay đổi |
|---|---|
| `scripts/server-agent/deploy-control-plane.sh` | Thêm hàm `modgraph` (2 chế độ, dùng chung 1 nguồn phân tích import) · `closure`: tự kéo theo **mọi module nội bộ** mà file được chọn import (đệ quy) + báo lỗi nếu workspace thiếu module + báo lỗi nếu `--files` gõ sai tên (chống no-op im lặng) · `check`: kiểm đồ thị module của **bản LIVE sau copy** tính từ entrypoint `$ENTRY` (mặc định `index.js`), chạy **trước khi copy** (§1b) và **trước khi restart** (§3b) · file mới được theo dõi riêng trong `added[]`, rollback **xoá** file mới thay vì `cp -a` fail · log thêm **giờ máy** (tên backup dir là UTC, journal là +07 — trước đây gây nhầm 7h) |

Không đổi: chỉ nhận `.js` trong `src/`, `node --check` + test suite, backup trước khi copy, health check
có thử lại 10 lần, tự rollback khi health hỏng. Script vẫn chạy y hệt nếu không có gì mới.

## 4. Bằng chứng

Test trên fixture dựng lại **đúng kịch bản 23/09** (`/tmp`-tương đương, không chạm server thật):

```
T0 logic CŨ (đối chiếu): --files index.js chọn: index.js          ← tái hiện lỗ hổng (thiếu bw-policy.js)
T1 bản vá:               file thay đổi (2): bw-policy.js index.js  ← closure kéo đúng module phụ thuộc
T2 workspace thiếu module: LỖI: workspace thiếu module được import: index.js import ./missing-module.js → exit 1
T3 --files gõ sai tên:     LỖI: --files nêu file không có trong workspace: indx.js → exit 1
T4 happy path (stub systemctl + health 200): file MỚI (chưa có ở live): bw-policy.js · đã copy 2 file · health OK → exit 0
T5 health hỏng:            LỖI: health check KHÔNG 200 → rollback: index.js cũ trở lại, bw-policy.js bị XOÁ, service restart → exit 1
T6 check-mode:             LỖI: import nội bộ không resolve được: ghost.js → ./nowhere.js → exit 1
PASS=7  FAIL=0
```

Đồng bộ lên node-2 (`/root/flowvpn-agent/scripts/server-agent/deploy-control-plane.sh`):

```
local  sha256: ba44e2a46e1e6c4fe4e6215ed518548f5c8725c37311f4e01dfe7c52a7c4132d
remote sha256: ba44e2a46e1e6c4fe4e6215ed518548f5c8725c37311f4e01dfe7c52a7c4132d
bash -n: OK
bash …/deploy-control-plane.sh --dry-run
  → không có file src/*.js nào khác bản đang chạy — không cần deploy   (exit 0)
WS/LIVE: 42 file .js mỗi bên
```

Đồ thị module hiện tại của LIVE (BFS từ `index.js`): **44 file trong thư mục, 38 file reachable, thiếu: không**.

## 5. Việc còn lại / khuyến nghị

1. **Luôn deploy bằng script**, không copy tay. Nếu buộc phải copy tay: phải kéo theo **mọi module mới**
   mà file vừa copy import (bài học từ sự cố này).
2. Deploy lần tới tính năng mới (thêm file `.js`) giờ **đã chạy được bằng script** — trước đây không.
3. Cân nhắc: hook `pre-commit`/CI kiểm đồ thị module cho `control-plane/src` để bắt lỗi này **trước khi**
   lên server (hiện chỉ chặn ở phía deploy).

## 6. Liên quan: task #373 (khách không kết nối được khi login) — không phải lỗi control-plane

- Thời điểm khách báo: `2026-09-23T15:09:22Z` (22:09 +07).
- Trong cửa sổ 21:40–22:45 (+07): `api.meetflowai.site`, `t1.meetflowai.site`, `meetflowai.site`,
  `fcnvpn.tail303be3.ts.net` = **OK 13/13 mẫu mỗi host** (`/root/flowvpn-cp/data/gfw-history.json`).
- CP cùng PID `594372` suốt 21:53→22:36, không restart, không lỗi; email OTP gửi thành công
  (resend id `01a0cec2-…`, `01a0ced5-…`). Lỗi duy nhất là Resend từ chối `example.com` (địa chỉ test).
- ⇒ Không có request nào của khách tới được server. Hướng còn lại: đường truyền phía khách
  (TQ/Cloudflare — ghi nhận trong handoff 1.4.6 §6: timeout ~1/5 lần) hoặc bản app/phiên bản của khách.
  Cần hỏi khách: nền tảng + phiên bản app + ảnh chụp màn hình + nhà mạng.
