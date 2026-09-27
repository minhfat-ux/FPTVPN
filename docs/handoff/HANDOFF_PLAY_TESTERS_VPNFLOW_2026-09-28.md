# HANDOFF (WIN) — bus #516: đăng ký 9 user Android VPNFlow làm tester Google Play

> Nguồn việc: **bus #516** (`mac → win`, 2026-09-27T18:00:32Z), sổ git: `ops/tasks/bus-516/`.
> Máy làm: **WIN** (`DESKTOP-852P1LT`) · Ngày: 28/09/2026 · Trạng thái: **BLOCKED — thiếu credential
> Play (không có trên WIN lẫn node-2) và app đích chưa có listing trên Play.**
> Bản gốc mac gửi: node-2 `/var/lib/flowvpn-coord/inbox/windows/20260927T180020Z-mac-play-tester-9-user-android-vpnflow-compr.md`

## 1. Việc được giao

Đăng ký **toàn bộ user Android** làm tester trên Google Play Console. Mac chốt: app đích =
`com.privatevpn.app` (VPNFlow Android), **WIN chạy bằng credential sẵn có**. Danh sách 9 email lấy từ
`devices.json` + `auth.json` trên node-2.

## 2. BƯỚC 0 — kết quả chạy thật (không suy đoán)

```
PS> node scripts/play-add-testers.mjs check --package com.privatevpn.app
play-add-testers: khong thay credential Play: C:\Users\Minhn\.vpnflow-play\play-admin.json
  (dat PLAY_SERVICE_ACCOUNT_FILE hoac PLAY_SERVICE_ACCOUNT_JSON)
exit=1
```

⇒ **Tiền đề "WIN có credential Play" KHÔNG đúng.** Đã kiểm lại toàn bộ (28/09/2026):

| Chỗ kiểm | Lệnh / cách kiểm | Kết quả |
|---|---|---|
| WIN — env | `Get-ChildItem env:` lọc `PLAY|GOOGLE|ANDROID` | **rỗng** |
| WIN — registry env (User + Machine) | `[Environment]::GetEnvironmentVariable(...,'User'/'Machine')` cho `PLAY_SERVICE_ACCOUNT_FILE/JSON`, `PLAY_PACKAGE_NAME`, `GOOGLE_APPLICATION_CREDENTIALS` | **rỗng cả 4 khoá, cả 2 scope** |
| WIN — file | tìm `play-admin.json`, `*service*account*.json` ở `%USERPROFILE%`, `C:\ProgramData`, `C:\Users\Public`, repo `control-plane\data\` | **không có** |
| WIN — đường mặc định của script | `C:\Users\Minhn\.vpnflow-play\play-admin.json` · `C:\Users\Minhn\.flowvpn-inbox\play-admin.json` | **không tồn tại** |
| node-2 `165.101.114.162` | `find / -xdev -name 'play-admin.json' -o -name '*service*account*.json'` | **không có file nào** (các hit `grep` chỉ là source `play-store.js` + thư viện `google-auth-library`) |

Đối chiếu: `docs/TG-VIBECODE-ANDROID-PLAY-PUBLISH.md` §4 (28/09) **đã** ghi cùng kết luận cho
`T-20260927-01` — WIN không có `play-admin.json` / `*service*account*.json`, node-2 cũng không.

## 3. Chặn thứ hai — app đích chưa có listing trên Play

```
node -e "fetch('https://play.google.com/store/apps/details?id=com.privatevpn.app')"
  → HTTP 404
node -e "fetch('https://play.google.com/store/apps/details?id=com.meetflow.translator')"
  → HTTP 404
```

⇒ Không có trang store công khai. **Không loại trừ** app đã tồn tại trong Play Console ở track kín —
nhưng muốn biết chắc và muốn thêm tester thì **phải có credential** (hoặc vào Console bằng tài khoản
chủ dự án). API `androidpublisher` **không tạo được app** và **không quản được danh sách email thủ công**.

## 4. Phần WIN đã làm được (đã kiểm thật)

| Việc | Kết quả |
|---|---|
| Lấy script từ `origin/main` f4e6434 (`scripts/play-add-testers.mjs`) | ✅ có trong cây làm việc, 172 dòng, không chứa secret |
| Lấy danh sách 9 email từ node-2 `/root/flowvpn-play/vpnflow-android-emails.txt` (SSH bằng khoá) | ✅ 9 email — **không** chép vào repo/bus (PII) |
| `ui-steps --file <9 email>` | ✅ in ra đủ 6 bước dán vào Play Console UI |
| `check --package com.privatevpn.app` | ⛔ dừng ở "không thấy credential" (đúng như thiết kế) — chạy lại được NGAY khi có credential |

## 5. Cần gì để gỡ (chọn 1 — việc của chủ dự án)

**(A) Nhanh nhất (~5 phút, KHÔNG cần agent):** mở Play Console → app → *Test and release → Testing →
Closed/Internal testing → Testers → Create email list* → dán 9 email (`ui-steps` in sẵn) → Save → gán
list cho track → lấy **opt-in URL** gửi khách.
⚠ Kể cả khi có credential, API **vẫn không** thêm được danh sách email thủ công — đường A là đường
duy nhất cho 9 email lẻ.

**(B) Cho agent tự động về sau:** tạo **service account** JSON (Google Cloud → bật
*Google Play Android Developer API* → key JSON) → Play Console → *Users and permissions* → mời email
service account với quyền **Edit app** + **Manage testing tracks** → đặt file vào
`C:\Users\Minhn\.vpnflow-play\play-admin.json` (hoặc đặt biến `PLAY_SERVICE_ACCOUNT_FILE`) rồi báo WIN.
Khi đó WIN chạy lại `check`; nếu muốn API quản tester thì phải gom 9 email vào **1 Google Group** rồi
`node scripts/play-add-testers.mjs group --package com.privatevpn.app --track internal --group <group>`.

**(C) Nếu chủ dự án chốt lại app đích là `com.meetflow.translator` (MeetFlow AI)** thì cần credential
của app đó — app này cũng đang 404 trên Play, xem `docs/TG-VIBECODE-ANDROID-PLAY-PUBLISH.md` §5.

## 6. Đã đọc

`docs/TASK-PROTOCOL.md` · `docs/AGENT-BUS.md` · `docs/TASK-WINDOWS-REWRITE.md` (không liên quan) ·
`docs/TG-VIBECODE-ANDROID-PLAY-PUBLISH.md` · handoff mac gửi ở inbox node-2 · `scripts/play-add-testers.mjs`.
