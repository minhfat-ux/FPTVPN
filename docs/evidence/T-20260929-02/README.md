# T-20260929-02 — Xoá account revoked + ẩn khỏi list user (kiểm chứng lại & chống revert)

> Người làm: harness **WIN** · task sổ: **`T-20260929-02`** (owner → win, bus **#574**)
> Yêu cầu gốc (Telegram `/vibecode`, 2026-09-29T14:30:11Z): *"xóa các account bị revoke đi, không hiện
> accounts đã revoke trong list user của control panel nữa"*
> Tài liệu lần làm đầu: [`../../TG-VIBECODE-PURGE-REVOKED-USERS-2026-09-29.md`](../../TG-VIBECODE-PURGE-REVOKED-USERS-2026-09-29.md)

## 0. Vì sao có tài liệu này

Lúc **2026-09-29T15:07:06Z** watcher ghi sự kiện `woken` **mới** cho WIN với **đúng nội dung bus #574**
(client ghi vào sổ dưới id `TG-VIBECODE`, vốn là việc `owner → mac`). Đây là **gói tin cũ được đánh thức
lại**, không phải việc mới: `GET /pull?agent=win&since=560` cho thấy tin **cuối cùng gửi cho WIN vẫn là
#574** (`latest=582`, các tin 575–582 không gửi cho WIN).

Vì vậy phiên này **không làm lại việc** — thay vào đó **đo lại độc lập** trên hệ thống thật và **đóng lỗ
hổng khiến bản vá có thể bị revert âm thầm**.

## 1. Đo lại độc lập — bản vá đang CÓ HIỆU LỰC (PASS)

Chạy lúc `2026-09-29T15:0x–15:1xZ` trên node-2 (`fcnvps2`, `root@165.101.114.162`).

| # | Câu lệnh | Kết quả đo được | Kết luận |
|---|---|---|---|
| 1 | `node -e` đọc trực tiếp `data/auth.json` | `users=20  revoked=0` | kho đã sạch account revoked |
| 2 | `GET /v1/admin/users` (token admin trong drop-in) gọi **tiến trình đang chạy** (7778) | `http=200`, `count=20`, `expiry.revoked=0`, **0** dòng có `revokedAt` | list user control panel **không còn account revoked** |
| 3 | Lọc trên **tệp tạm** (2 user, 1 revoked) qua chính module đang chạy | `tổng=2 → sau lọc=1`, `còn revoked? = false` | bộ lọc `excludeRevoked` **chạy đúng** |
| 4 | `systemctl is-active flowvpn-cp` · `/v1/health` | `active` · `200` | dịch vụ khoẻ |
| 5 | `sha256sum` mã nguồn đang chạy vs bản lưu ở máy WIN | khớp **byte-for-byte** (`58…9e` index.js, `be…5f` auth-store.js) | bản đang chạy = bản đã lưu/kiểm |

**Đúng tiêu chí nghiệm thu của sổ**: *"GET /v1/admin/users không còn user có revoked_at; script purge báo
số lượng đã xoá; auth.json vẫn VALID"* → cả 3 điều đều đạt.

Chi tiết gọi API (rút gọn):

```text
http=200
{"count":20,"expiry":{"active":20,...,"revoked":0},"users":[…20 dòng, 0 dòng có revokedAt…]}
email 3 dòng đầu = minhnb2@me.com, song_mina@163.com, review@meetflowai.site
```

## 2. Lỗ hổng thật đã bịt: deploy mặc định sẽ REVERT bản vá (âm thầm)

### 2.1 Chuyện gì sẽ xảy ra

`scripts/server-agent/deploy-control-plane.sh` copy **mọi** file `src/*.js` khác nhau từ **workspace
deploy** (`/root/flowvpn-agent/control-plane/src`) → **bản đang chạy** (`/root/flowvpn-cp/src`), restart,
rồi chỉ rollback **nếu `/health` không 200**.

Quy ước đã chốt ở commit `d82394d` của repo server-agent là **"workspace = LIVE ⇒ deploy mặc định là
NO-OP"**. Nhưng từ bản sync gần nhất (`12621e8`, 26/09) tới nay quy ước đó **đã trôi**:

| File | workspace (nguồn deploy) | LIVE (đang chạy) | Có chứa bản vá? |
|---|---|---|---|
| `auth-store.js` | 28.692 B | 34.712 B | workspace **THIẾU** `excludeRevoked` + `purgeRevokedUsers` + `_writeChain` |
| `index.js` | 288.894 B | 290.423 B | workspace **THIẾU** `excludeRevoked` |
| `admin-page.js` | 318.619 B | 320.854 B | LIVE mới hơn |
| `home-page.js` | 81.732 B | 81.947 B | LIVE mới hơn |

⇒ Một lần chạy `deploy-control-plane.sh` (mặc định) sẽ **ghi đè bản vá account revoked trở lại bản 26/09**,
dịch vụ vẫn khoẻ (`/health` 200) nên **không có rollback** ⇒ chủ dự án lại thấy account revoked trong list
user và **không ai biết vì sao**.

### 2.2 Đã bịt

```text
1) Backup bản workspace cũ : /root/backups/ws-cp-before-sync-20260929-151500/{admin-page,auth-store,home-page,index}.js
   (bản cũ vẫn nằm nguyên trong git HEAD 12621e8 — không mất gì)
2) Copy LIVE → workspace   : 4/4 file khớp byte (cmp -s OK)
3) node --check            : OK cả 4 file
4) Kiểm bản vá trong workspace: index.js:4947 excludeRevoked ✓ ; auth-store.js:277 options.excludeRevoked ✓ ; :417 purgeRevokedUsers ✓ ; _writeChain ✓
5) deploy --dry-run        : "không có file src/*.js nào khác bản đang chạy — không cần deploy"  ← NO-OP, hết cửa revert
6) Commit                  : c9fc73f (repo /root/flowvpn-agent, nhánh master), chỉ 4 file trên
7) Đo lại độ lệch          : tổng lệch workspace vs LIVE = 0
```

Lưu ý: cả 4 file trước khi sync đều **sạch trong git** (`git status` không đánh dấu) ⇒ **không đè lên WIP
dở dang** nào.

## 3. Việc này thuộc ai (để không ack nhầm)

Sự kiện `woken` 15:07 nằm trong sổ dưới id **`TG-VIBECODE`** — sổ ghi rõ việc đó là **`owner → mac`**.
`ops/task.mjs` chặn bằng `assertActor(state, "assignee")`: chỉ bên **nhận** (`task.to`) được
`ack`/`progress`/`done`. Với `TG-VIBECODE`, `to = mac` ⇒ **WIN không được ack** (và đã **không** ack).

Việc thật của WIN là **`T-20260929-02`** (`owner → win`), đã `done` lúc 14:50:55Z.

## 4. Rủi ro còn lại (cần người quyết)

- Control-plane **không nằm trong git của repo flowgpt** (đã ghi nhận ở
  `docs/TG-VIBECODE-ANDROID-CONNECT-500-2026-09-29.md`); mã nguồn thật chỉ có ở node-2 + bản lưu ở
  `_work/android500/`. Nhánh `master` của repo FPTVPN có `control-plane/` nhưng bản trên GitHub
  **chưa có** bản vá này.
- Nay đã có "neo" chống revert **trên máy chủ** (workspace = LIVE, commit `c9fc73f`). Nếu muốn bền hơn
  nữa (sống sót cả khi dựng lại máy), cần đưa `control-plane/` lên nhánh `master` của
  `minhfat-ux/FPTVPN` — **chờ chủ dự án / MAC quyết** vì đây là nhánh dùng chung.

## 5. Lệnh tái lập (chạy trên node-2)

```bash
# 1) kho còn account revoked không
ssh root@165.101.114.162 'node -e "const d=JSON.parse(require(\"fs\").readFileSync(\"/root/flowvpn-cp/data/auth.json\",\"utf8\"));console.log(\"users=\"+d.users.length,\"revoked=\"+d.users.filter(u=>u.revokedAt).length)"'

# 2) list user control panel (token admin nằm trong drop-in, không in ra)
ssh root@165.101.114.162 'T=$(grep -h "^Environment=AUTH_TOKEN=" /etc/systemd/system/flowvpn-cp.service.d/admin-token.conf | cut -d= -f3); curl -s -H "Authorization: Bearer $T" http://127.0.0.1:7778/v1/admin/users | node -e "let s=\"\";process.stdin.on(\"data\",c=>s+=c).on(\"end\",()=>{const j=JSON.parse(s);console.log(\"count=\"+j.count,\"revoked=\"+j.expiry.revoked,\"dong co revokedAt=\"+j.users.filter(u=>u.revokedAt).length)})"'

# 3) deploy mặc định phải là NO-OP (chống revert)
ssh root@165.101.114.162 'bash /root/flowvpn-agent/scripts/server-agent/deploy-control-plane.sh --dry-run'
```
