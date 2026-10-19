# BÀN GIAO PUBLISHER — phát **Android 1.4.5 (build 37)** lên kênh khách

- **Từ:** harness Windows (bên build Android) · **Cho:** **publisher Android** (harness Windows, theo
  `docs/PUBLISHER_PROCESS.md` §0 luật 12: Windows harness phát Windows + Android)
- **Ngày:** 19/10/2026 · **Commit build:** `26e261a` (đã push `origin/main`; `git log --oneline -1` phải ra đúng commit này)
- **Trạng thái:** artifact đã build + test + nghiệm thu máy thật ⇒ **chờ publish**
- **Nội dung bản này:** **N tunnel (hút băng thông)** — port từ iOS `167ba9d`, cổng `android-ntunnel`
  đã `release --status done`

## 1. Artifact (đo từ file thật, không lấy từ docs)

| Kênh | Tên file nguồn (máy build) | package | versionCode / versionName | size (B) | sha256 |
|---|---|---|---|---|---|
| Android (modern) | `~/.vpnflow-build/app/outputs/apk/modern/release/app-modern-release.apk` | `com.privatevpn.app` | 37 / 1.4.5 | 79.106.244 | `C195EB6A99D058F89DB0973A20ECC1469899C3D81ADB8858185C61EB81C1D663` |
| Android legacy | `~/.vpnflow-build/app/outputs/apk/legacy/release/app-legacy-release.apk` | `com.privatevpn.app` | 37 / 1.4.5 | 79.122.645 | `098902DEDAE154511504F70167B02BEC9D123B5E4B4B10D805DA42AF2DCE9B55` |
| Android TV (KHÔNG thuộc kênh này) | `…/tv/release/app-tv-release.apk` | `com.privatevpn.app.tv` | 37 / 1.4.5-tv | 79.106.409 | `265D46B49AD3E9381A2DCA95C3A39ABDA5FC930ACEC99B26070D472BB980B2C2` |

Cả hai bản release **đã ký keystore phát hành**: `CN=Minh Nguyen Binh, OU=VPNFlow, O=VPNFlow,
L=Hanoi, ST=Hanoi, C=VN` (`SHA-256 dc6e484bf8ef2eea0dcd15a9192d8233fea1a05068b8ee4486cdc53f456b5e46`).
`minSdk`: modern **26**, legacy **24**. `versionCode 37 > 32` (bản đang phát) ⇒ đơn điệu, đúng `docs/VERSIONING.md`.

> ⚠️ **Đừng phát bản `-dev`** (`app-*-debug.apk`, package `.dev`) và **đừng** phát bản TV vào kênh
> modern/legacy. Kênh TV chưa có route riêng — nếu chủ dự án muốn phát TV, phải tạo route/kênh trước
> (hiện chỉ có `…/dl/test/VPNFlow-tv-v37.apk` để test).

## 2. Cổng chặn — chạy TRƯỚC khi upload (exit 1 = DỪNG)

```bash
python3 scripts/check-publish-version.py --platform android        --file <modern-release.apk> --version 1.4.5 --build 37
python3 scripts/check-publish-version.py --platform android-legacy --file <legacy-release.apk> --version 1.4.5 --build 37
# exit 0 = ĐẠT · 1 = KHÔNG ĐẠT (dừng) · 2 = không kiểm được (chạy trên máy có Android SDK)
```
- **release-lock:** `.privatevpn/status/release-lock.json` hiện chỉ khoá **iOS 1.4.7/80** ⇒ Android
  **không** cần `--allow-locked`. Nếu thấy khoá Android xuất hiện ⇒ dừng, hỏi chủ dự án.
- Commit phải là `26e261a` và **không** có commit sau nó đụng `android/**` chưa verify
  (`git log --oneline 26e261a..HEAD -- android/` phải rỗng).

## 3. Publish (node-2 = relay-server)

```bash
ssh -i ~/.ssh/fpt_vpn_node root@165.101.114.162
# 1) SAO LƯU bản đang phát (giữ nguyên mẫu .backup-<ngày-giờ> như các lần trước)
cd /root/flowvpn-apk
cp -p VPNFlow-latest.apk   VPNFlow-latest.apk.backup-$(date +%Y%m%d-%H%M%S)
cp -p VPNFlow-android7.apk VPNFlow-android7.apk.backup-$(date +%Y%m%d-%H%M%S)
# 2) đặt bản mới (đúng TÊN — route đọc đúng 2 tên này)
scp <modern-release.apk> root@165.101.114.162:/root/flowvpn-apk/VPNFlow-latest.apk
scp <legacy-release.apk> root@165.101.114.162:/root/flowvpn-apk/VPNFlow-android7.apk
chmod 644 VPNFlow-latest.apk VPNFlow-android7.apk
sha256sum VPNFlow-latest.apk VPNFlow-android7.apk   # phải khớp bảng §1
```
Kênh tương ứng (`docs/PUBLISHER_PROCESS.md` §3): `GET /v1/downloads/android` → `VPNFlow-latest.apk`;
`GET /v1/downloads/android-legacy` → `VPNFlow-android7.apk`.

**Mốc phiên bản** (app đọc để hiện "có bản mới"):
```bash
curl -s -X PATCH https://api.meetflowai.site/v1/admin/android-version \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"latest_version":"1.4.5"}'
```
- **KHÔNG** nâng `min_app_version` lên 1.4.5 trừ khi chủ dự án đồng ý (nâng = ép mọi khách cũ phải cập nhật).

## 4. Kiểm sau khi phát (bắt buộc, dán output vào báo cáo)

```bash
# (a) cổng post: đo lại trên artifact ĐANG PHÁT
python3 scripts/check-publish-version.py --platform android        --mode post --version 1.4.5 --build 37
python3 scripts/check-publish-version.py --platform android-legacy --mode post --version 1.4.5 --build 37
# (b) HTTP thật
curl -sI https://api.meetflowai.site/v1/downloads/android        | grep -Ei 'HTTP/|content-length|last-modified'
curl -sI https://api.meetflowai.site/v1/downloads/android-legacy | grep -Ei 'HTTP/|content-length|last-modified'
curl -s  'https://api.meetflowai.site/v1/app-version?platform=android'
curl -s  'https://api.meetflowai.site/v1/app-version?platform=android-legacy'
```
Mong đợi: `200` + `content-length` khớp §1; payload trả `latest_version = 1.4.5` cho cả hai kênh
(đây là bug cũ `BUG-APPVERSION-PLATFORM-001`, đã resolved — vẫn phải kiểm).

## 5. Ghi sổ + tag (bắt buộc, repo là nguồn sự thật)

1. **`release/releases.jsonl`** — thêm 1 row publish cho mỗi kênh (theo mẫu row `1.4.4/32` sẵn có):
   `platform` = `android` / `android-legacy`; `version` = `1.4.5`; `build` = `37`;
   `channel` = `/v1/downloads/android` / `/v1/downloads/android-legacy`;
   `artifact` = `/root/flowvpn-apk/VPNFlow-latest.apk` / `VPNFlow-android7.apk`;
   `size` + `sha256` **đo từ file trên node-2 sau khi copy** (không chép từ bảng này);
   `commit` = `26e261a`; `recorded_by` = bên phát.
2. **Tag annotated** trỏ **commit build** (không phải commit publish):
   `android-v1.4.5` và `android-legacy-v1.4.5` trên `26e261a`, body gồm `sha256` + `size` + ngày + người verify.
3. Commit + push phần sổ/tag. Release notes: `docs/RELEASE_NOTES_android_1.4.5.md` (đã có sẵn trong
   commit này — chỉ cần tham chiếu, không sửa).

## 6. Email thông báo khách

Theo `docs/PUBLISHER_PROCESS.md` §0 luật 12: **Windows harness KHÔNG tự gửi email khách** — email do
publisher phía Mac gửi. Việc cần làm: nhắn Mac publisher (Telegram) kèm nội dung bản này +
`docs/RELEASE_NOTES_android_1.4.5.md`, nhờ gửi email (script `scripts/send-release-announcement.py`
đã có sẵn cho iOS+Android 3 ngôn ngữ). Nếu chủ dự án cho phép bên Android tự gửi thì ghi rõ lý do vào
`release/releases.jsonl` row + báo lại.

## 7. Rollback (nếu phát hiện lỗi sau khi phát)

```bash
cd /root/flowvpn-apk
cp -p VPNFlow-latest.apk.backup-<mốc>   VPNFlow-latest.apk
cp -p VPNFlow-android7.apk.backup-<mốc> VPNFlow-android7.apk
# trả mốc
curl -s -X PATCH https://api.meetflowai.site/v1/admin/android-version \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"latest_version":"1.4.4"}'
```
Rồi ghi 1 row `origin=rollback` vào `release/releases.jsonl` kèm lý do.

## 8. Bằng chứng chất lượng của bản này (để trích vào báo cáo phát hành)

- Unit test: **64/64 × 3 flavor** (modern/legacy/tv), **0 fail**; gồm 7 test mới `MultiTunnelPolicyTest`.
- Nghiệm thu máy thật (SM-F9460, Android 16): N=4 mở **4 cầu WS**, `tunnel: UP (ws-n4)`,
  `n-tunnel: 4/4 tunnel sẵn sàng (up=8324 down=27752 kbps, đã ×4)`; N=1 đi đúng đường cũ.
- Chi tiết + log thô: `docs/handoff/HANDOFF_ANDROID_NTUNNEL_WINDOWS_2026-10-19.md`.

## 9. Việc CẦN CHỦ DỰ ÁN QUYẾT trước khi phát

1. Có phát **bản TV** khác kênh không (cần tạo route/kênh riêng — hiện chưa có).
2. Có nâng `min_app_version` không (mặc định: **không**).
3. Ai gửi email khách (§6).
