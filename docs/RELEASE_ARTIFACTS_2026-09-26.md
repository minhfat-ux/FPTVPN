# RELEASE ARTIFACTS — 26/09/2026 · loạt **1.4.6**

> Bàn giao từ harness Mac (main agent). Theo `docs/PUBLISHER_PROCESS.md` §1: bảng version/size/sha256 +
> mục **"Việc chưa xong"**. Mọi số phải **đọc TỪ TRONG artifact** (`scripts/check-publish-version.py`),
> không tin tên file / size / nhật ký.

## 1. iOS — **1.4.6 (build 54) ĐÃ PHÁT 26/09/2026** (thay build 50 theo ngoại lệ chủ dự án)

| Trường | Giá trị |
|---|---|
| File đã phát | `/root/flowvpn-ipa/VPNFlow-latest.ipa` · `GET /v1/downloads/ios` |
| Size / sha256 | **8.207.840 B** · **`363fd7a8cfe9027c50a58468880705041f224b031ed8da54ed11b92ff3c61218`** |
| Version / build | **1.4.6 / 54** (app + appex cùng số) — `project.yml` `CURRENT_PROJECT_VERSION "54"` |
| Bằng chứng §2c | `build/ios-146-device-test-54.md` (mục 1/2/4/6/7 ĐẠT · **mục 3 một phần** · **mục 5 chưa test lại**) |
| Mốc | `latest_version=1.4.6` + `ipa_build=54` (đã PATCH + verify qua t1) |
| Backup bản cũ | `/root/flowvpn-ipa/VPNFlow-latest.bak-1.4.6-b50-*.ipa` |
| Cổng | `ios-verify-ipa.sh --version 1.4.6 --build 54` **ĐẠT** · `check-publish-version` pre **ĐẠT** · upload nguyên tử verify sha256/size trên server **khớp** · tải thật qua t1 **khớp sha** · post **ĐẠT** · `/install/ios` 200 · `/buy` 200 |
| Ngoại lệ | cùng số version nhưng khác sha256 so với bản 50 ⇒ ghi sổ bằng `release-record.mjs append --allow-rehash --reason "…"`; dòng 50 **giữ nguyên** trong `release/releases.jsonl`; tag `ios-v1.4.6` |

### 1b. Bản 50 (lịch sử — đã bị 54 thay trong cùng ngày)

| Trường | Giá trị |
|---|---|
| Size / sha256 | 8.197.184 B · `73b0c145aac2059f4e582865476836c5641b9f82fd492f0edfb2da74a7146a78` (đo lại độc lập 26/09) |
| Bằng chứng §2c | `build/ios-146-device-test-50.md` |
| Ghi chú | **KHÔNG** phát lại 1.4.5 với hash khác (VERSIONING §3.3) — số kế tiếp buộc phải là 1.4.6; bản 54 là ngoại lệ **có ghi sổ** cho cùng 1.4.6 |

## 2. macOS — 1.4.6 (build 21) · **ĐÃ PHÁT 26/09/2026**

| Trường | Giá trị |
|---|---|
| File | `~/.vpnflow-macrelease/VPNFlow-mac-1.4.6-21.dmg` → `/root/flowvpn-mac/VPNFlow-mac.dmg` |
| Size / sha256 | **21.914.425 B** · **`c95b4fab00f9fe01f110d73f3000efd4bcd62cc226f021776c054b0daeebb87e`** |
| Version / build | **1.4.6 / 21** (đọc trong DMG: `spctl accepted · source=Notarized Developer ID`) |
| Ký | Developer ID + notarize **Accepted** (`delivery c40a5642-…`) + **staple + validate OK** |
| Cổng | `check-publish-version --platform macos` pre **ĐẠT** · tải thật qua t1 **khớp sha256** · post **ĐẠT** |
| Mốc | `latest_mac_version=1.4.6` rồi `minimum_mac_version=1.4.6` (API macOS trả `minimum=1.4.6 · latest=1.4.6`) |
| Backup bản cũ | `/root/flowvpn-mac/VPNFlow-mac.bak-1.4.0-b14-20260926-024812.dmg` (21.458.057 B) |
| Email | `send-mac-announcement.py 1.4.6 --all` → **21/21 thành công, 0 lỗi** |
| Bằng chứng Dev | bản **dev-signed cùng cây mã nguồn**, 3 ca ở `docs/handoff/HANDOFF_PUBLISHER_MACOS_1.4.6_2026-09-26.md` §6 — **chốt "đường B"**, ghi tại `PUBLISHER_PROCESS.md` §6 dòng 26/09 |
| **Còn phải làm (đường B)** | cài DMG tải từ `t1` lên Mac chủ dự án → chạy 3 ca (A7/Tencent · bộ nhớ · failover) → ghi kết quả vào §6 |

## 3. Việc CHƯA XONG — publisher **KHÔNG** được quảng cáo mấy mục này
- **Gốc rò bộ nhớ extension CHƯA tìm ra** (van 40 MB + tự hạ tunnel sạch là **giảm đau có kiểm soát**, không phải chữa khỏi).
- `BUG-IOS-ONEWAY-001` (high, open) — đã có bản vá tự đổi node; **phát hiện thêm** `BUG-IOS-FAILOVER-EXHAUSTED-001` (high, open): hết trần 3 lần đổi đường mà đường vẫn chết ⇒ app GIỮ tunnel hỏng ~7 phút rồi mới tự gỡ (chờ chủ dự án chốt hành vi).
- `BUG-20260823-001` (high, open) — phía server: `/v1/tokens` mở khi `LEGACY_MODE=1`.
- **§2c build 54**: mục 3 (luồng cơ bản ≥10 phút) mới có phiên 63 s; mục 5 (ngắt VPN không mất mạng) chưa test lại — **test ngay sau khi khách cài OTA** theo chốt "đường B".
- **Log chi tiết của tunnel mặc định TẮT từ build 53** ⇒ muốn chấm cổng nghiệm thu phải bật `Documents/tunnel-log-on` (đã bật trên iPad + iPhone 26/09 03:35).
- **Email thông báo riêng cho khách iOS chưa gửi** (email 26/09 vừa rồi là bản macOS, gửi cho toàn bộ khách) — chờ chủ dự án chốt nội dung/format.
- `docs/routes/tencent-meeting.txt` **chưa** deploy lên `https://meetflowai.site/dl/routes/` (404 hiện không chặn).
- `extension-identity.log` chưa có giới hạn dung lượng (ghi 1 dòng/2 s, ~8 MB).
- **TestFlight**: build **54** đã upload (`UPLOAD SUCCEEDED`, delivery `d8faabea-6dd3-473b-a3a8-75f5738a75dc`), What-to-Test 3 ngôn ngữ ở `release/ios/whatsnew-1.4.6.json`; trạng thái Beta App Review ghi ở `PUBLISHER_PROCESS.md` §6.

## 4. Cổng đã chạy trên máy build/publisher (bằng chứng)
- `bash scripts/ios-typecheck.sh` → extension 0 lỗi · app 0 lỗi; `bash scripts/ios-pure-logic-tests/run.sh` → **505/505 PASS**; `python3 scripts/ios-lint-locks.py` → **ĐẠT**; `python3 scripts/check-relay-ipv6-exclusion.py` → **ĐẠT**.
- `scripts/ios-verify-ipa.sh --version 1.4.6 --build 54` → **ĐẠT** (credential 21+12 · ad-hoc 10 UDID · `get-task-allow=False`).
- `scripts/mac-sign-notarize.sh` (APFS + `xattr -cr` + cổng sớm 6b) → notarize **Accepted** + staple OK + `spctl source=Notarized Developer ID`.
- `scripts/check-publish-version.py` iOS + macOS, cả `pre` và `post` → **ĐẠT** (sau khi set mốc).

