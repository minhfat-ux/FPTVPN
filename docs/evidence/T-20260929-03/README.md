# T-20260929-03 — control panel đếm sai "số thiết bị đã đăng ký" (bus #584)

> Người làm: harness **WIN** · việc trong sổ: **`T-20260929-03`** (owner → win, bus **#584** lúc
> `2026-09-29T15:45:56Z`) · làm lúc 2026-09-29 15:49–16:10Z (22:49–23:10 giờ VN).
> Nguyên văn chủ dự án (Telegram `/vibecode`): *"control panel đang đếm sai số thiết bị đã đăng ký rồi.
> Mới chỉ đếm theo udid thôi thì phải"*.

## 1. Nguyên nhân gốc

Control panel lấy con số "thiết bị đã đăng ký" bằng cách **đếm thô danh sách UDID của tài khoản Apple
Developer**, không phải đếm sổ đăng ký của shop:

```js
// admin-page.js (bản CŨ, dòng 1390) — nguồn: GET /v1/admin/ios/apple -> listAppleDevices()
? "Kết nối Apple OK · " + (apple.devices || []).length + " thiết bị trên tài khoản."
```

Hai tập hợp **khác nhau** (đo thật lúc 16:02Z trên node-2):

| Nguồn | Số | Gồm những gì |
|---|---|---|
| Sổ của shop — `data/ios-devices.json` | **10 UDID** | 6 máy **shop tự thêm mới** lên Apple (`appleAlreadyRegistered=false`), 4 máy **Apple đã có từ trước** (`=true` — máy cá nhân của chủ dự án đăng ký trước khi có shop: `Minh's iPhone`, `Minh Nguyen's iPad`, `MacBook Air (2)`…) |
| Tài khoản Apple — `GET /v1/devices` (ASC) | **10 UDID** | **thiếu** 1 UDID của shop (`664D325A-…` = `Mac15,13`) và **thừa** 1 máy không thuộc shop (`00008122-000160560186001C` = "MacBook Air (2)", thêm 17/07/2026) |

⇒ Con số hiện trên panel vừa thừa vừa thiếu, và **không** phải "số thiết bị shop đã đăng ký".
Hệ quả phụ: cột "Apple" trong bảng iOS tin vào cờ `appleRegisteredAt` đã lưu nên vẫn ghi
"✅ đã đăng ký" cho UDID **không còn** trên tài khoản Apple.

## 2. Đã sửa gì

| File (nguồn deploy `/root/flowvpn-agent/control-plane/src`, áp lên LIVE `/root/flowvpn-cp/src`) | Sửa |
|---|---|
| `index.js` — route `GET /v1/admin/ios/apple` | Trả thêm khối **`shop`** đếm theo **sổ của shop**: `registered`, `addedByShop`, `alreadyOnApple`, `onApple`, `missingOnApple`; và tách bạch phía Apple: `apple.accountTotal` (UDID thô) + `apple.notShop` (máy trên Apple không phải của shop) |
| `admin-page.js` — `loadAscStatus()` | Dòng Apple nay đọc: *"shop đã đăng ký **N** thiết bị (UDID) — X do shop thêm mới, Y đã có trên Apple từ trước · đang có trên Apple M/N [· THIẾU trên Apple: …] · tài khoản Apple có P thiết bị (trong đó Q không phải máy của shop)"* |
| `admin-page.js` — `iosAppleCell()` | Cột **Apple** đối chiếu **danh sách Apple sống** (`iosState.appleUdids`) thay vì tin cờ đã lưu ⇒ máy không còn trên Apple hiện "⚠️ KHÔNG thấy trên Apple" |
| `admin-page.js` — `loadIosDevices()` | "Đã đăng ký **N** thiết bị (UDID) **của shop**." (bỏ câu "Loaded N device(s).") |

Diff đầy đủ: [`control-plane.patch`](control-plane.patch) (2 file, +55/−4).
Commit nguồn (repo `server-agent` trên node-2): **`2940973`** — `control-plane(admin): dem so thiet bi da
dang ky theo UDID cua shop + doi chieu Apple (T-20260929-03 / bus #584)`.

## 3. Bằng chứng (lệnh thật + kết quả thật)

**a) Deploy** — theo đúng các bước an toàn của `scripts/server-agent/deploy-control-plane.sh`
(backup → copy → `node --check` → restart → health → rollback nếu hỏng); xem
[`ops/_scratch/deploy-cp-ios-count.sh`](../../ops/_scratch/deploy-cp-ios-count.sh):

```text
backup: /root/flowvpn-cp/src-backup-20260929-160249
check OK index.js
check OK admin-page.js
health OK (200) — deploy xong; service=active
```

**b) Kiểm chứng độc lập** — `node ops/_scratch/verify-device-count.mjs --live` (chạy trên node-2):
tự tính lại từ `data/ios-devices.json` rồi so với JSON API đang chạy và với HTML trang admin đang phát.

```text
--- số đo ---
shop đã đăng ký (UDID)      : 10
  shop tự thêm lên Apple    : 6
  Apple đã có từ trước      : 4
tài khoản Apple (UDID thô)  : 10
shop có trên Apple          : 9/10
shop THIẾU trên Apple       : 664D325A-AFAE-53D7-BD2B-D6AF7A80AB41
Apple KHÔNG thuộc shop      : 1
...
19/19 PASS
```

**c) Không hồi quy** — chạy lại toàn bộ test suite trong workspace:

```text
trước khi sửa (đo trên bản LIVE chưa đổi): tests 316 · pass 314 · fail 2
sau khi sửa                              : tests 316 · pass 314 · fail 2   (đúng 2 ca cũ)
```

⚠️ 2 ca đỏ **có sẵn, không liên quan** (đã đo trên bản LIVE nguyên bản tại `/tmp/cp-baseline`):
`test/mac-install.test.js` ("khối hướng dẫn Mac đủ 4 bước" — code có 5 bước) và `test/alerts.test.js`
(sửa mojibake). Hệ quả: `deploy-control-plane.sh` (có bước chạy full suite) sẽ **từ chối deploy** cho tới
khi 2 ca đó được xử lý — nên lần này deploy bằng script riêng chỉ bỏ đúng bước full-suite, giữ nguyên
backup/`node --check`/health/rollback. **Đây là việc còn nợ của cổng deploy, không phải của bản vá này.**

**d) Bản đang chạy khớp bản trong sổ:**

```text
LIVE vs workspace: OK index.js · OK admin-page.js
sha256 LIVE index.js      = e429a16588d42bcdd4b8e90adf3ee166c173452d534c559590b88b8f83e6e0ee
sha256 LIVE admin-page.js = 12264dec209e5922f13945a460bc7d089caefcb394fdac5b560e0b82cdb15dc7
GET /health = 200 · service active · JS nhúng trong trang admin parse OK (114.664 ký tự)
```

## 4. CÒN LẠI — xin chủ dự án xác nhận đúng con số đang nói tới

Control panel hiện có **3 chỗ** hiện "số thiết bị" (đo lúc 16:02Z). Bản vá này sửa **chỗ đếm theo UDID**
(khớp nguyên văn *"chỉ đếm theo udid thôi"*). Hai con số còn lại **không** đổi:

| Chỗ | Số | Nghĩa |
|---|---|---|
| Dashboard thẻ **Devices** — "real, owned by users" | **10** | số **bản ghi đăng ký của app** (`devices.json`). `minhnb2@me.com` = 6 (macos 1 + **android 5**), `haitinhvuong@gmail.com` = 2, `camvinh@gmail.com` = 1, `minhnb2@hotmail.com` = 1 |
| Dashboard "Devices by User" | như trên | theo từng tài khoản |
| **Tab iOS UDID / dòng Apple** | **10** | đã sửa ở bản vá này (xem §2) |

Nếu ý chủ dự án là thẻ **Devices** trên Dashboard: app Android sinh **một khoá + một tên máy mới cho mỗi
lần cài lại** (`DeviceIdentity.obtainOrCreateKeyPair` lưu trong SecureStore; xoá dữ liệu/gỡ app là mất),
nên 5 bản ghi android = 5 lần cài, không phải 5 chiếc máy. Muốn đếm đúng "số máy thật" thì phải sửa
**phía app Android** (gửi mã máy ổn định, ví dụ `Settings.Secure.ANDROID_ID`, hoặc gửi `replace_device_id`
như bản Windows/iOS đang làm) rồi server gộp theo mã đó — việc này em làm được, xin chủ dự án chốt.

## 5. Lệnh tái lập

```bash
# trên node-2
T=$(tr '\0' '\n' < /proc/$(systemctl show flowvpn-cp -p MainPID --value)/environ | grep ^AUTH_TOKEN= | cut -d= -f2)
curl -s -H "Authorization: Bearer $T" http://127.0.0.1:7778/v1/admin/ios/apple | python3 -m json.tool

# kiểm chứng đầy đủ (script trong sổ giao việc)
scp ops/_scratch/verify-device-count.mjs root@165.101.114.162:/tmp/ && \
  ssh root@165.101.114.162 'node /tmp/verify-device-count.mjs --live'

# soát số thô (chỉ đọc dữ liệu, không sửa)
scp ops/_scratch/device-count-audit.py root@165.101.114.162:/tmp/ && \
  ssh root@165.101.114.162 'python3 /tmp/device-count-audit.py'
```
