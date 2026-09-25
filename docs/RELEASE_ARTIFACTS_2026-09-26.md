# RELEASE ARTIFACTS — 26/09/2026 · loạt **1.4.6**

> Bàn giao từ harness Mac (main agent). Theo `docs/PUBLISHER_PROCESS.md` §1: bảng version/size/sha256 +
> mục **"Việc chưa xong"**. Mọi số phải **đọc TỪ TRONG artifact** (`scripts/check-publish-version.py`),
> không tin tên file / size / nhật ký.

## 1. iOS — 1.4.6 (build 50) · **thuộc session Mac khác** (claim `release-ios`, note `publish-ios-1.4.6-50`)

| Trường | Giá trị |
|---|---|
| File | `build/ios-adhoc-export/ipa/FlowVPN.ipa` |
| Size | **8.197.184 B** |
| sha256 | **`73b0c145aac2059f4e582865476836c5641b9f82fd492f0edfb2da74a7146a78`** — **đo lại độc lập 26/09** (`shasum -a 256`), khớp bằng chứng §2c của session kia |
| mtime | `2026-09-26 00:23:05` (+07) |
| Version / build | **1.4.6 / 50** (app + appex cùng số) — `project.yml` `MARKETING_VERSION 1.4.6` · `CURRENT_PROJECT_VERSION "50"` |
| Bằng chứng §2c | `build/ios-146-device-test-50.md` (7 mục; mục 4–5 ghi *"test sau khi cài OTA"* theo chốt chủ dự án) |
| Đích | `/root/flowvpn-ipa/VPNFlow-latest.ipa` — `GET /v1/downloads/ios` |
| Mốc | `latest_version=1.4.6` + `ipa_build=50`, sau đó `minimum_version=1.4.6` |
| **Bản đang phát** | **1.4.5 / 44** · **8.197.165 B** · mtime 25/09 16:17:55 GMT · sha `7eae9f1472e4…` (sổ `release/releases.jsonl`, tag `ios-v1.4.5`) |
| Ghi chú | **KHÔNG** phát lại 1.4.5 với hash khác (VERSIONING §3.3) — số kế tiếp buộc phải là 1.4.6 |

## 2. macOS — 1.4.6 (build 21)

| Trường | Giá trị |
|---|---|
| File | `~/.vpnflow-macrelease/VPNFlow-mac-1.4.6-21.dmg` |
| Size / sha256 | **CHƯA CÓ — điền sau bước build + `scripts/mac-sign-notarize.sh … --dmg`** |
| Version / build | **1.4.6 / 21** — đọc từ `VPNFlow.app/Contents/Info.plist` **bên trong DMG** |
| Ký | Developer ID + notarize + **staple app & DMG**; cổng §0 luật 5 = `stapler validate` + `spctl` + `codesign --verify --deep --strict` |
| Đích | `/root/flowvpn-mac/VPNFlow-mac.dmg` — `GET /v1/downloads/mac` |
| Mốc | `latest_mac_version=1.4.6`, sau đó `minimum_mac_version=1.4.6` |
| Bằng chứng Dev | bản **dev-signed cùng cây mã nguồn**, 3 ca ở `docs/handoff/HANDOFF_PUBLISHER_MACOS_1.4.6_2026-09-26.md` §6 — **chốt "đường B"** (phát trước, test ngay sau OTA), ghi tại `PUBLISHER_PROCESS.md` §6 dòng 26/09 |
| **Bản đang phát** | **1.4.0 / 14** · **21.458.057 B** · mtime 22/09 04:56:02 GMT |

## 3. Việc CHƯA XONG — publisher **KHÔNG** được quảng cáo mấy mục này
- **Gốc rò bộ nhớ extension CHƯA tìm ra** (van 40 MB + tự hạ tunnel sạch là **giảm đau có kiểm soát**, không phải chữa khỏi).
- `BUG-IOS-ONEWAY-001` (mức `high`, `open`) — đã có bản vá tự đổi node khi node chở ≈0, chưa đóng bug.
- `BUG-20260823-001` (mức `high`, `open`) — phía server: `/v1/tokens` mở khi `LEGACY_MODE=1`.
- `docs/routes/tencent-meeting.txt` **chưa** deploy lên `https://meetflowai.site/dl/routes/` (file trong bundle là nguồn chính; 404 hiện không chặn).
- `extension-identity.log` chưa có giới hạn dung lượng (ghi 1 dòng/2 s, ~8 MB).
- **TestFlight** cho loạt iOS này: chưa nộp (xem `PUBLISHER_PROCESS.md` §7 mục 7).

## 4. Cổng đã chạy trên máy build (bằng chứng)
- `bash scripts/ios-pure-logic-tests/run.sh` → **453/453 PASS** · `python3 scripts/ios-lint-locks.py` → **ĐẠT**.
- `scripts/ios-verify-ipa.sh --version 1.4.6 --build 50` → **ĐẠT** (theo `build/ios-146-device-test-50.md` §1).
- `scripts/mac-sign-notarize.sh`: `bash -n` → OK · smoke test `hdiutil create -fs APFS` → DMG **17.077 B**, `xattr -lr` app trong DMG **trống (sạch)** — 26/09.
