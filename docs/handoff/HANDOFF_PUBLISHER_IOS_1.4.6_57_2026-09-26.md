# BÀN GIAO PUBLISHER — iOS 1.4.6 (build 57)

- **Từ:** agent chính (Mac) — bên build iOS
- **Đến:** **publisher kênh iOS** (harness Mac; `PUBLISHER_PROCESS.md` §0 luật 12 — Mac phát iOS + macOS)
- **Ngày:** 26/09/2026
- **Trạng thái:** ✅ **SẴN SÀNG PHÁT** — mọi cổng của publisher đã được chạy thử `--dry-run` và **ĐẠT** (xem §4)

---

## 1. Lệnh phát hành (đúng một lệnh — đã chạy thử `--dry-run`, exit 0)

```bash
cd /Volumes/BIWIN/SourcesCode/PrivateVPN
bash scripts/publish-ios.sh build/ios-adhoc-export/ipa/FlowVPN.ipa 1.4.6 57 \
  --device-test build/ios-146-device-test-57.md \
  --allow-rehash \
  --reason "Chủ dự án chốt 26/09/2026: phát build 57 (chặn IPv6 chủ động P2 + F3/F4) cho khách cài mới; test 5G ngay sau khi cài OTA" \
  --notes "Phát iOS 1.4.6/build 57 THAY build 54. NỘI DUNG: P2 chặn IPv6 chủ động (trả ICMPv6 unreachable) + F3 relay cùng node + F4 ngân sách phiên. §2c: CHƯA chạy trước khi phát (devicectl 0 thiết bị) — chủ dự án chốt Đường B, test 5G ngay sau khi cài OTA. Bug high mở: JETSAM-001, ONEWAY-001, FAILOVER-EXHAUSTED-001, 20260823-001."
```

**Không** chạy `--dry-run` khi phát thật. `--no-claim` **không** dùng (script tự claim `release-ios`).

## 2. Artifact

| | |
|---|---|
| File | `build/ios-adhoc-export/ipa/FlowVPN.ipa` |
| Size | **8.210.605 B** |
| sha256 | **`a4fec7077e5ca65a08ff0fdd619d8c6c629814b3d493124dfb9116c8eb442a30`** |
| Version trong file | `1.4.6` build `57` — app **và** appex cùng số |
| Đích | `/root/flowvpn-ipa/VPNFlow-latest.ipa` (node-2, qua node-1) |
| Đang phát hiện tại | iOS **1.4.6 build 54** · sha256 `363fd7a8cfe9027c50a58468880705041f224b031ed8da54ed11b92ff3c61218` |

## 3. ⚠️ Ba điều publisher PHẢI biết trước khi chạy

### 3a. `--allow-rehash` là **bắt buộc** cho lần này — và vì sao
Kênh iOS đang ở `1.4.6` với **HAI** sha256 (build 50 · sha `73b0c145…`, build 54 · sha `363fd7a8…`). Phát build 57 là
**sha256 thứ ba cho cùng version** ⇒ vi phạm `docs/VERSIONING.md §3.3` (artifact bất biến) ⇒ `release-record.mjs`
**sẽ `die`** nếu thiếu cờ. Đây là **ngoại lệ có chủ đích**, chủ dự án đã chốt trong phiên 26/09/2026; lý do được
ghi thẳng vào dòng sổ.

> **Cổng đã được vá để không chết giữa đường.** Trước hôm nay `publish-ios.sh` **không** truyền `--allow-rehash`,
> mà bước ghi sổ (7c) nằm **SAU** bước đã thay file đang phát (4) và PATCH mốc (6) ⇒ chạy đúng lệnh cũ sẽ:
> kênh **đã đổi sang build 57** cho khách, mốc đã PATCH, rồi script **chết** ở 7c với exit 1 và **sổ không có dòng**.
> Đã thêm **bước 1e**: chạy `release-record --dry-run` **trước khi upload**, nên cổng sai sẽ DỪNG khi production
> còn nguyên. Đã chứng minh hai chiều:
> - thiếu `--allow-rehash` ⇒ `⛔ ARTIFACT KHONG BAT BIEN: ios 1.4.6 da co sha256 363fd7a8cfe9…` và **exit 1 ở bước 1e**;
> - có `--allow-rehash --reason "…"` ⇒ in `⚠️ NGOAI LE artifact bat bien` rồi đi hết kế hoạch, **exit 0**.

### 3b. §2c **CHƯA** chạy cho build 57 — đây là ngoại lệ, không phải "đã đạt"
`xcrun devicectl list devices` trả **rỗng** (cả iPhone 14 Pro Max `33987D6F-…` lẫn iPad (A16) `5BA3126D-…`
`unavailable`). **Chủ dự án đã chốt Đường B: phát trước, test 5G ngay sau khi cài OTA** (tiền lệ 1.4.4/21, 1.4.6/54).
Chi tiết + 7 mục: `build/ios-146-device-test-57.md`. **Publisher ghi nguyên văn ngoại lệ này vào `--reason`/§6.**

### 3c. Bug mức `high` còn mở — luật 13
| Bug | Có trong ngoại lệ 26/09 đã ghi sổ? |
|---|---|
| `BUG-IOS-JETSAM-001` | ✅ có |
| `BUG-IOS-ONEWAY-001` | ✅ có |
| `BUG-20260823-001` | ✅ có |
| **`BUG-IOS-FAILOVER-EXHAUSTED-001`** | ❌ **CHƯA từng được cấp ngoại lệ** |

`BUG-IOS-FAILOVER-EXHAUSTED-001` (hết 3 ứng viên đường mà chiều về vẫn chết ⇒ giữ tunnel hỏng ~7 phút, khách không
được báo) vẫn **open** và **chưa sửa** trong build 57. Chốt "phát trước, test OTA sau" của chủ dự án trong phiên
26/09/2026 là chốt **cho cả lần phát này**, nên được ghi vào sổ — nhưng publisher phải ghi **đích danh** bug này,
**không** được để nó lẫn vào ngoại lệ cũ.

## 4. Cổng đã chạy (bằng chứng thật, chạy lại hôm nay)

| Cổng | Kết quả |
|---|---|
| `ios-verify-ipa.sh … --version 1.4.6 --build 57` | ✅ **ĐẠT 8/8** (credential 21+12 · cùng số · `codesign --deep --strict` · Ad Hoc **10 UDID** · `get-task-allow=False` · không nhóm keychain) |
| `check-publish-version.py --platform ios --version 1.4.6 --build 57 --mode pre` | ✅ **ĐẠT** + 1 cảnh báo (phát lại cùng số) |
| `publish-ios.sh … --dry-run` (cổng 1c/1d/1e) | ✅ **exit 0** — đi hết kế hoạch, `evidence=build/ios-146-device-test-57.md` |
| `ios-typecheck.sh` | ✅ extension 0 lỗi · app 0 lỗi · macOS 0 lỗi |
| `ios-pure-logic-tests/run.sh` | ✅ **532/532 PASS**, 0 FAIL |
| `ios-lint-locks.py` | ✅ **ĐẠT** |
| `check-relay-ipv6-exclusion.py` | ✅ **ĐẠT** |

## 5. Việc publisher làm SAU khi phát (đúng process)

1. **Cổng post** (`--mode post`) — script tự chạy ở bước 7b; nếu ĐẠT mới được coi là xong.
2. **Ghi nhật ký `docs/PUBLISHER_PROCESS.md` §6** — một dòng cho 26/09/2026, nêu: IPA·sha256·mốc `latest_ios_version=1.4.6`
   `ipa_build=57`·kết quả tải thật qua `t1`·ngoại lệ artifact bất biến + lý do·**§2c chưa chạy (Đường B)**·
   bug high mở **kể cả `BUG-IOS-FAILOVER-EXHAUSTED-001`**.
3. **KHÔNG tạo tag mới**: `ios-v1.4.6` đang trỏ build 50; tạo lại là tag trùng (đã có luật, xem `publish-ios.sh` bước 8).
4. **TestFlight tách riêng**: build 57 chưa có bản app-store-connect; kênh TestFlight đang chờ build 54. Cần export riêng
   (`publish-ios.sh` **không** làm TestFlight).
5. **Gỡ file cờ `Documents/tunnel-log-on` trên iPhone SAU khi nghiệm thu xong** (đang bật để chum log chi tiết).
   Còn cờ này là tunnel ghi log chi tiết vô ích cho khách.
6. **Email — luật 14, gửi RIÊNG kênh iOS.**

## 6. ⚠️ Về email: **KHÔNG dùng lại `send-ios-1.4.6-announcement.py` nguyên trạng**

Script đó viết cho **build 54**; nội dung đã **sai** với build 57 ở hai chỗ:
- nói *"ngân sách phiên 20 → **35 s**"* — build 57 để **25 s** (`HysteriaDefaults.sessionStartBudget = relayOpenGrace × maxRelayDoorsPerNode + 5` = 10×2+5);
- **không** nói gì về **P2 chặn IPv6 chủ động** — đây lại là nội dung chính của bản này.

Yêu cầu nội dung (3 ngôn ngữ, chỉ nêu thứ **đo được**):
1. **Chặn IPv6 chủ động**: tunnel không còn để gói IPv6 rơi vào khoảng không; trả `ICMPv6 Destination Unreachable`
   để ứng dụng chuyển sang IPv4 ngay (trước đây gói biến mất ⇒ app treo chờ).
2. **Chọn đường cùng node** (F3) và **ngân sách phiên** hợp lý (F4).
3. **Nói thẳng**: gốc rò bộ nhớ (`BUG-IOS-JETSAM-001`) **vẫn CHƯA tìm ra**; bản này là van giảm đau.
4. **Bắt buộc có câu hướng dẫn cài lại**: vì `AppVersionService` so **chuỗi version** (`isVersion(current, lessThan: info.latest_version)`),
   khách đang ở **1.4.6/54 sẽ KHÔNG thấy thông báo "có bản mới"** (cùng số 1.4.6). Cổng pre của publisher cũng đã cảnh báo đúng điều này.
   ⇒ Thư phải nói rõ: *mở lại trang cài đặt `https://t1.meetflowai.site/install/ios` và cài lại*. Việc so theo **build**
   là **F2**, nằm ở Nhịp 2 và **không hồi tố được** cho khách đang ở 54.
5. Chạy `--recipients` (liệt kê) → `--test` → gửi thật; **không** `--all`. Ghi `đã gửi/tổng` vào §6.

## 7. Bàn giao kèm cho COMMITTER (không phải việc của publisher)

- Cây làm việc có **hai session trộn lẫn**. Commit **theo từng đường dẫn cụ thể**, **TUYỆT ĐỐI không `git add -A`**.
- **IPA đóng gói lúc 13:55:56**; sau đó **chỉ** `RelayDiagnostics.swift` đổi (14:31:45 — thuần chẩn đoán, mở rộng
  thư mục soi file cờ). ⇒ **cây hiện tại ≠ mã của build 57** ở đúng một file chẩn đoán. Đừng ghi trong commit là
  "cây này = build 57".
- Đã sửa hôm nay (cần commit): `scripts/publish-ios.sh` (cổng 1e + `--allow-rehash/--reason/--notes/--evidence`,
  trước đây hardcode `release/ios/RELEASE_NOTES_1.4.6.md` — **file này không tồn tại**, dòng sổ sẽ trỏ đường dẫn chết),
  `build/ios-146-device-test-57.md` (mới), `docs/handoff/HANDOFF_PUBLISHER_IOS_1.4.6_57_2026-09-26.md` (mới).
- **Chưa chạy `git add/commit`** cho các file trên — chờ committer.

## 8. Việc còn lại / chưa chắc

1. **§2c 6/7 mục chưa chạy** cho 57 — phải test sau OTA; thất bại thì phải thay/gỡ bản khỏi kênh.
2. `BUG-IOS-FAILOVER-EXHAUSTED-001` **chưa sửa, chưa có ngoại lệ riêng** — cần chủ dự án chốt hành vi (a–d) ở Nhịp sau.
3. **F2** (update gate theo build) chưa làm ⇒ khách 1.4.6/54 không tự thấy bản mới.
4. Nhánh dự phòng `t1.meetflowai.site` **chưa từng chạy trên client**.
5. Ổ đĩa Mac `/System/Volumes/Data` chỉ còn **7,4 GiB** ⇒ **không được build lại** cho tới khi dọn
   (ngưỡng `MIN_FREE_GB=10` của AGENTS §7b; `clean-build-cache.sh` đo theo volume repo nên báo "giải phóng 0GB" —
   nó **không** cứu được volume hệ thống).
