# T-20260929-04 — Dashboard control panel đếm SAI SỐ THIẾT BỊ (bus #591)

> Người làm: harness **WIN** · việc trong sổ: **`T-20260929-04`** (owner → win, chép từ bus **#591** lúc
> `2026-09-29T16:08:47Z`) · làm lúc 2026-09-29 16:13–16:30Z (23:13–23:30 giờ VN).
> Nguyên văn chủ dự án (Telegram `/vibecode`): *"dashboard trên control panel vẫn sai số thiết bị"* —
> trả lời đúng câu hỏi ở cuối việc `T-20260929-03` (đã sửa dòng đếm UDID ở **tab iOS**).

## 1. Nguyên nhân gốc (đo thật, không phỏng đoán)

Thẻ **Devices** trên Dashboard lấy `totals.devices = realDevices.length` — tức **số BẢN GHI đăng ký**
trong `data/devices.json`, không phải **số MÁY**. App **Android** sinh cặp khoá WireGuard + tên máy MỚI
mỗi lần cài lại (`DeviceIdentity` lưu trong `SecureStore`; xoá dữ liệu/gỡ app là mất), nên server nhận
thêm một bản ghi cho **cùng một chiếc máy**.

Số đo thật trên node-2 lúc 23:10 ngày 29/09/2026 (`/v1/admin/stats`):

| | trước | sau |
|---|---|---|
| thẻ **Devices** trên Dashboard | **10** (bản ghi) | **6** (máy thật) |
| `device_records` | — | 10 |
| `legacy_android_records` | — | 6 |
| `legacy_android_grouped_away` | — | 4 |

Chi tiết theo tài khoản (trước → sau):

| tài khoản | bản ghi | máy thật | vì sao |
|---|---|---|---|
| `minhnb2@me.com` | 6 (1 macos + **5 android**) | **2** | 5 bản ghi android là 5 lần cài lại của cùng chiếc điện thoại |
| `haitinhvuong@gmail.com` | 2 (1 ios + 1 android) | **2** | hai máy khác nền tảng |
| `camvinh@gmail.com` | 1 (windows) | **1** | |
| `minhnb2@hotmail.com` | 1 (ios) | **1** | |

⇒ Con số cũ **10** vừa không phải "số thiết bị đã đăng ký" vừa không phải "số máy" — nó là số bản ghi,
trong đó **4 bản ghi là rác do cài lại app**. Không mất bản ghi nào (10 vẫn còn đủ trong sổ).

## 2. Phần đã sửa & deploy (server) — XONG

| File (nguồn `/root/flowvpn-agent/control-plane`, áp lên LIVE `/root/flowvpn-cp/src`) | Sửa |
|---|---|
| `device-machines.js` **(mới)** | Quy tắc đếm "máy thật": có `machineId` ⇒ khoá theo `(user, platform, machineId)`; không có + platform ≠ android (iOS Keychain / macOS / Windows giữ danh tính qua cài lại) ⇒ mỗi bản ghi một máy; không có + android ⇒ gộp theo tài khoản, đếm 1 (kèm số bản ghi bị gộp) |
| `device-store.js` | Lưu `machineId` vào bản ghi (thêm mới + cập nhật) |
| `device-replace.js` | Không cần `replace_device_id`: client khai `machine_id` trùng bản ghi cũ của **chính máy đó** (cùng user + cùng platform) ⇒ tự thu hồi bản ghi cũ để nhường slot |
| `index.js` | `registerDeviceWithPayload` + `POST /v1/devices/claim` nhận `machine_id`; `/v1/admin/stats` trả `devices` = **số máy**, thêm `device_records`, `legacy_android_records`, `legacy_android_grouped_away`, và `by_user[].machines` |
| `admin-page.js` | Thẻ **Devices** hiện **máy thật** + dòng nhỏ *"máy thật (đã bỏ trùng bản ghi cài lại) · 10 bản ghi đăng ký · 6 bản ghi Android cũ chưa có mã máy"*; thẻ theo tài khoản hiện `N máy (M bản ghi)` |

Diff đầy đủ: [`control-plane.patch`](control-plane.patch) (7 file, +296/−10).
Commit nguồn (repo `server-agent` trên node-2): **`7cf0d01`** —
`control-plane(devices): dem MAY THAT theo ma may (machine_id) - bo dem thua ban ghi cai lai (T-20260929-04 / bus #591)`.

## 3. Bằng chứng (lệnh thật + kết quả thật)

**a) Deploy** — theo đúng các bước an toàn của `scripts/server-agent/deploy-control-plane.sh`
(backup → copy → `node --check` → restart → health → rollback); xem
[`ops/_scratch/deploy-cp-device-machines.sh`](../../ops/_scratch/deploy-cp-device-machines.sh):

```text
backup: /root/flowvpn-cp/src-backup-20260929-161942
check OK index.js
check OK admin-page.js
check OK device-store.js
check OK device-replace.js
check OK device-machines.js
health OK (200) — deploy xong; service=active
```

**b) Kiểm chứng độc lập** — `node ops/_scratch/verify-device-machines.mjs --live` (trên node-2):
tự tính lại "số máy" từ `data/devices.json` rồi so với JSON API đang chạy và HTML trang admin đang phát.

```text
--- số đo (tự tính từ devices.json) ---
bản ghi thật của khách      : 10
MÁY THẬT                    : 6
bản ghi Android cũ (no id)  : 6
  gộp bớt khi đếm theo máy  : 4
API trả                     : devices=6 · device_records=10 · legacy=6 · gộp bớt=4
...
19/19 PASS
```

**c) Không hồi quy phần đã sửa hôm qua** (`T-20260929-03`): `node /tmp/verify-device-count.mjs --live`
→ **19/19 PASS** (khối `shop.registered=10`, `apple.accountTotal=10` vẫn nguyên).

**d) Test suite** — `node --test test/*.test.js`:

```text
trước (đo trên chính bản LIVE chưa sửa): tests 316 · pass 314 · fail 2
sau                                    : tests 326 · pass 324 · fail 2   (+10 ca mới: 7 device-machines + 3 device-replace)
```

⚠️ 2 ca đỏ **có sẵn, không liên quan**: `test/mac-install.test.js` ("4 bước Mac" vs code 5 bước) và
`test/alerts.test.js` (sửa mojibake) — y như ghi nhận ở `T-20260929-03`.

**e) Bản đang chạy khớp bản trong sổ:**

```text
OK index.js · OK admin-page.js · OK device-store.js · OK device-replace.js · OK device-machines.js
sha256 LIVE index.js           = b881cbd197a9a94f56c29dff489b283aecf4c5351100d23b87db3e4c7cd4f641
sha256 LIVE admin-page.js      = 9592286c4b74ace185483ed8de2b68b8a897e41ca017c131a75d2efeb5971bf3
sha256 LIVE device-store.js    = 42748a78474524500ad162ee02214f5c90bdf9576204e1462e6345f10e93d847
sha256 LIVE device-replace.js  = 143f92d1f06c3021af765a27b5eac525d0dd67af0c328e1ef937e5d9aaf168b4
sha256 LIVE device-machines.js = c4a9beb54c66040a9758785546e93a34c31648260f69264a6d260d1babe39c48
GET /health = 200 · service active
```

## 4. CÒN LẠI — client Android gửi mã máy ổn định (chưa làm được trong phiên này)

Quy tắc gộp ở §2 xử đúng cho trường hợp **một người dùng một điện thoại Android** (đúng thực tế hiện
tại). Điểm yếu còn lại: nếu một khách có **2 điện thoại Android** và cả hai còn ở bản app CŨ (chưa bao
giờ khai mã máy) thì hai bản ghi đó bị gộp thành **1 máy** ⇒ **đếm thiếu 1**. Muốn hết hẳn, app Android
phải gửi **mã máy ổn định** để server phân biệt được từng chiếc:

- `DeviceIdentity.kt`: thêm `machineID(context)` = `Settings.Secure.ANDROID_ID` (sống qua lần cài lại);
- `ControlAPIClient.register(...)` và `claimDevice(...)`: gửi thêm `machine_id`;
- `VPNManager`: truyền `DeviceIdentity.machineID(app)`.

**Vì sao chưa làm trong phiên này:** đây là một bản phát hành **Android** (thuộc kênh Windows theo
`PUBLISHER_PROCESS.md` luật 12) và phải qua đủ cổng BUILD → HANDOFF → PUBLISH (§1c: `check-publish-version.py`
cần `aapt2`, cần JDK/Android SDK). Máy Windows này **không có `java`/`javac`/`kotlinc`/Android SDK**
(đã kiểm: `where java|javac|kotlinc` rỗng; không có `%LOCALAPPDATA%\Android\Sdk`, `JAVA_HOME` rỗng)
⇒ **không build được APK**, nên **không** đẩy code Kotlin chưa biên dịch vào nhánh phát hành.
Xin chủ dự án chốt: làm bản Android kế tiếp kèm thay đổi này (khi có toolchain), hay giữ nguyên.

## 5. Lệnh tái lập

```bash
# trên node-2
T=$(tr '\0' '\n' < /proc/$(systemctl show flowvpn-cp -p MainPID --value)/environ | grep ^AUTH_TOKEN= | cut -d= -f2)
curl -s -H "Authorization: Bearer $T" http://127.0.0.1:7778/v1/admin/stats | python3 -m json.tool

# kiểm chứng đầy đủ (script trong sổ giao việc)
scp ops/_scratch/verify-device-machines.mjs root@165.101.114.162:/tmp/ && \
  ssh root@165.101.114.162 'node /tmp/verify-device-machines.mjs --live'
```
